export function relativeTime(iso: string | undefined, now = Date.now()): string {
  if (!iso) return "never";
  const diff = now - Date.parse(iso);
  const future = diff < 0;
  const s = Math.abs(diff) / 1000;
  const fmt = (n: number, u: string) => (future ? `in ${n}${u}` : `${n}${u} ago`);
  if (s < 45) return future ? "in a moment" : "just now";
  if (s < 3600) return fmt(Math.round(s / 60), "m");
  if (s < 86400) return fmt(Math.round(s / 3600), "h");
  if (s < 86400 * 30) return fmt(Math.round(s / 86400), "d");
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatDate(iso: string | undefined, withTime = false): string {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
    timeZone: iso.length === 10 ? "UTC" : undefined,
  });
}

export function formatNumber(n: number) {
  return new Intl.NumberFormat("en-US").format(n);
}

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

/** Hours since an ISO timestamp (request-time helper for server components). */
export function hoursSince(iso: string, now = Date.now()) {
  return (now - Date.parse(iso)) / 3_600_000;
}
