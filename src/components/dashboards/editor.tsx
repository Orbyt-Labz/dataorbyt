"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Copy, GripVertical, Loader2, Plus, Rocket, Save, Trash2, Undo2, X } from "lucide-react";
import type { ChartData } from "@/lib/domain/chart-data";
import type { ChartFilter, ChartSpec, DateRangeKey, MetricStatus, MetricUnit, Visualization } from "@/lib/domain/types";
import { DATE_RANGES } from "@/lib/domain/dates";
import { DIMENSIONS } from "@/lib/demo/facts";
import { labelize } from "@/lib/charts/options";
import { Badge, Button, Callout, DemoBadge, Field, inputClass, selectClass, StatusBadge, textareaClass } from "@/components/ui";
import { FormMessage, Modal } from "@/components/ui-client";
import { ChartCard, SIZE_CLASS } from "@/components/charts/chart-grid";
import { discardDraftAction, previewChartAction, publishAction, publishPreviewAction, saveDraftAction } from "@/app/actions/dashboards";
import { cx } from "@/lib/format";

interface MetricOption {
  key: string;
  name: string;
  unit: MetricUnit;
  dimensions: string[];
  status: MetricStatus;
}

interface Props {
  dashboard: { id: string; name: string; description: string; tags: string[]; status: "draft" | "published"; charts: ChartSpec[]; hasPublished: boolean; unpublished: boolean };
  projectName: string;
  currency: string;
  sampleData: boolean;
  metrics: MetricOption[];
  initialData: Record<string, ChartData>;
}

export const VISUALIZATIONS: { key: Visualization; label: string; max: number; min: number; groupable: boolean }[] = [
  { key: "kpi", label: "KPI tile", min: 1, max: 1, groupable: false },
  { key: "timeseries", label: "Time series", min: 1, max: 6, groupable: true },
  { key: "line", label: "Line", min: 1, max: 6, groupable: true },
  { key: "area", label: "Area", min: 1, max: 3, groupable: true },
  { key: "bar", label: "Bar", min: 1, max: 1, groupable: true },
  { key: "stacked_bar", label: "Stacked bar", min: 1, max: 1, groupable: true },
  { key: "funnel", label: "Funnel", min: 2, max: 6, groupable: false },
  { key: "cohort_heatmap", label: "Cohort heatmap", min: 1, max: 1, groupable: false },
  { key: "table", label: "Table", min: 1, max: 6, groupable: true },
  { key: "scatter", label: "Scatter (x vs y)", min: 2, max: 2, groupable: false },
  { key: "distribution", label: "Distribution", min: 1, max: 1, groupable: false },
];

const vizDef = (v: Visualization) => VISUALIZATIONS.find((x) => x.key === v)!;

export function validateChart(c: ChartSpec, metrics: MetricOption[]): Record<string, string> {
  const e: Record<string, string> = {};
  const def = vizDef(c.visualization);
  if (!c.title.trim()) e.title = "Title is required";
  if (c.metrics.length < def.min) e.metrics = c.visualization === "scatter" ? "Scatter needs exactly two metrics (x, y)" : `Choose at least ${def.min} metric${def.min > 1 ? "s" : ""}`;
  if (c.metrics.length > def.max) e.metrics = `${def.label} supports at most ${def.max} metric${def.max > 1 ? "s" : ""}`;
  if (c.visualization === "stacked_bar" && !c.groupBy) e.groupBy = "Stacked bars need a group-by dimension";
  const first = metrics.find((m) => m.key === c.metrics[0]);
  if (c.groupBy && first && !first.dimensions.includes(c.groupBy)) e.groupBy = `${first.name} can't be grouped by ${c.groupBy}`;
  if (c.filters.some((f) => f.values.length === 0)) e.filters = "Each filter needs at least one value";
  return e;
}

let counter = 0;
const newId = () => `c_${Date.now().toString(36)}${(counter++).toString(36)}`;

export function DashboardEditor({ dashboard, projectName, currency, sampleData, metrics, initialData }: Props) {
  const router = useRouter();
  const [name, setName] = useState(dashboard.name);
  const [description, setDescription] = useState(dashboard.description);
  const [tags, setTags] = useState(dashboard.tags.join(", "));
  const [charts, setCharts] = useState<ChartSpec[]>(dashboard.charts);
  const [selected, setSelected] = useState<string | null>(dashboard.charts[0]?.id ?? null);
  const [data, setData] = useState<Record<string, ChartData>>(initialData);
  const [range, setRange] = useState<DateRangeKey>("30d");
  const [dirty, setDirty] = useState(false);
  const [saving, startSave] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message?: string } | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof publishPreviewAction>> | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [loadingIds, setLoadingIds] = useState<string[]>([]);

  const sel = charts.find((c) => c.id === selected) ?? null;
  const errorsById = useMemo(() => Object.fromEntries(charts.map((c) => [c.id, validateChart(c, metrics)])), [charts, metrics]);
  const invalidCount = Object.values(errorsById).filter((e) => Object.keys(e).length).length;

  const refetch = useCallback(
    (spec: ChartSpec, r: DateRangeKey, delay = 300) => {
      clearTimeout(timers.current[spec.id]);
      timers.current[spec.id] = setTimeout(async () => {
        if (Object.keys(validateChart(spec, metrics)).length) return;
        setLoadingIds((l) => [...l, spec.id]);
        try {
          const d = await previewChartAction(dashboard.id, spec, r);
          setData((prev) => ({ ...prev, [spec.id]: d }));
        } catch {
          setData((prev) => ({ ...prev, [spec.id]: { kind: "error", message: "Preview failed" } }));
        } finally {
          setLoadingIds((l) => l.filter((x) => x !== spec.id));
        }
      }, delay);
    },
    [dashboard.id, metrics],
  );

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const mutate = (next: ChartSpec[]) => {
    setCharts(next);
    setDirty(true);
    setResult(null);
  };

  const update = (id: string, patch: Partial<ChartSpec>) => {
    const next = charts.map((c) => (c.id === id ? { ...c, ...patch } : c));
    mutate(next);
    const spec = next.find((c) => c.id === id)!;
    const dataAffecting = Object.keys(patch).some((k) => !["title", "size", "description"].includes(k));
    if (dataAffecting) refetch(spec, range);
  };

  const move = (id: string, dir: -1 | 1) => {
    const i = charts.findIndex((c) => c.id === id);
    const j = i + dir;
    if (j < 0 || j >= charts.length) return;
    const next = [...charts];
    [next[i], next[j]] = [next[j], next[i]];
    mutate(next);
  };

  const dropOn = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const next = charts.filter((c) => c.id !== dragId);
    const idx = next.findIndex((c) => c.id === targetId);
    next.splice(idx, 0, charts.find((c) => c.id === dragId)!);
    mutate(next);
    setDragId(null);
  };

  const add = () => {
    const first = metrics.find((m) => m.status === "approved") ?? metrics[0];
    const spec: ChartSpec = { id: newId(), title: first ? `${first.name} trend` : "New chart", visualization: "line", metrics: first ? [first.key] : [], grain: "day", dateRange: "inherit", filters: [], size: "md" };
    mutate([...charts, spec]);
    setSelected(spec.id);
    refetch(spec, range, 0);
  };

  const duplicate = (id: string) => {
    const src = charts.find((c) => c.id === id)!;
    const copy = { ...structuredClone(src), id: newId(), title: `${src.title} (copy)` };
    const i = charts.findIndex((c) => c.id === id);
    mutate([...charts.slice(0, i + 1), copy, ...charts.slice(i + 1)]);
    setData((p) => ({ ...p, [copy.id]: p[id] }));
    setSelected(copy.id);
  };

  const remove = (id: string) => {
    const i = charts.findIndex((c) => c.id === id);
    const next = charts.filter((c) => c.id !== id);
    mutate(next);
    setSelected(next[Math.min(i, next.length - 1)]?.id ?? null);
  };

  const changeRange = (r: DateRangeKey) => {
    setRange(r);
    charts.forEach((c) => refetch(c, r, 0));
  };

  const payload = () => ({
    name,
    description,
    tags: tags
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean),
    charts,
  });

  const save = () =>
    new Promise<boolean>((resolve) =>
      startSave(async () => {
        const r = await saveDraftAction(dashboard.id, payload());
        setResult(r);
        if (r.ok) setDirty(false);
        resolve(r.ok);
      }),
    );

  const openPublish = async () => {
    if (invalidCount) {
      setResult({ ok: false, message: `Fix ${invalidCount} chart${invalidCount > 1 ? "s" : ""} with errors before publishing.` });
      return;
    }
    if (dirty && !(await save())) return;
    const p = await publishPreviewAction(dashboard.id);
    setPreview(p);
    setPublishOpen(true);
  };

  const confirmPublish = () =>
    startSave(async () => {
      if (!preview?.ok || !preview.data) return;
      const r = await publishAction(dashboard.id, preview.data.confirmationCode);
      if (r.ok) {
        setPublishOpen(false);
        router.push(`/dashboards/${dashboard.id}`);
      } else setResult(r);
    });

  const cancel = () => {
    if (dirty && !window.confirm("Discard unsaved changes and leave the editor?")) return;
    router.push(`/dashboards/${dashboard.id}`);
  };

  const discardDraft = () => {
    if (!window.confirm("Revert the draft to the last published version? Unpublished edits will be lost.")) return;
    startSave(async () => {
      const r = await discardDraftAction(dashboard.id);
      setResult(r);
    });
  };

  return (
    <div>
      <div className="sticky top-14 z-20 -mx-4 mb-4 flex flex-wrap items-center gap-2 border-b border-line bg-canvas/95 px-4 py-2.5 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="mr-auto min-w-0">
          <div className="flex items-center gap-2 text-[12px] text-muted">
            <Link href="/dashboards" className="hover:text-ink-2">
              Dashboards
            </Link>
            <span aria-hidden>/</span>
            <span>{projectName}</span>
            {sampleData && <DemoBadge />}
          </div>
          <div className="flex items-center gap-2">
            <h1 className="truncate text-[17px] font-semibold text-ink">Editing: {name || "Untitled"}</h1>
            <StatusBadge status={dashboard.status} />
            {dirty ? <Badge tone="warn">Unsaved changes</Badge> : dashboard.unpublished ? <Badge tone="info">Draft differs from published</Badge> : null}
          </div>
        </div>
        <label className="flex items-center gap-1.5 text-[12px] text-muted">
          Preview range
          <select value={range} onChange={(e) => changeRange(e.target.value as DateRangeKey)} className={selectClass + " h-8 w-36"}>
            {DATE_RANGES.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <Button onClick={cancel}>
          <X className="size-3.5" /> Cancel
        </Button>
        {dashboard.hasPublished && (
          <Button onClick={discardDraft} disabled={saving} title="Revert the draft to the published version">
            <Undo2 className="size-3.5" /> Discard draft
          </Button>
        )}
        <Button onClick={() => save()} disabled={saving || !dirty}>
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />} Save draft
        </Button>
        <Button variant="primary" onClick={openPublish} disabled={saving}>
          <Rocket className="size-3.5" /> Publish…
        </Button>
      </div>

      {result && <div className="mb-3">{result.ok ? <Callout tone="ok" title={result.message ?? "Saved"} /> : <Callout tone="bad" title="Couldn't save">{result.message}</Callout>}</div>}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-3">
          <details className="rounded-lg border border-line bg-surface shadow-card" open={!dashboard.charts.length}>
            <summary className="cursor-pointer px-4 py-2.5 text-[13px] font-medium text-ink-2">Dashboard details</summary>
            <div className="grid grid-cols-1 gap-3 border-t border-line p-4 md:grid-cols-3">
              <Field label="Name" htmlFor="d-name" error={!name.trim() ? "Name is required" : undefined}>
                <input id="d-name" value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }} className={inputClass} aria-invalid={!name.trim()} />
              </Field>
              <Field label="Tags" htmlFor="d-tags" hint="Comma separated">
                <input id="d-tags" value={tags} onChange={(e) => { setTags(e.target.value); setDirty(true); }} className={inputClass} />
              </Field>
              <Field label="Description" htmlFor="d-desc">
                <input id="d-desc" value={description} onChange={(e) => { setDescription(e.target.value); setDirty(true); }} className={inputClass} maxLength={280} />
              </Field>
            </div>
          </details>

          {charts.length === 0 ? (
            <div className="flex flex-col items-center rounded-lg border border-dashed border-line-strong bg-surface/60 py-12 text-center">
              <p className="text-[14px] font-semibold text-ink">This dashboard has no charts</p>
              <p className="mt-1 text-[13px] text-muted">Add a chart, then configure its metric and visualization in the side panel.</p>
              <Button variant="primary" className="mt-4" onClick={add}>
                <Plus className="size-3.5" /> Add chart
              </Button>
            </div>
          ) : (
            <ul className="grid grid-flow-row-dense grid-cols-12 gap-3" aria-label="Charts (drag or use arrows to reorder)">
              {charts.map((c, i) => {
                const errs = errorsById[c.id];
                const hasErr = Object.keys(errs).length > 0;
                return (
                  <li
                    key={c.id}
                    className={cx(SIZE_CLASS[c.size], "group relative", dragId === c.id && "opacity-50")}
                    draggable
                    onDragStart={(e) => {
                      setDragId(c.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragOver={(e) => {
                      if (dragId) e.preventDefault();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      dropOn(c.id);
                    }}
                    onDragEnd={() => setDragId(null)}
                  >
                    <button
                      type="button"
                      onClick={() => setSelected(c.id)}
                      aria-pressed={selected === c.id}
                      className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-10 focus:rounded-md focus:bg-accent focus:px-2 focus:py-1 focus:text-[12px] focus:text-white"
                    >
                      Configure {c.title}
                    </button>
                    <div
                      className={cx(
                        "absolute -top-3 right-3 z-10 items-center gap-0.5 rounded-md border border-line bg-surface px-1 shadow-card",
                        selected === c.id ? "flex" : "hidden group-focus-within:flex group-hover:flex",
                      )}
                      role="toolbar"
                      aria-label={`${c.title} actions`}
                    >
                      <span className="cursor-grab p-1 text-faint" title="Drag to reorder" aria-hidden>
                        <GripVertical className="size-3.5" />
                      </span>
                      <IconBtn label={`Move ${c.title} earlier`} onClick={() => move(c.id, -1)} disabled={i === 0}>
                        <ArrowUp className="size-3.5" />
                      </IconBtn>
                      <IconBtn label={`Move ${c.title} later`} onClick={() => move(c.id, 1)} disabled={i === charts.length - 1}>
                        <ArrowDown className="size-3.5" />
                      </IconBtn>
                      <IconBtn label={`Duplicate ${c.title}`} onClick={() => duplicate(c.id)}>
                        <Copy className="size-3.5" />
                      </IconBtn>
                      <IconBtn label={`Delete ${c.title}`} onClick={() => remove(c.id)}>
                        <Trash2 className="size-3.5" />
                      </IconBtn>
                    </div>
                    <ChartCard
                      spec={{ ...c, size: "full" }}
                      data={hasErr ? { kind: "error", message: Object.values(errs)[0] } : loadingIds.includes(c.id) ? undefined : data[c.id]}
                      currency={currency}
                      selected={selected === c.id}
                      onSelect={() => setSelected(c.id)}
                    />
                  </li>
                );
              })}
              <li className="col-span-12 sm:col-span-6 xl:col-span-3">
                <button type="button" onClick={add} className="flex h-full min-h-[120px] w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-line-strong text-[13px] text-muted hover:border-accent hover:text-accent">
                  <Plus aria-hidden className="size-4" /> Add chart
                </button>
              </li>
            </ul>
          )}
        </div>

        <aside className="xl:sticky xl:top-32 xl:self-start" aria-label="Chart configuration">
          {sel ? (
            <ChartPanel key={sel.id} spec={sel} metrics={metrics} errors={errorsById[sel.id]} onChange={(patch) => update(sel.id, patch)} />
          ) : (
            <div className="rounded-lg border border-line bg-surface p-4 text-[13px] text-muted shadow-card">Select a chart to configure its metric, visualization, grouping and filters.</div>
          )}
        </aside>
      </div>

      <Modal
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        title="Review & publish"
        description="Publishing replaces what viewers see. Review the changes below."
        footer={
          <>
            <Button onClick={() => setPublishOpen(false)}>Back to editor</Button>
            <Button variant="primary" onClick={confirmPublish} disabled={saving || !preview?.ok}>
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Rocket className="size-3.5" />} Confirm & publish
            </Button>
          </>
        }
      >
        {preview && !preview.ok && <FormMessage state={preview} />}
        {preview?.ok && preview.data && (
          <div className="space-y-3 text-[13px]">
            <p className="text-ink-2">
              <strong>{preview.data.dashboard.name}</strong> · {preview.data.dashboard.chartCount} charts · visibility: {preview.data.dashboard.visibility}
              {preview.data.firstPublish && <span className="ml-1 text-accent">(first publish)</span>}
            </p>
            <DiffList label="Added" tone="ok" items={preview.data.added} />
            <DiffList label="Changed" tone="info" items={preview.data.changed} />
            <DiffList label="Removed" tone="bad" items={preview.data.removed} />
            {preview.data.reordered && <p className="text-muted">Charts were reordered.</p>}
            {!preview.data.firstPublish && preview.data.added.length + preview.data.changed.length + preview.data.removed.length === 0 && !preview.data.reordered && <p className="text-muted">No chart changes since the last publish.</p>}
            <p className="rounded-md bg-subtle px-3 py-2 font-mono text-[11.5px] text-muted">Confirmation code {preview.data.confirmationCode} — bound to this exact draft.</p>
          </div>
        )}
      </Modal>
    </div>
  );
}

function DiffList({ label, items, tone }: { label: string; items: string[]; tone: "ok" | "info" | "bad" }) {
  if (!items.length) return null;
  return (
    <div>
      <div className="mb-1 text-[12px] font-medium text-muted">
        {label} ({items.length})
      </div>
      <ul className="flex flex-wrap gap-1">
        {items.map((t, i) => (
          <li key={i}>
            <Badge tone={tone}>{t}</Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}

function IconBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} className="rounded p-1 text-muted hover:bg-hover hover:text-ink disabled:opacity-30">
      {children}
    </button>
  );
}

function ChartPanel({ spec, metrics, errors, onChange }: { spec: ChartSpec; metrics: MetricOption[]; errors: Record<string, string>; onChange: (p: Partial<ChartSpec>) => void }) {
  const def = vizDef(spec.visualization);
  const first = metrics.find((m) => m.key === spec.metrics[0]);
  const dims = first?.dimensions ?? [];
  const single = def.max === 1;
  const [filterDim, setFilterDim] = useState("");

  const setViz = (v: Visualization) => {
    const d = vizDef(v);
    let ms = spec.metrics.slice(0, d.max);
    if (v === "funnel" && ms.length < 2) ms = ["visitors", "signups", "activated_users", "trials_started", "paid_conversions"].filter((k) => metrics.some((m) => m.key === k));
    if (v === "scatter" && ms.length < 2) ms = [ms[0] ?? "visitors", metrics.find((m) => m.key !== ms[0])?.key ?? ""].filter(Boolean);
    const groupBy = d.groupable ? (v === "stacked_bar" ? (spec.groupBy ?? dims[0]) : spec.groupBy) : undefined;
    onChange({ visualization: v, metrics: ms, groupBy, ...(v === "kpi" ? { size: "sm" as const } : {}) });
  };

  const toggleMetric = (key: string) => {
    if (single) return onChange({ metrics: [key], groupBy: metrics.find((m) => m.key === key)?.dimensions.includes(spec.groupBy ?? "") ? spec.groupBy : undefined });
    onChange({ metrics: spec.metrics.includes(key) ? spec.metrics.filter((k) => k !== key) : [...spec.metrics, key] });
  };

  const setFilter = (f: ChartFilter[]) => onChange({ filters: f });

  return (
    <div className="space-y-4 rounded-lg border border-line bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between">
        <h2 className="text-[13.5px] font-semibold">Chart settings</h2>
        <span className="text-[11px] text-faint">Live preview</span>
      </div>
      <Field label="Title" htmlFor="c-title" error={errors.title}>
        <input id="c-title" value={spec.title} onChange={(e) => onChange({ title: e.target.value })} className={inputClass} aria-invalid={!!errors.title} maxLength={80} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Visualization" htmlFor="c-viz">
          <select id="c-viz" value={spec.visualization} onChange={(e) => setViz(e.target.value as Visualization)} className={selectClass}>
            {VISUALIZATIONS.map((v) => (
              <option key={v.key} value={v.key}>
                {v.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Size" htmlFor="c-size">
          <select id="c-size" value={spec.size} onChange={(e) => onChange({ size: e.target.value as ChartSpec["size"] })} className={selectClass}>
            <option value="sm">Small (¼)</option>
            <option value="md">Medium (⅓)</option>
            <option value="lg">Large (⅔)</option>
            <option value="full">Full width</option>
          </select>
        </Field>
      </div>

      <fieldset aria-describedby="metrics-help">
        <legend className="mb-1 text-[12.5px] font-medium text-ink-2">
          {spec.visualization === "scatter" ? "Metrics (x, then y)" : spec.visualization === "funnel" ? "Funnel steps (in order)" : single ? "Metric" : "Metrics"}
        </legend>
        <div className="max-h-52 space-y-0.5 overflow-y-auto rounded-md border border-line p-1">
          {metrics.map((m) => {
            const idx = spec.metrics.indexOf(m.key);
            const on = idx !== -1;
            return (
              <label key={m.key} className={cx("flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-[12.5px]", on ? "bg-accent-soft text-ink" : "text-ink-2 hover:bg-hover")}>
                <input type={single ? "radio" : "checkbox"} name="c-metric" checked={on} onChange={() => toggleMetric(m.key)} className="accent-[#4b46e0]" />
                <span className="flex-1 truncate">{m.name}</span>
                {m.status !== "approved" && <span className="text-[10.5px] text-warn">{m.status}</span>}
                {on && !single && <span className="rounded bg-accent px-1 text-[10px] font-semibold text-white">{idx + 1}</span>}
              </label>
            );
          })}
        </div>
        <p id="metrics-help" className={cx("mt-1 text-[11.5px]", errors.metrics ? "text-bad" : "text-muted")}>
          {errors.metrics ?? "Only governed catalog metrics can be charted."}
        </p>
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Date range" htmlFor="c-range">
          <select id="c-range" value={spec.dateRange} onChange={(e) => onChange({ dateRange: e.target.value as ChartSpec["dateRange"] })} className={selectClass}>
            <option value="inherit">Dashboard range</option>
            {DATE_RANGES.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Grain" htmlFor="c-grain">
          <select id="c-grain" value={spec.grain} onChange={(e) => onChange({ grain: e.target.value as ChartSpec["grain"] })} className={selectClass} disabled={["kpi", "funnel", "cohort_heatmap", "scatter", "distribution"].includes(spec.visualization)}>
            <option value="day">Day</option>
            <option value="week">Week</option>
            <option value="month">Month</option>
          </select>
        </Field>
      </div>

      {def.groupable && (
        <Field label="Group by" htmlFor="c-group" error={errors.groupBy} hint={dims.length ? undefined : "This metric has no dimensions."}>
          <select id="c-group" value={spec.groupBy ?? ""} onChange={(e) => onChange({ groupBy: e.target.value || undefined })} className={selectClass} aria-invalid={!!errors.groupBy}>
            <option value="">No grouping</option>
            {dims.map((d) => (
              <option key={d} value={d}>
                {DIMENSIONS[d]?.label ?? d}
              </option>
            ))}
          </select>
        </Field>
      )}

      <fieldset>
        <legend className="mb-1 text-[12.5px] font-medium text-ink-2">Filters</legend>
        <div className="space-y-2">
          {spec.filters.map((f) => (
            <div key={f.dimension} className="rounded-md border border-line p-2">
              <div className="mb-1 flex items-center justify-between text-[12px] font-medium text-ink-2">
                {DIMENSIONS[f.dimension]?.label ?? f.dimension}
                <button type="button" aria-label={`Remove ${f.dimension} filter`} onClick={() => setFilter(spec.filters.filter((x) => x.dimension !== f.dimension))} className="rounded p-0.5 text-muted hover:bg-hover">
                  <X className="size-3" />
                </button>
              </div>
              <div className="flex flex-wrap gap-1">
                {(DIMENSIONS[f.dimension]?.values ?? []).map((v) => {
                  const on = f.values.includes(v.key);
                  return (
                    <button
                      key={v.key}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setFilter(spec.filters.map((x) => (x.dimension === f.dimension ? { ...x, values: on ? x.values.filter((y) => y !== v.key) : [...x.values, v.key] } : x)))}
                      className={cx("h-6 rounded-full border px-2 text-[11.5px]", on ? "border-accent bg-accent text-white" : "border-line text-ink-2 hover:border-line-strong")}
                    >
                      {labelize(v.key)}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {dims.filter((d) => !spec.filters.some((f) => f.dimension === d)).length > 0 && (
            <div className="flex gap-2">
              <select aria-label="Add filter dimension" value={filterDim} onChange={(e) => setFilterDim(e.target.value)} className={selectClass + " h-8"}>
                <option value="">Add filter…</option>
                {dims
                  .filter((d) => !spec.filters.some((f) => f.dimension === d))
                  .map((d) => (
                    <option key={d} value={d}>
                      {DIMENSIONS[d]?.label ?? d}
                    </option>
                  ))}
              </select>
              <Button
                size="sm"
                disabled={!filterDim}
                onClick={() => {
                  setFilter([...spec.filters, { dimension: filterDim, values: [DIMENSIONS[filterDim].values[0].key] }]);
                  setFilterDim("");
                }}
              >
                Add
              </Button>
            </div>
          )}
          {errors.filters && <p className="text-[12px] text-bad">{errors.filters}</p>}
        </div>
      </fieldset>
      <Field label="Description" htmlFor="c-desc" optional>
        <textarea id="c-desc" value={spec.description ?? ""} onChange={(e) => onChange({ description: e.target.value || undefined })} className={textareaClass + " min-h-14"} maxLength={200} />
      </Field>
    </div>
  );
}
