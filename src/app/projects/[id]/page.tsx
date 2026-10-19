import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { Check } from "lucide-react";
import { getAppContext } from "@/lib/server/session";
import { CURRENCIES, TIMEZONES, projectSummary, setupChecklist } from "@/lib/services/projects";
import { getConnector } from "@/lib/domain/connectors";
import { analyzeExperiment } from "@/lib/domain/stats";
import { updateProjectAction } from "@/app/actions/projects";
import { Badge, ButtonLink, Card, CardHeader, DemoBadge, EmptyState, KeyValue, PageHeader, PageSkeleton, StatusBadge, TabLinks, td, th } from "@/components/ui";
import { ProjectForm } from "@/components/projects/project-form";
import { SwitchProjectButton } from "@/components/projects/switch-button";
import { cx, formatDate, relativeTime } from "@/lib/format";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "sources", label: "Sources" },
  { key: "dbt", label: "dbt" },
  { key: "metrics", label: "Metrics" },
  { key: "dashboards", label: "Dashboards" },
  { key: "experiments", label: "Experiments" },
  { key: "settings", label: "Settings" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default function ProjectDetailPage(props: PageProps<"/projects/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ProjectDetail params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead className="border-b border-line bg-subtle/60">
            <tr>
              {head.map((h) => (
                <th key={h} scope="col" className={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="[&>tr]:border-b [&>tr]:border-line [&>tr:last-child]:border-0">{children}</tbody>
        </table>
      </div>
    </Card>
  );
}

async function ProjectDetail({ params, searchParams }: { params: PageProps<"/projects/[id]">["params"]; searchParams: PageProps<"/projects/[id]">["searchParams"] }) {
  const { project: active, projects, store } = await getAppContext();
  const { id } = await params;
  const sp = await searchParams;
  const p = projects.find((x) => x.id === id);
  if (!p) notFound();
  const tab: TabKey = TABS.some((t) => t.key === sp.tab) ? (sp.tab as TabKey) : "overview";
  const isActive = active?.id === p.id;
  const summary = projectSummary(p.id);
  const conns = store.connections.filter((c) => c.projectId === p.id);
  const metrics = store.metrics.filter((m) => m.projectId === p.id);
  const dashboards = store.dashboards.filter((d) => d.projectId === p.id);
  const experiments = store.experiments.filter((e) => e.projectId === p.id);
  const dbt = store.dbt[p.id];
  const steps = setupChecklist(p.id);
  const activeOnly = (href: string, label: ReactNode) =>
    isActive ? (
      <Link href={href} className="font-medium text-ink hover:text-accent">
        {label}
      </Link>
    ) : (
      <span className="font-medium text-ink">{label}</span>
    );

  return (
    <div>
      <PageHeader
        eyebrow={
          <span className="flex items-center gap-2">
            <Link href="/projects" className="hover:text-ink-2">
              Projects
            </Link>
            <span aria-hidden>/</span> {p.slug}
          </span>
        }
        title={
          <span className="flex flex-wrap items-center gap-2">
            {p.name} <StatusBadge status={p.status} />
            {p.sampleData && <DemoBadge />}
          </span>
        }
        description={p.description}
        actions={isActive ? <Badge tone="accent">Active project</Badge> : <SwitchProjectButton projectId={p.id} label="Make active project" variant="primary" size="md" />}
      />
      <TabLinks tabs={TABS.map((t) => ({ key: t.key, label: t.label, href: `/projects/${p.id}${t.key === "overview" ? "" : `?tab=${t.key}`}` }))} active={tab} />
      {!isActive && tab !== "overview" && tab !== "settings" && tab !== "dashboards" && (
        <p className="mb-3 text-[12.5px] text-muted">Make this the active project to open individual items — app pages show the active project.</p>
      )}

      {tab === "overview" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader title="Project" />
            <div className="px-4 pb-4">
              <KeyValue
                items={[
                  { label: "Environment", value: p.environment },
                  { label: "Timezone", value: p.timezone },
                  { label: "Currency", value: p.currency },
                  { label: "Industry", value: p.industry ?? "—" },
                  { label: "Created", value: formatDate(p.createdAt) },
                  { label: "Last sync", value: relativeTime(summary.lastSync) },
                  { label: "Data", value: p.sampleData ? "Deterministic demo data" : conns.length ? "Demo connections (simulated)" : "No sources connected" },
                ]}
              />
              <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
                {[
                  ["Sources", summary.sources, "sources"],
                  ["Metrics", summary.metrics, "metrics"],
                  ["Dashboards", summary.dashboards, "dashboards"],
                  ["Experiments", summary.experiments, "experiments"],
                  ["Alerts", summary.alerts, isActive ? "/alerts" : null],
                  ["dbt models", dbt?.models.length ?? 0, "dbt"],
                ].map(([label, n, t]) => {
                  const body = (
                    <>
                      <div className="text-[18px] font-semibold text-ink tabular">{n}</div>
                      <div className="text-[11.5px] text-muted">{label}</div>
                    </>
                  );
                  return t ? (
                    <Link key={label as string} href={String(t).startsWith("/") ? String(t) : `/projects/${p.id}?tab=${t}`} className="rounded-md border border-line px-3 py-2 hover:border-line-strong">
                      {body}
                    </Link>
                  ) : (
                    <div key={label as string} className="rounded-md border border-line px-3 py-2">
                      {body}
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>
          <Card>
            <CardHeader title="Setup" description={`${steps.filter((s) => s.done).length} of ${steps.length} complete`} />
            <ol className="space-y-1.5 px-4 pb-4">
              {steps.map((s) => (
                <li key={s.key} className="flex items-center gap-2 text-[13px]">
                  <span className={cx("flex size-4 items-center justify-center rounded-full", s.done ? "bg-ok text-white" : "border border-line-strong")}>{s.done && <Check className="size-2.5" strokeWidth={3} />}</span>
                  <span className={s.done ? "text-muted" : "text-ink-2"}>{s.label}</span>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      )}

      {tab === "sources" &&
        (conns.length === 0 ? (
          <EmptyState title="No sources connected" action={<ButtonLink href="/connections" variant="primary">Browse connectors</ButtonLink>}>
            Connect a warehouse, billing or product analytics source.
          </EmptyState>
        ) : (
          <Table head={["Source", "Type", "Environment", "Status", "Last sync", "Tables"]}>
            {conns.map((c) => (
              <tr key={c.id}>
                <td className={td}>
                  {activeOnly(`/connections/${c.id}`, c.name)}
                  {c.demo && <span className="ml-2 text-[11px] text-warn">Demo connection</span>}
                </td>
                <td className={td}>{getConnector(c.connectorId)?.name ?? c.connectorId}</td>
                <td className={td}>{c.environment}</td>
                <td className={td}>
                  <StatusBadge status={c.status} />
                </td>
                <td className={td}>{relativeTime(c.lastSyncAt)}</td>
                <td className={td + " tabular"}>{c.tables.length}</td>
              </tr>
            ))}
          </Table>
        ))}

      {tab === "dbt" &&
        (!dbt?.configured ? (
          <EmptyState title="dbt is not configured" action={isActive ? <ButtonLink href="/dbt/starter" variant="primary">Generate starter project</ButtonLink> : undefined}>
            Generate a starter dbt project from this project&apos;s sources, or connect an existing repository.
          </EmptyState>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader title="dbt project" />
              <div className="px-4 pb-4">
                <KeyValue
                  items={[
                    { label: "Version", value: dbt.dbtVersion },
                    { label: "Adapter", value: dbt.adapter },
                    { label: "Target", value: dbt.target },
                    { label: "Repository", value: dbt.repository ? `${dbt.repository.url} (not cloned — demo)` : "Not configured" },
                    { label: "Last run", value: dbt.runs[0] ? <span className="inline-flex items-center gap-2"><StatusBadge status={dbt.runs[0].status} /> {relativeTime(dbt.runs[0].startedAt)}</span> : "Never" },
                  ]}
                />
              </div>
            </Card>
            <div className="lg:col-span-2">
              <Table head={["Model", "Layer", "Materialization", "State", "Tests"]}>
                {dbt.models.map((m) => (
                  <tr key={m.name}>
                    <td className={td + " font-mono text-[12px]"}>{activeOnly(`/dbt/models/${m.name}`, m.name)}</td>
                    <td className={td}>{m.layer}</td>
                    <td className={td}>{m.materialization}</td>
                    <td className={td}>
                      <StatusBadge status={m.state} />
                    </td>
                    <td className={td + " tabular"}>
                      {m.tests.filter((t) => t.status === "pass").length}/{m.tests.length}
                      {m.tests.some((t) => t.status === "fail") && <span className="ml-1 text-bad">· failing</span>}
                    </td>
                  </tr>
                ))}
              </Table>
            </div>
          </div>
        ))}

      {tab === "metrics" &&
        (metrics.length === 0 ? (
          <EmptyState title="No metrics yet" action={isActive ? <ButtonLink href="/metrics" variant="primary">Choose metrics</ButtonLink> : undefined}>
            Add governed metrics so dashboards, alerts and MCP clients share one definition.
          </EmptyState>
        ) : (
          <Table head={["Metric", "Domain", "Unit", "Source model", "Owner", "Status"]}>
            {metrics.map((m) => (
              <tr key={m.id}>
                <td className={td}>
                  {activeOnly(`/metrics/${m.key}`, m.name)}
                  <div className="font-mono text-[11px] text-faint">{m.key}</div>
                </td>
                <td className={td}>{m.domain}</td>
                <td className={td}>{m.unit}</td>
                <td className={td + " font-mono text-[12px]"}>{m.sourceModel}</td>
                <td className={td}>{m.owner}</td>
                <td className={td}>
                  <StatusBadge status={m.status} />
                </td>
              </tr>
            ))}
          </Table>
        ))}

      {tab === "dashboards" &&
        (dashboards.length === 0 ? (
          <EmptyState title="No dashboards yet" action={isActive ? <ButtonLink href="/dashboards/new" variant="primary">New dashboard</ButtonLink> : undefined}>
            Start from a template once metrics are available.
          </EmptyState>
        ) : (
          <Table head={["Dashboard", "Owner", "Visibility", "Status", "Views", "Updated"]}>
            {dashboards.map((d) => (
              <tr key={d.id}>
                <td className={td}>
                  <Link href={`/dashboards/${d.id}`} className="font-medium text-ink hover:text-accent">
                    {d.name}
                  </Link>
                </td>
                <td className={td}>{d.owner}</td>
                <td className={td}>{d.visibility === "link" ? "Link (simulated)" : d.visibility}</td>
                <td className={td}>
                  <StatusBadge status={d.status} />
                </td>
                <td className={td + " tabular"}>{d.viewCount}</td>
                <td className={td}>{relativeTime(d.updatedAt)}</td>
              </tr>
            ))}
          </Table>
        ))}

      {tab === "experiments" &&
        (experiments.length === 0 ? (
          <EmptyState title="No experiments" action={isActive ? <ButtonLink href="/experiments/new" variant="primary">New experiment</ButtonLink> : undefined}>
            Define a hypothesis, variants and a primary metric to start measuring.
          </EmptyState>
        ) : (
          <Table head={["Experiment", "Status", "Owner", "Dates", "Primary metric", "Inference"]}>
            {experiments.map((e) => {
              const a = analyzeExperiment(e);
              return (
                <tr key={e.id}>
                  <td className={td}>{activeOnly(`/experiments/${e.id}`, e.name)}</td>
                  <td className={td}>
                    <StatusBadge status={e.status} />
                  </td>
                  <td className={td}>{e.owner}</td>
                  <td className={td}>
                    {formatDate(e.startDate)} – {formatDate(e.endDate)}
                  </td>
                  <td className={td + " font-mono text-[12px]"}>{e.primaryMetric}</td>
                  <td className={td}>{a.status.available ? <Badge tone="ok">Available</Badge> : <Badge title={a.status.reason}>Descriptive only</Badge>}</td>
                </tr>
              );
            })}
          </Table>
        ))}

      {tab === "settings" && (
        <Card className="p-5">
          <h2 className="mb-4 text-[14px] font-semibold">Project settings</h2>
          <ProjectForm
            mode="edit"
            action={updateProjectAction.bind(null, p.id)}
            defaults={{ name: p.name, description: p.description, timezone: p.timezone, currency: p.currency, environment: p.environment, industry: p.industry ?? "" }}
            timezones={TIMEZONES}
            currencies={CURRENCIES}
          />
        </Card>
      )}
    </div>
  );
}
