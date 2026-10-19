import type { FactField, ISODate } from "@/lib/domain/types";

/** mulberry32 — small, fast, deterministic PRNG. */
export function createRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export type DailyFact = { date: ISODate } & Record<FactField, number>;

export interface FactProfile {
  seed: number;
  baseVisitors: number;
  dailyGrowth: number; // e.g. 0.004 = 0.4%/day
  signupRate: number;
  activationRate: number;
  baseDau: number;
  startingSubscriptions: number;
  arpuMonthly: number;
  /** Day offsets from the end (0 = latest) where revenue dips, to make alerts realistic. */
  incidents?: { daysAgo: number; revenueFactor: number }[];
}

export const DIMENSIONS: Record<string, { label: string; values: { key: string; share: number }[] }> = {
  channel: {
    label: "Acquisition channel",
    values: [
      { key: "organic", share: 0.34 },
      { key: "paid_search", share: 0.24 },
      { key: "referral", share: 0.16 },
      { key: "social", share: 0.12 },
      { key: "direct", share: 0.14 },
    ],
  },
  plan: {
    label: "Plan",
    values: [
      { key: "starter", share: 0.46 },
      { key: "growth", share: 0.38 },
      { key: "scale", share: 0.16 },
    ],
  },
  country: {
    label: "Country",
    values: [
      { key: "US", share: 0.44 },
      { key: "GB", share: 0.13 },
      { key: "DE", share: 0.1 },
      { key: "IN", share: 0.12 },
      { key: "CA", share: 0.07 },
      { key: "other", share: 0.14 },
    ],
  },
  platform: {
    label: "Platform",
    values: [
      { key: "web", share: 0.68 },
      { key: "ios", share: 0.19 },
      { key: "android", share: 0.13 },
    ],
  },
};

export function toISODate(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

export function addDays(date: ISODate, days: number): ISODate {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return toISODate(d);
}

/**
 * Generates `days` of deterministic daily facts ending at `endDate` (inclusive).
 * Values depend only on the profile seed and the day index, so the same profile
 * always produces the same series shape.
 */
export function generateDailyFacts(profile: FactProfile, endDate: ISODate, days = 90): DailyFact[] {
  const rng = createRng(profile.seed);
  const noise = (spread: number) => 1 + (rng() * 2 - 1) * spread;
  const out: DailyFact[] = [];
  let subs = profile.startingSubscriptions;
  const signupsHistory: number[] = [];
  const trialsHistory: number[] = [];

  for (let i = 0; i < days; i++) {
    const date = addDays(endDate, i - (days - 1));
    const daysAgo = days - 1 - i;
    const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
    const season = dow === 0 || dow === 6 ? 0.76 : dow === 1 ? 1.06 : 1;
    const trend = Math.pow(1 + profile.dailyGrowth, i);

    const visitors = Math.round(profile.baseVisitors * trend * season * noise(0.09));
    const signups = Math.round(visitors * profile.signupRate * noise(0.12));
    // Activation improves slowly over the window (product work paying off).
    const activationRate = profile.activationRate * (1 + i * 0.0012) * noise(0.07);
    const activated = Math.round(signups * Math.min(activationRate, 0.9));
    const dau = Math.round(profile.baseDau * trend * season * noise(0.06));
    const wau = Math.round(profile.baseDau * trend * 2.7 * noise(0.025));
    const trialsStarted = Math.round(signups * 0.34 * noise(0.1));
    const lagTrials = trialsHistory.length >= 14 ? trialsHistory[trialsHistory.length - 14] : trialsStarted;
    const trialConversions = Math.round(lagTrials * 0.19 * noise(0.22));
    const churned = Math.round(subs * 0.0011 * noise(0.5));
    subs = Math.max(0, subs + trialConversions - churned);

    const incident = profile.incidents?.find((x) => x.daysAgo === daysAgo);
    const grossRevenue =
      Math.round(((subs * profile.arpuMonthly) / 30) * season * noise(0.08) * (incident?.revenueFactor ?? 1) * 100) / 100;
    const refunds = Math.round(grossRevenue * 0.018 * noise(0.6) * 100) / 100;
    const fees = Math.round((grossRevenue * 0.029 + trialConversions * 0.3) * 100) / 100;

    const cohort = signupsHistory.length >= 7 ? signupsHistory[signupsHistory.length - 7] : signups;
    const retained = Math.round(cohort * 0.37 * (1 + i * 0.0008) * noise(0.1));

    signupsHistory.push(signups);
    trialsHistory.push(trialsStarted);

    out.push({
      date,
      visitors,
      signups,
      activated,
      dau,
      wau,
      trials_started: trialsStarted,
      trial_conversions: trialConversions,
      gross_revenue: grossRevenue,
      refunds,
      fees,
      active_subscriptions: subs,
      churned_subscriptions: churned,
      retained_d7: retained,
      cohort_d7: cohort,
    });
  }
  return out;
}

/** Deterministic share for a dimension value on a given date, with mild day-to-day drift. */
export function dimensionShare(dimension: string, value: string, date: ISODate, salt: string): number {
  const dim = DIMENSIONS[dimension];
  if (!dim) return 0;
  const weights = dim.values.map((v) => {
    const r = createRng(hashString(`${salt}|${dimension}|${v.key}|${date}`))();
    return v.share * (1 + (r * 2 - 1) * 0.12);
  });
  const total = weights.reduce((a, b) => a + b, 0);
  const idx = dim.values.findIndex((v) => v.key === value);
  return idx === -1 ? 0 : weights[idx] / total;
}

/** Weekly signup cohorts with retention by week, for cohort heatmaps. */
export function generateCohorts(seed: number, endDate: ISODate, weeks = 8) {
  const rng = createRng(seed ^ 0x9e3779b9);
  const cohorts: { cohort: ISODate; size: number; retention: (number | null)[] }[] = [];
  for (let c = 0; c < weeks; c++) {
    const cohortStart = addDays(endDate, -7 * (weeks - c));
    const size = Math.round(420 + c * 28 + rng() * 60);
    const improvement = c * 0.006;
    const retention: (number | null)[] = [];
    for (let w = 0; w < weeks; w++) {
      if (w >= weeks - c) {
        retention.push(null);
        continue;
      }
      const base = w === 0 ? 1 : (0.46 + improvement) * Math.pow(0.86, w - 1);
      retention.push(Math.round(Math.min(1, base * (1 + (rng() * 2 - 1) * 0.05)) * 1000) / 1000);
    }
    cohorts.push({ cohort: cohortStart, size, retention });
  }
  return cohorts;
}

export const FACT_FIELDS = [
  "visitors",
  "signups",
  "activated",
  "dau",
  "wau",
  "trials_started",
  "trial_conversions",
  "gross_revenue",
  "refunds",
  "fees",
  "active_subscriptions",
  "churned_subscriptions",
  "retained_d7",
  "cohort_d7",
] as const satisfies readonly FactField[];
