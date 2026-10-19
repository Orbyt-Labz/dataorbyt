"use server";

import { refresh } from "next/cache";
import { UI_ACTOR } from "@/lib/services/context";
import { createToken, revokeToken } from "@/lib/services/tokens";
import { changeRole, inviteMember, updateNotificationPrefs, updateWorkspace } from "@/lib/services/workspace";
import { runAction } from "@/lib/server/session";

/** Returns the plaintext token exactly once. It is never persisted anywhere but as a hash. */
export async function createTokenAction(input: unknown) {
  const r = await runAction(() => createToken(UI_ACTOR, input), "Token created");
  if (r.ok) refresh();
  return r;
}

export async function revokeTokenAction(id: string) {
  const r = await runAction(() => revokeToken(UI_ACTOR, id), "Token revoked");
  if (r.ok) refresh();
  return r;
}

export async function updateWorkspaceAction(input: unknown) {
  const r = await runAction(() => {
    updateWorkspace(UI_ACTOR, input);
  }, "Workspace saved");
  if (r.ok) refresh();
  return r;
}

export async function updateNotificationsAction(input: unknown) {
  const r = await runAction(() => updateNotificationPrefs(UI_ACTOR, input), "Notification preferences saved");
  if (r.ok) refresh();
  return r;
}

export async function inviteMemberAction(input: unknown) {
  const r = await runAction(() => inviteMember(UI_ACTOR, input), "Invite recorded (no email sent — demo)");
  if (r.ok) refresh();
  return r;
}

export async function changeRoleAction(memberId: string, role: string) {
  const r = await runAction(() => changeRole(UI_ACTOR, memberId, role), "Role updated");
  if (r.ok) refresh();
  return r;
}
