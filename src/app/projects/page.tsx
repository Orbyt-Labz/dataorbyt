import Link from "next/link";
import { Suspense } from "react";
import { FolderKanban, Plus } from "lucide-react";
import { getAppContext } from "@/lib/server/session";
import { projectSummary } from "@/lib/services/projects";
import { Badge, ButtonLink, Card, DemoBadge, EmptyState, PageHeader, PageSkeleton, StatusBadge, td, th } from "@/components/ui";
import { QueryFilters } from "@/components/dashboards/library-filters";
import { SwitchProjectButton } from "@/components/projects/switch-button";
import { relativeTime } from "@/lib/format";

export const metadata = { title: "Projects" };

export default function ProjectsPage(props: PageProps<"/projects">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Projects searchParams={props.searchParams} />
    </Suspense>
  );
}

const ENV_LABEL = { production: "Production", staging: "Staging", development: "Development" };

async function Projects({ searchParams }: { searchParams: PageProps<"/projects">["searchParams"] }) {
  const { project: active, projects } = await getAppContext();
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const q = one(sp.q).toLowerCase().trim();
  const status = one(sp.status);
  const sort = one(sp.sort) || "name";

  const rows = projects
    .map((p) => ({ p, s: projectSummary(p.id) }))
    .filter(({ p }) => !q || p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q) || (p.industry ?? "").toLowerCase().includes(q))
    .filter(({ p }) => !status || p.status === status)
    .sort((a, b) =>
      sort === "last_sync" ? (b.s.lastSync ?? "").localeCompare(a.s.lastSync ?? "") : sort === "dashboards" ? b.s.dashboards - a.s.dashboards : a.p.name.localeCompare(b.p.name),
    );

  return (
    <div>
      <PageHeader
        title="Projects"
        description="Each project has its own sources, dbt project, metric catalog, dashboards, alerts and experiments."
        actions={
          <ButtonLink href="/projects/new" variant="primary">
            <Plus className="size-3.5" /> New project
          </ButtonLink>
        }
      />
      <QueryFilters
        searchPlaceholder="Search projects…"
        selects={[
          {
            name: "status",
            label: "Statuses",
            options: [
              { value: "healthy", label: "Healthy" },
              { value: "warning", label: "Warning" },
              { value: "error", label: "Error" },
              { value: "setup", label: "Setting up" },
            ],
          },
          {
            name: "sort",
            label: "Sort",
            allLabel: "Sort: Name",
            options: [
              { value: "last_sync", label: "Sort: Last sync" },
              { value: "dashboards", label: "Sort: Dashboards" },
            ],
          },
        ]}
      />
      {projects.length === 0 ? (
        <EmptyState icon={<FolderKanban className="size-5" />} title="No projects yet" action={<ButtonLink href="/projects/new" variant="primary">Create project</ButtonLink>}>
          Projects group the data sources, models and dashboards for one product or business.
        </EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState title="No projects match">Try a different search or status.</EmptyState>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead className="border-b border-line bg-subtle/60">
                <tr>
                  <th scope="col" className={th}>
                    Project
                  </th>
                  <th scope="col" className={th}>
                    Environment
                  </th>
                  <th scope="col" className={th}>
                    Sources
                  </th>
                  <th scope="col" className={th}>
                    Dashboards
                  </th>
                  <th scope="col" className={th}>
                    Last sync
                  </th>
                  <th scope="col" className={th}>
                    Status
                  </th>
                  <th scope="col" className={th}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ p, s }) => (
                  <tr key={p.id} className="border-b border-line last:border-0 hover:bg-subtle/40">
                    <td className={td}>
                      <div className="flex items-center gap-3">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[#0e1626] text-[12px] font-bold text-white">{p.name[0]}</span>
                        <div className="min-w-0">
                          <Link href={`/projects/${p.id}`} className="font-medium text-ink hover:text-accent">
                            {p.name}
                          </Link>
                          <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
                            {p.industry ?? "—"} · {p.currency} · {p.timezone}
                            {p.id === active?.id && <Badge tone="accent">Active</Badge>}
                            {p.sampleData && <DemoBadge label="Sample data" />}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className={td}>{ENV_LABEL[p.environment]}</td>
                    <td className={td}>
                      <span className="tabular">{s.connectedSources}</span>
                      <span className="text-muted"> / {s.sources} connected</span>
                      {s.erroredSources > 0 && <span className="block text-[12px] text-bad">{s.erroredSources} failing</span>}
                    </td>
                    <td className={td + " tabular"}>{s.dashboards}</td>
                    <td className={td}>{relativeTime(s.lastSync)}</td>
                    <td className={td}>
                      <StatusBadge status={p.status} />
                    </td>
                    <td className={td + " text-right"}>
                      <div className="flex justify-end gap-1.5">
                        <ButtonLink href={`/projects/${p.id}`} size="sm" variant="ghost">
                          Details
                        </ButtonLink>
                        {p.id !== active?.id && <SwitchProjectButton projectId={p.id} />}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
