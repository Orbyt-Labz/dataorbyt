import type { ChartSpec, DashboardTemplate } from "./types";

type C = Omit<ChartSpec, "id">;
const c = (p: Partial<C> & Pick<C, "title" | "visualization" | "metrics">): C => ({
  grain: "day",
  dateRange: "inherit",
  filters: [],
  size: "md",
  ...p,
});

export const DASHBOARD_TEMPLATES: DashboardTemplate[] = [
  {
    id: "founder_overview",
    name: "Founder Overview",
    description: "Revenue, active users, activation and retention on one page — the weekly founder check-in.",
    tags: ["founder", "weekly"],
    charts: [
      c({ title: "Gross revenue", visualization: "kpi", metrics: ["gross_revenue"], size: "sm" }),
      c({ title: "Weekly active users", visualization: "kpi", metrics: ["weekly_active_users"], size: "sm" }),
      c({ title: "Trial-to-paid", visualization: "kpi", metrics: ["trial_to_paid"], size: "sm" }),
      c({ title: "7-day retention", visualization: "kpi", metrics: ["retention_7d"], size: "sm" }),
      c({ title: "Revenue trend", visualization: "timeseries", metrics: ["gross_revenue", "net_revenue"], size: "lg" }),
      c({ title: "Activation funnel", visualization: "funnel", metrics: ["visitors", "signups", "activated_users", "trials_started", "paid_conversions"], size: "md" }),
      c({ title: "Weekly active users", visualization: "area", metrics: ["weekly_active_users"], size: "lg" }),
      c({ title: "Signups by channel", visualization: "bar", metrics: ["signups"], groupBy: "channel", size: "md" }),
      c({ title: "Weekly scorecard", visualization: "table", metrics: ["gross_revenue", "signups", "activation_rate", "weekly_active_users"], grain: "week", size: "full" }),
    ],
  },
  {
    id: "saas_growth",
    name: "SaaS Growth",
    description: "Subscriptions, churn, signups by channel and cohort retention.",
    tags: ["growth", "saas"],
    charts: [
      c({ title: "Active subscriptions", visualization: "kpi", metrics: ["active_subscriptions"], size: "sm" }),
      c({ title: "Churn rate", visualization: "kpi", metrics: ["churn_rate"], size: "sm" }),
      c({ title: "Signups", visualization: "kpi", metrics: ["signups"], size: "sm" }),
      c({ title: "Activation rate", visualization: "kpi", metrics: ["activation_rate"], size: "sm" }),
      c({ title: "Signups vs activated", visualization: "line", metrics: ["signups", "activated_users"], size: "lg" }),
      c({ title: "Signups by channel (weekly)", visualization: "stacked_bar", metrics: ["signups"], groupBy: "channel", grain: "week", size: "md" }),
      c({ title: "Weekly signup cohorts", visualization: "cohort_heatmap", metrics: ["retention_7d"], size: "lg" }),
      c({ title: "Visitors vs signups (daily)", visualization: "scatter", metrics: ["visitors", "signups"], size: "md" }),
    ],
  },
  {
    id: "revenue_billing",
    name: "Revenue & Billing",
    description: "Gross and net revenue, revenue by plan and daily revenue distribution.",
    tags: ["revenue", "finance"],
    charts: [
      c({ title: "Gross revenue", visualization: "kpi", metrics: ["gross_revenue"], size: "sm" }),
      c({ title: "Net revenue", visualization: "kpi", metrics: ["net_revenue"], size: "sm" }),
      c({ title: "Active subscriptions", visualization: "kpi", metrics: ["active_subscriptions"], size: "sm" }),
      c({ title: "Churn rate", visualization: "kpi", metrics: ["churn_rate"], size: "sm" }),
      c({ title: "Revenue by plan (weekly)", visualization: "stacked_bar", metrics: ["gross_revenue"], groupBy: "plan", grain: "week", size: "lg" }),
      c({ title: "Net revenue", visualization: "line", metrics: ["net_revenue"], size: "md" }),
      c({ title: "Daily revenue distribution", visualization: "distribution", metrics: ["gross_revenue"], size: "md" }),
      c({ title: "Revenue by country", visualization: "table", metrics: ["gross_revenue", "net_revenue"], groupBy: "country", grain: "month", size: "lg" }),
    ],
  },
  {
    id: "acquisition_funnel",
    name: "Acquisition Funnel",
    description: "Visitors to paid, with channel and platform breakdowns.",
    tags: ["acquisition", "marketing"],
    charts: [
      c({ title: "Visitors", visualization: "kpi", metrics: ["visitors"], size: "sm" }),
      c({ title: "Signups", visualization: "kpi", metrics: ["signups"], size: "sm" }),
      c({ title: "Activation rate", visualization: "kpi", metrics: ["activation_rate"], size: "sm" }),
      c({ title: "Paid conversions", visualization: "kpi", metrics: ["paid_conversions"], size: "sm" }),
      c({ title: "Visitor-to-paid funnel", visualization: "funnel", metrics: ["visitors", "signups", "activated_users", "trials_started", "paid_conversions"], size: "lg" }),
      c({ title: "Visitors by channel", visualization: "bar", metrics: ["visitors"], groupBy: "channel", size: "md" }),
      c({ title: "Activation rate (weekly)", visualization: "line", metrics: ["activation_rate"], grain: "week", size: "lg" }),
      c({ title: "Signups by platform (weekly)", visualization: "stacked_bar", metrics: ["signups"], groupBy: "platform", grain: "week", size: "md" }),
    ],
  },
  {
    id: "retention_cohorts",
    name: "Retention & Cohorts",
    description: "Cohort retention, 7-day retention trend and churn by plan.",
    tags: ["retention"],
    charts: [
      c({ title: "7-day retention", visualization: "kpi", metrics: ["retention_7d"], size: "sm" }),
      c({ title: "Churn rate", visualization: "kpi", metrics: ["churn_rate"], size: "sm" }),
      c({ title: "Active subscriptions", visualization: "kpi", metrics: ["active_subscriptions"], size: "sm" }),
      c({ title: "Weekly active users", visualization: "kpi", metrics: ["weekly_active_users"], size: "sm" }),
      c({ title: "Weekly signup cohorts", visualization: "cohort_heatmap", metrics: ["retention_7d"], size: "lg" }),
      c({ title: "7-day retention trend", visualization: "line", metrics: ["retention_7d"], grain: "week", size: "md" }),
      c({ title: "Churn by plan", visualization: "bar", metrics: ["churn_rate"], groupBy: "plan", size: "full" }),
    ],
  },
  {
    id: "experiment_readout",
    name: "Experiment Readout",
    description: "Primary metric and guardrails for an experiment period.",
    tags: ["experiments"],
    charts: [
      c({ title: "Trial-to-paid", visualization: "kpi", metrics: ["trial_to_paid"], size: "sm" }),
      c({ title: "Activation rate", visualization: "kpi", metrics: ["activation_rate"], size: "sm" }),
      c({ title: "Trials started", visualization: "kpi", metrics: ["trials_started"], size: "sm" }),
      c({ title: "Paid conversions", visualization: "kpi", metrics: ["paid_conversions"], size: "sm" }),
      c({ title: "Trial-to-paid (weekly)", visualization: "line", metrics: ["trial_to_paid"], grain: "week", size: "lg" }),
      c({ title: "Activation by platform", visualization: "bar", metrics: ["activation_rate"], groupBy: "platform", size: "md" }),
      c({ title: "Guardrail scorecard", visualization: "table", metrics: ["trial_to_paid", "activation_rate", "churn_rate"], grain: "week", size: "full" }),
    ],
  },
];

export function getTemplate(id: string) {
  return DASHBOARD_TEMPLATES.find((t) => t.id === id);
}
