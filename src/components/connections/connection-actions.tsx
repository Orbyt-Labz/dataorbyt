"use client";

import { useActionState, useState, useTransition } from "react";
import { RefreshCw, Trash2 } from "lucide-react";
import { Button, Field, inputClass, selectClass } from "@/components/ui";
import { FormMessage, Modal } from "@/components/ui-client";
import { removeConnectionAction, syncNowAction, updateConnectionAction } from "@/app/actions/connections";
import type { ActionResult } from "@/lib/server/session";

export function RemoveConnectionButton({ id, name, size = "sm" }: { id: string; name: string; size?: "sm" | "md" }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Button variant="danger" size={size} onClick={() => setOpen(true)}>
        <Trash2 aria-hidden className="size-3.5" /> Remove
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="sm"
        title={`Remove ${name}?`}
        description="Dashboards and metrics that depend on this source will stop refreshing."
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              variant="danger"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await removeConnectionAction(id);
                  if (r && !r.ok) setError(r.message);
                })
              }
            >
              {pending ? "Removing…" : "Remove connection"}
            </Button>
          </>
        }
      >
        <p className="text-[13px] text-ink-2">This removes the demo connection and its sync history from the workspace. No external system is contacted.</p>
        {error && <p role="alert" className="mt-2 text-[12.5px] text-bad">{error}</p>}
      </Modal>
    </>
  );
}

export function SyncNowButton({ id, disabled }: { id: string; disabled?: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<ActionResult | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      {msg && <FormMessage state={msg} />}
      <Button disabled={pending || disabled} title={disabled ? "Connection is paused" : undefined} onClick={() => start(async () => setMsg(await syncNowAction(id)))}>
        <RefreshCw aria-hidden className={pending ? "size-3.5 animate-spin" : "size-3.5"} />
        {pending ? "Syncing…" : "Sync now (simulated)"}
      </Button>
    </span>
  );
}

export function ConfigureConnectionForm({ id, name, syncFrequency, paused }: { id: string; name: string; syncFrequency: string; paused: boolean }) {
  const [state, action, pending] = useActionState(updateConnectionAction.bind(null, id), null);
  const err = state && !state.ok ? state.fieldErrors : undefined;
  return (
    <form action={action} className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_200px_auto] sm:items-end">
      <Field label="Display name" htmlFor="cfg-name" error={err?.name}>
        <input id="cfg-name" name="name" defaultValue={name} required minLength={2} maxLength={60} className={inputClass} aria-invalid={!!err?.name} />
      </Field>
      <Field label="Sync frequency" htmlFor="cfg-freq">
        <select id="cfg-freq" name="syncFrequency" defaultValue={syncFrequency} className={selectClass}>
          <option value="15m">Every 15 minutes</option>
          <option value="1h">Hourly</option>
          <option value="6h">Every 6 hours</option>
          <option value="24h">Daily</option>
        </select>
      </Field>
      <label className="flex h-8.5 items-center gap-2 text-[13px] text-ink-2">
        <input type="checkbox" name="paused" defaultChecked={paused} className="size-4 accent-[var(--color-accent)]" /> Pause syncing
      </label>
      <div className="flex items-center gap-3 sm:col-span-3">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Saving…" : "Save settings"}
        </Button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
