import "server-only";
import { z } from "zod";
import type { TokenScope } from "@/lib/domain/types";
import { DATE_RANGES, resolveRange } from "@/lib/domain/dates";
import { assertProjectAccess, assertScope, audit, parseInput, ServiceError, type Actor } from "@/lib/services/context";
import { listProjects, projectSummary } from "@/lib/services/projects";
import { listConnections } from "@/lib/services/connections";
import { addChartToDraft, createDashboardDraft, getDashboard, listDashboards, publishDashboard, publishPreview } from "@/lib/services/dashboards";
import { getMetric, listMetrics, metricLineage } from "@/lib/services/metrics";
import { getWarehouse, queryMetric } from "@/lib/services/query";
import { createAlert } from "@/lib/services/alerts";
import { createExperimentDraft } from "@/lib/services/experiments";

export interface ToolDef<S extends z.ZodType = z.ZodType> {
  name: string;
  title: string;
  description: string;
  input: S;
  scope: TokenScope;
  readOnly: boolean;
  handler: (actor: Actor, args: z.output<S>) => unknown | Promise<unknown>;
}

const projectId = z.string().min(1).describe("Project ID, from list_projects");
const rangeKeys = DATE_RANGES.map((r) => r.key) as [string, ...string[]];

function tool<S extends z.ZodType>(t: ToolDef<S>): ToolDef<S> {
  return t;
}

export const TOOLS = [
  tool({
    name: "list_projects",
    title: "List projects",
    description: "List projects this token can access, with source/dashboard counts and status.",
    input: z.object({}).strict(),
    scope: "read",
    readOnly: true,
    handler: (actor) => listProjects(actor).map((p) => ({ id: p.id, name: p.name, environment: p.environment, status: p.status, currency: p.currency, timezone: p.timezone, demo_data: p.sampleData, ...projectSummary(p.id) })),
  }),
  tool({
    name: "list_connections",
    title: "List connections",
    description: "List data source connections for a project. Secrets are never returned.",
    input: z.object({ project_id: projectId }).strict(),
    scope: "read",
    readOnly: true,
    handler: (actor, a) =>
      listConnections(actor, a.project_id).map((c) => ({ id: c.id, name: c.name, connector: c.connectorId, status: c.status, demo: c.demo, last_sync_at: c.lastSyncAt, tables: c.tables.map((t) => t.name), error: c.error })),
  }),
  tool({
    name: "list_dashboards",
    title: "List dashboards",
    description: "List dashboards in a project.",
    input: z.object({ project_id: projectId, query: z.string().max(100).optional() }).strict(),
    scope: "read",
    readOnly: true,
    handler: (actor, a) =>
      listDashboards(actor, { projectId: a.project_id, q: a.query }).map((d) => ({ id: d.id, name: d.name, status: d.status, visibility: d.visibility, charts: d.charts.length, tags: d.tags, updated_at: d.updatedAt })),
  }),
  tool({
    name: "list_metrics",
    title: "List metrics",
    description: "List governed metrics in a project's catalog. Only approved metrics can be queried.",
    input: z.object({ project_id: projectId, domain: z.enum(["revenue", "growth", "engagement", "retention", "acquisition"]).optional() }).strict(),
    scope: "read",
    readOnly: true,
    handler: (actor, a) =>
      listMetrics(actor, a.project_id, { domain: a.domain }).map((m) => ({ key: m.key, name: m.name, status: m.status, unit: m.unit, domain: m.domain, dimensions: m.dimensions })),
  }),
  tool({
    name: "get_metric_definition",
    title: "Get metric definition",
    description: "Return a metric's definition, dimensions, owner, source model and lineage.",
    input: z.object({ project_id: projectId, metric_key: z.string().min(1) }).strict(),
    scope: "read",
    readOnly: true,
    handler: (actor, a) => {
      const m = getMetric(actor, a.project_id, a.metric_key);
      return { ...m, lineage: metricLineage(a.project_id, m) };
    },
  }),
  tool({
    name: "preview_metric_query",
    title: "Preview metric query",
    description:
      "Run a governed, read-only query for one approved metric. Accepts only catalog metric keys, whitelisted dimensions and bounded date ranges; results are cached and capped at 200 rows. Arbitrary SQL is not supported.",
    input: z
      .object({
        project_id: projectId,
        metric_key: z.string().min(1),
        range: z.enum(rangeKeys).default("30d"),
        grain: z.enum(["day", "week", "month"]).default("week"),
        group_by: z.string().optional(),
        filters: z.array(z.object({ dimension: z.string(), values: z.array(z.string()).min(1).max(20) })).max(5).default([]),
      })
      .strict(),
    scope: "read",
    readOnly: true,
    handler: async (actor, a) => {
      assertProjectAccess(actor, a.project_id);
      const cov = getWarehouse().coverage(a.project_id);
      if (!cov) throw new ServiceError("conflict", "This project has no data connected yet.");
      const r = resolveRange(cov.end, a.range as (typeof DATE_RANGES)[number]["key"]);
      const res = await queryMetric(
        { projectId: a.project_id, metricKey: a.metric_key, start: r.start, end: r.end, grain: a.grain, groupBy: a.group_by, filters: a.filters },
        { actor, source: "mcp", rowLimit: 200 },
      );
      return { metric: res.metric, range: { start: r.start, end: r.end }, rows: res.rows, meta: res.meta, compiled_sql: res.plan.sql };
    },
  }),
  tool({
    name: "create_dashboard_draft",
    title: "Create dashboard draft",
    description: "Create a private draft dashboard (blank, from a template, or from metrics). Drafts are not visible to others until published by a person or via confirmed publish_dashboard.",
    input: z
      .object({
        project_id: projectId,
        name: z.string().min(2).max(80),
        description: z.string().max(280).optional(),
        template_id: z.enum(["founder_overview", "saas_growth", "revenue_billing", "acquisition_funnel", "retention_cohorts", "experiment_readout"]).optional(),
        metric_keys: z.array(z.string()).max(12).optional(),
      })
      .strict(),
    scope: "draft",
    readOnly: false,
    handler: (actor, a) => {
      const start = a.template_id ? { mode: "template" as const, templateId: a.template_id } : a.metric_keys?.length ? { mode: "metrics" as const, metricKeys: a.metric_keys } : { mode: "blank" as const };
      const d = createDashboardDraft(actor, { projectId: a.project_id, name: a.name, description: a.description ?? "Created via MCP", tags: ["mcp"], start }, "mcp");
      return { id: d.id, name: d.name, status: d.status, charts: d.charts.map((c) => ({ id: c.id, title: c.title, visualization: c.visualization })), edit_url: `/dashboards/${d.id}/edit` };
    },
  }),
  tool({
    name: "add_dashboard_chart",
    title: "Add chart to draft",
    description: "Append a chart to a dashboard's draft. Published viewers don't see it until the dashboard is published.",
    input: z
      .object({
        project_id: projectId,
        dashboard_id: z.string().min(1),
        title: z.string().min(1).max(80),
        visualization: z.enum(["kpi", "timeseries", "line", "area", "bar", "stacked_bar", "funnel", "cohort_heatmap", "table", "scatter", "distribution"]),
        metric_keys: z.array(z.string()).min(1).max(6),
        group_by: z.string().optional(),
        grain: z.enum(["day", "week", "month"]).default("day"),
        size: z.enum(["sm", "md", "lg", "full"]).default("md"),
      })
      .strict(),
    scope: "draft",
    readOnly: false,
    handler: (actor, a) => {
      const d0 = getDashboard(actor, a.dashboard_id);
      if (d0.projectId !== a.project_id) throw new ServiceError("forbidden", "Dashboard is not in this project");
      const d = addChartToDraft(actor, a.dashboard_id, {
        id: `mcp_${Date.now().toString(36)}`,
        title: a.title,
        visualization: a.visualization,
        metrics: a.metric_keys,
        groupBy: a.group_by,
        grain: a.grain,
        dateRange: "inherit",
        filters: [],
        size: a.size,
      });
      return { id: d.id, charts: d.charts.length, status: d.status, note: "Added to draft. Publishing requires explicit confirmation." };
    },
  }),
  tool({
    name: "publish_dashboard",
    title: "Publish dashboard",
    description:
      "Two-step publish. Call with confirm=false (or no confirmation_code) to get a change preview and a confirmation_code. Show the preview to the user; only after they explicitly approve, call again with confirm=true and that confirmation_code.",
    input: z.object({ project_id: projectId, dashboard_id: z.string().min(1), confirm: z.boolean().default(false), confirmation_code: z.string().max(32).optional() }).strict(),
    scope: "publish",
    readOnly: false,
    handler: (actor, a) => {
      const d0 = getDashboard(actor, a.dashboard_id);
      if (d0.projectId !== a.project_id) throw new ServiceError("forbidden", "Dashboard is not in this project");
      if (!a.confirm || !a.confirmation_code) {
        return { published: false, requires_confirmation: true, preview: publishPreview(actor, a.dashboard_id), instructions: "Ask the user to approve this preview, then call again with confirm=true and confirmation_code." };
      }
      const d = publishDashboard(actor, a.dashboard_id, a.confirmation_code);
      return { published: true, id: d.id, published_at: d.publishedAt };
    },
  }),
  tool({
    name: "create_alert_draft",
    title: "Create alert draft",
    description: "Create a paused draft alert. A person must review and activate it in DataOrbyt before it evaluates on a schedule.",
    input: z
      .object({
        project_id: projectId,
        name: z.string().min(3).max(80),
        metric_key: z.string().optional(),
        condition: z.discriminatedUnion("kind", [
          z.object({ kind: z.literal("threshold"), operator: z.enum(["gt", "lt", "gte", "lte"]), value: z.number() }),
          z.object({ kind: z.literal("relative_change"), direction: z.enum(["increase", "decrease", "either"]), pct: z.number(), comparedTo: z.enum(["previous_period", "same_day_last_week"]) }),
          z.object({ kind: z.literal("missing_data"), expectedRowsAtLeast: z.number().int() }),
          z.object({ kind: z.literal("freshness_sla"), maxAgeHours: z.number() }),
          z.object({ kind: z.literal("pipeline_failure"), target: z.enum(["dbt_run", "dbt_test", "connection_sync"]) }),
        ]),
        cadence: z.enum(["hourly", "daily", "weekly"]).default("daily"),
        lookback_days: z.number().int().min(1).max(90).default(1),
        channel: z.enum(["email", "slack", "webhook"]).default("email"),
        recipients: z.array(z.string()).min(1).max(10),
        severity: z.enum(["info", "warning", "critical"]).default("warning"),
      })
      .strict(),
    scope: "draft",
    readOnly: false,
    handler: (actor, a) => {
      const al = createAlert(
        actor,
        {
          projectId: a.project_id,
          name: a.name,
          metricKey: a.metric_key,
          condition: a.condition,
          cadence: a.cadence,
          lookbackDays: a.lookback_days,
          channel: a.channel,
          recipients: a.recipients,
          severity: a.severity,
          cooldownMinutes: 360,
          consecutiveEvaluations: 2,
        },
        { draft: true, via: "mcp" },
      );
      return { id: al.id, status: al.status, draft: true, review_url: `/alerts?alert=${al.id}` };
    },
  }),
  tool({
    name: "create_experiment_draft",
    title: "Create experiment draft",
    description: "Create a draft experiment definition. It does not start assignment; a person must start it in DataOrbyt.",
    input: z
      .object({
        project_id: projectId,
        name: z.string().min(3).max(80),
        key: z.string().regex(/^[a-z][a-z0-9_]{2,48}$/),
        hypothesis: z.string().min(20).max(600),
        population: z.string().min(3).max(200),
        randomization_unit: z.enum(["user", "account", "session", "device"]).default("user"),
        variants: z.array(z.object({ key: z.string(), name: z.string(), allocation: z.number().int(), is_control: z.boolean() })).min(2).max(4),
        start_date: z.string(),
        end_date: z.string(),
        primary_metric: z.string(),
        guardrail_metrics: z.array(z.string()).max(5).default([]),
        minimum_detectable_effect_pct: z.number().optional(),
        target_sample_size_per_variant: z.number().int().optional(),
      })
      .strict(),
    scope: "draft",
    readOnly: false,
    handler: (actor, a) => {
      const e = createExperimentDraft(
        actor,
        {
          projectId: a.project_id,
          name: a.name,
          key: a.key,
          hypothesis: a.hypothesis,
          population: a.population,
          randomizationUnit: a.randomization_unit,
          variants: a.variants.map((v) => ({ key: v.key, name: v.name, allocation: v.allocation, isControl: v.is_control })),
          startDate: a.start_date,
          endDate: a.end_date,
          primaryMetric: a.primary_metric,
          guardrailMetrics: a.guardrail_metrics,
          minimumDetectableEffectPct: a.minimum_detectable_effect_pct,
          targetSampleSizePerVariant: a.target_sample_size_per_variant,
        },
        "mcp",
      );
      return { id: e.id, key: e.key, status: e.status, review_url: `/experiments/${e.id}` };
    },
  }),
];

export function toolList() {
  return TOOLS.map((t) => ({
    name: t.name,
    title: t.title,
    description: t.description,
    inputSchema: z.toJSONSchema(t.input, { io: "input" }),
    annotations: { title: t.title, readOnlyHint: t.readOnly, destructiveHint: false, idempotentHint: t.readOnly, openWorldHint: false },
  }));
}

export async function callTool(actor: Actor, name: string, rawArgs: unknown) {
  const t = TOOLS.find((x) => x.name === name);
  if (!t) throw new ServiceError("not_found", `Unknown tool: ${name}`);
  assertScope(actor, t.scope);
  const args = parseInput(t.input as z.ZodType, rawArgs ?? {});
  const projectArg = (args as { project_id?: string }).project_id;
  try {
    const result = await (t.handler as (a: Actor, x: unknown) => unknown)(actor, args);
    audit(actor, "mcp.tool_called", { projectId: projectArg, target: name, detail: t.readOnly ? "read" : "mutation (draft/confirmed)" });
    return result;
  } catch (e) {
    audit(actor, "mcp.tool_failed", { projectId: projectArg, target: name, detail: e instanceof Error ? e.message.slice(0, 200) : "error" });
    throw e;
  }
}
