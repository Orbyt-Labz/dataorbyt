import "server-only";
import { z } from "zod";
import type { Connection, ConnectorDefinition } from "@/lib/domain/types";
import { CONNECTORS, getConnector } from "@/lib/domain/connectors";
import { DemoSourceAdapter } from "@/lib/adapters/demo-source";
import type { ConnectionTestResult, SourceConnectorAdapter } from "@/lib/adapters/types";
import { getStore, nextId } from "@/lib/server/store";
import { generateDailyFacts, toISODate } from "@/lib/demo/facts";
import { profileForNewProject } from "@/lib/demo/seed";
import { assertProjectAccess, assertScope, audit, parseInput, ServiceError, type Actor } from "./context";

const adapter: SourceConnectorAdapter = new DemoSourceAdapter();

export function listConnections(actor: Actor, projectId: string): Connection[] {
  assertProjectAccess(actor, projectId);
  return getStore().connections.filter((c) => c.projectId === projectId);
}

export function getConnection(actor: Actor, id: string): Connection {
  const c = getStore().connections.find((x) => x.id === id);
  if (!c) throw new ServiceError("not_found", "Connection not found");
  assertProjectAccess(actor, c.projectId);
  return c;
}

export function catalogWithStatus(projectId: string) {
  const conns = getStore().connections.filter((c) => c.projectId === projectId);
  return CONNECTORS.map((def) => ({
    ...def,
    status: conns.some((c) => c.connectorId === def.id) ? ("connected" as const) : def.availability,
  }));
}

/** Build a strict schema for a connector's fields. Unknown fields are rejected. */
export function connectorSchema(def: ConnectorDefinition) {
  const shape: Record<string, z.ZodType> = {};
  for (const f of def.fields) {
    let s: z.ZodType;
    if (f.type === "select" && f.options) s = z.enum(f.options as [string, ...string[]], { message: `Choose a ${f.label.toLowerCase()}` });
    else if (f.type === "number") s = z.string().regex(/^\d{1,5}$/, `${f.label} must be a number`);
    else if (f.key === "host" && def.id !== "postgres") s = z.string().trim().url(`${f.label} must be a URL`);
    else s = z.string().trim().min(1, `${f.label} is required`).max(f.type === "textarea" ? 20_000 : 300);
    shape[f.key] = f.required ? s : s.optional();
  }
  return z.object(shape).strict();
}

export const connectionInputSchema = z.object({
  projectId: z.string().min(1),
  connectorId: z.string().min(1),
  name: z.string().trim().min(2, "Name is required").max(60),
  environment: z.enum(["production", "staging", "development"]),
  syncFrequency: z.enum(["15m", "1h", "6h", "24h"]).default("6h"),
  fields: z.record(z.string(), z.string()),
});

function splitFields(def: ConnectorDefinition, fields: Record<string, string>) {
  const parsed = parseInput(connectorSchema(def), fields) as Record<string, string>;
  const config: Record<string, string> = {};
  const secrets: Record<string, string> = {};
  for (const f of def.fields) {
    const v = parsed[f.key];
    if (v === undefined) continue;
    if (f.secret) secrets[f.key] = v;
    else config[f.key] = v;
  }
  return { config, secrets };
}

function requireConnector(id: string) {
  const def = getConnector(id);
  if (!def) throw new ServiceError("not_found", "Unknown connector");
  if (def.availability !== "available") throw new ServiceError("invalid_input", `${def.name} is coming soon`);
  return def;
}

export async function testConnection(actor: Actor, input: unknown): Promise<ConnectionTestResult> {
  const data = parseInput(connectionInputSchema, input);
  assertProjectAccess(actor, data.projectId);
  const def = requireConnector(data.connectorId);
  const { config, secrets } = splitFields(def, data.fields);
  const result = await adapter.test(def, config, secrets);
  audit(actor, "connection.tested", { projectId: data.projectId, target: def.name, detail: result.ok ? "passed (simulated)" : "failed (simulated)" });
  return result;
}

/**
 * Creates a demo connection. Secret values are used for the simulated test and
 * then discarded — only the *names* of provided secret fields are kept. A real
 * implementation would write them to a secrets manager (e.g. GCP Secret
 * Manager, AWS Secrets Manager, Vault) and store only a reference.
 */
export async function createConnection(actor: Actor, input: unknown): Promise<Connection> {
  assertScope(actor, "draft");
  const data = parseInput(connectionInputSchema, input);
  assertProjectAccess(actor, data.projectId);
  const def = requireConnector(data.connectorId);
  const { config, secrets } = splitFields(def, data.fields);
  const test = await adapter.test(def, config, secrets);
  if (!test.ok) throw new ServiceError("invalid_input", test.message);
  const tables = await adapter.discover(def, config);
  const now = new Date().toISOString();
  const conn: Connection = {
    id: nextId("conn"),
    projectId: data.projectId,
    connectorId: def.id,
    name: data.name,
    environment: data.environment,
    status: "connected",
    demo: true,
    config,
    secretFieldsProvided: Object.keys(secrets),
    lastSyncAt: now,
    syncFrequency: data.syncFrequency,
    tables,
    syncHistory: [{ id: nextId("sync"), startedAt: now, durationSec: 4, status: "success", rowsSynced: tables.reduce((a, t) => a + t.rows, 0), message: "Initial schema discovery (simulated)" }],
    createdAt: now,
  };
  const s = getStore();
  s.connections.push(conn);
  if (!s.facts[data.projectId]) {
    // A demo connection has no real rows, so attach deterministic demo facts
    // to let the rest of the setup flow (metrics, dashboards) be explored.
    const profile = profileForNewProject(data.projectId);
    s.profiles[data.projectId] = profile;
    s.facts[data.projectId] = generateDailyFacts(profile, toISODate(new Date(Date.now() - 86_400_000)), 90);
    s.factsLoadedAt[data.projectId] = now;
  }
  const p = s.projects.find((x) => x.id === data.projectId);
  if (p && p.status === "setup") p.status = "healthy";
  audit(actor, "connection.created", { projectId: data.projectId, target: conn.name, detail: "demo connection; secrets discarded" });
  return conn;
}

export function removeConnection(actor: Actor, id: string) {
  const c = getConnection(actor, id);
  assertScope(actor, "draft");
  const s = getStore();
  s.connections = s.connections.filter((x) => x.id !== id);
  audit(actor, "connection.removed", { projectId: c.projectId, target: c.name });
}

export function updateConnectionSettings(actor: Actor, id: string, input: unknown) {
  const c = getConnection(actor, id);
  const data = parseInput(z.object({ name: z.string().trim().min(2).max(60), syncFrequency: z.enum(["15m", "1h", "6h", "24h"]), paused: z.boolean() }), input);
  c.name = data.name;
  c.syncFrequency = data.syncFrequency;
  c.status = data.paused ? "paused" : c.status === "paused" ? "connected" : c.status;
  audit(actor, "connection.updated", { projectId: c.projectId, target: c.name });
  return c;
}

export function triggerSync(actor: Actor, id: string) {
  const c = getConnection(actor, id);
  if (c.status === "paused") throw new ServiceError("conflict", "Connection is paused");
  const now = new Date().toISOString();
  const failing = c.status === "error";
  c.syncHistory.unshift({
    id: nextId("sync"),
    startedAt: now,
    durationSec: failing ? 2 : 18,
    status: failing ? "error" : "success",
    rowsSynced: failing ? 0 : 1200 + c.syncHistory.length * 37,
    message: failing ? (c.error ?? "Sync failed (simulated)") : "Simulated sync — no data was fetched.",
  });
  if (!failing) c.lastSyncAt = now;
  audit(actor, "connection.sync_triggered", { projectId: c.projectId, target: c.name, detail: failing ? "failed (simulated)" : "succeeded (simulated)" });
  return c;
}
