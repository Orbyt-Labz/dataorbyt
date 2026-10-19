import "server-only";
import { z } from "zod";
import type { Metric, QueryHistoryEntry } from "@/lib/domain/types";
import type { QueryPlan, QueryRow, WarehouseAdapter } from "@/lib/adapters/types";
import { DemoWarehouseAdapter } from "@/lib/adapters/demo-warehouse";
import { DIMENSIONS } from "@/lib/demo/facts";
import { daysBetween } from "@/lib/domain/dates";
import { getStore, nextId } from "@/lib/server/store";
import { assertProjectAccess, parseInput, ServiceError, type Actor } from "./context";

export const QUERY_LIMITS = {
  maxRangeDays: 180,
  warnRangeDays: 60,
  rowLimit: 5000,
  timeoutMs: 5000,
  maxConcurrent: 8,
  maxFilters: 5,
  maxFilterValues: 20,
  dailyScanBudgetBytes: 512 * 1024 * 1024,
  cacheTtlMs: 15 * 60 * 1000,
  staleAfterHours: 24,
} as const;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

export const metricQuerySchema = z
  .object({
    projectId: z.string().min(1),
    metricKey: z.string().regex(/^[a-z][a-z0-9_]{1,63}$/, "Unknown metric key format"),
    start: isoDate,
    end: isoDate,
    grain: z.enum(["day", "week", "month"]).default("day"),
    groupBy: z.string().optional(),
    filters: z
      .array(z.object({ dimension: z.string(), values: z.array(z.string()).min(1).max(QUERY_LIMITS.maxFilterValues) }))
      .max(QUERY_LIMITS.maxFilters)
      .default([]),
  })
  .strict()
  .refine((v) => v.start <= v.end, { message: "start must be on or before end", path: ["start"] });

export type MetricQueryRequest = z.input<typeof metricQuerySchema>;

export interface QueryContext {
  actor: Actor;
  source: QueryHistoryEntry["source"];
  dashboardId?: string;
  /** Allow draft metrics (catalog preview only). */
  allowDraft?: boolean;
  rowLimit?: number;
}

export interface MetricQueryResult {
  metric: Pick<Metric, "key" | "name" | "unit" | "status" | "direction">;
  rows: QueryRow[];
  plan: { sql: string; params: QueryPlan["params"] };
  meta: {
    cacheHit: boolean;
    cachedAt?: string;
    scanBytes: number;
    estimatedScanBytes: number;
    durationMs: number;
    truncated: boolean;
    warnings: string[];
    demo: boolean;
    dataThrough?: string;
    loadedAt?: string;
    stale: boolean;
  };
}

let warehouse: WarehouseAdapter | undefined;
export function getWarehouse(): WarehouseAdapter {
  // Only the demo adapter exists today. A real deployment would choose an
  // adapter per project from its warehouse connection.
  warehouse ??= new DemoWarehouseAdapter(
    (pid) => getStore().facts[pid],
    (pid) => getStore().factsLoadedAt[pid] ?? new Date().toISOString(),
  );
  return warehouse;
}

const GRAIN_SQL = { day: "date", week: "DATE_TRUNC(date, WEEK(MONDAY))", month: "DATE_TRUNC(date, MONTH)" } as const;

function aggregationSql(m: Metric) {
  const a = m.aggregation;
  if (a.type === "sum") return `SUM(${a.field}${(a.minus ?? []).map((x) => ` - ${x}`).join("")})`;
  if (a.type === "gauge") return `AVG(${a.field})`;
  return `SAFE_DIVIDE(SUM(${a.numerator}), SUM(${a.denominator}))`;
}

/** Compile a validated request into a parameterised plan. Never interpolates user values into SQL. */
export function compilePlan(metric: Metric, req: z.output<typeof metricQuerySchema>, rowLimit: number): QueryPlan {
  const params: QueryPlan["params"] = { project_id: req.projectId, start_date: req.start, end_date: req.end, row_limit: rowLimit };
  const where = ["project_id = @project_id", "date BETWEEN @start_date AND @end_date"];
  req.filters.forEach((f, i) => {
    params[`f${i}_values`] = f.values;
    where.push(`${f.dimension} IN UNNEST(@f${i}_values)`);
  });
  const select = [`${GRAIN_SQL[req.grain]} AS period`];
  if (req.groupBy) select.push(`${req.groupBy} AS group_key`);
  select.push(`${aggregationSql(metric)} AS value`);
  const sql = [
    `-- metric: ${metric.key} (governed, compiled by MetricQueryService)`,
    `SELECT ${select.join(",\n       ")}`,
    `FROM marts.${metric.sourceModel}`,
    `WHERE ${where.join("\n  AND ")}`,
    `GROUP BY period${req.groupBy ? ", group_key" : ""}`,
    `ORDER BY period`,
    `LIMIT @row_limit`,
  ].join("\n");
  return {
    projectId: req.projectId,
    metricKey: metric.key,
    aggregation: metric.aggregation,
    sourceModel: metric.sourceModel,
    start: req.start,
    end: req.end,
    grain: req.grain,
    groupBy: req.groupBy,
    filters: req.filters,
    sql,
    params,
  };
}

export function cacheKey(req: z.output<typeof metricQuerySchema>) {
  const filters = [...req.filters]
    .map((f) => ({ d: f.dimension, v: [...f.values].sort() }))
    .sort((a, b) => a.d.localeCompare(b.d));
  return JSON.stringify([req.projectId, req.metricKey, req.start, req.end, req.grain, req.groupBy ?? null, filters]);
}

function recordHistory(e: Omit<QueryHistoryEntry, "id" | "at">) {
  const store = getStore();
  store.queryHistory.unshift({ id: nextId("q"), at: new Date().toISOString(), ...e });
  if (store.queryHistory.length > 500) store.queryHistory.length = 500;
}

/**
 * The only path from the UI, alerts and MCP to warehouse data. It accepts
 * approved metric keys and whitelisted dimensions, validates bounds, checks the
 * result cache and scan budget, then executes through the warehouse adapter.
 */
export async function queryMetric(input: MetricQueryRequest, ctx: QueryContext): Promise<MetricQueryResult> {
  const req = parseInput(metricQuerySchema, input);
  assertProjectAccess(ctx.actor, req.projectId);
  const store = getStore();
  const reject = (code: ConstructorParameters<typeof ServiceError>[0], message: string): never => {
    recordHistory({ projectId: req.projectId, metricKey: req.metricKey, source: ctx.source, dashboardId: ctx.dashboardId, cacheHit: false, scanBytes: 0, durationMs: 0, rows: 0, status: "rejected", reason: message });
    throw new ServiceError(code, message);
  };

  const metric = store.metrics.find((m) => m.projectId === req.projectId && m.key === req.metricKey);
  if (!metric) return reject("not_found", `Metric "${req.metricKey}" is not in the approved catalog for this project`);
  const warnings: string[] = [];
  if (metric.status === "deprecated") warnings.push(`${metric.name} is deprecated; prefer an approved replacement.`);
  if (metric.status === "draft" || metric.status === "requested") {
    if (!ctx.allowDraft) return reject("forbidden", `${metric.name} is a ${metric.status} metric and cannot be queried until approved`);
    warnings.push(`${metric.name} is a draft metric — preview only.`);
  }

  if (req.groupBy) {
    if (!metric.dimensions.includes(req.groupBy) || !DIMENSIONS[req.groupBy]) {
      return reject("invalid_input", `Dimension "${req.groupBy}" is not available for ${metric.name}. Allowed: ${metric.dimensions.join(", ")}`);
    }
  }
  for (const f of req.filters) {
    if (!metric.dimensions.includes(f.dimension)) return reject("invalid_input", `Cannot filter ${metric.name} by "${f.dimension}"`);
    const allowed = DIMENSIONS[f.dimension].values.map((v) => v.key);
    const bad = f.values.filter((v) => !allowed.includes(v));
    if (bad.length) return reject("invalid_input", `Unknown ${f.dimension} value(s): ${bad.join(", ")}`);
  }

  const days = daysBetween(req.start, req.end);
  if (days > QUERY_LIMITS.maxRangeDays) return reject("invalid_input", `Date range of ${days} days exceeds the ${QUERY_LIMITS.maxRangeDays}-day limit`);
  if (days > QUERY_LIMITS.warnRangeDays) warnings.push(`Large range (${days} days): this query scans more data. Prefer ${QUERY_LIMITS.warnRangeDays} days or less for routine dashboards.`);

  const wh = getWarehouse();
  const coverage = wh.coverage(req.projectId);
  const dataVersion = coverage?.loadedAt ?? "none";
  const stale = coverage ? Date.now() - Date.parse(coverage.loadedAt) > QUERY_LIMITS.staleAfterHours * 3_600_000 : false;
  if (stale) warnings.push("Source data is older than 24 hours.");
  const rowLimit = Math.min(ctx.rowLimit ?? QUERY_LIMITS.rowLimit, QUERY_LIMITS.rowLimit);
  const plan = compilePlan(metric, req, rowLimit);
  const estimate = wh.estimate(plan);
  const metricInfo = { key: metric.key, name: metric.name, unit: metric.unit, status: metric.status, direction: metric.direction };

  const key = cacheKey(req);
  const cached = store.queryCache.get(key);
  if (cached && cached.dataVersion === dataVersion && Date.now() - cached.storedAt < QUERY_LIMITS.cacheTtlMs) {
    recordHistory({ projectId: req.projectId, metricKey: metric.key, source: ctx.source, dashboardId: ctx.dashboardId, cacheHit: true, scanBytes: 0, durationMs: 0, rows: cached.rows.length, status: "ok" });
    const rows = cached.rows.slice(0, rowLimit);
    return {
      metric: metricInfo,
      rows,
      plan: { sql: plan.sql, params: plan.params },
      meta: { cacheHit: true, cachedAt: new Date(cached.storedAt).toISOString(), scanBytes: 0, estimatedScanBytes: estimate.scanBytes, durationMs: 0, truncated: cached.rows.length > rowLimit, warnings, demo: wh.demo, dataThrough: coverage?.end, loadedAt: coverage?.loadedAt, stale },
    };
  }

  const today = new Date().toISOString().slice(0, 10);
  const usage = store.scanUsage[req.projectId]?.day === today ? store.scanUsage[req.projectId] : { day: today, bytes: 0 };
  if (usage.bytes + estimate.scanBytes > QUERY_LIMITS.dailyScanBudgetBytes) {
    return reject("budget_exceeded", "Daily scan budget for this project is exhausted. Cached results remain available.");
  }
  if (store.activeQueries >= QUERY_LIMITS.maxConcurrent) return reject("rate_limited", "Too many concurrent queries for this workspace. Retry shortly.");

  store.activeQueries++;
  const t0 = performance.now();
  try {
    const all = await wh.execute(plan, { timeoutMs: QUERY_LIMITS.timeoutMs, rowLimit: rowLimit + 1 });
    const durationMs = Math.round(performance.now() - t0);
    const truncated = all.length > rowLimit;
    const rows = all.slice(0, rowLimit);
    usage.bytes += estimate.scanBytes;
    store.scanUsage[req.projectId] = usage;
    store.queryCache.set(key, { rows, storedAt: Date.now(), dataVersion, scanBytes: estimate.scanBytes });
    if (store.queryCache.size > 2000) store.queryCache.delete(store.queryCache.keys().next().value!);
    recordHistory({ projectId: req.projectId, metricKey: metric.key, source: ctx.source, dashboardId: ctx.dashboardId, cacheHit: false, scanBytes: estimate.scanBytes, durationMs, rows: rows.length, status: "ok" });
    if (truncated) warnings.push(`Result truncated to ${rowLimit} rows.`);
    return {
      metric: metricInfo,
      rows,
      plan: { sql: plan.sql, params: plan.params },
      meta: { cacheHit: false, scanBytes: estimate.scanBytes, estimatedScanBytes: estimate.scanBytes, durationMs, truncated, warnings, demo: wh.demo, dataThrough: coverage?.end, loadedAt: coverage?.loadedAt, stale },
    };
  } catch (e) {
    const timeout = e instanceof Error && /timeout/i.test(e.message);
    recordHistory({ projectId: req.projectId, metricKey: metric.key, source: ctx.source, dashboardId: ctx.dashboardId, cacheHit: false, scanBytes: 0, durationMs: Math.round(performance.now() - t0), rows: 0, status: timeout ? "timeout" : "error", reason: String(e) });
    throw new ServiceError(timeout ? "timeout" : "conflict", timeout ? "Query timed out" : "Query failed");
  } finally {
    store.activeQueries--;
  }
}

/** Sum a result's values (respecting ratio metrics, which must be re-derived from parts). */
export function totalOf(result: MetricQueryResult, aggregation: Metric["aggregation"]): number | null {
  const rows = result.rows;
  if (rows.length === 0) return null;
  if (aggregation.type === "ratio") {
    const num = rows.reduce((a, r) => a + (r.numerator ?? 0), 0);
    const den = rows.reduce((a, r) => a + (r.denominator ?? 0), 0);
    return den ? num / den : null;
  }
  if (aggregation.type === "gauge") {
    // For gauges the latest period is the headline value.
    const last = rows[rows.length - 1].period;
    return rows.filter((r) => r.period === last).reduce((a, r) => a + r.value, 0);
  }
  return rows.reduce((a, r) => a + r.value, 0);
}

export function getUsage(projectId?: string) {
  const store = getStore();
  const today = new Date().toISOString().slice(0, 10);
  const history = projectId ? store.queryHistory.filter((h) => h.projectId === projectId) : store.queryHistory;
  const usage = projectId && store.scanUsage[projectId]?.day === today ? store.scanUsage[projectId].bytes : 0;
  const byDashboard = new Map<string, { queries: number; cacheHits: number; scanBytes: number }>();
  for (const h of history) {
    const k = h.dashboardId ?? `(${h.source})`;
    const e = byDashboard.get(k) ?? { queries: 0, cacheHits: 0, scanBytes: 0 };
    e.queries++;
    if (h.cacheHit) e.cacheHits++;
    e.scanBytes += h.scanBytes;
    byDashboard.set(k, e);
  }
  return {
    history: history.slice(0, 100),
    scannedTodayBytes: usage,
    budgetBytes: QUERY_LIMITS.dailyScanBudgetBytes,
    cacheHitRate: history.length ? history.filter((h) => h.cacheHit).length / history.length : 0,
    byDashboard: [...byDashboard.entries()].map(([key, v]) => ({ key, ...v })),
  };
}
