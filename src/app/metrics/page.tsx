import Link from "next/link";
import { Suspense } from "react";
import { Plus, Sigma } from "lucide-react";
import { getAppContext } from "@/lib/server/session";
import { listMetrics } from "@/lib/services/metrics";
import { getWarehouse } from "@/lib/services/query";
import { METRIC_TEMPLATES } from "@/lib/demo/seed-metrics";
import { DIMENSIONS } from "@/lib/demo/facts";
import { Badge, ButtonLink, Callout, Card, DemoBadge, EmptyState, PageHeader, PageSkeleton, StatusBadge, inputClass, selectClass } from "@/components/ui";
import { StarterMetricsForm } from "@/components/metrics/starter-metrics-form";
import { MetricRequestReview } from "@/components/metrics/request-review";
import { relativeTime } from "@/lib/format";

export const metadata = { title: "Metrics" };

export default function MetricsPage(props: PageProps<"/metrics">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Metrics searchParams={props.searchParams} />
    </Suspense>
  );
}

const DOMAINS = ["revenue", "growth", "engagement", "retention", "acquisition"];
const STATUSES = ["approved", "draft", "requested", "deprecated"];
const UNIT_LABEL = { currency: "Currency", count: "Count", percent: "Percent" } as const;
const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

async function Metrics({ searchParams }: { searchParams: PageProps<"/metrics">["searchParams"] }) {
  const { actor, project, store } = await getAppContext();
  const sp = await searchParams;
  if (!project) return <EmptyState title="No project selected">Create a project first.</EmptyState>;
  const filters = { q: str(sp.q), domain: str(sp.domain), owner: str(sp.owner), model: str(sp.model), status: str(sp.status) };
  const all = listMetrics(actor, project.id);
  const metrics = listMetrics(actor, project.id, filters);
  const coverage = getWarehouse().coverage(project.id);
  const owners = [...new Set(all.map((m) => m.owner))].sort();
  const models = [...new Set(all.map((m) => m.sourceModel))].sort();
  const requests = store.metricRequests.filter((r) => r.projectId === project.id);
  const pending = requests.filter((r) => r.status === "pending_review");
  const anyFilter = Object.values(filters).some(Boolean);

  if (all.length === 0) {
    return (
      <div>
        <PageHeader title="Metrics" description="The governed catalog every dashboard, alert and MCP query uses." />
        {coverage ? (
          <Card className="p-5">
            <h2 className="text-[14px] font-semibold">Choose starter metrics</h2>
            <p className="mt-1 mb-4 text-[13px] text-muted">Your project has (demo) data but no metrics yet. Pick the definitions you want in your catalog — you can request custom metrics later.</p>
            <StarterMetricsForm projectId={project.id} templates={METRIC_TEMPLATES.map((t) => ({ key: t.key, name: t.name, description: t.description, domain: t.domain }))} />
          </Card>
        ) : (
          <EmptyState icon={<Sigma className="size-5" />} title="Connect data before defining metrics" action={<ButtonLink href="/connections" variant="primary">Connect a source</ButtonLink>}>
            Metrics are defined on top of dbt models built from your sources. Connect billing or product data to get started.
          </EmptyState>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={project.sampleData ? <DemoBadge /> : undefined}
        title="Metrics"
        description="The governed catalog. Dashboards, alerts and MCP clients can only query approved metrics and whitelisted dimensions."
        actions={
          <ButtonLink href="/metrics/new" variant="primary">
            <Plus className="size-3.5" /> Request metric
          </ButtonLink>
        }
      />
      {sp.requested && <Callout tone="ok" title="Metric requested">It appears below as &ldquo;Requested&rdquo; and can&apos;t be queried until it&apos;s reviewed and approved.</Callout>}

      {pending.length > 0 && (
        <Card className="p-4">
          <h2 className="text-[13.5px] font-semibold">Pending review ({pending.length})</h2>
          <ul className="mt-2 divide-y divide-line">
            {pending.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-ink">
                    {r.name} <span className="font-mono text-[11.5px] text-muted">{r.key}</span>
                  </div>
                  <div className="text-[12px] text-muted">
                    Requested by {r.requestedBy} {relativeTime(r.createdAt)} · model {r.sourceModel}
                  </div>
                </div>
                <MetricRequestReview id={r.id} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <form className="flex flex-wrap items-end gap-2" role="search" aria-label="Filter metrics">
        <label className="min-w-[200px] flex-1">
          <span className="sr-only">Search metrics</span>
          <input name="q" defaultValue={filters.q} placeholder="Search name, key or description…" className={inputClass} />
        </label>
        {(
          [
            ["domain", "All domains", DOMAINS],
            ["owner", "All owners", owners],
            ["model", "All models", models],
            ["status", "All statuses", STATUSES],
          ] as const
        ).map(([name, label, options]) => (
          <label key={name}>
            <span className="sr-only">{label}</span>
            <select name={name} defaultValue={filters[name] ?? ""} className={selectClass + " w-40"}>
              <option value="">{label}</option>
              {options.map((o) => (
                <option key={o} value={o}>
                  {o.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </label>
        ))}
        <button type="submit" className="h-8.5 rounded-md border border-line-strong bg-surface px-3 text-[13px] font-medium text-ink-2 shadow-card hover:bg-subtle">
          Apply
        </button>
        {anyFilter && (
          <Link href="/metrics" className="h-8.5 px-2 text-[13px] leading-8.5 text-accent hover:underline">
            Clear
          </Link>
        )}
      </form>

      <p className="text-[12px] text-muted" aria-live="polite">
        {metrics.length} of {all.length} metrics
        {coverage && <> · data loaded {relativeTime(coverage.loadedAt)}</>}
      </p>

      {metrics.length === 0 ? (
        <EmptyState title="No metrics match these filters" action={<ButtonLink href="/metrics">Clear filters</ButtonLink>} />
      ) : (
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {metrics.map((m) => (
            <li key={m.id}>
              <Link href={`/metrics/${m.key}`} className="block h-full rounded-lg border border-line bg-surface p-4 shadow-card transition-colors hover:border-accent-line">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-[14px] font-semibold text-ink">{m.name}</h2>
                    <div className="font-mono text-[11.5px] text-muted">{m.key}</div>
                  </div>
                  <StatusBadge status={m.status} />
                </div>
                <p className="mt-2 text-[12.5px] text-ink-2">{m.description}</p>
                <code className="mt-2 block truncate rounded bg-subtle px-2 py-1 font-mono text-[11.5px] text-ink-2" title={m.formula}>
                  {m.formula}
                </code>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12px] sm:grid-cols-3">
                  <div>
                    <dt className="text-faint">Unit · grain</dt>
                    <dd className="text-ink-2">
                      {UNIT_LABEL[m.unit]} · {m.defaultGrain}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-faint">Source model</dt>
                    <dd className="truncate font-mono text-[11.5px] text-ink-2">{m.sourceModel}</dd>
                  </div>
                  <div>
                    <dt className="text-faint">Owner</dt>
                    <dd className="text-ink-2">{m.owner}</dd>
                  </div>
                  <div>
                    <dt className="text-faint">Domain</dt>
                    <dd className="text-ink-2 capitalize">{m.domain}</dd>
                  </div>
                  <div>
                    <dt className="text-faint">Freshness</dt>
                    <dd className="text-ink-2">{coverage ? relativeTime(coverage.loadedAt) : "no data"}</dd>
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <dt className="text-faint">Dimensions</dt>
                    <dd className="flex flex-wrap gap-1">
                      {m.dimensions.length === 0 ? <span className="text-muted">none</span> : m.dimensions.map((d) => <Badge key={d}>{DIMENSIONS[d]?.label ?? d}</Badge>)}
                    </dd>
                  </div>
                </dl>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {coverage && (
        <Card className="p-4">
          <h2 className="text-[13.5px] font-semibold">Add more starter metrics</h2>
          <p className="mt-1 mb-3 text-[12.5px] text-muted">Standard definitions not yet in this catalog.</p>
          <StarterMetricsForm projectId={project.id} templates={METRIC_TEMPLATES.filter((t) => !all.some((m) => m.key === t.key)).map((t) => ({ key: t.key, name: t.name, description: t.description, domain: t.domain }))} compact />
        </Card>
      )}
    </div>
  );
}
