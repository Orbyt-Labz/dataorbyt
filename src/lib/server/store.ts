import "server-only";
import type { ApiToken, MetricRequest, QueryHistoryEntry } from "@/lib/domain/types";
import { buildSeed, type SeedState } from "@/lib/demo/seed";
import type { QueryRow } from "@/lib/adapters/types";

export interface CacheEntry {
  rows: QueryRow[];
  storedAt: number;
  dataVersion: string;
  scanBytes: number;
}

export interface StoreState extends SeedState {
  metricRequests: MetricRequest[];
  tokens: ApiToken[];
  queryHistory: QueryHistoryEntry[];
  queryCache: Map<string, CacheEntry>;
  scanUsage: Record<string, { day: string; bytes: number }>;
  activeQueries: number;
  rateBuckets: Map<string, { tokens: number; updatedAt: number }>;
  bootedAt: string;
  seq: number;
}

/**
 * In-memory demo store. One instance per server process (kept on globalThis so
 * dev-mode hot reloads don't wipe it). State resets when the server restarts.
 * Replace with a database-backed repository for production.
 */
function create(): StoreState {
  const now = new Date();
  return {
    ...buildSeed(now),
    metricRequests: [],
    tokens: [],
    queryHistory: [],
    queryCache: new Map(),
    scanUsage: {},
    activeQueries: 0,
    rateBuckets: new Map(),
    bootedAt: now.toISOString(),
    seq: 1000,
  };
}

const g = globalThis as unknown as { __dataorbytStore?: StoreState };

export function getStore(): StoreState {
  if (!g.__dataorbytStore) g.__dataorbytStore = create();
  return g.__dataorbytStore;
}

export function resetStore() {
  g.__dataorbytStore = create();
}

export function nextId(prefix: string) {
  const s = getStore();
  s.seq += 1;
  return `${prefix}_${s.seq.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}
