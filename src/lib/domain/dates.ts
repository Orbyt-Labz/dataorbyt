import type { DateRangeKey, ISODate } from "./types";

export const DATE_RANGES: { key: DateRangeKey; label: string; days: number }[] = [
  { key: "7d", label: "Last 7 days", days: 7 },
  { key: "14d", label: "Last 14 days", days: 14 },
  { key: "30d", label: "Last 30 days", days: 30 },
  { key: "60d", label: "Last 60 days", days: 60 },
  { key: "90d", label: "Last 90 days", days: 90 },
];

export const DEFAULT_RANGE: DateRangeKey = "30d";

export function isDateRangeKey(v: unknown): v is DateRangeKey {
  return typeof v === "string" && DATE_RANGES.some((r) => r.key === v);
}

export function rangeDays(key: DateRangeKey) {
  return DATE_RANGES.find((r) => r.key === key)?.days ?? 30;
}

function shift(date: ISODate, days: number): ISODate {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface ResolvedRange {
  key: DateRangeKey;
  start: ISODate;
  end: ISODate;
  prevStart: ISODate;
  prevEnd: ISODate;
  days: number;
}

/** Resolve a relative range against the last date with data (inclusive). */
export function resolveRange(end: ISODate, key: DateRangeKey): ResolvedRange {
  const days = rangeDays(key);
  const start = shift(end, -(days - 1));
  const prevEnd = shift(start, -1);
  const prevStart = shift(prevEnd, -(days - 1));
  return { key, start, end, prevStart, prevEnd, days };
}

export function daysBetween(start: ISODate, end: ISODate) {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1;
}

export { shift as shiftDate };
