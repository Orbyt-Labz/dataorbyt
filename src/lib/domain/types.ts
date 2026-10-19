/**
 * DataOrbyt domain model. These types are vendor-neutral: connector- or
 * warehouse-specific details live behind adapters (see src/lib/adapters).
 */

export type ISODate = string; // YYYY-MM-DD
export type ISODateTime = string; // full ISO timestamp

export type Environment = "production" | "staging" | "development";
export type ProjectStatus = "healthy" | "warning" | "error" | "setup";

export interface Project {
  id: string;
  name: string;
  slug: string;
  description: string;
  environment: Environment;
  timezone: string;
  currency: string;
  industry?: string;
  status: ProjectStatus;
  /** True when the project's data comes from DataOrbyt's deterministic demo generator. */
  sampleData: boolean;
  createdAt: ISODateTime;
}

/* ------------------------------------------------------------------ */
/* Connections                                                          */
/* ------------------------------------------------------------------ */

export type ConnectorCategory =
  | "warehouse"
  | "database"
  | "product_analytics"
  | "billing"
  | "crm"
  | "event_pipeline"
  | "file_upload";

export type ConnectorAvailability = "available" | "coming_soon";

export interface ConnectorFieldDef {
  key: string;
  label: string;
  type: "text" | "password" | "number" | "textarea" | "select";
  placeholder?: string;
  required: boolean;
  secret?: boolean;
  help?: string;
  options?: string[];
}

export interface ConnectorDefinition {
  id: string;
  name: string;
  category: ConnectorCategory;
  availability: ConnectorAvailability;
  description: string;
  fields: ConnectorFieldDef[];
  leastPrivilege: string;
  /** Tables the demo adapter "discovers" for this connector. */
  demoTables: string[];
}

export type ConnectionStatus = "connected" | "syncing" | "error" | "paused";

export interface SyncRun {
  id: string;
  startedAt: ISODateTime;
  durationSec: number;
  status: "success" | "error";
  rowsSynced: number;
  message?: string;
}

export interface DiscoveredTable {
  name: string;
  rows: number;
  columns: { name: string; type: string }[];
}

export interface Connection {
  id: string;
  projectId: string;
  connectorId: string;
  name: string;
  environment: Environment;
  status: ConnectionStatus;
  /** Always true until a real adapter is wired up. */
  demo: boolean;
  /** Non-secret configuration only (host, dataset, account). Secrets are never stored in the demo. */
  config: Record<string, string>;
  /** Names of secret fields the user supplied; values are discarded in demo mode. */
  secretFieldsProvided: string[];
  lastSyncAt?: ISODateTime;
  syncFrequency: "15m" | "1h" | "6h" | "24h";
  tables: DiscoveredTable[];
  syncHistory: SyncRun[];
  error?: string;
  createdAt: ISODateTime;
}

/* ------------------------------------------------------------------ */
/* Metrics                                                              */
/* ------------------------------------------------------------------ */

export type MetricDomain = "revenue" | "growth" | "engagement" | "retention" | "acquisition";
export type MetricStatus = "approved" | "draft" | "deprecated" | "requested";
export type MetricUnit = "currency" | "count" | "percent";
export type Grain = "day" | "week" | "month";

/** Field names available in the demo daily fact table (fct_daily_business). */
export type FactField =
  | "visitors"
  | "signups"
  | "activated"
  | "dau"
  | "wau"
  | "trials_started"
  | "trial_conversions"
  | "gross_revenue"
  | "refunds"
  | "fees"
  | "active_subscriptions"
  | "churned_subscriptions"
  | "retained_d7"
  | "cohort_d7";

export type MetricAggregation =
  | { type: "sum"; field: FactField; minus?: FactField[] }
  | { type: "gauge"; field: FactField }
  | { type: "ratio"; numerator: FactField; denominator: FactField };

export interface Metric {
  id: string;
  projectId: string;
  key: string;
  name: string;
  description: string;
  domain: MetricDomain;
  owner: string;
  status: MetricStatus;
  unit: MetricUnit;
  defaultGrain: Grain;
  aggregation: MetricAggregation;
  /** Human-readable definition shown in the catalog. */
  formula: string;
  dimensions: string[];
  sourceModel: string; // dbt model name
  sourceTables: string[]; // raw tables
  /** Higher is better (affects tile colouring and alert defaults). */
  direction: "up" | "down";
  updatedAt: ISODateTime;
}

export interface MetricRequest {
  id: string;
  projectId: string;
  key: string;
  name: string;
  description: string;
  domain: MetricDomain;
  unit: MetricUnit;
  sourceModel: string;
  aggregation: MetricAggregation;
  dimensions: string[];
  proposedSql: string;
  requestedBy: string;
  status: "pending_review" | "approved" | "rejected";
  createdAt: ISODateTime;
}

/* ------------------------------------------------------------------ */
/* Charts & dashboards                                                  */
/* ------------------------------------------------------------------ */

export type Visualization =
  | "kpi"
  | "timeseries"
  | "line"
  | "area"
  | "bar"
  | "stacked_bar"
  | "funnel"
  | "cohort_heatmap"
  | "table"
  | "scatter"
  | "distribution";

export type DateRangeKey = "7d" | "14d" | "30d" | "60d" | "90d";
export type ChartSize = "sm" | "md" | "lg" | "full";

export interface ChartFilter {
  dimension: string;
  values: string[];
}

/** Typed, serialisable chart specification. Saved dashboards store only this. */
export interface ChartSpec {
  id: string;
  title: string;
  description?: string;
  visualization: Visualization;
  /** Metric keys (project scoped). Funnels use them as ordered steps; scatter uses [x, y]. */
  metrics: string[];
  groupBy?: string;
  grain: Grain;
  /** "inherit" follows the dashboard's global date filter. */
  dateRange: DateRangeKey | "inherit";
  filters: ChartFilter[];
  size: ChartSize;
}

export type DashboardVisibility = "private" | "organization" | "link";

export interface Dashboard {
  id: string;
  projectId: string;
  name: string;
  description: string;
  tags: string[];
  owner: string;
  visibility: DashboardVisibility;
  status: "draft" | "published";
  charts: ChartSpec[];
  /** Snapshot of charts at last publish; viewers see this. */
  publishedCharts?: ChartSpec[];
  templateId?: string;
  viewCount: number;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  publishedAt?: ISODateTime;
  lastViewedAt?: ISODateTime;
  /** Draft created by an MCP client. */
  createdVia: "ui" | "mcp" | "seed";
}

export interface DashboardTemplate {
  id: string;
  name: string;
  description: string;
  tags: string[];
  charts: Omit<ChartSpec, "id">[];
}

/* ------------------------------------------------------------------ */
/* dbt                                                                  */
/* ------------------------------------------------------------------ */

export type DbtLayer = "staging" | "intermediate" | "marts";
export type DbtModelState = "success" | "error" | "warn" | "skipped" | "not_run";

export interface DbtTest {
  name: string;
  column?: string;
  type: "not_null" | "unique" | "accepted_values" | "relationships" | "freshness" | "expression";
  status: "pass" | "fail" | "warn" | "not_run";
  message?: string;
}

export interface DbtColumn {
  name: string;
  type: string;
  description: string;
}

export interface DbtModel {
  name: string;
  layer: DbtLayer;
  materialization: "view" | "table" | "incremental" | "ephemeral";
  description: string;
  columns: DbtColumn[];
  tests: DbtTest[];
  dependsOn: string[]; // model names or source:table
  sql: string;
  compiledSql: string;
  state: DbtModelState;
  lastRunAt?: ISODateTime;
  executionSec?: number;
  partitionBy?: string;
  clusterBy?: string[];
}

export interface DbtRunLogLine {
  at: ISODateTime;
  level: "info" | "warn" | "error";
  message: string;
}

export interface DbtRun {
  id: string;
  command: string;
  startedAt: ISODateTime;
  durationSec: number;
  status: "success" | "error" | "warn";
  simulated: true;
  triggeredBy: string;
  log: DbtRunLogLine[];
}

export interface DbtProjectState {
  projectId: string;
  configured: boolean;
  dbtVersion: string;
  adapter: string;
  target: string;
  repository?: { url: string; branch: string; path: string; connected: false };
  models: DbtModel[];
  runs: DbtRun[];
}

/* ------------------------------------------------------------------ */
/* Experiments                                                          */
/* ------------------------------------------------------------------ */

export type ExperimentStatus = "draft" | "running" | "completed" | "stopped";
export type RandomizationUnit = "user" | "account" | "session" | "device";

export interface ExperimentVariant {
  key: string;
  name: string;
  allocation: number; // percent, all variants sum to 100
  isControl: boolean;
}

export interface VariantObservation {
  variant: string;
  assigned: number;
  exposed: number;
  conversions: number;
}

export interface GuardrailObservation {
  metricKey: string;
  byVariant: { variant: string; value: number }[];
  /** "lower" means lower values are worse for this guardrail. */
  harmfulDirection: "lower" | "higher";
  tolerancePct: number;
}

export interface Experiment {
  id: string;
  projectId: string;
  key: string;
  name: string;
  hypothesis: string;
  population: string;
  randomizationUnit: RandomizationUnit;
  variants: ExperimentVariant[];
  startDate: ISODate;
  endDate: ISODate;
  primaryMetric: string;
  guardrailMetrics: string[];
  minimumDetectableEffectPct?: number;
  targetSampleSizePerVariant?: number;
  status: ExperimentStatus;
  owner: string;
  observations: VariantObservation[];
  guardrails: GuardrailObservation[];
  relatedDashboardIds: string[];
  createdAt: ISODateTime;
  createdVia: "ui" | "mcp" | "seed";
}

/* ------------------------------------------------------------------ */
/* Alerts                                                               */
/* ------------------------------------------------------------------ */

export type AlertType = "threshold" | "relative_change" | "missing_data" | "freshness_sla" | "pipeline_failure";
export type AlertSeverity = "info" | "warning" | "critical";
export type AlertChannel = "email" | "slack" | "webhook";
export type AlertCadence = "hourly" | "daily" | "weekly";

export type AlertCondition =
  | { kind: "threshold"; operator: "gt" | "lt" | "gte" | "lte"; value: number }
  | { kind: "relative_change"; direction: "increase" | "decrease" | "either"; pct: number; comparedTo: "previous_period" | "same_day_last_week" }
  | { kind: "missing_data"; expectedRowsAtLeast: number }
  | { kind: "freshness_sla"; maxAgeHours: number }
  | { kind: "pipeline_failure"; target: "dbt_run" | "dbt_test" | "connection_sync" };

export interface AlertEvent {
  id: string;
  at: ISODateTime;
  state: "fired" | "resolved" | "ok" | "suppressed";
  value?: number;
  message: string;
  acknowledgedBy?: string;
  /** Deliveries are always simulated in the demo build. */
  delivery: "simulated" | "not_sent";
}

export interface Alert {
  id: string;
  projectId: string;
  name: string;
  type: AlertType;
  metricKey?: string;
  condition: AlertCondition;
  cadence: AlertCadence;
  lookbackDays: number;
  channel: AlertChannel;
  recipients: string[];
  severity: AlertSeverity;
  cooldownMinutes: number;
  consecutiveEvaluations: number;
  status: "active" | "paused";
  snoozedUntil?: ISODateTime;
  lastEvaluatedAt?: ISODateTime;
  lastTriggeredAt?: ISODateTime;
  history: AlertEvent[];
  createdAt: ISODateTime;
  createdVia: "ui" | "mcp" | "seed";
  draft: boolean;
}

/* ------------------------------------------------------------------ */
/* Workspace, auth, audit                                               */
/* ------------------------------------------------------------------ */

export type Role = "owner" | "admin" | "editor" | "viewer";

export interface Member {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: "active" | "invited";
}

export type TokenScope = "read" | "draft" | "publish";

export interface ApiToken {
  id: string;
  name: string;
  prefix: string; // first chars shown in UI, e.g. "dob_live_3f9a"
  hash: string; // sha256 of the token; plaintext is never stored
  scopes: TokenScope[];
  projectIds: string[] | "all";
  createdAt: ISODateTime;
  lastUsedAt?: ISODateTime;
  revokedAt?: ISODateTime;
}

export interface AuditEvent {
  id: string;
  at: ISODateTime;
  actor: string;
  actorType: "user" | "mcp" | "system";
  action: string;
  projectId?: string;
  target?: string;
  detail?: string;
}

export interface Workspace {
  name: string;
  slug: string;
  plan: "Demo";
  defaultTimezone: string;
  defaultCurrency: string;
  notificationPrefs: { weeklyDigest: boolean; alertEmails: boolean; dbtFailures: boolean; productUpdates: boolean };
}

export interface QueryHistoryEntry {
  id: string;
  at: ISODateTime;
  projectId: string;
  metricKey: string;
  source: "ui" | "mcp" | "alert" | "dashboard";
  dashboardId?: string;
  cacheHit: boolean;
  scanBytes: number;
  durationMs: number;
  rows: number;
  status: "ok" | "rejected" | "timeout" | "error";
  reason?: string;
}
