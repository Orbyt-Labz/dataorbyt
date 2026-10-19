import { Suspense } from "react";
import { getAppContext } from "@/lib/server/session";
import { getDbt, starterPreview } from "@/lib/services/dbt";
import { Callout, EmptyState, PageHeader, PageSkeleton } from "@/components/ui";
import { StarterPreview } from "@/components/dbt/starter-preview";

export const metadata = { title: "Generate dbt starter project" };

export default function StarterPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Starter />
    </Suspense>
  );
}

async function Starter() {
  const { actor, project, store } = await getAppContext();
  if (!project) return <EmptyState title="No project selected">Create a project first.</EmptyState>;
  const preview = starterPreview(actor, project.id);
  const dbt = getDbt(actor, project.id);
  const hasSources = store.connections.some((c) => c.projectId === project.id);
  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="dbt"
        title="Generate dbt starter project"
        description={`Proposed models for ${project.name}, based on its connected sources. Review every file before confirming.`}
      />
      {!hasSources && <Callout tone="info" title="No sources connected">Showing a Stripe + PostHog starter as an example. Connect your sources for a tailored proposal.</Callout>}
      {dbt.configured && dbt.models.length > 0 && (
        <Callout tone="warn" title="This project already has dbt models">Confirming replaces the {dbt.models.length} registered models in this (simulated) workspace with the starter set.</Callout>
      )}
      <StarterPreview projectId={project.id} adapter={preview.adapter} files={preview.files} modelCount={preview.modelCount} />
    </div>
  );
}
