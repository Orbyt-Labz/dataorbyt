import type { ISODate, MetricUnit } from "./types";

export interface SeriesData {
  key: string;
  name: string;
  unit: MetricUnit;
  points: { x: ISODate; y: number }[];
}

export interface ChartMeta {
  queries: number;
  cacheHits: number;
  scanBytes: number;
  warnings: string[];
  dataThrough?: string;
  loadedAt?: string;
  stale: boolean;
  demo: boolean;
}

export type ChartData = (
  | { kind: "series"; series: SeriesData[] }
  | { kind: "category"; unit: MetricUnit; categories: string[]; series: { name: string; values: number[] }[] }
  | {
      kind: "kpi";
      name: string;
      unit: MetricUnit;
      value: number | null;
      previous: number | null;
      direction: "up" | "down";
      sparkline: number[];
    }
  | { kind: "funnel"; steps: { key: string; name: string; value: number }[] }
  | { kind: "cohort"; weeks: number; cohorts: { cohort: ISODate; size: number; retention: (number | null)[] }[] }
  | { kind: "table"; columns: { key: string; label: string; unit?: MetricUnit }[]; rows: Record<string, string | number | null>[] }
  | { kind: "scatter"; x: { name: string; unit: MetricUnit }; y: { name: string; unit: MetricUnit }; points: [number, number, string][] }
  | { kind: "distribution"; unit: MetricUnit; name: string; bins: { from: number; to: number; count: number }[] }
  | { kind: "empty"; reason: string }
  | { kind: "error"; message: string }
) & { meta?: ChartMeta };

export function formatValue(v: number | null | undefined, unit: MetricUnit, currency = "USD", compact = true): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  if (unit === "percent") {
    const pct = v * 100;
    return `${pct < 1 && pct > 0 ? pct.toFixed(2) : pct.toFixed(1)}%`;
  }
  if (unit === "currency") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      notation: compact && Math.abs(v) >= 10_000 ? "compact" : "standard",
      maximumFractionDigits: compact && Math.abs(v) >= 10_000 ? 1 : 0,
    }).format(v);
  }
  // Counts are whole things: round them (averaged gauges like WAU can be fractional).
  const big = compact && Math.abs(v) >= 10_000;
  return new Intl.NumberFormat("en-US", { notation: big ? "compact" : "standard", maximumFractionDigits: big ? 1 : Math.abs(v) < 10 && !Number.isInteger(v) ? 1 : 0 }).format(v);
}

export function percentChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}

export function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
}

export function histogram(values: number[], binCount = 12) {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return [{ from: min, to: max, count: values.length }];
  const width = (max - min) / binCount;
  const bins = Array.from({ length: binCount }, (_, i) => ({ from: min + i * width, to: min + (i + 1) * width, count: 0 }));
  for (const v of values) {
    const idx = Math.min(binCount - 1, Math.floor((v - min) / width));
    bins[idx].count++;
  }
  return bins;
}
