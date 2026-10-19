"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { UI_ACTOR } from "@/lib/services/context";
import { createProject, updateProject } from "@/lib/services/projects";
import { PROJECT_COOKIE, runAction, type ActionResult } from "@/lib/server/session";

function str(form: FormData, key: string) {
  const v = form.get(key);
  return v === null ? undefined : String(v);
}

export async function createProjectAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const r = await runAction(() =>
    createProject(UI_ACTOR, {
      name: str(form, "name") ?? "",
      description: str(form, "description") ?? "",
      timezone: str(form, "timezone"),
      currency: str(form, "currency"),
      environment: str(form, "environment"),
      industry: str(form, "industry") || undefined,
      sampleData: form.get("sampleData") === "on",
    }),
  );
  if (!r.ok) return r;
  (await cookies()).set(PROJECT_COOKIE, r.data!.id, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  redirect("/");
}

export async function updateProjectAction(id: string, _prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const r = await runAction(() => {
    updateProject(UI_ACTOR, id, {
      name: str(form, "name"),
      description: str(form, "description"),
      timezone: str(form, "timezone"),
      currency: str(form, "currency"),
      environment: str(form, "environment"),
      industry: str(form, "industry") || undefined,
    });
    return null;
  }, "Project settings saved");
  if (r.ok) refresh();
  return r;
}
