"use client";

import { useActionState, useState } from "react";
import { Check, FileStack, LayoutTemplate, Sigma, Square } from "lucide-react";
import { createDashboardAction } from "@/app/actions/dashboards";
import type { ActionResult } from "@/lib/server/session";
import { Button, Field, inputClass, textareaClass } from "@/components/ui";
import { FormMessage } from "@/components/ui-client";
import { cx } from "@/lib/format";
import type { ChartSpec } from "@/lib/domain/types";
import { DashboardThumbnail } from "./thumbnail";

interface TemplateView {
  id: string;
  name: string;
  description: string;
  chartCount: number;
  charts: ChartSpec[];
  missing: string[];
}

interface MetricView {
  key: string;
  name: string;
  domain: string;
  description: string;
}

export function CreateDashboardForm({ projectId, projectName, templates, metrics, initialMode, initialTemplate }: { projectId: string; projectName: string; templates: TemplateView[]; metrics: MetricView[]; initialMode: "blank" | "template" | "metrics"; initialTemplate?: string }) {
  const [state, action, pending] = useActionState<ActionResult<{ id: string }> | null, FormData>(createDashboardAction, null);
  const [mode, setMode] = useState(initialMode);
  const [templateId, setTemplateId] = useState(initialTemplate ?? templates[0]?.id ?? "");
  const [name, setName] = useState(initialMode === "template" ? (templates.find((t) => t.id === (initialTemplate ?? templates[0]?.id))?.name ?? "") : "");
  const [picked, setPicked] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const fe = state && !state.ok ? state.fieldErrors : undefined;

  const modes = [
    { key: "template" as const, label: "Use a template", desc: "Six founder-ready layouts", icon: LayoutTemplate },
    { key: "metrics" as const, label: "Choose metrics", desc: "KPI tiles + trend per metric", icon: Sigma },
    { key: "blank" as const, label: "Start blank", desc: "Add charts in the editor", icon: Square },
  ];

  return (
    <form action={action} className="space-y-6" noValidate>
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="mode" value={mode} />
      <fieldset>
        <legend className="mb-2 text-[13px] font-semibold text-ink">1. How do you want to start?</legend>
        <div role="radiogroup" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {modes.map((m) => (
            <button
              key={m.key}
              type="button"
              role="radio"
              aria-checked={mode === m.key}
              onClick={() => setMode(m.key)}
              className={cx("flex items-start gap-3 rounded-lg border bg-surface p-3 text-left transition-colors", mode === m.key ? "border-accent ring-2 ring-accent/15" : "border-line hover:border-line-strong")}
            >
              <span className={cx("flex size-8 shrink-0 items-center justify-center rounded-md", mode === m.key ? "bg-accent text-white" : "bg-subtle text-muted")}>
                <m.icon aria-hidden className="size-4" />
              </span>
              <span>
                <span className="block text-[13px] font-medium text-ink">{m.label}</span>
                <span className="block text-[12px] text-muted">{m.desc}</span>
              </span>
            </button>
          ))}
        </div>
      </fieldset>

      {mode === "template" && (
        <fieldset>
          <legend className="mb-2 text-[13px] font-semibold text-ink">2. Pick a template</legend>
          <input type="hidden" name="templateId" value={templateId} />
          <div role="radiogroup" aria-label="Templates" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {templates.map((t) => (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={templateId === t.id}
                onClick={() => {
                  if (!name || templates.some((x) => x.name === name)) setName(t.name);
                  setTemplateId(t.id);
                }}
                className={cx("overflow-hidden rounded-lg border bg-surface text-left transition-colors", templateId === t.id ? "border-accent ring-2 ring-accent/15" : "border-line hover:border-line-strong")}
              >
                <div className="h-28 border-b border-line bg-subtle/70 p-2.5">
                  <DashboardThumbnail charts={t.charts} />
                </div>
                <div className="p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-medium text-ink">{t.name}</span>
                    {templateId === t.id && <Check aria-hidden className="size-4 text-accent" />}
                  </div>
                  <p className="mt-0.5 text-[12px] text-muted">{t.description}</p>
                  <p className="mt-1.5 text-[11.5px] text-faint">
                    {t.chartCount} charts
                    {t.missing.length > 0 && <span className="text-warn"> · {t.missing.length} skipped (metric not in catalog)</span>}
                  </p>
                </div>
              </button>
            ))}
          </div>
          {fe?.templateId && <p className="mt-1 text-[12px] text-bad">{fe.templateId}</p>}
        </fieldset>
      )}

      {mode === "metrics" && (
        <fieldset>
          <legend className="mb-2 text-[13px] font-semibold text-ink">2. Choose approved metrics</legend>
          {metrics.length === 0 ? (
            <p className="text-[13px] text-muted">No approved metrics in {projectName} yet. Add metrics from the Metrics page first.</p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {metrics.map((m) => {
                const on = picked.includes(m.key);
                return (
                  <label key={m.key} className={cx("flex cursor-pointer items-start gap-2.5 rounded-md border bg-surface p-2.5", on ? "border-accent bg-accent-soft/40" : "border-line hover:border-line-strong")}>
                    <input type="checkbox" name="metricKeys" value={m.key} checked={on} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, m.key] : p.filter((k) => k !== m.key)))} className="mt-0.5 accent-[#4b46e0]" />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium text-ink">{m.name}</span>
                      <span className="block truncate text-[11.5px] text-muted">
                        {m.domain} · {m.description}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          )}
          <p className={cx("mt-1.5 text-[12px]", fe?.metricKeys ? "text-bad" : "text-muted")}>{fe?.metricKeys ?? `${picked.length} selected · the first four become KPI tiles.`}</p>
        </fieldset>
      )}

      <fieldset className="grid max-w-2xl gap-4">
        <legend className="mb-2 text-[13px] font-semibold text-ink">{mode === "blank" ? "2." : "3."} Name it</legend>
        <Field label="Name" htmlFor="name" error={fe?.name}>
          <input id="name" name="name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} aria-invalid={!!fe?.name} placeholder="e.g. Weekly board update" required />
        </Field>
        <Field label="Description" htmlFor="description" error={fe?.description} optional>
          <textarea id="description" name="description" value={description} onChange={(e) => setDescription(e.target.value)} className={textareaClass} maxLength={280} placeholder="What decisions does this dashboard support?" />
        </Field>
        <Field label="Tags" htmlFor="tags" hint="Comma separated, lowercase — e.g. founder, weekly" error={fe?.tags ?? Object.entries(fe ?? {}).find(([k]) => k.startsWith("tags."))?.[1]} optional>
          <input id="tags" name="tags" value={tags} onChange={(e) => setTags(e.target.value)} className={inputClass} placeholder="founder, weekly" />
        </Field>
      </fieldset>

      <div className="flex items-center gap-3 border-t border-line pt-4">
        <Button type="submit" variant="primary" disabled={pending}>
          <FileStack className="size-3.5" />
          {pending ? "Creating draft…" : "Create draft & open editor"}
        </Button>
        <span className="text-[12px] text-muted">Drafts are private until you publish.</span>
        {state && !state.ok && <FormMessage state={state} />}
      </div>
    </form>
  );
}
