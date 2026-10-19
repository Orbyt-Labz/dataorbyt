import { describe, expect, it } from "vitest";
import type { ChartData } from "@/lib/domain/chart-data";
import { formatValue, histogram, percentChange } from "@/lib/domain/chart-data";
import { buildOption, SERIES } from "./options";

const spec = { visualization: "line" as const, grain: "day" as const, title: "T" };

describe("buildOption", () => {
  it("builds a single-axis line chart and never a dual axis", () => {
    const data: ChartData = {
      kind: "series",
      series: [
        { key: "a", name: "Revenue", unit: "currency", points: [{ x: "2026-01-01", y: 10 }, { x: "2026-01-02", y: 12 }] },
        { key: "b", name: "Users", unit: "count", points: [{ x: "2026-01-01", y: 1000 }] },
      ],
    };
    const o = buildOption(spec, data)!;
    expect(Array.isArray(o.yAxis)).toBe(false);
    // Mixed-unit series are dropped rather than plotted on a second axis.
    expect((o.series as unknown[]).length).toBe(1);
  });

  it("assigns categorical colors in fixed order and caps at 8 series", () => {
    const series = Array.from({ length: 10 }, (_, i) => ({ key: `s${i}`, name: `S${i}`, unit: "count" as const, points: [{ x: "2026-01-01", y: i }] }));
    const o = buildOption(spec, { kind: "series", series })!;
    expect(o.color).toEqual(SERIES);
    expect((o.series as unknown[]).length).toBe(8);
  });

  it("returns null for kinds rendered as HTML", () => {
    expect(buildOption(spec, { kind: "empty", reason: "x" })).toBeNull();
    expect(buildOption({ ...spec, visualization: "kpi" }, { kind: "kpi", name: "x", unit: "count", value: 1, previous: 1, direction: "up", sparkline: [] })).toBeNull();
  });

  it("stacks stacked bars", () => {
    const o = buildOption({ ...spec, visualization: "stacked_bar" }, { kind: "category", unit: "count", categories: ["2026-01-05"], series: [{ name: "web", values: [1] }, { name: "ios", values: [2] }] })!;
    expect((o.series as { stack?: string }[]).every((s) => s.stack === "total")).toBe(true);
  });
});

describe("formatting helpers", () => {
  it("formats units", () => {
    expect(formatValue(0.1234, "percent")).toBe("12.3%");
    expect(formatValue(149123, "currency", "USD")).toBe("$149.1K");
    expect(formatValue(null, "count")).toBe("—");
  });
  it("computes percent change safely", () => {
    expect(percentChange(110, 100)).toBeCloseTo(0.1);
    expect(percentChange(1, 0)).toBeNull();
  });
  it("bins values", () => {
    const bins = histogram([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5);
    expect(bins).toHaveLength(5);
    expect(bins.reduce((a, b) => a + b.count, 0)).toBe(10);
  });
});
