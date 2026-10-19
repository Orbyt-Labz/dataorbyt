import { beforeEach, describe, expect, it } from "vitest";
import { resetStore, getStore } from "@/lib/server/store";
import { generateDailyFacts } from "@/lib/demo/facts";
import { ACME_PROFILE } from "@/lib/demo/seed";
import { ServiceError, UI_ACTOR, type Actor } from "./context";
import { cacheKey, metricQuerySchema, queryMetric, QUERY_LIMITS, type MetricQueryRequest } from "./query";
import { createDashboardDraft, publishDashboard, publishPreview, saveDashboardDraft } from "./dashboards";
import { createProject, setupChecklist } from "./projects";
import { createConnection, testConnection } from "./connections";
import { requestMetric } from "./metrics";
import { authenticateBearer, createToken, revokeToken } from "./tokens";
import { handleRpc } from "@/lib/mcp/server";

const end = () => getStore().facts.acme.at(-1)!.date;
const q = (over: Record<string, unknown> = {}) => ({ projectId: "acme", metricKey: "gross_revenue", start: getStore().facts.acme[60].date, end: end(), grain: "day" as const, ...over }) as MetricQueryRequest;

beforeEach(() => resetStore());

describe("demo facts", () => {
  it("are deterministic", () => {
    expect(generateDailyFacts(ACME_PROFILE, "2026-01-31", 30)).toEqual(generateDailyFacts(ACME_PROFILE, "2026-01-31", 30));
  });
});

describe("MetricQueryService", () => {
  it("returns rows and caches identical queries", async () => {
    const a = await queryMetric(q(), { actor: UI_ACTOR, source: "ui" });
    expect(a.rows.length).toBe(30);
    expect(a.meta.cacheHit).toBe(false);
    expect(a.meta.demo).toBe(true);
    const b = await queryMetric(q(), { actor: UI_ACTOR, source: "ui" });
    expect(b.meta.cacheHit).toBe(true);
    expect(b.meta.scanBytes).toBe(0);
    expect(b.rows).toEqual(a.rows);
  });

  it("cache key ignores filter ordering", () => {
    const p = (v: string[]) => metricQuerySchema.parse(q({ filters: [{ dimension: "plan", values: v }] }));
    expect(cacheKey(p(["growth", "starter"]))).toBe(cacheKey(p(["starter", "growth"])));
  });

  it("rejects unknown metrics, non-whitelisted dimensions and bad filter values", async () => {
    await expect(queryMetric(q({ metricKey: "drop_table" }), { actor: UI_ACTOR, source: "ui" })).rejects.toMatchObject({ code: "not_found" });
    await expect(queryMetric(q({ groupBy: "channel" }), { actor: UI_ACTOR, source: "ui" })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(queryMetric(q({ filters: [{ dimension: "plan", values: ["'; DROP TABLE x; --"] }] }), { actor: UI_ACTOR, source: "ui" })).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("rejects unknown fields (strict input) and over-long ranges", async () => {
    await expect(queryMetric({ ...q(), sql: "select 1" } as never, { actor: UI_ACTOR, source: "ui" })).rejects.toBeInstanceOf(ServiceError);
    await expect(queryMetric(q({ start: "2020-01-01" }), { actor: UI_ACTOR, source: "ui" })).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("blocks draft metrics unless previewing", async () => {
    await expect(queryMetric(q({ metricKey: "visitor_conversion" }), { actor: UI_ACTOR, source: "ui" })).rejects.toMatchObject({ code: "forbidden" });
    const r = await queryMetric(q({ metricKey: "visitor_conversion" }), { actor: UI_ACTOR, source: "ui", allowDraft: true });
    expect(r.meta.warnings.join()).toMatch(/draft/i);
  });

  it("enforces project scoping", async () => {
    const scoped: Actor = { type: "mcp", name: "t", projectIds: ["northstar"], scopes: ["read"] };
    await expect(queryMetric(q(), { actor: scoped, source: "mcp" })).rejects.toMatchObject({ code: "forbidden" });
  });

  it("enforces the scan budget but still serves cache hits", async () => {
    await queryMetric(q(), { actor: UI_ACTOR, source: "ui" });
    getStore().scanUsage.acme = { day: new Date().toISOString().slice(0, 10), bytes: QUERY_LIMITS.dailyScanBudgetBytes };
    await expect(queryMetric(q({ grain: "week" }), { actor: UI_ACTOR, source: "ui" })).rejects.toMatchObject({ code: "budget_exceeded" });
    const cached = await queryMetric(q(), { actor: UI_ACTOR, source: "ui" });
    expect(cached.meta.cacheHit).toBe(true);
  });

  it("compiles parameterised SQL without interpolating values", async () => {
    const r = await queryMetric(q({ filters: [{ dimension: "plan", values: ["growth"] }] }), { actor: UI_ACTOR, source: "ui" });
    expect(r.plan.sql).toContain("IN UNNEST(@f0_values)");
    expect(r.plan.sql).not.toContain("growth");
  });
});

describe("dashboards", () => {
  it("requires an explicit, content-bound confirmation to publish", () => {
    const d = createDashboardDraft(UI_ACTOR, { projectId: "acme", name: "Board deck", start: { mode: "template", templateId: "saas_growth" } });
    expect(d.status).toBe("draft");
    expect(() => publishDashboard(UI_ACTOR, d.id, undefined)).toThrow(/confirmation/i);
    const preview = publishPreview(UI_ACTOR, d.id);
    saveDashboardDraft(UI_ACTOR, d.id, { name: d.name, description: "", tags: [], charts: d.charts.slice(1) });
    expect(() => publishDashboard(UI_ACTOR, d.id, preview.confirmationCode)).toThrow(/changed/i);
    const fresh = publishPreview(UI_ACTOR, d.id);
    expect(publishDashboard(UI_ACTOR, d.id, fresh.confirmationCode).status).toBe("published");
  });

  it("validates chart specs against the catalog", () => {
    const d = createDashboardDraft(UI_ACTOR, { projectId: "acme", name: "X1", start: { mode: "blank" } });
    expect(() =>
      saveDashboardDraft(UI_ACTOR, d.id, {
        name: "X1",
        description: "",
        tags: [],
        charts: [{ id: "c1", title: "t", visualization: "line", metrics: ["not_a_metric"], grain: "day", dateRange: "inherit", filters: [], size: "md" }],
      }),
    ).toThrow(/catalog/);
  });
});

describe("projects & connections", () => {
  it("creates an empty project and walks the setup checklist", async () => {
    const p = createProject(UI_ACTOR, { name: "Zeta", timezone: "UTC", currency: "EUR", environment: "development", sampleData: false });
    expect(setupChecklist(p.id).filter((s) => s.done).map((s) => s.key)).toEqual(["project"]);
    const bad = await testConnection(UI_ACTOR, { projectId: p.id, connectorId: "stripe", name: "Stripe", environment: "development", fields: { accountId: "acct_1", restrictedKey: "sk_live_123456789" } });
    expect(bad.ok).toBe(false);
    await createConnection(UI_ACTOR, { projectId: p.id, connectorId: "stripe", name: "Stripe", environment: "development", fields: { accountId: "acct_1", restrictedKey: "rk_test_123456789" } });
    const conn = getStore().connections.find((c) => c.projectId === p.id)!;
    expect(conn.demo).toBe(true);
    expect(JSON.stringify(conn)).not.toContain("rk_test_123456789");
    expect(setupChecklist(p.id).find((s) => s.key === "source")!.done).toBe(true);
  });

  it("rejects unknown connector fields", async () => {
    await expect(
      testConnection(UI_ACTOR, { projectId: "acme", connectorId: "stripe", name: "S", environment: "production", fields: { accountId: "a", restrictedKey: "rk_123456789", evil: "x" } }),
    ).rejects.toBeInstanceOf(ServiceError);
  });
});

describe("metric requests", () => {
  it("rejects SQL with DDL/DML", () => {
    expect(() =>
      requestMetric(UI_ACTOR, { projectId: "acme", key: "bad_metric", name: "Bad", description: "This is a test metric", domain: "growth", unit: "count", sourceModel: "fct_daily_business", aggregationType: "sum", field: "signups", proposedSql: "select 1; drop table users" }),
    ).toThrow(ServiceError);
  });
});

describe("tokens & MCP", () => {
  it("stores only a hash and authenticates until revoked", () => {
    const { token, plaintext } = createToken(UI_ACTOR, { name: "Claude", scopes: ["read"], projectIds: ["acme"] });
    expect(JSON.stringify(getStore().tokens)).not.toContain(plaintext);
    expect(authenticateBearer(`Bearer ${plaintext}`)?.projectIds).toEqual(["acme"]);
    revokeToken(UI_ACTOR, token.id);
    expect(authenticateBearer(`Bearer ${plaintext}`)).toBeNull();
  });

  it("lists tools and enforces scopes and project scoping", async () => {
    const reader: Actor = { type: "mcp", name: "reader", projectIds: ["acme"], scopes: ["read"] };
    const list = (await handleRpc(reader, { jsonrpc: "2.0", id: 1, method: "tools/list" })) as { result: { tools: { name: string }[] } };
    expect(list.result.tools.map((t) => t.name)).toContain("preview_metric_query");

    const call = (name: string, args: unknown) => handleRpc(reader, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name, arguments: args } }) as Promise<{ result: { isError: boolean; structuredContent: Record<string, unknown> } }>;
    expect((await call("list_metrics", { project_id: "acme" })).result.isError).toBe(false);
    expect((await call("list_metrics", { project_id: "northstar" })).result.isError).toBe(true);
    expect((await call("create_dashboard_draft", { project_id: "acme", name: "From Claude" })).result.structuredContent.error).toBe("forbidden");
    const preview = await call("preview_metric_query", { project_id: "acme", metric_key: "signups", range: "7d", grain: "day" });
    expect(preview.result.isError).toBe(false);
  });

  it("publish_dashboard is two-step", async () => {
    const pub: Actor = { type: "mcp", name: "pub", projectIds: "all", scopes: ["read", "draft", "publish"] };
    const call = (name: string, args: unknown) => handleRpc(pub, { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name, arguments: args } }) as Promise<{ result: { structuredContent: Record<string, unknown> } }>;
    const d = (await call("create_dashboard_draft", { project_id: "acme", name: "MCP draft", template_id: "founder_overview" })).result.structuredContent;
    const step1 = (await call("publish_dashboard", { project_id: "acme", dashboard_id: d.id })).result.structuredContent as { published: boolean; preview: { confirmationCode: string } };
    expect(step1.published).toBe(false);
    const step2 = (await call("publish_dashboard", { project_id: "acme", dashboard_id: d.id, confirm: true, confirmation_code: step1.preview.confirmationCode })).result.structuredContent;
    expect(step2.published).toBe(true);
  });
});
