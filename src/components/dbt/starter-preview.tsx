"use client";

import { useMemo, useState, useTransition } from "react";
import { FileCode2, FileCog, FileText, Folder } from "lucide-react";
import { Button, Callout, Card, CardHeader, SimulatedNote } from "@/components/ui";
import { CodeBlock, Modal } from "@/components/ui-client";
import { applyStarterAction } from "@/app/actions/dbt";
import { cx } from "@/lib/format";

interface StarterFile {
  path: string;
  content: string;
  kind: "config" | "model" | "yaml";
}

const GUIDANCE: { title: string; body: string }[] = [
  {
    title: "Warehouse targets",
    body: "Keep one profile per warehouse with separate dev and prod targets. Credentials come from environment variables, never from the repo.",
  },
  {
    title: "Dev vs prod",
    body: "Build into a personal dev schema (dbt_dev) while iterating; only CI/scheduled jobs write to the prod schema that dashboards read.",
  },
  {
    title: "Incremental models",
    body: "Large event tables (stg_*__events, fct_daily_business) are incremental with a unique_key and a short look-back window so late data is merged without full rebuilds.",
  },
  {
    title: "Partitioning & clustering",
    body: "Partition marts by date and cluster by common filters (plan, country). Dashboard queries then prune partitions instead of scanning whole tables.",
  },
  {
    title: "Least-privilege access",
    body: "The transformer role can read raw schemas and write only to its target schemas. DataOrbyt's query role reads marts only.",
  },
];

export function StarterPreview({ projectId, adapter, files, modelCount }: { projectId: string; adapter: string; files: StarterFile[]; modelCount: number }) {
  const [active, setActive] = useState(files.find((f) => f.kind === "model")?.path ?? files[0]?.path);
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const file = files.find((f) => f.path === active);

  // Build a simple tree: folders first, then files, with depth for indentation.
  const tree = useMemo(() => {
    const rows: { type: "dir" | "file"; path: string; name: string; depth: number; file?: StarterFile }[] = [];
    const seen = new Set<string>();
    const sorted = [...files].sort((a, b) => {
      const da = a.path.includes("/") ? 0 : 1;
      const db = b.path.includes("/") ? 0 : 1;
      return da - db || a.path.localeCompare(b.path);
    });
    for (const f of sorted) {
      const parts = f.path.split("/");
      for (let i = 0; i < parts.length - 1; i++) {
        const dir = parts.slice(0, i + 1).join("/");
        if (!seen.has(dir)) {
          seen.add(dir);
          rows.push({ type: "dir", path: dir, name: parts[i], depth: i });
        }
      }
      rows.push({ type: "file", path: f.path, name: parts[parts.length - 1], depth: parts.length - 1, file: f });
    }
    return rows;
  }, [files]);

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[280px_minmax(0,1fr)_300px]">
      <Card>
        <CardHeader title="Proposed files" description={`${files.length} files · ${modelCount} models · ${adapter}`} />
        <ul className="px-2 pb-3 font-mono text-[12px]" aria-label="File tree">
          {tree.map((r) =>
            r.type === "dir" ? (
              <li key={r.path} className="flex items-center gap-1.5 px-2 py-1 text-muted" style={{ paddingLeft: 8 + r.depth * 14 }}>
                <Folder aria-hidden className="size-3.5 text-faint" /> {r.name}/
              </li>
            ) : (
              <li key={r.path}>
                <button
                  type="button"
                  onClick={() => setActive(r.path)}
                  aria-current={active === r.path ? "true" : undefined}
                  className={cx("flex w-full items-center gap-1.5 rounded px-2 py-1 text-left", active === r.path ? "bg-accent-soft text-accent" : "text-ink-2 hover:bg-hover")}
                  style={{ paddingLeft: 8 + r.depth * 14 }}
                >
                  {r.file?.kind === "model" ? <FileCode2 aria-hidden className="size-3.5" /> : r.file?.kind === "config" ? <FileCog aria-hidden className="size-3.5" /> : <FileText aria-hidden className="size-3.5" />}
                  <span className="truncate">{r.name}</span>
                </button>
              </li>
            ),
          )}
        </ul>
      </Card>

      <div className="min-w-0 space-y-3">
        {file && <CodeBlock code={file.content} label={file.path} className="[&_pre]:max-h-[560px]" />}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="primary" onClick={() => setConfirming(true)}>
            Review &amp; add to workspace
          </Button>
        </div>
      </div>

      <Card className="h-fit">
        <CardHeader title="Guidance" />
        <div className="space-y-3 px-4 pb-4">
          {GUIDANCE.map((g) => (
            <div key={g.title}>
              <h3 className="text-[12.5px] font-semibold text-ink">{g.title}</h3>
              <p className="mt-0.5 text-[12.5px] text-ink-2">{g.body}</p>
            </div>
          ))}
          <Callout tone="warn" title="dbt isn't a cost control by itself">
            dbt standardizes transformations, tests and lineage — it does not automatically guarantee low query costs. Costs stay predictable through incremental models, partition pruning, pre-aggregated marts, warehouse size limits (e.g. maximum_bytes_billed, resource monitors) and DataOrbyt&apos;s cached, budgeted metric queries.
          </Callout>
        </div>
      </Card>

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Add starter project to workspace?"
        description="Review what will change before confirming."
        footer={
          <>
            <Button onClick={() => setConfirming(false)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await applyStarterAction(projectId);
                  if (r && !r.ok) setError(r.message);
                })
              }
            >
              {pending ? "Adding…" : `Add ${modelCount} models`}
            </Button>
          </>
        }
      >
        <ul className="list-disc space-y-1 pl-4 text-[13px] text-ink-2">
          <li>
            Registers {modelCount} models ({files.filter((f) => f.path.includes("/staging/")).length} staging files incl. sources YAML) in this project&apos;s dbt workspace.
          </li>
          <li>Marks dbt as configured for the {adapter} adapter.</li>
          <li>Models start as &ldquo;not run&rdquo; — run a build to see them succeed.</li>
        </ul>
        <div className="mt-3">
          <SimulatedNote>Simulated: no files are written to disk or committed to a repository, and no warehouse objects are created.</SimulatedNote>
        </div>
        {error && <p role="alert" className="mt-2 text-[12.5px] text-bad">{error}</p>}
      </Modal>
    </div>
  );
}
