"use client";

import { useRef, useState, useTransition } from "react";
import { CheckCircle2, ChevronLeft, KeyRound, Loader2, Lock, ShieldCheck, XCircle } from "lucide-react";
import type { ConnectorCategory, ConnectorDefinition, Environment } from "@/lib/domain/types";
import type { ConnectionTestResult } from "@/lib/adapters/types";
import { Badge, Button, Callout, Card, Field, inputClass, selectClass, SimulatedNote, textareaClass } from "@/components/ui";
import { createConnectionAction, testConnectionAction, type ConnectionInput } from "@/app/actions/connections";
import { cx } from "@/lib/format";
import { ConnectorIcon } from "./connector-icon";

const STEPS = ["Source", "Details", "Review"] as const;

export function ConnectionWizard({
  projectId,
  projectEnvironment,
  connectors,
  categoryLabels,
  initialConnector,
}: {
  projectId: string;
  projectEnvironment: Environment;
  connectors: ConnectorDefinition[];
  categoryLabels: Record<ConnectorCategory, string>;
  initialConnector?: string;
}) {
  const [step, setStep] = useState(initialConnector ? 1 : 0);
  const [connectorId, setConnectorId] = useState(initialConnector ?? "");
  const def = connectors.find((c) => c.id === connectorId);
  const [name, setName] = useState(def?.name ?? "");
  const [environment, setEnvironment] = useState<Environment>(projectEnvironment);
  const [syncFrequency, setSyncFrequency] = useState("6h");
  // Non-secret config lives in state; secret values are read from the DOM only at submit time.
  const [config, setConfig] = useState<Record<string, string>>({});
  const secretsRef = useRef<HTMLDivElement>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [test, setTest] = useState<ConnectionTestResult | null>(null);
  const [secretsEntered, setSecretsEntered] = useState<string[]>([]);
  const [testing, startTest] = useTransition();
  const [creating, startCreate] = useTransition();

  const choose = (id: string) => {
    const d = connectors.find((c) => c.id === id);
    setConnectorId(id);
    setName(d?.name ?? "");
    setConfig({});
    setTest(null);
    setErrors({});
  };

  const readSecrets = (): Record<string, string> => {
    const out: Record<string, string> = {};
    secretsRef.current?.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("[data-secret]").forEach((el) => {
      if (el.value) out[el.name] = el.value;
    });
    return out;
  };

  const clearSecrets = () => {
    secretsRef.current?.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("[data-secret]").forEach((el) => (el.value = ""));
  };

  const buildInput = (): ConnectionInput => ({
    projectId,
    connectorId,
    name,
    environment,
    syncFrequency,
    fields: { ...Object.fromEntries(Object.entries(config).filter(([, v]) => v !== "")), ...readSecrets() },
  });

  const validateLocal = () => {
    const e: Record<string, string> = {};
    if (name.trim().length < 2) e.name = "Name is required";
    const secrets = readSecrets();
    for (const f of def?.fields ?? []) {
      const v = f.secret ? secrets[f.key] : config[f.key];
      if (f.required && !v?.trim()) e[f.key] = `${f.label} is required`;
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const runTest = () => {
    setFormError(null);
    if (!validateLocal()) return;
    startTest(async () => {
      const r = await testConnectionAction(buildInput());
      if (r.ok && r.data) {
        setTest(r.data);
        setErrors({});
      } else if (!r.ok) {
        setTest(null);
        setErrors(r.fieldErrors ? Object.fromEntries(Object.entries(r.fieldErrors).map(([k, v]) => [k.replace(/^fields\./, ""), v])) : {});
        setFormError(r.message);
      }
    });
  };

  const goReview = () => {
    setSecretsEntered(Object.keys(readSecrets()));
    setStep(2);
  };

  const create = () => {
    setFormError(null);
    // Secrets inputs are hidden (but still mounted) on the review step.
    startCreate(async () => {
      const input = buildInput();
      clearSecrets();
      const r = await createConnectionAction(input);
      if (r && !r.ok) {
        setFormError(`${r.message} Re-enter the secret values to try again.`);
        setTest(null);
        setStep(1);
      }
    });
  };

  const grouped = Object.entries(categoryLabels)
    .map(([cat, label]) => ({ label, items: connectors.filter((c) => c.category === cat) }))
    .filter((g) => g.items.length);

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0 space-y-4">
        <ol className="flex items-center gap-2 text-[12.5px]" aria-label="Progress">
          {STEPS.map((s, i) => (
            <li key={s} className="flex items-center gap-2">
              <span
                aria-current={i === step ? "step" : undefined}
                className={cx("flex size-5 items-center justify-center rounded-full text-[11px] font-semibold", i < step ? "bg-ok text-white" : i === step ? "bg-accent text-white" : "border border-line-strong text-muted")}
              >
                {i + 1}
              </span>
              <span className={cx(i === step ? "font-medium text-ink" : "text-muted")}>{s}</span>
              {i < STEPS.length - 1 && <span aria-hidden className="mx-1 h-px w-8 bg-line-strong" />}
            </li>
          ))}
        </ol>

        {formError && <Callout tone="bad" title="Couldn't continue">{formError}</Callout>}

        {step === 0 && (
          <Card className="p-4">
            <h2 className="text-[14px] font-semibold">Choose a source</h2>
            <div className="mt-3 space-y-4">
              {grouped.map((g) => (
                <fieldset key={g.label}>
                  <legend className="mb-2 text-[11.5px] font-medium tracking-wide text-muted uppercase">{g.label}</legend>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {g.items.map((c) => (
                      <label key={c.id} className={cx("flex cursor-pointer items-center gap-2.5 rounded-md border p-2.5 text-[13px] transition-colors", connectorId === c.id ? "border-accent bg-accent-soft/50 ring-2 ring-accent/15" : "border-line hover:border-line-strong")}>
                        <input type="radio" name="connector" value={c.id} checked={connectorId === c.id} onChange={() => choose(c.id)} className="sr-only" />
                        <ConnectorIcon id={c.id} />
                        <span className="font-medium text-ink">{c.name}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>
            <div className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-3">
              <Field label="Connection name" htmlFor="c-name" error={errors.name}>
                <input id="c-name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} aria-invalid={!!errors.name} placeholder="e.g. Stripe (live)" />
              </Field>
              <Field label="Environment" htmlFor="c-env">
                <select id="c-env" value={environment} onChange={(e) => setEnvironment(e.target.value as Environment)} className={selectClass}>
                  <option value="production">Production</option>
                  <option value="staging">Staging</option>
                  <option value="development">Development</option>
                </select>
              </Field>
              <Field label="Sync frequency" htmlFor="c-freq">
                <select id="c-freq" value={syncFrequency} onChange={(e) => setSyncFrequency(e.target.value)} className={selectClass}>
                  <option value="15m">Every 15 minutes</option>
                  <option value="1h">Hourly</option>
                  <option value="6h">Every 6 hours</option>
                  <option value="24h">Daily</option>
                </select>
              </Field>
            </div>
            <div className="mt-4 flex justify-end">
              <Button
                variant="primary"
                disabled={!def}
                onClick={() => {
                  if (name.trim().length < 2) return setErrors({ name: "Name is required" });
                  setErrors({});
                  setStep(1);
                }}
              >
                Continue
              </Button>
            </div>
          </Card>
        )}

        {/* Details stay mounted on the review step so secret inputs aren't lost (but are hidden). */}
        {def && step >= 1 && (
          <div className={step === 1 ? "" : "hidden"}>
            <Card className="p-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="flex items-center gap-2.5 text-[14px] font-semibold">
                  <ConnectorIcon id={def.id} /> {def.name} connection details
                </h2>
                <Badge tone="warn">Demo adapter</Badge>
              </div>
              <form
                className="mt-4 grid gap-3 sm:grid-cols-2"
                autoComplete="off"
                onSubmit={(e) => {
                  e.preventDefault();
                  runTest();
                }}
              >
                <div ref={secretsRef} className="contents">
                  {def.fields.map((f) => {
                    const id = `f-${f.key}`;
                    const err = errors[f.key];
                    const common = {
                      id,
                      name: f.key,
                      "aria-invalid": !!err,
                      "aria-describedby": err ? `${id}-error` : undefined,
                      placeholder: f.placeholder,
                      required: f.required,
                      onChange: () => setTest(null),
                    };
                    return (
                      <Field
                        key={f.key}
                        label={
                          <>
                            {f.secret && <Lock aria-hidden className="size-3 text-muted" />}
                            {f.label}
                          </>
                        }
                        htmlFor={id}
                        hint={f.help}
                        error={err}
                        optional={!f.required}
                        className={f.type === "textarea" ? "sm:col-span-2" : undefined}
                      >
                        {f.secret ? (
                          f.type === "textarea" ? (
                            <textarea {...common} data-secret autoComplete="off" spellCheck={false} className={cx(textareaClass, "font-mono text-[12px] [-webkit-text-security:disc]")} />
                          ) : (
                            <input {...common} data-secret type="password" autoComplete="new-password" spellCheck={false} className={inputClass} />
                          )
                        ) : f.type === "select" ? (
                          <select {...common} value={config[f.key] ?? ""} onChange={(e) => { setConfig({ ...config, [f.key]: e.target.value }); setTest(null); }} className={selectClass}>
                            <option value="" disabled>
                              Choose…
                            </option>
                            {f.options?.map((o) => (
                              <option key={o} value={o}>
                                {o === "\\t" ? "Tab" : o}
                              </option>
                            ))}
                          </select>
                        ) : f.type === "textarea" ? (
                          <textarea {...common} value={config[f.key] ?? ""} onChange={(e) => { setConfig({ ...config, [f.key]: e.target.value }); setTest(null); }} className={textareaClass} />
                        ) : (
                          <input
                            {...common}
                            type="text"
                            inputMode={f.type === "number" ? "numeric" : undefined}
                            value={config[f.key] ?? ""}
                            onChange={(e) => { setConfig({ ...config, [f.key]: e.target.value }); setTest(null); }}
                            className={inputClass}
                          />
                        )}
                      </Field>
                    );
                  })}
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-1 sm:col-span-2">
                  <Button onClick={() => setStep(0)}>
                    <ChevronLeft aria-hidden className="size-3.5" /> Back
                  </Button>
                  <Button type="submit" disabled={testing}>
                    {testing ? <Loader2 aria-hidden className="size-3.5 animate-spin" /> : <ShieldCheck aria-hidden className="size-3.5" />}
                    {testing ? "Testing…" : "Test connection"}
                  </Button>
                  <Button variant="primary" disabled={!test?.ok} onClick={goReview} title={!test?.ok ? "Run a successful test first" : undefined}>
                    Continue to review
                  </Button>
                </div>
              </form>
              <p className="mt-3 text-[12px] text-muted">
                Demo tip: values containing <code className="rounded bg-subtle px-1">fail</code>, a Stripe <code className="rounded bg-subtle px-1">sk_</code> key, or a secret shorter than 8 characters produce a realistic failure.
              </p>
            </Card>

            {test && (
              <div aria-live="polite" className={cx("mt-4 rounded-lg border p-4", test.ok ? "border-[#c4e6d5] bg-ok-soft/50" : "border-[#f6cbc6] bg-bad-soft/50")}>
                <div className="flex flex-wrap items-center gap-2 text-[13.5px] font-semibold">
                  {test.ok ? <CheckCircle2 aria-hidden className="size-4 text-ok" /> : <XCircle aria-hidden className="size-4 text-bad" />}
                  <span className={test.ok ? "text-ok" : "text-bad"}>{test.ok ? "Connection test passed" : "Connection test failed"}</span>
                  <span className="text-[12px] font-normal text-muted">· {test.latencyMs} ms (simulated)</span>
                </div>
                <p className="mt-1 text-[12.5px] text-ink-2">{test.message}</p>
                <ul className="mt-2 space-y-1">
                  {test.checks.map((c) => (
                    <li key={c.label} className="flex items-start gap-2 text-[12.5px]">
                      {c.ok ? <CheckCircle2 aria-hidden className="mt-0.5 size-3.5 text-ok" /> : <XCircle aria-hidden className="mt-0.5 size-3.5 text-bad" />}
                      <span>
                        <span className="text-ink-2">{c.label}</span>
                        <span className="sr-only">{c.ok ? " passed" : " failed"}</span>
                        {c.detail && <span className="block text-muted">{c.detail}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {def && step === 2 && (
          <Card className="p-4">
            <h2 className="text-[14px] font-semibold">Review & create</h2>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-[13px]">
              <dt className="text-muted">Source</dt>
              <dd>{def.name}</dd>
              <dt className="text-muted">Name</dt>
              <dd>{name}</dd>
              <dt className="text-muted">Environment</dt>
              <dd className="capitalize">{environment}</dd>
              <dt className="text-muted">Sync</dt>
              <dd>{syncFrequency}</dd>
              {def.fields
                .filter((f) => !f.secret && config[f.key])
                .map((f) => (
                  <div key={f.key} className="contents">
                    <dt className="text-muted">{f.label}</dt>
                    <dd className="font-mono text-[12px]">{config[f.key]}</dd>
                  </div>
                ))}
              <dt className="text-muted">Secrets</dt>
              <dd className="flex flex-wrap gap-1.5">
                {secretsEntered.map((s) => (
                  <Badge key={s} icon={<KeyRound aria-hidden className="size-3" />}>
                    {def.fields.find((f) => f.key === s)?.label ?? s} · ••••••
                  </Badge>
                ))}
              </dd>
            </dl>
            <div className="mt-4">
              <SimulatedNote>Demo connection — not connected to a real database. On create, the server re-tests the details, discards secret values, and generates deterministic demo data for this project if it has none.</SimulatedNote>
            </div>
            <div className="mt-4 flex gap-2">
              <Button onClick={() => setStep(1)}>
                <ChevronLeft aria-hidden className="size-3.5" /> Back
              </Button>
              <Button variant="primary" disabled={creating} onClick={create}>
                {creating ? "Creating…" : "Create connection"}
              </Button>
            </div>
          </Card>
        )}
      </div>

      <aside className="space-y-3">
        <Card className="p-4">
          <h3 className="flex items-center gap-2 text-[13px] font-semibold">
            <ShieldCheck aria-hidden className="size-4 text-accent" /> Least-privilege access
          </h3>
          <p className="mt-2 text-[12.5px] leading-relaxed text-ink-2">{def?.leastPrivilege ?? "Choose a source to see the minimum permissions DataOrbyt needs."}</p>
        </Card>
        <Card className="p-4">
          <h3 className="flex items-center gap-2 text-[13px] font-semibold">
            <Lock aria-hidden className="size-4 text-accent" /> How secrets are handled
          </h3>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-[12.5px] text-ink-2">
            <li>Secrets are sent only to the DataOrbyt server over the form submission — never stored in the browser, cookies or local storage.</li>
            <li>In this demo, the server uses them for a simulated test and then discards them. Only the names of provided fields are kept.</li>
            <li>A production deployment would write them to a secrets manager (e.g. GCP Secret Manager, AWS Secrets Manager or Vault) and store only a reference.</li>
          </ul>
        </Card>
      </aside>
    </div>
  );
}
