"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Download, FileJson, Link2, Loader2, Lock, Pencil, Plus, RefreshCw, Share2, Users, X } from "lucide-react";
import type { ChartData } from "@/lib/domain/chart-data";
import type { ChartFilter, ChartSpec, DashboardVisibility } from "@/lib/domain/types";
import { buttonClass, Button, Callout, selectClass, SimulatedNote } from "@/components/ui";
import { CopyButton, FormMessage, Modal } from "@/components/ui-client";
import { setVisibilityAction } from "@/app/actions/dashboards";
import { labelize } from "@/lib/charts/options";
import { cx } from "@/lib/format";
import { dashboardCsv, download } from "./export";

/* ------------------------------------------------------------------ */
/* Filter chips                                                         */
/* ------------------------------------------------------------------ */

export function encodeFilters(filters: ChartFilter[]) {
  return filters.map((f) => `${f.dimension}:${f.values.join(",")}`);
}

export function FilterChips({ active, available }: { active: ChartFilter[]; available: { key: string; label: string; values: string[] }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [dim, setDim] = useState("");
  const [vals, setVals] = useState<string[]>([]);

  const apply = (filters: ChartFilter[]) => {
    const next = new URLSearchParams(params.toString());
    next.delete("f");
    for (const f of encodeFilters(filters)) next.append("f", f);
    start(() => router.push(`${pathname}?${next.toString()}`, { scroll: false }));
  };
  const unused = available.filter((a) => !active.some((f) => f.dimension === a.key));
  const dimDef = available.find((a) => a.key === dim);

  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Dashboard filters">
      {active.map((f) => (
        <span key={f.dimension} className="inline-flex h-7 items-center gap-1 rounded-full border border-accent-line bg-accent-soft pr-1 pl-2.5 text-[12px] text-accent">
          <span className="font-medium">{available.find((a) => a.key === f.dimension)?.label ?? f.dimension}:</span>
          {f.values.map(labelize).join(", ")}
          <button type="button" aria-label={`Remove ${f.dimension} filter`} onClick={() => apply(active.filter((x) => x.dimension !== f.dimension))} className="ml-0.5 rounded-full p-0.5 hover:bg-accent/10">
            <X className="size-3" />
          </button>
        </span>
      ))}
      {unused.length > 0 && !adding && (
        <button type="button" onClick={() => setAdding(true)} className="inline-flex h-7 items-center gap-1 rounded-full border border-dashed border-line-strong px-2.5 text-[12px] text-muted hover:border-accent hover:text-accent">
          <Plus aria-hidden className="size-3" /> Add filter
        </button>
      )}
      {adding && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-line bg-surface p-1.5 shadow-card">
          <select aria-label="Filter dimension" value={dim} onChange={(e) => { setDim(e.target.value); setVals([]); }} className={selectClass + " h-7 w-36 text-[12px]"}>
            <option value="">Dimension…</option>
            {unused.map((a) => (
              <option key={a.key} value={a.key}>
                {a.label}
              </option>
            ))}
          </select>
          {dimDef && (
            <div role="group" aria-label={`${dimDef.label} values`} className="flex flex-wrap gap-1">
              {dimDef.values.map((v) => {
                const on = vals.includes(v);
                return (
                  <button key={v} type="button" aria-pressed={on} onClick={() => setVals((p) => (on ? p.filter((x) => x !== v) : [...p, v]))} className={cx("h-6 rounded-full border px-2 text-[11.5px]", on ? "border-accent bg-accent text-white" : "border-line text-ink-2 hover:border-line-strong")}>
                    {labelize(v)}
                  </button>
                );
              })}
            </div>
          )}
          <Button size="sm" variant="primary" disabled={!dim || vals.length === 0} onClick={() => { apply([...active, { dimension: dim, values: vals }]); setAdding(false); setDim(""); setVals([]); }}>
            Apply
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setDim(""); setVals([]); }}>
            Cancel
          </Button>
        </div>
      )}
      {pending && <Loader2 aria-label="Updating" className="size-3.5 animate-spin text-muted" />}
      {active.length > 0 && <span className="text-[11.5px] text-faint">Filters apply to charts whose metrics support the dimension.</span>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Header actions                                                       */
/* ------------------------------------------------------------------ */

const MODES: { key: DashboardVisibility; label: string; desc: string; icon: typeof Lock }[] = [
  { key: "private", label: "Private", desc: "Only you and workspace admins.", icon: Lock },
  { key: "organization", label: "Organization", desc: "Everyone in the Demo Workspace.", icon: Users },
  { key: "link", label: "Anyone with the link", desc: "Simulated — this demo has no public authentication, so the link only works for signed-in demo users on this machine.", icon: Link2 },
];

export function DashboardActions({
  id,
  name,
  visibility,
  charts,
  data,
  openShare,
  canEdit = true,
}: {
  id: string;
  name: string;
  visibility: DashboardVisibility;
  charts: ChartSpec[];
  data: Record<string, ChartData>;
  openShare: boolean;
  canEdit?: boolean;
}) {
  const router = useRouter();
  const [shareOpen, setShareOpen] = useState(openShare);
  const [exportOpen, setExportOpen] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);

  return (
    <>
      <Button
        onClick={() =>
          startRefresh(() => {
            router.refresh();
            setRefreshedAt(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
          })
        }
        title="Re-render charts. Unchanged queries are served from the 15-minute result cache; nothing re-scans until the cache expires or new data loads."
      >
        <RefreshCw className={cx("size-3.5", refreshing && "animate-spin")} /> {refreshing ? "Refreshing…" : "Refresh"}
      </Button>
      <Button onClick={() => setExportOpen(true)}>
        <Download className="size-3.5" /> Export
      </Button>
      <Button onClick={() => setShareOpen(true)}>
        <Share2 className="size-3.5" /> Share
      </Button>
      {canEdit && (
        <Link href={`/dashboards/${id}/edit`} className={buttonClass("primary")}>
          <Pencil className="size-3.5" /> Edit
        </Link>
      )}
      {refreshedAt && <span className="sr-only" role="status">Refreshed at {refreshedAt}</span>}

      <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} id={id} name={name} visibility={visibility} />

      <Modal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        title="Export dashboard"
        description="Exports are generated in your browser from the data currently on screen."
        footer={<Button onClick={() => setExportOpen(false)}>Close</Button>}
      >
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button type="button" onClick={() => download(`${slug(name)}.csv`, dashboardCsv(charts, data), "text/csv")} className="flex items-start gap-3 rounded-lg border border-line p-3 text-left hover:border-accent">
            <Download aria-hidden className="mt-0.5 size-4 text-accent" />
            <span>
              <span className="block text-[13px] font-medium">Data (CSV)</span>
              <span className="block text-[12px] text-muted">One section per chart, with the current date range and filters.</span>
            </span>
          </button>
          <button type="button" onClick={() => download(`${slug(name)}.dashboard.json`, JSON.stringify({ name, charts }, null, 2), "application/json")} className="flex items-start gap-3 rounded-lg border border-line p-3 text-left hover:border-accent">
            <FileJson aria-hidden className="mt-0.5 size-4 text-accent" />
            <span>
              <span className="block text-[13px] font-medium">Chart specs (JSON)</span>
              <span className="block text-[12px] text-muted">The typed ChartSpec definitions — no data, no credentials.</span>
            </span>
          </button>
        </div>
        <p className="mt-3 text-[12px] text-muted">PDF/PNG export and scheduled email reports are not implemented in this demo.</p>
      </Modal>
    </>
  );
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function ShareModal({ open, onClose, id, name, visibility }: { open: boolean; onClose: () => void; id: string; name: string; visibility: DashboardVisibility }) {
  const [mode, setMode] = useState<DashboardVisibility>(visibility);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok?: boolean; message?: string } | null>(null);
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- origin is only known in the browser
    setOrigin(window.location.origin);
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync with server value when reopened
    if (open) setMode(visibility);
  }, [open, visibility]);
  const url = `${origin}/dashboards/${id}`;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Share “${name}”`}
      description="Choose who can view the published version of this dashboard."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={pending || mode === visibility}
            onClick={() =>
              start(async () => {
                const r = await setVisibilityAction(id, mode);
                setResult(r);
              })
            }
          >
            {pending ? "Saving…" : "Save sharing"}
          </Button>
        </>
      }
    >
      <fieldset className="space-y-2">
        <legend className="sr-only">Visibility</legend>
        {MODES.map((m) => (
          <label key={m.key} className={cx("flex cursor-pointer items-start gap-3 rounded-lg border p-3", mode === m.key ? "border-accent bg-accent-soft/40" : "border-line hover:border-line-strong")}>
            <input type="radio" name="visibility" value={m.key} checked={mode === m.key} onChange={() => setMode(m.key)} className="mt-1 accent-[#4b46e0]" />
            <m.icon aria-hidden className="mt-0.5 size-4 text-muted" />
            <span>
              <span className="block text-[13px] font-medium text-ink">
                {m.label} {m.key === "link" && <span className="ml-1 rounded bg-warn-soft px-1.5 py-px text-[10.5px] font-medium text-warn">Simulated</span>}
              </span>
              <span className="block text-[12px] text-muted">{m.desc}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="mt-4">
        <div className="mb-1 text-[12.5px] font-medium text-ink-2">Dashboard link (local demo URL)</div>
        <div className="flex gap-2">
          <input readOnly value={url} aria-label="Dashboard link" className="h-8.5 flex-1 rounded-md border border-line bg-subtle px-2.5 font-mono text-[12px] text-ink-2" onFocus={(e) => e.currentTarget.select()} />
          <CopyButton value={url} label="Copy link" size="md" />
        </div>
      </div>
      <div className="mt-3">
        <SimulatedNote>Link sharing is simulated until DataOrbyt is deployed with real authentication. This URL points at your local dev server and is not publicly reachable.</SimulatedNote>
      </div>
      {result && (
        <div className="mt-3">
          {result.ok ? <Callout tone="ok" title={result.message ?? "Saved"} /> : <FormMessage state={result} />}
        </div>
      )}
    </Modal>
  );
}
