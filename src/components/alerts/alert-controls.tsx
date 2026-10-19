"use client";

import { useState, useTransition } from "react";
import { BellOff, Pause, Play, PlayCircle, Trash2 } from "lucide-react";
import { acknowledgeAction, deleteAlertAction, runEvaluationAction, setAlertStatusAction, snoozeAction } from "@/app/actions/alerts";
import { Button, selectClass } from "@/components/ui";
import { FormMessage, Modal } from "@/components/ui-client";

type Result = { ok: boolean; message?: string } | null;

export function AlertControls({ id, status, draft }: { id: string; status: "active" | "paused"; draft: boolean }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<Result>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [snooze, setSnooze] = useState("4");
  const run = (fn: () => Promise<Result>) => start(async () => setResult(await fn()));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="primary" disabled={pending} onClick={() => run(() => runEvaluationAction(id))}>
          <PlayCircle className="size-3.5" /> Run evaluation now
        </Button>
        {status === "paused" ? (
          <Button size="sm" disabled={pending} onClick={() => run(() => setAlertStatusAction(id, "active"))}>
            <Play className="size-3.5" /> {draft ? "Activate" : "Resume"}
          </Button>
        ) : (
          <Button size="sm" disabled={pending} onClick={() => run(() => setAlertStatusAction(id, "paused"))}>
            <Pause className="size-3.5" /> Pause
          </Button>
        )}
        <div className="flex items-center gap-1">
          <label htmlFor={`snooze-${id}`} className="sr-only">
            Snooze duration
          </label>
          <select id={`snooze-${id}`} value={snooze} onChange={(e) => setSnooze(e.target.value)} className={selectClass + " h-7 w-20 text-[12.5px]"}>
            <option value="1">1h</option>
            <option value="4">4h</option>
            <option value="24">24h</option>
          </select>
          <Button size="sm" disabled={pending} onClick={() => run(() => snoozeAction(id, Number(snooze)))}>
            <BellOff className="size-3.5" /> Snooze
          </Button>
        </div>
        <Button size="sm" variant="danger" disabled={pending} onClick={() => setConfirmDelete(true)}>
          <Trash2 className="size-3.5" /> Delete
        </Button>
      </div>
      {pending ? <p className="text-[12.5px] text-muted" role="status">Working…</p> : <FormMessage state={result} />}
      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete alert?"
        size="sm"
        footer={
          <>
            <Button onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button variant="danger" disabled={pending} onClick={() => run(() => deleteAlertAction(id))}>
              Delete alert
            </Button>
          </>
        }
      >
        <p className="text-[13px] text-ink-2">The alert and its history will be removed. This can&apos;t be undone.</p>
      </Modal>
    </div>
  );
}

export function AcknowledgeButton({ alertId, eventId }: { alertId: string; eventId: string }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} onClick={() => start(async () => void (await acknowledgeAction(alertId, eventId)))} className="rounded px-1.5 py-0.5 font-medium text-accent hover:bg-accent-soft disabled:opacity-50">
      {pending ? "…" : "Acknowledge"}
    </button>
  );
}
