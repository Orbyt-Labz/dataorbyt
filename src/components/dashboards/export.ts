import type { ChartData } from "@/lib/domain/chart-data";
import type { ChartSpec } from "@/lib/domain/types";

/** Flatten resolved chart data to rows for CSV export. */
export function chartRows(data: ChartData): (string | number | null)[][] {
  switch (data.kind) {
    case "kpi":
      return [["metric", "value", "previous"], [data.name, data.value, data.previous]];
    case "series": {
      const x = [...new Set(data.series.flatMap((s) => s.points.map((p) => p.x)))].sort();
      return [["period", ...data.series.map((s) => s.name)], ...x.map((d) => [d, ...data.series.map((s) => s.points.find((p) => p.x === d)?.y ?? null)])];
    }
    case "category":
      return [["category", ...data.series.map((s) => s.name)], ...data.categories.map((c, i) => [c, ...data.series.map((s) => s.values[i])])];
    case "funnel":
      return [["step", "value"], ...data.steps.map((s) => [s.name, s.value])];
    case "cohort":
      return [["cohort", "size", ...Array.from({ length: data.weeks }, (_, i) => `week_${i}`)], ...data.cohorts.map((c) => [c.cohort, c.size, ...c.retention])];
    case "table":
      return [data.columns.map((c) => c.label), ...data.rows.map((r) => data.columns.map((c) => r[c.key] ?? null))];
    case "scatter":
      return [["date", data.x.name, data.y.name], ...data.points.map(([x, y, d]) => [d, x, y])];
    case "distribution":
      return [["from", "to", "days"], ...data.bins.map((b) => [b.from, b.to, b.count])];
    default:
      return [];
  }
}

function csvCell(v: string | number | null) {
  if (v === null || v === undefined) return "";
  const s = String(v);
  // Guard against CSV formula injection when opened in spreadsheets.
  const safe = /^[=+\-@\t\r]/.test(s) && typeof v === "string" ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function dashboardCsv(charts: ChartSpec[], data: Record<string, ChartData>) {
  const out: string[] = [];
  for (const c of charts) {
    const rows = chartRows(data[c.id] ?? { kind: "empty", reason: "" });
    out.push(`# ${c.title} (${c.visualization})`);
    for (const r of rows) out.push(r.map(csvCell).join(","));
    out.push("");
  }
  return out.join("\n");
}

export function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
