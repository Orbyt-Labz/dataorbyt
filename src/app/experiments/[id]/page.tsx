import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, Info, ShieldAlert } from "lucide-react";
import { getAppContext } from "@/lib/server/session";
import { getExperiment } from "@/lib/services/experiments";
import { ServiceError } from "@/lib/services/context";
import { INFERENCE_RULES, type ExperimentAnalysis } from "@/lib/domain/stats";
import { formatValue } from "@/lib/domain/chart-data";
import { Badge, Callout, Card, CardHeader, DemoBadge, KeyValue, PageHeader, PageSkeleton, StatusBadge, td, th } from "@/components/ui";
import { CodeBlock } from "@/components/ui-client";
import { StatusControls } from "@/components/experiments/status-controls";
import { cx, formatDate, formatNumber } from "@/lib/format";

export default function ExperimentPage(props: PageProps<"/experiments/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ExperimentDetail params={props.params} />
    </Suspense>
  );
}

const pct = (v: number | null | undefined, d = 1) => (v === null || v === undefined ? "—" : `${(v * 100).toFixed(d)}%`);
const signedPts = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v * 100).toFixed(2)} pts`;

function CiBar({ ci, diff }: { ci: [number, number]; diff: number }) {
  const lo = Math.min(ci[0], 0);
  const hi = Math.max(ci[1], 0);
  const pad = (hi - lo) * 0.15 || 0.01;
  const min = lo - pad;
  const max = hi + pad;
  const x = (v: number) => ((v - min) / (max - min)) * 100;
  const excludesZero = ci[0] > 0 || ci[1] < 0;
  return (
    <figure className="mt-2">
      <div className="relative h-8" role="img" aria-label={`95% confidence interval from ${signedPts(ci[0])} to ${signedPts(ci[1])}; point estimate ${signedPts(diff)}`}>
        <div className="absolute top-1/2 right-0 left-0 h-px bg-line" />
        <div className="absolute top-1 bottom-1 w-px bg-ink-2" style={{ left: `${x(0)}%` }} />
        <div className={cx("absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full", excludesZero ? "bg-[#2a78d6]" : "bg-faint")} style={{ left: `${x(ci[0])}%`, width: `${x(ci[1]) - x(ci[0])}%` }} />
        <div className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-ink" style={{ left: `${x(diff)}%` }} />
      </div>
      <figcaption className="relative h-4 text-[11px] text-muted tabular">
        {[
          { v: 0, label: "0 (no effect)" },
          { v: ci[0], label: signedPts(ci[0]) },
          { v: ci[1], label: signedPts(ci[1]) },
        ].map((t) => (
          <span key={t.label} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${Math.min(92, Math.max(8, x(t.v)))}%` }}>
            {t.label}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

function Outcome({ a }: { a: ExperimentAnalysis }) {
  const control = a.variants.find((v) => v.isControl);
  const treat = a.variants.find((v) => !v.isControl);
  if (!a.status.available) {
    return (
      <div className="space-y-3">
        <div className="rounded-md border border-[#f3dcb4] bg-warn-soft px-3 py-2.5">
          <div className="flex items-center gap-2 text-[13.5px] font-semibold text-warn">
            <ShieldAlert className="size-4" /> Descriptive only — inference unavailable
          </div>
          <p className="mt-1 text-[13px] text-ink-2">{a.status.reason}</p>
          <p className="mt-1 text-[12px] text-muted">No confidence interval, p-value or significance is shown. Observed rates below are descriptive and should not be used to declare a winner.</p>
        </div>
        {control && treat && control.rate !== null && treat.rate !== null && (
          <div className="grid grid-cols-2 gap-3 text-[13px] sm:grid-cols-3">
            <div>
              <div className="text-muted">{control.name}</div>
              <div className="text-[20px] font-semibold tabular">{pct(control.rate)}</div>
            </div>
            <div>
              <div className="text-muted">{treat.name}</div>
              <div className="text-[20px] font-semibold tabular">{pct(treat.rate)}</div>
            </div>
            <div>
              <div className="text-muted">Observed difference</div>
              <div className="text-[20px] font-semibold text-ink-2 tabular">{signedPts(treat.rate - control.rate)}</div>
              <div className="text-[11.5px] text-faint">descriptive</div>
            </div>
          </div>
        )}
      </div>
    );
  }
  const e = a.effect!;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <div className="text-[12px] text-muted">Control</div>
          <div className="text-[20px] font-semibold tabular">{pct(e.pControl)}</div>
        </div>
        <div>
          <div className="text-[12px] text-muted">Treatment</div>
          <div className="text-[20px] font-semibold tabular">{pct(e.pTreatment)}</div>
        </div>
        <div>
          <div className="text-[12px] text-muted">Difference (abs.)</div>
          <div className="text-[20px] font-semibold tabular">{signedPts(e.diff)}</div>
        </div>
        <div>
          <div className="text-[12px] text-muted">Relative lift</div>
          <div className="text-[20px] font-semibold tabular">{e.relativeLift === null ? "—" : `${e.relativeLift >= 0 ? "+" : ""}${(e.relativeLift * 100).toFixed(1)}%`}</div>
        </div>
      </div>
      <div>
        <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
          <span className="font-medium text-ink-2">95% confidence interval for the difference:</span>
          <span className="tabular">
            [{signedPts(e.ci[0])}, {signedPts(e.ci[1])}]
          </span>
          <span className="text-muted">· two-sided p = {e.pValue < 0.0001 ? "< 0.0001" : e.pValue.toFixed(4)}</span>
          {a.significant ? <Badge tone="ok" icon={<CheckCircle2 className="size-3" />}>Statistically significant at α = {INFERENCE_RULES.alpha}</Badge> : <Badge tone="neutral">Not significant at α = {INFERENCE_RULES.alpha}</Badge>}
        </div>
        <CiBar ci={e.ci} diff={e.diff} />
      </div>
    </div>
  );
}

async function ExperimentDetail({ params }: { params: PageProps<"/experiments/[id]">["params"] }) {
  const { actor, store } = await getAppContext();
  const { id } = await params;
  let data;
  try {
    data = getExperiment(actor, id);
  } catch (e) {
    if (e instanceof ServiceError && (e.code === "not_found" || e.code === "forbidden")) notFound();
    throw e;
  }
  const { experiment: exp, analysis: a } = data;
  const project = store.projects.find((p) => p.id === exp.projectId)!;
  const metric = (k: string) => store.metrics.find((m) => m.projectId === exp.projectId && m.key === k);
  const primary = metric(exp.primaryMetric);
  const dashboards = store.dashboards.filter((d) => exp.relatedDashboardIds.includes(d.id));
  const totalAssigned = a.variants.reduce((s, v) => s + v.assigned, 0);
  const seeded = exp.createdVia === "seed";

  const tsExample = `// Server-side only. Never ship the API token to browsers.
const DATAORBYT_API_TOKEN = process.env.DATAORBYT_API_TOKEN; // <your-token>

async function track(event: Record<string, unknown>) {
  await fetch("https://<your-dataorbyt-domain>/api/events", {
    method: "POST",
    headers: {
      "Authorization": \`Bearer \${DATAORBYT_API_TOKEN}\`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(event),
  });
}

// 1) When the user is bucketed (stable, deterministic assignment)
await track({
  type: "experiment_assignment",
  event_id: crypto.randomUUID(),       // idempotency key
  experiment_id: "${exp.key}",
  variant: "${exp.variants.find((v) => !v.isControl)?.key ?? "treatment"}",
  subject_id: user.id,                  // ${exp.randomizationUnit} id
  assigned_at: new Date().toISOString(),
});

// 2) When the user actually sees the change
await track({
  type: "experiment_exposure",
  event_id: crypto.randomUUID(),
  experiment_id: "${exp.key}",
  variant: "${exp.variants.find((v) => !v.isControl)?.key ?? "treatment"}",
  subject_id: user.id,
  exposed_at: new Date().toISOString(),
});`;

  const curlExample = `export DATAORBYT_API_TOKEN=<your-token>

curl -X POST https://<your-dataorbyt-domain>/api/events \\
  -H "Authorization: Bearer $DATAORBYT_API_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "type": "experiment_exposure",
    "event_id": "0b7c2a6e-3d1f-4c55-9a0e-5f1e2d3c4b5a",
    "experiment_id": "${exp.key}",
    "variant": "${exp.variants[0]?.key ?? "control"}",
    "subject_id": "${exp.randomizationUnit}_123",
    "exposed_at": "2026-10-16T12:00:00Z"
  }'`;

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={
          <span className="flex items-center gap-2">
            <Link href="/experiments" className="hover:text-ink">
              Experiments
            </Link>
            / <span className="font-mono">{exp.key}</span>
            {(seeded || project.sampleData) && <DemoBadge />}
            {exp.createdVia === "mcp" && <Badge tone="info">Draft via MCP</Badge>}
          </span>
        }
        title={
          <span className="flex flex-wrap items-center gap-2">
            {exp.name} <StatusBadge status={exp.status} />
          </span>
        }
        description={exp.hypothesis}
        actions={<StatusControls id={exp.id} status={exp.status} />}
      />

      <div className="grid grid-cols-12 gap-3">
        <Card className="col-span-12 lg:col-span-8">
          <CardHeader
            title={`Primary outcome · ${primary?.name ?? exp.primaryMetric}`}
            description="Conversions ÷ exposed units per variant"
            actions={primary && <Link href={`/metrics/${primary.key}`} className="text-[12px] text-accent hover:underline">Metric definition</Link>}
          />
          <div className="px-4 pb-4">
            {exp.status === "draft" ? (
              <p className="py-6 text-center text-[13px] text-muted">No results yet — this experiment hasn&apos;t started. Start it once your product sends assignment and exposure events.</p>
            ) : (
              <Outcome a={a} />
            )}
          </div>
        </Card>
        <Card className="col-span-12 lg:col-span-4">
          <CardHeader title="Design" />
          <div className="px-4 pb-4">
            <KeyValue
              items={[
                { label: "Owner", value: exp.owner },
                { label: "Population", value: exp.population },
                { label: "Unit", value: `Per ${exp.randomizationUnit}` },
                { label: "Dates", value: `${formatDate(exp.startDate)} – ${formatDate(exp.endDate)}` },
                { label: "MDE", value: exp.minimumDetectableEffectPct ? `${exp.minimumDetectableEffectPct}% relative` : "—" },
                { label: "Target / arm", value: exp.targetSampleSizePerVariant ? formatNumber(exp.targetSampleSizePerVariant) : "—" },
                { label: "Variants", value: exp.variants.map((v) => `${v.name} ${v.allocation}%`).join(" · ") },
              ]}
            />
          </div>
        </Card>
      </div>

      {exp.status !== "draft" && (
        <div className="grid grid-cols-12 gap-3">
          <Card className="col-span-12 overflow-x-auto lg:col-span-8">
            <CardHeader title="Variants, assignment & exposure" description={`${formatNumber(totalAssigned)} units assigned`} />
            <table className="w-full min-w-[620px]">
              <thead className="border-y border-line bg-subtle/40">
                <tr>
                  <th scope="col" className={th}>Variant</th>
                  <th scope="col" className={th + " text-right"}>Planned</th>
                  <th scope="col" className={th + " text-right"}>Assigned</th>
                  <th scope="col" className={th + " text-right"}>Actual share</th>
                  <th scope="col" className={th + " text-right"}>Exposed</th>
                  <th scope="col" className={th + " text-right"}>Conversions</th>
                  <th scope="col" className={th + " text-right"}>Rate</th>
                </tr>
              </thead>
              <tbody>
                {a.variants.map((v) => (
                  <tr key={v.key} className="border-b border-line last:border-0">
                    <td className={td}>
                      <span className="font-medium text-ink">{v.name}</span> <span className="font-mono text-[11.5px] text-faint">{v.key}</span>
                      {v.isControl && <span className="ml-1.5 text-[11px] text-muted">control</span>}
                    </td>
                    <td className={td + " text-right tabular"}>{v.allocation}%</td>
                    <td className={td + " text-right tabular"}>{formatNumber(v.assigned)}</td>
                    <td className={td + " text-right tabular"}>{totalAssigned ? pct(v.assigned / totalAssigned) : "—"}</td>
                    <td className={td + " text-right tabular"}>{formatNumber(v.exposed)}</td>
                    <td className={td + " text-right tabular"}>{formatNumber(v.conversions)}</td>
                    <td className={td + " text-right font-medium text-ink tabular"}>{pct(v.rate, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="space-y-2 border-t border-line px-4 py-3">
              {a.srm ? (
                a.srm.mismatch ? (
                  <Callout tone="bad" title="Sample-ratio mismatch">
                    Assigned counts deviate from the planned split (χ² = {a.srm.chi2.toFixed(2)}, p = {a.srm.pValue.toExponential(1)} &lt; {INFERENCE_RULES.srmAlpha}). Check assignment logic, bot filtering and event loss before trusting any result.
                  </Callout>
                ) : (
                  <p className="flex items-center gap-1.5 text-[12.5px] text-ok">
                    <CheckCircle2 className="size-3.5" /> Assignment balance OK — SRM check χ² = {a.srm.chi2.toFixed(2)}, p = {a.srm.pValue.toFixed(3)}
                  </p>
                )
              ) : (
                <p className="text-[12.5px] text-muted">SRM check requires a two-arm experiment with assignments.</p>
              )}
              {a.progress !== null && (
                <div>
                  <div className="flex justify-between text-[12px] text-muted">
                    <span>Progress to planned sample (smallest arm, exposed)</span>
                    <span className="tabular">{Math.round(a.progress * 100)}%</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-subtle" role="progressbar" aria-label="Progress to planned sample" aria-valuenow={Math.round(a.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
                    <div className="h-full rounded-full bg-accent" style={{ width: `${a.progress * 100}%` }} />
                  </div>
                </div>
              )}
            </div>
          </Card>
          <Card className="col-span-12 lg:col-span-4">
            <CardHeader title="Guardrails" description="Treatment vs control, with tolerance" />
            <ul className="px-4 pb-4">
              {a.guardrails.length === 0 && <li className="py-4 text-center text-[13px] text-muted">No guardrail observations.</li>}
              {a.guardrails.map((g) => {
                const m = metric(g.metricKey);
                return (
                  <li key={g.metricKey} className="border-b border-line py-2 last:border-0">
                    <div className="flex items-center justify-between gap-2">
                      <Link href={`/metrics/${g.metricKey}`} className="text-[13px] font-medium text-ink hover:text-accent">
                        {m?.name ?? g.metricKey}
                      </Link>
                      {g.breached ? <Badge tone="bad" icon={<AlertTriangle className="size-3" />}>Breached</Badge> : <Badge tone="ok" icon={<CheckCircle2 className="size-3" />}>Within tolerance</Badge>}
                    </div>
                    <div className="mt-0.5 text-[12px] text-muted tabular">
                      {formatValue(g.control, m?.unit ?? "count", project.currency, false)} → {formatValue(g.treatment, m?.unit ?? "count", project.currency, false)} ({g.deltaPct >= 0 ? "+" : ""}
                      {g.deltaPct.toFixed(1)}%) · harmful if {g.harmfulDirection} by &gt; {g.tolerancePct}%
                    </div>
                  </li>
                );
              })}
              <li className="pt-2 text-[11.5px] text-faint">Guardrails are descriptive comparisons; they are not significance-tested.</li>
            </ul>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-12 gap-3">
        <Card className="col-span-12 lg:col-span-5">
          <CardHeader title="Methodology" description="How DataOrbyt analyses two-arm tests" />
          <div className="space-y-2 px-4 pb-4 text-[12.5px] text-ink-2">
            <p>
              <b>Outcome.</b> Conversion rate = conversions ÷ exposed units per variant (analysis on exposed {exp.randomizationUnit}s).
            </p>
            <p>
              <b>Effect.</b> Absolute difference p<sub>t</sub> − p<sub>c</sub> and relative lift. 95% CI uses a Wald interval with unpooled standard error; the two-sided p-value uses a pooled two-proportion z-test.
            </p>
            <p>
              <b>SRM.</b> χ² goodness-of-fit of assigned counts vs planned allocation; p &lt; {INFERENCE_RULES.srmAlpha} invalidates the readout.
            </p>
            <p>
              <b>Withheld when:</b> not exactly two arms; SRM detected; fewer than {INFERENCE_RULES.minExposedPerArm} exposed or {INFERENCE_RULES.minEventsPerArm} conversions / non-conversions per arm; or a running test is below its planned sample (no peeking at a fixed-horizon test).
            </p>
            <p>
              <b>Assumptions.</b> Independent units, randomization at the analysis unit, a pre-registered fixed horizon and large-sample normality. No multiple-comparison correction is applied to guardrails.
            </p>
          </div>
        </Card>
        <Card className="col-span-12 lg:col-span-7">
          <CardHeader title="Assignment & exposure events" description="Send these from your backend. Events are deduplicated by event_id." />
          <div className="overflow-x-auto px-4 pb-3">
            <table className="w-full min-w-[480px] text-[12.5px]">
              <thead>
                <tr className="border-b border-line">
                  <th scope="col" className={th}>Field</th>
                  <th scope="col" className={th}>Type</th>
                  <th scope="col" className={th}>Notes</th>
                </tr>
              </thead>
              <tbody className="font-mono text-[12px]">
                {[
                  ["event_id", "uuid", "Idempotency key — resends with the same id are ignored"],
                  ["experiment_id", "string", `Experiment key, e.g. ${exp.key}`],
                  ["variant", "string", exp.variants.map((v) => v.key).join(" | ")],
                  ["subject_id", "string", `Stable ${exp.randomizationUnit} identifier`],
                  ["assigned_at", "timestamp", "UTC, on experiment_assignment"],
                  ["exposed_at", "timestamp", "UTC, on experiment_exposure (first time the change is seen)"],
                ].map(([f, t, n]) => (
                  <tr key={f} className="border-b border-line last:border-0">
                    <td className="px-3 py-1.5 text-ink">{f}</td>
                    <td className="px-3 py-1.5 text-muted">{t}</td>
                    <td className="px-3 py-1.5 font-sans text-ink-2">{n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-3 px-4 pb-4">
            <Callout tone="warn" title="Ingestion endpoint not implemented in this demo">
              <code className="font-mono text-[12px]">/api/events</code> is the planned contract. Placeholders below are not working credentials or URLs.
            </Callout>
            <CodeBlock label="TypeScript (server-side)" code={tsExample} />
            <CodeBlock label="curl" code={curlExample} />
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Related" />
        <div className="flex flex-wrap gap-2 px-4 pb-4 text-[13px]">
          {[exp.primaryMetric, ...exp.guardrailMetrics].map((k) => (
            <Link key={k} href={`/metrics/${k}`} className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 hover:bg-subtle">
              <Info className="size-3 text-muted" /> {metric(k)?.name ?? k}
            </Link>
          ))}
          {dashboards.map((d) => (
            <Link key={d.id} href={`/dashboards/${d.id}`} className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 hover:bg-subtle">
              <ExternalLink className="size-3 text-muted" /> {d.name}
            </Link>
          ))}
          {dashboards.length === 0 && <span className="text-muted">No related dashboards yet.</span>}
        </div>
      </Card>
    </div>
  );
}
