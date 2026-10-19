import { notFound } from "next/navigation";
import { Suspense } from "react";
import { KeyRound } from "lucide-react";
import { getAppContext } from "@/lib/server/session";
import { getConnection } from "@/lib/services/connections";
import { ServiceError } from "@/lib/services/context";
import { getConnector } from "@/lib/domain/connectors";
import { Badge, Callout, Card, CardHeader, KeyValue, PageHeader, PageSkeleton, SimulatedNote, StatusBadge, td, th } from "@/components/ui";
import { ConnectorIcon } from "@/components/connections/connector-icon";
import { ConfigureConnectionForm, RemoveConnectionButton, SyncNowButton } from "@/components/connections/connection-actions";
import { cx, formatDate, formatNumber, relativeTime } from "@/lib/format";

export default function ConnectionDetailPage(props: PageProps<"/connections/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ConnectionDetail params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

async function ConnectionDetail({ params, searchParams }: { params: PageProps<"/connections/[id]">["params"]; searchParams: PageProps<"/connections/[id]">["searchParams"] }) {
  const { actor } = await getAppContext();
  const { id } = await params;
  const sp = await searchParams;
  let c;
  try {
    c = getConnection(actor, id);
  } catch (e) {
    if (e instanceof ServiceError) notFound();
    throw e;
  }
  const def = getConnector(c.connectorId);
  const fieldLabel = (k: string) => def?.fields.find((f) => f.key === k)?.label ?? k;

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Connections"
        title={
          <span className="flex items-center gap-3">
            <ConnectorIcon id={c.connectorId} className="size-9" /> {c.name}
          </span>
        }
        description={`${def?.name ?? c.connectorId} · ${c.environment} · created ${formatDate(c.createdAt)}`}
        actions={
          <>
            <SyncNowButton id={c.id} disabled={c.status === "paused"} />
            <RemoveConnectionButton id={c.id} name={c.name} size="md" />
          </>
        }
      />
      {sp.created && <Callout tone="ok" title="Connection created (demo)">Schema discovery ran against the demo adapter. Secret values were discarded after the test.</Callout>}
      {c.demo && <SimulatedNote>Demo connection — not connected to a real database. Tables, row counts and sync runs below are simulated.</SimulatedNote>}
      {c.error && <Callout tone="bad" title="Latest sync failed">{c.error} Rotate the credential in the source system, then reconnect.</Callout>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title="Status" />
          <div className="px-4 pb-4">
            <KeyValue
              items={[
                { label: "Status", value: <StatusBadge status={c.status} /> },
                { label: "Last sync", value: c.lastSyncAt ? `${relativeTime(c.lastSyncAt)} (${formatDate(c.lastSyncAt, true)})` : "never" },
                { label: "Frequency", value: c.syncFrequency },
                { label: "Tables", value: c.tables.length },
                ...Object.entries(c.config).map(([k, v]) => ({ label: fieldLabel(k), value: <span className="font-mono text-[12px] break-all">{v}</span> })),
              ]}
            />
            <div className="mt-4 border-t border-line pt-3">
              <div className="text-[12px] font-medium text-muted">Secret fields</div>
              <ul className="mt-1.5 space-y-1">
                {c.secretFieldsProvided.length === 0 && <li className="text-[12.5px] text-muted">None</li>}
                {c.secretFieldsProvided.map((s) => (
                  <li key={s} className="flex items-center gap-2 text-[12.5px] text-ink-2">
                    <KeyRound aria-hidden className="size-3.5 text-faint" /> {fieldLabel(s)}
                    <Badge tone="warn">value discarded (demo)</Badge>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Schema preview" description="Tables discovered by the (demo) adapter. Expand a table to see columns." />
          <ul className="divide-y divide-line border-t border-line">
            {c.tables.length === 0 && <li className="px-4 py-6 text-center text-[13px] text-muted">No tables discovered yet.</li>}
            {c.tables.map((t) => (
              <li key={t.name}>
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 text-[13px] hover:bg-subtle/50">
                    <span className="font-mono text-[12.5px] text-ink">{t.name}</span>
                    <span className="flex items-center gap-3 text-[12px] text-muted">
                      <span className="tabular">{formatNumber(t.rows)} rows</span>
                      <span>{t.columns.length} cols</span>
                      <span aria-hidden className="transition-transform group-open:rotate-90">›</span>
                    </span>
                  </summary>
                  <div className="bg-subtle/40 px-4 pb-3">
                    <table className="w-full text-[12.5px]">
                      <thead>
                        <tr>
                          <th scope="col" className="py-1.5 text-left font-medium text-muted">Column</th>
                          <th scope="col" className="py-1.5 text-left font-medium text-muted">Type</th>
                        </tr>
                      </thead>
                      <tbody>
                        {t.columns.map((col) => (
                          <tr key={col.name} className="border-t border-line/70">
                            <td className="py-1 font-mono">{col.name}</td>
                            <td className="py-1 text-muted">{col.type}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card>
        <CardHeader title="Sync history" description="Most recent first. All runs are simulated." />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead className="border-y border-line bg-subtle/50">
              <tr>
                <th scope="col" className={th}>Started</th>
                <th scope="col" className={th}>Status</th>
                <th scope="col" className={th}>Duration</th>
                <th scope="col" className={th}>Rows synced</th>
                <th scope="col" className={th}>Message</th>
              </tr>
            </thead>
            <tbody>
              {c.syncHistory.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-0">
                  <td className={td}>{formatDate(r.startedAt, true)}</td>
                  <td className={td}>
                    <StatusBadge status={r.status} />
                  </td>
                  <td className={cx(td, "tabular")}>{r.durationSec}s</td>
                  <td className={cx(td, "tabular")}>{formatNumber(r.rowsSynced)}</td>
                  <td className={cx(td, "max-w-[360px] text-[12.5px] text-muted")}>{r.message ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card id="configure">
        <CardHeader title="Configure" description="Credentials can't be viewed or edited here — create a new connection to rotate them." />
        <div className="px-4 pb-4">
          <ConfigureConnectionForm id={c.id} name={c.name} syncFrequency={c.syncFrequency} paused={c.status === "paused"} />
        </div>
      </Card>
    </div>
  );
}
