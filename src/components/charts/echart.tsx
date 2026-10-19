"use client";

import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { BarChart, FunnelChart, HeatmapChart, LineChart, ScatterChart } from "echarts/charts";
import { AriaComponent, GridComponent, LegendComponent, TooltipComponent, VisualMapComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { LegacyGridContainLabel } from "echarts/features";
import type { EChartsOption } from "echarts";

// Register only the modules DataOrbyt uses (keeps the client bundle small).
// LegacyGridContainLabel keeps `grid.containLabel` working in ECharts 6 so axis labels are never clipped.
echarts.use([LegacyGridContainLabel, LineChart, BarChart, FunnelChart, HeatmapChart, ScatterChart, GridComponent, TooltipComponent, LegendComponent, VisualMapComponent, AriaComponent, CanvasRenderer]);

export function EChart({ option, height = 240, label }: { option: EChartsOption; height?: number; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const c = echarts.init(ref.current, undefined, { renderer: "canvas" });
    chart.current = c;
    const ro = new ResizeObserver(() => c.resize({ animation: { duration: reduce ? 0 : 150 } }));
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      c.dispose();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    chart.current?.setOption({ ...option, animation: !reduce && option.animation !== false }, { notMerge: true });
  }, [option]);

  return <div ref={ref} role="img" aria-label={label} style={{ height, width: "100%" }} />;
}
