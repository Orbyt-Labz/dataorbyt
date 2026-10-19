import { Suspense } from "react";
import { getAppContext } from "@/lib/server/session";
import { DIMENSIONS, FACT_FIELDS } from "@/lib/demo/facts";
import { EmptyState, PageHeader, PageSkeleton } from "@/components/ui";
import { MetricRequestForm } from "@/components/metrics/metric-request-form";

export const metadata = { title: "Request metric" };

export default function NewMetricPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NewMetric />
    </Suspense>
  );
}

async function NewMetric() {
  const { project, store } = await getAppContext();
  if (!project) return <EmptyState title="No project selected">Create a project first.</EmptyState>;
  const dbtModels = store.dbt[project.id]?.models ?? [];
  const models = [...new Set([...dbtModels.filter((m) => m.layer === "marts").map((m) => m.name), ...store.metrics.filter((m) => m.projectId === project.id).map((m) => m.sourceModel)])].sort();
  return (
    <div>
      <PageHeader
        eyebrow="Metrics"
        title="Request a metric"
        description="Propose a governed definition. A reviewer approves it before dashboards, alerts or MCP clients can query it."
      />
      <MetricRequestForm
        projectId={project.id}
        models={models.length ? models : ["fct_daily_business"]}
        fields={[...FACT_FIELDS]}
        dimensions={Object.entries(DIMENSIONS).map(([key, d]) => ({ key, label: d.label }))}
      />
    </div>
  );
}
