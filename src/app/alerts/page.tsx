import Link from "next/link";
import { Suspense } from "react";
import { BellRing, Hash, Mail, Plus, Webhook } from "lucide-react";
import { getAppContext } from "@/lib/server/session";
import { listAlerts } from "@/lib/services/alerts";
import { describeCondition } from "@/lib/domain/alert-eval";
import type { Alert } from "@/lib/domain/types";
import { Badge, ButtonLink, Card, CardHeader, DemoBadge, EmptyState, KeyValue, PageHeader, PageSkeleton, SimulatedNote, StatusBadge, td, th } from "@/components/ui";
import { AlertControls, AcknowledgeButton } from "@/components/alerts/alert-controls";
import { cx, formatDate, relativeTime } from "@/lib/format";

export const metadata = { title: "Alerts" };

export default function AlertsPage(props: PageProps<"/alerts">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Alerts searchParams={props.searchParams} />
    </Suspense>
  );
}

const CHANNEL_ICON = { email: Mail, slack: Hash, webhook: Webhook };
const SEVERITY_TONE = { critical: "bad", warning: "warn", info: "info" } as const;

function isSnoozed(a: Alert) {
  return !!a.snoozedUntil && Date.parse(a.snoozedUntil) > Date.now();
}

function alertState(a: Alert) {
  if (a.draft) return { status: "draft", label: "Draft" };
  if (a.status === "paused") return { status: "paused", label: "Paused" };
  if (isSnoozed(a)) return { status: "suppressed", label: "Snoozed" };
  if (a.history[0]?.state === "fired" && !a.history[0].acknowledgedBy) return { status: "fired", label: "Firing" };
  return { status: "active", label: "Active" };
}

async function Alerts({ searchParams }: { searchParams: PageProps<"/alerts">["searchParams"] }) {
  const { actor, project, store } = await getAppContext();
  if (!project) return null;
  const sp = await searchParams;
  const alerts = listAlerts(actor, project.id);
  const selectedId = typeof sp.alert === "string" ? sp.alert : undefined;
  const selected = alerts.find((a) => a.id === selectedId);
  const metric = (k?: string) => (k ? store.metrics.find((m) => m.projectId === project.id && m.key === k) : undefined);

  return (
    <div>
      <PageHeader
        eyebrow={project.sampleData ? <DemoBadge label="Demo data · simulated deliveries" /> : undefined}
        title="Alerts"
        description="Get told when a metric moves, data goes stale or a pipeline fails — with cooldowns and consecutive checks to keep noise down."
        actions={
          <ButtonLink href="/alerts/new" variant="primary">
            <Plus className="size-3.5" /> New alert
          </ButtonLink>
        }
      />
      {alerts.length === 0 ? (
        <EmptyState icon={<BellRing className="size-5" />} title="No alerts yet" action={<ButtonLink href="/alerts/new" variant="primary">Create an alert</ButtonLink>}>
          Start with a revenue drop alert and a data-freshness SLA — the two that catch most founder surprises.
        </EmptyState>
      ) : (
        <div className={cx("grid gap-4", selected && "xl:grid-cols-[1fr_420px]")}>
          <Card className="overflow-x-auto self-start">
            <table className={cx("w-full", selected ? "min-w-[560px]" : "min-w-[820px]")}>
              <thead className="border-b border-line">
                <tr>
                  <th scope="col" className={th}>Alert</th>
                  <th scope="col" className={th}>Status</th>
                  <th scope="col" className={th}>Condition</th>
                  {!selected && <th scope="col" className={th}>Cadence</th>}
                  <th scope="col" className={th}>Last triggered</th>
                  {!selected && <th scope="col" className={th}>Delivery</th>}
                </tr>
              </thead>
              <tbody>
                {alerts.map((a) => {
                  const st = alertState(a);
                  const m = metric(a.metricKey);
                  const Icon = CHANNEL_ICON[a.channel];
                  return (
                    <tr key={a.id} className={cx("border-b border-line last:border-0", a.id === selectedId ? "bg-accent-soft/40" : "hover:bg-subtle/60", a.draft && "bg-info-soft/30")}>
                      <td className={td}>
                        <Link href={`/alerts?alert=${a.id}`} scroll={false} className="font-medium text-ink hover:text-accent" aria-current={a.id === selectedId ? "true" : undefined}>
                          {a.name}
                        </Link>
                        <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-muted">
                          <Badge tone={SEVERITY_TONE[a.severity]} className="h-4 px-1.5 text-[10.5px]">{a.severity}</Badge>
                          {m ? m.name : a.type.replace("_", " ")}
                        </div>
                      </td>
                      <td className={td}>
                        <StatusBadge status={st.status} label={st.label} />
                      </td>
                      <td className={td + " max-w-[260px] text-[12px]"}>{describeCondition(a, m?.name, m?.unit).split(". ")[1].replace(/^Fire when /, "")}</td>
                      {!selected && <td className={td + " capitalize"}>{a.cadence}</td>}
                      <td className={td + " whitespace-nowrap"}>{relativeTime(a.lastTriggeredAt)}</td>
                      {!selected && (
                        <td className={td}>
                          <span className="flex items-center gap-1.5 text-[12px]">
                            <Icon aria-hidden className="size-3.5 text-muted" />
                            <span className="max-w-[160px] truncate">{a.recipients.join(", ")}</span>
                          </span>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

          {selected && <AlertDetail alert={selected} metricName={metric(selected.metricKey)?.name} unit={metric(selected.metricKey)?.unit} />}
          {selectedId && !selected && <p className="text-[13px] text-bad">That alert doesn&apos;t exist in this project.</p>}
        </div>
      )}
    </div>
  );
}

function AlertDetail({ alert: a, metricName, unit }: { alert: Alert; metricName?: string; unit?: "count" | "currency" | "percent" }) {
  const st = alertState(a);
  return (
    <Card className="self-start xl:sticky xl:top-20">
      <CardHeader
        title={a.name}
        description={
          <span className="flex items-center gap-2">
            <StatusBadge status={st.status} label={st.label} /> created {relativeTime(a.createdAt)}
            {a.createdVia === "mcp" && " via MCP"}
          </span>
        }
        actions={
          <Link href="/alerts" scroll={false} className="text-[12px] text-muted hover:text-ink" aria-label="Close details">
            Close
          </Link>
        }
      />
      <div className="space-y-4 px-4 pb-4">
        {a.draft && (
          <div className="rounded-md border border-[#c9dbf5] bg-info-soft px-3 py-2 text-[12.5px] text-info">
            <b>Draft — review and activate.</b> This alert was proposed {a.createdVia === "mcp" ? "by an MCP client" : "as a draft"} and won&apos;t evaluate on a schedule until you activate it.
          </div>
        )}
        <p className="rounded-md bg-subtle px-3 py-2 text-[12.5px] text-ink-2">{describeCondition(a, metricName, unit)}</p>
        <KeyValue
          items={[
            { label: "Metric", value: metricName ?? "—" },
            { label: "Lookback", value: `${a.lookbackDays} day(s)` },
            { label: "Channel", value: `${a.channel} → ${a.recipients.join(", ")}` },
            { label: "Severity", value: a.severity },
            { label: "Anti-noise", value: `${a.consecutiveEvaluations} consecutive · ${a.cooldownMinutes}m cooldown` },
            { label: "Last evaluated", value: a.lastEvaluatedAt ? formatDate(a.lastEvaluatedAt, true) : "never" },
            ...(isSnoozed(a) ? [{ label: "Snoozed until", value: formatDate(a.snoozedUntil!, true) }] : []),
          ]}
        />
        <AlertControls id={a.id} status={a.status} draft={a.draft} />
        <SimulatedNote>Evaluations run against demo data and deliveries are simulated — no email, Slack or webhook messages are sent.</SimulatedNote>
        <div>
          <h3 className="mb-2 text-[12.5px] font-semibold text-ink-2">History</h3>
          {a.history.length === 0 ? (
            <p className="text-[12.5px] text-muted">No evaluations recorded yet. Run one now to see the result.</p>
          ) : (
            <ol className="space-y-2">
              {a.history.slice(0, 12).map((h) => (
                <li key={h.id} className="rounded-md border border-line px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <StatusBadge status={h.state} />
                    <span className="text-[11.5px] text-faint">{formatDate(h.at, true)}</span>
                  </div>
                  <p className="mt-1 text-[12.5px] whitespace-pre-line text-ink-2">{h.message}</p>
                  <div className="mt-1 flex items-center justify-between text-[11.5px] text-muted">
                    <span>Delivery: {h.delivery === "simulated" ? "simulated" : "not sent"}</span>
                    {h.state === "fired" && (h.acknowledgedBy ? <span>Acknowledged by {h.acknowledgedBy}</span> : <AcknowledgeButton alertId={a.id} eventId={h.id} />)}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </Card>
  );
}
