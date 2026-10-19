"use client";

import type { ReactNode } from "react";
import { Info } from "lucide-react";
import type { ChartData } from "@/lib/domain/chart-data";
import type { ChartSpec, ChartSize } from "@/lib/domain/types";
import { cx } from "@/lib/format";
import { ChartMetaLine, ChartView } from "./chart-view";

export const SIZE_CLASS: Record<ChartSize, string> = {
  sm: "col-span-12 sm:col-span-6 xl:col-span-3",
  md: "col-span-12 lg:col-span-4",
  lg: "col-span-12 lg:col-span-8",
  full: "col-span-12",
};

export function ChartCard({
  spec,
  data,
  currency,
  definition,
  actions,
  selected,
  onSelect,
}: {
  spec: ChartSpec;
  data: ChartData | undefined;
  currency: string;
  definition?: string;
  actions?: ReactNode;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const isKpi = spec.visualization === "kpi";
  const height = spec.size === "full" || spec.size === "lg" ? 260 : 230;
  return (
    <article
      aria-label={spec.title}
      onClick={onSelect}
      className={cx(
        SIZE_CLASS[spec.size],
        "flex min-w-0 flex-col rounded-lg border bg-surface shadow-card transition-shadow",
        selected ? "border-accent ring-2 ring-accent/20" : "border-line",
        onSelect && "cursor-pointer hover:border-line-strong",
      )}
    >
      <header className="flex items-start justify-between gap-2 px-4 pt-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-1.5 truncate text-[13px] font-medium text-ink-2">
            {spec.title}
            {definition && (
              <span title={definition} className="text-faint" aria-label={`Definition: ${definition}`}>
                <Info className="size-3.5" aria-hidden />
              </span>
            )}
          </h3>
          {!isKpi && data && <ChartMetaLine data={data} />}
        </div>
        {actions}
      </header>
      <div className={cx("flex-1 px-4 pb-3", isKpi ? "pt-2" : "pt-1")}>
        {data ? <ChartView spec={spec} data={data} currency={currency} height={height} /> : <div className="skeleton" style={{ height: isKpi ? 86 : height }} />}
      </div>
    </article>
  );
}

export function ChartGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-flow-row-dense grid-cols-12 gap-3">{children}</div>;
}
