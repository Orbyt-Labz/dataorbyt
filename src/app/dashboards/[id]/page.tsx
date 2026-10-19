import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Eye, Link2, Lock, Users } from "lucide-react";
import { getAppContext } from "@/lib/server/session";
import { ServiceError } from "@/lib/services/context";
import { getDashboard, hasUnpublishedChanges, recordView, viewerCharts } from "@/lib/services/dashboards";
import { filterableDimensions, resolveCharts } from "@/lib/services/charts";
import { DEFAULT_RANGE, isDateRangeKey, resolveRange } from "@/lib/domain/dates";
import { parseFilterParams } from "@/components/dashboards/filters";
import { getWarehouse } from "@/lib/services/query";
import { Callout, DemoBadge, EmptyState, ButtonLink, PageHeader, PageSkeleton, StatusBadge } from "@/components/ui";
import { DateRangeSelect } from "@/components/date-range-select";
import { ChartCard, ChartGrid } from "@/components/charts/chart-grid";
import { DashboardActions, FilterChips } from "@/components/dashboards/view-controls";
import { formatDate, formatNumber, relativeTime } from "@/lib/format";

export default function DashboardViewPage(props: PageProps<"/dashboards/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <DashboardView params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

const VIS_ICON = { private: Lock, organization: Users, link: Link2 };

async function DashboardView({ params, searchParams }: { params: PageProps<"/dashboards/[id]">["params"]; searchParams: PageProps<"/dashboards/[id]">["searchParams"] }) {
  const { actor, store } = await getAppContext();
  const { id } = await params;
  const sp = await searchParams;
  let d;
  try {
    d = getDashboard(actor, id);
  } catch (e) {
    if (e instanceof ServiceError && e.code === "not_found") notFound();
    throw e;
  }
  recordView(actor, id);
  const project = store.projects.find((p) => p.id === d.projectId)!;
  const range = isDateRangeKey(sp.range) ? sp.range : DEFAULT_RANGE;
  const charts = viewerCharts(d);
  const dims = filterableDimensions(d.projectId, charts);
  const filters = parseFilterParams(sp.f, dims);
  const data = await resolveCharts(charts, { actor, projectId: d.projectId, range, globalFilters: filters, dashboardId: d.id, source: "dashboard" });
  const definitions = Object.fromEntries(store.metrics.filter((m) => m.projectId === d.projectId).map((m) => [m.key, `${m.name}: ${m.formula}`]));
  const coverage = getWarehouse().coverage(d.projectId);
  const r = coverage ? resolveRange(coverage.end, range) : null;
  const VisIcon = VIS_ICON[d.visibility];
  const queries = Object.values(data).reduce((a, x) => a + (x.meta?.queries ?? 0), 0);
  const hits = Object.values(data).reduce((a, x) => a + (x.meta?.cacheHits ?? 0), 0);

  return (
    <div>
      <PageHeader
        eyebrow={
          <span className="flex flex-wrap items-center gap-2">
            <Link href="/dashboards" className="hover:text-ink-2">
              Dashboards
            </Link>
            <span aria-hidden>/</span>
            <span>{project.name}</span>
            {project.sampleData && <DemoBadge />}
          </span>
        }
        title={
          <span className="flex flex-wrap items-center gap-2">
            {d.name} <StatusBadge status={d.status} />
          </span>
        }
        description={d.description}
        actions={<DashboardActions id={d.id} name={d.name} visibility={d.visibility} charts={charts} data={data} openShare={sp.share === "1"} />}
      />

      {d.status === "draft" && (
        <div className="mb-4">
          <Callout tone="info" title="This dashboard is an unpublished draft">
            Only you can see it. <Link href={`/dashboards/${d.id}/edit`} className="font-medium text-accent hover:underline">Open the editor</Link> to publish.
          </Callout>
        </div>
      )}
      {hasUnpublishedChanges(d) && (
        <div className="mb-4">
          <Callout tone="info" title="You have unpublished draft changes">
            Viewers see the last published version (published {relativeTime(d.publishedAt)}). <Link href={`/dashboards/${d.id}/edit`} className="font-medium text-accent hover:underline">Review & publish</Link>
          </Callout>
        </div>
      )}

      <div className="mb-4 flex flex-col gap-3 rounded-lg border border-line bg-surface px-3 py-2.5 shadow-card md:flex-row md:items-center">
        <DateRangeSelect value={range} />
        <div className="hidden h-5 w-px bg-line md:block" />
        <FilterChips active={filters} available={dims} />
        <div className="text-[11.5px] text-faint md:ml-auto md:text-right">
          {r && (
            <div>
              {formatDate(r.start)} – {formatDate(r.end)}
            </div>
          )}
          <div>
            {queries} queries · {hits} from cache
          </div>
        </div>
      </div>

      {charts.length === 0 ? (
        <EmptyState title="No charts yet" action={<ButtonLink href={`/dashboards/${d.id}/edit`} variant="primary">Add charts</ButtonLink>}>
          This dashboard is empty. Open the editor to add KPI tiles, trends, funnels and tables.
        </EmptyState>
      ) : (
        <ChartGrid>
          {charts.map((c) => (
            <ChartCard key={c.id} spec={c} data={data[c.id]} currency={project.currency} definition={c.metrics.map((k) => definitions[k]).filter(Boolean).join("\n")} />
          ))}
        </ChartGrid>
      )}

      <footer className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted">
        <span>Owner: {d.owner}</span>
        <span className="inline-flex items-center gap-1">
          <VisIcon aria-hidden className="size-3" /> {d.visibility === "link" ? "Link sharing (simulated)" : d.visibility === "organization" ? "Organization" : "Private"}
        </span>
        <span className="inline-flex items-center gap-1">
          <Eye aria-hidden className="size-3" /> {formatNumber(d.viewCount)} views
        </span>
        <span>Updated {relativeTime(d.updatedAt)}</span>
        {coverage && <span>Data loaded {relativeTime(coverage.loadedAt)}</span>}
        {project.sampleData && <span>All values are deterministic demo data.</span>}
      </footer>
    </div>
  );
}
