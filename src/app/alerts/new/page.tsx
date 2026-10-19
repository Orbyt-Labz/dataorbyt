import { Suspense } from "react";
import { getAppContext } from "@/lib/server/session";
import { PageHeader, PageSkeleton } from "@/components/ui";
import { AlertForm } from "@/components/alerts/alert-form";

export const metadata = { title: "New alert" };

export default function NewAlertPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NewAlert />
    </Suspense>
  );
}

async function NewAlert() {
  const { project, store } = await getAppContext();
  if (!project) return null;
  const metrics = store.metrics.filter((m) => m.projectId === project.id && m.status === "approved").map((m) => ({ key: m.key, name: m.name, unit: m.unit, direction: m.direction }));
  return (
    <div>
      <PageHeader eyebrow="Alerts" title="New alert" description="Define the condition, check how it would behave on current data, then create it." />
      <AlertForm projectId={project.id} metrics={metrics} />
    </div>
  );
}
