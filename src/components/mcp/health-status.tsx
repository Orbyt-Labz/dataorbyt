"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, RefreshCw, XCircle } from "lucide-react";
import { Button } from "@/components/ui";
import { CopyButton } from "@/components/ui-client";
import { formatDate } from "@/lib/format";

type Health = { status: string; mcp: { path: string; transport: string; protocolVersions: string[]; toolCount: number }; startedAt: string };

/** Shows "responded" only after the server actually answers. */
export function HealthStatus() {
  const [state, setState] = useState<{ kind: "checking" } | { kind: "ok"; data: Health; at: Date; ms: number } | { kind: "error"; message: string }>({ kind: "checking" });

  const check = useCallback(async () => {
    setState({ kind: "checking" });
    const t0 = performance.now();
    try {
      const res = await fetch("/api/health", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as Health;
      if (data.status !== "ok") throw new Error("Unexpected status");
      setState({ kind: "ok", data, at: new Date(), ms: Math.round(performance.now() - t0) });
    } catch (e) {
      setState({ kind: "error", message: e instanceof Error ? e.message : "Request failed" });
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial health probe on mount
    void check();
  }, [check]);

  return (
    <div className="space-y-2" aria-live="polite">
      <div className="flex items-center justify-between gap-2">
        {state.kind === "checking" && (
          <span className="flex items-center gap-2 text-[13px] text-muted">
            <Loader2 className="size-4 animate-spin" /> Checking local server…
          </span>
        )}
        {state.kind === "ok" && (
          <span className="flex items-center gap-2 text-[13px] font-medium text-ok">
            <CheckCircle2 className="size-4" /> Local server responded ({state.ms} ms)
          </span>
        )}
        {state.kind === "error" && (
          <span className="flex items-center gap-2 text-[13px] font-medium text-bad">
            <XCircle className="size-4" /> Not reachable — {state.message}
          </span>
        )}
        <Button size="sm" variant="ghost" onClick={check} aria-label="Re-check health">
          <RefreshCw className="size-3.5" />
        </Button>
      </div>
      {state.kind === "ok" && (
        <p className="text-[12px] text-muted">
          {state.data.mcp.transport} · protocol {state.data.mcp.protocolVersions[0]} · {state.data.mcp.toolCount} tools · up since {formatDate(state.data.startedAt, true)}. Health is unauthenticated; the MCP endpoint itself returns 401 without a bearer token.
        </p>
      )}
    </div>
  );
}

export function LocalEndpoint() {
  const [origin, setOrigin] = useState<string | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- origin is only known in the browser
    setOrigin(window.location.origin);
  }, []);
  const url = origin ? `${origin}/mcp` : "";
  return (
    <div className="flex items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded-md border border-line bg-subtle px-2.5 py-1.5 font-mono text-[12.5px] text-ink">{url || "…"}</code>
      {url && <CopyButton value={url} />}
    </div>
  );
}
