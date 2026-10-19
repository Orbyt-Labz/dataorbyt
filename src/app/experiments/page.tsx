import Link from "next/link";
import { Suspense } from "react";
import { FlaskConical, Plus } from "lucide-react";
import { getAppContext } from "@/lib/server/session";
import { listExperiments } from "@/lib/services/experiments";
import { analyzeExperiment } from "@/lib/domain/stats";
import { ButtonLink, Card, DemoBadge, EmptyState, PageHeader, PageSkeleton, StatusBadge, td, th } from "@/components/ui";
import { formatDate, formatNumber } from "@/lib/format";

export const metadata = { title: "Experiments" };

export default function ExperimentsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Experiments />
    </Suspense>
  );
}

async function Experiments() {
  const { actor, project, store } = await getAppContext();
  if (!project) return null;
  const experiments = listExperiments(actor, project.id);
  const metricName = (k: string) => store.metrics.find((m) => m.projectId === project.id && m.key === k)?.name ?? k;
  const counts = { running: 0, draft: 0, completed: 0, stopped: 0 };
  experiments.forEach((e) => counts[e.status]++);

  return (
    <div>
      <PageHeader
        eyebrow={project.sampleData ? <DemoBadge /> : undefined}
        title="Experiments"
        description="Instrument assignments and exposures in your product, then read out results against governed metrics."
        actions={
          <ButtonLink href="/experiments/new" variant="primary">
            <Plus className="size-3.5" /> New experiment
          </ButtonLink>
        }
      />
      {experiments.length === 0 ? (
        <EmptyState
          icon={<FlaskConical className="size-5" />}
          title="No experiments yet"
          action={
            <ButtonLink href="/experiments/new" variant="primary">
              Design an experiment
            </ButtonLink>
          }
        >
          Define a hypothesis, variants and metrics, then send assignment and exposure events from your product. DataOrbyt checks sample-ratio mismatch and only shows inference when it&apos;s reliable.
        </EmptyState>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-2 text-[12.5px] text-muted">
            <span>{counts.running} running</span>·<span>{counts.draft} draft</span>·<span>{counts.completed} completed</span>
            {counts.stopped > 0 && (
              <>
                ·<span>{counts.stopped} stopped</span>
              </>
            )}
          </div>
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[860px]">
              <thead className="border-b border-line">
                <tr>
                  <th scope="col" className={th}>Experiment</th>
                  <th scope="col" className={th}>Status</th>
                  <th scope="col" className={th}>Owner</th>
                  <th scope="col" className={th}>Dates</th>
                  <th scope="col" className={th}>Primary metric</th>
                  <th scope="col" className={th}>Sample / arm</th>
                  <th scope="col" className={th}>Guardrails</th>
                </tr>
              </thead>
              <tbody>
                {experiments.map((e) => {
                  const a = analyzeExperiment(e);
                  const minExposed = a.variants.length ? Math.min(...a.variants.map((v) => v.exposed)) : 0;
                  const breached = a.guardrails.filter((g) => g.breached).length;
                  return (
                    <tr key={e.id} className="border-b border-line last:border-0 hover:bg-subtle/60">
                      <td className={td}>
                        <Link href={`/experiments/${e.id}`} className="font-medium text-ink hover:text-accent">
                          {e.name}
                        </Link>
                        <div className="font-mono text-[11.5px] text-faint">{e.key}</div>
                        {e.createdVia === "mcp" && <div className="text-[11px] text-info">Created via MCP</div>}
                      </td>
                      <td className={td}>
                        <StatusBadge status={e.status} />
                        {a.status.available === false && a.status.code === "srm" && <div className="mt-1 text-[11px] text-bad">SRM detected</div>}
                      </td>
                      <td className={td}>{e.owner}</td>
                      <td className={td + " whitespace-nowrap"}>
                        {formatDate(e.startDate)} – {formatDate(e.endDate)}
                      </td>
                      <td className={td}>
                        <Link href={`/metrics/${e.primaryMetric}`} className="hover:text-accent">
                          {metricName(e.primaryMetric)}
                        </Link>
                      </td>
                      <td className={td}>
                        {e.status === "draft" ? (
                          <span className="text-muted">{e.targetSampleSizePerVariant ? `Target ${formatNumber(e.targetSampleSizePerVariant)}` : "—"}</span>
                        ) : (
                          <div className="w-32">
                            <div className="tabular text-[12.5px]">
                              {formatNumber(minExposed)}
                              {e.targetSampleSizePerVariant ? <span className="text-faint"> / {formatNumber(e.targetSampleSizePerVariant)}</span> : null}
                            </div>
                            {a.progress !== null && (
                              <div className="mt-1 h-1 overflow-hidden rounded-full bg-subtle" role="progressbar" aria-label="Progress to target sample" aria-valuenow={Math.round(a.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
                                <div className="h-full rounded-full bg-accent" style={{ width: `${a.progress * 100}%` }} />
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className={td}>
                        <div className="text-[12.5px]">{e.guardrailMetrics.map(metricName).join(", ") || "—"}</div>
                        {breached > 0 && <div className="text-[11px] text-bad">{breached} breached</div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}
