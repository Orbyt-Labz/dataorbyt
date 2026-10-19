"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { UI_ACTOR } from "@/lib/services/context";
import { addStarterMetrics, requestMetric, reviewMetricRequest } from "@/lib/services/metrics";
import { runAction, type ActionResult } from "@/lib/server/session";

export async function addStarterMetricsAction(projectId: string, _prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const keys = form.getAll("keys").map(String);
  const r = await runAction(() => {
    addStarterMetrics(UI_ACTOR, projectId, keys);
  }, `Added ${keys.length} metric(s).`);
  if (r.ok) refresh();
  return r;
}

export async function requestMetricAction(input: unknown): Promise<ActionResult> {
  const r = await runAction(() => {
    requestMetric(UI_ACTOR, input);
  });
  if (r.ok) redirect("/metrics?requested=1");
  return r;
}

export async function reviewMetricRequestAction(id: string, decision: "approved" | "rejected"): Promise<ActionResult> {
  const r = await runAction(() => {
    reviewMetricRequest(UI_ACTOR, id, decision);
  }, decision === "approved" ? "Metric approved." : "Request rejected.");
  refresh();
  return r;
}
