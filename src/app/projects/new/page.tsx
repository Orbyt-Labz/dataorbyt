import { Suspense } from "react";
import { getAppContext } from "@/lib/server/session";
import { CURRENCIES, TIMEZONES } from "@/lib/services/projects";
import { createProjectAction } from "@/app/actions/projects";
import { PageHeader, PageSkeleton } from "@/components/ui";
import { ProjectForm } from "@/components/projects/project-form";

export const metadata = { title: "New project" };

export default function NewProjectPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NewProject />
    </Suspense>
  );
}

async function NewProject() {
  const { store } = await getAppContext();
  const ws = store.workspace;
  return (
    <div>
      <PageHeader eyebrow="Projects" title="New project" description="A project holds one business's sources, dbt models, metrics and dashboards. You'll switch to it after creating." />
      <ProjectForm
        mode="create"
        action={createProjectAction}
        defaults={{ name: "", description: "", timezone: ws.defaultTimezone, currency: ws.defaultCurrency, environment: "production", industry: "" }}
        timezones={TIMEZONES}
        currencies={CURRENCIES}
      />
    </div>
  );
}
