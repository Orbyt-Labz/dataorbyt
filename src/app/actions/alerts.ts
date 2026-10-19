"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { UI_ACTOR } from "@/lib/services/context";
import { acknowledgeEvent, createAlert, deleteAlert, previewAlert, runEvaluation, setAlertStatus, snoozeAlert } from "@/lib/services/alerts";
import { runAction } from "@/lib/server/session";

export async function previewAlertAction(input: unknown) {
  return runAction(() => previewAlert(UI_ACTOR, input));
}

export async function createAlertAction(input: unknown) {
  const r = await runAction(() => ({ id: createAlert(UI_ACTOR, input).id }), "Alert created");
  if (r.ok && r.data) redirect(`/alerts?alert=${r.data.id}`);
  return r;
}

async function mutate(fn: () => unknown, msg: string) {
  const r = await runAction(fn, msg);
  if (r.ok) refresh();
  return r;
}

export async function acknowledgeAction(alertId: string, eventId: string) {
  return mutate(() => {
    acknowledgeEvent(UI_ACTOR, alertId, eventId);
  }, "Acknowledged");
}

export async function snoozeAction(alertId: string, hours: number) {
  return mutate(() => {
    snoozeAlert(UI_ACTOR, alertId, hours);
  }, `Snoozed for ${hours}h`);
}

export async function setAlertStatusAction(alertId: string, status: "active" | "paused") {
  return mutate(() => {
    setAlertStatus(UI_ACTOR, alertId, status);
  }, status === "active" ? "Alert activated" : "Alert paused");
}

export async function runEvaluationAction(alertId: string) {
  return mutate(async () => {
    const r = await runEvaluation(UI_ACTOR, alertId);
    return r.decision;
  }, "Evaluation complete (simulated)");
}

export async function deleteAlertAction(alertId: string) {
  const r = await runAction(() => {
    deleteAlert(UI_ACTOR, alertId);
  });
  if (r.ok) redirect("/alerts");
  return r;
}
