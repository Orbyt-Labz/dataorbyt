"use client";

import { useState, useTransition } from "react";
import { changeRoleAction, inviteMemberAction, updateNotificationsAction, updateWorkspaceAction } from "@/app/actions/settings";
import { Button, Field, inputClass, selectClass } from "@/components/ui";
import { FormMessage } from "@/components/ui-client";

type R = { ok: boolean; message?: string; fieldErrors?: Record<string, string> } | null;

export function WorkspaceForm({ initial, timezones, currencies }: { initial: { name: string; defaultTimezone: string; defaultCurrency: string }; timezones: string[]; currencies: string[] }) {
  const [f, setF] = useState(initial);
  const [r, setR] = useState<R>(null);
  const [pending, start] = useTransition();
  const e = r && !r.ok ? (r.fieldErrors ?? {}) : {};
  return (
    <form
      className="grid grid-cols-1 gap-4 sm:grid-cols-3"
      onSubmit={(ev) => {
        ev.preventDefault();
        start(async () => setR(await updateWorkspaceAction(f)));
      }}
    >
      <Field label="Workspace name" htmlFor="ws-name" error={e.name}>
        <input id="ws-name" className={inputClass} value={f.name} aria-invalid={!!e.name || undefined} onChange={(x) => setF({ ...f, name: x.target.value })} />
      </Field>
      <Field label="Default timezone" htmlFor="ws-tz">
        <select id="ws-tz" className={selectClass} value={f.defaultTimezone} onChange={(x) => setF({ ...f, defaultTimezone: x.target.value })}>
          {timezones.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </Field>
      <Field label="Default currency" htmlFor="ws-cur">
        <select id="ws-cur" className={selectClass} value={f.defaultCurrency} onChange={(x) => setF({ ...f, defaultCurrency: x.target.value })}>
          {currencies.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </Field>
      <div className="flex items-center gap-3 sm:col-span-3">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <FormMessage state={r} />
      </div>
    </form>
  );
}

export function InviteForm() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("viewer");
  const [r, setR] = useState<R>(null);
  const [pending, start] = useTransition();
  const e = r && !r.ok ? (r.fieldErrors ?? {}) : {};
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(ev) => {
        ev.preventDefault();
        start(async () => {
          const res = await inviteMemberAction({ email, role });
          setR(res);
          if (res.ok) setEmail("");
        });
      }}
    >
      <Field label="Invite by email" htmlFor="inv-email" error={e.email} className="min-w-60 flex-1">
        <input id="inv-email" type="email" className={inputClass} value={email} aria-invalid={!!e.email || undefined} onChange={(x) => setEmail(x.target.value)} placeholder="teammate@company.com" />
      </Field>
      <Field label="Role" htmlFor="inv-role">
        <select id="inv-role" className={selectClass + " w-32"} value={role} onChange={(x) => setRole(x.target.value)}>
          <option value="admin">Admin</option>
          <option value="editor">Editor</option>
          <option value="viewer">Viewer</option>
        </select>
      </Field>
      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? "Inviting…" : "Invite"}
      </Button>
      <div className="w-full">{r?.ok && <FormMessage state={r} />}</div>
    </form>
  );
}

export function RoleSelect({ memberId, role, label }: { memberId: string; role: string; label: string }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string>();
  return (
    <span className="inline-flex items-center gap-2">
      <select
        aria-label={`Role for ${label}`}
        className={selectClass + " h-7 w-28 text-[12.5px]"}
        defaultValue={role}
        disabled={pending}
        onChange={(e) =>
          start(async () => {
            const r = await changeRoleAction(memberId, e.target.value);
            setErr(r.ok ? undefined : r.message);
          })
        }
      >
        <option value="admin">Admin</option>
        <option value="editor">Editor</option>
        <option value="viewer">Viewer</option>
      </select>
      {err && <span className="text-[12px] text-bad">{err}</span>}
    </span>
  );
}

const PREFS = [
  { key: "alertEmails", label: "Alert emails", hint: "Email recipients when alerts fire" },
  { key: "dbtFailures", label: "dbt failures", hint: "Notify owners when a dbt run or test fails" },
  { key: "weeklyDigest", label: "Weekly founder digest", hint: "Monday summary of key metrics" },
  { key: "productUpdates", label: "Product updates", hint: "Occasional DataOrbyt release notes" },
] as const;

export function NotificationsForm({ initial }: { initial: Record<(typeof PREFS)[number]["key"], boolean> }) {
  const [f, setF] = useState(initial);
  const [r, setR] = useState<R>(null);
  const [pending, start] = useTransition();
  return (
    <form
      onSubmit={(ev) => {
        ev.preventDefault();
        start(async () => setR(await updateNotificationsAction(f)));
      }}
      className="space-y-3"
    >
      {PREFS.map((p) => (
        <label key={p.key} className="flex items-start gap-3 rounded-md border border-line px-3 py-2.5">
          <input type="checkbox" className="mt-0.5" checked={f[p.key]} onChange={(e) => setF({ ...f, [p.key]: e.target.checked })} />
          <span>
            <span className="block text-[13px] font-medium text-ink">{p.label}</span>
            <span className="text-[12.5px] text-muted">{p.hint}</span>
          </span>
        </label>
      ))}
      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Saving…" : "Save preferences"}
        </Button>
        <FormMessage state={r} />
      </div>
    </form>
  );
}
