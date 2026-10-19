import { Suspense } from "react";
import { Boxes, Wand2 } from "lucide-react";
import { getAppContext } from "@/lib/server/session";
import { getDbt } from "@/lib/services/dbt";
import { ButtonLink, Callout, Card, EmptyState, PageHeader, PageSkeleton, SimulatedNote, StatusBadge } from "@/components/ui";
import { DbtWorkspace } from "@/components/dbt/dbt-workspace";
import { RepoButton } from "@/components/dbt/repo-form";
import { formatDate, relativeTime } from "@/lib/format";

export const metadata = { title: "dbt" };

export default function DbtPage(props: PageProps<"/dbt">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Dbt searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Dbt({ searchParams }: { searchParams: PageProps<"/dbt">["searchParams"] }) {
  const { actor, project } = await getAppContext();
  const sp = await searchParams;
  if (!project) return <EmptyState title="No project selected">Create a project first.</EmptyState>;
  const dbt = getDbt(actor, project.id);
  const last = dbt.runs[0];
  const failingTests = dbt.models.flatMap((m) => m.tests.filter((t) => t.status === "fail").map((t) => ({ model: m.name, test: t })));

  const header = (
    <PageHeader
      title="dbt"
      description="Transformations, tests and lineage behind every metric. Runs in this build are simulated."
      actions={
        <>
          <RepoButton projectId={project.id} repo={dbt.repository} />
          <ButtonLink href="/dbt/starter" variant={dbt.configured ? "secondary" : "primary"}>
            <Wand2 className="size-3.5" /> Generate starter project
          </ButtonLink>
        </>
      }
    />
  );

  if (!dbt.configured || dbt.models.length === 0) {
    return (
      <div>
        {header}
        <EmptyState
          icon={<Boxes className="size-5" />}
          title="dbt isn't configured for this project"
          action={
            <ButtonLink href="/dbt/starter" variant="primary">
              Generate a starter project
            </ButtonLink>
          }
        >
          DataOrbyt can propose staging, intermediate and mart models from your connected sources, plus semantic models and metric YAML. You&apos;ll review every file before anything is added.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {header}
      {sp.generated && <Callout tone="ok" title="Starter project added (simulated)">Models are registered in this workspace only — nothing was committed to a repository. Run a build to see them succeed.</Callout>}
      <SimulatedNote>Simulated dbt runs — DataOrbyt doesn&apos;t execute dbt or warehouse SQL in this build. Logs are generated from the model graph.</SimulatedNote>

      <Card className="grid grid-cols-2 gap-x-6 gap-y-3 p-4 text-[12.5px] sm:grid-cols-3 lg:grid-cols-7">
        {[
          ["Status", <StatusBadge key="s" status={dbt.configured ? "active" : "setup"} label={dbt.configured ? "Configured" : "Not configured"} />],
          ["dbt version", dbt.dbtVersion],
          ["Adapter", dbt.adapter],
          ["Target", `${dbt.target} (${project.environment})`],
          ["Repository", dbt.repository ? <span key="r" className="block truncate font-mono text-[11.5px]" title={dbt.repository.url}>{dbt.repository.url.replace(/^https:\/\//, "")} <span className="text-warn">· not cloned (demo)</span></span> : "Not connected — demo"],
          ["Last run", last ? `${relativeTime(last.startedAt)} · ${last.durationSec}s` : "never"],
          ["Outcome", last ? <StatusBadge key="o" status={last.status} /> : "—"],
        ].map(([label, value], i) => (
          <div key={i} className="min-w-0">
            <div className="text-faint">{label}</div>
            <div className="mt-0.5 text-ink-2">{value}</div>
          </div>
        ))}
      </Card>

      {failingTests.length > 0 && (
        <Callout tone="bad" title={`${failingTests.length} failing test${failingTests.length > 1 ? "s" : ""}`}>
          <ul className="space-y-0.5">
            {failingTests.map(({ model, test }) => (
              <li key={test.name}>
                <a className="font-mono text-[12px] underline-offset-2 hover:underline" href={`/dbt/models/${model}`}>
                  {test.name}
                </a>{" "}
                — {test.message}
              </li>
            ))}
          </ul>
        </Callout>
      )}

      <DbtWorkspace
        projectId={project.id}
        models={dbt.models.map((m) => ({
          name: m.name,
          layer: m.layer,
          materialization: m.materialization,
          state: m.state,
          description: m.description,
          passed: m.tests.filter((t) => t.status === "pass").length,
          failed: m.tests.filter((t) => t.status === "fail").length,
          total: m.tests.length,
          lastRunAt: m.lastRunAt,
        }))}
        runs={dbt.runs.map((r) => ({ ...r, startedLabel: formatDate(r.startedAt, true) }))}
      />
    </div>
  );
}
