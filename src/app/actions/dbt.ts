"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { UI_ACTOR } from "@/lib/services/context";
import { applyStarter, configureRepository, runDbt } from "@/lib/services/dbt";
import { runAction, type ActionResult } from "@/lib/server/session";

export async function runDbtAction(projectId: string, models: string[], mode: "run" | "test" | "build"): Promise<ActionResult<{ id: string; status: string }>> {
  const r = await runAction(() => {
    const run = runDbt(UI_ACTOR, { projectId, models, mode });
    return { id: run.id, status: run.status };
  });
  refresh();
  return r;
}

export async function configureRepoAction(projectId: string, _prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const r = await runAction(() => {
    configureRepository(UI_ACTOR, {
      projectId,
      url: String(form.get("url") ?? ""),
      branch: String(form.get("branch") ?? ""),
      path: String(form.get("path") ?? "/") || "/",
    });
  }, "Repository saved (not cloned — demo).");
  if (r.ok) refresh();
  return r;
}

export async function applyStarterAction(projectId: string): Promise<ActionResult> {
  const r = await runAction(() => {
    applyStarter(UI_ACTOR, projectId);
  });
  if (r.ok) redirect("/dbt?generated=1");
  return r;
}
