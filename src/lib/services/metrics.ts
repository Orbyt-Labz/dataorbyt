import "server-only";
import { z } from "zod";
import type { Metric, MetricRequest } from "@/lib/domain/types";
import { getStore, nextId } from "@/lib/server/store";
import { DIMENSIONS, FACT_FIELDS } from "@/lib/demo/facts";
import { buildMetrics, METRIC_TEMPLATES } from "@/lib/demo/seed-metrics";
import { assertProjectAccess, assertScope, audit, parseInput, ServiceError, type Actor } from "./context";

export interface MetricFilters {
  q?: string;
  domain?: string;
  owner?: string;
  model?: string;
  status?: string;
}

export function listMetrics(actor: Actor, projectId: string, f: MetricFilters = {}): Metric[] {
  assertProjectAccess(actor, projectId);
  const q = f.q?.toLowerCase().trim();
  return getStore()
    .metrics.filter((m) => m.projectId === projectId)
    .filter((m) => !q || m.name.toLowerCase().includes(q) || m.key.includes(q) || m.description.toLowerCase().includes(q))
    .filter((m) => !f.domain || m.domain === f.domain)
    .filter((m) => !f.owner || m.owner === f.owner)
    .filter((m) => !f.model || m.sourceModel === f.model)
    .filter((m) => !f.status || m.status === f.status);
}

export function getMetric(actor: Actor, projectId: string, key: string): Metric {
  assertProjectAccess(actor, projectId);
  const m = getStore().metrics.find((x) => x.projectId === projectId && x.key === key);
  if (!m) throw new ServiceError("not_found", `Metric ${key} not found`);
  return m;
}

export function metricLineage(projectId: string, metric: Metric) {
  const s = getStore();
  const dbt = s.dbt[projectId];
  const model = dbt?.models.find((m) => m.name === metric.sourceModel);
  const upstream = new Set<string>();
  const walk = (name: string, depth = 0) => {
    if (depth > 6) return;
    const m = dbt?.models.find((x) => x.name === name);
    for (const d of m?.dependsOn ?? []) {
      upstream.add(d);
      if (!d.startsWith("source:")) walk(d, depth + 1);
    }
  };
  walk(metric.sourceModel);
  const sources = [...upstream].filter((u) => u.startsWith("source:")).map((u) => u.slice(7));
  const intermediate = [...upstream].filter((u) => !u.startsWith("source:"));
  const dashboards = s.dashboards
    .filter((d) => d.projectId === projectId && d.charts.some((c) => c.metrics.includes(metric.key)))
    .map((d) => ({ id: d.id, name: d.name, status: d.status }));
  const alerts = s.alerts.filter((a) => a.projectId === projectId && a.metricKey === metric.key).map((a) => ({ id: a.id, name: a.name }));
  const experiments = s.experiments
    .filter((e) => e.projectId === projectId && (e.primaryMetric === metric.key || e.guardrailMetrics.includes(metric.key)))
    .map((e) => ({ id: e.id, name: e.name }));
  return { sources: sources.length ? sources : metric.sourceTables, intermediate, model: model ? { name: model.name, state: model.state, layer: model.layer } : { name: metric.sourceModel, state: "not_run" as const, layer: "marts" as const }, dashboards, alerts, experiments };
}

export function addStarterMetrics(actor: Actor, projectId: string, keys: string[]) {
  assertProjectAccess(actor, projectId);
  assertScope(actor, "draft");
  const s = getStore();
  if (!s.facts[projectId]) throw new ServiceError("conflict", "Connect a source before adding metrics.");
  const existing = new Set(s.metrics.filter((m) => m.projectId === projectId).map((m) => m.key));
  const valid = keys.filter((k) => METRIC_TEMPLATES.some((t) => t.key === k) && !existing.has(k));
  if (valid.length === 0) throw new ServiceError("invalid_input", "Select at least one new metric.");
  const toAdd = buildMetrics(projectId, new Date().toISOString(), { exclude: METRIC_TEMPLATES.map((t) => t.key).filter((k) => !valid.includes(k)) });
  s.metrics.push(...toAdd);
  audit(actor, "metric.starter_added", { projectId, detail: valid.join(", ") });
  return toAdd;
}

const FORBIDDEN_SQL = /\b(insert|update|delete|merge|drop|alter|create|grant|revoke|truncate|call|execute|copy|export)\b/i;

export const metricRequestSchema = z.object({
  projectId: z.string().min(1),
  key: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]{2,40}$/, "Use lower_snake_case, 3–41 characters, starting with a letter"),
  name: z.string().trim().min(3, "Name is required").max(60),
  description: z.string().trim().min(10, "Describe what the metric measures (10+ characters)").max(400),
  domain: z.enum(["revenue", "growth", "engagement", "retention", "acquisition"]),
  unit: z.enum(["currency", "count", "percent"]),
  sourceModel: z.string().min(1, "Choose a source model"),
  aggregationType: z.enum(["sum", "ratio", "gauge"]),
  field: z.enum(FACT_FIELDS, { message: "Choose a field from the model" }),
  denominator: z.enum(FACT_FIELDS).optional(),
  dimensions: z.array(z.string()).max(4).default([]),
  proposedSql: z
    .string()
    .trim()
    .max(4000)
    .default("")
    .refine((v) => !FORBIDDEN_SQL.test(v), "Only SELECT expressions are allowed in a metric definition")
    .refine((v) => !v.includes(";"), "Multiple statements are not allowed"),
});

export function requestMetric(actor: Actor, input: unknown): MetricRequest {
  assertScope(actor, "draft");
  const data = parseInput(metricRequestSchema, input);
  assertProjectAccess(actor, data.projectId);
  const s = getStore();
  if (s.metrics.some((m) => m.projectId === data.projectId && m.key === data.key) || s.metricRequests.some((r) => r.projectId === data.projectId && r.key === data.key)) {
    throw new ServiceError("invalid_input", "A metric with this key already exists", [{ path: "key", message: "A metric with this key already exists" }]);
  }
  if (data.aggregationType === "ratio" && !data.denominator) {
    throw new ServiceError("invalid_input", "Ratio metrics need a denominator", [{ path: "denominator", message: "Ratio metrics need a denominator" }]);
  }
  const bad = data.dimensions.filter((d) => !DIMENSIONS[d]);
  if (bad.length) throw new ServiceError("invalid_input", `Unknown dimensions: ${bad.join(", ")}`);
  const aggregation =
    data.aggregationType === "ratio"
      ? ({ type: "ratio", numerator: data.field, denominator: data.denominator } as MetricRequest["aggregation"])
      : ({ type: data.aggregationType, field: data.field } as MetricRequest["aggregation"]);
  const req: MetricRequest = {
    id: nextId("mreq"),
    projectId: data.projectId,
    key: data.key,
    name: data.name,
    description: data.description,
    domain: data.domain,
    unit: data.unit,
    sourceModel: data.sourceModel,
    aggregation,
    dimensions: data.dimensions,
    proposedSql: data.proposedSql,
    requestedBy: actor.name,
    status: "pending_review",
    createdAt: new Date().toISOString(),
  };
  s.metricRequests.unshift(req);
  // Requested metrics appear in the catalog with status "requested" and cannot be queried until approved.
  s.metrics.push({
    id: `m_${data.projectId}_${data.key}`,
    projectId: data.projectId,
    key: data.key,
    name: data.name,
    description: data.description,
    domain: data.domain,
    owner: actor.name,
    status: "requested",
    unit: data.unit,
    defaultGrain: "day",
    aggregation,
    formula: data.proposedSql || describeAggregation(aggregation),
    dimensions: data.dimensions,
    sourceModel: data.sourceModel,
    sourceTables: [],
    direction: "up",
    updatedAt: req.createdAt,
  });
  audit(actor, "metric.requested", { projectId: data.projectId, target: data.key });
  return req;
}

export function reviewMetricRequest(actor: Actor, id: string, decision: "approved" | "rejected") {
  assertScope(actor, "publish");
  const s = getStore();
  const r = s.metricRequests.find((x) => x.id === id);
  if (!r) throw new ServiceError("not_found", "Request not found");
  assertProjectAccess(actor, r.projectId);
  r.status = decision;
  const m = s.metrics.find((x) => x.projectId === r.projectId && x.key === r.key);
  if (m) {
    if (decision === "approved") m.status = "approved";
    else s.metrics = s.metrics.filter((x) => x !== m);
  }
  audit(actor, `metric.request_${decision}`, { projectId: r.projectId, target: r.key });
  return r;
}

export function describeAggregation(a: Metric["aggregation"]) {
  if (a.type === "sum") return `SUM(${a.field}${(a.minus ?? []).map((m) => ` − ${m}`).join("")})`;
  if (a.type === "gauge") return `AVG(${a.field}) per period`;
  return `SUM(${a.numerator}) ÷ SUM(${a.denominator})`;
}
