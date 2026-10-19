import type { Alert, AlertCondition, MetricUnit } from "./types";
import { formatValue } from "./chart-data";

export interface ConditionInput {
  /** Metric value for the evaluation window. */
  current?: number | null;
  /** Metric value for the comparison window. */
  baseline?: number | null;
  /** Rows observed in the window (missing-data checks). */
  rowCount?: number;
  /** Hours since the source last loaded (freshness checks). */
  freshnessHours?: number;
  /** Whether the monitored pipeline's latest run failed. */
  pipelineFailed?: boolean;
  unit?: MetricUnit;
}

export interface ConditionResult {
  breach: boolean;
  /** Observed value: the metric, the relative change, the age in hours… */
  value: number | null;
  summary: string;
  insufficientData?: boolean;
}

const OPS = { gt: (a: number, b: number) => a > b, gte: (a: number, b: number) => a >= b, lt: (a: number, b: number) => a < b, lte: (a: number, b: number) => a <= b };
const OP_LABEL = { gt: ">", gte: "≥", lt: "<", lte: "≤" };

export function evaluateCondition(cond: AlertCondition, input: ConditionInput): ConditionResult {
  const unit = input.unit ?? "count";
  switch (cond.kind) {
    case "threshold": {
      if (input.current === null || input.current === undefined) return { breach: false, value: null, summary: "No data in window", insufficientData: true };
      const breach = OPS[cond.operator](input.current, cond.value);
      return { breach, value: input.current, summary: `${formatValue(input.current, unit)} ${breach ? "" : "not "}${OP_LABEL[cond.operator]} ${formatValue(cond.value, unit)}` };
    }
    case "relative_change": {
      if (input.current == null || input.baseline == null || input.baseline === 0) return { breach: false, value: null, summary: "Not enough data to compare", insufficientData: true };
      const change = (input.current - input.baseline) / Math.abs(input.baseline);
      const threshold = cond.pct / 100;
      const breach = cond.direction === "increase" ? change >= threshold : cond.direction === "decrease" ? change <= -threshold : Math.abs(change) >= threshold;
      return { breach, value: change, summary: `${change >= 0 ? "+" : ""}${(change * 100).toFixed(1)}% vs ${cond.comparedTo === "previous_period" ? "previous period" : "same day last week"}` };
    }
    case "missing_data": {
      const rows = input.rowCount ?? 0;
      return { breach: rows < cond.expectedRowsAtLeast, value: rows, summary: `${rows} row(s) in window (expected ≥ ${cond.expectedRowsAtLeast})` };
    }
    case "freshness_sla": {
      if (input.freshnessHours === undefined) return { breach: true, value: null, summary: "Freshness unknown — treated as stale" };
      return { breach: input.freshnessHours > cond.maxAgeHours, value: input.freshnessHours, summary: `Data is ${input.freshnessHours.toFixed(1)}h old (SLA ${cond.maxAgeHours}h)` };
    }
    case "pipeline_failure":
      return { breach: !!input.pipelineFailed, value: input.pipelineFailed ? 1 : 0, summary: input.pipelineFailed ? `Latest ${cond.target.replace("_", " ")} failed` : `Latest ${cond.target.replace("_", " ")} succeeded` };
  }
}

export type Decision = "fire" | "ok" | "pending" | "suppressed_cooldown" | "suppressed_snoozed" | "paused";

/**
 * Anti-noise decision. `breaches` is the most recent evaluations, newest last
 * (including the current one).
 */
export function decide(alert: Pick<Alert, "status" | "snoozedUntil" | "cooldownMinutes" | "consecutiveEvaluations" | "lastTriggeredAt">, breaches: boolean[], now: Date): Decision {
  if (alert.status === "paused") return "paused";
  const current = breaches[breaches.length - 1];
  if (!current) return "ok";
  const needed = Math.max(1, alert.consecutiveEvaluations);
  const recent = breaches.slice(-needed);
  if (recent.length < needed || !recent.every(Boolean)) return "pending";
  if (alert.snoozedUntil && Date.parse(alert.snoozedUntil) > now.getTime()) return "suppressed_snoozed";
  if (alert.lastTriggeredAt && now.getTime() - Date.parse(alert.lastTriggeredAt) < alert.cooldownMinutes * 60_000) return "suppressed_cooldown";
  return "fire";
}

export function describeCondition(alert: Pick<Alert, "condition" | "cadence" | "lookbackDays" | "consecutiveEvaluations" | "cooldownMinutes">, metricName?: string, unit: MetricUnit = "count") {
  const c = alert.condition;
  const subject = metricName ?? "the source";
  let what: string;
  switch (c.kind) {
    case "threshold":
      what = `${subject} over the last ${alert.lookbackDays} day(s) is ${OP_LABEL[c.operator]} ${formatValue(c.value, unit)}`;
      break;
    case "relative_change":
      what = `${subject} ${c.direction === "either" ? "changes" : c.direction === "increase" ? "rises" : "falls"} by ${c.pct}% or more vs ${c.comparedTo === "previous_period" ? "the previous period" : "the same day last week"}`;
      break;
    case "missing_data":
      what = `${subject} has fewer than ${c.expectedRowsAtLeast} row(s) in the last ${alert.lookbackDays} day(s)`;
      break;
    case "freshness_sla":
      what = `data is older than ${c.maxAgeHours} hours`;
      break;
    case "pipeline_failure":
      what = `the latest ${c.target.replace("_", " ")} fails`;
      break;
  }
  return `Evaluate ${alert.cadence}. Fire when ${what}${alert.consecutiveEvaluations > 1 ? ` for ${alert.consecutiveEvaluations} consecutive evaluations` : ""}. After firing, stay quiet for ${alert.cooldownMinutes >= 60 ? `${Math.round(alert.cooldownMinutes / 60)}h` : `${alert.cooldownMinutes}m`}.`;
}

export function sampleMessage(alert: Pick<Alert, "name" | "severity" | "channel">, projectName: string, result: ConditionResult, link: string) {
  const icon = alert.severity === "critical" ? "🔴" : alert.severity === "warning" ? "🟠" : "🔵";
  return `${icon} [${alert.severity.toUpperCase()}] ${alert.name}\nProject: ${projectName}\n${result.summary}\nView: ${link}\n— DataOrbyt (simulated delivery)`;
}
