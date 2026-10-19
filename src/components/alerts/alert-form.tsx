"use client";

import { useState, useTransition } from "react";
import { Eye } from "lucide-react";
import { createAlertAction, previewAlertAction } from "@/app/actions/alerts";
import type { AlertType, MetricUnit } from "@/lib/domain/types";
import { Badge, Button, Card, CardHeader, Field, SimulatedNote, inputClass, selectClass } from "@/components/ui";
import { cx } from "@/lib/format";

interface MetricOpt {
  key: string;
  name: string;
  unit: MetricUnit;
  direction: "up" | "down";
}

type Preview = {
  logic: string;
  latest: { breach: boolean; value: number | null; summary: string; insufficientData?: boolean };
  breaches: boolean[];
  wouldFire: boolean;
  decision: string;
  message: string;
};

const TYPES: { key: AlertType; label: string; hint: string }[] = [
  { key: "threshold", label: "Threshold", hint: "Metric above or below a value" },
  { key: "relative_change", label: "Relative change", hint: "Metric moves by X% vs a baseline" },
  { key: "missing_data", label: "Missing data", hint: "No rows arrive for a metric" },
  { key: "freshness_sla", label: "Freshness SLA", hint: "Source data older than N hours" },
  { key: "pipeline_failure", label: "Pipeline failure", hint: "dbt run/test or sync fails" },
];

const DECISION_LABEL: Record<string, string> = {
  fire: "Would fire now",
  ok: "Would not fire — condition not met",
  pending: "Breaching, but not yet for enough consecutive evaluations",
  suppressed_cooldown: "Suppressed by cooldown",
  suppressed_snoozed: "Suppressed (snoozed)",
  paused: "Paused",
};

export function AlertForm({ projectId, metrics }: { projectId: string; metrics: MetricOpt[] }) {
  const [type, setType] = useState<AlertType>("threshold");
  const [f, setF] = useState({
    name: "",
    metricKey: metrics[0]?.key ?? "",
    operator: "lt",
    value: "",
    direction: "decrease",
    pct: "20",
    comparedTo: "previous_period",
    expectedRows: "1",
    maxAgeHours: "6",
    target: "dbt_test",
    cadence: "daily",
    lookbackDays: "7",
    channel: "email",
    recipients: "",
    severity: "warning",
    cooldownMinutes: "360",
    consecutiveEvaluations: "2",
  });
  const set = (k: keyof typeof f, v: string) => {
    setF((p) => ({ ...p, [k]: v }));
    setPreview(null);
  };
  const [preview, setPreview] = useState<Preview | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();
  const [pending, start] = useTransition();
  const metric = metrics.find((m) => m.key === f.metricKey);
  const needsMetric = type === "threshold" || type === "relative_change" || type === "missing_data";
  const isPercent = metric?.unit === "percent";

  const payload = () => {
    const condition =
      type === "threshold"
        ? { kind: type, operator: f.operator, value: f.value === "" ? NaN : isPercent ? Number(f.value) / 100 : Number(f.value) }
        : type === "relative_change"
          ? { kind: type, direction: f.direction, pct: Number(f.pct), comparedTo: f.comparedTo }
          : type === "missing_data"
            ? { kind: type, expectedRowsAtLeast: Number(f.expectedRows) }
            : type === "freshness_sla"
              ? { kind: type, maxAgeHours: Number(f.maxAgeHours) }
              : { kind: type, target: f.target };
    return {
      projectId,
      name: f.name,
      metricKey: needsMetric ? f.metricKey : undefined,
      condition,
      cadence: f.cadence,
      lookbackDays: Number(f.lookbackDays),
      channel: f.channel,
      recipients: f.recipients
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter(Boolean),
      severity: f.severity,
      cooldownMinutes: Number(f.cooldownMinutes),
      consecutiveEvaluations: Number(f.consecutiveEvaluations),
    };
  };

  const handle = (r: { ok: boolean; message?: string; fieldErrors?: Record<string, string> } | undefined) => {
    if (r && !r.ok) {
      setFormError(r.message);
      setErrors(r.fieldErrors ?? {});
      return false;
    }
    setErrors({});
    setFormError(undefined);
    return true;
  };

  const doPreview = () =>
    start(async () => {
      const r = await previewAlertAction(payload());
      if (handle(r) && r.ok) setPreview(r.data as Preview);
    });
  const doCreate = () =>
    start(async () => {
      handle(await createAlertAction(payload()));
    });

  const err = (k: string) => errors[k] ?? Object.entries(errors).find(([p]) => p.startsWith(`${k}.`))?.[1];
  const inv = (k: string) => ({ "aria-invalid": !!err(k) || undefined });

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_400px]">
      <Card className="p-5">
        <div className="space-y-5">
          <Field label="Alert name" htmlFor="name" error={err("name")}>
            <input id="name" className={inputClass} value={f.name} {...inv("name")} onChange={(e) => set("name", e.target.value)} placeholder="Net revenue dropped week over week" />
          </Field>

          <fieldset>
            <legend className="mb-2 text-[12.5px] font-medium text-ink-2">Alert type</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {TYPES.map((t) => (
                <label key={t.key} className={cx("cursor-pointer rounded-md border px-3 py-2 text-[12.5px]", type === t.key ? "border-accent bg-accent-soft/50 ring-1 ring-accent/30" : "border-line hover:bg-subtle")}>
                  <input
                    type="radio"
                    name="type"
                    className="sr-only"
                    checked={type === t.key}
                    onChange={() => {
                      setType(t.key);
                      setPreview(null);
                    }}
                  />
                  <span className="block font-medium text-ink">{t.label}</span>
                  <span className="text-muted">{t.hint}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {needsMetric && (
              <Field label="Metric" htmlFor="metric" error={err("metricKey")} className="sm:col-span-2">
                <select id="metric" className={selectClass} value={f.metricKey} {...inv("metricKey")} onChange={(e) => set("metricKey", e.target.value)}>
                  {metrics.length === 0 && <option value="">No approved metrics</option>}
                  {metrics.map((m) => (
                    <option key={m.key} value={m.key}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {type === "threshold" && (
              <>
                <Field label="Operator" htmlFor="op">
                  <select id="op" className={selectClass} value={f.operator} onChange={(e) => set("operator", e.target.value)}>
                    <option value="lt">Below (&lt;)</option>
                    <option value="lte">At or below (≤)</option>
                    <option value="gt">Above (&gt;)</option>
                    <option value="gte">At or above (≥)</option>
                  </select>
                </Field>
                <Field label={`Value${isPercent ? " (%)" : metric?.unit === "currency" ? " (currency)" : ""}`} htmlFor="value" error={err("condition")}>
                  <input id="value" type="number" step="any" className={inputClass} value={f.value} {...inv("condition")} onChange={(e) => set("value", e.target.value)} placeholder={isPercent ? "35" : "1000"} />
                </Field>
              </>
            )}
            {type === "relative_change" && (
              <>
                <Field label="Direction" htmlFor="dir">
                  <select id="dir" className={selectClass} value={f.direction} onChange={(e) => set("direction", e.target.value)}>
                    <option value="decrease">Decreases by</option>
                    <option value="increase">Increases by</option>
                    <option value="either">Changes either way by</option>
                  </select>
                </Field>
                <Field label="Change (%)" htmlFor="pct" error={err("condition")}>
                  <input id="pct" type="number" min={1} className={inputClass} value={f.pct} {...inv("condition")} onChange={(e) => set("pct", e.target.value)} />
                </Field>
                <Field label="Compared to" htmlFor="cmp" className="sm:col-span-2">
                  <select id="cmp" className={selectClass} value={f.comparedTo} onChange={(e) => set("comparedTo", e.target.value)}>
                    <option value="previous_period">Previous period (same length as lookback)</option>
                    <option value="same_day_last_week">Same window last week</option>
                  </select>
                </Field>
              </>
            )}
            {type === "missing_data" && (
              <Field label="Expect at least (days with data)" htmlFor="rows" error={err("condition")}>
                <input id="rows" type="number" min={1} className={inputClass} value={f.expectedRows} onChange={(e) => set("expectedRows", e.target.value)} />
              </Field>
            )}
            {type === "freshness_sla" && (
              <Field label="Maximum data age (hours)" htmlFor="age" error={err("condition")} hint="Measured from the last successful load of the dashboard mart.">
                <input id="age" type="number" min={1} max={168} className={inputClass} value={f.maxAgeHours} onChange={(e) => set("maxAgeHours", e.target.value)} />
              </Field>
            )}
            {type === "pipeline_failure" && (
              <Field label="Watch" htmlFor="target">
                <select id="target" className={selectClass} value={f.target} onChange={(e) => set("target", e.target.value)}>
                  <option value="dbt_test">dbt tests</option>
                  <option value="dbt_run">dbt runs</option>
                  <option value="connection_sync">Connection syncs</option>
                </select>
              </Field>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 border-t border-line pt-4 sm:grid-cols-3">
            <Field label="Evaluate" htmlFor="cadence">
              <select id="cadence" className={selectClass} value={f.cadence} onChange={(e) => set("cadence", e.target.value)}>
                <option value="hourly">Hourly</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </Field>
            <Field label="Lookback window (days)" htmlFor="lookback" error={err("lookbackDays")}>
              <input id="lookback" type="number" min={1} max={90} className={inputClass} value={f.lookbackDays} {...inv("lookbackDays")} onChange={(e) => set("lookbackDays", e.target.value)} />
            </Field>
            <Field label="Severity" htmlFor="severity">
              <select id="severity" className={selectClass} value={f.severity} onChange={(e) => set("severity", e.target.value)}>
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="critical">Critical</option>
              </select>
            </Field>
            <Field label="Consecutive evaluations" htmlFor="consec" error={err("consecutiveEvaluations")} hint="Fire only after N breaches in a row.">
              <input id="consec" type="number" min={1} max={10} className={inputClass} value={f.consecutiveEvaluations} {...inv("consecutiveEvaluations")} onChange={(e) => set("consecutiveEvaluations", e.target.value)} />
            </Field>
            <Field label="Cooldown (minutes)" htmlFor="cooldown" error={err("cooldownMinutes")} hint="Quiet period after firing.">
              <input id="cooldown" type="number" min={0} className={inputClass} value={f.cooldownMinutes} {...inv("cooldownMinutes")} onChange={(e) => set("cooldownMinutes", e.target.value)} />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 border-t border-line pt-4 sm:grid-cols-3">
            <Field label="Channel" htmlFor="channel">
              <select id="channel" className={selectClass} value={f.channel} onChange={(e) => set("channel", e.target.value)}>
                <option value="email">Email</option>
                <option value="slack">Slack</option>
                <option value="webhook">Webhook</option>
              </select>
            </Field>
            <Field
              label="Recipients"
              htmlFor="recipients"
              className="sm:col-span-2"
              error={err("recipients")}
              hint={f.channel === "email" ? "Comma-separated emails" : f.channel === "slack" ? "Channels like #founders" : "https:// endpoint URL"}
            >
              <input
                id="recipients"
                className={inputClass}
                value={f.recipients}
                {...inv("recipients")}
                onChange={(e) => set("recipients", e.target.value)}
                placeholder={f.channel === "email" ? "alex@company.com" : f.channel === "slack" ? "#founders" : "https://hooks.example.com/alerts"}
              />
            </Field>
          </div>
          {formError && (
            <p role="alert" className="text-[12.5px] text-bad">
              {formError}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
            <Button onClick={doPreview} disabled={pending}>
              <Eye className="size-3.5" /> {pending && !preview ? "Evaluating…" : "Preview"}
            </Button>
            <Button variant="primary" onClick={doCreate} disabled={pending || !preview} title={preview ? undefined : "Preview the alert first"}>
              Create alert
            </Button>
          </div>
        </div>
      </Card>

      <Card className="self-start xl:sticky xl:top-20">
        <CardHeader title="Preview" description="Firing logic and a dry-run against current data" />
        <div className="space-y-3 px-4 pb-4">
          {!preview ? (
            <p className="py-6 text-center text-[13px] text-muted">Click Preview to see the firing logic, the current evaluation and a sample message. Creating an alert requires a preview first.</p>
          ) : (
            <>
              <p className="rounded-md bg-subtle px-3 py-2 text-[12.5px] text-ink-2">{preview.logic}</p>
              <div className="text-[12.5px]">
                <div className="font-medium text-ink-2">Current evaluation</div>
                <div className="mt-0.5 text-ink">{preview.latest.summary}</div>
                {preview.breaches.length > 1 && (
                  <div className="mt-1 flex items-center gap-1 text-[11.5px] text-muted">
                    Last {preview.breaches.length} windows:
                    {preview.breaches.map((b, i) => (
                      <span key={i} className={cx("size-2.5 rounded-sm", b ? "bg-bad" : "bg-ok")} aria-label={b ? "breach" : "ok"} />
                    ))}
                  </div>
                )}
              </div>
              <Badge tone={preview.wouldFire ? "bad" : preview.decision === "pending" ? "warn" : "ok"}>{DECISION_LABEL[preview.decision] ?? preview.decision}</Badge>
              <div>
                <div className="mb-1 text-[12px] font-medium text-ink-2">Sample message</div>
                <pre className="rounded-md border border-line bg-subtle/60 p-3 font-sans text-[12.5px] whitespace-pre-wrap text-ink-2">{preview.message}</pre>
              </div>
              <SimulatedNote>Evaluated against demo data. Deliveries are simulated — nothing will be sent.</SimulatedNote>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
