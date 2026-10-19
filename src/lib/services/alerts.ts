import "server-only";
import { z } from "zod";
import type { Alert, AlertEvent } from "@/lib/domain/types";
import { decide, describeCondition, evaluateCondition, sampleMessage, type ConditionResult } from "@/lib/domain/alert-eval";
import { shiftDate } from "@/lib/domain/dates";
import { getStore, nextId } from "@/lib/server/store";
import { assertProjectAccess, assertScope, audit, parseInput, ServiceError, SYSTEM_ACTOR, type Actor } from "./context";
import { getWarehouse, queryMetric, totalOf } from "./query";

export function listAlerts(actor: Actor, projectId: string) {
  assertProjectAccess(actor, projectId);
  return getStore().alerts.filter((a) => a.projectId === projectId);
}

export function getAlert(actor: Actor, id: string) {
  const a = getStore().alerts.find((x) => x.id === id);
  if (!a) throw new ServiceError("not_found", "Alert not found");
  assertProjectAccess(actor, a.projectId);
  return a;
}

const conditionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("threshold"), operator: z.enum(["gt", "lt", "gte", "lte"]), value: z.number().finite() }),
  z.object({ kind: z.literal("relative_change"), direction: z.enum(["increase", "decrease", "either"]), pct: z.number().min(1, "Use at least 1%").max(1000), comparedTo: z.enum(["previous_period", "same_day_last_week"]) }),
  z.object({ kind: z.literal("missing_data"), expectedRowsAtLeast: z.number().int().min(1) }),
  z.object({ kind: z.literal("freshness_sla"), maxAgeHours: z.number().min(1).max(168) }),
  z.object({ kind: z.literal("pipeline_failure"), target: z.enum(["dbt_run", "dbt_test", "connection_sync"]) }),
]);

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const alertSchema = z
  .object({
    projectId: z.string().min(1),
    name: z.string().trim().min(3, "Name is required").max(80),
    metricKey: z.string().optional(),
    condition: conditionSchema,
    cadence: z.enum(["hourly", "daily", "weekly"]),
    lookbackDays: z.number().int().min(1).max(90),
    channel: z.enum(["email", "slack", "webhook"]),
    recipients: z.array(z.string().trim()).min(1, "Add at least one recipient").max(10),
    severity: z.enum(["info", "warning", "critical"]),
    cooldownMinutes: z.number().int().min(0).max(10080),
    consecutiveEvaluations: z.number().int().min(1).max(10),
  })
  .superRefine((v, ctx) => {
    const needsMetric = v.condition.kind === "threshold" || v.condition.kind === "relative_change" || v.condition.kind === "missing_data";
    if (needsMetric && !v.metricKey) ctx.addIssue({ code: "custom", path: ["metricKey"], message: "Choose a metric" });
    for (const r of v.recipients) {
      const ok = v.channel === "email" ? emailRe.test(r) : v.channel === "slack" ? /^#[a-z0-9_-]{1,80}$/.test(r) : /^https:\/\/[^\s]+$/.test(r);
      if (!ok) {
        ctx.addIssue({ code: "custom", path: ["recipients"], message: v.channel === "email" ? `"${r}" is not a valid email` : v.channel === "slack" ? `Slack channels look like #channel-name` : "Webhooks must be https:// URLs" });
        break;
      }
    }
  });

/** Evaluate an alert definition against current data, without side effects. */
export async function evaluate(actor: Actor, def: Pick<Alert, "projectId" | "metricKey" | "condition" | "lookbackDays" | "consecutiveEvaluations">) {
  const s = getStore();
  const wh = getWarehouse();
  const coverage = wh.coverage(def.projectId);
  const metric = def.metricKey ? s.metrics.find((m) => m.projectId === def.projectId && m.key === def.metricKey) : undefined;
  const windows = Math.max(1, def.consecutiveEvaluations);
  const results: ConditionResult[] = [];

  for (let w = windows - 1; w >= 0; w--) {
    const c = def.condition;
    if (c.kind === "freshness_sla") {
      const loaded = coverage ? Date.parse(coverage.loadedAt) : NaN;
      results.push(evaluateCondition(c, { freshnessHours: Number.isNaN(loaded) ? undefined : (Date.now() - loaded) / 3_600_000 }));
      continue;
    }
    if (c.kind === "pipeline_failure") {
      const failed =
        c.target === "connection_sync"
          ? s.connections.some((x) => x.projectId === def.projectId && x.syncHistory[0]?.status === "error")
          : c.target === "dbt_test"
            ? (s.dbt[def.projectId]?.models ?? []).some((m) => m.tests.some((t) => t.status === "fail"))
            : s.dbt[def.projectId]?.runs[0]?.status === "error";
      results.push(evaluateCondition(c, { pipelineFailed: failed }));
      continue;
    }
    if (!coverage || !metric) {
      results.push({ breach: c.kind === "missing_data", value: null, summary: "No data available", insufficientData: true });
      continue;
    }
    const end = shiftDate(coverage.end, -w);
    const start = shiftDate(end, -(def.lookbackDays - 1));
    const q = (a: string, b: string) => queryMetric({ projectId: def.projectId, metricKey: metric.key, start: a, end: b, grain: "day" }, { actor, source: "alert" });
    const cur = await q(start, end);
    if (c.kind === "missing_data") {
      results.push(evaluateCondition(c, { rowCount: cur.rows.filter((r) => r.value > 0).length }));
    } else if (c.kind === "threshold") {
      results.push(evaluateCondition(c, { current: totalOf(cur, metric.aggregation), unit: metric.unit }));
    } else {
      const offset = c.comparedTo === "same_day_last_week" ? 7 : def.lookbackDays;
      const base = await q(shiftDate(start, -offset), shiftDate(end, -offset));
      results.push(evaluateCondition(c, { current: totalOf(cur, metric.aggregation), baseline: totalOf(base, metric.aggregation), unit: metric.unit }));
    }
  }
  return { latest: results[results.length - 1], breaches: results.map((r) => r.breach), metric };
}

export async function previewAlert(actor: Actor, input: unknown) {
  const data = parseInput(alertSchema, input);
  assertProjectAccess(actor, data.projectId);
  const s = getStore();
  const project = s.projects.find((p) => p.id === data.projectId)!;
  const ev = await evaluate(actor, { ...data, metricKey: data.metricKey });
  const decision = decide({ status: "active", cooldownMinutes: data.cooldownMinutes, consecutiveEvaluations: data.consecutiveEvaluations }, ev.breaches, new Date());
  return {
    logic: describeCondition(data as Alert, ev.metric?.name, ev.metric?.unit),
    latest: ev.latest,
    breaches: ev.breaches,
    wouldFire: decision === "fire",
    decision,
    message: sampleMessage({ name: data.name, severity: data.severity, channel: data.channel }, project.name, ev.latest, `http://localhost:3000/alerts`),
  };
}

export function createAlert(actor: Actor, input: unknown, opts: { draft?: boolean; via?: Alert["createdVia"] } = {}): Alert {
  assertScope(actor, "draft");
  const data = parseInput(alertSchema, input);
  assertProjectAccess(actor, data.projectId);
  const s = getStore();
  if (data.metricKey && !s.metrics.some((m) => m.projectId === data.projectId && m.key === data.metricKey && m.status === "approved")) {
    throw new ServiceError("invalid_input", "Choose an approved metric", [{ path: "metricKey", message: "Choose an approved metric" }]);
  }
  const type = data.condition.kind;
  const alert: Alert = {
    id: nextId("al"),
    ...data,
    type,
    status: opts.draft ? "paused" : "active",
    history: [],
    createdAt: new Date().toISOString(),
    createdVia: opts.via ?? "ui",
    draft: !!opts.draft,
  };
  s.alerts.unshift(alert);
  audit(actor, opts.draft ? "alert.draft_created" : "alert.created", { projectId: alert.projectId, target: alert.name, detail: opts.via === "mcp" ? "via MCP (paused draft)" : undefined });
  return alert;
}

/** Runs one evaluation now and records the (simulated) outcome. */
export async function runEvaluation(actor: Actor, id: string) {
  const a = getAlert(actor, id);
  const ev = await evaluate(SYSTEM_ACTOR, a);
  const now = new Date();
  const decision = decide(a, ev.breaches, now);
  const project = getStore().projects.find((p) => p.id === a.projectId)!;
  a.lastEvaluatedAt = now.toISOString();
  const event: AlertEvent = {
    id: nextId("ev"),
    at: now.toISOString(),
    state: decision === "fire" ? "fired" : decision.startsWith("suppressed") ? "suppressed" : "ok",
    value: ev.latest.value ?? undefined,
    message:
      decision === "fire"
        ? sampleMessage(a, project.name, ev.latest, "http://localhost:3000/alerts")
        : decision === "pending"
          ? `${ev.latest.summary} — breach not yet sustained for ${a.consecutiveEvaluations} evaluations.`
          : decision === "suppressed_cooldown"
            ? `${ev.latest.summary} — suppressed by cooldown.`
            : decision === "suppressed_snoozed"
              ? `${ev.latest.summary} — suppressed while snoozed.`
              : decision === "paused"
                ? "Alert is paused; evaluated manually."
                : ev.latest.summary,
    delivery: decision === "fire" ? "simulated" : "not_sent",
  };
  if (decision === "fire") a.lastTriggeredAt = event.at;
  a.history.unshift(event);
  audit(actor, "alert.evaluated", { projectId: a.projectId, target: a.name, detail: `${decision} (simulated)` });
  return { alert: a, event, decision };
}

export function acknowledgeEvent(actor: Actor, alertId: string, eventId: string) {
  const a = getAlert(actor, alertId);
  const e = a.history.find((x) => x.id === eventId);
  if (!e) throw new ServiceError("not_found", "Event not found");
  e.acknowledgedBy = actor.name;
  audit(actor, "alert.acknowledged", { projectId: a.projectId, target: a.name });
  return a;
}

export function snoozeAlert(actor: Actor, id: string, hours: number) {
  const h = parseInput(z.number().int().min(1).max(168), hours);
  const a = getAlert(actor, id);
  a.snoozedUntil = new Date(Date.now() + h * 3_600_000).toISOString();
  audit(actor, "alert.snoozed", { projectId: a.projectId, target: a.name, detail: `${h}h` });
  return a;
}

export function setAlertStatus(actor: Actor, id: string, status: "active" | "paused") {
  const a = getAlert(actor, id);
  a.status = status;
  if (status === "active") {
    a.draft = false;
    a.snoozedUntil = undefined;
  }
  audit(actor, status === "active" ? "alert.resumed" : "alert.paused", { projectId: a.projectId, target: a.name });
  return a;
}

export function deleteAlert(actor: Actor, id: string) {
  const a = getAlert(actor, id);
  const s = getStore();
  s.alerts = s.alerts.filter((x) => x.id !== id);
  audit(actor, "alert.deleted", { projectId: a.projectId, target: a.name });
}
