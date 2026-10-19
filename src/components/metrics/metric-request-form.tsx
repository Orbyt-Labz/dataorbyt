"use client";

import { useState, useTransition } from "react";
import { ChevronLeft, ShieldCheck } from "lucide-react";
import { Badge, Button, Callout, Card, Code, Field, inputClass, selectClass, textareaClass } from "@/components/ui";
import { requestMetricAction } from "@/app/actions/metrics";

interface Props {
  projectId: string;
  models: string[];
  fields: string[];
  dimensions: { key: string; label: string }[];
}

type Agg = "sum" | "ratio" | "gauge";

const FORBIDDEN_SQL = /\b(insert|update|delete|merge|drop|alter|create|grant|revoke|truncate|call|execute|copy|export)\b/i;

function aggExpr(agg: Agg, field: string, den: string) {
  if (agg === "sum") return `SUM(${field})`;
  if (agg === "gauge") return `AVG(${field})`;
  return `SAFE_DIVIDE(SUM(${field}), SUM(${den}))`;
}

export function MetricRequestForm({ projectId, models, fields, dimensions }: Props) {
  const [v, setV] = useState({
    name: "",
    key: "",
    description: "",
    domain: "growth",
    unit: "count",
    sourceModel: models[0] ?? "",
    aggregationType: "sum" as Agg,
    field: fields[0] ?? "",
    denominator: "",
    dimensions: [] as string[],
    proposedSql: "",
  });
  const [keyTouched, setKeyTouched] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [step, setStep] = useState<"edit" | "review">("edit");
  const [pending, start] = useTransition();

  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => {
    setV((p) => {
      const next = { ...p, [k]: val };
      if (k === "name" && !keyTouched) next.key = String(val).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/^(\d)/, "m_$1").slice(0, 41);
      return next;
    });
    setErrors((e) => ({ ...e, [k]: "" }));
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (v.name.trim().length < 3) e.name = "Name is required";
    if (!/^[a-z][a-z0-9_]{2,40}$/.test(v.key)) e.key = "Use lower_snake_case, 3–41 characters, starting with a letter";
    if (v.description.trim().length < 10) e.description = "Describe what the metric measures (10+ characters)";
    if (v.aggregationType === "ratio" && !v.denominator) e.denominator = "Ratio metrics need a denominator";
    if (v.aggregationType === "ratio" && v.denominator === v.field) e.denominator = "Denominator must differ from the numerator";
    if (FORBIDDEN_SQL.test(v.proposedSql)) e.proposedSql = "Only SELECT expressions are allowed in a metric definition";
    else if (v.proposedSql.includes(";")) e.proposedSql = "Multiple statements are not allowed";
    if (v.dimensions.length > 4) e.dimensions = "Choose up to 4 dimensions";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const governedSql = [
    `-- governed metric: ${v.key || "<key>"} (compiled by MetricQueryService)`,
    `SELECT DATE_TRUNC(date, @grain) AS period,`,
    `       ${aggExpr(v.aggregationType, v.field, v.denominator || "<denominator>")} AS value`,
    `FROM marts.${v.sourceModel}`,
    `WHERE project_id = @project_id`,
    `  AND date BETWEEN @start_date AND @end_date`,
    ...(v.dimensions.length ? [`  -- optional filters on: ${v.dimensions.join(", ")} (whitelisted values only)`] : []),
    `GROUP BY period`,
    `LIMIT @row_limit`,
  ].join("\n");

  const submit = () =>
    start(async () => {
      setFormError(null);
      const r = await requestMetricAction({ projectId, ...v, denominator: v.aggregationType === "ratio" ? v.denominator : undefined });
      if (r && !r.ok) {
        setFormError(r.message);
        if (r.fieldErrors) setErrors(r.fieldErrors);
        setStep("edit");
      }
    });

  const fieldErr = (k: string) => ({ "aria-invalid": !!errors[k], "aria-describedby": errors[k] ? `m-${k}-error` : undefined });

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0 space-y-4">
        {formError && <Callout tone="bad" title="Request not submitted">{formError}</Callout>}
        {step === "edit" ? (
          <Card className="p-4">
            <form
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                if (validate()) setStep("review");
              }}
              className="grid grid-cols-1 gap-3 sm:grid-cols-2"
            >
              <Field label="Name" htmlFor="m-name" error={errors.name}>
                <input id="m-name" value={v.name} onChange={(e) => set("name", e.target.value)} className={inputClass} placeholder="e.g. Expansion revenue" {...fieldErr("name")} />
              </Field>
              <Field label="Key" htmlFor="m-key" error={errors.key} hint="Used by dashboards, alerts and MCP tools.">
                <input
                  id="m-key"
                  value={v.key}
                  onChange={(e) => {
                    setKeyTouched(true);
                    set("key", e.target.value);
                  }}
                  className={inputClass + " font-mono"}
                  {...fieldErr("key")}
                />
              </Field>
              <Field label="Description" htmlFor="m-description" error={errors.description} className="sm:col-span-2">
                <textarea id="m-description" value={v.description} onChange={(e) => set("description", e.target.value)} className={textareaClass} {...fieldErr("description")} />
              </Field>
              <Field label="Domain" htmlFor="m-domain">
                <select id="m-domain" value={v.domain} onChange={(e) => set("domain", e.target.value)} className={selectClass}>
                  {["revenue", "growth", "engagement", "retention", "acquisition"].map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Unit" htmlFor="m-unit">
                <select id="m-unit" value={v.unit} onChange={(e) => set("unit", e.target.value)} className={selectClass}>
                  <option value="count">Count</option>
                  <option value="currency">Currency</option>
                  <option value="percent">Percent</option>
                </select>
              </Field>
              <Field label="Source model (dbt mart)" htmlFor="m-model" error={errors.sourceModel}>
                <select id="m-model" value={v.sourceModel} onChange={(e) => set("sourceModel", e.target.value)} className={selectClass + " font-mono"}>
                  {models.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Aggregation" htmlFor="m-agg">
                <select id="m-agg" value={v.aggregationType} onChange={(e) => set("aggregationType", e.target.value as Agg)} className={selectClass}>
                  <option value="sum">Sum</option>
                  <option value="ratio">Ratio (sum ÷ sum)</option>
                  <option value="gauge">Gauge (average per period)</option>
                </select>
              </Field>
              <Field label={v.aggregationType === "ratio" ? "Numerator field" : "Field"} htmlFor="m-field" error={errors.field}>
                <select id="m-field" value={v.field} onChange={(e) => set("field", e.target.value)} className={selectClass + " font-mono"}>
                  {fields.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </Field>
              {v.aggregationType === "ratio" && (
                <Field label="Denominator field" htmlFor="m-denominator" error={errors.denominator}>
                  <select id="m-denominator" value={v.denominator} onChange={(e) => set("denominator", e.target.value)} className={selectClass + " font-mono"} {...fieldErr("denominator")}>
                    <option value="">Choose…</option>
                    {fields.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <fieldset className="sm:col-span-2">
                <legend className="mb-1 text-[12.5px] font-medium text-ink-2">Dimensions (up to 4)</legend>
                <div className="flex flex-wrap gap-2">
                  {dimensions.map((d) => (
                    <label key={d.key} className="flex items-center gap-1.5 rounded-md border border-line px-2 py-1 text-[12.5px] has-[:checked]:border-accent has-[:checked]:bg-accent-soft/40">
                      <input
                        type="checkbox"
                        checked={v.dimensions.includes(d.key)}
                        onChange={(e) => set("dimensions", e.target.checked ? [...v.dimensions, d.key] : v.dimensions.filter((x) => x !== d.key))}
                        className="accent-[var(--color-accent)]"
                      />
                      {d.label}
                    </label>
                  ))}
                </div>
                {errors.dimensions && <p className="mt-1 text-[12px] text-bad">{errors.dimensions}</p>}
              </fieldset>
              <Field
                label="Proposed SQL expression"
                htmlFor="m-proposedSql"
                optional
                error={errors.proposedSql}
                hint="For reviewers only. It's stored as a model definition for review — never executed against production."
                className="sm:col-span-2"
              >
                <textarea
                  id="m-proposedSql"
                  value={v.proposedSql}
                  onChange={(e) => set("proposedSql", e.target.value)}
                  className={textareaClass + " font-mono text-[12px]"}
                  placeholder="SUM(invoice_amount) FILTER (WHERE is_expansion)"
                  spellCheck={false}
                  {...fieldErr("proposedSql")}
                />
              </Field>
              <div className="flex justify-end sm:col-span-2">
                <Button type="submit" variant="primary">
                  Review request
                </Button>
              </div>
            </form>
          </Card>
        ) : (
          <Card className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[15px] font-semibold">{v.name}</h2>
                <div className="font-mono text-[12px] text-muted">{v.key}</div>
              </div>
              <Badge tone="info">Will be &ldquo;Requested&rdquo;</Badge>
            </div>
            <p className="mt-2 text-[13px] text-ink-2">{v.description}</p>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-[12.5px] sm:grid-cols-4">
              <div>
                <dt className="text-faint">Domain</dt>
                <dd className="capitalize">{v.domain}</dd>
              </div>
              <div>
                <dt className="text-faint">Unit</dt>
                <dd>{v.unit}</dd>
              </div>
              <div>
                <dt className="text-faint">Model</dt>
                <dd className="font-mono text-[12px]">{v.sourceModel}</dd>
              </div>
              <div>
                <dt className="text-faint">Dimensions</dt>
                <dd>{v.dimensions.join(", ") || "none"}</dd>
              </div>
            </dl>
            <h3 className="mt-4 mb-1.5 text-[12.5px] font-medium text-ink-2">Governed query the catalog will compile</h3>
            <Code>{governedSql}</Code>
            {v.proposedSql && (
              <>
                <h3 className="mt-3 mb-1.5 text-[12.5px] font-medium text-ink-2">Proposed expression (for review)</h3>
                <Code>{v.proposedSql}</Code>
              </>
            )}
            <div className="mt-3">
              <Callout tone="info">SQL is reviewed as a controlled model definition and never executed against production. Until approved, the metric can&apos;t be used by dashboards, alerts or MCP tools.</Callout>
            </div>
            <div className="mt-4 flex gap-2">
              <Button onClick={() => setStep("edit")}>
                <ChevronLeft aria-hidden className="size-3.5" /> Edit
              </Button>
              <Button variant="primary" disabled={pending} onClick={submit}>
                {pending ? "Submitting…" : "Submit for review"}
              </Button>
            </div>
          </Card>
        )}
      </div>
      <aside>
        <Card className="p-4">
          <h3 className="flex items-center gap-2 text-[13px] font-semibold">
            <ShieldCheck aria-hidden className="size-4 text-accent" /> How metrics are governed
          </h3>
          <ul className="mt-2 list-disc space-y-1.5 pl-4 text-[12.5px] text-ink-2">
            <li>Every query goes through MetricQueryService, which accepts only catalog keys and whitelisted dimensions.</li>
            <li>Filters, date ranges and row counts are bounded; results are cached and count against a daily scan budget.</li>
            <li>Arbitrary SQL is never run against your warehouse — definitions become dbt models after review.</li>
          </ul>
        </Card>
      </aside>
    </div>
  );
}
