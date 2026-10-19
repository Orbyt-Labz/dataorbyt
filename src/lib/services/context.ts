import "server-only";
import type { z } from "zod";
import type { AuditEvent, TokenScope } from "@/lib/domain/types";
import { getStore, nextId } from "@/lib/server/store";
import { CURRENT_USER } from "@/lib/demo/seed";

export type ActorType = "user" | "mcp" | "system";

export interface Actor {
  type: ActorType;
  name: string;
  /** Projects this actor may access. "all" for workspace members in the demo. */
  projectIds: string[] | "all";
  scopes: TokenScope[];
  tokenId?: string;
}

/**
 * The demo has no login; every UI request acts as the seeded workspace owner.
 * With real auth, build the Actor from the session instead.
 */
export const UI_ACTOR: Actor = { type: "user", name: CURRENT_USER.name, projectIds: "all", scopes: ["read", "draft", "publish"] };
export const SYSTEM_ACTOR: Actor = { type: "system", name: "system", projectIds: "all", scopes: ["read", "draft", "publish"] };

export type ServiceErrorCode =
  | "not_found"
  | "forbidden"
  | "invalid_input"
  | "rate_limited"
  | "budget_exceeded"
  | "confirmation_required"
  | "conflict"
  | "timeout";

export class ServiceError extends Error {
  constructor(
    public readonly code: ServiceErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

export function assertProjectAccess(actor: Actor, projectId: string) {
  const store = getStore();
  if (!store.projects.some((p) => p.id === projectId)) throw new ServiceError("not_found", `Project ${projectId} not found`);
  if (actor.projectIds !== "all" && !actor.projectIds.includes(projectId)) {
    throw new ServiceError("forbidden", `Actor is not authorised for project ${projectId}`);
  }
}

export function assertScope(actor: Actor, scope: TokenScope) {
  if (!actor.scopes.includes(scope)) throw new ServiceError("forbidden", `Missing required scope: ${scope}`);
}

export function audit(actor: Actor, action: string, e: Omit<AuditEvent, "id" | "at" | "actor" | "actorType" | "action"> = {}) {
  const store = getStore();
  store.audit.unshift({
    id: nextId("aud"),
    at: new Date().toISOString(),
    actor: actor.type === "mcp" ? `MCP: ${actor.name}` : actor.name,
    actorType: actor.type,
    action,
    ...e,
  });
  if (store.audit.length > 1000) store.audit.length = 1000;
}

export function parseInput<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const r = schema.safeParse(input);
  if (!r.success) {
    throw new ServiceError(
      "invalid_input",
      r.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; "),
      r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    );
  }
  return r.data;
}

/** Flatten zod issues into a field → message map for forms. */
export function fieldErrors(err: unknown): Record<string, string> | undefined {
  if (err instanceof ServiceError && Array.isArray(err.details)) {
    const out: Record<string, string> = {};
    for (const d of err.details as { path: string; message: string }[]) out[d.path || "form"] ??= d.message;
    return out;
  }
  return undefined;
}
