import type { ConnectorDefinition, DiscoveredTable, FactField, Grain, ISODate, MetricAggregation } from "@/lib/domain/types";

/** A compiled, validated query plan. Only MetricQueryService builds these. */
export interface QueryPlan {
  projectId: string;
  metricKey: string;
  aggregation: MetricAggregation;
  sourceModel: string;
  start: ISODate;
  end: ISODate;
  grain: Grain;
  groupBy?: string;
  filters: { dimension: string; values: string[] }[];
  /** Parameterised SQL for display/audit. Parameters are never string-interpolated. */
  sql: string;
  params: Record<string, string | number | string[]>;
}

export interface QueryRow {
  period: ISODate;
  group?: string;
  value: number;
  numerator?: number;
  denominator?: number;
}

export interface QueryEstimate {
  scanBytes: number;
  rows: number;
}

/**
 * Warehouse adapters execute compiled plans. Real adapters (BigQuery, Snowflake,
 * Postgres) would translate the plan to vendor SQL, run it with a read-only role,
 * enforce timeouts at the driver level and report bytes scanned.
 */
export interface WarehouseAdapter {
  readonly kind: string;
  readonly demo: boolean;
  estimate(plan: QueryPlan): QueryEstimate;
  execute(plan: QueryPlan, opts: { timeoutMs: number; rowLimit: number }): Promise<QueryRow[]>;
  /** Range of dates with data available for a project, or null if no data. */
  coverage(projectId: string): { start: ISODate; end: ISODate; loadedAt: string } | null;
  /** Raw field series, used for distributions and scatter plots. */
  fieldSeries(projectId: string, field: FactField, start: ISODate, end: ISODate): { date: ISODate; value: number }[];
}

export interface ConnectionTestResult {
  ok: boolean;
  latencyMs: number;
  message: string;
  checks: { label: string; ok: boolean; detail?: string }[];
}

/**
 * Source connector adapters validate credentials and discover schemas. Secrets are
 * passed in for the duration of the call only and are never returned.
 */
export interface SourceConnectorAdapter {
  readonly demo: boolean;
  test(def: ConnectorDefinition, config: Record<string, string>, secrets: Record<string, string>): Promise<ConnectionTestResult>;
  discover(def: ConnectorDefinition, config: Record<string, string>): Promise<DiscoveredTable[]>;
}
