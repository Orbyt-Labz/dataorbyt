"use client";

import { useState } from "react";
import { cx } from "@/lib/format";
import { CodeBlock } from "@/components/ui-client";

export function SqlTabs({ tabs }: { tabs: { key: string; label: string; code: string; filename: string }[] }) {
  const [active, setActive] = useState(tabs[0]?.key);
  const tab = tabs.find((t) => t.key === active) ?? tabs[0];
  return (
    <div>
      <div role="tablist" aria-label="SQL" className="mb-2 flex gap-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            id={`tab-${t.key}`}
            aria-selected={t.key === tab.key}
            aria-controls={`panel-${t.key}`}
            onClick={() => setActive(t.key)}
            className={cx("rounded-md px-2.5 py-1 text-[12.5px] font-medium", t.key === tab.key ? "bg-accent-soft text-accent" : "text-muted hover:bg-hover")}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab.key}`} aria-labelledby={`tab-${tab.key}`}>
        <CodeBlock code={tab.code} label={tab.filename} />
      </div>
    </div>
  );
}
