"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { CalendarDays, Loader2 } from "lucide-react";
import { DATE_RANGES } from "@/lib/domain/dates";
import type { DateRangeKey } from "@/lib/domain/types";
import { selectClass } from "./ui";

export function DateRangeSelect({ value, warnAboveDays = 60 }: { value: DateRangeKey; warnAboveDays?: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const days = DATE_RANGES.find((r) => r.key === value)?.days ?? 30;
  return (
    <div className="flex items-center gap-2">
      <label className="relative flex items-center">
        <span className="sr-only">Date range</span>
        {pending ? <Loader2 aria-hidden className="pointer-events-none absolute left-2.5 size-3.5 animate-spin text-muted" /> : <CalendarDays aria-hidden className="pointer-events-none absolute left-2.5 size-3.5 text-muted" />}
        <select
          value={value}
          onChange={(e) => {
            const next = new URLSearchParams(params.toString());
            next.set("range", e.target.value);
            start(() => router.push(`${pathname}?${next.toString()}`, { scroll: false }));
          }}
          className={selectClass + " w-40 pl-8"}
        >
          {DATE_RANGES.map((r) => (
            <option key={r.key} value={r.key}>
              {r.label}
            </option>
          ))}
        </select>
      </label>
      {days > warnAboveDays && (
        <span className="hidden text-[11.5px] text-warn md:inline" title="Longer ranges scan more data and count against the project's query budget.">
          Larger range — higher scan cost
        </span>
      )}
    </div>
  );
}
