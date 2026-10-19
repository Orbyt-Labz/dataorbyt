import { connection } from "next/server";
import { getStore } from "@/lib/server/store";
import { SERVER_INFO, SUPPORTED_PROTOCOL_VERSIONS } from "@/lib/mcp/server";
import { TOOLS } from "@/lib/mcp/tools";

/** Unauthenticated health/status. Reveals no workspace data. */
export async function GET() {
  await connection();
  const s = getStore();
  return Response.json(
    {
      status: "ok",
      service: "dataorbyt",
      mode: "demo",
      startedAt: s.bootedAt,
      mcp: {
        path: "/mcp",
        transport: "streamable-http (JSON responses)",
        auth: "Bearer token",
        protocolVersions: SUPPORTED_PROTOCOL_VERSIONS,
        server: SERVER_INFO,
        toolCount: TOOLS.length,
      },
      warehouse: "demo adapter (in-memory)",
    },
    { headers: { "cache-control": "no-store" } },
  );
}
