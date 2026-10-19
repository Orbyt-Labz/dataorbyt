import "server-only";
import { z } from "zod";
import type { Experiment } from "@/lib/domain/types";
import { analyzeExperiment } from "@/lib/domain/stats";
import { getStore, nextId } from "@/lib/server/store";
import { assertProjectAccess, assertScope, audit, parseInput, ServiceError, type Actor } from "./context";

export function listExperiments(actor: Actor, projectId: string): Experiment[] {
  assertProjectAccess(actor, projectId);
  return getStore().experiments.filter((e) => e.projectId === projectId);
}

export function getExperiment(actor: Actor, id: string) {
  const e = getStore().experiments.find((x) => x.id === id);
  if (!e) throw new ServiceError("not_found", "Experiment not found");
  assertProjectAccess(actor, e.projectId);
  return { experiment: e, analysis: analyzeExperiment(e) };
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export const experimentSchema = z
  .object({
    projectId: z.string().min(1),
    name: z.string().trim().min(3, "Name is required").max(80),
    key: z.string().trim().regex(/^[a-z][a-z0-9_]{2,48}$/, "Use lower_snake_case (3–49 chars)"),
    hypothesis: z.string().trim().min(20, "State the expected change and why (20+ characters)").max(600),
    population: z.string().trim().min(3, "Describe the target population").max(200),
    randomizationUnit: z.enum(["user", "account", "session", "device"]),
    variants: z
      .array(z.object({ key: z.string().trim().regex(/^[a-z][a-z0-9_]{0,30}$/, "Variant keys: lower_snake_case"), name: z.string().trim().min(1, "Variant name required").max(60), allocation: z.number().int().min(1).max(99), isControl: z.boolean() }))
      .min(2, "Add a control and at least one treatment")
      .max(4),
    startDate: isoDate,
    endDate: isoDate,
    primaryMetric: z.string().min(1, "Choose a primary metric"),
    guardrailMetrics: z.array(z.string()).max(5).default([]),
    minimumDetectableEffectPct: z.number().min(0.5).max(200).optional(),
    targetSampleSizePerVariant: z.number().int().min(50).max(10_000_000).optional(),
  })
  .superRefine((v, ctx) => {
    const total = v.variants.reduce((a, x) => a + x.allocation, 0);
    if (total !== 100) ctx.addIssue({ code: "custom", path: ["variants"], message: `Allocations must sum to 100% (currently ${total}%)` });
    if (v.variants.filter((x) => x.isControl).length !== 1) ctx.addIssue({ code: "custom", path: ["variants"], message: "Exactly one variant must be the control" });
    if (new Set(v.variants.map((x) => x.key)).size !== v.variants.length) ctx.addIssue({ code: "custom", path: ["variants"], message: "Variant keys must be unique" });
    if (v.endDate <= v.startDate) ctx.addIssue({ code: "custom", path: ["endDate"], message: "End date must be after start date" });
    if (v.guardrailMetrics.includes(v.primaryMetric)) ctx.addIssue({ code: "custom", path: ["guardrailMetrics"], message: "Guardrails must differ from the primary metric" });
    if (!v.minimumDetectableEffectPct && !v.targetSampleSizePerVariant)
      ctx.addIssue({ code: "custom", path: ["targetSampleSizePerVariant"], message: "Set a minimum detectable effect or a target sample size" });
  });

export function createExperimentDraft(actor: Actor, input: unknown, via: Experiment["createdVia"] = "ui"): Experiment {
  assertScope(actor, "draft");
  const data = parseInput(experimentSchema, input);
  assertProjectAccess(actor, data.projectId);
  const s = getStore();
  const metricKeys = new Set(s.metrics.filter((m) => m.projectId === data.projectId && m.status === "approved").map((m) => m.key));
  for (const k of [data.primaryMetric, ...data.guardrailMetrics]) {
    if (!metricKeys.has(k)) throw new ServiceError("invalid_input", `Metric "${k}" is not an approved metric in this project`, [{ path: k === data.primaryMetric ? "primaryMetric" : "guardrailMetrics", message: `"${k}" is not an approved metric` }]);
  }
  if (s.experiments.some((e) => e.projectId === data.projectId && e.key === data.key)) {
    throw new ServiceError("invalid_input", "Experiment key already in use", [{ path: "key", message: "Experiment key already in use" }]);
  }
  const exp: Experiment = {
    id: nextId("exp"),
    ...data,
    status: "draft",
    owner: actor.name,
    observations: [],
    guardrails: [],
    relatedDashboardIds: [],
    createdAt: new Date().toISOString(),
    createdVia: via,
  };
  s.experiments.unshift(exp);
  audit(actor, "experiment.draft_created", { projectId: exp.projectId, target: exp.key, detail: via === "mcp" ? "via MCP" : undefined });
  return exp;
}

export function setExperimentStatus(actor: Actor, id: string, status: "running" | "stopped" | "completed") {
  assertScope(actor, "publish");
  const { experiment } = getExperiment(actor, id);
  const allowed: Record<string, string[]> = { draft: ["running"], running: ["stopped", "completed"], stopped: [], completed: [] };
  if (!allowed[experiment.status].includes(status)) throw new ServiceError("conflict", `Cannot move from ${experiment.status} to ${status}`);
  experiment.status = status;
  audit(actor, `experiment.${status}`, { projectId: experiment.projectId, target: experiment.key });
  return experiment;
}
