import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { AlertTriangle, CheckCircle2, CircleDashed, FlaskConical, Info, PauseCircle, XCircle } from "lucide-react";
import { cx } from "@/lib/format";

/* ------------------------------------------------------------------ */
/* Buttons                                                              */
/* ------------------------------------------------------------------ */

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

export function buttonClass(variant: Variant = "secondary", size: Size = "md", extra?: string) {
  return cx(
    "inline-flex items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50",
    size === "sm" ? "h-7 px-2.5 text-[12.5px]" : "h-8.5 px-3 text-[13px]",
    variant === "primary" && "bg-accent text-white shadow-sm hover:bg-accent-hover",
    variant === "secondary" && "border border-line-strong bg-surface text-ink-2 shadow-card hover:bg-subtle",
    variant === "ghost" && "text-ink-2 hover:bg-hover",
    variant === "danger" && "border border-line-strong bg-surface text-bad hover:bg-bad-soft",
    extra,
  );
}

export function Button({ variant, size, className, ...p }: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button type={p.type ?? "button"} className={buttonClass(variant, size, className)} {...p} />;
}

export function ButtonLink({ variant, size, className, ...p }: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...p} />;
}

/* ------------------------------------------------------------------ */
/* Surfaces                                                             */
/* ------------------------------------------------------------------ */

export function Card({ className, children, ...p }: ComponentProps<"section">) {
  return (
    <section className={cx("rounded-lg border border-line bg-surface shadow-card", className)} {...p}>
      {children}
    </section>
  );
}

export function CardHeader({ title, description, actions, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cx("flex items-start justify-between gap-3 px-4 pt-3.5 pb-2", className)}>
      <div className="min-w-0">
        <h2 className="text-[13.5px] font-semibold text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-[12.5px] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
    </div>
  );
}

export function PageHeader({ title, description, actions, eyebrow }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-[12px] font-medium text-muted">{eyebrow}</div>}
        <h1 className="text-[22px] leading-tight font-semibold tracking-[-0.01em] text-ink">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-[13.5px] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Badges                                                               */
/* ------------------------------------------------------------------ */

export type Tone = "neutral" | "accent" | "ok" | "warn" | "bad" | "info";

const TONES: Record<Tone, string> = {
  neutral: "bg-subtle text-ink-2 border-line",
  accent: "bg-accent-soft text-accent border-accent-line",
  ok: "bg-ok-soft text-ok border-[#c4e6d5]",
  warn: "bg-warn-soft text-warn border-[#f3dcb4]",
  bad: "bg-bad-soft text-bad border-[#f6cbc6]",
  info: "bg-info-soft text-info border-[#c9dbf5]",
};

export function Badge({ tone = "neutral", children, className, icon, title }: { tone?: Tone; children: ReactNode; className?: string; icon?: ReactNode; title?: string }) {
  return (
    <span title={title} className={cx("inline-flex h-5 items-center gap-1 rounded-full border px-2 text-[11.5px] font-medium whitespace-nowrap", TONES[tone], className)}>
      {icon}
      {children}
    </span>
  );
}

const STATUS: Record<string, { tone: Tone; label: string; icon: typeof CheckCircle2 }> = {
  healthy: { tone: "ok", label: "Healthy", icon: CheckCircle2 },
  connected: { tone: "ok", label: "Connected", icon: CheckCircle2 },
  success: { tone: "ok", label: "Success", icon: CheckCircle2 },
  pass: { tone: "ok", label: "Pass", icon: CheckCircle2 },
  approved: { tone: "ok", label: "Approved", icon: CheckCircle2 },
  published: { tone: "ok", label: "Published", icon: CheckCircle2 },
  active: { tone: "ok", label: "Active", icon: CheckCircle2 },
  running: { tone: "info", label: "Running", icon: FlaskConical },
  completed: { tone: "neutral", label: "Completed", icon: CheckCircle2 },
  syncing: { tone: "info", label: "Syncing", icon: CircleDashed },
  warning: { tone: "warn", label: "Warning", icon: AlertTriangle },
  warn: { tone: "warn", label: "Warning", icon: AlertTriangle },
  draft: { tone: "neutral", label: "Draft", icon: CircleDashed },
  requested: { tone: "info", label: "Requested", icon: CircleDashed },
  deprecated: { tone: "warn", label: "Deprecated", icon: AlertTriangle },
  setup: { tone: "neutral", label: "Setting up", icon: CircleDashed },
  paused: { tone: "neutral", label: "Paused", icon: PauseCircle },
  stopped: { tone: "neutral", label: "Stopped", icon: PauseCircle },
  not_run: { tone: "neutral", label: "Not run", icon: CircleDashed },
  skipped: { tone: "neutral", label: "Skipped", icon: CircleDashed },
  error: { tone: "bad", label: "Error", icon: XCircle },
  fail: { tone: "bad", label: "Fail", icon: XCircle },
  fired: { tone: "bad", label: "Fired", icon: AlertTriangle },
  resolved: { tone: "ok", label: "Resolved", icon: CheckCircle2 },
  ok: { tone: "ok", label: "OK", icon: CheckCircle2 },
  suppressed: { tone: "neutral", label: "Suppressed", icon: PauseCircle },
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const s = STATUS[status] ?? { tone: "neutral" as Tone, label: status, icon: Info };
  const Icon = s.icon;
  return (
    <Badge tone={s.tone} icon={<Icon aria-hidden className="size-3" />}>
      {label ?? s.label}
    </Badge>
  );
}

export function DemoBadge({ label = "Demo data", title = "Generated, deterministic demo data — not from a real source." }: { label?: string; title?: string }) {
  return (
    <Badge tone="warn" title={title} className="border-dashed" icon={<FlaskConical aria-hidden className="size-3" />}>
      {label}
    </Badge>
  );
}

export function SimulatedNote({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-dashed border-[#f3dcb4] bg-warn-soft/60 px-3 py-2 text-[12.5px] text-warn">
      <FlaskConical aria-hidden className="mt-0.5 size-3.5 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

export function Callout({ tone = "info", title, children, icon }: { tone?: Tone; title?: ReactNode; children?: ReactNode; icon?: ReactNode }) {
  const Icon = tone === "bad" ? XCircle : tone === "warn" ? AlertTriangle : tone === "ok" ? CheckCircle2 : Info;
  return (
    <div className={cx("flex gap-2.5 rounded-md border px-3 py-2.5 text-[13px]", TONES[tone])}>
      <span className="mt-0.5 shrink-0">{icon ?? <Icon aria-hidden className="size-4" />}</span>
      <div className="min-w-0">
        {title && <div className="font-medium">{title}</div>}
        {children && <div className={cx(!!title && "mt-0.5", "text-ink-2")}>{children}</div>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Empty / skeleton                                                     */
/* ------------------------------------------------------------------ */

export function EmptyState({ icon, title, children, action, className }: { icon?: ReactNode; title: ReactNode; children?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx("flex flex-col items-center justify-center rounded-lg border border-dashed border-line-strong bg-surface/60 px-6 py-10 text-center", className)}>
      {icon && <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-accent-soft text-accent">{icon}</div>}
      <h3 className="text-[14px] font-semibold text-ink">{title}</h3>
      {children && <div className="mt-1 max-w-md text-[13px] text-muted">{children}</div>}
      {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx("skeleton", className)} />;
}

export function PageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="space-y-4">
      <Skeleton className="h-7 w-56" />
      <Skeleton className="h-4 w-96 max-w-full" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-72" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Forms                                                                */
/* ------------------------------------------------------------------ */

export const inputClass =
  "h-8.5 w-full rounded-md border border-line-strong bg-surface px-2.5 text-[13px] text-ink shadow-[inset_0_1px_1px_rgb(14_22_38/0.03)] placeholder:text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15 aria-[invalid=true]:border-bad disabled:bg-subtle";
export const selectClass = inputClass + " pr-7 appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%235f6b7d%22 stroke-width=%222%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[right_8px_center] bg-no-repeat";
export const textareaClass = inputClass.replace("h-8.5", "min-h-20 py-2");

export function Field({ label, htmlFor, hint, error, children, className, optional }: { label: ReactNode; htmlFor?: string; hint?: ReactNode; error?: string; children: ReactNode; className?: string; optional?: boolean }) {
  return (
    <div className={cx("space-y-1", className)}>
      <label htmlFor={htmlFor} className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink-2">
        {label}
        {optional && <span className="font-normal text-faint">Optional</span>}
      </label>
      {children}
      {error ? (
        <p id={htmlFor ? `${htmlFor}-error` : undefined} role="alert" className="text-[12px] text-bad">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[12px] text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tables & misc                                                        */
/* ------------------------------------------------------------------ */

export const th = "px-3 py-2 text-left text-[11.5px] font-medium tracking-wide text-muted uppercase";
export const td = "px-3 py-2.5 text-[13px] text-ink-2 align-middle";

export function KeyValue({ items, className }: { items: { label: ReactNode; value: ReactNode }[]; className?: string }) {
  return (
    <dl className={cx("grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-[13px]", className)}>
      {items.map((it, i) => (
        <div key={i} className="contents">
          <dt className="text-muted">{it.label}</dt>
          <dd className="min-w-0 text-ink-2">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Code({ children, className }: { children: string; className?: string }) {
  return (
    <pre className={cx("overflow-x-auto rounded-md border border-line bg-[#0f1526] p-3 text-[12px] leading-relaxed text-[#d7def0]", className)}>
      <code>{children}</code>
    </pre>
  );
}

export function TabLinks({ tabs, active }: { tabs: { key: string; label: ReactNode; href: string }[]; active: string }) {
  return (
    <nav aria-label="Tabs" className="mb-4 flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.key === active ? "page" : undefined}
          className={cx(
            "-mb-px border-b-2 px-3 py-2 text-[13px] font-medium whitespace-nowrap transition-colors",
            t.key === active ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink-2",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
  return (
    <span aria-hidden className={cx("inline-flex size-6 items-center justify-center rounded-full bg-[#e4e6fb] text-[10.5px] font-semibold text-accent", className)}>
      {initials || "?"}
    </span>
  );
}
