"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { UI_ACTOR } from "@/lib/services/context";
import { runAction, type ActionResult } from "@/lib/server/session";
import {
  chartSpecSchema,
  createDashboardDraft,
  deleteDashboard,
  discardDraftChanges,
  getDashboard,
  publishDashboard,
  publishPreview,
  saveDashboardDraft,
  setVisibility,
} from "@/lib/services/dashboards";
import { resolveChartData } from "@/lib/services/charts";
import { isDateRangeKey, DEFAULT_RANGE } from "@/lib/domain/dates";
import type { ChartData } from "@/lib/domain/chart-data";
import type { ChartFilter, ChartSpec } from "@/lib/domain/types";

function parseTags(raw: FormDataEntryValue | null) {
  return String(raw ?? "")
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

export async function createDashboardAction(_prev: ActionResult<{ id: string }> | null, form: FormData): Promise<ActionResult<{ id: string }>> {
  const mode = String(form.get("mode") ?? "blank");
  const start =
    mode === "template"
      ? { mode: "template" as const, templateId: String(form.get("templateId") ?? "") }
      : mode === "metrics"
        ? { mode: "metrics" as const, metricKeys: form.getAll("metricKeys").map(String) }
        : { mode: "blank" as const };
  const result = await runAction(() => {
    const d = createDashboardDraft(UI_ACTOR, {
      projectId: String(form.get("projectId") ?? ""),
      name: String(form.get("name") ?? ""),
      description: String(form.get("description") ?? ""),
      tags: parseTags(form.get("tags")),
      start,
    });
    return { id: d.id };
  });
  if (result.ok && result.data) redirect(`/dashboards/${result.data.id}/edit`);
  if (!result.ok && result.fieldErrors) {
    // Map nested start.* errors to visible fields.
    const fe = { ...result.fieldErrors };
    if (fe["start.metricKeys"]) fe.metricKeys = fe["start.metricKeys"];
    if (fe["start.templateId"]) fe.templateId = fe["start.templateId"];
    return { ...result, fieldErrors: fe };
  }
  return result;
}

/** Resolve data for an unsaved chart spec (editor live preview). */
export async function previewChartAction(dashboardId: string, spec: ChartSpec, range: string, filters: ChartFilter[] = []): Promise<ChartData> {
  const d = getDashboard(UI_ACTOR, dashboardId);
  const parsed = chartSpecSchema.safeParse(spec);
  if (!parsed.success) return { kind: "error", message: parsed.error.issues.map((i) => i.message).join("; ") };
  return resolveChartData(parsed.data as ChartSpec, {
    actor: UI_ACTOR,
    projectId: d.projectId,
    range: isDateRangeKey(range) ? range : DEFAULT_RANGE,
    globalFilters: filters,
    dashboardId,
    source: "ui",
  });
}

export async function saveDraftAction(id: string, payload: { name: string; description: string; tags: string[]; charts: ChartSpec[] }) {
  const r = await runAction(() => {
    saveDashboardDraft(UI_ACTOR, id, payload);
    return null;
  }, "Draft saved");
  if (r.ok) refresh();
  return r;
}

export async function publishPreviewAction(id: string) {
  return runAction(() => publishPreview(UI_ACTOR, id));
}

export async function publishAction(id: string, confirmationCode: string) {
  const r = await runAction(() => {
    publishDashboard(UI_ACTOR, id, confirmationCode);
    return null;
  }, "Dashboard published");
  if (r.ok) refresh();
  return r;
}

export async function discardDraftAction(id: string) {
  const r = await runAction(() => {
    discardDraftChanges(UI_ACTOR, id);
    return null;
  }, "Draft changes discarded");
  if (r.ok) refresh();
  return r;
}

export async function setVisibilityAction(id: string, visibility: string) {
  const r = await runAction(() => {
    setVisibility(UI_ACTOR, id, visibility);
    return null;
  }, "Sharing updated");
  if (r.ok) refresh();
  return r;
}

export async function deleteDashboardAction(id: string) {
  const r = await runAction(() => deleteDashboard(UI_ACTOR, id));
  if (r.ok) redirect("/dashboards");
  return r;
}
