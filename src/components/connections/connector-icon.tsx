import { cx } from "@/lib/format";

/** Neutral monogram tiles — we deliberately don't reproduce vendor logos. */
const TINT: Record<string, string> = {
  bigquery: "bg-[#e9f1fc] text-[#255fb0]",
  snowflake: "bg-[#e6f6fb] text-[#0f6f8a]",
  redshift: "bg-[#fdecea] text-[#9a2a20]",
  postgres: "bg-[#eaeefa] text-[#33508f]",
  mysql: "bg-[#eaf3f6] text-[#20607a]",
  posthog: "bg-[#fdf3e2] text-[#8a4a05]",
  mixpanel: "bg-[#efedfd] text-[#4f3fc0]",
  amplitude: "bg-[#e9f1fc] text-[#2a4fa0]",
  stripe: "bg-[#eef0ff] text-[#4b46e0]",
  chargebee: "bg-[#fdf0e8] text-[#9a4512]",
  hubspot: "bg-[#fdeee8] text-[#a1401c]",
  salesforce: "bg-[#e7f3fb] text-[#11618f]",
  segment: "bg-[#e7f5ee] text-[#0f7a52]",
  rudderstack: "bg-[#f1f3f6] text-[#2f3a4d]",
  csv: "bg-[#f1f3f6] text-[#2f3a4d]",
};

export function ConnectorIcon({ id, className }: { id: string; className?: string }) {
  const label = id === "csv" ? "CSV" : id.slice(0, 2).replace(/^./, (c) => c.toUpperCase());
  return (
    <span aria-hidden className={cx("inline-flex size-8 shrink-0 items-center justify-center rounded-md text-[11.5px] font-bold", TINT[id] ?? "bg-subtle text-ink-2", className)}>
      {label}
    </span>
  );
}
