import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getAppContext } from "@/lib/server/session";
import { ServiceError } from "@/lib/services/context";
import { getDashboard, hasUnpublishedChanges } from "@/lib/services/dashboards";
import { resolveCharts } from "@/lib/services/charts";
import { DEFAULT_RANGE } from "@/lib/domain/dates";
import { PageSkeleton } from "@/components/ui";
import { DashboardEditor } from "@/components/dashboards/editor";

export const metadata = { title: "Edit dashboard" };

export default function EditDashboardPage(props: PageProps<"/dashboards/[id]/edit">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Edit params={props.params} />
    </Suspense>
  );
}

async function Edit({ params }: { params: PageProps<"/dashboards/[id]/edit">["params"] }) {
  const { actor, store } = await getAppContext();
  const { id } = await params;
  let d;
  try {
    d = getDashboard(actor, id);
  } catch (e) {
    if (e instanceof ServiceError && e.code === "not_found") notFound();
    throw e;
  }
  const project = store.projects.find((p) => p.id === d.projectId)!;
  const data = await resolveCharts(d.charts, { actor, projectId: d.projectId, range: DEFAULT_RANGE, dashboardId: d.id, source: "ui" });
  const metrics = store.metrics
    .filter((m) => m.projectId === d.projectId && m.status !== "requested")
    .map((m) => ({ key: m.key, name: m.name, unit: m.unit, dimensions: m.dimensions, status: m.status }));
  return (
    <DashboardEditor
      key={d.updatedAt}
      dashboard={{ id: d.id, name: d.name, description: d.description, tags: d.tags, status: d.status, charts: d.charts, hasPublished: !!d.publishedCharts, unpublished: hasUnpublishedChanges(d) }}
      projectName={project.name}
      currency={project.currency}
      sampleData={project.sampleData}
      metrics={metrics}
      initialData={data}
    />
  );
}
