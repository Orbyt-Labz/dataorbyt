import type { DbtModel, DbtProjectState, DbtRun, DbtRunLogLine, DbtTest } from "@/lib/domain/types";

type ModelSeed = Omit<DbtModel, "compiledSql" | "state" | "tests"> & { tests?: DbtTest[] };

const t = (name: string, type: DbtTest["type"], column?: string, status: DbtTest["status"] = "pass", message?: string): DbtTest => ({
  name,
  type,
  column,
  status,
  message,
});

function compile(sql: string, dataset: string) {
  return sql
    .replace(/\{\{\s*ref\('([^']+)'\)\s*\}\}/g, (_, m) => `\`${dataset}\`.\`${m}\``)
    .replace(/\{\{\s*source\('([^']+)',\s*'([^']+)'\)\s*\}\}/g, (_, s, tb) => `\`raw_${s}\`.\`${tb}\``)
    .replace(/\{%[\s\S]*?%\}/g, "")
    .replace(/\n{3,}/g, "\n\n");
}

export function acmeModels(): ModelSeed[] {
  return [
    {
      name: "stg_stripe__charges",
      layer: "staging",
      materialization: "view",
      description: "Cleaned Stripe charges: amounts converted from cents, statuses normalised.",
      columns: [
        { name: "charge_id", type: "string", description: "Stripe charge ID" },
        { name: "customer_id", type: "string", description: "Stripe customer ID" },
        { name: "amount", type: "numeric", description: "Charge amount in major currency units" },
        { name: "status", type: "string", description: "succeeded | failed | pending" },
        { name: "created_at", type: "timestamp", description: "Charge creation time (UTC)" },
      ],
      tests: [
        t("unique_stg_stripe__charges_charge_id", "unique", "charge_id"),
        t("not_null_stg_stripe__charges_customer_id", "not_null", "customer_id", "fail", "Got 14 results, configured to fail if != 0 (guest checkouts without a customer)."),
        t("accepted_values_stg_stripe__charges_status", "accepted_values", "status"),
      ],
      dependsOn: ["source:stripe.charges"],
      sql: `select\n  id as charge_id,\n  customer as customer_id,\n  amount / 100.0 as amount,\n  lower(status) as status,\n  timestamp_seconds(created) as created_at\nfrom {{ source('stripe', 'charges') }}`,
    },
    {
      name: "stg_stripe__subscriptions",
      layer: "staging",
      materialization: "view",
      description: "Stripe subscriptions with trial and cancellation timestamps.",
      columns: [
        { name: "subscription_id", type: "string", description: "Stripe subscription ID" },
        { name: "customer_id", type: "string", description: "Stripe customer ID" },
        { name: "plan", type: "string", description: "starter | growth | scale" },
        { name: "trial_start", type: "timestamp", description: "Trial start" },
        { name: "canceled_at", type: "timestamp", description: "Cancellation time" },
      ],
      tests: [t("unique_stg_stripe__subscriptions_subscription_id", "unique", "subscription_id"), t("not_null_stg_stripe__subscriptions_customer_id", "not_null", "customer_id")],
      dependsOn: ["source:stripe.subscriptions"],
      sql: `select\n  id as subscription_id,\n  customer as customer_id,\n  plan_nickname as plan,\n  timestamp_seconds(trial_start) as trial_start,\n  timestamp_seconds(canceled_at) as canceled_at\nfrom {{ source('stripe', 'subscriptions') }}`,
    },
    {
      name: "stg_posthog__events",
      layer: "staging",
      materialization: "incremental",
      description: "Product events from PostHog, deduplicated by uuid. Incremental on timestamp.",
      columns: [
        { name: "event_id", type: "string", description: "PostHog event uuid" },
        { name: "user_id", type: "string", description: "Identified user" },
        { name: "event", type: "string", description: "Event name" },
        { name: "occurred_at", type: "timestamp", description: "Event time (UTC)" },
      ],
      tests: [t("unique_stg_posthog__events_event_id", "unique", "event_id"), t("source_freshness_posthog_events", "freshness")],
      dependsOn: ["source:posthog.events"],
      sql: `{{ config(materialized='incremental', unique_key='event_id', partition_by={'field': 'occurred_at', 'data_type': 'timestamp', 'granularity': 'day'}) }}\n\nselect\n  uuid as event_id,\n  distinct_id as user_id,\n  event,\n  timestamp as occurred_at\nfrom {{ source('posthog', 'events') }}\n{% if is_incremental() %}\nwhere timestamp > (select max(occurred_at) from {{ this }})\n{% endif %}`,
      partitionBy: "occurred_at (day)",
    },
    {
      name: "stg_hubspot__deals",
      layer: "staging",
      materialization: "view",
      description: "HubSpot deals with pipeline stage names.",
      columns: [
        { name: "deal_id", type: "string", description: "HubSpot deal ID" },
        { name: "stage", type: "string", description: "Pipeline stage" },
        { name: "amount", type: "numeric", description: "Deal amount" },
      ],
      dependsOn: ["source:hubspot.deals"],
      sql: `select id as deal_id, properties_dealstage as stage, properties_amount as amount\nfrom {{ source('hubspot', 'deals') }}`,
    },
    {
      name: "int_user_activation",
      layer: "intermediate",
      materialization: "ephemeral",
      description: "One row per user with signup time and activation time (first project + first shared dashboard).",
      columns: [
        { name: "user_id", type: "string", description: "User" },
        { name: "signed_up_at", type: "timestamp", description: "Signup time" },
        { name: "activated_at", type: "timestamp", description: "Activation milestone time" },
      ],
      tests: [t("unique_int_user_activation_user_id", "unique", "user_id")],
      dependsOn: ["stg_posthog__events"],
      sql: `select\n  user_id,\n  min(case when event = 'signed_up' then occurred_at end) as signed_up_at,\n  min(case when event = 'dashboard_shared' then occurred_at end) as activated_at\nfrom {{ ref('stg_posthog__events') }}\ngroup by 1`,
    },
    {
      name: "int_subscription_events",
      layer: "intermediate",
      materialization: "ephemeral",
      description: "Subscription lifecycle events: trial_started, converted, churned.",
      columns: [
        { name: "subscription_id", type: "string", description: "Subscription" },
        { name: "event_type", type: "string", description: "trial_started | converted | churned" },
        { name: "event_at", type: "timestamp", description: "Event time" },
      ],
      dependsOn: ["stg_stripe__subscriptions", "stg_stripe__charges"],
      sql: `select subscription_id, 'trial_started' as event_type, trial_start as event_at from {{ ref('stg_stripe__subscriptions') }} where trial_start is not null\nunion all\nselect subscription_id, 'churned', canceled_at from {{ ref('stg_stripe__subscriptions') }} where canceled_at is not null`,
    },
    {
      name: "fct_daily_business",
      layer: "marts",
      materialization: "incremental",
      description: "Pre-aggregated daily business facts powering most dashboard tiles. Partitioned by date, clustered by plan.",
      columns: [
        { name: "date", type: "date", description: "Calendar date (project timezone)" },
        { name: "visitors", type: "int64", description: "Unique visitors" },
        { name: "signups", type: "int64", description: "New accounts" },
        { name: "wau", type: "int64", description: "Trailing 7-day active users" },
        { name: "active_subscriptions", type: "int64", description: "Active paying subscriptions" },
      ],
      tests: [t("unique_fct_daily_business_date", "unique", "date"), t("not_null_fct_daily_business_date", "not_null", "date")],
      dependsOn: ["int_user_activation", "int_subscription_events", "stg_posthog__events"],
      sql: `{{ config(materialized='incremental', unique_key='date', partition_by={'field': 'date', 'data_type': 'date'}, cluster_by=['plan']) }}\n\nselect\n  date(occurred_at) as date,\n  count(distinct case when event = '$pageview' then user_id end) as visitors,\n  count(distinct case when event = 'signed_up' then user_id end) as signups\nfrom {{ ref('stg_posthog__events') }}\n{% if is_incremental() %}\nwhere date(occurred_at) >= date_sub(current_date(), interval 3 day)\n{% endif %}\ngroup by 1`,
      partitionBy: "date",
      clusterBy: ["plan"],
    },
    {
      name: "fct_revenue_daily",
      layer: "marts",
      materialization: "table",
      description: "Daily gross and net revenue by plan and country.",
      columns: [
        { name: "date", type: "date", description: "Charge date" },
        { name: "plan", type: "string", description: "Plan" },
        { name: "gross_revenue", type: "numeric", description: "Succeeded charges" },
        { name: "net_revenue", type: "numeric", description: "Gross minus refunds and fees" },
      ],
      tests: [t("not_null_fct_revenue_daily_date", "not_null", "date"), t("expression_gross_gte_net", "expression")],
      dependsOn: ["stg_stripe__charges", "stg_stripe__subscriptions"],
      sql: `select\n  date(c.created_at) as date,\n  s.plan,\n  sum(c.amount) as gross_revenue\nfrom {{ ref('stg_stripe__charges') }} c\nleft join {{ ref('stg_stripe__subscriptions') }} s using (customer_id)\nwhere c.status = 'succeeded'\ngroup by 1, 2`,
      partitionBy: "date",
    },
    {
      name: "fct_activation_daily",
      layer: "marts",
      materialization: "table",
      description: "Daily signups and activations by channel and platform.",
      columns: [
        { name: "date", type: "date", description: "Signup date" },
        { name: "signups", type: "int64", description: "Signups" },
        { name: "activated", type: "int64", description: "Activated within 7 days" },
      ],
      tests: [t("not_null_fct_activation_daily_date", "not_null", "date")],
      dependsOn: ["int_user_activation"],
      sql: `select\n  date(signed_up_at) as date,\n  count(*) as signups,\n  countif(activated_at <= timestamp_add(signed_up_at, interval 7 day)) as activated\nfrom {{ ref('int_user_activation') }}\ngroup by 1`,
    },
    {
      name: "fct_retention_cohorts",
      layer: "marts",
      materialization: "table",
      description: "Weekly signup cohorts with week-N retention.",
      columns: [
        { name: "cohort_week", type: "date", description: "Signup week" },
        { name: "week_number", type: "int64", description: "Weeks since signup" },
        { name: "retained_users", type: "int64", description: "Users active in week N" },
      ],
      tests: [t("not_null_fct_retention_cohorts_cohort_week", "not_null", "cohort_week")],
      dependsOn: ["int_user_activation", "stg_posthog__events"],
      sql: `select\n  date_trunc(date(a.signed_up_at), week(monday)) as cohort_week,\n  date_diff(date(e.occurred_at), date(a.signed_up_at), week) as week_number,\n  count(distinct e.user_id) as retained_users\nfrom {{ ref('int_user_activation') }} a\njoin {{ ref('stg_posthog__events') }} e using (user_id)\ngroup by 1, 2`,
    },
  ];
}

export function northstarModels(): ModelSeed[] {
  return [
    {
      name: "stg_segment__tracks",
      layer: "staging",
      materialization: "incremental",
      description: "Segment track calls, deduplicated by message_id.",
      columns: [
        { name: "event_id", type: "varchar", description: "Segment message_id" },
        { name: "user_id", type: "varchar", description: "User" },
        { name: "event", type: "varchar", description: "Event name" },
        { name: "occurred_at", type: "timestamp_ntz", description: "Event time" },
      ],
      tests: [t("unique_stg_segment__tracks_event_id", "unique", "event_id")],
      dependsOn: ["source:segment.tracks"],
      sql: `select message_id as event_id, user_id, event, timestamp as occurred_at\nfrom {{ source('segment', 'tracks') }}`,
      clusterBy: ["to_date(occurred_at)"],
    },
    {
      name: "stg_stripe__invoices",
      layer: "staging",
      materialization: "view",
      description: "Paid Stripe invoices.",
      columns: [
        { name: "invoice_id", type: "varchar", description: "Invoice" },
        { name: "amount_paid", type: "number", description: "Amount paid" },
        { name: "paid_at", type: "timestamp_ntz", description: "Payment time" },
      ],
      tests: [t("source_freshness_stripe_invoices", "freshness", undefined, "fail", "Source stripe.invoices is 31h old (error after 24h). Upstream Stripe sync is failing.")],
      dependsOn: ["source:stripe.invoices"],
      sql: `select id as invoice_id, amount_paid / 100 as amount_paid, to_timestamp(status_transitions:paid_at) as paid_at\nfrom {{ source('stripe', 'invoices') }}\nwhere status = 'paid'`,
    },
    {
      name: "stg_csv__targets",
      layer: "staging",
      materialization: "view",
      description: "Monthly targets uploaded as CSV.",
      columns: [
        { name: "month", type: "date", description: "Target month" },
        { name: "metric", type: "varchar", description: "Metric key" },
        { name: "target", type: "number", description: "Target value" },
      ],
      dependsOn: ["source:uploads.monthly_targets"],
      sql: `select month, metric, target from {{ source('uploads', 'monthly_targets') }}`,
    },
    {
      name: "int_sessions",
      layer: "intermediate",
      materialization: "ephemeral",
      description: "Sessionised events with a 30-minute inactivity window.",
      columns: [
        { name: "session_id", type: "varchar", description: "Session" },
        { name: "user_id", type: "varchar", description: "User" },
      ],
      dependsOn: ["stg_segment__tracks"],
      sql: `select user_id, md5(user_id || session_start) as session_id\nfrom {{ ref('stg_segment__tracks') }}`,
    },
    {
      name: "fct_daily_business",
      layer: "marts",
      materialization: "incremental",
      description: "Pre-aggregated daily business facts.",
      columns: [
        { name: "date", type: "date", description: "Calendar date" },
        { name: "signups", type: "number", description: "Signups" },
      ],
      tests: [t("unique_fct_daily_business_date", "unique", "date")],
      dependsOn: ["int_sessions", "stg_stripe__invoices"],
      sql: `select to_date(occurred_at) as date, count_if(event = 'Signed Up') as signups\nfrom {{ ref('stg_segment__tracks') }}\ngroup by 1`,
    },
    {
      name: "fct_revenue_daily",
      layer: "marts",
      materialization: "table",
      description: "Daily revenue from paid invoices.",
      columns: [
        { name: "date", type: "date", description: "Date" },
        { name: "gross_revenue", type: "number", description: "Revenue" },
      ],
      dependsOn: ["stg_stripe__invoices"],
      sql: `select to_date(paid_at) as date, sum(amount_paid) as gross_revenue\nfrom {{ ref('stg_stripe__invoices') }}\ngroup by 1`,
    },
    {
      name: "fct_activation_daily",
      layer: "marts",
      materialization: "table",
      description: "Daily signups and activations.",
      columns: [{ name: "date", type: "date", description: "Date" }],
      dependsOn: ["stg_segment__tracks"],
      sql: `select to_date(occurred_at) as date, count_if(event = 'Signed Up') as signups\nfrom {{ ref('stg_segment__tracks') }}\ngroup by 1`,
    },
    {
      name: "fct_retention_cohorts",
      layer: "marts",
      materialization: "table",
      description: "Weekly cohorts with retention.",
      columns: [{ name: "cohort_week", type: "date", description: "Cohort week" }],
      dependsOn: ["stg_segment__tracks"],
      sql: `select date_trunc('week', occurred_at) as cohort_week, count(distinct user_id) as users\nfrom {{ ref('stg_segment__tracks') }}\ngroup by 1`,
    },
  ];
}

export function finalizeModels(seeds: ModelSeed[], dataset: string, lastRunAt: string): DbtModel[] {
  return seeds.map((m, i) => {
    const tests = m.tests ?? [];
    const failed = tests.some((x) => x.status === "fail");
    return {
      ...m,
      tests,
      compiledSql: compile(m.sql, dataset),
      state: failed ? "warn" : "success",
      lastRunAt,
      executionSec: Math.round((1.4 + ((i * 7) % 11) * 0.9) * 10) / 10,
    };
  });
}

export function buildRunLog(command: string, startedAt: Date, models: DbtModel[], includeTests: boolean): { log: DbtRunLogLine[]; status: DbtRun["status"]; durationSec: number } {
  const log: DbtRunLogLine[] = [];
  let t = startedAt.getTime();
  const push = (level: DbtRunLogLine["level"], message: string, stepMs = 400) => {
    t += stepMs;
    log.push({ at: new Date(t).toISOString(), level, message });
  };
  push("info", "SIMULATED RUN — no warehouse queries were executed.", 0);
  push("info", `Running with dbt=1.9.4 · command: ${command}`);
  push("info", `Found ${models.length} models, ${models.reduce((a, m) => a + m.tests.length, 0)} data tests`);
  let failures = 0;
  models.forEach((m, i) => {
    push("info", `${i + 1} of ${models.length} OK created sql ${m.materialization} model ${m.name} [${m.materialization === "view" ? "CREATE VIEW" : "MERGE"} in ${m.executionSec ?? 1.2}s]`, (m.executionSec ?? 1) * 1000);
    if (includeTests) {
      for (const test of m.tests) {
        if (test.status === "fail") {
          failures++;
          push("error", `FAIL ${test.name} — ${test.message ?? "test failed"}`, 300);
        } else {
          push("info", `PASS ${test.name}`, 150);
        }
      }
    }
  });
  push("info", `Finished running ${models.length} models${includeTests ? ` and tests` : ""}.`);
  push(failures ? "error" : "info", failures ? `Completed with ${failures} error(s).` : "Completed successfully.");
  return { log, status: failures ? "error" : "success", durationSec: Math.round((t - startedAt.getTime()) / 100) / 10 };
}

export function buildDbtState(
  projectId: string,
  kind: "acme" | "northstar",
  anchor: Date,
): DbtProjectState {
  const hoursAgo = (h: number) => new Date(anchor.getTime() - h * 3_600_000);
  const models = finalizeModels(kind === "acme" ? acmeModels() : northstarModels(), kind === "acme" ? "acme-analytics.analytics" : "ANALYTICS.MARTS", hoursAgo(2).toISOString());
  const runs: DbtRun[] = [];
  const mkRun = (id: string, command: string, at: Date, tests: boolean, forceStatus?: DbtRun["status"]) => {
    const r = buildRunLog(command, at, models, tests);
    runs.push({ id, command, startedAt: at.toISOString(), durationSec: r.durationSec, status: forceStatus ?? r.status, simulated: true, triggeredBy: "schedule (seed)", log: r.log });
  };
  mkRun(`run_${projectId}_3`, "dbt build --select +marts", hoursAgo(2), true);
  mkRun(`run_${projectId}_2`, "dbt run --select marts", hoursAgo(26), false);
  mkRun(`run_${projectId}_1`, "dbt build", hoursAgo(50), false, "success");
  return {
    projectId,
    configured: true,
    dbtVersion: "1.9.4",
    adapter: kind === "acme" ? "bigquery" : "snowflake",
    target: "prod",
    repository:
      kind === "acme" ? { url: "https://github.com/acme-co/analytics-dbt", branch: "main", path: "/", connected: false } : undefined,
    models,
    runs,
  };
}
