import "server-only";
import type { ChartFilter, ChartSpec, DateRangeKey, Metric } from "@/lib/domain/types";
import { histogram, type ChartData, type ChartMeta } from "@/lib/domain/chart-data";
import { resolveRange, rangeDays } from "@/lib/domain/dates";
import { DIMENSIONS, generateCohorts } from "@/lib/demo/facts";
import { getStore } from "@/lib/server/store";
import { getWarehouse, queryMetric, totalOf, type MetricQueryResult } from "./query";
import { ServiceError, type Actor } from "./context";

export interface ChartRequestContext {
  actor: Actor;
  projectId: string;
  range: DateRangeKey;
  /** Global dashboard filters; applied only to metrics that support the dimension. */
  globalFilters?: ChartFilter[];
  dashboardId?: string;
  source?: "ui" | "dashboard" | "mcp";
}

function mergeFilters(spec: ChartSpec, metric: Metric, global: ChartFilter[] = []) {
  const merged = [...spec.filters];
  for (const g of global) if (!merged.some((f) => f.dimension === g.dimension)) merged.push(g);
  return merged.filter((f) => metric.dimensions.includes(f.dimension));
}

export async function resolveChartData(spec: ChartSpec, ctx: ChartRequestContext): Promise<ChartData> {
  const store = getStore();
  const wh = getWarehouse();
  const coverage = wh.coverage(ctx.projectId);
  if (!coverage) return { kind: "empty", reason: "No data source is connected for this project yet." };
  const rangeKey = spec.dateRange === "inherit" ? ctx.range : spec.dateRange;
  const range = resolveRange(coverage.end, rangeKey);
  const metrics = spec.metrics.map((k) => store.metrics.find((m) => m.projectId === ctx.projectId && m.key === k));
  const missing = spec.metrics.filter((_, i) => !metrics[i]);
  if (spec.metrics.length === 0) return { kind: "empty", reason: "Choose at least one metric." };
  if (missing.length) return { kind: "error", message: `Metric not in this project's catalog: ${missing.join(", ")}` };
  const ms = metrics as Metric[];

  const meta: ChartMeta = { queries: 0, cacheHits: 0, scanBytes: 0, warnings: [], dataThrough: coverage.end, loadedAt: coverage.loadedAt, stale: false, demo: wh.demo };
  const run = async (metric: Metric, opts: { start?: string; end?: string; grain?: ChartSpec["grain"]; groupBy?: string } = {}) => {
    const r: MetricQueryResult = await queryMetric(
      {
        projectId: ctx.projectId,
        metricKey: metric.key,
        start: opts.start ?? range.start,
        end: opts.end ?? range.end,
        grain: opts.grain ?? spec.grain,
        groupBy: opts.groupBy,
        filters: mergeFilters(spec, metric, ctx.globalFilters),
      },
      { actor: ctx.actor, source: ctx.source ?? "dashboard", dashboardId: ctx.dashboardId },
    );
    meta.queries++;
    if (r.meta.cacheHit) meta.cacheHits++;
    meta.scanBytes += r.meta.scanBytes;
    meta.stale ||= r.meta.stale;
    for (const w of r.meta.warnings) if (!meta.warnings.includes(w)) meta.warnings.push(w);
    return r;
  };

  try {
    const groupBy = spec.groupBy && ms[0].dimensions.includes(spec.groupBy) ? spec.groupBy : undefined;
    if (spec.groupBy && !groupBy) meta.warnings.push(`${ms[0].name} can't be grouped by ${spec.groupBy}; showing totals.`);

    switch (spec.visualization) {
      case "kpi": {
        const m = ms[0];
        const cur = await run(m, { grain: "day" });
        const prev = await run(m, { start: range.prevStart, end: range.prevEnd, grain: "day" });
        return {
          kind: "kpi",
          name: m.name,
          unit: m.unit,
          value: totalOf(cur, m.aggregation),
          previous: totalOf(prev, m.aggregation),
          direction: m.direction,
          sparkline: cur.rows.map((r) => r.value),
          meta,
        };
      }
      case "funnel": {
        const steps = [];
        for (const m of ms) {
          const r = await run(m, { grain: "month" });
          steps.push({ key: m.key, name: m.name, value: Math.round(totalOf(r, m.aggregation) ?? 0) });
        }
        return { kind: "funnel", steps, meta };
      }
      case "cohort_heatmap": {
        const profile = store.profiles[ctx.projectId];
        const weeks = Math.min(10, Math.max(4, Math.round(rangeDays(rangeKey) / 7)));
        meta.queries++;
        return { kind: "cohort", weeks, cohorts: generateCohorts(profile?.seed ?? 1, coverage.end, weeks), meta };
      }
      case "scatter": {
        const [mx, my] = ms;
        if (!my) return { kind: "error", message: "Scatter charts need two metrics (x and y)." };
        const [rx, ry] = await Promise.all([run(mx, { grain: "day" }), run(my, { grain: "day" })]);
        const yBy = new Map(ry.rows.map((r) => [r.period, r.value]));
        return {
          kind: "scatter",
          x: { name: mx.name, unit: mx.unit },
          y: { name: my.name, unit: my.unit },
          points: rx.rows.filter((r) => yBy.has(r.period)).map((r) => [r.value, yBy.get(r.period)!, r.period] as [number, number, string]),
          meta,
        };
      }
      case "distribution": {
        const m = ms[0];
        const r = await run(m, { grain: "day" });
        return { kind: "distribution", unit: m.unit, name: m.name, bins: histogram(r.rows.map((x) => x.value), 12), meta };
      }
      case "table": {
        const columns: { key: string; label: string; unit?: Metric["unit"] }[] = [{ key: "period", label: spec.grain === "day" ? "Date" : spec.grain === "week" ? "Week of" : "Month" }];
        if (groupBy) columns.push({ key: "group", label: DIMENSIONS[groupBy]?.label ?? groupBy });
        const rowsByKey = new Map<string, Record<string, string | number | null>>();
        for (const m of ms) {
          const useGroup = groupBy && m.dimensions.includes(groupBy) ? groupBy : undefined;
          const r = await run(m, { groupBy: useGroup });
          columns.push({ key: m.key, label: m.name, unit: m.unit });
          for (const row of r.rows) {
            const k = `${row.period}|${row.group ?? ""}`;
            const rec = rowsByKey.get(k) ?? { period: row.period, ...(groupBy ? { group: row.group ?? "all" } : {}) };
            rec[m.key] = row.value;
            rowsByKey.set(k, rec);
          }
        }
        const rows = [...rowsByKey.values()].sort((a, b) => String(b.period).localeCompare(String(a.period)));
        return { kind: "table", columns, rows: rows.slice(0, 200), meta };
      }
      case "bar": {
        if (groupBy) {
          // Categorical: total per group across the range.
          const m = ms[0];
          const r = await run(m, { grain: "month", groupBy });
          const categories = DIMENSIONS[groupBy].values.map((v) => v.key).filter((k) => r.rows.some((x) => x.group === k));
          const values = categories.map((cat) => {
            const rows = r.rows.filter((x) => x.group === cat);
            return totalOf({ ...r, rows }, m.aggregation) ?? 0;
          });
          return { kind: "category", unit: m.unit, categories, series: [{ name: m.name, values }], meta };
        }
        break;
      }
      case "stacked_bar": {
        const m = ms[0];
        if (!groupBy) break;
        const r = await run(m, { groupBy });
        const periods = [...new Set(r.rows.map((x) => x.period))];
        const groups = [...new Set(r.rows.map((x) => x.group ?? ""))];
        return {
          kind: "category",
          unit: m.unit,
          categories: periods,
          series: groups.map((g) => ({ name: g, values: periods.map((p) => r.rows.find((x) => x.period === p && x.group === g)?.value ?? 0) })),
          meta,
        };
      }
      default:
        break;
    }

    // Time series: timeseries, line, area, and ungrouped bar / stacked bar.
    const series = [];
    for (const m of ms) {
      if (groupBy && m.dimensions.includes(groupBy)) {
        const r = await run(m, { groupBy });
        for (const g of new Set(r.rows.map((x) => x.group ?? ""))) {
          series.push({ key: `${m.key}:${g}`, name: ms.length > 1 ? `${m.name} · ${g}` : g, unit: m.unit, points: r.rows.filter((x) => x.group === g).map((x) => ({ x: x.period, y: x.value })) });
        }
      } else {
        const r = await run(m);
        series.push({ key: m.key, name: m.name, unit: m.unit, points: r.rows.map((x) => ({ x: x.period, y: x.value })) });
      }
    }
    if (series.every((s) => s.points.length === 0)) return { kind: "empty", reason: "No rows for this range and filter combination.", meta };
    return { kind: "series", series, meta };
  } catch (e) {
    if (e instanceof ServiceError) return { kind: "error", message: e.message, meta };
    throw e;
  }
}

export async function resolveCharts(specs: ChartSpec[], ctx: ChartRequestContext) {
  const out: Record<string, ChartData> = {};
  await Promise.all(specs.map(async (s) => (out[s.id] = await resolveChartData(s, ctx))));
  return out;
}

/** Metadata about dimension filters available on a dashboard. */
export function filterableDimensions(projectId: string, specs: ChartSpec[]) {
  const store = getStore();
  const dims = new Set<string>();
  for (const s of specs)
    for (const k of s.metrics) store.metrics.find((m) => m.projectId === projectId && m.key === k)?.dimensions.forEach((d) => dims.add(d));
  return [...dims].map((d) => ({ key: d, label: DIMENSIONS[d]?.label ?? d, values: DIMENSIONS[d]?.values.map((v) => v.key) ?? [] }));
}
