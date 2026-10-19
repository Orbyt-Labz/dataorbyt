"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { BookOpen, FlaskConical, Hammer, Loader2, Play } from "lucide-react";
import type { DbtLayer, DbtRun } from "@/lib/domain/types";
import { Badge, Button, Card, CardHeader, StatusBadge } from "@/components/ui";
import { FormMessage } from "@/components/ui-client";
import { runDbtAction } from "@/app/actions/dbt";
import { cx, relativeTime } from "@/lib/format";

interface ModelRow {
  name: string;
  layer: DbtLayer;
  materialization: string;
  state: string;
  description: string;
  passed: number;
  failed: number;
  total: number;
  lastRunAt?: string;
}

const LAYERS: { key: DbtLayer; label: string; hint: string }[] = [
  { key: "staging", label: "Staging", hint: "1:1 with sources — renamed, typed, cleaned" },
  { key: "intermediate", label: "Intermediate", hint: "Reusable joins and business logic" },
  { key: "marts", label: "Marts", hint: "Pre-aggregated tables dashboards query" },
];

export function DbtWorkspace({ projectId, models, runs }: { projectId: string; models: ModelRow[]; runs: (DbtRun & { startedLabel: string })[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; message?: string } | null>(null);
  const [openRun, setOpenRun] = useState<string | null>(runs[0]?.id ?? null);

  const run = (m: "run" | "test" | "build") => {
    setMode(m);
    start(async () => {
      const r = await runDbtAction(projectId, selected, m);
      setMsg(r.ok ? { ok: r.data?.status !== "error", message: `Simulated dbt ${m} finished: ${r.data?.status}.` } : r);
      if (r.ok && r.data) setOpenRun(r.data.id);
    });
  };

  const toggle = (name: string) => setSelected((s) => (s.includes(name) ? s.filter((x) => x !== name) : [...s, name]));
  const scope = selected.length ? `${selected.length} selected` : "all models";

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
      <Card className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
          <div className="text-[13.5px] font-semibold">
            Models <span className="font-normal text-muted">· {models.length}</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[12px] text-muted">Scope: {scope}</span>
            <Button size="sm" disabled={pending} onClick={() => run("run")}>
              {pending && mode === "run" ? <Loader2 aria-hidden className="size-3.5 animate-spin" /> : <Play aria-hidden className="size-3.5" />} Run
            </Button>
            <Button size="sm" disabled={pending} onClick={() => run("test")}>
              {pending && mode === "test" ? <Loader2 aria-hidden className="size-3.5 animate-spin" /> : <FlaskConical aria-hidden className="size-3.5" />} Test
            </Button>
            <Button size="sm" variant="primary" disabled={pending} onClick={() => run("build")}>
              {pending && mode === "build" ? <Loader2 aria-hidden className="size-3.5 animate-spin" /> : <Hammer aria-hidden className="size-3.5" />} Build
            </Button>
          </div>
        </div>
        {msg && (
          <div className="px-4 pt-2">
            <FormMessage state={msg} />
          </div>
        )}
        {LAYERS.map((layer) => {
          const rows = models.filter((m) => m.layer === layer.key);
          if (!rows.length) return null;
          const allSel = rows.every((r) => selected.includes(r.name));
          return (
            <section key={layer.key} aria-label={`${layer.label} models`}>
              <div className="flex items-center gap-2 bg-subtle/60 px-4 py-1.5">
                <input
                  type="checkbox"
                  aria-label={`Select all ${layer.label} models`}
                  checked={allSel}
                  onChange={() => setSelected((s) => (allSel ? s.filter((x) => !rows.some((r) => r.name === x)) : [...new Set([...s, ...rows.map((r) => r.name)])]))}
                  className="size-3.5 accent-[var(--color-accent)]"
                />
                <span className="text-[11.5px] font-semibold tracking-wide text-ink-2 uppercase">{layer.label}</span>
                <span className="text-[11.5px] text-muted">· {layer.hint}</span>
              </div>
              <ul className="divide-y divide-line">
                {rows.map((m) => (
                  <li key={m.name} className={cx("flex items-center gap-3 px-4 py-2", selected.includes(m.name) && "bg-accent-soft/30")}>
                    <input type="checkbox" aria-label={`Select ${m.name}`} checked={selected.includes(m.name)} onChange={() => toggle(m.name)} className="size-3.5 accent-[var(--color-accent)]" />
                    <div className="min-w-0 flex-1">
                      <Link href={`/dbt/models/${m.name}`} className="font-mono text-[12.5px] font-medium text-ink hover:text-accent">
                        {m.name}
                      </Link>
                      <p className="truncate text-[11.5px] text-muted">{m.description}</p>
                    </div>
                    <Badge className="hidden sm:inline-flex">{m.materialization}</Badge>
                    <span className="w-24 text-right text-[11.5px] tabular text-muted">
                      {m.total === 0 ? "no tests" : (
                        <>
                          <span className="text-ok">{m.passed} pass</span>
                          {m.failed > 0 && <span className="text-bad"> · {m.failed} fail</span>}
                        </>
                      )}
                    </span>
                    <span className="w-24 text-right">
                      <StatusBadge status={m.state} />
                    </span>
                    <Link href={`/dbt/models/${m.name}`} aria-label={`View docs for ${m.name}`} className="hidden rounded p-1 text-muted hover:bg-hover hover:text-ink md:block">
                      <BookOpen className="size-3.5" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </Card>

      <Card className="h-fit min-w-0">
        <CardHeader title="Run history" description="Simulated runs with timestamped logs" />
        {runs.length === 0 ? (
          <p className="px-4 pb-6 text-center text-[13px] text-muted">No runs yet. Use Build to run models and tests.</p>
        ) : (
          <ul className="divide-y divide-line border-t border-line">
            {runs.slice(0, 10).map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => setOpenRun(openRun === r.id ? null : r.id)} aria-expanded={openRun === r.id} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-subtle/50">
                  <StatusBadge status={r.status} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-[12px] text-ink">{r.command}</span>
                    <span className="block text-[11.5px] text-muted">
                      {r.startedLabel} · {r.durationSec}s · {r.triggeredBy} · {relativeTime(r.startedAt)}
                    </span>
                  </span>
                  <Badge tone="warn">Simulated</Badge>
                </button>
                {openRun === r.id && (
                  <pre className="mx-4 mb-3 max-h-72 overflow-auto rounded-md bg-[#0f1526] p-3 font-mono text-[11.5px] leading-relaxed text-[#d7def0]">
                    {r.log.map((l, i) => (
                      <div key={i} className={l.level === "error" ? "text-[#ff9b8f]" : l.level === "warn" ? "text-[#f6c87a]" : undefined}>
                        <span className="text-[#7e8aa8]">{l.at.slice(11, 19)}</span> {l.message}
                      </div>
                    ))}
                  </pre>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
