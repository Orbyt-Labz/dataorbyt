# DataOrbyt

**Connect your product and revenue data, get a trusted founder dashboard, and share it the same day.**

DataOrbyt is a no-LLM analytics platform for founders and small teams. It organises transformations and metrics through dbt, governs every query through a metric catalog, and lets you build polished, shareable dashboards, alerts and experiment readouts. The product never calls an LLM. Claude and ChatGPT can optionally talk to DataOrbyt through its **MCP server**.

> **This build is a working demo.** Every source, warehouse, dbt run and alert delivery is **simulated** and labelled as such in the UI (“Demo data”, “Demo connection — not connected to a real database”, “Simulated run”, “simulated delivery”). Nothing connects to real infrastructure yet. See [Demo limitations](#demo-limitations) and [Going real](#going-real).

---

## Quick start

Requirements: Node.js 20+ and npm.

```bash
npm install
npm run dev            # http://localhost:3000  (PORT=3123 npm run dev to change)
```

Production build:

```bash
npm run build
npm start              # next start (default port 3000; use -p to change)
```

Checks:

```bash
npm run typecheck      # tsc --noEmit
npm run lint           # eslint
npm test               # vitest (domain + service + MCP tests)
npm run check          # all of the above + build
```

There is no login. Every UI request acts as the seeded workspace owner, “Alex Morgan”. Demo state lives in server memory and **resets when the server restarts**.

## What's in the demo workspace

| | Acme Analytics (B2B SaaS, USD) | Northstar (consumer subscription, GBP) |
|---|---|---|
| Sources | BigQuery, Stripe, PostHog (connected), HubSpot (syncing) | Snowflake, Segment, CSV (connected), **Stripe (error: 401)** |
| dbt | 10 models (BigQuery), **1 failing test** (`not_null_stg_stripe__charges_customer_id`) | 8 models (Snowflake), **failing source freshness** |
| Metrics | 15 (one draft) | 14 (one deprecated) |
| Dashboards | 5 published (Founder Overview, Revenue & Billing, Acquisition Funnel, Retention & Cohorts, Experiment Readout) | 1 draft (setup incomplete) |
| Alerts | revenue drop (**fired**), activation threshold, freshness (paused), dbt test failure (**fired**) | Stripe sync failure (**fired**, acknowledged), missing signups |
| Experiments | Onboarding checklist v2 (completed, inference available), Annual plan nudge (running, below planned sample → descriptive only) | Pricing page layout (running, **sample-ratio mismatch** → inference unavailable), Workout streaks (draft) |

The demo data is 90 days of deterministic daily facts (seeded PRNG, weekly seasonality, growth, and a revenue incident three days ago). It ends yesterday, so the dashboards always look current.

## Product tour

| Route | What it does |
|---|---|
| `/` | Overview: KPIs with prior-period comparison and definitions, data freshness, revenue/WAU trends, activation funnel, alerts, activity, recent dashboards, setup checklist. Empty state for projects without data. |
| `/projects` | Project index (search, sort, status), create flow (with optional sample data), detail tabs. The top-bar project selector switches context everywhere. |
| `/connections` | Connector catalog (Available / Coming soon / Connected), demo connection wizard with validated fields, masked secrets, least-privilege guidance and a simulated test; detail with schema preview and sync history. |
| `/dashboards` | Library, create (blank / template / metrics), viewer (global date filter, filter chips, share, refresh, export), editor (reorder, side-panel config, live preview, publish with a reviewed diff). |
| `/metrics` | Governed metric catalog, metric detail with lineage (source → dbt model → metric → dashboards) and a governed query preview, request-a-metric flow with review. |
| `/dbt` | dbt workspace, models by layer, test results, simulated runs with timestamped logs, model detail with compiled SQL and lineage, starter-project generator with YAML preview. |
| `/experiments` | Experiment list, design wizard, results with SRM check, confidence intervals, guardrails and event schema plus ingestion examples. |
| `/alerts` | Alert management, creation with firing-logic preview and sample message, anti-noise settings, history with acknowledge/snooze/pause. |
| `/mcp-api` | MCP endpoint, health, client setup for Claude Code, Claude Desktop and ChatGPT, tool contract, API tokens. |
| `/settings` | Workspace, members and roles, project defaults, security, API tokens, audit log, notifications, query usage and budgets. |

`⌘K` / `Ctrl+K` opens search over pages, dashboards, metrics, experiments, alerts, connections and dbt models.

## Architecture

```
src/
  lib/
    domain/        Vendor-neutral types and pure logic: types, connectors catalog, templates,
                   date ranges, chart-data contract, experiment statistics, alert evaluation
    adapters/      Pluggable interfaces + demo implementations
                     WarehouseAdapter  → DemoWarehouseAdapter (in-memory pre-aggregated mart)
                     SourceConnectorAdapter → DemoSourceAdapter (deterministic test/discovery)
    demo/          Deterministic seed: daily facts, metrics, dbt projects, workspace
    server/        In-memory store (globalThis singleton) and request/session helpers
    services/      Typed application services shared by the UI *and* MCP:
                     query.ts       MetricQueryService (governed queries, cache, budgets)
                     charts.ts      ChartSpec → ChartData resolution
                     dashboards / metrics / connections / projects / dbt /
                     experiments / alerts / tokens / workspace
    mcp/           MCP tool definitions (zod schemas) and JSON-RPC handler
    charts/        Pure ChartSpec + ChartData → ECharts option builder
  app/             Next.js App Router pages, server actions (app/actions/*), route handlers
  components/      UI kit, shell, charts, feature components
```

Conceptual layers, mapped to code:

1. **Source connectors & ingestion**: `SourceConnectorAdapter` (`lib/adapters`). Demo only.
2. **Warehouse / analytics store**: `WarehouseAdapter`, implemented by the in-memory `DemoWarehouseAdapter`.
3. **dbt transformations & tests**: `services/dbt.ts` (simulated runner, starter generator).
4. **Semantic metric catalog**: `Metric` definitions (`aggregation`, `dimensions`, `sourceModel`), `services/metrics.ts`.
5. **Governed query API**: `services/query.ts`, covered in detail below.
6. **Dashboards, alerts, experiments**: their own services, all reading data only via `queryMetric`.
7. **MCP / API surface**: `lib/mcp/*` and `app/mcp/route.ts`, which call the same services as the UI.

### Governed queries (`MetricQueryService`)

Every chart, alert evaluation and MCP preview goes through `queryMetric()`:

- **Input** is a strict zod schema with no free-form SQL: `projectId`, approved `metricKey`, ISO `start`/`end`, `grain`, an optional `groupBy`, and up to 5 filters of up to 20 values.
- **Authorisation and governance.** The actor must have access to the project. Only `approved` metrics are queryable (`deprecated` warns; `draft` works only for catalog previews). Group-by and filter dimensions must be whitelisted for that metric, and filter values must be known values.
- **Bounds.** The range is capped at 180 days, and anything over 60 days carries a warning. Each query has a 5 s timeout, a 5,000-row limit (200 for MCP), and the workspace allows at most 8 concurrent queries.
- **Compilation.** Queries compile to a parameterised plan (`@project_id`, `@start_date`, `IN UNNEST(@f0_values)`). User values are never interpolated into SQL, and the compiled SQL is shown in the UI and MCP output for auditability.
- **Result cache** is keyed by project, metric, grain, group-by, sorted filters and time range. Entries have a 15 min TTL and are invalidated when the source's data version (load time) changes. Cache hits cost no scan budget and are labelled “Cached” on charts.
- **Scan budget**: 512 MB per project per day (estimated by the adapter). Over budget, new queries are rejected but cached results still serve.
- **Query history** records source (ui/dashboard/alert/mcp), dashboard, cache hit, bytes, duration and status. It's visible in Settings → Usage.
- **Freshness.** Results carry `dataThrough`, `loadedAt` and `stale` (older than 24 h), which charts and the Overview display.

Charts are stored as a typed `ChartSpec` (`lib/domain/types.ts`). The server resolves each spec to a serialisable `ChartData` (`services/charts.ts`). The client turns it into an ECharts option with a pure function (`lib/charts/options.ts`), so saved charts render the same way everywhere. ECharts is imported modularly (`echarts/core` plus only the line, bar, heatmap, scatter and funnel charts and the components in use), and charts resize via `ResizeObserver`. Every chart has a “View as table” alternative, and colours use a CVD-validated categorical order.

### Safety rules that are enforced in code

- **No LLM SDKs or model calls** anywhere in the product.
- **Secrets stay on the server.** Connection credentials go only to a server action, are used for the simulated test, and are then **discarded**; only the *names* of provided secret fields are kept. API tokens are shown once and stored as SHA-256 hashes. Nothing sensitive goes into browser storage. The only `localStorage` key is the sidebar-collapsed preference.
- **Reviewable actions.** Dashboard publishing shows a diff (added/removed/changed/reordered) and needs a confirmation code bound to the exact draft. If the draft changes after review, publishing fails.
- **Metric requests** are definitions for review. SQL containing DDL/DML or multiple statements is rejected, and nothing user-written is executed.

## MCP server

- **Endpoint:** `POST /mcp`. Streamable HTTP with JSON responses, stateless, protocol versions `2025-06-18`, `2025-03-26` and `2024-11-05`. It supports `initialize`, `ping`, `tools/list` and `tools/call`; `GET` returns 405 because there is no SSE stream.
- **Health:** `GET /api/health` is unauthenticated and reveals no workspace data.
- **Auth:** `Authorization: Bearer <token>`. Create scoped tokens (scopes `read`/`draft`/`publish`, all or specific projects) in **Settings → API tokens** or on the MCP & API page. Optionally set `DATAORBYT_MCP_DEV_TOKEN` (read + draft).
- **Limits and audit:** 60 requests/min per token, a 64 KB body limit, Origin checks (DNS-rebinding protection), and an audit event for every tool call.
- **Tools:** `list_projects`, `list_connections`, `list_dashboards`, `list_metrics`, `get_metric_definition`, `preview_metric_query`, `create_dashboard_draft`, `add_dashboard_chart`, `publish_dashboard`, `create_alert_draft`, `create_experiment_draft`.
  - Read tools are the default.
  - Mutating tools create **drafts**: dashboards are private drafts, and alerts are created **paused**.
  - `publish_dashboard` is **two-step**. The first call returns a preview and a `confirmation_code`; the second call needs `confirm: true` with that code, plus the `publish` scope.
  - There is no raw-SQL tool.

Try it locally (create a token in the UI first):

```bash
curl -s http://localhost:3000/mcp \
  -H "Authorization: Bearer $DATAORBYT_API_TOKEN" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_projects","arguments":{}}}'
```

Claude Code (needs a publicly reachable deployment, or use the local URL with Claude Code on the same machine):

```bash
claude mcp add --transport http dataorbyt https://<your-dataorbyt-domain>/mcp \
  --header "Authorization: Bearer <DATAORBYT_API_TOKEN>"
```

`https://<your-dataorbyt-domain>/mcp` is a **placeholder**, not a working URL. A localhost endpoint isn't reachable by hosted clients such as ChatGPT or claude.ai connectors, which need a public HTTPS URL. ChatGPT custom connectors may also require OAuth, which this build doesn't implement.

## Experiment statistics

Two-arm conversion tests only (`lib/domain/stats.ts`):

- **Effect:** difference in conversion rate among exposed units, with a 95% Wald CI (unpooled SE).
- **p-value:** two-sided two-proportion z-test (pooled SE).
- **SRM check:** chi-square goodness of fit against planned allocation. If p < 0.001, inference is unavailable.

Inference is **withheld** (results are shown as descriptive only, with the reason) when:

- the experiment doesn't have exactly two arms,
- there's an SRM,
- any arm has fewer than 100 exposed units or fewer than 10 conversions or non-conversions, or
- a running test hasn't reached its planned sample (no peeking).

Assumptions: independent units, randomisation at the analysis unit, fixed horizon, large-sample normality. Significance is never fabricated.

## Environment variables

See `.env.example`. None are required for the demo.

| Variable | Purpose |
|---|---|
| `PORT` | Dev server port (default 3000). |
| `DATAORBYT_MCP_DEV_TOKEN` | Optional fixed MCP bearer token (≥ 16 chars, read + draft scopes). Server-only. |
| `DATAORBYT_ALLOWED_ORIGINS` | Comma-separated browser origins allowed to call `/mcp`. |

## Demo limitations

- **State.** All state is in memory and resets on restart. Multiple server instances would not share it.
- **No authentication.** There is no authentication, SSO or per-user RBAC enforcement. Roles shown in Settings are informational, and link sharing is simulated: there are no public share pages.
- **Connections.** No connector opens a network connection. Tests are deterministic: a value containing `fail` or `invalid`, a Stripe `sk_` key, or a secret shorter than 8 characters fails.
- **Warehouse.** Queries run against an in-memory, pre-aggregated mart. Dimension breakdowns come from deterministic shares, not row-level data.
- **dbt.** Runs are simulated logs, nothing is executed, and repositories are saved but never cloned. The starter project is previewed and registered but not written to disk or git.
- **Alerts.** Evaluations run on demand; there is no scheduler. Deliveries (email, Slack, webhook) are simulated and never sent.
- **Experiments.** Results are seeded. The event-ingestion endpoint shown in the examples (`/api/events`) isn't implemented.

## Going real

| Area | What's needed |
|---|---|
| Persistence | Replace `lib/server/store.ts` with a database-backed repository (Postgres), keeping the service signatures. |
| Auth | Session auth (e.g. OIDC/SSO), building the `Actor` from the session instead of `UI_ACTOR`. Enforce roles in services. Use OAuth 2.1 for MCP so hosted clients can connect. |
| Secrets | A secrets manager (GCP Secret Manager, AWS Secrets Manager or Vault). Store only references on `Connection`. |
| Warehouses | Implement `WarehouseAdapter` for BigQuery (`maximum_bytes_billed`, dry-run estimates), Snowflake (dedicated XS warehouse + resource monitor) or Postgres (read replica, `statement_timeout`). Each needs a service account with read access to marts. |
| Sources | Implement `SourceConnectorAdapter` per connector, or delegate ingestion to a managed EL tool and read its warehouse tables. Credentials need the least-privilege scopes shown in the wizard. |
| dbt | A runner (dbt Core in a container, or dbt Cloud API) with `profiles.yml` from env vars, `dev`/`prod` targets, and artifacts (`manifest.json`, `run_results.json`) ingested for model state and lineage. |
| Alerts | A scheduler (cron/queue) calling `runEvaluation`, plus real delivery (SMTP, Slack bot token, signed webhooks). |
| Experiments | An ingestion endpoint writing assignment and exposure events to the warehouse, and a dbt model that produces per-variant observations. |
| Deployment | A public HTTPS domain. Replace the `<your-dataorbyt-domain>` placeholder and set `DATAORBYT_ALLOWED_ORIGINS`. |

dbt standardises transformations, but it doesn't make queries cheap by itself. Predictable spend here comes from pre-aggregated marts, incremental models, partitioning and clustering, the result cache, and the per-project scan budgets.
