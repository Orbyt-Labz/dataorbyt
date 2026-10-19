import type { ChartFilter } from "@/lib/domain/types";

/** Parse `?f=dim:v1,v2` params, keeping only whitelisted dimensions and values. */
export function parseFilterParams(raw: string | string[] | undefined, allowed: { key: string; values: string[] }[]): ChartFilter[] {
  const list = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];
  const out: ChartFilter[] = [];
  for (const item of list.slice(0, 5)) {
    const [dimension, vals] = item.split(":");
    const def = allowed.find((a) => a.key === dimension);
    if (!def || out.some((f) => f.dimension === dimension)) continue;
    const values = (vals ?? "").split(",").filter((v) => def.values.includes(v));
    if (values.length) out.push({ dimension, values });
  }
  return out;
}
