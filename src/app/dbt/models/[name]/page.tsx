import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowRight, Database, Sigma } from "lucide-react";
import { getAppContext } from "@/lib/server/session";
import { getDbt } from "@/lib/services/dbt";
import { Badge, Card, CardHeader, KeyValue, PageHeader, PageSkeleton, StatusBadge, td, th } from "@/components/ui";
import { SqlTabs } from "@/components/dbt/sql-tabs";
import { cx, formatDate } from "@/lib/format";

export default function ModelPage(props: PageProps<"/dbt/models/[name]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Model params={props.params} />
    </Suspense>
  );
}

async function Model({ params }: { params: PageProps<"/dbt/models/[name]">["params"] }) {
  const { actor, project, store } = await getAppContext();
  const { name } = await params;
  if (!project) notFound();
  const dbt = getDbt(actor, project.id);
  const model = dbt.models.find((m) => m.name === decodeURIComponent(name));
  if (!model) notFound();
  const upstream = model.dependsOn;
  const downstream = dbt.models.filter((m) => m.dependsOn.includes(model.name)).map((m) => m.name);
  const metrics = store.metrics.filter((m) => m.projectId === project.id && m.sourceModel === model.name);
  const layerDir = model.layer === "marts" ? "marts" : model.layer;

  const depLink = (d: string) =>
    d.startsWith("source:") ? (
      <span className="inline-flex items-center gap-1 rounded-md border border-line bg-subtle px-2 py-1 font-mono text-[11.5px] text-ink-2">
        <Database aria-hidden className="size-3" /> {d.slice(7)}
      </span>
    ) : (
      <Link href={`/dbt/models/${d}`} className="inline-flex rounded-md border border-line bg-surface px-2 py-1 font-mono text-[11.5px] text-ink-2 hover:border-accent-line hover:text-accent">
        {d}
      </Link>
    );

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={
          <Link href="/dbt" className="hover:text-ink">
            dbt · {model.layer}
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-3 font-mono text-[20px]">
            {model.name} <StatusBadge status={model.state} />
          </span>
        }
        description={model.description}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Model" />
          <div className="px-4 pb-4">
            <KeyValue
              items={[
                { label: "Layer", value: <span className="capitalize">{model.layer}</span> },
                { label: "Materialization", value: <Badge>{model.materialization}</Badge> },
                { label: "Partition", value: model.partitionBy ?? "—" },
                { label: "Cluster", value: model.clusterBy?.join(", ") ?? "—" },
                { label: "Last run", value: model.lastRunAt ? formatDate(model.lastRunAt, true) : "not run" },
                { label: "Execution", value: model.executionSec ? `${model.executionSec}s (simulated)` : "—" },
                { label: "File", value: <span className="font-mono text-[11.5px]">models/{layerDir}/{model.name}.sql</span> },
              ]}
            />
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Lineage" description="Upstream → this model → downstream" />
          <div className="flex flex-col gap-3 px-4 pb-4 md:flex-row md:items-center">
            <div className="flex flex-1 flex-col gap-1.5">
              <span className="text-[11px] font-medium tracking-wide text-muted uppercase">Upstream</span>
              <div className="flex flex-wrap gap-1.5">{upstream.length ? upstream.map((d) => <span key={d}>{depLink(d)}</span>) : <span className="text-[12.5px] text-muted">None</span>}</div>
            </div>
            <ArrowRight aria-hidden className="hidden size-4 shrink-0 text-faint md:block" />
            <div className="shrink-0 rounded-md border border-accent bg-accent-soft px-2.5 py-1.5 font-mono text-[12px] font-semibold text-accent">{model.name}</div>
            <ArrowRight aria-hidden className="hidden size-4 shrink-0 text-faint md:block" />
            <div className="flex flex-1 flex-col gap-1.5">
              <span className="text-[11px] font-medium tracking-wide text-muted uppercase">Downstream</span>
              <div className="flex flex-wrap gap-1.5">
                {downstream.map((d) => (
                  <span key={d}>{depLink(d)}</span>
                ))}
                {metrics.map((m) => (
                  <Link key={m.key} href={`/metrics/${m.key}`} className="inline-flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-1 text-[11.5px] text-ink-2 hover:border-accent-line hover:text-accent">
                    <Sigma aria-hidden className="size-3" /> {m.name}
                  </Link>
                ))}
                {downstream.length + metrics.length === 0 && <span className="text-[12.5px] text-muted">None</span>}
              </div>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Columns" />
          {model.columns.length === 0 ? (
            <p className="px-4 pb-4 text-[13px] text-muted">No documented columns. Add them to the model&apos;s YAML.</p>
          ) : (
            <table className="w-full">
              <thead className="border-y border-line bg-subtle/50">
                <tr>
                  <th scope="col" className={th}>Column</th>
                  <th scope="col" className={th}>Type</th>
                  <th scope="col" className={th}>Description</th>
                </tr>
              </thead>
              <tbody>
                {model.columns.map((c) => (
                  <tr key={c.name} className="border-b border-line last:border-0">
                    <td className={cx(td, "font-mono text-[12px]")}>{c.name}</td>
                    <td className={cx(td, "text-muted")}>{c.type}</td>
                    <td className={td}>{c.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <Card>
          <CardHeader title="Tests" description={`${model.tests.filter((t) => t.status === "pass").length} of ${model.tests.length} passing`} />
          {model.tests.length === 0 ? (
            <p className="px-4 pb-4 text-[13px] text-muted">No tests. Add unique / not_null tests on keys at minimum.</p>
          ) : (
            <ul className="divide-y divide-line border-t border-line">
              {model.tests.map((t) => (
                <li key={t.name} className={cx("px-4 py-2.5", t.status === "fail" && "bg-bad-soft/40")}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-mono text-[12px] text-ink">{t.name}</span>
                    <StatusBadge status={t.status} />
                  </div>
                  <div className="mt-0.5 text-[11.5px] text-muted">
                    {t.type}
                    {t.column && ` · ${t.column}`}
                  </div>
                  {t.message && <p className="mt-1 text-[12px] text-bad">{t.message}</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader title="SQL" description="Compiled SQL is what the warehouse would run. Nothing executes in this demo." />
        <div className="px-4 pb-4">
          <SqlTabs
            tabs={[
              { key: "source", label: "Model SQL", code: model.sql, filename: `models/${layerDir}/${model.name}.sql` },
              { key: "compiled", label: "Compiled SQL", code: model.compiledSql, filename: `target/compiled/${model.name}.sql` },
            ]}
          />
        </div>
      </Card>
    </div>
  );
}
