import { Suspense } from "react";
import { getAppContext } from "@/lib/server/session";
import { getWarehouse, queryMetric, totalOf } from "@/lib/services/query";
import { resolveRange, shiftDate } from "@/lib/domain/dates";
import { EmptyState, ButtonLink, PageHeader, PageSkeleton } from "@/components/ui";
import { ExperimentWizard } from "@/components/experiments/experiment-wizard";

export const metadata = { title: "New experiment" };

export default function NewExperimentPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NewExperiment />
    </Suspense>
  );
}

async function NewExperiment() {
  const { actor, project, store } = await getAppContext();
  if (!project) return null;
  const metrics = store.metrics.filter((m) => m.projectId === project.id && m.status === "approved");
  if (metrics.length === 0) {
    return (
      <div>
        <PageHeader title="New experiment" />
        <EmptyState title="No approved metrics" action={<ButtonLink href="/metrics" variant="primary">Choose metrics</ButtonLink>}>
          Experiments measure outcomes with governed catalog metrics. Approve at least one metric first.
        </EmptyState>
      </div>
    );
  }

  // Baseline rates (last 30 days) for conversion-type metrics, used by the sample-size helper.
  const cov = getWarehouse().coverage(project.id);
  const baselines: Record<string, number> = {};
  if (cov) {
    const r = resolveRange(cov.end, "30d");
    await Promise.all(
      metrics
        .filter((m) => m.unit === "percent")
        .map(async (m) => {
          try {
            const res = await queryMetric({ projectId: project.id, metricKey: m.key, start: r.start, end: r.end, grain: "week" }, { actor, source: "ui" });
            const v = totalOf(res, m.aggregation);
            if (v !== null && v > 0 && v < 1) baselines[m.key] = v;
          } catch {
            /* baseline is optional */
          }
        }),
    );
  }
  const today = cov?.end ?? new Date().toISOString().slice(0, 10);

  return (
    <div>
      <PageHeader eyebrow="Experiments" title="New experiment" description="Define the hypothesis, variants and metrics. This creates a draft — assignment only starts when you start it." />
      <ExperimentWizard
        projectId={project.id}
        metrics={metrics.map((m) => ({ key: m.key, name: m.name, unit: m.unit, baseline: baselines[m.key] }))}
        defaultStart={shiftDate(today, 2)}
        defaultEnd={shiftDate(today, 30)}
      />
    </div>
  );
}
