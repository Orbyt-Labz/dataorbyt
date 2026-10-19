"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { FormMessage } from "@/components/ui-client";
import { reviewMetricRequestAction } from "@/app/actions/metrics";
import type { ActionResult } from "@/lib/server/session";

export function MetricRequestReview({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionResult | null>(null);
  const act = (d: "approved" | "rejected") => start(async () => setState(await reviewMetricRequestAction(id, d)));
  return (
    <div className="flex items-center gap-2">
      <FormMessage state={state && !state.ok ? state : null} />
      <Button size="sm" variant="danger" disabled={pending} onClick={() => act("rejected")}>
        Reject
      </Button>
      <Button size="sm" variant="primary" disabled={pending} onClick={() => act("approved")}>
        Approve
      </Button>
    </div>
  );
}
