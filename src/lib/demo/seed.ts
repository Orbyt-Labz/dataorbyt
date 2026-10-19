import type {
  Alert,
  AuditEvent,
  ChartSpec,
  Connection,
  Dashboard,
  DbtProjectState,
  Experiment,
  Member,
  Metric,
  Project,
  SyncRun,
  Workspace,
} from "@/lib/domain/types";
import { getConnector } from "@/lib/domain/connectors";
import { DASHBOARD_TEMPLATES } from "@/lib/domain/templates";
import { generateDailyFacts, hashString, createRng, toISODate, addDays, type DailyFact, type FactProfile } from "./facts";
import { buildMetrics } from "./seed-metrics";
import { buildDbtState } from "./seed-dbt";

export interface SeedState {
  workspace: Workspace;
  members: Member[];
  projects: Project[];
  connections: Connection[];
  metrics: Metric[];
  dashboards: Dashboard[];
  dbt: Record<string, DbtProjectState>;
  experiments: Experiment[];
  alerts: Alert[];
  audit: AuditEvent[];
  facts: Record<string, DailyFact[]>;
  factsLoadedAt: Record<string, string>;
  profiles: Record<string, FactProfile>;
}

export const CURRENT_USER = { name: "Alex Morgan", email: "alex@demo.dataorbyt.dev", role: "owner" as const };

export const ACME_PROFILE: FactProfile = {
  seed: 1337,
  baseVisitors: 4200,
  dailyGrowth: 0.0042,
  signupRate: 0.046,
  activationRate: 0.39,
  baseDau: 1850,
  startingSubscriptions: 1180,
  arpuMonthly: 79,
  incidents: [{ daysAgo: 3, revenueFactor: 0.58 }],
};

export const NORTHSTAR_PROFILE: FactProfile = {
  seed: 4242,
  baseVisitors: 1600,
  dailyGrowth: 0.0068,
  signupRate: 0.052,
  activationRate: 0.31,
  baseDau: 540,
  startingSubscriptions: 210,
  arpuMonthly: 149,
};

export function profileForNewProject(projectId: string): FactProfile {
  const rng = createRng(hashString(projectId));
  return {
    seed: hashString(projectId),
    baseVisitors: Math.round(900 + rng() * 2500),
    dailyGrowth: 0.002 + rng() * 0.006,
    signupRate: 0.035 + rng() * 0.025,
    activationRate: 0.28 + rng() * 0.15,
    baseDau: Math.round(300 + rng() * 1200),
    startingSubscriptions: Math.round(100 + rng() * 700),
    arpuMonthly: Math.round(39 + rng() * 120),
  };
}

let chartCounter = 0;
export function chartsFromTemplate(templateId: string, prefix: string): ChartSpec[] {
  const tpl = DASHBOARD_TEMPLATES.find((t) => t.id === templateId);
  if (!tpl) return [];
  return tpl.charts.map((c, i) => ({ ...c, id: `${prefix}_c${i + 1}_${(chartCounter++).toString(36)}` }));
}

function syncHistory(projectId: string, connectorId: string, anchor: Date, failingLast = 0): SyncRun[] {
  const rng = createRng(hashString(projectId + connectorId));
  return Array.from({ length: 8 }, (_, i) => {
    const failed = i < failingLast;
    return {
      id: `sync_${projectId}_${connectorId}_${i}`,
      startedAt: new Date(anchor.getTime() - (i * 6 + 1) * 3_600_000).toISOString(),
      durationSec: Math.round(20 + rng() * 140),
      status: failed ? "error" : "success",
      rowsSynced: failed ? 0 : Math.round(800 + rng() * 42_000),
      message: failed ? "401 Unauthorized: API key has been rolled or revoked (simulated)." : undefined,
    } satisfies SyncRun;
  });
}

export function demoConnection(
  projectId: string,
  connectorId: string,
  anchor: Date,
  opts: Partial<Pick<Connection, "status" | "error" | "config" | "environment" | "syncFrequency">> & { failingLast?: number; name?: string } = {},
): Connection {
  const def = getConnector(connectorId);
  if (!def) throw new Error(`Unknown connector ${connectorId}`);
  const history = syncHistory(projectId, connectorId, anchor, opts.failingLast ?? 0);
  const rng = createRng(hashString(projectId + connectorId + "tables"));
  const lastOk = history.find((h) => h.status === "success");
  return {
    id: `conn_${projectId}_${connectorId}`,
    projectId,
    connectorId,
    name: opts.name ?? def.name,
    environment: opts.environment ?? "production",
    status: opts.status ?? "connected",
    demo: true,
    config: opts.config ?? {},
    secretFieldsProvided: def.fields.filter((f) => f.secret).map((f) => f.key),
    lastSyncAt: lastOk?.startedAt,
    syncFrequency: opts.syncFrequency ?? "6h",
    tables: def.demoTables.map((name) => ({
      name,
      rows: Math.round(10_000 + rng() * 1_800_000),
      columns: [
        { name: "id", type: "string" },
        { name: "created_at", type: "timestamp" },
        { name: "updated_at", type: "timestamp" },
      ],
    })),
    syncHistory: history,
    error: opts.error,
    createdAt: new Date(anchor.getTime() - 40 * 86_400_000).toISOString(),
  };
}

export function buildSeed(now: Date): SeedState {
  const iso = (d: Date) => d.toISOString();
  const hoursAgo = (h: number) => iso(new Date(now.getTime() - h * 3_600_000));
  const daysAgo = (d: number) => hoursAgo(d * 24);
  const endDate = toISODate(new Date(now.getTime() - 86_400_000)); // data through yesterday

  const projects: Project[] = [
    {
      id: "acme",
      name: "Acme Analytics",
      slug: "acme-analytics",
      description: "B2B SaaS for agency reporting. Seed-stage, ~1.2k paying customers.",
      environment: "production",
      timezone: "America/New_York",
      currency: "USD",
      industry: "B2B SaaS",
      status: "warning",
      sampleData: true,
      createdAt: daysAgo(120),
    },
    {
      id: "northstar",
      name: "Northstar",
      slug: "northstar",
      description: "Consumer fitness subscription app, launched 4 months ago.",
      environment: "production",
      timezone: "Europe/London",
      currency: "GBP",
      industry: "Consumer subscription",
      status: "error",
      sampleData: true,
      createdAt: daysAgo(95),
    },
  ];

  const connections: Connection[] = [
    demoConnection("acme", "bigquery", now, { config: { projectId: "acme-analytics-prod", dataset: "analytics", location: "US" }, syncFrequency: "1h" }),
    demoConnection("acme", "stripe", now, { config: { accountId: "acct_1AcmeDemo" } }),
    demoConnection("acme", "posthog", now, { config: { host: "https://us.posthog.com", projectKey: "48211" }, syncFrequency: "1h" }),
    demoConnection("acme", "hubspot", now, { status: "syncing", config: { portalId: "4412093" }, syncFrequency: "24h" }),
    demoConnection("northstar", "snowflake", now, {
      config: { account: "ns12345.eu-west-2", warehouse: "DATAORBYT_XS", database: "ANALYTICS", role: "DATAORBYT_READER", user: "dataorbyt_svc" },
      syncFrequency: "1h",
    }),
    demoConnection("northstar", "segment", now, { config: { workspace: "northstar", schema: "segment_prod" }, syncFrequency: "15m" }),
    demoConnection("northstar", "stripe", now, {
      status: "error",
      error: "401 Unauthorized: API key has been rolled or revoked (simulated).",
      failingLast: 5,
      config: { accountId: "acct_1NorthstarDemo" },
    }),
    demoConnection("northstar", "csv", now, { name: "Monthly targets (CSV)", config: { tableName: "monthly_targets", delimiter: "," }, syncFrequency: "24h" }),
  ];

  const metrics: Metric[] = [
    ...buildMetrics("acme", daysAgo(6), { statusOverrides: { visitor_conversion: "draft" } }),
    ...buildMetrics("northstar", daysAgo(11), { exclude: ["daily_active_users"], statusOverrides: { churn_rate: "deprecated" } }),
  ];

  const dash = (
    id: string,
    projectId: string,
    templateId: string,
    name: string,
    extra: Partial<Dashboard>,
  ): Dashboard => {
    const charts = chartsFromTemplate(templateId, id);
    const tpl = DASHBOARD_TEMPLATES.find((t) => t.id === templateId)!;
    return {
      id,
      projectId,
      name,
      description: tpl.description,
      tags: tpl.tags,
      owner: CURRENT_USER.name,
      visibility: "organization",
      status: "published",
      charts,
      publishedCharts: charts,
      templateId,
      viewCount: 0,
      createdAt: daysAgo(30),
      updatedAt: daysAgo(2),
      publishedAt: daysAgo(2),
      createdVia: "seed",
      ...extra,
    };
  };

  const dashboards: Dashboard[] = [
    dash("d_acme_founder", "acme", "founder_overview", "Founder Overview", { viewCount: 412, lastViewedAt: hoursAgo(3), updatedAt: daysAgo(1), tags: ["founder", "weekly", "board"] }),
    dash("d_acme_revenue", "acme", "revenue_billing", "Revenue & Billing", { owner: "Dev Patel", viewCount: 188, lastViewedAt: hoursAgo(20), updatedAt: daysAgo(4) }),
    dash("d_acme_funnel", "acme", "acquisition_funnel", "Acquisition Funnel", { owner: "Sam Rivera", viewCount: 96, lastViewedAt: daysAgo(2), updatedAt: daysAgo(6), visibility: "link" }),
    dash("d_acme_retention", "acme", "retention_cohorts", "Retention & Cohorts", { owner: "Lena Okafor", viewCount: 71, lastViewedAt: daysAgo(3), updatedAt: daysAgo(9) }),
    dash("d_acme_exp", "acme", "experiment_readout", "Onboarding Checklist v2 — Readout", { owner: "Dev Patel", viewCount: 54, lastViewedAt: daysAgo(5), updatedAt: daysAgo(8), visibility: "private", tags: ["experiments", "onboarding"] }),
    dash("d_ns_growth", "northstar", "saas_growth", "Northstar Growth", {
      status: "draft",
      publishedCharts: undefined,
      publishedAt: undefined,
      viewCount: 12,
      visibility: "private",
      lastViewedAt: daysAgo(1),
      updatedAt: hoursAgo(30),
    }),
  ];

  const experiments: Experiment[] = [
    {
      id: "exp_acme_onboarding",
      projectId: "acme",
      key: "onboarding_checklist_v2",
      name: "Onboarding checklist v2",
      hypothesis: "A 4-step guided checklist will increase trial-to-paid conversion by making the first shared dashboard easier to reach.",
      population: "New trial signups, all plans, web only",
      randomizationUnit: "account",
      variants: [
        { key: "control", name: "Current onboarding", allocation: 50, isControl: true },
        { key: "checklist", name: "Guided checklist", allocation: 50, isControl: false },
      ],
      startDate: addDays(endDate, -41),
      endDate: addDays(endDate, -13),
      primaryMetric: "trial_to_paid",
      guardrailMetrics: ["churn_rate", "activation_rate"],
      minimumDetectableEffectPct: 15,
      targetSampleSizePerVariant: 2400,
      status: "completed",
      owner: "Dev Patel",
      observations: [
        { variant: "control", assigned: 2611, exposed: 2540, conversions: 457 },
        { variant: "checklist", assigned: 2589, exposed: 2522, conversions: 541 },
      ],
      guardrails: [
        { metricKey: "activation_rate", byVariant: [{ variant: "control", value: 0.392 }, { variant: "checklist", value: 0.431 }], harmfulDirection: "lower", tolerancePct: 5 },
        { metricKey: "churn_rate", byVariant: [{ variant: "control", value: 0.0112 }, { variant: "checklist", value: 0.0109 }], harmfulDirection: "higher", tolerancePct: 10 },
      ],
      relatedDashboardIds: ["d_acme_exp", "d_acme_funnel"],
      createdAt: daysAgo(45),
      createdVia: "seed",
    },
    {
      id: "exp_acme_annual",
      projectId: "acme",
      key: "annual_plan_nudge",
      name: "Annual plan nudge at checkout",
      hypothesis: "Showing annual savings at checkout increases the share of paid conversions without reducing trial-to-paid.",
      population: "Trial users reaching checkout",
      randomizationUnit: "user",
      variants: [
        { key: "control", name: "Monthly default", allocation: 50, isControl: true },
        { key: "annual_nudge", name: "Annual savings banner", allocation: 50, isControl: false },
      ],
      startDate: addDays(endDate, -5),
      endDate: addDays(endDate, 23),
      primaryMetric: "trial_to_paid",
      guardrailMetrics: ["net_revenue"],
      minimumDetectableEffectPct: 10,
      targetSampleSizePerVariant: 3100,
      status: "running",
      owner: "Alex Morgan",
      observations: [
        { variant: "control", assigned: 212, exposed: 188, conversions: 31 },
        { variant: "annual_nudge", assigned: 205, exposed: 181, conversions: 36 },
      ],
      guardrails: [
        { metricKey: "net_revenue", byVariant: [{ variant: "control", value: 4120 }, { variant: "annual_nudge", value: 4388 }], harmfulDirection: "lower", tolerancePct: 5 },
      ],
      relatedDashboardIds: ["d_acme_revenue"],
      createdAt: daysAgo(7),
      createdVia: "seed",
    },
    {
      id: "exp_ns_pricing",
      projectId: "northstar",
      key: "pricing_page_layout",
      name: "Pricing page layout",
      hypothesis: "A two-column pricing page with a highlighted yearly plan improves signup-to-trial conversion.",
      population: "Visitors to /pricing on mobile and web",
      randomizationUnit: "device",
      variants: [
        { key: "control", name: "Three cards", allocation: 50, isControl: true },
        { key: "two_column", name: "Two columns", allocation: 50, isControl: false },
      ],
      startDate: addDays(endDate, -20),
      endDate: addDays(endDate, 8),
      primaryMetric: "trial_to_paid",
      guardrailMetrics: ["activation_rate"],
      minimumDetectableEffectPct: 12,
      targetSampleSizePerVariant: 1800,
      status: "running",
      owner: "Sam Rivera",
      // Deliberate sample-ratio mismatch: an assignment bug on iOS.
      observations: [
        { variant: "control", assigned: 1984, exposed: 1902, conversions: 301 },
        { variant: "two_column", assigned: 1631, exposed: 1570, conversions: 288 },
      ],
      guardrails: [
        { metricKey: "activation_rate", byVariant: [{ variant: "control", value: 0.31 }, { variant: "two_column", value: 0.305 }], harmfulDirection: "lower", tolerancePct: 5 },
      ],
      relatedDashboardIds: ["d_ns_growth"],
      createdAt: daysAgo(22),
      createdVia: "seed",
    },
    {
      id: "exp_ns_streaks",
      projectId: "northstar",
      key: "workout_streaks",
      name: "Workout streak reminders",
      hypothesis: "Push reminders for streaks raise 7-day retention for new users.",
      population: "New iOS and Android users",
      randomizationUnit: "user",
      variants: [
        { key: "control", name: "No reminders", allocation: 50, isControl: true },
        { key: "reminders", name: "Streak reminders", allocation: 50, isControl: false },
      ],
      startDate: addDays(endDate, 4),
      endDate: addDays(endDate, 32),
      primaryMetric: "retention_7d",
      guardrailMetrics: ["activation_rate"],
      minimumDetectableEffectPct: 8,
      status: "draft",
      owner: "Lena Okafor",
      observations: [],
      guardrails: [],
      relatedDashboardIds: [],
      createdAt: daysAgo(2),
      createdVia: "seed",
    },
  ];

  const incidentDay = addDays(endDate, -3);
  const alerts: Alert[] = [
    {
      id: "al_acme_rev_drop",
      projectId: "acme",
      name: "Gross revenue dropped vs same day last week",
      type: "relative_change",
      metricKey: "gross_revenue",
      condition: { kind: "relative_change", direction: "decrease", pct: 25, comparedTo: "same_day_last_week" },
      cadence: "daily",
      lookbackDays: 1,
      channel: "slack",
      recipients: ["#founders"],
      severity: "critical",
      cooldownMinutes: 720,
      consecutiveEvaluations: 1,
      status: "active",
      lastEvaluatedAt: hoursAgo(5),
      lastTriggeredAt: `${addDays(incidentDay, 1)}T09:00:00.000Z`,
      history: [
        { id: "ev1", at: `${addDays(incidentDay, 2)}T09:00:00.000Z`, state: "resolved", message: "Gross revenue recovered to within 25% of last week.", delivery: "simulated" },
        {
          id: "ev0",
          at: `${addDays(incidentDay, 1)}T09:00:00.000Z`,
          state: "fired",
          value: -0.41,
          message: `Gross revenue on ${incidentDay} was 41% lower than the same day last week. Check Stripe for failed payments.`,
          delivery: "simulated",
        },
      ],
      createdAt: daysAgo(60),
      createdVia: "seed",
      draft: false,
    },
    {
      id: "al_acme_activation",
      projectId: "acme",
      name: "Activation rate below 35%",
      type: "threshold",
      metricKey: "activation_rate",
      condition: { kind: "threshold", operator: "lt", value: 0.35 },
      cadence: "weekly",
      lookbackDays: 7,
      channel: "email",
      recipients: ["alex@demo.dataorbyt.dev", "dev@demo.dataorbyt.dev"],
      severity: "warning",
      cooldownMinutes: 1440,
      consecutiveEvaluations: 2,
      status: "active",
      lastEvaluatedAt: daysAgo(2),
      history: [{ id: "ev2", at: daysAgo(2), state: "ok", value: 0.43, message: "Activation rate 43.0% — above threshold.", delivery: "not_sent" }],
      createdAt: daysAgo(50),
      createdVia: "seed",
      draft: false,
    },
    {
      id: "al_acme_freshness",
      projectId: "acme",
      name: "PostHog data older than 6 hours",
      type: "freshness_sla",
      condition: { kind: "freshness_sla", maxAgeHours: 6 },
      cadence: "hourly",
      lookbackDays: 1,
      channel: "slack",
      recipients: ["#data-alerts"],
      severity: "warning",
      cooldownMinutes: 180,
      consecutiveEvaluations: 2,
      status: "paused",
      lastEvaluatedAt: daysAgo(4),
      history: [],
      createdAt: daysAgo(40),
      createdVia: "seed",
      draft: false,
    },
    {
      id: "al_acme_dbt",
      projectId: "acme",
      name: "dbt test failures",
      type: "pipeline_failure",
      condition: { kind: "pipeline_failure", target: "dbt_test" },
      cadence: "hourly",
      lookbackDays: 1,
      channel: "email",
      recipients: ["data@demo.dataorbyt.dev"],
      severity: "warning",
      cooldownMinutes: 360,
      consecutiveEvaluations: 1,
      status: "active",
      lastEvaluatedAt: hoursAgo(2),
      lastTriggeredAt: hoursAgo(2),
      history: [
        {
          id: "ev3",
          at: hoursAgo(2),
          state: "fired",
          message: "dbt build: not_null_stg_stripe__charges_customer_id failed (14 rows).",
          delivery: "simulated",
        },
      ],
      createdAt: daysAgo(35),
      createdVia: "seed",
      draft: false,
    },
    {
      id: "al_ns_stripe",
      projectId: "northstar",
      name: "Stripe sync failing",
      type: "pipeline_failure",
      condition: { kind: "pipeline_failure", target: "connection_sync" },
      cadence: "hourly",
      lookbackDays: 1,
      channel: "email",
      recipients: ["sam@demo.dataorbyt.dev"],
      severity: "critical",
      cooldownMinutes: 240,
      consecutiveEvaluations: 2,
      status: "active",
      lastEvaluatedAt: hoursAgo(1),
      lastTriggeredAt: hoursAgo(25),
      history: [
        { id: "ev4", at: hoursAgo(25), state: "fired", message: "Stripe sync failed 5 times in a row: 401 Unauthorized (simulated).", delivery: "simulated", acknowledgedBy: "Sam Rivera" },
      ],
      createdAt: daysAgo(30),
      createdVia: "seed",
      draft: false,
    },
    {
      id: "al_ns_missing",
      projectId: "northstar",
      name: "No signups recorded",
      type: "missing_data",
      metricKey: "signups",
      condition: { kind: "missing_data", expectedRowsAtLeast: 1 },
      cadence: "daily",
      lookbackDays: 1,
      channel: "webhook",
      recipients: ["https://hooks.example.com/northstar-alerts"],
      severity: "info",
      cooldownMinutes: 1440,
      consecutiveEvaluations: 1,
      status: "active",
      lastEvaluatedAt: hoursAgo(9),
      history: [],
      createdAt: daysAgo(20),
      createdVia: "seed",
      draft: false,
    },
  ];

  const members: Member[] = [
    { id: "u1", name: CURRENT_USER.name, email: CURRENT_USER.email, role: "owner", status: "active" },
    { id: "u2", name: "Dev Patel", email: "dev@demo.dataorbyt.dev", role: "admin", status: "active" },
    { id: "u3", name: "Sam Rivera", email: "sam@demo.dataorbyt.dev", role: "editor", status: "active" },
    { id: "u4", name: "Lena Okafor", email: "lena@demo.dataorbyt.dev", role: "viewer", status: "active" },
    { id: "u5", name: "", email: "investor-updates@demo.dataorbyt.dev", role: "viewer", status: "invited" },
  ];

  const audit: AuditEvent[] = [
    { id: "a1", at: hoursAgo(2), actor: "system", actorType: "system", action: "dbt.run.failed", projectId: "acme", target: "dbt build --select +marts", detail: "1 test failed (simulated run)" },
    { id: "a2", at: hoursAgo(25), actor: "system", actorType: "system", action: "connection.sync.failed", projectId: "northstar", target: "Stripe", detail: "401 Unauthorized (simulated)" },
    { id: "a3", at: daysAgo(1), actor: CURRENT_USER.name, actorType: "user", action: "dashboard.updated", projectId: "acme", target: "Founder Overview" },
    { id: "a4", at: hoursAgo(30), actor: "Sam Rivera", actorType: "user", action: "dashboard.draft_created", projectId: "northstar", target: "Northstar Growth" },
    { id: "a5", at: daysAgo(6), actor: "Dev Patel", actorType: "user", action: "metric.approved", projectId: "acme", target: "trial_to_paid" },
    { id: "a6", at: daysAgo(7), actor: CURRENT_USER.name, actorType: "user", action: "experiment.started", projectId: "acme", target: "annual_plan_nudge" },
  ];

  const loadedAt = hoursAgo(1.6);
  return {
    workspace: {
      name: "Demo Workspace",
      slug: "demo",
      plan: "Demo",
      defaultTimezone: "America/New_York",
      defaultCurrency: "USD",
      notificationPrefs: { weeklyDigest: true, alertEmails: true, dbtFailures: true, productUpdates: false },
    },
    members,
    projects,
    connections,
    metrics,
    dashboards,
    dbt: { acme: buildDbtState("acme", "acme", now), northstar: buildDbtState("northstar", "northstar", now) },
    experiments,
    alerts,
    audit,
    facts: {
      acme: generateDailyFacts(ACME_PROFILE, endDate, 90),
      northstar: generateDailyFacts(NORTHSTAR_PROFILE, endDate, 90),
    },
    factsLoadedAt: { acme: loadedAt, northstar: hoursAgo(31) },
    profiles: { acme: ACME_PROFILE, northstar: NORTHSTAR_PROFILE },
  };
}
