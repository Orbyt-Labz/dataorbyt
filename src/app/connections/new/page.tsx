import { Suspense } from "react";
import { getAppContext } from "@/lib/server/session";
import { CONNECTORS, CATEGORY_LABELS } from "@/lib/domain/connectors";
import { EmptyState, PageHeader, PageSkeleton } from "@/components/ui";
import { ConnectionWizard } from "@/components/connections/connection-wizard";

export const metadata = { title: "Add connection" };

export default function NewConnectionPage(props: PageProps<"/connections/new">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NewConnection searchParams={props.searchParams} />
    </Suspense>
  );
}

async function NewConnection({ searchParams }: { searchParams: PageProps<"/connections/new">["searchParams"] }) {
  const { project } = await getAppContext();
  const sp = await searchParams;
  if (!project) return <EmptyState title="No project selected">Create a project first.</EmptyState>;
  const available = CONNECTORS.filter((c) => c.availability === "available");
  const initial = typeof sp.connector === "string" && available.some((c) => c.id === sp.connector) ? sp.connector : undefined;
  return (
    <div>
      <PageHeader eyebrow="Connections" title="Add a connection" description={`Connect a source to ${project.name}. This build uses demo adapters — nothing connects to a real system.`} />
      <ConnectionWizard projectId={project.id} projectEnvironment={project.environment} connectors={available} categoryLabels={CATEGORY_LABELS} initialConnector={initial} />
    </div>
  );
}
