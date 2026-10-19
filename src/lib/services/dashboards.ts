import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { ChartSpec, Dashboard } from "@/lib/domain/types";
import { getTemplate } from "@/lib/domain/templates";
import { getStore, nextId } from "@/lib/server/store";
import { assertProjectAccess, assertScope, audit, parseInput, ServiceError, type Actor } from "./context";

const VISUALIZATIONS = ["kpi", "timeseries", "line", "area", "bar", "stacked_bar", "funnel", "cohort_heatmap", "table", "scatter", "distribution"] as const;

export const chartSpecSchema = z
  .object({
    id: z.string().min(1).max(64),
    title: z.string().trim().min(1, "Title is required").max(80),
    description: z.string().max(200).optional(),
    visualization: z.enum(VISUALIZATIONS),
    metrics: z.array(z.string().regex(/^[a-z][a-z0-9_]*$/)).min(1, "Choose at least one metric").max(6),
    groupBy: z.string().optional(),
    grain: z.enum(["day", "week", "month"]),
    dateRange: z.enum(["inherit", "7d", "14d", "30d", "60d", "90d"]),
    filters: z.array(z.object({ dimension: z.string(), values: z.array(z.string()).min(1).max(20) })).max(5),
    size: z.enum(["sm", "md", "lg", "full"]),
  })
  .strict()
  .superRefine((c, ctx) => {
    if (c.visualization === "scatter" && c.metrics.length !== 2) ctx.addIssue({ code: "custom", path: ["metrics"], message: "Scatter needs exactly two metrics (x, y)" });
    if (c.visualization === "funnel" && c.metrics.length < 2) ctx.addIssue({ code: "custom", path: ["metrics"], message: "Funnels need at least two steps" });
    if (c.visualization === "stacked_bar" && !c.groupBy) ctx.addIssue({ code: "custom", path: ["groupBy"], message: "Stacked bars need a group-by dimension" });
  });

export function validateChartAgainstCatalog(projectId: string, c: ChartSpec) {
  const s = getStore();
  for (const k of c.metrics) {
    const m = s.metrics.find((x) => x.projectId === projectId && x.key === k);
    if (!m) throw new ServiceError("invalid_input", `Metric "${k}" is not in this project's catalog`);
    if (m.status === "requested") throw new ServiceError("invalid_input", `Metric "${k}" is awaiting review`);
  }
  if (c.groupBy) {
    const first = s.metrics.find((x) => x.projectId === projectId && x.key === c.metrics[0]);
    if (first && !first.dimensions.includes(c.groupBy)) throw new ServiceError("invalid_input", `${first.name} can't be grouped by ${c.groupBy}`);
  }
}

export interface DashboardFilters {
  projectId?: string;
  q?: string;
  tag?: string;
  owner?: string;
  visibility?: string;
}

export function listDashboards(actor: Actor, f: DashboardFilters = {}): Dashboard[] {
  const s = getStore();
  const q = f.q?.toLowerCase().trim();
  return s.dashboards
    .filter((d) => actor.projectIds === "all" || actor.projectIds.includes(d.projectId))
    .filter((d) => !f.projectId || d.projectId === f.projectId)
    .filter((d) => !q || d.name.toLowerCase().includes(q) || d.description.toLowerCase().includes(q) || d.tags.some((t) => t.includes(q)))
    .filter((d) => !f.tag || d.tags.includes(f.tag))
    .filter((d) => !f.owner || d.owner === f.owner)
    .filter((d) => !f.visibility || d.visibility === f.visibility)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getDashboard(actor: Actor, id: string): Dashboard {
  const d = getStore().dashboards.find((x) => x.id === id);
  if (!d) throw new ServiceError("not_found", "Dashboard not found");
  assertProjectAccess(actor, d.projectId);
  return d;
}

export function recordView(actor: Actor, id: string) {
  const d = getDashboard(actor, id);
  d.viewCount += 1;
  d.lastViewedAt = new Date().toISOString();
}

export const createDashboardSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(80),
  description: z.string().trim().max(280).default(""),
  tags: z.array(z.string().trim().toLowerCase().regex(/^[a-z0-9-]{1,24}$/, "Tags: lowercase letters, numbers, dashes")).max(8).default([]),
  start: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("blank") }),
    z.object({ mode: z.literal("template"), templateId: z.string().min(1) }),
    z.object({ mode: z.literal("metrics"), metricKeys: z.array(z.string()).min(1, "Choose at least one metric").max(12) }),
  ]),
});

export function createDashboardDraft(actor: Actor, input: unknown, via: Dashboard["createdVia"] = "ui"): Dashboard {
  assertScope(actor, "draft");
  const data = parseInput(createDashboardSchema, input);
  assertProjectAccess(actor, data.projectId);
  const s = getStore();
  const id = nextId("d");
  let charts: ChartSpec[] = [];
  let templateId: string | undefined;
  if (data.start.mode === "template") {
    const tpl = getTemplate(data.start.templateId);
    if (!tpl) throw new ServiceError("invalid_input", "Unknown template");
    templateId = tpl.id;
    const available = new Set(s.metrics.filter((m) => m.projectId === data.projectId && m.status !== "requested").map((m) => m.key));
    charts = tpl.charts.filter((c) => c.metrics.every((k) => available.has(k))).map((c, i) => ({ ...c, id: `${id}_c${i + 1}` }));
  } else if (data.start.mode === "metrics") {
    const keys = data.start.metricKeys;
    for (const k of keys) {
      const m = s.metrics.find((x) => x.projectId === data.projectId && x.key === k);
      if (!m) throw new ServiceError("invalid_input", `Metric "${k}" is not in this project's catalog`);
    }
    charts = [
      ...keys.slice(0, 4).map((k, i): ChartSpec => ({ id: `${id}_k${i}`, title: s.metrics.find((m) => m.projectId === data.projectId && m.key === k)!.name, visualization: "kpi", metrics: [k], grain: "day", dateRange: "inherit", filters: [], size: "sm" })),
      ...keys.map((k, i): ChartSpec => ({ id: `${id}_t${i}`, title: `${s.metrics.find((m) => m.projectId === data.projectId && m.key === k)!.name} trend`, visualization: "line", metrics: [k], grain: "day", dateRange: "inherit", filters: [], size: "md" })),
    ];
  }
  const now = new Date().toISOString();
  const d: Dashboard = {
    id,
    projectId: data.projectId,
    name: data.name,
    description: data.description,
    tags: data.tags,
    owner: actor.name,
    visibility: "private",
    status: "draft",
    charts,
    templateId,
    viewCount: 0,
    createdAt: now,
    updatedAt: now,
    createdVia: via,
  };
  s.dashboards.push(d);
  audit(actor, "dashboard.draft_created", { projectId: d.projectId, target: d.name, detail: via === "mcp" ? "via MCP" : undefined });
  return d;
}

export const saveDashboardSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(280),
  tags: z.array(z.string().trim().toLowerCase().regex(/^[a-z0-9-]{1,24}$/)).max(8),
  charts: z.array(chartSpecSchema).max(40),
});

/** Save edits to the draft. Published viewers keep seeing `publishedCharts` until the next publish. */
export function saveDashboardDraft(actor: Actor, id: string, input: unknown): Dashboard {
  assertScope(actor, "draft");
  const d = getDashboard(actor, id);
  const data = parseInput(saveDashboardSchema, input);
  const ids = new Set<string>();
  for (const c of data.charts) {
    if (ids.has(c.id)) throw new ServiceError("invalid_input", `Duplicate chart id ${c.id}`);
    ids.add(c.id);
    validateChartAgainstCatalog(d.projectId, c as ChartSpec);
  }
  Object.assign(d, { name: data.name, description: data.description, tags: data.tags, charts: data.charts as ChartSpec[], updatedAt: new Date().toISOString() });
  audit(actor, "dashboard.draft_saved", { projectId: d.projectId, target: d.name });
  return d;
}

export function addChartToDraft(actor: Actor, dashboardId: string, chart: unknown): Dashboard {
  assertScope(actor, "draft");
  const d = getDashboard(actor, dashboardId);
  const spec = parseInput(chartSpecSchema, chart) as ChartSpec;
  validateChartAgainstCatalog(d.projectId, spec);
  if (d.charts.some((c) => c.id === spec.id)) spec.id = `${spec.id}_${nextId("c")}`;
  d.charts.push(spec);
  d.updatedAt = new Date().toISOString();
  audit(actor, "dashboard.chart_added", { projectId: d.projectId, target: d.name, detail: spec.title });
  return d;
}

/** Diff between the draft and the currently published version. */
export function publishPreview(actor: Actor, id: string) {
  const d = getDashboard(actor, id);
  const before = d.publishedCharts ?? [];
  const byId = new Map(before.map((c) => [c.id, c]));
  const added = d.charts.filter((c) => !byId.has(c.id)).map((c) => c.title);
  const removed = before.filter((c) => !d.charts.some((x) => x.id === c.id)).map((c) => c.title);
  const changed = d.charts.filter((c) => byId.has(c.id) && JSON.stringify(byId.get(c.id)) !== JSON.stringify(c)).map((c) => c.title);
  const reordered = !added.length && !removed.length && before.map((c) => c.id).join() !== d.charts.map((c) => c.id).join();
  const confirmationCode = createHash("sha256").update(JSON.stringify([d.id, d.charts, d.name])).digest("hex").slice(0, 10);
  return {
    dashboard: { id: d.id, name: d.name, status: d.status, visibility: d.visibility, chartCount: d.charts.length },
    firstPublish: !d.publishedCharts,
    added,
    removed,
    changed,
    reordered,
    hasChanges: !d.publishedCharts || added.length + removed.length + changed.length > 0 || reordered || d.status === "draft",
    confirmationCode,
  };
}

/**
 * Publishing requires an explicit confirmation code from `publishPreview`.
 * The code is bound to the exact draft contents, so publishing something other
 * than what was reviewed fails.
 */
export function publishDashboard(actor: Actor, id: string, confirmationCode: string | undefined): Dashboard {
  assertScope(actor, "publish");
  const preview = publishPreview(actor, id);
  if (!confirmationCode) throw new ServiceError("confirmation_required", "Publishing requires explicit confirmation. Review the preview and resend with its confirmation code.", preview);
  if (confirmationCode !== preview.confirmationCode) throw new ServiceError("conflict", "The draft changed since the preview. Review the new preview before publishing.", preview);
  const d = getDashboard(actor, id);
  if (d.charts.length === 0) throw new ServiceError("invalid_input", "Add at least one chart before publishing");
  const now = new Date().toISOString();
  d.status = "published";
  d.publishedCharts = structuredClone(d.charts);
  d.publishedAt = now;
  d.updatedAt = now;
  audit(actor, "dashboard.published", { projectId: d.projectId, target: d.name, detail: actor.type === "mcp" ? "confirmed via MCP" : undefined });
  return d;
}

export function discardDraftChanges(actor: Actor, id: string) {
  const d = getDashboard(actor, id);
  if (d.publishedCharts) d.charts = structuredClone(d.publishedCharts);
  audit(actor, "dashboard.draft_discarded", { projectId: d.projectId, target: d.name });
  return d;
}

export function setVisibility(actor: Actor, id: string, visibility: unknown) {
  assertScope(actor, "publish");
  const v = parseInput(z.enum(["private", "organization", "link"]), visibility);
  const d = getDashboard(actor, id);
  d.visibility = v;
  audit(actor, "dashboard.visibility_changed", { projectId: d.projectId, target: d.name, detail: v === "link" ? "link (simulated — no public auth)" : v });
  return d;
}

export function deleteDashboard(actor: Actor, id: string) {
  assertScope(actor, "publish");
  const d = getDashboard(actor, id);
  const s = getStore();
  s.dashboards = s.dashboards.filter((x) => x.id !== id);
  audit(actor, "dashboard.deleted", { projectId: d.projectId, target: d.name });
}

/** Charts that a viewer sees: the published snapshot, or the draft for unpublished dashboards. */
export function viewerCharts(d: Dashboard): ChartSpec[] {
  return d.publishedCharts ?? d.charts;
}

export function hasUnpublishedChanges(d: Dashboard) {
  return !!d.publishedCharts && JSON.stringify(d.publishedCharts) !== JSON.stringify(d.charts);
}
