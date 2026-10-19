import "server-only";
import { z } from "zod";
import { getStore, nextId } from "@/lib/server/store";
import { CURRENCIES, TIMEZONES } from "./projects";
import { audit, parseInput, ServiceError, type Actor } from "./context";

export function getWorkspace() {
  const s = getStore();
  return { workspace: s.workspace, members: s.members };
}

export const workspaceSchema = z.object({
  name: z.string().trim().min(2, "Name is required").max(60),
  defaultTimezone: z.enum(TIMEZONES as [string, ...string[]]),
  defaultCurrency: z.enum(CURRENCIES as [string, ...string[]]),
});

export function updateWorkspace(actor: Actor, input: unknown) {
  const data = parseInput(workspaceSchema, input);
  Object.assign(getStore().workspace, data);
  audit(actor, "workspace.updated");
  return getStore().workspace;
}

export function updateNotificationPrefs(actor: Actor, input: unknown) {
  const data = parseInput(z.object({ weeklyDigest: z.boolean(), alertEmails: z.boolean(), dbtFailures: z.boolean(), productUpdates: z.boolean() }), input);
  getStore().workspace.notificationPrefs = data;
  audit(actor, "workspace.notifications_updated");
}

export const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  role: z.enum(["admin", "editor", "viewer"]),
});

export function inviteMember(actor: Actor, input: unknown) {
  const data = parseInput(inviteSchema, input);
  const s = getStore();
  if (s.members.some((m) => m.email === data.email)) throw new ServiceError("invalid_input", "Already a member", [{ path: "email", message: "Already a member or invited" }]);
  s.members.push({ id: nextId("u"), name: "", email: data.email, role: data.role, status: "invited" });
  audit(actor, "member.invited", { target: data.email, detail: `${data.role} (no email sent — demo)` });
}

export function changeRole(actor: Actor, memberId: string, role: unknown) {
  const r = parseInput(z.enum(["admin", "editor", "viewer"]), role);
  const m = getStore().members.find((x) => x.id === memberId);
  if (!m) throw new ServiceError("not_found", "Member not found");
  if (m.role === "owner") throw new ServiceError("forbidden", "The owner's role can't be changed");
  m.role = r;
  audit(actor, "member.role_changed", { target: m.email, detail: r });
}

export function listAudit(projectId?: string, limit = 100) {
  const s = getStore();
  return s.audit.filter((a) => !projectId || a.projectId === projectId || !a.projectId).slice(0, limit);
}
