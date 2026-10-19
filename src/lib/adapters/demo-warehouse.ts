import type { FactField, Grain, ISODate } from "@/lib/domain/types";
import { DIMENSIONS, dimensionShare, type DailyFact } from "@/lib/demo/facts";
import type { QueryEstimate, QueryPlan, QueryRow, WarehouseAdapter } from "./types";

export function bucketStart(date: ISODate, grain: Grain): ISODate {
  if (grain === "day") return date;
  if (grain === "month") return `${date.slice(0, 7)}-01`;
  const d = new Date(`${date}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

/**
 * Executes compiled plans against the in-memory demo mart (fct_daily_business).
 * It mimics a pre-aggregated mart: dimension breakdowns are derived from
 * deterministic shares rather than row-level data.
 */
export class DemoWarehouseAdapter implements WarehouseAdapter {
  readonly kind = "demo-duckdb-like";
  readonly demo = true;

  constructor(
    private readonly getFacts: (projectId: string) => DailyFact[] | undefined,
    private readonly loadedAt: (projectId: string) => string,
  ) {}

  coverage(projectId: string) {
    const facts = this.getFacts(projectId);
    if (!facts || facts.length === 0) return null;
    return { start: facts[0].date, end: facts[facts.length - 1].date, loadedAt: this.loadedAt(projectId) };
  }

  estimate(plan: QueryPlan): QueryEstimate {
    const days = Math.max(1, Math.round((Date.parse(plan.end) - Date.parse(plan.start)) / 86_400_000) + 1);
    const groups = plan.groupBy ? (DIMENSIONS[plan.groupBy]?.values.length ?? 1) : 1;
    // Pre-aggregated mart: ~64 KB per day per group partition.
    return { scanBytes: days * groups * 64 * 1024, rows: Math.ceil(days / (plan.grain === "day" ? 1 : plan.grain === "week" ? 7 : 30)) * groups };
  }

  fieldSeries(projectId: string, field: FactField, start: ISODate, end: ISODate) {
    return (this.getFacts(projectId) ?? []).filter((f) => f.date >= start && f.date <= end).map((f) => ({ date: f.date, value: f[field] }));
  }

  async execute(plan: QueryPlan, opts: { timeoutMs: number; rowLimit: number }): Promise<QueryRow[]> {
    const run = async () => this.run(plan, opts.rowLimit);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Query exceeded timeout of ${opts.timeoutMs}ms`)), opts.timeoutMs);
    });
    try {
      return await Promise.race([run(), timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  private run(plan: QueryPlan, rowLimit: number): QueryRow[] {
    const facts = (this.getFacts(plan.projectId) ?? []).filter((f) => f.date >= plan.start && f.date <= plan.end);
    const groups = plan.groupBy
      ? (DIMENSIONS[plan.groupBy]?.values.map((v) => v.key) ?? []).filter((g) => {
          const f = plan.filters.find((x) => x.dimension === plan.groupBy);
          return !f || f.values.includes(g);
        })
      : [undefined];

    const shareFor = (date: ISODate, field: string, group?: string) => {
      let s = 1;
      for (const f of plan.filters) {
        if (f.dimension === plan.groupBy) continue;
        s *= f.values.reduce((acc, v) => acc + dimensionShare(f.dimension, v, date, field), 0);
      }
      if (plan.groupBy && group) s *= dimensionShare(plan.groupBy, group, date, field);
      return s;
    };

    type Acc = { num: number; den: number; n: number };
    const buckets = new Map<string, Acc>();
    const agg = plan.aggregation;

    for (const f of facts) {
      const period = bucketStart(f.date, plan.grain);
      for (const g of groups) {
        const key = `${period}|${g ?? ""}`;
        const acc = buckets.get(key) ?? { num: 0, den: 0, n: 0 };
        if (agg.type === "sum") {
          const base = f[agg.field] - (agg.minus ?? []).reduce((a, m) => a + f[m], 0);
          acc.num += base * shareFor(f.date, agg.field, g);
        } else if (agg.type === "gauge") {
          acc.num += f[agg.field] * shareFor(f.date, agg.field, g);
          acc.n += 1;
        } else {
          acc.num += f[agg.numerator] * shareFor(f.date, agg.numerator, g);
          acc.den += f[agg.denominator] * shareFor(f.date, agg.denominator, g);
        }
        buckets.set(key, acc);
      }
    }

    const rows: QueryRow[] = [];
    for (const [key, acc] of buckets) {
      const [period, group] = key.split("|");
      let value: number;
      if (agg.type === "sum") value = acc.num;
      else if (agg.type === "gauge") value = acc.n ? acc.num / acc.n : 0;
      else value = acc.den ? acc.num / acc.den : 0;
      rows.push({
        period,
        group: group || undefined,
        value: Math.round(value * 10000) / 10000,
        ...(agg.type === "ratio" ? { numerator: Math.round(acc.num), denominator: Math.round(acc.den) } : {}),
      });
      if (rows.length >= rowLimit) break;
    }
    rows.sort((a, b) => (a.period === b.period ? (a.group ?? "").localeCompare(b.group ?? "") : a.period.localeCompare(b.period)));
    return rows;
  }
}
