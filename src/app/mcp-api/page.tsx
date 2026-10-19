import { Suspense } from "react";
import { AlertTriangle, Lock, PlugZap, ShieldCheck } from "lucide-react";
import { getAppContext } from "@/lib/server/session";
import { TOOLS } from "@/lib/mcp/tools";
import { SUPPORTED_PROTOCOL_VERSIONS } from "@/lib/mcp/server";
import { QUERY_LIMITS } from "@/lib/services/query";
import { listTokens } from "@/lib/services/tokens";
import { formatBytes } from "@/lib/domain/chart-data";
import { Badge, Callout, Card, CardHeader, PageHeader, PageSkeleton, td, th } from "@/components/ui";
import { CodeBlock, CopyButton } from "@/components/ui-client";
import { HealthStatus, LocalEndpoint } from "@/components/mcp/health-status";
import { TokenManager } from "@/components/mcp/token-manager";
import { MCP_PLACEHOLDER_URL } from "@/components/mcp/constants";

export const metadata = { title: "MCP & API" };

export default function McpApiPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <McpApi />
    </Suspense>
  );
}

const claudeCode = `claude mcp add --transport http dataorbyt ${MCP_PLACEHOLDER_URL} \\
  --header "Authorization: Bearer <DATAORBYT_API_TOKEN>"`;

const claudeDesktop = `{
  "mcpServers": {
    "dataorbyt": {
      "command": "npx",
      "args": [
        "-y", "mcp-remote", "${MCP_PLACEHOLDER_URL}",
        "--header", "Authorization: Bearer \${DATAORBYT_API_TOKEN}"
      ],
      "env": { "DATAORBYT_API_TOKEN": "<your-token>" }
    }
  }
}`;

const curlExample = `export DATAORBYT_API_TOKEN=<your-token>
export DATAORBYT_MCP_URL=${MCP_PLACEHOLDER_URL}   # or http://localhost:<port>/mcp locally

# 1. initialize
curl -s -X POST "$DATAORBYT_MCP_URL" \\
  -H "Authorization: Bearer $DATAORBYT_API_TOKEN" \\
  -H "Content-Type: application/json" \\
  -H "Accept: application/json, text/event-stream" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}'

# 2. list tools
curl -s -X POST "$DATAORBYT_MCP_URL" \\
  -H "Authorization: Bearer $DATAORBYT_API_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'

# 3. governed metric preview (no raw SQL)
curl -s -X POST "$DATAORBYT_MCP_URL" \\
  -H "Authorization: Bearer $DATAORBYT_API_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"preview_metric_query","arguments":{"project_id":"<project-id>","metric_key":"gross_revenue","range":"30d","grain":"week"}}}'`;

async function McpApi() {
  const { projects } = await getAppContext();
  const tokens = listTokens();

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={
          <span className="flex items-center gap-2">
            <PlugZap className="size-3.5" /> Model Context Protocol
          </span>
        }
        title="MCP & API"
        description="Let Claude or ChatGPT read your governed metrics and draft dashboards, alerts and experiments. DataOrbyt itself never calls an LLM."
      />

      <div className="grid grid-cols-12 gap-3">
        <Card className="col-span-12 lg:col-span-7">
          <CardHeader title="Workspace MCP endpoint" description="Use this URL in MCP clients once DataOrbyt is deployed on a public HTTPS domain." />
          <div className="space-y-3 px-4 pb-4">
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-md border border-line bg-subtle px-2.5 py-1.5 font-mono text-[13px] text-ink">{MCP_PLACEHOLDER_URL}</code>
              <CopyButton value={MCP_PLACEHOLDER_URL} />
            </div>
            <Callout tone="warn" title="Placeholder — not a working URL">
              Replace <code className="font-mono">&lt;your-dataorbyt-domain&gt;</code> with your deployment&apos;s domain. No deployment domain is configured for this build.
            </Callout>
            <div>
              <div className="mb-1 text-[12.5px] font-medium text-ink-2">Local endpoint (this machine)</div>
              <LocalEndpoint />
              <p className="mt-1 text-[12px] text-muted">
                Works with Claude Code or Claude Desktop on this machine. A localhost URL is <b>not publicly reachable</b>: claude.ai and ChatGPT remote connectors need a public HTTPS URL (deploy, or use a tunnel you trust).
              </p>
            </div>
          </div>
        </Card>
        <Card className="col-span-12 lg:col-span-5">
          <CardHeader title="Status" description="Live check against this server" />
          <div className="space-y-3 px-4 pb-4">
            <HealthStatus />
            <ul className="space-y-1.5 border-t border-line pt-3 text-[12.5px] text-ink-2">
              <li className="flex gap-2">
                <Lock className="mt-0.5 size-3.5 shrink-0 text-muted" /> Bearer-token auth on every request; tokens are project-scoped.
              </li>
              <li className="flex gap-2">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-muted" /> Read-only by default; mutations create drafts; publishing is two-step.
              </li>
              <li className="flex gap-2">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-muted" /> All data served here is demo data.
              </li>
            </ul>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Connect a client" description="Configs use placeholders — paste your own token where shown. Never commit tokens." />
        <div className="grid grid-cols-1 gap-4 px-4 pb-4 lg:grid-cols-2">
          <section className="space-y-2">
            <h3 className="text-[13px] font-semibold">Claude Code</h3>
            <p className="text-[12.5px] text-muted">Adds DataOrbyt as a remote HTTP MCP server.</p>
            <CodeBlock label="terminal" code={claudeCode} />
          </section>
          <section className="space-y-2">
            <h3 className="text-[13px] font-semibold">Claude Desktop</h3>
            <p className="text-[12.5px] text-muted">
              Add to <code className="font-mono">claude_desktop_config.json</code> (Settings → Developer → Edit config). Uses the <code className="font-mono">mcp-remote</code> bridge to forward the bearer header.
            </p>
            <CodeBlock label="claude_desktop_config.json" code={claudeDesktop} />
          </section>
          <section className="space-y-2">
            <h3 className="text-[13px] font-semibold">ChatGPT</h3>
            <ol className="list-decimal space-y-1 pl-5 text-[12.5px] text-ink-2">
              <li>Deploy DataOrbyt on a public HTTPS domain.</li>
              <li>In ChatGPT, enable developer mode / custom connectors (availability depends on your plan and workspace settings).</li>
              <li>
                Add a connector with the MCP URL <code className="font-mono">{MCP_PLACEHOLDER_URL}</code>.
              </li>
            </ol>
            <Callout tone="warn" title="Auth caveat">
              ChatGPT connectors typically expect OAuth or no auth. This build only implements bearer tokens and has no OAuth flow, so ChatGPT may not be able to connect until OAuth is added.
            </Callout>
          </section>
          <section className="space-y-2">
            <h3 className="text-[13px] font-semibold">Raw JSON-RPC (curl)</h3>
            <CodeBlock label="curl" code={curlExample} />
          </section>
        </div>
      </Card>

      <Card className="overflow-x-auto">
        <CardHeader title="Tools" description="Each tool calls the same typed services as the UI, with strict input schemas and project scoping." />
        <table className="w-full min-w-[720px]">
          <thead className="border-y border-line bg-subtle/40">
            <tr>
              <th scope="col" className={th}>Tool</th>
              <th scope="col" className={th}>Description</th>
              <th scope="col" className={th}>Kind</th>
              <th scope="col" className={th}>Scope</th>
            </tr>
          </thead>
          <tbody>
            {TOOLS.map((t) => (
              <tr key={t.name} className="border-b border-line last:border-0">
                <td className={td + " font-mono text-[12.5px] text-ink"}>{t.name}</td>
                <td className={td + " text-[12.5px]"}>{t.description}</td>
                <td className={td}>{t.readOnly ? <Badge tone="ok">Read-only</Badge> : t.name === "publish_dashboard" ? <Badge tone="warn">Confirmed mutation</Badge> : <Badge tone="info">Draft</Badge>}</td>
                <td className={td}>
                  <Badge tone="neutral">{t.scope}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="grid grid-cols-12 gap-3">
        <Card className="col-span-12 lg:col-span-6">
          <CardHeader title="Protocol contract" />
          <div className="space-y-2 px-4 pb-4 text-[12.5px] text-ink-2">
            <p>
              <b>Transport:</b> Streamable HTTP, <code className="font-mono">POST /mcp</code>, JSON responses (no server-initiated SSE stream; GET returns 405). Stateless — no session header required.
            </p>
            <p>
              <b>Protocol versions:</b> {SUPPORTED_PROTOCOL_VERSIONS.join(", ")}.
            </p>
            <p>
              <b>Methods:</b> <code className="font-mono">initialize</code>, <code className="font-mono">notifications/initialized</code>, <code className="font-mono">ping</code>, <code className="font-mono">tools/list</code>, <code className="font-mono">tools/call</code>. Batches up to 20; bodies up to 64 KB.
            </p>
            <p>
              <b>Errors:</b> validation, authorization and budget errors come back as tool results with <code className="font-mono">isError: true</code> so the model can correct itself; protocol errors use JSON-RPC codes. 401 without a valid token; 429 over the rate limit.
            </p>
            <p>
              <b>Origin check:</b> browser requests from other origins are rejected (DNS-rebinding protection). Allow extra origins with <code className="font-mono">DATAORBYT_ALLOWED_ORIGINS</code>.
            </p>
          </div>
        </Card>
        <Card className="col-span-12 lg:col-span-6">
          <CardHeader title="Safety & limits" />
          <ul className="space-y-1.5 px-4 pb-4 text-[12.5px] text-ink-2">
            <li>• Read-only tools by default; a token needs the <code className="font-mono">draft</code> or <code className="font-mono">publish</code> scope to change anything.</li>
            <li>• Mutations create drafts (dashboards, paused alerts, draft experiments) that a person reviews in DataOrbyt.</li>
            <li>• <code className="font-mono">publish_dashboard</code> is two-step: preview → explicit confirm with a code bound to the exact draft contents.</li>
            <li>• No raw SQL. Queries go through MetricQueryService: approved metrics and whitelisted dimensions only.</li>
            <li>• Rate limit: 60 requests/minute per token. Every tool call is written to the audit log.</li>
            <li>
              • Query limits: ≤ {QUERY_LIMITS.maxRangeDays}-day ranges, ≤ 200 rows per MCP preview, {QUERY_LIMITS.timeoutMs / 1000}s timeout, {QUERY_LIMITS.maxConcurrent} concurrent queries, {formatBytes(QUERY_LIMITS.dailyScanBudgetBytes)} daily scan budget per project, results cached for {QUERY_LIMITS.cacheTtlMs / 60000} min.
            </li>
          </ul>
        </Card>
      </div>

      <Card id="tokens">
        <CardHeader title="API tokens" />
        <div className="px-4 pb-4">
          <TokenManager tokens={tokens} projects={projects.map((p) => ({ id: p.id, name: p.name }))} />
        </div>
      </Card>
    </div>
  );
}
