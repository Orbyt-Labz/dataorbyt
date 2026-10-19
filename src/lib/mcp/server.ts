import "server-only";
import { ServiceError, type Actor } from "@/lib/services/context";
import { callTool, toolList } from "./tools";

/**
 * Minimal MCP server over Streamable HTTP (JSON responses, stateless).
 * Supports: initialize, notifications/initialized, ping, tools/list, tools/call.
 * Spec: https://modelcontextprotocol.io/specification
 */
export const SUPPORTED_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
export const SERVER_INFO = { name: "dataorbyt", title: "DataOrbyt (demo)", version: "0.1.0" };

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

type JsonRpcResponse = { jsonrpc: "2.0"; id: string | number | null; result?: unknown; error?: { code: number; message: string; data?: unknown } };

const rpcError = (id: JsonRpcRequest["id"], code: number, message: string, data?: unknown): JsonRpcResponse => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message, data } });

export async function handleRpc(actor: Actor, msg: unknown): Promise<JsonRpcResponse | null> {
  if (!msg || typeof msg !== "object" || (msg as JsonRpcRequest).jsonrpc !== "2.0" || typeof (msg as JsonRpcRequest).method !== "string") {
    return rpcError(null, -32600, "Invalid Request");
  }
  const req = msg as JsonRpcRequest;
  const isNotification = req.id === undefined;

  switch (req.method) {
    case "initialize": {
      const requested = String(req.params?.protocolVersion ?? "");
      const version = SUPPORTED_PROTOCOL_VERSIONS.includes(requested) ? requested : SUPPORTED_PROTOCOL_VERSIONS[0];
      return {
        jsonrpc: "2.0",
        id: req.id ?? null,
        result: {
          protocolVersion: version,
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
          instructions:
            "DataOrbyt exposes governed analytics. Query only catalog metrics via preview_metric_query; arbitrary SQL is not available. Mutating tools create drafts. publish_dashboard is two-step and must only be confirmed after the user explicitly approves the preview. All data in this deployment is demo data.",
        },
      };
    }
    case "notifications/initialized":
    case "notifications/cancelled":
      return null;
    case "ping":
      return { jsonrpc: "2.0", id: req.id ?? null, result: {} };
    case "tools/list":
      return { jsonrpc: "2.0", id: req.id ?? null, result: { tools: toolList() } };
    case "tools/call": {
      const name = String(req.params?.name ?? "");
      try {
        const result = await callTool(actor, name, req.params?.arguments ?? {});
        const structured = Array.isArray(result) ? { items: result } : (result as Record<string, unknown>);
        return { jsonrpc: "2.0", id: req.id ?? null, result: { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], structuredContent: structured, isError: false } };
      } catch (e) {
        if (e instanceof ServiceError) {
          if (e.code === "not_found" && e.message.startsWith("Unknown tool")) return rpcError(req.id, -32602, e.message);
          // Tool-level errors are returned as results so the model can see and correct them.
          return {
            jsonrpc: "2.0",
            id: req.id ?? null,
            result: { content: [{ type: "text", text: `${e.code}: ${e.message}` }], structuredContent: { error: e.code, message: e.message, details: e.details ?? null }, isError: true },
          };
        }
        console.error("MCP tool error", e);
        return rpcError(req.id, -32603, "Internal error");
      }
    }
    default:
      return isNotification ? null : rpcError(req.id, -32601, `Method not found: ${req.method}`);
  }
}
