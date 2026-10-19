import Link from "next/link";
import { Suspense } from "react";
import { Eye, Globe2, LayoutDashboard, Link2, Lock, Plus, Users } from "lucide-react";
import { getAppContext } from "@/lib/server/session";
import { listDashboards, hasUnpublishedChanges } from "@/lib/services/dashboards";
import { ButtonLink, DemoBadge, EmptyState, PageHeader, PageSkeleton, StatusBadge, Badge } from "@/components/ui";
import { DashboardThumbnail } from "@/components/dashboards/thumbnail";
import { QueryFilters } from "@/components/dashboards/library-filters";
import { relativeTime, formatNumber } from "@/lib/format";
import type { DashboardVisibility } from "@/lib/domain/types";

export const metadata = { title: "Dashboards" };

export default function DashboardsPage(props: PageProps<"/dashboards">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Library searchParams={props.searchParams} />
    </Suspense>
  );
}

const VIS: Record<DashboardVisibility, { label: string; icon: typeof Lock }> = {
  private: { label: "Private", icon: Lock },
  organization: { label: "Organization", icon: Users },
  link: { label: "Link (simulated)", icon: Link2 },
};

async function Library({ searchParams }: { searchParams: PageProps<"/dashboards">["searchParams"] }) {
  const { actor, project, projects, store } = await getAppContext();
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const projectParam = one(sp.project);
  const projectId = projectParam === "all" ? undefined : projectParam || project?.id;
  const all = listDashboards(actor, { projectId });
  const dashboards = listDashboards(actor, { projectId, q: one(sp.q) || undefined, tag: one(sp.tag) || undefined, owner: one(sp.owner) || undefined, visibility: one(sp.visibility) || undefined });
  const tags = [...new Set(all.flatMap((d) => d.tags))].sort();
  const owners = [...new Set(all.map((d) => d.owner))].sort();
  const projectName = new Map(projects.map((p) => [p.id, p]));

  return (
    <div>
      <PageHeader
        title="Dashboards"
        description="Polished, shareable dashboards built from governed metrics."
        actions={
          <ButtonLink href="/dashboards/new" variant="primary">
            <Plus className="size-3.5" /> New dashboard
          </ButtonLink>
        }
      />
      <QueryFilters
        searchPlaceholder="Search dashboards…"
        selects={[
          { name: "project", label: "Project", allLabel: `Current project${project ? ` (${project.name})` : ""}`, options: [{ value: "all", label: "All projects" }, ...projects.filter((p) => p.id !== project?.id).map((p) => ({ value: p.id, label: p.name }))] },
          { name: "tag", label: "Tags", options: tags.map((t) => ({ value: t, label: `#${t}` })) },
          { name: "owner", label: "Owners", options: owners.map((o) => ({ value: o, label: o })) },
          { name: "visibility", label: "Visibility", options: Object.entries(VIS).map(([k, v]) => ({ value: k, label: v.label })) },
        ]}
      />

      {all.length === 0 ? (
        <EmptyState
          icon={<LayoutDashboard className="size-5" />}
          title="No dashboards in this project yet"
          action={
            <ButtonLink href="/dashboards/new" variant="primary">
              Create your first dashboard
            </ButtonLink>
          }
        >
          Start from the Founder Overview template, pick metrics, or begin with a blank canvas.
        </EmptyState>
      ) : dashboards.length === 0 ? (
        <EmptyState title="No dashboards match these filters">Try a different search or clear the filters.</EmptyState>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {dashboards.map((d) => {
            const vis = VIS[d.visibility];
            const p = projectName.get(d.projectId);
            const charts = d.publishedCharts ?? d.charts;
            return (
              <li key={d.id}>
                <Link href={`/dashboards/${d.id}`} className="group flex h-full flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-card transition-colors hover:border-line-strong focus-visible:border-accent">
                  <div className="h-32 border-b border-line bg-subtle/70 p-3">
                    <DashboardThumbnail charts={charts} />
                  </div>
                  <div className="flex flex-1 flex-col p-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="text-[14px] font-semibold text-ink group-hover:text-accent">{d.name}</h2>
                      <StatusBadge status={d.status} />
                    </div>
                    <p className="mt-1 line-clamp-2 text-[12.5px] text-muted">{d.description || "No description."}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {d.tags.map((t) => (
                        <Badge key={t}>#{t}</Badge>
                      ))}
                      {hasUnpublishedChanges(d) && <Badge tone="info">Unpublished edits</Badge>}
                      {d.createdVia === "mcp" && <Badge tone="accent">Created via MCP</Badge>}
                      {p?.sampleData && <DemoBadge />}
                    </div>
                    <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-3 text-[11.5px] text-muted">
                      <span>{d.owner}</span>
                      <span className="inline-flex items-center gap-1">
                        <vis.icon aria-hidden className="size-3" /> {vis.label}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Eye aria-hidden className="size-3" /> {formatNumber(d.viewCount)}
                      </span>
                      <span>Updated {relativeTime(d.updatedAt)}</span>
                      {projectParam === "all" && p && (
                        <span className="inline-flex items-center gap-1">
                          <Globe2 aria-hidden className="size-3" /> {p.name}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-4 text-[12px] text-faint">{store.dashboards.length} dashboards across the workspace.</p>
    </div>
  );
}
