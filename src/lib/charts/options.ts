import type { EChartsOption } from "echarts";
import type { ChartData } from "@/lib/domain/chart-data";
import { formatValue } from "@/lib/domain/chart-data";
import type { ChartSpec, MetricUnit } from "@/lib/domain/types";

/**
 * Categorical palette (validated reference order, light mode). Slots are
 * assigned in fixed order and never cycled — a 9th series folds into "Other".
 */
export const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
/** Sequential blue ramp, light → dark (heatmaps). */
export const SEQUENTIAL = ["#eef4fd", "#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"];
/** Ordinal steps for funnel stages (never lighter than step 250 on light). */
export const ORDINAL = ["#0d366b", "#184f95", "#256abf", "#3987e5", "#5598e7", "#6da7ec", "#86b6ef"];

const INK = "#0e1626";
const INK2 = "#2f3a4d";
const MUTED = "#5f6b7d";
const GRID = "#eceef2";
const AXIS = "#cfd4dc";
const SURFACE = "#ffffff";

const textStyle = { fontFamily: "var(--font-geist-sans), system-ui, sans-serif", color: INK2 };

export function shortDate(iso: string, grain: ChartSpec["grain"] = "day") {
  const d = new Date(`${iso}T00:00:00Z`);
  if (grain === "month") return d.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function axisFmt(unit: MetricUnit, currency: string) {
  return (v: number) => formatValue(v, unit, currency, true);
}

const tooltipBase = {
  backgroundColor: SURFACE,
  borderColor: "#e3e6eb",
  borderWidth: 1,
  padding: [8, 10] as [number, number],
  textStyle: { color: INK, fontSize: 12 },
  extraCssText: "box-shadow: 0 8px 24px -6px rgba(14,22,38,.18); border-radius: 8px;",
};

const baseGrid = { left: 8, right: 16, top: 16, bottom: 8, containLabel: true };

function valueAxis(unit: MetricUnit, currency: string) {
  return {
    type: "value" as const,
    splitNumber: 4,
    axisLabel: { color: MUTED, fontSize: 11, formatter: axisFmt(unit, currency) },
    splitLine: { lineStyle: { color: GRID } },
    axisLine: { show: false },
    axisTick: { show: false },
  };
}

function categoryAxis(data: string[], formatter?: (v: string) => string) {
  return {
    type: "category" as const,
    data,
    boundaryGap: true,
    axisLabel: { color: MUTED, fontSize: 11, hideOverlap: true, formatter },
    axisLine: { lineStyle: { color: AXIS } },
    axisTick: { show: false },
  };
}

function legend(names: string[]) {
  return names.length >= 2
    ? { show: true, top: 0, left: 0, icon: "roundRect", itemWidth: 10, itemHeight: 10, itemGap: 14, textStyle: { color: INK2, fontSize: 12 }, data: names.slice(0, 8) }
    : { show: false };
}

/** Pure translation of a chart spec + resolved data into an ECharts option. */
export function buildOption(spec: Pick<ChartSpec, "visualization" | "grain" | "title">, data: ChartData, currency = "USD"): EChartsOption | null {
  const aria = { enabled: true, label: { description: `${spec.title} chart` } };
  switch (data.kind) {
    case "series": {
      // Units must match to share an axis; never dual-axis. Mixed units → first unit only.
      const unit = data.series[0]?.unit ?? "count";
      const sameUnit = data.series.filter((s) => s.unit === unit).slice(0, 8);
      const x = [...new Set(sameUnit.flatMap((s) => s.points.map((p) => p.x)))].sort();
      const isBar = spec.visualization === "bar" || spec.visualization === "stacked_bar";
      const isArea = spec.visualization === "area";
      const names = sameUnit.map((s) => s.name);
      return {
        aria,
        textStyle,
        animationDuration: 350,
        color: SERIES,
        grid: { ...baseGrid, top: names.length >= 2 ? 32 : 12 },
        legend: legend(names),
        tooltip: {
          ...tooltipBase,
          trigger: "axis",
          axisPointer: { type: isBar ? "shadow" : "line", lineStyle: { color: AXIS }, shadowStyle: { color: "rgba(14,22,38,0.04)" } },
          valueFormatter: (v) => formatValue(Number(v), unit, currency, false),
        },
        xAxis: categoryAxis(x, (v) => shortDate(v, spec.grain)),
        yAxis: valueAxis(unit, currency),
        series: sameUnit.map((s) => {
          const byX = new Map(s.points.map((p) => [p.x, p.y]));
          const values = x.map((d) => byX.get(d) ?? null);
          return isBar
            ? {
                type: "bar" as const,
                name: s.name,
                data: values,
                stack: spec.visualization === "stacked_bar" ? "total" : undefined,
                barMaxWidth: 22,
                itemStyle: { borderRadius: spec.visualization === "stacked_bar" ? 0 : [4, 4, 0, 0], borderColor: SURFACE, borderWidth: spec.visualization === "stacked_bar" ? 1 : 0 },
              }
            : {
                type: "line" as const,
                name: s.name,
                data: values,
                showSymbol: false,
                symbolSize: 8,
                smooth: 0.15,
                lineStyle: { width: 2 },
                emphasis: { focus: "series" as const },
                areaStyle: isArea ? { opacity: 0.12 } : undefined,
              };
        }),
      };
    }
    case "category": {
      const stacked = spec.visualization === "stacked_bar";
      const series = data.series.slice(0, 8);
      const categories = stacked ? data.categories.map((c) => shortDate(c, spec.grain)) : data.categories.map(labelize);
      return {
        aria,
        textStyle,
        animationDuration: 350,
        color: SERIES,
        grid: { ...baseGrid, top: series.length >= 2 ? 32 : 12 },
        legend: legend(series.map((s) => labelize(s.name))),
        tooltip: { ...tooltipBase, trigger: "axis", axisPointer: { type: "shadow", shadowStyle: { color: "rgba(14,22,38,0.04)" } }, valueFormatter: (v) => formatValue(Number(v), data.unit, currency, false) },
        xAxis: stacked ? categoryAxis(categories) : { ...categoryAxis(categories), axisLabel: { color: MUTED, fontSize: 11, interval: 0, width: 64, overflow: "truncate" as const } },
        yAxis: valueAxis(data.unit, currency),
        series: series.map((s, i) => ({
          type: "bar" as const,
          name: labelize(s.name),
          data: s.values,
          stack: stacked ? "total" : undefined,
          barMaxWidth: stacked ? 28 : 40,
          barCategoryGap: "35%",
          itemStyle: {
            borderRadius: stacked ? (i === series.length - 1 ? [4, 4, 0, 0] : 0) : [4, 4, 0, 0],
            borderColor: SURFACE,
            borderWidth: stacked ? 1 : 0,
          },
          label: !stacked && s.values.length <= 6 ? { show: true, position: "top" as const, color: INK2, fontSize: 11, formatter: (p: { value: unknown }) => formatValue(Number(p.value), data.unit, currency) } : undefined,
        })),
      };
    }
    case "funnel": {
      // Horizontal ordinal bars read better than a trapezoid when steps differ by orders of magnitude.
      const top = data.steps[0]?.value || 1;
      const names = data.steps.map((s) => s.name);
      return {
        aria,
        textStyle,
        animationDuration: 350,
        grid: { left: 4, right: 16, top: 4, bottom: 4, containLabel: true },
        tooltip: {
          ...tooltipBase,
          trigger: "item",
          formatter: (p: unknown) => {
            const { dataIndex } = p as { dataIndex: number };
            const step = data.steps[dataIndex];
            const prev = dataIndex > 0 ? data.steps[dataIndex - 1].value : null;
            return `<b>${step.name}</b><br/>${step.value.toLocaleString()} · ${((step.value / top) * 100).toFixed(1)}% of top${prev ? `<br/>${((step.value / prev) * 100).toFixed(1)}% from previous step` : ""}`;
          },
        },
        xAxis: { type: "value", show: false, max: top * 1.0 },
        yAxis: { type: "category", inverse: true, data: names, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: INK2, fontSize: 11.5, width: 96, overflow: "truncate" } },
        series: [
          {
            type: "bar",
            barCategoryGap: "28%",
            showBackground: true,
            backgroundStyle: { color: "#f1f3f6", borderRadius: 4 },
            data: data.steps.map((s, i) => ({ value: s.value, itemStyle: { color: ORDINAL[Math.min(i, ORDINAL.length - 1)], borderRadius: 4 } })),
            label: {
              show: true,
              position: "insideLeft",
              distance: 6,
              color: INK,
              fontSize: 11.5,
              formatter: (p: { dataIndex: number; value: unknown }) => {
                const prev = p.dataIndex > 0 ? data.steps[p.dataIndex - 1].value : null;
                return `${Number(p.value).toLocaleString()}${prev ? `  ·  ${((Number(p.value) / prev) * 100).toFixed(1)}% step` : ""}`;
              },
              // Keep the label legible on top of the light track rather than inside dark bars.
              backgroundColor: "rgba(255,255,255,0.85)",
              padding: [2, 4],
              borderRadius: 3,
            },
          },
        ],
      };
    }
    case "cohort": {
      const cells: [number, number, number][] = [];
      data.cohorts.forEach((c, y) =>
        c.retention.forEach((r, x) => {
          if (r !== null) cells.push([x, y, Math.round(r * 1000) / 10]);
        }),
      );
      return {
        aria,
        textStyle,
        animationDuration: 250,
        grid: { left: 8, right: 8, top: 8, bottom: 8, containLabel: true },
        tooltip: {
          ...tooltipBase,
          formatter: (p: unknown) => {
            const [x, y, v] = (p as { value: [number, number, number] }).value;
            const c = data.cohorts[y];
            return `<b>Cohort ${shortDate(c.cohort)}</b> (${c.size} users)<br/>Week ${x}: ${v.toFixed(1)}% retained`;
          },
        },
        xAxis: { type: "category", data: Array.from({ length: data.weeks }, (_, i) => `W${i}`), splitArea: { show: false }, axisLabel: { color: MUTED, fontSize: 11 }, axisLine: { show: false }, axisTick: { show: false }, position: "top" },
        yAxis: { type: "category", inverse: true, data: data.cohorts.map((c) => shortDate(c.cohort)), axisLabel: { color: MUTED, fontSize: 11 }, axisLine: { show: false }, axisTick: { show: false } },
        visualMap: { show: false, min: 0, max: 100, inRange: { color: SEQUENTIAL } },
        series: [
          {
            type: "heatmap",
            data: cells,
            label: { show: true, fontSize: 10.5, formatter: (p: { value: unknown }) => `${(p.value as number[])[2].toFixed(0)}%`, color: INK },
            itemStyle: { borderColor: SURFACE, borderWidth: 2, borderRadius: 3 },
            emphasis: { itemStyle: { borderColor: INK, borderWidth: 1 } },
          },
        ],
      };
    }
    case "scatter":
      return {
        aria,
        textStyle,
        animationDuration: 300,
        color: SERIES,
        grid: { ...baseGrid, left: 16, bottom: 24, top: 16 },
        tooltip: {
          ...tooltipBase,
          trigger: "item",
          formatter: (p: unknown) => {
            const [x, y, d] = (p as { value: [number, number, string] }).value;
            return `<b>${shortDate(d)}</b><br/>${data.x.name}: ${formatValue(x, data.x.unit, currency, false)}<br/>${data.y.name}: ${formatValue(y, data.y.unit, currency, false)}`;
          },
        },
        xAxis: { ...valueAxis(data.x.unit, currency), scale: true, name: data.x.name, nameLocation: "middle", nameGap: 26, nameTextStyle: { color: MUTED, fontSize: 11 } },
        yAxis: { ...valueAxis(data.y.unit, currency), scale: true },
        series: [{ type: "scatter", data: data.points, symbolSize: 8, itemStyle: { opacity: 0.85, borderColor: SURFACE, borderWidth: 1 } }],
      };
    case "distribution":
      return {
        aria,
        textStyle,
        animationDuration: 300,
        color: SERIES,
        grid: { ...baseGrid, bottom: 24 },
        tooltip: {
          ...tooltipBase,
          trigger: "axis",
          axisPointer: { type: "shadow", shadowStyle: { color: "rgba(14,22,38,0.04)" } },
          formatter: (p: unknown) => {
            const i = (p as { dataIndex: number }[])[0].dataIndex;
            const b = data.bins[i];
            return `${formatValue(b.from, data.unit, currency, false)} – ${formatValue(b.to, data.unit, currency, false)}<br/><b>${b.count}</b> day(s)`;
          },
        },
        xAxis: { ...categoryAxis(data.bins.map((b) => formatValue(b.from, data.unit, currency))), name: `Daily ${data.name.toLowerCase()}`, nameLocation: "middle", nameGap: 26, nameTextStyle: { color: MUTED, fontSize: 11 } },
        yAxis: { ...valueAxis("count", currency), minInterval: 1 },
        series: [{ type: "bar", data: data.bins.map((b) => b.count), barCategoryGap: "8%", itemStyle: { borderRadius: [3, 3, 0, 0] } }],
      };
    default:
      return null;
  }
}

export function labelize(s: string) {
  if (!s) return "All";
  if (s.length <= 3 && s === s.toUpperCase()) return s;
  return s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}
