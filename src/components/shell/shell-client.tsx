"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import {
  Bell,
  BookOpen,
  Boxes,
  Cable,
  Check,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  CircleHelp,
  FlaskConical,
  FolderKanban,
  Gauge,
  LayoutDashboard,
  Menu,
  PlugZap,
  Search,
  Settings,
  Siren,
  Sigma,
  X,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { Avatar } from "@/components/ui";
import { cx, relativeTime } from "@/lib/format";
import { switchProject } from "@/app/actions/shell";

export interface SearchItem {
  type: string;
  label: string;
  href: string;
}

interface Props {
  project: { id: string; name: string; environment: string; sampleData: boolean } | null;
  projects: { id: string; name: string; environment: string; status: string }[];
  setup: { label: string; done: boolean; href: string }[];
  notifications: { id: string; title: string; body: string; at: string; severity: string; acknowledged: boolean }[];
  search: SearchItem[];
  user: { name: string; email: string };
  children: ReactNode;
}

export const NAV = [
  { href: "/", label: "Overview", icon: Gauge },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/connections", label: "Connections", icon: Cable },
  { href: "/dashboards", label: "Dashboards", icon: LayoutDashboard },
  { href: "/metrics", label: "Metrics", icon: Sigma },
  { href: "/experiments", label: "Experiments", icon: FlaskConical },
  { href: "/alerts", label: "Alerts", icon: Siren },
  { href: "/dbt", label: "dbt", icon: Boxes },
  { href: "/mcp-api", label: "MCP & API", icon: PlugZap, highlight: true },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return { open, setOpen, ref };
}

export function ShellClient({ project, projects, setup, notifications, search, user, children }: Props) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    // UI preference only (not sensitive), so localStorage is fine here.
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate a client-only preference
      setCollapsed(localStorage.getItem("dob.sidebar") === "collapsed");
    } catch {}
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- close the mobile drawer on navigation
    setMobileOpen(false);
  }, [pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem("dob.sidebar", c ? "expanded" : "collapsed");
      } catch {}
      return !c;
    });
  };

  const current = NAV.find((n) => isActive(pathname, n.href));
  const done = setup.filter((s) => s.done).length;

  const sidebar = (isMobile: boolean) => {
    const narrow = collapsed && !isMobile;
    return (
      <div className="flex h-full flex-col">
        <div className={cx("flex h-14 items-center border-b border-line", narrow ? "justify-center px-2" : "justify-between px-4")}>
          <Link href="/" aria-label="DataOrbyt home">
            <Logo collapsed={narrow} />
          </Link>
          {isMobile && (
            <button type="button" onClick={() => setMobileOpen(false)} aria-label="Close navigation" className="rounded-md p-1.5 text-muted hover:bg-hover">
              <X className="size-4" />
            </button>
          )}
        </div>
        <nav aria-label="Primary" className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {NAV.map((n) => {
            const active = isActive(pathname, n.href);
            const Icon = n.icon;
            return (
              <Link
                key={n.href}
                href={n.href}
                title={narrow ? n.label : undefined}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "group flex h-8.5 items-center gap-2.5 rounded-md text-[13px] font-medium transition-colors",
                  narrow ? "justify-center px-0" : "px-2.5",
                  active ? "bg-accent-soft text-accent" : "text-ink-2 hover:bg-hover",
                )}
              >
                <Icon aria-hidden className={cx("size-4 shrink-0", active ? "text-accent" : "text-muted group-hover:text-ink-2")} />
                {!narrow && <span className="truncate">{n.label}</span>}
                {!narrow && "highlight" in n && n.highlight && (
                  <span className="ml-auto rounded-sm bg-[#0e1626] px-1.5 py-px text-[10px] font-semibold tracking-wide text-white">MCP</span>
                )}
              </Link>
            );
          })}
        </nav>
        {project && setup.length > 0 && done < setup.length && !narrow && (
          <div className="mx-2 mb-2 rounded-lg border border-line bg-surface p-3">
            <div className="flex items-center justify-between text-[12px] font-medium text-ink-2">
              <span>Project setup</span>
              <span className="tabular text-muted">
                {done}/{setup.length}
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-subtle" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={setup.length} aria-label="Setup progress">
              <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(done / setup.length) * 100}%` }} />
            </div>
            <ul className="mt-2.5 space-y-1">
              {setup.map((s) => (
                <li key={s.label}>
                  <Link href={s.href} className="flex items-center gap-2 rounded px-1 py-0.5 text-[12px] hover:bg-hover">
                    <span className={cx("flex size-3.5 items-center justify-center rounded-full border", s.done ? "border-ok bg-ok text-white" : "border-line-strong")}>
                      {s.done && <Check aria-hidden className="size-2.5" strokeWidth={3} />}
                    </span>
                    <span className={cx(s.done ? "text-muted line-through" : "text-ink-2")}>{s.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
        {!isMobile && (
          <div className="border-t border-line p-2">
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-expanded={!collapsed}
              className={cx("flex h-8 w-full items-center gap-2 rounded-md text-[12.5px] text-muted hover:bg-hover", narrow ? "justify-center" : "px-2.5")}
            >
              {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
              {!narrow && "Collapse"}
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex min-h-dvh">
      <aside className={cx("sticky top-0 hidden h-dvh shrink-0 border-r border-line bg-[#fbfbfc] transition-[width] duration-200 lg:block", collapsed ? "w-15" : "w-60")}>
        {sidebar(false)}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-[#0e1626]/30" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 border-r border-line bg-[#fbfbfc] shadow-pop">{sidebar(true)}</aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-surface/90 px-3 backdrop-blur sm:px-5">
          <button type="button" className="rounded-md p-1.5 text-muted hover:bg-hover lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
            <Menu className="size-5" />
          </button>
          <ProjectSelector project={project} projects={projects} />
          <span aria-hidden className="hidden text-line-strong sm:inline">
            /
          </span>
          <span className="hidden truncate text-[13px] font-medium text-ink-2 sm:inline">{current?.label ?? "DataOrbyt"}</span>

          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="hidden h-8 w-56 items-center gap-2 rounded-md border border-line bg-subtle/60 px-2.5 text-[12.5px] text-faint hover:border-line-strong md:flex"
            >
              <Search aria-hidden className="size-3.5" />
              Search {project ? project.name : ""}…
              <kbd className="ml-auto rounded border border-line bg-surface px-1 font-mono text-[10.5px] text-muted">⌘K</kbd>
            </button>
            <button type="button" onClick={() => setSearchOpen(true)} aria-label="Search" className="rounded-md p-2 text-muted hover:bg-hover md:hidden">
              <Search className="size-4" />
            </button>
            <HelpMenu />
            <NotificationsMenu items={notifications} />
            <UserMenu user={user} />
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
      {searchOpen && <SearchPalette items={search} onClose={() => setSearchOpen(false)} />}
    </div>
  );
}

function ProjectSelector({ project, projects }: { project: Props["project"]; projects: Props["projects"] }) {
  const { open, setOpen, ref } = usePopover();
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-8 max-w-[220px] items-center gap-2 rounded-md border border-line px-2 text-[13px] font-medium text-ink hover:bg-subtle"
      >
        <span className="flex size-5 items-center justify-center rounded bg-[#0e1626] text-[10px] font-bold text-white">{project?.name[0] ?? "?"}</span>
        <span className="truncate">{pending ? "Switching…" : (project?.name ?? "No project")}</span>
        {project && <span className="hidden rounded bg-subtle px-1 text-[10.5px] text-muted sm:inline">{project.environment === "production" ? "prod" : project.environment === "staging" ? "stg" : "dev"}</span>}
        <ChevronDown aria-hidden className="size-3.5 text-muted" />
      </button>
      {open && (
        <div className="absolute top-10 left-0 z-50 w-72 rounded-lg border border-line bg-surface p-1 shadow-pop">
          <div className="px-2 py-1.5 text-[11px] font-medium tracking-wide text-faint uppercase">Projects</div>
          <ul role="listbox" aria-label="Switch project">
            {projects.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={p.id === project?.id}
                  onClick={() => {
                    setOpen(false);
                    start(async () => {
                      await switchProject(p.id);
                      router.refresh();
                    });
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-hover"
                >
                  <span className="flex size-5 items-center justify-center rounded bg-subtle text-[10px] font-bold text-ink-2">{p.name[0]}</span>
                  <span className="flex-1 truncate">{p.name}</span>
                  <span className={cx("size-1.5 rounded-full", p.status === "healthy" ? "bg-ok" : p.status === "error" ? "bg-bad" : p.status === "warning" ? "bg-warn" : "bg-faint")} aria-label={p.status} />
                  {p.id === project?.id && <Check aria-hidden className="size-3.5 text-accent" />}
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-1 border-t border-line pt-1">
            <Link href="/projects/new" onClick={() => setOpen(false)} className="block rounded-md px-2 py-1.5 text-[13px] text-accent hover:bg-hover">
              + New project
            </Link>
            <Link href="/projects" onClick={() => setOpen(false)} className="block rounded-md px-2 py-1.5 text-[13px] text-ink-2 hover:bg-hover">
              All projects
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationsMenu({ items }: { items: Props["notifications"] }) {
  const { open, setOpen, ref } = usePopover();
  const unread = items.filter((i) => !i.acknowledged).length;
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label={`Notifications${unread ? `, ${unread} unacknowledged` : ""}`} aria-expanded={open} className="relative rounded-md p-2 text-muted hover:bg-hover">
        <Bell className="size-4" />
        {unread > 0 && <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-bad ring-2 ring-surface" />}
      </button>
      {open && (
        <div className="absolute top-10 right-0 z-50 w-80 rounded-lg border border-line bg-surface shadow-pop">
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <span className="text-[13px] font-semibold">Alert notifications</span>
            <span className="text-[11px] text-muted">Simulated deliveries</span>
          </div>
          {items.length === 0 ? (
            <p className="px-3 py-6 text-center text-[13px] text-muted">No alerts have fired in this project.</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {items.map((n) => (
                <li key={n.id} className="border-b border-line last:border-0">
                  <Link href="/alerts" onClick={() => setOpen(false)} className="block px-3 py-2 hover:bg-hover">
                    <div className="flex items-center gap-2 text-[12.5px] font-medium text-ink">
                      <span className={cx("size-1.5 shrink-0 rounded-full", n.severity === "critical" ? "bg-bad" : n.severity === "warning" ? "bg-warn" : "bg-info")} />
                      <span className="truncate">{n.title}</span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-[12px] text-muted">{n.body}</p>
                    <p className="mt-0.5 text-[11px] text-faint">
                      {relativeTime(n.at)}
                      {n.acknowledged && " · acknowledged"}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function HelpMenu() {
  const { open, setOpen, ref } = usePopover();
  const links = [
    { label: "Connect to Claude or ChatGPT (MCP)", href: "/mcp-api" },
    { label: "Generate a dbt starter project", href: "/dbt/starter" },
    { label: "How metrics are governed", href: "/metrics" },
    { label: "Query budgets & cache", href: "/settings?tab=usage" },
  ];
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label="Help" aria-expanded={open} className="rounded-md p-2 text-muted hover:bg-hover">
        <CircleHelp className="size-4" />
      </button>
      {open && (
        <div className="absolute top-10 right-0 z-50 w-72 rounded-lg border border-line bg-surface p-1 shadow-pop">
          <div className="flex items-center gap-2 px-2 py-1.5 text-[12px] font-medium text-muted">
            <BookOpen className="size-3.5" /> Guides
          </div>
          {links.map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="block rounded-md px-2 py-1.5 text-[13px] text-ink-2 hover:bg-hover">
              {l.label}
            </Link>
          ))}
          <p className="border-t border-line px-2 pt-2 pb-1.5 text-[11.5px] text-muted">This is a demo build. See README.md for architecture and limitations.</p>
        </div>
      )}
    </div>
  );
}

function UserMenu({ user }: { user: Props["user"] }) {
  const { open, setOpen, ref } = usePopover();
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label="Account menu" aria-expanded={open} className="ml-1 rounded-full p-0.5 hover:ring-2 hover:ring-line">
        <Avatar name={user.name} className="size-7 text-[11px]" />
      </button>
      {open && (
        <div className="absolute top-10 right-0 z-50 w-64 rounded-lg border border-line bg-surface p-1 shadow-pop">
          <div className="px-2 py-2">
            <div className="text-[13px] font-medium">{user.name}</div>
            <div className="text-[12px] text-muted">{user.email}</div>
            <div className="mt-1 text-[11px] text-faint">Demo session — no real sign-in</div>
          </div>
          <Link href="/settings" onClick={() => setOpen(false)} className="block rounded-md px-2 py-1.5 text-[13px] text-ink-2 hover:bg-hover">
            Workspace settings
          </Link>
          <Link href="/settings?tab=tokens" onClick={() => setOpen(false)} className="block rounded-md px-2 py-1.5 text-[13px] text-ink-2 hover:bg-hover">
            API tokens
          </Link>
        </div>
      )}
    </div>
  );
}

function SearchPalette({ items, onClose }: { items: SearchItem[]; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const router = useRouter();
  const all = useMemo(() => [...NAV.map((n) => ({ type: "Page", label: n.label, href: n.href })), ...items], [items]);
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (s ? all.filter((i) => i.label.toLowerCase().includes(s) || i.type.toLowerCase().includes(s)) : all).slice(0, 12);
  }, [all, q]);
  const go = (href: string) => {
    onClose();
    router.push(href);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-[#0e1626]/30 px-4 pt-[12vh]" onClick={onClose} role="dialog" aria-modal="true" aria-label="Search">
      <div className="w-full max-w-lg overflow-hidden rounded-xl border border-line bg-surface shadow-pop" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-line px-3">
          <Search aria-hidden className="size-4 text-muted" />
          <input
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setIdx(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setIdx((i) => Math.min(results.length - 1, i + 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setIdx((i) => Math.max(0, i - 1));
              }
              if (e.key === "Enter" && results[idx]) go(results[idx].href);
            }}
            placeholder="Search pages, dashboards, metrics, models…"
            aria-label="Search"
            className="h-11 flex-1 bg-transparent text-[14px] outline-none placeholder:text-faint"
          />
          <kbd className="rounded border border-line px-1 font-mono text-[10.5px] text-muted">esc</kbd>
        </div>
        <ul className="max-h-80 overflow-y-auto p-1" role="listbox" aria-label="Results">
          {results.length === 0 && <li className="px-3 py-6 text-center text-[13px] text-muted">No matches.</li>}
          {results.map((r, i) => (
            <li key={`${r.type}:${r.href}`} role="option" aria-selected={i === idx}>
              <button
                type="button"
                onMouseEnter={() => setIdx(i)}
                onClick={() => go(r.href)}
                className={cx("flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left text-[13px]", i === idx ? "bg-accent-soft text-ink" : "text-ink-2")}
              >
                <span className="w-20 shrink-0 text-[11px] text-muted">{r.type}</span>
                <span className="truncate">{r.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
