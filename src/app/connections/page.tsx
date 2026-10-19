import Link from "next/link";
import { Suspense } from "react";
import { Cable, Plus, Table2 } from "lucide-react";
import { getAppContext } from "@/lib/server/session";
import { catalogWithStatus, listConnections } from "@/lib/services/connections";
import { CATEGORY_LABELS, getConnector } from "@/lib/domain/connectors";
import type { ConnectorCategory } from "@/lib/domain/types";
import { Badge, ButtonLink, Callout, Card, CardHeader, EmptyState, PageHeader, PageSkeleton, SimulatedNote, StatusBadge, td, th } from "@/components/ui";
import { ConnectorIcon } from "@/components/connections/connector-icon";
import { RemoveConnectionButton } from "@/components/connections/connection-actions";
import { cx, relativeTime } from "@/lib/format";

export const metadata = { title: "Connections" };

export default function ConnectionsPage(props: PageProps<"/connections">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Connections searchParams={props.searchParams} />
    </Suspense>
  );
}

const FREQ: Record<string, string> = { "15m": "Every 15 min", "1h": "Hourly", "6h": "Every 6 hours", "24h": "Daily" };

async function Connections({ searchParams }: { searchParams: PageProps<"/connections">["searchParams"] }) {
  const { actor, project } = await getAppContext();
  const sp = await searchParams;
  if (!project) return <EmptyState title="No project selected">Create a project first.</EmptyState>;
  const conns = listConnections(actor, project.id);
  const catalog = catalogWithStatus(project.id);
  const categories = Object.keys(CATEGORY_LABELS) as ConnectorCategory[];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Connections"
        description={`Sources and warehouses feeding ${project.name}. Credentials are handled server-side only.`}
        actions={
          <ButtonLink href="/connections/new" variant="primary">
            <Plus className="size-3.5" /> Add connection
          </ButtonLink>
        }
      />
      {sp.removed && <Callout tone="ok" title="Connection removed." />}

      <Card>
        <CardHeader title="Connected sources" description={`${conns.length} connection${conns.length === 1 ? "" : "s"} in this project`} />
        {conns.length === 0 ? (
          <div className="px-4 pb-4">
            <EmptyState icon={<Cable className="size-5" />} title="No sources connected" action={<ButtonLink href="/connections/new" variant="primary">Connect your first source</ButtonLink>}>
              Start with billing (Stripe) and product events (PostHog or Segment). Demo connections generate clearly-labelled sample data so you can explore the full setup flow.
            </EmptyState>
          </div>
        ) : (
          <>
            <div className="px-4 pb-2">
              <SimulatedNote>Demo connection — not connected to a real database. Syncs, row counts and schemas are simulated.</SimulatedNote>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px]">
                <thead className="border-y border-line bg-subtle/50">
                  <tr>
                    <th scope="col" className={th}>Source</th>
                    <th scope="col" className={th}>Status</th>
                    <th scope="col" className={th}>Last sync</th>
                    <th scope="col" className={th}>Tables</th>
                    <th scope="col" className={th}>Frequency</th>
                    <th scope="col" className={th}><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {conns.map((c) => {
                    const def = getConnector(c.connectorId);
                    return (
                      <tr key={c.id} className="border-b border-line last:border-0 hover:bg-subtle/40">
                        <td className={td}>
                          <Link href={`/connections/${c.id}`} className="flex items-center gap-2.5 font-medium text-ink hover:text-accent">
                            <ConnectorIcon id={c.connectorId} />
                            <span>
                              <span className="block">{c.name}</span>
                              <span className="block text-[11.5px] font-normal text-muted">
                                {def?.name} · {c.environment}
                                {c.demo && <span className="ml-1.5 text-warn">· Demo</span>}
                              </span>
                            </span>
                          </Link>
                        </td>
                        <td className={td}>
                          <StatusBadge status={c.status} />
                          {c.error && <p className="mt-1 max-w-[260px] truncate text-[11.5px] text-bad" title={c.error}>{c.error}</p>}
                        </td>
                        <td className={td}>{relativeTime(c.lastSyncAt)}</td>
                        <td className={cx(td, "tabular")}>
                          <span className="inline-flex items-center gap-1"><Table2 aria-hidden className="size-3.5 text-faint" /> {c.tables.length}</span>
                        </td>
                        <td className={td}>{FREQ[c.syncFrequency]}</td>
                        <td className={cx(td, "text-right")}>
                          <div className="flex justify-end gap-1.5">
                            <ButtonLink href={`/connections/${c.id}#configure`} size="sm">Configure</ButtonLink>
                            <RemoveConnectionButton id={c.id} name={c.name} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      <section aria-labelledby="catalog-h">
        <h2 id="catalog-h" className="mb-1 text-[15px] font-semibold text-ink">Connector catalog</h2>
        <p className="mb-4 text-[13px] text-muted">All connectors run in demo mode in this build. &ldquo;Connected&rdquo; means this project has a (demo) connection of that type.</p>
        <div className="space-y-5">
          {categories.map((cat) => {
            const items = catalog.filter((c) => c.category === cat);
            if (!items.length) return null;
            return (
              <div key={cat}>
                <h3 className="mb-2 text-[12px] font-medium tracking-wide text-muted uppercase">{CATEGORY_LABELS[cat]}</h3>
                <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {items.map((c) => {
                    const body = (
                      <>
                        <div className="flex items-start justify-between gap-2">
                          <span className="flex items-center gap-2.5">
                            <ConnectorIcon id={c.id} />
                            <span className="text-[13.5px] font-semibold text-ink">{c.name}</span>
                          </span>
                          {c.status === "connected" ? <StatusBadge status="connected" /> : c.status === "available" ? <Badge tone="accent">Available</Badge> : <Badge>Coming soon</Badge>}
                        </div>
                        <p className="mt-2 text-[12.5px] text-muted">{c.description}</p>
                      </>
                    );
                    return (
                      <li key={c.id}>
                        {c.status === "coming_soon" ? (
                          <div aria-disabled className="h-full rounded-lg border border-line bg-surface/60 p-3.5 opacity-70">{body}</div>
                        ) : (
                          <Link href={`/connections/new?connector=${c.id}`} className="block h-full rounded-lg border border-line bg-surface p-3.5 shadow-card transition-colors hover:border-accent-line">
                            {body}
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
