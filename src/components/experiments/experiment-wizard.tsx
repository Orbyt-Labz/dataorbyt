"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import { requiredSampleSize } from "@/lib/domain/stats";
import type { MetricUnit } from "@/lib/domain/types";
import { createExperimentAction } from "@/app/actions/experiments";
import { Button, Card, Field, inputClass, selectClass, textareaClass, Callout } from "@/components/ui";
import { cx, formatNumber } from "@/lib/format";

interface MetricOpt {
  key: string;
  name: string;
  unit: MetricUnit;
  baseline?: number;
}

interface Variant {
  key: string;
  name: string;
  allocation: number;
  isControl: boolean;
}

const STEPS = ["Hypothesis", "Variants", "Metrics & schedule", "Review"] as const;
const FIELD_STEP: Record<string, number> = {
  name: 0,
  key: 0,
  hypothesis: 0,
  population: 0,
  randomizationUnit: 1,
  variants: 1,
  startDate: 2,
  endDate: 2,
  primaryMetric: 2,
  guardrailMetrics: 2,
  minimumDetectableEffectPct: 2,
  targetSampleSizePerVariant: 2,
};

function slug(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^(\d)/, "x$1")
    .slice(0, 48);
}

export function ExperimentWizard({ projectId, metrics, defaultStart, defaultEnd }: { projectId: string; metrics: MetricOpt[]; defaultStart: string; defaultEnd: string }) {
  const [step, setStep] = useState(0);
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();
  const [keyTouched, setKeyTouched] = useState(false);

  const firstPercent = metrics.find((m) => m.unit === "percent")?.key ?? metrics[0].key;
  const [f, setF] = useState({
    name: "",
    key: "",
    hypothesis: "",
    population: "",
    randomizationUnit: "user" as "user" | "account" | "session" | "device",
    variants: [
      { key: "control", name: "Control", allocation: 50, isControl: true },
      { key: "treatment", name: "Treatment", allocation: 50, isControl: false },
    ] as Variant[],
    startDate: defaultStart,
    endDate: defaultEnd,
    primaryMetric: firstPercent,
    guardrailMetrics: [] as string[],
    sizing: "mde" as "mde" | "sample",
    mde: "10",
    sample: "",
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  const totalAlloc = f.variants.reduce((a, v) => a + (Number(v.allocation) || 0), 0);
  const primary = metrics.find((m) => m.key === f.primaryMetric);
  const suggested = useMemo(() => {
    const mde = Number(f.mde);
    if (!primary?.baseline || !(mde > 0)) return null;
    return requiredSampleSize(primary.baseline, mde / 100);
  }, [primary, f.mde]);

  const updateVariant = (i: number, patch: Partial<Variant>) => set("variants", f.variants.map((v, j) => (j === i ? { ...v, ...patch } : v)));
  const setControl = (i: number) => set("variants", f.variants.map((v, j) => ({ ...v, isControl: j === i })));
  const balance = () => {
    const n = f.variants.length;
    const each = Math.floor(100 / n);
    set("variants", f.variants.map((v, i) => ({ ...v, allocation: i === 0 ? 100 - each * (n - 1) : each })));
  };

  const payload = () => ({
    projectId,
    name: f.name,
    key: f.key,
    hypothesis: f.hypothesis,
    population: f.population,
    randomizationUnit: f.randomizationUnit,
    variants: f.variants.map((v) => ({ ...v, allocation: Number(v.allocation) })),
    startDate: f.startDate,
    endDate: f.endDate,
    primaryMetric: f.primaryMetric,
    guardrailMetrics: f.guardrailMetrics,
    minimumDetectableEffectPct: f.sizing === "mde" && f.mde ? Number(f.mde) : undefined,
    targetSampleSizePerVariant: f.sizing === "sample" && f.sample ? Number(f.sample) : f.sizing === "mde" && suggested ? suggested : undefined,
  });

  // Client-side checks per step (the server re-validates everything).
  const stepErrors = (s: number): Record<string, string> => {
    const e: Record<string, string> = {};
    if (s === 0) {
      if (f.name.trim().length < 3) e.name = "Name is required";
      if (!/^[a-z][a-z0-9_]{2,48}$/.test(f.key)) e.key = "Use lower_snake_case (3–49 chars)";
      if (f.hypothesis.trim().length < 20) e.hypothesis = "State the expected change and why (20+ characters)";
      if (f.population.trim().length < 3) e.population = "Describe the target population";
    }
    if (s === 1) {
      if (totalAlloc !== 100) e.variants = `Allocations must sum to 100% (currently ${totalAlloc}%)`;
      else if (new Set(f.variants.map((v) => v.key)).size !== f.variants.length) e.variants = "Variant keys must be unique";
      else if (f.variants.some((v) => !/^[a-z][a-z0-9_]{0,30}$/.test(v.key) || !v.name.trim())) e.variants = "Each variant needs a name and a lower_snake_case key";
    }
    if (s === 2) {
      if (f.endDate <= f.startDate) e.endDate = "End date must be after start date";
      if (f.guardrailMetrics.includes(f.primaryMetric)) e.guardrailMetrics = "Guardrails must differ from the primary metric";
      if (f.sizing === "mde" && !(Number(f.mde) > 0)) e.minimumDetectableEffectPct = "Enter a minimum detectable effect";
      if (f.sizing === "sample" && !(Number(f.sample) >= 50)) e.targetSampleSizePerVariant = "Enter a target of at least 50 per variant";
    }
    return e;
  };

  const next = () => {
    const e = stepErrors(step);
    setErrors(e);
    if (Object.keys(e).length === 0) setStep((s) => Math.min(STEPS.length - 1, s + 1));
  };

  const submit = () => {
    setFormError(undefined);
    start(async () => {
      const r = await createExperimentAction(payload());
      if (r && !r.ok) {
        setFormError(r.message);
        setErrors(r.fieldErrors ?? {});
        const firstStep = Math.min(...Object.keys(r.fieldErrors ?? {}).map((k) => FIELD_STEP[k.split(".")[0]] ?? 3));
        if (Number.isFinite(firstStep)) setStep(firstStep);
      }
    });
  };

  const err = (k: string) => errors[k];
  const aria = (k: string) => ({ "aria-invalid": !!errors[k] || undefined, "aria-describedby": errors[k] ? `${k}-error` : undefined });

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[200px_1fr]">
      <ol className="flex gap-2 overflow-x-auto lg:flex-col" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button
              type="button"
              onClick={() => i < step && setStep(i)}
              aria-current={i === step ? "step" : undefined}
              disabled={i > step}
              className={cx("flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] whitespace-nowrap", i === step ? "bg-accent-soft font-medium text-accent" : i < step ? "text-ink-2 hover:bg-hover" : "text-faint")}
            >
              <span className={cx("flex size-5 items-center justify-center rounded-full text-[11px] font-semibold", i < step ? "bg-ok text-white" : i === step ? "bg-accent text-white" : "border border-line-strong")}>
                {i < step ? <Check className="size-3" strokeWidth={3} /> : i + 1}
              </span>
              {s}
            </button>
          </li>
        ))}
      </ol>

      <Card className="p-5">
        {step === 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Experiment name" htmlFor="name" error={err("name")}>
              <input
                id="name"
                className={inputClass}
                value={f.name}
                {...aria("name")}
                onChange={(e) => {
                  set("name", e.target.value);
                  if (!keyTouched) set("key", slug(e.target.value));
                }}
                placeholder="Onboarding checklist v3"
              />
            </Field>
            <Field label="Key" htmlFor="key" error={err("key")} hint="Used as experiment_id in events.">
              <input
                id="key"
                className={inputClass + " font-mono"}
                value={f.key}
                {...aria("key")}
                onChange={(e) => {
                  setKeyTouched(true);
                  set("key", e.target.value);
                }}
              />
            </Field>
            <Field label="Hypothesis" htmlFor="hypothesis" className="sm:col-span-2" error={err("hypothesis")} hint="We believe [change] will [move metric] because [reason].">
              <textarea id="hypothesis" className={textareaClass} rows={3} value={f.hypothesis} {...aria("hypothesis")} onChange={(e) => set("hypothesis", e.target.value)} />
            </Field>
            <Field label="Target population" htmlFor="population" className="sm:col-span-2" error={err("population")}>
              <input id="population" className={inputClass} value={f.population} {...aria("population")} onChange={(e) => set("population", e.target.value)} placeholder="New trial signups on web" />
            </Field>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <Field label="Randomization unit" htmlFor="unit" hint="The unit that gets a stable assignment. Analyse at the same unit.">
              <select id="unit" className={selectClass + " sm:w-60"} value={f.randomizationUnit} onChange={(e) => set("randomizationUnit", e.target.value as typeof f.randomizationUnit)}>
                <option value="user">User</option>
                <option value="account">Account</option>
                <option value="session">Session</option>
                <option value="device">Device</option>
              </select>
            </Field>
            <fieldset>
              <legend className="mb-2 text-[12.5px] font-medium text-ink-2">Variants & allocation</legend>
              <div className="space-y-2">
                {f.variants.map((v, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_90px_auto_auto] items-center gap-2">
                    <input aria-label={`Variant ${i + 1} name`} className={inputClass} value={v.name} onChange={(e) => updateVariant(i, { name: e.target.value })} />
                    <input aria-label={`Variant ${i + 1} key`} className={inputClass + " font-mono"} value={v.key} onChange={(e) => updateVariant(i, { key: e.target.value })} />
                    <div className="relative">
                      <input aria-label={`Variant ${i + 1} allocation percent`} type="number" min={1} max={99} className={inputClass + " pr-6 tabular"} value={v.allocation} onChange={(e) => updateVariant(i, { allocation: Number(e.target.value) })} />
                      <span className="pointer-events-none absolute top-2 right-2 text-[12px] text-muted">%</span>
                    </div>
                    <label className="flex items-center gap-1.5 text-[12.5px] text-ink-2">
                      <input type="radio" name="control" checked={v.isControl} onChange={() => setControl(i)} /> Control
                    </label>
                    <button
                      type="button"
                      aria-label={`Remove variant ${v.name}`}
                      disabled={f.variants.length <= 2}
                      onClick={() => {
                        const rest = f.variants.filter((_, j) => j !== i);
                        if (!rest.some((x) => x.isControl)) rest[0].isControl = true;
                        set("variants", rest);
                      }}
                      className="rounded-md p-1.5 text-muted hover:bg-hover disabled:opacity-30"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button size="sm" disabled={f.variants.length >= 4} onClick={() => set("variants", [...f.variants, { key: `variant_${f.variants.length}`, name: `Variant ${f.variants.length}`, allocation: 0, isControl: false }])}>
                  <Plus className="size-3.5" /> Add variant
                </Button>
                <Button size="sm" variant="ghost" onClick={balance}>
                  Split evenly
                </Button>
                <span className={cx("ml-auto text-[12.5px] tabular", totalAlloc === 100 ? "text-ok" : "text-bad")} aria-live="polite">
                  Total {totalAlloc}%
                </span>
              </div>
              {err("variants") && (
                <p role="alert" className="mt-1 text-[12px] text-bad">
                  {err("variants")}
                </p>
              )}
              {f.variants.length > 2 && <p className="mt-2 text-[12px] text-warn">Inference in DataOrbyt covers two-arm tests only; results for 3+ arms are descriptive.</p>}
            </fieldset>
          </div>
        )}

        {step === 2 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Start date" htmlFor="start" error={err("startDate")}>
              <input id="start" type="date" className={inputClass} value={f.startDate} {...aria("startDate")} onChange={(e) => set("startDate", e.target.value)} />
            </Field>
            <Field label="End date" htmlFor="end" error={err("endDate")} hint="Fixed horizon: decide before you look at results.">
              <input id="end" type="date" className={inputClass} value={f.endDate} {...aria("endDate")} onChange={(e) => set("endDate", e.target.value)} />
            </Field>
            <Field label="Primary metric" htmlFor="primary" error={err("primaryMetric")} hint="Conversion (percent) metrics support inference.">
              <select id="primary" className={selectClass} value={f.primaryMetric} {...aria("primaryMetric")} onChange={(e) => set("primaryMetric", e.target.value)}>
                {metrics.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.name}
                  </option>
                ))}
              </select>
            </Field>
            <fieldset className="sm:row-span-2">
              <legend className="mb-1 text-[12.5px] font-medium text-ink-2">Guardrail metrics</legend>
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-line p-2">
                {metrics
                  .filter((m) => m.key !== f.primaryMetric)
                  .map((m) => (
                    <label key={m.key} className="flex items-center gap-2 text-[13px] text-ink-2">
                      <input
                        type="checkbox"
                        checked={f.guardrailMetrics.includes(m.key)}
                        onChange={(e) => set("guardrailMetrics", e.target.checked ? [...f.guardrailMetrics, m.key].slice(0, 5) : f.guardrailMetrics.filter((k) => k !== m.key))}
                      />
                      {m.name}
                    </label>
                  ))}
              </div>
              {err("guardrailMetrics") && <p className="mt-1 text-[12px] text-bad">{err("guardrailMetrics")}</p>}
            </fieldset>
            <fieldset className="space-y-2">
              <legend className="mb-1 text-[12.5px] font-medium text-ink-2">Sizing</legend>
              <div className="flex gap-3 text-[13px]">
                <label className="flex items-center gap-1.5">
                  <input type="radio" checked={f.sizing === "mde"} onChange={() => set("sizing", "mde")} /> Minimum detectable effect
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="radio" checked={f.sizing === "sample"} onChange={() => set("sizing", "sample")} /> Target sample size
                </label>
              </div>
              {f.sizing === "mde" ? (
                <Field label="Relative MDE (%)" htmlFor="mde" error={err("minimumDetectableEffectPct")}>
                  <input id="mde" type="number" min={0.5} step={0.5} className={inputClass + " sm:w-32"} value={f.mde} {...aria("minimumDetectableEffectPct")} onChange={(e) => set("mde", e.target.value)} />
                </Field>
              ) : (
                <Field label="Target sample per variant" htmlFor="sample" error={err("targetSampleSizePerVariant")}>
                  <input id="sample" type="number" min={50} className={inputClass + " sm:w-40"} value={f.sample} {...aria("targetSampleSizePerVariant")} onChange={(e) => set("sample", e.target.value)} />
                </Field>
              )}
              {f.sizing === "mde" && (
                <p className="text-[12px] text-muted">
                  {suggested && primary?.baseline
                    ? `Baseline ${(primary.baseline * 100).toFixed(1)}% (last 30 days, demo data). Detecting a ${f.mde}% relative change needs ≈ ${formatNumber(suggested)} exposed units per variant (α = 0.05 two-sided, 80% power). This becomes the target sample.`
                    : "Pick a percent metric to estimate the required sample size from its current baseline."}
                </p>
              )}
            </fieldset>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3 text-[13px]">
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-[160px_1fr]">
              <dt className="text-muted">Name</dt>
              <dd>
                {f.name} <span className="font-mono text-faint">({f.key})</span>
              </dd>
              <dt className="text-muted">Hypothesis</dt>
              <dd>{f.hypothesis}</dd>
              <dt className="text-muted">Population</dt>
              <dd>{f.population}</dd>
              <dt className="text-muted">Randomization</dt>
              <dd>Per {f.randomizationUnit}</dd>
              <dt className="text-muted">Variants</dt>
              <dd>{f.variants.map((v) => `${v.name} ${v.allocation}%${v.isControl ? " (control)" : ""}`).join(" · ")}</dd>
              <dt className="text-muted">Schedule</dt>
              <dd>
                {f.startDate} → {f.endDate}
              </dd>
              <dt className="text-muted">Primary metric</dt>
              <dd>{primary?.name}</dd>
              <dt className="text-muted">Guardrails</dt>
              <dd>{f.guardrailMetrics.map((k) => metrics.find((m) => m.key === k)?.name).join(", ") || "None"}</dd>
              <dt className="text-muted">Sizing</dt>
              <dd>
                {f.sizing === "mde" ? `MDE ${f.mde}%` : "Fixed sample"}
                {payload().targetSampleSizePerVariant ? ` · target ${formatNumber(payload().targetSampleSizePerVariant!)} per variant` : ""}
              </dd>
            </dl>
            <Callout tone="info" title="This creates a draft">
              Nothing is assigned until you start the experiment. Send assignment and exposure events from your product using the schema on the experiment page.
            </Callout>
            {formError && (
              <p role="alert" className="text-[12.5px] text-bad">
                {formError}
              </p>
            )}
          </div>
        )}

        <div className="mt-6 flex items-center justify-between border-t border-line pt-4">
          <Button variant="ghost" disabled={step === 0 || pending} onClick={() => setStep((s) => s - 1)}>
            Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button variant="primary" onClick={next}>
              Continue
            </Button>
          ) : (
            <Button variant="primary" onClick={submit} disabled={pending}>
              {pending ? "Creating…" : "Create draft experiment"}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
