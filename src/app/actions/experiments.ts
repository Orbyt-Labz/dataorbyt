"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { UI_ACTOR } from "@/lib/services/context";
import { createExperimentDraft, setExperimentStatus } from "@/lib/services/experiments";
import { runAction, type ActionResult } from "@/lib/server/session";

export async function createExperimentAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const r = await runAction(() => ({ id: createExperimentDraft(UI_ACTOR, input).id }), "Draft created");
  if (r.ok && r.data) redirect(`/experiments/${r.data.id}`);
  return r;
}

export async function setExperimentStatusAction(id: string, status: "running" | "stopped" | "completed") {
  const r = await runAction(() => {
    setExperimentStatus(UI_ACTOR, id, status);
  }, `Experiment ${status}`);
  if (r.ok) refresh();
  return r;
}
