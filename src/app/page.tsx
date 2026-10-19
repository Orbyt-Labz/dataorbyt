import Link from "next/link";
import { Suspense } from "react";
import { Activity, ArrowRight, Cable, Check, Clock, LayoutDashboard, Plus, Share2, Siren } from "lucide-react";
import { getAppContext } from "@/lib/server/session";
import { resolveChartData } from "@/lib/services/charts";
import { getWarehouse } from "@/lib/services/query";
import { setupChecklist } from "@/lib/services/projects";
import { listAudit } from "@/lib/services/workspace";
import { isDateRangeKey, DEFAULT_RANGE, resolveRange } from "@/lib/domain/dates";
import type { ChartSpec } from "@/lib/domain/types";
import { ButtonLink, Card, CardHeader, DemoBadge, EmptyState, PageHeader, PageSkeleton, StatusBadge } from "@/components/ui";
import { DateRangeSelect } from "@/components/date-range-select";
import { ChartCard, ChartGrid } from "@/components/charts/chart-grid";
import { ChartView } from "@/components/charts/chart-view";
import { cx, formatDate, hoursSince, relativeTime } from "@/lib/format";

export default function OverviewPage(props: PageProps<"/">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Overview searchParams={props.searchParams} />
    </Suspense>
  );
}

const kpi = (id: string, title: string, metric: string): ChartSpec => ({ id, title, visualization: "kpi", metrics: [metric], grain: "day", dateRange: "inherit", filters: [], size: "sm" });
const line = (id: string, title: string, metric: string, viz: ChartSpec["visualization"] = "area"): ChartSpec => ({ id, title, visualization: viz, metrics: [metric], grain: "day", dateRange: "inherit", filters: [], size: "lg" });

async function Overview({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const { actor, project, store } = await getAppContext();
  const sp = await searchParams;
  if (!project) {
    return <EmptyState title="No projects yet" action={<ButtonLink href="/projects/new" variant="primary">Create project</ButtonLink>}>Create a project to start connecting data.</EmptyState>;
  }
  const range = isDateRangeKey(sp.range) ? sp.range : DEFAULT_RANGE;
  const steps = setupChecklist(project.id);
  const coverage = getWarehouse().coverage(project.id);
  const conns = store.connections.filter((c) => c.projectId === project.id);
  const allDemo = conns.length > 0 && conns.every((c) => c.demo);
  const shareTarget = store.dashboards.find((d) => d.projectId === project.id && d.status === "published");
  const header = (
    <PageHeader
      eyebrow={
        <span className="flex items-center gap-2">
          Overview {allDemo || project.sampleData ? <DemoBadge /> : null}
        </span>
      }
      title={project.name}
      description={project.description || "Your founder dashboard."}
      actions={
        coverage ? (
          <>
            <DateRangeSelect value={range} />
            {shareTarget && (
              <ButtonLink href={`/dashboards/${shareTarget.id}?share=1`} variant="secondary" title={`Share ${shareTarget.name}`}>
                <Share2 className="size-3.5" /> Share
              </ButtonLink>
            )}
            <ButtonLink href="/dashboards/new" variant="primary">
              <Plus className="size-3.5" /> Create dashboard
            </ButtonLink>
          </>
        ) : undefined
      }
    />
  );

  if (!coverage) {
    return (
      <div>
        {header}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <EmptyState
            className="lg:col-span-2"
            icon={<Cable className="size-5" />}
            title="No data connected yet"
            action={
              <>
                <ButtonLink href="/connections" variant="primary">
                  Connect a source
                </ButtonLink>
                <ButtonLink href="/projects/new">Start a sample project</ButtonLink>
              </>
            }
          >
            Connect Stripe, PostHog, Segment or your warehouse to see revenue, active users, conversion and retention here. Demo connections generate clearly-labelled sample data.
          </EmptyState>
          <SetupCard steps={steps} />
        </div>
      </div>
    );
  }

  const ctx = { actor, projectId: project.id, range, source: "ui" as const };
  const metricByKey = new Map(store.metrics.filter((m) => m.projectId === project.id).map((m) => [m.key, m]));
  const kpis = [kpi("k_rev", "Revenue", "gross_revenue"), kpi("k_wau", "Active users (WAU)", "weekly_active_users"), kpi("k_conv", "Trial-to-paid conversion", "trial_to_paid"), kpi("k_ret", "7-day retention", "retention_7d")];
  const revenue = line("t_rev", "Revenue", "gross_revenue", "area");
  const wau = line("t_wau", "Weekly active users", "weekly_active_users", "line");
  const funnel: ChartSpec = { id: "f", title: "Activation funnel", visualization: "funnel", metrics: ["visitors", "signups", "activated_users", "trials_started", "paid_conversions"].filter((k) => metricByKey.has(k)), grain: "day", dateRange: "inherit", filters: [], size: "md" };
  const [kpiData, revData, wauData, funnelData] = await Promise.all([
    Promise.all(kpis.map((k) => resolveChartData(k, ctx))),
    resolveChartData(revenue, ctx),
    resolveChartData(wau, ctx),
    funnel.metrics.length >= 2 ? resolveChartData(funnel, ctx) : Promise.resolve({ kind: "empty" as const, reason: "Add funnel metrics (visitors → paid) to see activation." }),
  ]);
  const r = resolveRange(coverage.end, range);
  const freshHours = hoursSince(coverage.loadedAt);
  const stale = freshHours > 24;
  const failing = conns.filter((c) => c.status === "error");

  const alerts = store.alerts
    .filter((a) => a.projectId === project.id)
    .flatMap((a) => a.history.slice(0, 2).map((h) => ({ a, h })))
    .sort((x, y) => y.h.at.localeCompare(x.h.at))
    .slice(0, 4);
  const activity = listAudit(project.id, 6).filter((e) => e.projectId === project.id);
  const dashboards = store.dashboards
    .filter((d) => d.projectId === project.id)
    .sort((a, b) => (b.lastViewedAt ?? b.updatedAt).localeCompare(a.lastViewedAt ?? a.updatedAt))
    .slice(0, 4);

  return (
    <div className="space-y-4">
      {header}
      <p className="-mt-3 text-[12px] text-muted">
        {formatDate(r.start)} – {formatDate(r.end)} · compared with {formatDate(r.prevStart)} – {formatDate(r.prevEnd)}
      </p>

      <ChartGrid>
        {kpis.map((k, i) => (
          <ChartCard key={k.id} spec={{ ...k, size: "sm" }} data={kpiData[i]} currency={project.currency} definition={metricByKey.get(k.metrics[0])?.formula} />
        ))}
      </ChartGrid>
      <div
        className={cx("flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border px-4 py-2.5 text-[12.5px]", stale || failing.length ? "border-[#f3dcb4] bg-warn-soft/50" : "border-line bg-surface")}
        aria-label="Data freshness"
      >
        <span className="flex items-center gap-1.5 font-medium text-ink-2">
          <Clock aria-hidden className={cx("size-3.5", stale ? "text-warn" : "text-ok")} /> Data freshness
        </span>
        <span className="text-ink-2">
          Loaded {relativeTime(coverage.loadedAt)} · data through {formatDate(coverage.end)}
        </span>
        {stale && <StatusBadge status="warning" label="Older than 24h SLA" />}
        {failing.map((c) => (
          <Link key={c.id} href={`/connections/${c.id}`} className="text-bad underline-offset-2 hover:underline">
            {c.name} sync failing
          </Link>
        ))}
        <span className="ml-auto text-muted">Definition: time since the last successful load of the dashboard mart (fct_daily_business).</span>
      </div>

      <div className="grid grid-cols-12 gap-3">
        <Card className="col-span-12 lg:col-span-8">
          <CardHeader title="Revenue and active users" description="Two aligned charts with separate scales — never a dual axis." />
          <div className="space-y-2 px-4 pb-3">
            <div>
              <div className="text-[12px] font-medium text-muted">Gross revenue ({project.currency})</div>
              <ChartView spec={revenue} data={revData} currency={project.currency} height={170} />
            </div>
            <div className="border-t border-line pt-2">
              <div className="text-[12px] font-medium text-muted">Weekly active users</div>
              <ChartView spec={wau} data={wauData} currency={project.currency} height={150} />
            </div>
          </div>
        </Card>
        <Card className="col-span-12 lg:col-span-4">
          <CardHeader title="Activation funnel" description="Visitors → paid over the selected range" />
          <div className="px-4 pb-3">
            <ChartView spec={funnel} data={funnelData} currency={project.currency} height={330} />
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-12 gap-3">
        <Card className="col-span-12 lg:col-span-4">
          <CardHeader title="Recent alerts" actions={<ButtonLink href="/alerts" size="sm" variant="ghost">All <ArrowRight className="size-3" /></ButtonLink>} />
          <ul className="px-2 pb-2">
            {alerts.length === 0 && <li className="px-2 py-6 text-center text-[13px] text-muted">No alert activity yet.</li>}
            {alerts.map(({ a, h }) => (
              <li key={`${a.id}${h.id}`} className="rounded-md px-2 py-2 hover:bg-subtle">
                <div className="flex items-center gap-2">
                  <Siren aria-hidden className={cx("size-3.5", h.state === "fired" ? "text-bad" : "text-muted")} />
                  <span className="truncate text-[13px] font-medium text-ink">{a.name}</span>
                  <span className="ml-auto">
                    <StatusBadge status={h.state} />
                  </span>
                </div>
                <p className="mt-0.5 line-clamp-1 pl-5.5 text-[12px] text-muted">{h.message.split("\n")[0]}</p>
                <p className="pl-5.5 text-[11px] text-faint">
                  {relativeTime(h.at)} · {h.delivery === "simulated" ? "simulated delivery" : "not sent"}
                </p>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="col-span-12 lg:col-span-4">
          <CardHeader title="Recent dashboards" actions={<ButtonLink href="/dashboards" size="sm" variant="ghost">Library <ArrowRight className="size-3" /></ButtonLink>} />
          <ul className="px-2 pb-2">
            {dashboards.length === 0 && <li className="px-2 py-6 text-center text-[13px] text-muted">No dashboards yet.</li>}
            {dashboards.map((d) => (
              <li key={d.id}>
                <Link href={`/dashboards/${d.id}`} className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-subtle">
                  <span className="flex size-8 items-center justify-center rounded-md bg-accent-soft text-accent">
                    <LayoutDashboard aria-hidden className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-ink">{d.name}</span>
                    <span className="block text-[11.5px] text-muted">
                      Viewed {relativeTime(d.lastViewedAt)} · updated {relativeTime(d.updatedAt)}
                    </span>
                  </span>
                  <StatusBadge status={d.status} />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="col-span-12 lg:col-span-4">
          <CardHeader title="Activity" description="Audit trail for this project" />
          <ol className="px-4 pb-3">
            {activity.length === 0 && <li className="py-6 text-center text-[13px] text-muted">No activity yet.</li>}
            {activity.map((e) => (
              <li key={e.id} className="flex gap-2.5 border-l border-line py-1.5 pl-3">
                <Activity aria-hidden className="-ml-[19px] size-3.5 shrink-0 rounded-full bg-surface text-faint" />
                <div className="min-w-0 text-[12.5px]">
                  <span className="font-medium text-ink-2">{e.actor}</span> <span className="text-muted">{e.action.replace(/[._]/g, " ")}</span>{" "}
                  {e.target && <span className="text-ink-2">{e.target}</span>}
                  {e.detail && <span className="block text-[11.5px] text-faint">{e.detail}</span>}
                  <span className="block text-[11px] text-faint">{relativeTime(e.at)}</span>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      </div>

      {steps.some((s) => !s.done) && <SetupCard steps={steps} />}
    </div>
  );
}

function SetupCard({ steps }: { steps: ReturnType<typeof setupChecklist> }) {
  const done = steps.filter((s) => s.done).length;
  return (
    <Card>
      <CardHeader title="Finish setting up" description={`${done} of ${steps.length} steps complete`} />
      <ol className="grid grid-cols-1 gap-2 px-4 pb-4 sm:grid-cols-5">
        {steps.map((s, i) => (
          <li key={s.key}>
            <Link href={s.href} className={cx("flex h-full items-center gap-2 rounded-md border px-3 py-2.5 text-[13px]", s.done ? "border-line bg-subtle/50 text-muted" : "border-accent-line bg-accent-soft/40 text-ink hover:border-accent")}>
              <span className={cx("flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold", s.done ? "bg-ok text-white" : "border border-accent-line bg-surface text-accent")}>
                {s.done ? <Check className="size-3" strokeWidth={3} /> : i + 1}
              </span>
              {s.label}
            </Link>
          </li>
        ))}
      </ol>
    </Card>
  );
}
