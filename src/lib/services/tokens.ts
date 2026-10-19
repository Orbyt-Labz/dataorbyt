import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { ApiToken } from "@/lib/domain/types";
import { getStore, nextId } from "@/lib/server/store";
import { audit, parseInput, ServiceError, type Actor } from "./context";

export const tokenSchema = z.object({
  name: z.string().trim().min(2, "Name is required").max(60),
  scopes: z.array(z.enum(["read", "draft", "publish"])).min(1, "Choose at least one scope"),
  projectIds: z.union([z.literal("all"), z.array(z.string()).min(1, "Choose at least one project")]),
});

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** Public view of a token (no hash). */
export type TokenView = Omit<ApiToken, "hash">;
const view = (t: ApiToken): TokenView => {
  const { hash, ...rest } = t;
  void hash;
  return rest;
};

export function listTokens(): TokenView[] {
  return getStore().tokens.map(view);
}

/**
 * Creates a token server-side. The plaintext is returned exactly once and only
 * its SHA-256 hash is stored. Tokens live in server memory in this demo and are
 * lost when the server restarts.
 */
export function createToken(actor: Actor, input: unknown): { token: TokenView; plaintext: string } {
  if (actor.type !== "user") throw new ServiceError("forbidden", "Only workspace members can create tokens");
  const data = parseInput(tokenSchema, input);
  const s = getStore();
  if (data.projectIds !== "all") {
    const bad = data.projectIds.filter((id) => !s.projects.some((p) => p.id === id));
    if (bad.length) throw new ServiceError("invalid_input", `Unknown project(s): ${bad.join(", ")}`);
  }
  const secret = randomBytes(24).toString("base64url");
  const plaintext = `dob_demo_${secret}`;
  const token: ApiToken = {
    id: nextId("tok"),
    name: data.name,
    prefix: plaintext.slice(0, 13),
    hash: sha256(plaintext),
    scopes: data.scopes,
    projectIds: data.projectIds,
    createdAt: new Date().toISOString(),
  };
  s.tokens.unshift(token);
  audit(actor, "token.created", { target: token.name, detail: `scopes: ${data.scopes.join(", ")}` });
  return { token: view(token), plaintext };
}

export function revokeToken(actor: Actor, id: string) {
  const t = getStore().tokens.find((x) => x.id === id);
  if (!t) throw new ServiceError("not_found", "Token not found");
  t.revokedAt = new Date().toISOString();
  audit(actor, "token.revoked", { target: t.name });
}

/** Resolve a bearer token to an MCP actor, or null. */
export function authenticateBearer(header: string | null): Actor | null {
  if (!header?.startsWith("Bearer ")) return null;
  const presented = header.slice(7).trim();
  if (!presented) return null;
  const hash = Buffer.from(sha256(presented), "hex");

  // Optional fixed dev token from the environment (never shipped to the client).
  const envToken = process.env.DATAORBYT_MCP_DEV_TOKEN;
  if (envToken && envToken.length >= 16) {
    const envHash = Buffer.from(sha256(envToken), "hex");
    if (timingSafeEqual(hash, envHash)) return { type: "mcp", name: "env dev token", projectIds: "all", scopes: ["read", "draft"] };
  }

  for (const t of getStore().tokens) {
    if (t.revokedAt) continue;
    if (timingSafeEqual(hash, Buffer.from(t.hash, "hex"))) {
      t.lastUsedAt = new Date().toISOString();
      return { type: "mcp", name: t.name, projectIds: t.projectIds, scopes: t.scopes, tokenId: t.id };
    }
  }
  return null;
}

/** Token-bucket rate limit: `capacity` requests, refilled at `perMinute`. */
export function rateLimit(key: string, capacity = 60, perMinute = 60): { ok: boolean; retryAfterSec: number } {
  const s = getStore();
  const now = Date.now();
  const b = s.rateBuckets.get(key) ?? { tokens: capacity, updatedAt: now };
  b.tokens = Math.min(capacity, b.tokens + ((now - b.updatedAt) / 60_000) * perMinute);
  b.updatedAt = now;
  if (b.tokens < 1) {
    s.rateBuckets.set(key, b);
    return { ok: false, retryAfterSec: Math.ceil(((1 - b.tokens) / perMinute) * 60) };
  }
  b.tokens -= 1;
  s.rateBuckets.set(key, b);
  return { ok: true, retryAfterSec: 0 };
}
