"use server";

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { UI_ACTOR } from "@/lib/services/context";
import { listProjects } from "@/lib/services/projects";
import { PROJECT_COOKIE } from "@/lib/server/session";

export async function switchProject(projectId: string) {
  if (!listProjects(UI_ACTOR).some((p) => p.id === projectId)) return { ok: false as const, message: "Unknown project" };
  (await cookies()).set(PROJECT_COOKIE, projectId, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  refresh();
  return { ok: true as const };
}
