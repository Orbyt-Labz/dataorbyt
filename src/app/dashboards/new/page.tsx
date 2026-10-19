import { Suspense } from "react";
import { getAppContext } from "@/lib/server/session";
import { DASHBOARD_TEMPLATES } from "@/lib/domain/templates";
import { EmptyState, ButtonLink, PageHeader, PageSkeleton } from "@/components/ui";
import { CreateDashboardForm } from "@/components/dashboards/create-form";
import type { ChartSpec } from "@/lib/domain/types";

export const metadata = { title: "New dashboard" };

export default function NewDashboardPage(props: PageProps<"/dashboards/new">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NewDashboard searchParams={props.searchParams} />
    </Suspense>
  );
}

async function NewDashboard({ searchParams }: { searchParams: PageProps<"/dashboards/new">["searchParams"] }) {
  const { project, store } = await getAppContext();
  const sp = await searchParams;
  if (!project) return <EmptyState title="Create a project first" action={<ButtonLink href="/projects/new" variant="primary">New project</ButtonLink>} />;
  const metrics = store.metrics.filter((m) => m.projectId === project.id);
  const available = new Set(metrics.filter((m) => m.status !== "requested").map((m) => m.key));
  const templates = DASHBOARD_TEMPLATES.map((t) => {
    const missing = [...new Set(t.charts.flatMap((c) => c.metrics).filter((k) => !available.has(k)))];
    return {
      id: t.id,
      name: t.name,
      description: t.description,
      chartCount: t.charts.filter((c) => c.metrics.every((k) => available.has(k))).length,
      charts: t.charts.map((c, i) => ({ ...c, id: `${t.id}_${i}` }) as ChartSpec),
      missing,
    };
  });
  const tpl = typeof sp.template === "string" ? sp.template : undefined;
  const mode = sp.mode === "metrics" || sp.mode === "blank" ? sp.mode : "template";
  return (
    <div>
      <PageHeader eyebrow={`Dashboards · ${project.name}`} title="New dashboard" description="Create a draft. You'll arrange charts in the editor and publish when it looks right." />
      <CreateDashboardForm
        projectId={project.id}
        projectName={project.name}
        templates={templates}
        metrics={metrics.filter((m) => m.status === "approved").map((m) => ({ key: m.key, name: m.name, domain: m.domain, description: m.description }))}
        initialMode={mode}
        initialTemplate={templates.some((t) => t.id === tpl) ? tpl : undefined}
      />
    </div>
  );
}
