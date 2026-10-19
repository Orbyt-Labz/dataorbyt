"use client";

import { useState, useTransition } from "react";
import { Play, Square, CheckCheck } from "lucide-react";
import { setExperimentStatusAction } from "@/app/actions/experiments";
import { Button } from "@/components/ui";
import { Modal } from "@/components/ui-client";
import type { ExperimentStatus } from "@/lib/domain/types";

const COPY = {
  running: { label: "Start experiment", body: "Assignment begins for the target population. Results stay descriptive until the planned sample is reached.", icon: Play },
  stopped: { label: "Stop early", body: "Stopping early ends assignment. Results will be marked as stopped; avoid drawing conclusions from a test stopped because it 'looked good'.", icon: Square },
  completed: { label: "Mark complete", body: "Ends assignment and freezes the readout at the planned horizon.", icon: CheckCheck },
} as const;

export function StatusControls({ id, status }: { id: string; status: ExperimentStatus }) {
  const [target, setTarget] = useState<keyof typeof COPY | null>(null);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const options: (keyof typeof COPY)[] = status === "draft" ? ["running"] : status === "running" ? ["completed", "stopped"] : [];
  if (options.length === 0) return null;
  return (
    <>
      {options.map((o) => {
        const Icon = COPY[o].icon;
        return (
          <Button key={o} variant={o === "stopped" ? "danger" : "primary"} onClick={() => setTarget(o)}>
            <Icon className="size-3.5" /> {COPY[o].label}
          </Button>
        );
      })}
      <Modal
        open={!!target}
        onClose={() => setTarget(null)}
        title={target ? COPY[target].label : ""}
        size="sm"
        footer={
          <>
            <Button onClick={() => setTarget(null)}>Cancel</Button>
            <Button
              variant={target === "stopped" ? "danger" : "primary"}
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await setExperimentStatusAction(id, target!);
                  if (r.ok) setTarget(null);
                  else setError(r.message);
                })
              }
            >
              {pending ? "Saving…" : "Confirm"}
            </Button>
          </>
        }
      >
        <p className="text-[13px] text-ink-2">{target && COPY[target].body}</p>
        <p className="mt-2 text-[12px] text-muted">Demo: this changes the experiment status only; no real assignment service is called.</p>
        {error && <p role="alert" className="mt-2 text-[12.5px] text-bad">{error}</p>}
      </Modal>
    </>
  );
}
