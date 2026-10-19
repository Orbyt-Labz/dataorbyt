"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Check, Copy, X } from "lucide-react";
import { cx } from "@/lib/format";
import { buttonClass } from "./ui";

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={cx(
        "m-auto max-h-[90vh] w-[calc(100%-2rem)] rounded-xl border border-line bg-surface p-0 text-ink shadow-pop backdrop:bg-[#0e1626]/35 backdrop:backdrop-blur-[1px]",
        size === "sm" && "max-w-md",
        size === "md" && "max-w-xl",
        size === "lg" && "max-w-3xl",
        size === "xl" && "max-w-5xl",
      )}
    >
      {open && (
        <div className="flex max-h-[90vh] flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div>
              <h2 id={titleId} className="text-[15px] font-semibold">
                {title}
              </h2>
              {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
            </div>
            <button type="button" onClick={onClose} aria-label="Close dialog" className="rounded-md p-1 text-muted hover:bg-hover hover:text-ink">
              <X className="size-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-subtle/50 px-5 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

export function CopyButton({ value, label = "Copy", className, size = "sm" }: { value: string; label?: string; className?: string; size?: "sm" | "md" }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <button
      type="button"
      className={buttonClass("secondary", size, className)}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setFailed(false);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          setFailed(true);
        }
      }}
      aria-live="polite"
    >
      {copied ? <Check aria-hidden className="size-3.5 text-ok" /> : <Copy aria-hidden className="size-3.5" />}
      {copied ? "Copied" : failed ? "Copy failed" : label}
    </button>
  );
}

export function CodeBlock({ code, label, className }: { code: string; label?: string; className?: string }) {
  return (
    <div className={cx("overflow-hidden rounded-md border border-line", className)}>
      <div className="flex items-center justify-between border-b border-[#1e2740] bg-[#141b2e] px-3 py-1.5">
        <span className="font-mono text-[11.5px] text-[#9aa6c2]">{label}</span>
        <CopyButton value={code} className="h-6 border-[#2a3554] bg-[#1b2440] text-[#d7def0] shadow-none hover:bg-[#232e50]" />
      </div>
      <pre className="overflow-x-auto bg-[#0f1526] p-3 text-[12px] leading-relaxed text-[#d7def0]">
        <code>{code}</code>
      </pre>
    </div>
  );
}

/** Small inline toast-ish status line for form results. */
export function FormMessage({ state }: { state?: { ok?: boolean; message?: string } | null }) {
  if (!state?.message) return null;
  return (
    <p role="status" className={cx("text-[12.5px]", state.ok ? "text-ok" : "text-bad")}>
      {state.message}
    </p>
  );
}
