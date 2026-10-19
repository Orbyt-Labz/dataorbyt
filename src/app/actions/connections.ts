"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { UI_ACTOR } from "@/lib/services/context";
import { createConnection, removeConnection, testConnection, triggerSync, updateConnectionSettings } from "@/lib/services/connections";
import { runAction, type ActionResult } from "@/lib/server/session";
import type { ConnectionTestResult } from "@/lib/adapters/types";

export interface ConnectionInput {
  projectId: string;
  connectorId: string;
  name: string;
  environment: string;
  syncFrequency: string;
  fields: Record<string, string>;
}

/** Secrets arrive only in the request body; they are not echoed back in the result. */
export async function testConnectionAction(input: ConnectionInput): Promise<ActionResult<ConnectionTestResult>> {
  return runAction(() => testConnection(UI_ACTOR, input));
}

export async function createConnectionAction(input: ConnectionInput): Promise<ActionResult<{ id: string }>> {
  const r = await runAction(async () => {
    const c = await createConnection(UI_ACTOR, input);
    return { id: c.id };
  });
  if (r.ok && r.data) redirect(`/connections/${r.data.id}?created=1`);
  return r;
}

export async function syncNowAction(id: string): Promise<ActionResult> {
  const r = await runAction(() => {
    triggerSync(UI_ACTOR, id);
  }, "Simulated sync recorded.");
  refresh();
  return r;
}

export async function updateConnectionAction(id: string, _prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const r = await runAction(() => {
    updateConnectionSettings(UI_ACTOR, id, {
      name: String(form.get("name") ?? ""),
      syncFrequency: String(form.get("syncFrequency") ?? ""),
      paused: form.get("paused") === "on",
    });
  }, "Settings saved.");
  if (r.ok) refresh();
  return r;
}

export async function removeConnectionAction(id: string): Promise<ActionResult> {
  const r = await runAction(() => removeConnection(UI_ACTOR, id));
  if (r.ok) redirect("/connections?removed=1");
  return r;
}
