import type { ReactNode } from "react";
import { getAppContext } from "@/lib/server/session";
import { setupChecklist } from "@/lib/services/projects";
import { CURRENT_USER } from "@/lib/demo/seed";
import { ShellClient, type SearchItem } from "./shell-client";

export async function AppShell({ children }: { children: ReactNode }) {
  const { project, projects, store } = await getAppContext();
  const pid = project?.id;
  const setup = pid ? setupChecklist(pid) : [];

  const notifications = store.alerts
    .filter((a) => a.projectId === pid)
    .flatMap((a) => a.history.filter((h) => h.state === "fired").map((h) => ({ id: `${a.id}:${h.id}`, title: a.name, body: h.message.split("\n")[0], at: h.at, severity: a.severity, acknowledged: !!h.acknowledgedBy })))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 8);

  const search: SearchItem[] = [
    ...store.dashboards.filter((d) => d.projectId === pid).map((d) => ({ type: "Dashboard", label: d.name, href: `/dashboards/${d.id}` })),
    ...store.metrics.filter((m) => m.projectId === pid).map((m) => ({ type: "Metric", label: m.name, href: `/metrics/${m.key}` })),
    ...store.experiments.filter((e) => e.projectId === pid).map((e) => ({ type: "Experiment", label: e.name, href: `/experiments/${e.id}` })),
    ...store.alerts.filter((a) => a.projectId === pid).map((a) => ({ type: "Alert", label: a.name, href: `/alerts?alert=${a.id}` })),
    ...store.connections.filter((c) => c.projectId === pid).map((c) => ({ type: "Connection", label: c.name, href: `/connections/${c.id}` })),
    ...(store.dbt[pid ?? ""]?.models ?? []).map((m) => ({ type: "dbt model", label: m.name, href: `/dbt/models/${m.name}` })),
  ];

  return (
    <ShellClient
      project={project ? { id: project.id, name: project.name, environment: project.environment, sampleData: project.sampleData } : null}
      projects={projects.map((p) => ({ id: p.id, name: p.name, environment: p.environment, status: p.status }))}
      setup={setup.map((s) => ({ label: s.label, done: s.done, href: s.href }))}
      notifications={notifications}
      search={search}
      user={{ name: CURRENT_USER.name, email: CURRENT_USER.email }}
    >
      {children}
    </ShellClient>
  );
}
