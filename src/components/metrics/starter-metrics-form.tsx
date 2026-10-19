"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { FormMessage } from "@/components/ui-client";
import { addStarterMetricsAction } from "@/app/actions/metrics";

export function StarterMetricsForm({ projectId, templates, compact }: { projectId: string; templates: { key: string; name: string; description: string; domain: string }[]; compact?: boolean }) {
  const [state, action, pending] = useActionState(addStarterMetricsAction.bind(null, projectId), null);
  if (templates.length === 0) return <p className="text-[12.5px] text-muted">Every starter metric is already in the catalog.</p>;
  return (
    <form action={action}>
      <fieldset>
        <legend className="sr-only">Starter metrics</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => (
            <label key={t.key} className="flex cursor-pointer gap-2.5 rounded-md border border-line p-2.5 text-[13px] hover:border-line-strong has-[:checked]:border-accent has-[:checked]:bg-accent-soft/40">
              <input type="checkbox" name="keys" value={t.key} defaultChecked={!compact} className="mt-0.5 size-4 accent-[var(--color-accent)]" />
              <span className="min-w-0">
                <span className="block font-medium text-ink">{t.name}</span>
                {!compact && <span className="block text-[12px] text-muted">{t.description}</span>}
                <span className="block text-[11px] text-faint capitalize">{t.domain}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="mt-3 flex items-center gap-3">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Adding…" : "Add selected metrics"}
        </Button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
