import "server-only";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { getStore } from "./store";
import { UI_ACTOR, ServiceError, fieldErrors } from "@/lib/services/context";
import { listProjects } from "@/lib/services/projects";

export const PROJECT_COOKIE = "dob_project";

/**
 * Request context for UI pages. connection() makes the calling page
 * request-time rendered, so in-memory demo state is never baked in at build.
 */
export async function getAppContext() {
  // Demo state lives in mutable server memory: always render at request time.
  await connection();
  const jar = await cookies();
  const projects = listProjects(UI_ACTOR);
  const wanted = jar.get(PROJECT_COOKIE)?.value;
  const project = projects.find((p) => p.id === wanted) ?? projects[0];
  return { actor: UI_ACTOR, project, projects, store: getStore() };
}

export type ActionResult<T = unknown> =
  | { ok: true; message?: string; data?: T }
  | { ok: false; message: string; fieldErrors?: Record<string, string> };

/** Run a service call from a server action, mapping errors to a serialisable result. */
export async function runAction<T>(fn: () => T | Promise<T>, success?: string): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, message: success, data };
  } catch (e) {
    if (e instanceof ServiceError) return { ok: false, message: e.message, fieldErrors: fieldErrors(e) };
    console.error(e);
    return { ok: false, message: "Something went wrong. Please try again." };
  }
}
