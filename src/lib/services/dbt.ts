import "server-only";
import { z } from "zod";
import type { DbtModel, DbtProjectState } from "@/lib/domain/types";
import { getStore, nextId } from "@/lib/server/store";
import { acmeModels, buildRunLog, finalizeModels, northstarModels } from "@/lib/demo/seed-dbt";
import { assertProjectAccess, assertScope, audit, parseInput, ServiceError, type Actor } from "./context";

export function getDbt(actor: Actor, projectId: string): DbtProjectState {
  assertProjectAccess(actor, projectId);
  const s = getStore();
  s.dbt[projectId] ??= { projectId, configured: false, dbtVersion: "1.9.4", adapter: "—", target: "dev", models: [], runs: [] };
  return s.dbt[projectId];
}

export const runSchema = z.object({
  projectId: z.string().min(1),
  models: z.array(z.string()).max(100).default([]),
  mode: z.enum(["run", "test", "build"]),
});

/** Simulated dbt invocation. Produces a timestamped log; no warehouse SQL is executed. */
export function runDbt(actor: Actor, input: unknown) {
  assertScope(actor, "draft");
  const data = parseInput(runSchema, input);
  const dbt = getDbt(actor, data.projectId);
  if (!dbt.configured || dbt.models.length === 0) throw new ServiceError("conflict", "Configure dbt or generate a starter project first.");
  const unknown = data.models.filter((m) => !dbt.models.some((x) => x.name === m));
  if (unknown.length) throw new ServiceError("invalid_input", `Unknown models: ${unknown.join(", ")}`);
  const selected = data.models.length ? dbt.models.filter((m) => data.models.includes(m.name)) : dbt.models;
  const command = `dbt ${data.mode}${data.models.length ? ` --select ${data.models.join(" ")}` : ""}`;
  const started = new Date();
  const { log, status, durationSec } = buildRunLog(command, started, selected, data.mode !== "run");
  const now = new Date(started.getTime() + durationSec * 1000).toISOString();
  for (const m of selected) {
    m.lastRunAt = now;
    if (data.mode !== "test") m.state = m.tests.some((t) => t.status === "fail") && data.mode === "build" ? "warn" : "success";
  }
  const run = { id: nextId("run"), command, startedAt: started.toISOString(), durationSec, status, simulated: true as const, triggeredBy: actor.name, log };
  dbt.runs.unshift(run);
  audit(actor, status === "error" ? "dbt.run.failed" : "dbt.run.succeeded", { projectId: data.projectId, target: command, detail: "simulated run" });
  return run;
}

export interface StarterFile {
  path: string;
  content: string;
  kind: "config" | "model" | "yaml";
}

const CONNECTOR_SOURCES: Record<string, { source: string; tables: string[] }> = {
  stripe: { source: "stripe", tables: ["charges", "subscriptions", "refunds"] },
  posthog: { source: "posthog", tables: ["events", "persons"] },
  segment: { source: "segment", tables: ["tracks", "identifies"] },
  hubspot: { source: "hubspot", tables: ["deals", "contacts"] },
  postgres: { source: "app", tables: ["users", "accounts"] },
  mixpanel: { source: "mixpanel", tables: ["events"] },
  csv: { source: "uploads", tables: ["monthly_targets"] },
};

export function starterPreview(actor: Actor, projectId: string) {
  assertProjectAccess(actor, projectId);
  const s = getStore();
  const project = s.projects.find((p) => p.id === projectId)!;
  const conns = s.connections.filter((c) => c.projectId === projectId);
  const warehouse = conns.find((c) => ["bigquery", "snowflake", "postgres", "redshift"].includes(c.connectorId));
  const adapter = warehouse?.connectorId === "snowflake" ? "snowflake" : warehouse?.connectorId === "postgres" ? "postgres" : "bigquery";
  const sources = conns.map((c) => CONNECTOR_SOURCES[c.connectorId]).filter(Boolean);
  if (sources.length === 0) sources.push(CONNECTOR_SOURCES.stripe, CONNECTOR_SOURCES.posthog);
  const hasEvents = sources.some((x) => ["posthog", "segment", "mixpanel"].includes(x.source));
  const hasBilling = sources.some((x) => x.source === "stripe");
  const slug = project.slug.replace(/-/g, "_");

  const files: StarterFile[] = [];
  files.push({
    path: "dbt_project.yml",
    kind: "config",
    content: `name: ${slug}\nversion: "1.0.0"\nconfig-version: 2\nprofile: ${slug}\n\nmodels:\n  ${slug}:\n    staging:\n      +materialized: view\n      +schema: staging\n    intermediate:\n      +materialized: ephemeral\n    marts:\n      +materialized: table\n      +schema: marts\n`,
  });
  const profileBody =
    adapter === "snowflake"
      ? `      type: snowflake\n      account: "{{ env_var('SNOWFLAKE_ACCOUNT') }}"\n      user: "{{ env_var('SNOWFLAKE_USER') }}"\n      private_key_path: "{{ env_var('SNOWFLAKE_PRIVATE_KEY_PATH') }}"\n      role: DATAORBYT_TRANSFORMER\n      warehouse: DATAORBYT_XS\n      database: ANALYTICS\n      schema: dbt_dev\n      threads: 4`
      : adapter === "postgres"
        ? `      type: postgres\n      host: "{{ env_var('PG_HOST') }}"\n      user: "{{ env_var('PG_USER') }}"\n      password: "{{ env_var('PG_PASSWORD') }}"\n      dbname: analytics\n      schema: dbt_dev\n      threads: 4`
        : `      type: bigquery\n      method: service-account\n      keyfile: "{{ env_var('BIGQUERY_KEYFILE_PATH') }}"\n      project: "{{ env_var('BIGQUERY_PROJECT') }}"\n      dataset: dbt_dev\n      location: US\n      maximum_bytes_billed: 1000000000  # 1 GB cap per query\n      threads: 4`;
  files.push({
    path: "profiles.yml.example",
    kind: "config",
    content: `# Copy to ~/.dbt/profiles.yml. Secrets come from environment variables — never commit them.\n${slug}:\n  target: dev\n  outputs:\n    dev:\n${profileBody}\n    prod:\n${profileBody.replace(/dbt_dev/g, "analytics")}\n`,
  });

  const stagingModels: string[] = [];
  for (const src of sources) {
    files.push({
      path: `models/staging/${src.source}/_${src.source}__sources.yml`,
      kind: "yaml",
      content: `version: 2\nsources:\n  - name: ${src.source}\n    schema: raw_${src.source}\n    freshness:\n      warn_after: { count: 12, period: hour }\n      error_after: { count: 24, period: hour }\n    loaded_at_field: _loaded_at\n    tables:\n${src.tables.map((t) => `      - name: ${t}`).join("\n")}\n`,
    });
    for (const t of src.tables) {
      const name = `stg_${src.source}__${t}`;
      stagingModels.push(name);
      const known = acmeModels().find((m) => m.name === name) ?? northstarModels().find((m) => m.name === name);
      files.push({
        path: `models/staging/${src.source}/${name}.sql`,
        kind: "model",
        content: known?.sql ?? `select\n  *\nfrom {{ source('${src.source}', '${t}') }}`,
      });
    }
  }
  if (hasEvents) files.push({ path: "models/intermediate/int_user_activation.sql", kind: "model", content: acmeModels().find((m) => m.name === "int_user_activation")!.sql });
  if (hasBilling) files.push({ path: "models/intermediate/int_subscription_events.sql", kind: "model", content: acmeModels().find((m) => m.name === "int_subscription_events")!.sql });
  files.push({ path: "models/marts/fct_daily_business.sql", kind: "model", content: acmeModels().find((m) => m.name === "fct_daily_business")!.sql });
  if (hasBilling) files.push({ path: "models/marts/fct_revenue_daily.sql", kind: "model", content: acmeModels().find((m) => m.name === "fct_revenue_daily")!.sql });
  files.push({
    path: "models/marts/_marts.yml",
    kind: "yaml",
    content: `version: 2\nmodels:\n  - name: fct_daily_business\n    description: Pre-aggregated daily facts for dashboards.\n    columns:\n      - name: date\n        tests: [unique, not_null]\n${hasBilling ? "  - name: fct_revenue_daily\n    columns:\n      - name: date\n        tests: [not_null]\n" : ""}`,
  });
  files.push({
    path: "semantic_models/sem_daily_business.yml",
    kind: "yaml",
    content: `semantic_models:\n  - name: daily_business\n    model: ref('fct_daily_business')\n    defaults:\n      agg_time_dimension: date\n    entities:\n      - name: day\n        type: primary\n        expr: date\n    dimensions:\n      - name: date\n        type: time\n        type_params: { time_granularity: day }\n    measures:\n      - name: signups\n        agg: sum\n      - name: activated\n        agg: sum\n      - name: wau\n        agg: average\n`,
  });
  files.push({
    path: "metrics/metrics.yml",
    kind: "yaml",
    content: `metrics:\n  - name: signups\n    label: Signups\n    type: simple\n    type_params: { measure: signups }\n  - name: activation_rate\n    label: Activation rate\n    type: ratio\n    type_params:\n      numerator: activated\n      denominator: signups\n`,
  });

  const tree = buildTree(files.map((f) => f.path));
  return { adapter, files, tree, modelCount: files.filter((f) => f.kind === "model").length, stagingModels };
}

function buildTree(paths: string[]) {
  return [...paths].sort().map((p) => ({ path: p, depth: p.split("/").length - 1 }));
}

/** Registers the starter models in the (simulated) dbt workspace. Nothing is written to a repository. */
export function applyStarter(actor: Actor, projectId: string) {
  assertScope(actor, "draft");
  const preview = starterPreview(actor, projectId);
  const dbt = getDbt(actor, projectId);
  const now = new Date().toISOString();
  const models: DbtModel[] = finalizeModels(
    preview.files
      .filter((f) => f.kind === "model")
      .map((f) => {
        const name = f.path.split("/").pop()!.replace(/\.sql$/, "");
        const layer = f.path.includes("/staging/") ? "staging" : f.path.includes("/intermediate/") ? "intermediate" : "marts";
        const refs = [...f.content.matchAll(/ref\('([^']+)'\)/g)].map((m) => m[1]);
        const srcs = [...f.content.matchAll(/source\('([^']+)',\s*'([^']+)'\)/g)].map((m) => `source:${m[1]}.${m[2]}`);
        return {
          name,
          layer,
          materialization: layer === "staging" ? "view" : layer === "intermediate" ? "ephemeral" : "table",
          description: `Generated by DataOrbyt starter (${layer}).`,
          columns: [],
          tests: layer === "marts" ? [{ name: `not_null_${name}_date`, type: "not_null", column: "date", status: "not_run" }] : [],
          dependsOn: [...refs, ...srcs],
          sql: f.content,
        };
      }),
    `${projectId}.dbt_dev`,
    now,
  ).map((m) => ({ ...m, state: "not_run" as const, lastRunAt: undefined }));
  dbt.models = models;
  dbt.configured = true;
  dbt.adapter = preview.adapter;
  audit(actor, "dbt.starter_generated", { projectId, detail: `${models.length} models (simulated, not committed)` });
  return dbt;
}

export const repoSchema = z.object({
  projectId: z.string().min(1),
  url: z
    .string()
    .trim()
    .regex(/^(https:\/\/(github\.com|gitlab\.com|bitbucket\.org)\/[\w.-]+\/[\w.-]+(\.git)?|git@(github\.com|gitlab\.com):[\w.-]+\/[\w.-]+\.git)$/, "Use an HTTPS or SSH URL for GitHub, GitLab or Bitbucket"),
  branch: z.string().trim().regex(/^[\w./-]{1,100}$/, "Invalid branch name"),
  path: z.string().trim().regex(/^\/[\w./-]*$/, "Path must start with /").default("/"),
});

export function configureRepository(actor: Actor, input: unknown) {
  assertScope(actor, "publish");
  const data = parseInput(repoSchema, input);
  const dbt = getDbt(actor, data.projectId);
  dbt.repository = { url: data.url, branch: data.branch, path: data.path, connected: false };
  audit(actor, "dbt.repository_configured", { projectId: data.projectId, target: data.url, detail: "saved; not cloned (demo)" });
  return dbt;
}
