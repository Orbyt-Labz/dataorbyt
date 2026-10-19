import "server-only";
import { z } from "zod";
import type { Project } from "@/lib/domain/types";
import { getStore, nextId } from "@/lib/server/store";
import { generateDailyFacts, toISODate } from "@/lib/demo/facts";
import { buildMetrics } from "@/lib/demo/seed-metrics";
import { chartsFromTemplate, demoConnection, profileForNewProject } from "@/lib/demo/seed";
import { acmeModels, finalizeModels } from "@/lib/demo/seed-dbt";
import { assertProjectAccess, audit, parseInput, ServiceError, type Actor } from "./context";

export const TIMEZONES = ["UTC", "America/New_York", "America/Los_Angeles", "Europe/London", "Europe/Berlin", "Asia/Kolkata", "Asia/Singapore", "Australia/Sydney"];
export const CURRENCIES = ["USD", "EUR", "GBP", "INR", "CAD", "AUD", "SGD"];

export const createProjectSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(60),
  description: z.string().trim().max(280).default(""),
  timezone: z.enum(TIMEZONES as [string, ...string[]], { message: "Choose a timezone" }),
  currency: z.enum(CURRENCIES as [string, ...string[]], { message: "Choose a currency" }),
  environment: z.enum(["production", "staging", "development"]),
  industry: z.string().trim().max(60).optional(),
  sampleData: z.boolean().default(false),
});

export function listProjects(actor: Actor): Project[] {
  const s = getStore();
  return s.projects.filter((p) => actor.projectIds === "all" || actor.projectIds.includes(p.id));
}

export function getProject(actor: Actor, id: string): Project {
  assertProjectAccess(actor, id);
  return getStore().projects.find((p) => p.id === id)!;
}

export function projectSummary(projectId: string) {
  const s = getStore();
  const conns = s.connections.filter((c) => c.projectId === projectId);
  const lastSync = conns.map((c) => c.lastSyncAt).filter(Boolean).sort().at(-1);
  return {
    sources: conns.length,
    connectedSources: conns.filter((c) => c.status === "connected" || c.status === "syncing").length,
    erroredSources: conns.filter((c) => c.status === "error").length,
    dashboards: s.dashboards.filter((d) => d.projectId === projectId).length,
    metrics: s.metrics.filter((m) => m.projectId === projectId).length,
    experiments: s.experiments.filter((e) => e.projectId === projectId).length,
    alerts: s.alerts.filter((a) => a.projectId === projectId).length,
    lastSync,
  };
}

export interface SetupStep {
  key: "project" | "source" | "dbt" | "metrics" | "dashboard";
  label: string;
  done: boolean;
  href: string;
}

export function setupChecklist(projectId: string): SetupStep[] {
  const s = getStore();
  return [
    { key: "project", label: "Create project", done: true, href: "/projects" },
    {
      key: "source",
      label: "Connect a source",
      done: s.connections.some((c) => c.projectId === projectId && c.status !== "error"),
      href: "/connections",
    },
    { key: "dbt", label: "Configure dbt", done: !!s.dbt[projectId]?.configured, href: "/dbt" },
    { key: "metrics", label: "Choose metrics", done: s.metrics.some((m) => m.projectId === projectId && m.status === "approved"), href: "/metrics" },
    {
      key: "dashboard",
      label: "Publish a dashboard",
      done: s.dashboards.some((d) => d.projectId === projectId && d.status === "published"),
      href: "/dashboards",
    },
  ];
}

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

export function createProject(actor: Actor, input: unknown): Project {
  const data = parseInput(createProjectSchema, input);
  const s = getStore();
  if (s.projects.some((p) => p.name.toLowerCase() === data.name.toLowerCase())) {
    throw new ServiceError("invalid_input", "A project with this name already exists", [{ path: "name", message: "A project with this name already exists" }]);
  }
  const id = nextId("prj");
  const now = new Date();
  const project: Project = {
    id,
    name: data.name,
    slug: slugify(data.name),
    description: data.description,
    environment: data.environment,
    timezone: data.timezone,
    currency: data.currency,
    industry: data.industry || undefined,
    status: data.sampleData ? "healthy" : "setup",
    sampleData: data.sampleData,
    createdAt: now.toISOString(),
  };
  s.projects.push(project);

  if (data.sampleData) {
    const end = toISODate(new Date(now.getTime() - 86_400_000));
    const profile = profileForNewProject(id);
    s.profiles[id] = profile;
    s.facts[id] = generateDailyFacts(profile, end, 90);
    s.factsLoadedAt[id] = now.toISOString();
    s.connections.push(
      demoConnection(id, "bigquery", now, { config: { projectId: `${project.slug}-demo`, dataset: "analytics", location: "US" } }),
      demoConnection(id, "stripe", now, { config: { accountId: "acct_demo" } }),
      demoConnection(id, "posthog", now, { config: { host: "https://us.posthog.com", projectKey: "demo" } }),
    );
    s.metrics.push(...buildMetrics(id, now.toISOString()));
    s.dbt[id] = {
      projectId: id,
      configured: true,
      dbtVersion: "1.9.4",
      adapter: "bigquery",
      target: data.environment === "production" ? "prod" : "dev",
      models: finalizeModels(
        acmeModels().map((m) => ({ ...m, tests: m.tests?.map((t) => ({ ...t, status: "pass" as const, message: undefined })) })),
        `${project.slug}.analytics`,
        now.toISOString(),
      ),
      runs: [],
    };
    const dashId = nextId("d");
    const charts = chartsFromTemplate("founder_overview", dashId);
    s.dashboards.push({
      id: dashId,
      projectId: id,
      name: "Founder Overview",
      description: "Starter dashboard generated from sample data.",
      tags: ["founder", "sample"],
      owner: actor.name,
      visibility: "private",
      status: "draft",
      charts,
      templateId: "founder_overview",
      viewCount: 0,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      createdVia: "ui",
    });
  } else {
    s.dbt[id] = { projectId: id, configured: false, dbtVersion: "1.9.4", adapter: "—", target: "dev", models: [], runs: [] };
  }
  audit(actor, "project.created", { projectId: id, target: project.name, detail: data.sampleData ? "with sample data" : "empty" });
  return project;
}

export const updateProjectSchema = createProjectSchema.pick({ name: true, description: true, timezone: true, currency: true, environment: true, industry: true }).partial();

export function updateProject(actor: Actor, id: string, input: unknown): Project {
  assertProjectAccess(actor, id);
  const data = parseInput(updateProjectSchema, input);
  const p = getStore().projects.find((x) => x.id === id)!;
  Object.assign(p, Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)));
  audit(actor, "project.updated", { projectId: id, target: p.name });
  return p;
}
