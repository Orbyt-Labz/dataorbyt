import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { ArrowRight, Database, FlaskConical, LayoutDashboard, Siren, Sigma, Boxes } from "lucide-react";
import { getAppContext } from "@/lib/server/session";
import { getMetric, metricLineage, describeAggregation } from "@/lib/services/metrics";
import { getWarehouse, queryMetric, type MetricQueryResult } from "@/lib/services/query";
import { ServiceError } from "@/lib/services/context";
import { DIMENSIONS } from "@/lib/demo/facts";
import { isDateRangeKey, DEFAULT_RANGE, resolveRange } from "@/lib/domain/dates";
import type { ChartData } from "@/lib/domain/chart-data";
import { formatBytes } from "@/lib/domain/chart-data";
import type { ChartSpec } from "@/lib/domain/types";
import { Badge, Callout, Card, CardHeader, Code, DemoBadge, KeyValue, PageHeader, PageSkeleton, StatusBadge } from "@/components/ui";
import { DateRangeSelect } from "@/components/date-range-select";
import { ChartView } from "@/components/charts/chart-view";
import { cx, formatDate, relativeTime } from "@/lib/format";

export default function MetricDetailPage(props: PageProps<"/metrics/[key]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <MetricDetail params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

function LineageColumn({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div className="min-w-[150px] flex-1">
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-muted uppercase">
        {icon}
        {title}
      </div>
      <ul className="space-y-1.5">{children}</ul>
    </div>
  );
}

function Node({ children, href, tone = "neutral" }: { children: ReactNode; href?: string; tone?: "neutral" | "accent" | "bad" }) {
  const cls = cx(
    "block truncate rounded-md border px-2 py-1.5 text-[12px]",
    tone === "accent" ? "border-accent bg-accent-soft font-semibold text-accent" : tone === "bad" ? "border-[#f6cbc6] bg-bad-soft text-bad" : "border-line bg-surface text-ink-2",
    href && "hover:border-accent-line",
  );
  return <li>{href ? <Link href={href} className={cls}>{children}</Link> : <span className={cls}>{children}</span>}</li>;
}

function Arrow() {
  return (
    <div aria-hidden className="hidden items-center self-center text-faint lg:flex">
      <ArrowRight className="size-4" />
    </div>
  );
}

async function MetricDetail({ params, searchParams }: { params: PageProps<"/metrics/[key]">["params"]; searchParams: PageProps<"/metrics/[key]">["searchParams"] }) {
  const { actor, project, store } = await getAppContext();
  const { key } = await params;
  const sp = await searchParams;
  if (!project) notFound();
  let metric;
  try {
    metric = getMetric(actor, project.id, key);
  } catch (e) {
    if (e instanceof ServiceError) notFound();
    throw e;
  }
  const lineage = metricLineage(project.id, metric);
  const dbtModels = store.dbt[project.id]?.models ?? [];
  const upstream = lineage.intermediate.map((n) => dbtModels.find((m) => m.name === n)).filter(Boolean);
  const range = isDateRangeKey(sp.range) ? sp.range : DEFAULT_RANGE;
  const by = typeof sp.by === "string" && metric.dimensions.includes(sp.by) ? sp.by : undefined;
  const coverage = getWarehouse().coverage(project.id);

  let result: MetricQueryResult | null = null;
  let error: string | null = null;
  const queryable = metric.status !== "requested";
  if (coverage && queryable) {
    const r = resolveRange(coverage.end, range);
    try {
      result = await queryMetric(
        { projectId: project.id, metricKey: metric.key, start: r.start, end: r.end, grain: metric.defaultGrain, groupBy: by },
        { actor, source: "ui", allowDraft: true },
      );
    } catch (e) {
      error = e instanceof ServiceError ? e.message : "Query failed";
    }
  }

  // Only additive metrics can be stacked; ratios and gauges get one line per group.
  const stack = !!by && metric.aggregation.type === "sum";
  const spec: ChartSpec = { id: "preview", title: metric.name, visualization: stack ? "stacked_bar" : "line", metrics: [metric.key], groupBy: by, grain: metric.defaultGrain, dateRange: "inherit", filters: [], size: "full" };
  let data: ChartData | null = null;
  if (result) {
    if (stack) {
      const periods = [...new Set(result.rows.map((r) => r.period))];
      const groups = [...new Set(result.rows.map((r) => r.group ?? ""))];
      data = {
        kind: "category",
        unit: metric.unit,
        categories: periods,
        series: groups.map((g) => ({ name: g, values: periods.map((p) => result!.rows.find((x) => x.period === p && x.group === g)?.value ?? 0) })),
      };
    } else {
      const groups = [...new Set(result.rows.map((r) => r.group))];
      data = result.rows.length
        ? {
            kind: "series",
            series: groups.map((g) => ({
              key: `${metric.key}:${g ?? "all"}`,
              name: g ? g.replace(/_/g, " ") : metric.name,
              unit: metric.unit,
              points: result!.rows.filter((r) => r.group === g).map((r) => ({ x: r.period, y: r.value })),
            })),
          }
        : { kind: "empty", reason: "No rows for this range." };
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={
          <span className="flex items-center gap-2">
            <Link href="/metrics" className="hover:text-ink">
              Metrics
            </Link>
            {project.sampleData && <DemoBadge />}
          </span>
        }
        title={
          <span className="flex flex-wrap items-center gap-3">
            {metric.name} <StatusBadge status={metric.status} />
          </span>
        }
        description={metric.description}
      />
      {metric.status === "draft" && <Callout tone="warn" title="Draft metric">Previewable here only. Dashboards, alerts and MCP clients can&apos;t query it until it&apos;s approved.</Callout>}
      {metric.status === "requested" && <Callout tone="info" title="Awaiting review">This requested metric isn&apos;t executable until a reviewer approves it on the Metrics page.</Callout>}
      {metric.status === "deprecated" && <Callout tone="warn" title="Deprecated">Existing charts keep working with a warning. Prefer an approved replacement for new work.</Callout>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title="Definition" />
          <div className="space-y-3 px-4 pb-4">
            <code className="block rounded-md bg-subtle px-2.5 py-2 font-mono text-[12px] text-ink-2">{metric.formula}</code>
            <KeyValue
              items={[
                { label: "Key", value: <span className="font-mono text-[12px]">{metric.key}</span> },
                { label: "Aggregation", value: <span className="font-mono text-[12px]">{describeAggregation(metric.aggregation)}</span> },
                { label: "Unit", value: metric.unit },
                { label: "Default grain", value: metric.defaultGrain },
                { label: "Direction", value: metric.direction === "up" ? "Higher is better" : "Lower is better" },
                { label: "Domain", value: <span className="capitalize">{metric.domain}</span> },
                { label: "Owner", value: metric.owner },
                { label: "Source model", value: <Link className="font-mono text-[12px] text-accent hover:underline" href={`/dbt/models/${metric.sourceModel}`}>{metric.sourceModel}</Link> },
                { label: "Freshness", value: coverage ? `${relativeTime(coverage.loadedAt)} · through ${formatDate(coverage.end)}` : "no data" },
                { label: "Updated", value: relativeTime(metric.updatedAt) },
                {
                  label: "Dimensions",
                  value: (
                    <span className="flex flex-wrap gap-1">
                      {metric.dimensions.map((d) => (
                        <Badge key={d}>{DIMENSIONS[d]?.label ?? d}</Badge>
                      ))}
                    </span>
                  ),
                },
              ]}
            />
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title="Governed query preview"
            description="Compiled by MetricQueryService from the catalog definition — not free-form SQL."
            actions={coverage && queryable ? <DateRangeSelect value={range} /> : undefined}
          />
          <div className="px-4 pb-4">
            {!coverage ? (
              <p className="py-8 text-center text-[13px] text-muted">No data connected for this project.</p>
            ) : !queryable ? (
              <p className="py-8 text-center text-[13px] text-muted">Preview unavailable until the metric is approved.</p>
            ) : error ? (
              <Callout tone="bad" title="Query rejected">{error}</Callout>
            ) : (
              <>
                {metric.dimensions.length > 0 && (
                  <nav aria-label="Group by" className="mb-2 flex flex-wrap items-center gap-1 text-[12px]">
                    <span className="mr-1 text-muted">Group by</span>
                    {[undefined, ...metric.dimensions].map((d) => (
                      <Link
                        key={d ?? "none"}
                        href={`?${new URLSearchParams({ range, ...(d ? { by: d } : {}) })}`}
                        aria-current={by === d ? "true" : undefined}
                        scroll={false}
                        className={cx("rounded-full border px-2 py-0.5", by === d ? "border-accent bg-accent-soft text-accent" : "border-line text-ink-2 hover:bg-hover")}
                      >
                        {d ? (DIMENSIONS[d]?.label ?? d) : "None"}
                      </Link>
                    ))}
                  </nav>
                )}
                {data && <ChartView spec={spec} data={data} currency={project.currency} height={240} />}
                {result && (
                  <>
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted">
                      <span>{result.meta.cacheHit ? `Cache hit (stored ${relativeTime(result.meta.cachedAt)})` : "Fresh query"}</span>
                      <span>Scanned {formatBytes(result.meta.scanBytes)} (est. {formatBytes(result.meta.estimatedScanBytes)})</span>
                      <span>{result.rows.length} rows</span>
                      <span>{result.meta.durationMs} ms</span>
                      {result.meta.demo && <span className="text-warn">Demo warehouse adapter</span>}
                    </div>
                    {result.meta.warnings.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {result.meta.warnings.map((w) => (
                          <li key={w} className="text-[12px] text-warn">
                            ⚠ {w}
                          </li>
                        ))}
                      </ul>
                    )}
                    <details className="mt-3">
                      <summary className="cursor-pointer text-[12.5px] font-medium text-ink-2">Compiled SQL &amp; parameters</summary>
                      <Code className="mt-2">{result.plan.sql}</Code>
                      <Code className="mt-2">{JSON.stringify(result.plan.params, null, 2)}</Code>
                    </details>
                  </>
                )}
              </>
            )}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Lineage" description="Source table → dbt models → metric → where it's used" />
        <div className="flex flex-col gap-4 overflow-x-auto px-4 pb-4 lg:flex-row lg:gap-3" role="list" aria-label="Lineage, left to right">
          <LineageColumn title="Source tables" icon={<Database aria-hidden className="size-3" />}>
            {lineage.sources.map((s) => (
              <Node key={s}>{s}</Node>
            ))}
          </LineageColumn>
          <Arrow />
          <LineageColumn title="Staging & intermediate" icon={<Boxes aria-hidden className="size-3" />}>
            {upstream.length === 0 && <Node>—</Node>}
            {upstream.map((m) => (
              <Node key={m!.name} href={`/dbt/models/${m!.name}`} tone={m!.tests.some((t) => t.status === "fail") ? "bad" : "neutral"}>
                {m!.name}
              </Node>
            ))}
          </LineageColumn>
          <Arrow />
          <LineageColumn title="dbt model" icon={<Boxes aria-hidden className="size-3" />}>
            <Node href={`/dbt/models/${lineage.model.name}`}>{lineage.model.name}</Node>
          </LineageColumn>
          <Arrow />
          <LineageColumn title="Metric" icon={<Sigma aria-hidden className="size-3" />}>
            <Node tone="accent">{metric.name}</Node>
          </LineageColumn>
          <Arrow />
          <LineageColumn title="Used by" icon={<LayoutDashboard aria-hidden className="size-3" />}>
            {lineage.dashboards.length + lineage.alerts.length + lineage.experiments.length === 0 && <Node>Not used yet</Node>}
            {lineage.dashboards.map((d) => (
              <Node key={d.id} href={`/dashboards/${d.id}`}>
                <LayoutDashboard aria-hidden className="mr-1 inline size-3" />
                {d.name}
              </Node>
            ))}
            {lineage.alerts.map((a) => (
              <Node key={a.id} href={`/alerts?alert=${a.id}`}>
                <Siren aria-hidden className="mr-1 inline size-3" />
                {a.name}
              </Node>
            ))}
            {lineage.experiments.map((e) => (
              <Node key={e.id} href={`/experiments/${e.id}`}>
                <FlaskConical aria-hidden className="mr-1 inline size-3" />
                {e.name}
              </Node>
            ))}
          </LineageColumn>
        </div>
      </Card>
    </div>
  );
}
