"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Loader2, Search, X } from "lucide-react";
import { inputClass, selectClass } from "@/components/ui";

export function QueryFilters({
  searchPlaceholder,
  selects,
}: {
  searchPlaceholder: string;
  selects: { name: string; label: string; options: { value: string; label: string }[]; allLabel?: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(params.get("q") ?? "");

  const push = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    start(() => router.replace(`${pathname}${next.toString() ? `?${next}` : ""}`, { scroll: false }));
  };

  useEffect(() => {
    if ((params.get("q") ?? "") === q) return;
    const t = setTimeout(() => push("q", q.trim()), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- debounce on query text only
  }, [q]);

  const active = selects.some((s) => params.get(s.name)) || !!params.get("q");

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <label className="relative min-w-[220px] flex-1 sm:max-w-xs">
        <span className="sr-only">Search</span>
        {pending ? (
          <Loader2 aria-hidden className="pointer-events-none absolute top-2.5 left-2.5 size-3.5 animate-spin text-muted" />
        ) : (
          <Search aria-hidden className="pointer-events-none absolute top-2.5 left-2.5 size-3.5 text-muted" />
        )}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchPlaceholder} className={inputClass + " pl-8"} type="search" />
      </label>
      {selects.map((s) => (
        <label key={s.name} className="w-auto">
          <span className="sr-only">{s.label}</span>
          <select value={params.get(s.name) ?? ""} onChange={(e) => push(s.name, e.target.value)} className={selectClass + " w-auto min-w-[130px]"} aria-label={s.label}>
            <option value="">{s.allLabel ?? `All ${s.label.toLowerCase()}`}</option>
            {s.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      ))}
      {active && (
        <button
          type="button"
          onClick={() => {
            setQ("");
            start(() => router.replace(pathname, { scroll: false }));
          }}
          className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-[12.5px] text-muted hover:bg-hover hover:text-ink-2"
        >
          <X aria-hidden className="size-3.5" /> Clear
        </button>
      )}
    </div>
  );
}
