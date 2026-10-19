import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight } from "lucide-react";
import { getAppContext } from "@/lib/server/session";
import { CURRENCIES, TIMEZONES } from "@/lib/services/projects";
import { listTokens } from "@/lib/services/tokens";
import { getUsage, QUERY_LIMITS } from "@/lib/services/query";
import { getWorkspace, listAudit } from "@/lib/services/workspace";
import { formatBytes } from "@/lib/domain/chart-data";
import { Avatar, Badge, ButtonLink, Callout, Card, CardHeader, KeyValue, PageHeader, PageSkeleton, StatusBadge, TabLinks, td, th } from "@/components/ui";
import { CopyButton } from "@/components/ui-client";
import { InviteForm, NotificationsForm, RoleSelect, WorkspaceForm } from "@/components/settings/forms";
import { TokenManager } from "@/components/mcp/token-manager";
import { MCP_PLACEHOLDER_URL } from "@/components/mcp/constants";
import { cx, formatDate, relativeTime } from "@/lib/format";

export const metadata = { title: "Settings" };

const TABS = [
  { key: "general", label: "General" },
  { key: "members", label: "Members & roles" },
  { key: "project", label: "Project defaults" },
  { key: "security", label: "Security" },
  { key: "tokens", label: "API tokens" },
  { key: "audit", label: "Audit log" },
  { key: "notifications", label: "Notifications" },
  { key: "usage", label: "Query usage" },
] as const;
type Tab = (typeof TABS)[number]["key"];

export default function SettingsPage(props: PageProps<"/settings">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Settings searchParams={props.searchParams} />
    </Suspense>
  );
}

function Prototype() {
  return <Badge tone="warn" className="border-dashed">Prototype</Badge>;
}

async function Settings({ searchParams }: { searchParams: PageProps<"/settings">["searchParams"] }) {
  const { project, projects } = await getAppContext();
  const sp = await searchParams;
  const tab: Tab = TABS.some((t) => t.key === sp.tab) ? (sp.tab as Tab) : "general";
  const { workspace, members } = getWorkspace();

  return (
    <div>
      <PageHeader title="Settings" description={`${workspace.name} · ${workspace.plan} plan`} />
      <TabLinks active={tab} tabs={TABS.map((t) => ({ key: t.key, label: t.label, href: `/settings?tab=${t.key}` }))} />

      {tab === "general" && (
        <div className="space-y-4">
          <Card>
            <CardHeader title="Workspace profile" />
            <div className="px-4 pb-4">
              <WorkspaceForm initial={{ name: workspace.name, defaultTimezone: workspace.defaultTimezone, defaultCurrency: workspace.defaultCurrency }} timezones={TIMEZONES} currencies={CURRENCIES} />
            </div>
          </Card>
          <Card>
            <CardHeader title="MCP server URL" description="Connect Claude or ChatGPT to this workspace." actions={<ButtonLink href="/mcp-api" size="sm">Setup guide <ArrowRight className="size-3" /></ButtonLink>} />
            <div className="space-y-2 px-4 pb-4">
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-md border border-line bg-subtle px-2.5 py-1.5 font-mono text-[13px]">{MCP_PLACEHOLDER_URL}</code>
                <CopyButton value={MCP_PLACEHOLDER_URL} />
              </div>
              <p className="text-[12px] text-muted">Placeholder until a deployment domain exists — not a working URL. The local endpoint and live status are on the MCP & API page.</p>
            </div>
          </Card>
        </div>
      )}

      {tab === "members" && (
        <Card>
          <CardHeader title="Members & roles" description="Owner > Admin (settings, tokens) > Editor (dashboards, metrics, alerts) > Viewer (read-only)." actions={<Prototype />} />
          <div className="space-y-4 px-4 pb-4">
            <InviteForm />
            <p className="text-[12px] text-muted">Invites are recorded only — no email is sent and roles aren&apos;t enforced in this demo (everyone acts as the owner).</p>
            <ul className="divide-y divide-line rounded-md border border-line">
              {members.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                  <Avatar name={m.name || m.email} className="size-8" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium text-ink">{m.name || <span className="text-muted">Pending invite</span>}</div>
                    <div className="text-[12px] text-muted">{m.email}</div>
                  </div>
                  {m.status === "invited" && <Badge tone="info">Invited</Badge>}
                  {m.role === "owner" ? <Badge tone="accent">Owner</Badge> : <RoleSelect memberId={m.id} role={m.role} label={m.name || m.email} />}
                </li>
              ))}
            </ul>
          </div>
        </Card>
      )}

      {tab === "project" && (
        <Card>
          <CardHeader title="Project defaults" description="Settings for the active project. New projects inherit the workspace defaults." actions={project && <ButtonLink href={`/projects/${project.id}?tab=settings`} size="sm">Edit project settings <ArrowRight className="size-3" /></ButtonLink>} />
          <div className="px-4 pb-4">
            {project ? (
              <KeyValue
                items={[
                  { label: "Project", value: project.name },
                  { label: "Environment", value: project.environment },
                  { label: "Timezone", value: project.timezone },
                  { label: "Currency", value: project.currency },
                  { label: "Industry", value: project.industry ?? "—" },
                  { label: "Default date range", value: "Last 30 days (ranges over 60 days show a cost warning)" },
                  { label: "Workspace defaults", value: `${workspace.defaultTimezone} · ${workspace.defaultCurrency}` },
                ]}
              />
            ) : (
              <p className="text-[13px] text-muted">No active project.</p>
            )}
          </div>
        </Card>
      )}

      {tab === "security" && (
        <div className="space-y-4">
          <Callout tone="warn" title="Prototype security posture">
            This demo has no sign-in. Every request acts as the seeded workspace owner. Do not expose it publicly with real data.
          </Callout>
          <Card>
            <CardHeader title="Security" actions={<Prototype />} />
            <ul className="space-y-2.5 px-4 pb-4 text-[13px] text-ink-2">
              {[
                ["Authentication & SSO", "Not implemented. Planned: email magic links, Google/Okta SSO, SCIM.", "Not available"],
                ["Credential handling", "Connection secrets are used for the simulated test and then discarded; only field names are stored. Production should write them to a secrets manager and keep only a reference.", "Demo behaviour"],
                ["Browser storage", "No credentials or tokens are written to localStorage, sessionStorage or cookies. The only cookie is the active-project selection (httpOnly).", "Enforced"],
                ["API tokens", "Generated server-side; plaintext shown once; only SHA-256 hashes stored; revocable; project-scoped.", "Enforced (in-memory)"],
                ["Query governance", "Only approved metrics and whitelisted dimensions; parameterised SQL; timeouts, row limits, concurrency and scan budgets.", "Enforced"],
                ["MCP endpoint", "Bearer auth, 60 req/min rate limit, Origin check, request size limits, audit events for every tool call.", "Enforced"],
                ["Audit log retention", "Last 1,000 events in server memory; resets on restart.", "Demo behaviour"],
                ["Content Security Policy / headers", "Not yet configured. Add CSP, HSTS and frame-ancestors at deployment.", "Not available"],
              ].map(([title, body, status]) => (
                <li key={title} className="flex flex-col gap-1 border-b border-line pb-2.5 last:border-0 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="font-medium text-ink">{title}</div>
                    <div className="text-[12.5px] text-muted">{body}</div>
                  </div>
                  <Badge tone={status === "Enforced" || status.startsWith("Enforced") ? "ok" : status === "Not available" ? "neutral" : "warn"}>{status}</Badge>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      {tab === "tokens" && (
        <Card>
          <CardHeader title="API tokens" description="Used by MCP clients and the API." />
          <div className="px-4 pb-4">
            <TokenManager tokens={listTokens()} projects={projects.map((p) => ({ id: p.id, name: p.name }))} />
          </div>
        </Card>
      )}

      {tab === "audit" && <AuditTab actorFilter={typeof sp.actor === "string" ? sp.actor : undefined} />}

      {tab === "notifications" && (
        <Card>
          <CardHeader title="Notifications" description="Workspace-level delivery preferences." actions={<Prototype />} />
          <div className="space-y-3 px-4 pb-4">
            <NotificationsForm initial={workspace.notificationPrefs} />
            <p className="text-[12px] text-muted">Deliveries are simulated in this build — no email, Slack or webhook messages are sent.</p>
          </div>
        </Card>
      )}

      {tab === "usage" && project && <UsageTab projectId={project.id} projectName={project.name} />}
    </div>
  );
}

function AuditTab({ actorFilter }: { actorFilter?: string }) {
  const events = listAudit(undefined, 300).filter((e) => !actorFilter || e.actorType === actorFilter);
  const filters = [
    { key: undefined, label: "All" },
    { key: "user", label: "Users" },
    { key: "mcp", label: "MCP" },
    { key: "system", label: "System" },
  ];
  return (
    <Card className="overflow-x-auto">
      <CardHeader
        title="Audit log"
        description="Every change from the UI, MCP clients and the system. Kept in server memory (last 1,000 events)."
        actions={
          <nav aria-label="Filter by actor" className="flex gap-1">
            {filters.map((f) => (
              <Link
                key={f.label}
                href={`/settings?tab=audit${f.key ? `&actor=${f.key}` : ""}`}
                aria-current={actorFilter === f.key ? "page" : undefined}
                className={cx("rounded-md px-2 py-1 text-[12px]", actorFilter === f.key ? "bg-accent-soft text-accent" : "text-muted hover:bg-hover")}
              >
                {f.label}
              </Link>
            ))}
          </nav>
        }
      />
      {events.length === 0 ? (
        <p className="px-4 pb-6 text-center text-[13px] text-muted">No events for this filter.</p>
      ) : (
        <table className="w-full min-w-[760px]">
          <thead className="border-y border-line bg-subtle/40">
            <tr>
              <th scope="col" className={th}>Time</th>
              <th scope="col" className={th}>Actor</th>
              <th scope="col" className={th}>Action</th>
              <th scope="col" className={th}>Target</th>
              <th scope="col" className={th}>Detail</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id} className="border-b border-line last:border-0">
                <td className={td + " whitespace-nowrap"} title={e.at}>
                  {relativeTime(e.at)}
                </td>
                <td className={td}>
                  <span className="flex items-center gap-1.5">
                    <Badge tone={e.actorType === "mcp" ? "info" : e.actorType === "system" ? "neutral" : "accent"}>{e.actorType}</Badge>
                    {e.actor}
                  </span>
                </td>
                <td className={td + " font-mono text-[12px]"}>{e.action}</td>
                <td className={td}>{e.target ?? "—"}</td>
                <td className={td + " text-[12.5px] text-muted"}>{e.detail ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function UsageTab({ projectId, projectName }: { projectId: string; projectName: string }) {
  const u = getUsage(projectId);
  const pctUsed = Math.min(100, (u.scannedTodayBytes / u.budgetBytes) * 100);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <div className="text-[12.5px] text-muted">Scanned today · {projectName}</div>
          <div className="mt-1 text-[22px] font-semibold tabular">{formatBytes(u.scannedTodayBytes)}</div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-subtle" role="progressbar" aria-label="Daily scan budget used" aria-valuenow={Math.round(pctUsed)} aria-valuemin={0} aria-valuemax={100}>
            <div className={cx("h-full rounded-full", pctUsed > 80 ? "bg-warn" : "bg-accent")} style={{ width: `${Math.max(pctUsed, 0.5)}%` }} />
          </div>
          <div className="mt-1 text-[11.5px] text-muted">of {formatBytes(u.budgetBytes)} daily budget</div>
        </Card>
        <Card className="p-4">
          <div className="text-[12.5px] text-muted">Cache hit rate</div>
          <div className="mt-1 text-[22px] font-semibold tabular">{(u.cacheHitRate * 100).toFixed(0)}%</div>
          <div className="mt-1 text-[11.5px] text-muted">of the last {u.history.length} queries · TTL {QUERY_LIMITS.cacheTtlMs / 60000} min</div>
        </Card>
        <Card className="p-4">
          <div className="text-[12.5px] text-muted">Limits</div>
          <ul className="mt-1 space-y-0.5 text-[12px] text-ink-2">
            <li>Timeout {QUERY_LIMITS.timeoutMs / 1000}s · {QUERY_LIMITS.rowLimit.toLocaleString()} rows max</li>
            <li>{QUERY_LIMITS.maxConcurrent} concurrent · ≤ {QUERY_LIMITS.maxRangeDays}-day ranges</li>
            <li>Warn above {QUERY_LIMITS.warnRangeDays} days · stale after {QUERY_LIMITS.staleAfterHours}h</li>
          </ul>
        </Card>
      </div>
      <p className="text-[12px] text-muted">Demo adapter: scan bytes are estimates from the in-memory mart, not billed warehouse bytes.</p>

      <Card className="overflow-x-auto">
        <CardHeader title="By dashboard / source" />
        {u.byDashboard.length === 0 ? (
          <p className="px-4 pb-6 text-center text-[13px] text-muted">No queries yet. Open a dashboard to populate usage.</p>
        ) : (
          <table className="w-full min-w-[520px]">
            <thead className="border-y border-line bg-subtle/40">
              <tr>
                <th scope="col" className={th}>Dashboard / source</th>
                <th scope="col" className={th + " text-right"}>Queries</th>
                <th scope="col" className={th + " text-right"}>Cache hits</th>
                <th scope="col" className={th + " text-right"}>Scanned</th>
              </tr>
            </thead>
            <tbody>
              {u.byDashboard.map((d) => (
                <tr key={d.key} className="border-b border-line last:border-0">
                  <td className={td}>{d.key.startsWith("(") ? <span className="text-muted">{d.key}</span> : <Link href={`/dashboards/${d.key}`} className="hover:text-accent">{d.key}</Link>}</td>
                  <td className={td + " text-right tabular"}>{d.queries}</td>
                  <td className={td + " text-right tabular"}>{d.cacheHits}</td>
                  <td className={td + " text-right tabular"}>{formatBytes(d.scanBytes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card className="overflow-x-auto">
        <CardHeader title="Recent query history" description="Last 100 governed queries for this project" />
        {u.history.length === 0 ? (
          <p className="px-4 pb-6 text-center text-[13px] text-muted">No queries yet.</p>
        ) : (
          <table className="w-full min-w-[760px]">
            <thead className="border-y border-line bg-subtle/40">
              <tr>
                <th scope="col" className={th}>Time</th>
                <th scope="col" className={th}>Metric</th>
                <th scope="col" className={th}>Source</th>
                <th scope="col" className={th}>Cache</th>
                <th scope="col" className={th + " text-right"}>Scanned</th>
                <th scope="col" className={th + " text-right"}>Duration</th>
                <th scope="col" className={th + " text-right"}>Rows</th>
                <th scope="col" className={th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {u.history.map((h) => (
                <tr key={h.id} className="border-b border-line last:border-0">
                  <td className={td + " whitespace-nowrap"} title={formatDate(h.at, true)}>
                    {relativeTime(h.at)}
                  </td>
                  <td className={td + " font-mono text-[12px]"}>{h.metricKey}</td>
                  <td className={td}>{h.source}</td>
                  <td className={td}>{h.cacheHit ? <Badge tone="ok">hit</Badge> : <Badge tone="neutral">miss</Badge>}</td>
                  <td className={td + " text-right tabular"}>{formatBytes(h.scanBytes)}</td>
                  <td className={td + " text-right tabular"}>{h.durationMs} ms</td>
                  <td className={td + " text-right tabular"}>{h.rows}</td>
                  <td className={td}>
                    {h.status === "ok" ? <StatusBadge status="ok" /> : <span title={h.reason}><StatusBadge status="error" label={h.status} /></span>}
                    {h.reason && <div className="max-w-[220px] truncate text-[11px] text-muted" title={h.reason}>{h.reason}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
