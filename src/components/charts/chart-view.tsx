"use client";

import { useMemo, useState } from "react";
import { AlertCircle, ArrowDownRight, ArrowUpRight, Database, Minus, Table2 } from "lucide-react";
import type { ChartData } from "@/lib/domain/chart-data";
import { formatValue, percentChange, formatBytes } from "@/lib/domain/chart-data";
import type { ChartSpec } from "@/lib/domain/types";
import { buildOption, labelize, shortDate } from "@/lib/charts/options";
import { cx } from "@/lib/format";
import { EChart } from "./echart";

export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const w = 100;
  const h = 28;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - 2 - ((v - min) / (max - min || 1)) * (h - 4)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={cx("h-7 w-full", className)} aria-hidden>
      <polyline points={pts} fill="none" stroke="#2a78d6" strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

export function Delta({ current, previous, direction, unit }: { current: number | null; previous: number | null; direction: "up" | "down"; unit: string }) {
  const change = percentChange(current, previous);
  if (change === null) return <span className="text-[12px] text-faint">No prior period</span>;
  const flat = Math.abs(change) < 0.005;
  const good = flat ? null : (change > 0) === (direction === "up");
  const Icon = flat ? Minus : change > 0 ? ArrowUpRight : ArrowDownRight;
  const ptsDelta = current !== null && previous !== null ? (current - previous) * 100 : 0;
  const pts = unit === "percent" && current !== null && previous !== null ? ` (${ptsDelta >= 0 ? "+" : ""}${ptsDelta.toFixed(Math.abs(ptsDelta) < 0.1 ? 2 : 1)} pts)` : "";
  return (
    <span className={cx("inline-flex items-center gap-0.5 text-[12px] font-medium whitespace-nowrap tabular", good === null ? "text-muted" : good ? "text-ok" : "text-bad")}>
      <Icon aria-hidden className="size-3.5" />
      {(change >= 0 ? "+" : "") + (change * 100).toFixed(1)}%{pts}
      <span className="sr-only">{good === null ? "flat" : good ? "improving" : "worsening"} versus prior period</span>
    </span>
  );
}

function DataTable({ data, currency }: { data: Extract<ChartData, { kind: "table" }>; currency: string }) {
  return (
    <div className="max-h-[320px] overflow-auto">
      <table className="w-full text-[12.5px]">
        <thead className="sticky top-0 bg-surface">
          <tr className="border-b border-line">
            {data.columns.map((c) => (
              <th key={c.key} scope="col" className={cx("px-2 py-1.5 font-medium text-muted", c.unit ? "text-right" : "text-left")}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r, i) => (
            <tr key={i} className="border-b border-line/70 last:border-0 hover:bg-subtle/60">
              {data.columns.map((c) => (
                <td key={c.key} className={cx("px-2 py-1.5", c.unit ? "text-right tabular text-ink" : "text-ink-2")}>
                  {c.unit ? formatValue(r[c.key] as number | null, c.unit, currency, false) : c.key === "period" ? shortDate(String(r[c.key])) : labelize(String(r[c.key] ?? ""))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Flatten any chart data to a table (accessible alternative view). */
function asTable(data: ChartData): Extract<ChartData, { kind: "table" }> | null {
  switch (data.kind) {
    case "series": {
      const x = [...new Set(data.series.flatMap((s) => s.points.map((p) => p.x)))].sort().reverse();
      return {
        kind: "table",
        columns: [{ key: "period", label: "Date" }, ...data.series.map((s) => ({ key: s.key, label: s.name, unit: s.unit }))],
        rows: x.map((d) => Object.fromEntries([["period", d], ...data.series.map((s) => [s.key, s.points.find((p) => p.x === d)?.y ?? null])])),
      };
    }
    case "category":
      return {
        kind: "table",
        columns: [{ key: "cat", label: "Category" }, ...data.series.map((s) => ({ key: s.name, label: labelize(s.name), unit: data.unit }))],
        rows: data.categories.map((c, i) => Object.fromEntries([["cat", c], ...data.series.map((s) => [s.name, s.values[i]])])),
      };
    case "funnel":
      return { kind: "table", columns: [{ key: "step", label: "Step" }, { key: "value", label: "Users", unit: "count" }], rows: data.steps.map((s) => ({ step: s.name, value: s.value })) };
    case "distribution":
      return {
        kind: "table",
        columns: [{ key: "range", label: "Range" }, { key: "count", label: "Days", unit: "count" }],
        rows: data.bins.map((b) => ({ range: `${formatValue(b.from, data.unit)} – ${formatValue(b.to, data.unit)}`, count: b.count })),
      };
    case "scatter":
      return { kind: "table", columns: [{ key: "period", label: "Date" }, { key: "x", label: data.x.name, unit: data.x.unit }, { key: "y", label: data.y.name, unit: data.y.unit }], rows: data.points.map(([x, y, d]) => ({ period: d, x, y })) };
    case "cohort":
      return {
        kind: "table",
        columns: [{ key: "period", label: "Cohort" }, { key: "size", label: "Users", unit: "count" }, ...Array.from({ length: data.weeks }, (_, i) => ({ key: `w${i}`, label: `W${i}`, unit: "percent" as const }))],
        rows: data.cohorts.map((c) => Object.fromEntries([["period", c.cohort], ["size", c.size], ...c.retention.map((r, i) => [`w${i}`, r])])),
      };
    default:
      return null;
  }
}

export function ChartState({ kind, message }: { kind: "empty" | "error"; message: string }) {
  return (
    <div className={cx("flex h-full min-h-[140px] flex-col items-center justify-center gap-1.5 rounded-md px-4 text-center text-[12.5px]", kind === "error" ? "text-bad" : "text-muted")}>
      {kind === "error" ? <AlertCircle aria-hidden className="size-5" /> : <Database aria-hidden className="size-5 text-faint" />}
      <span>{message}</span>
    </div>
  );
}

export function ChartView({ spec, data, currency = "USD", height = 240, showTableToggle = true }: { spec: Pick<ChartSpec, "visualization" | "grain" | "title">; data: ChartData; currency?: string; height?: number; showTableToggle?: boolean }) {
  const [asTableView, setAsTableView] = useState(false);
  const option = useMemo(() => buildOption(spec, data, currency), [spec, data, currency]);

  if (data.kind === "error") return <ChartState kind="error" message={data.message} />;
  if (data.kind === "empty") return <ChartState kind="empty" message={data.reason} />;

  if (data.kind === "kpi") {
    return (
      <div className="flex h-full flex-col justify-between">
        <div className="text-[26px] leading-none font-semibold tracking-[-0.02em] text-ink">{formatValue(data.value, data.unit, currency)}</div>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <Delta current={data.value} previous={data.previous} direction={data.direction} unit={data.unit} />
          <span className="text-[11.5px] whitespace-nowrap text-faint">vs {formatValue(data.previous, data.unit, currency)} prior</span>
        </div>
        <Sparkline values={data.sparkline} className="mt-2" />
      </div>
    );
  }
  if (data.kind === "table") return <DataTable data={data} currency={currency} />;

  const table = asTable(data);
  return (
    <div>
      {showTableToggle && table && (
        <div className="-mt-1 mb-1 flex justify-end">
          <button type="button" onClick={() => setAsTableView((v) => !v)} aria-pressed={asTableView} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11.5px] text-muted hover:bg-hover hover:text-ink-2">
            <Table2 aria-hidden className="size-3" />
            {asTableView ? "Show chart" : "View as table"}
          </button>
        </div>
      )}
      {asTableView && table ? <DataTable data={table} currency={currency} /> : option ? <EChart option={option} height={height} label={`${spec.title}: ${spec.visualization.replace("_", " ")} chart`} /> : null}
    </div>
  );
}

export function ChartMetaLine({ data }: { data: ChartData }) {
  const m = data.meta;
  if (!m) return null;
  return (
    <span className="text-[11px] text-faint">
      {m.cacheHits === m.queries && m.queries > 0 ? "Cached" : `${m.queries - m.cacheHits} quer${m.queries - m.cacheHits === 1 ? "y" : "ies"} · ${formatBytes(m.scanBytes)}`}
      {m.stale && <span className="ml-1 text-warn">· stale source</span>}
    </span>
  );
}
