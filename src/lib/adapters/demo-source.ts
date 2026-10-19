import type { ConnectorDefinition, DiscoveredTable } from "@/lib/domain/types";
import { createRng, hashString } from "@/lib/demo/facts";
import type { ConnectionTestResult, SourceConnectorAdapter } from "./types";

const COLUMN_SETS: Record<string, { name: string; type: string }[]> = {
  default: [
    { name: "id", type: "string" },
    { name: "created_at", type: "timestamp" },
    { name: "updated_at", type: "timestamp" },
  ],
  charges: [
    { name: "id", type: "string" },
    { name: "customer_id", type: "string" },
    { name: "amount", type: "integer" },
    { name: "currency", type: "string" },
    { name: "status", type: "string" },
    { name: "created", type: "timestamp" },
  ],
  events: [
    { name: "uuid", type: "string" },
    { name: "event", type: "string" },
    { name: "distinct_id", type: "string" },
    { name: "properties", type: "json" },
    { name: "timestamp", type: "timestamp" },
  ],
};

function columnsFor(table: string) {
  const t = table.toLowerCase();
  if (t.includes("charge") || t.includes("invoice")) return COLUMN_SETS.charges;
  if (t.includes("event") || t.includes("track")) return COLUMN_SETS.events;
  return COLUMN_SETS.default;
}

/**
 * Demo connector adapter. It never opens a network connection. Validation is
 * deterministic so both success and failure paths can be exercised:
 * - any value containing "fail" or "invalid" fails authentication
 * - Stripe secret keys (sk_) are rejected in favour of restricted keys (rk_)
 * - secrets shorter than 8 characters fail
 */
export class DemoSourceAdapter implements SourceConnectorAdapter {
  readonly demo = true;

  async test(def: ConnectorDefinition, config: Record<string, string>, secrets: Record<string, string>): Promise<ConnectionTestResult> {
    const all = { ...config, ...secrets };
    const latencyMs = 180 + (hashString(JSON.stringify(config)) % 420);
    const checks: ConnectionTestResult["checks"] = [];

    const looksBad = Object.values(all).some((v) => /fail|invalid/i.test(v));
    checks.push({ label: "Network reachability (simulated)", ok: !Object.values(config).some((v) => /fail-network/i.test(v)) });

    const shortSecret = Object.entries(secrets).find(([, v]) => v.length < 8);
    const stripeSecret = def.id === "stripe" && /^sk_/.test(secrets.restrictedKey ?? "");
    const authOk = !looksBad && !shortSecret && !stripeSecret;
    checks.push({
      label: "Authentication (simulated)",
      ok: authOk,
      detail: stripeSecret
        ? "Secret keys (sk_) grant write access. Use a restricted key (rk_) with read-only scopes."
        : shortSecret
          ? `${shortSecret[0]} looks too short.`
          : looksBad
            ? "Credentials were rejected by the (simulated) source."
            : undefined,
    });
    checks.push({ label: "Read permissions on required objects (simulated)", ok: authOk });
    checks.push({
      label: "No write/admin privileges detected (simulated)",
      ok: authOk,
      detail: authOk ? "Least-privilege check passed." : undefined,
    });

    const ok = checks.every((c) => c.ok);
    await new Promise((r) => setTimeout(r, Math.min(latencyMs, 600)));
    return {
      ok,
      latencyMs,
      message: ok
        ? `Demo connection test passed — not connected to a real ${def.name} instance.`
        : `Demo connection test failed: ${checks.find((c) => !c.ok)?.detail ?? "check the connection details."}`,
      checks,
    };
  }

  async discover(def: ConnectorDefinition, config: Record<string, string>): Promise<DiscoveredTable[]> {
    const rng = createRng(hashString(def.id + JSON.stringify(config)));
    return def.demoTables.map((name) => ({
      name,
      rows: Math.round(5_000 + rng() * 2_400_000),
      columns: columnsFor(name),
    }));
  }
}
