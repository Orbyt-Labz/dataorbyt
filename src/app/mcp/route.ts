import { connection } from "next/server";
import { handleRpc, SERVER_INFO } from "@/lib/mcp/server";
import { authenticateBearer, rateLimit } from "@/lib/services/tokens";
import { audit } from "@/lib/services/context";

const MAX_BODY_BYTES = 64 * 1024;

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
  });
}

/** Reject browser cross-origin requests (DNS-rebinding protection, per the MCP spec). */
function originAllowed(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return true; // non-browser MCP clients don't send Origin
  try {
    const allowed = (process.env.DATAORBYT_ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    return new URL(origin).host === req.headers.get("host") || allowed.includes(origin);
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  await connection();
  if (!originAllowed(req)) return json({ error: "origin_not_allowed" }, 403);

  const actor = authenticateBearer(req.headers.get("authorization"));
  if (!actor) {
    return json({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "Unauthorized: provide a DataOrbyt API token as a Bearer token" } }, 401, {
      "www-authenticate": 'Bearer realm="dataorbyt-mcp"',
    });
  }

  const limit = rateLimit(`mcp:${actor.tokenId ?? actor.name}`, 60, 60);
  if (!limit.ok) {
    audit(actor, "mcp.rate_limited");
    return json({ jsonrpc: "2.0", id: null, error: { code: -32029, message: "Rate limit exceeded" } }, 429, { "retry-after": String(limit.retryAfterSec) });
  }

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Request too large" } }, 413);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400);
  }

  if (Array.isArray(body)) {
    if (body.length > 20) return json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Batch too large" } }, 400);
    const results = (await Promise.all(body.map((m) => handleRpc(actor, m)))).filter(Boolean);
    return results.length ? json(results) : new Response(null, { status: 202 });
  }
  const result = await handleRpc(actor, body);
  return result ? json(result) : new Response(null, { status: 202 });
}

export async function GET() {
  await connection();
  // This server does not offer a server-initiated SSE stream.
  return json({ error: "method_not_allowed", message: `${SERVER_INFO.name} MCP endpoint accepts POST (Streamable HTTP, JSON responses).` }, 405, { allow: "POST" });
}

export async function DELETE() {
  await connection();
  return new Response(null, { status: 405, headers: { allow: "POST" } });
}
