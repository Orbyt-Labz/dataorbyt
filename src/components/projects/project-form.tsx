"use client";

import { useActionState, useState } from "react";
import { FlaskConical } from "lucide-react";
import type { ActionResult } from "@/lib/server/session";
import { Button, Field, inputClass, selectClass, textareaClass } from "@/components/ui";
import { FormMessage } from "@/components/ui-client";
import { cx } from "@/lib/format";

interface Defaults {
  name: string;
  description: string;
  timezone: string;
  currency: string;
  environment: string;
  industry: string;
}

export function ProjectForm({
  mode,
  action,
  defaults,
  timezones,
  currencies,
}: {
  mode: "create" | "edit";
  action: (prev: ActionResult | null, form: FormData) => Promise<ActionResult>;
  defaults: Defaults;
  timezones: string[];
  currencies: string[];
}) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(action, null);
  const [v, setV] = useState(defaults);
  const [sample, setSample] = useState(true);
  const fe = state && !state.ok ? state.fieldErrors : undefined;
  const set = (k: keyof Defaults) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV((p) => ({ ...p, [k]: e.target.value }));

  return (
    <form action={formAction} className="max-w-2xl space-y-4" noValidate>
      <Field label="Project name" htmlFor="p-name" error={fe?.name}>
        <input id="p-name" name="name" value={v.name} onChange={set("name")} className={inputClass} aria-invalid={!!fe?.name} placeholder="e.g. Acme Analytics" required maxLength={60} />
      </Field>
      <Field label="Description" htmlFor="p-desc" error={fe?.description} optional>
        <textarea id="p-desc" name="description" value={v.description} onChange={set("description")} className={textareaClass} maxLength={280} placeholder="What does this business do? Who reads its dashboards?" />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Timezone" htmlFor="p-tz" error={fe?.timezone} hint="Used for daily bucketing">
          <select id="p-tz" name="timezone" value={v.timezone} onChange={set("timezone")} className={selectClass} aria-invalid={!!fe?.timezone}>
            {timezones.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
        <Field label="Currency" htmlFor="p-cur" error={fe?.currency}>
          <select id="p-cur" name="currency" value={v.currency} onChange={set("currency")} className={selectClass} aria-invalid={!!fe?.currency}>
            {currencies.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Environment" htmlFor="p-env" error={fe?.environment}>
          <select id="p-env" name="environment" value={v.environment} onChange={set("environment")} className={selectClass}>
            <option value="production">Production</option>
            <option value="staging">Staging</option>
            <option value="development">Development</option>
          </select>
        </Field>
      </div>
      <Field label="Industry" htmlFor="p-ind" error={fe?.industry} optional>
        <input id="p-ind" name="industry" value={v.industry} onChange={set("industry")} className={inputClass} placeholder="e.g. B2B SaaS, marketplace, consumer subscription" maxLength={60} />
      </Field>

      {mode === "create" && (
        <label className={cx("flex cursor-pointer items-start gap-3 rounded-lg border p-3", sample ? "border-accent-line bg-accent-soft/40" : "border-line bg-surface")}>
          <input type="checkbox" name="sampleData" checked={sample} onChange={(e) => setSample(e.target.checked)} className="mt-1 accent-[#4b46e0]" />
          <span>
            <span className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
              <FlaskConical aria-hidden className="size-3.5 text-warn" /> Start with sample data
            </span>
            <span className="block text-[12.5px] text-muted">
              Adds demo connections (BigQuery, Stripe, PostHog), 90 days of deterministic demo data, a starter metric catalog, dbt models and a draft Founder Overview. Everything is labelled “Demo data”. Leave unchecked to start empty and connect your own sources.
            </span>
          </span>
        </label>
      )}

      <div className="flex items-center gap-3 border-t border-line pt-4">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? (mode === "create" ? "Creating…" : "Saving…") : mode === "create" ? "Create project" : "Save settings"}
        </Button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
