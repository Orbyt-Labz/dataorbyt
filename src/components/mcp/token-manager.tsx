"use client";

import { useState, useTransition } from "react";
import { KeyRound, Plus, ShieldAlert } from "lucide-react";
import { createTokenAction, revokeTokenAction } from "@/app/actions/settings";
import type { TokenScope } from "@/lib/domain/types";
import { Badge, Button, Field, SimulatedNote, inputClass, td, th } from "@/components/ui";
import { CopyButton, Modal } from "@/components/ui-client";
import { cx, formatDate, relativeTime } from "@/lib/format";

export interface TokenRow {
  id: string;
  name: string;
  prefix: string;
  scopes: TokenScope[];
  projectIds: string[] | "all";
  createdAt: string;
  lastUsedAt?: string;
  revokedAt?: string;
}

const SCOPES: { key: TokenScope; label: string; hint: string }[] = [
  { key: "read", label: "read", hint: "List projects, metrics, dashboards; governed metric previews" },
  { key: "draft", label: "draft", hint: "Create dashboard, alert and experiment drafts" },
  { key: "publish", label: "publish", hint: "Publish dashboards (still two-step confirmed)" },
];

export function TokenManager({ tokens, projects }: { tokens: TokenRow[]; projects: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<TokenScope[]>(["read"]);
  const [allProjects, setAllProjects] = useState(false);
  const [projectIds, setProjectIds] = useState<string[]>(projects[0] ? [projects[0].id] : []);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [revoking, setRevoking] = useState<TokenRow | null>(null);
  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? id;

  const reset = () => {
    setName("");
    setScopes(["read"]);
    setErrors({});
    setFormError(undefined);
  };

  const create = () =>
    start(async () => {
      const r = await createTokenAction({ name, scopes, projectIds: allProjects ? "all" : projectIds });
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        setFormError(r.message);
        return;
      }
      // Held only in component memory for this one display; never written to storage.
      setPlaintext(r.data!.plaintext);
      reset();
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12.5px] text-muted">Tokens authenticate MCP clients and the API. Only a SHA-256 hash is stored server-side.</p>
        <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
          <Plus className="size-3.5" /> Create token
        </Button>
      </div>
      <SimulatedNote>Demo: tokens live in server memory and reset when the server restarts. There is no user authentication in this build — anyone who can open this page can create tokens.</SimulatedNote>

      {tokens.length === 0 ? (
        <div className="rounded-md border border-dashed border-line-strong px-4 py-6 text-center text-[13px] text-muted">
          <KeyRound className="mx-auto mb-2 size-5 text-faint" />
          No tokens yet. Create one to connect Claude or ChatGPT.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-line">
          <table className="w-full min-w-[720px]">
            <thead className="border-b border-line bg-subtle/40">
              <tr>
                <th scope="col" className={th}>Name</th>
                <th scope="col" className={th}>Token</th>
                <th scope="col" className={th}>Scopes</th>
                <th scope="col" className={th}>Projects</th>
                <th scope="col" className={th}>Created</th>
                <th scope="col" className={th}>Last used</th>
                <th scope="col" className={th}><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {tokens.map((t) => (
                <tr key={t.id} className={cx("border-b border-line last:border-0", t.revokedAt && "opacity-60")}>
                  <td className={td + " font-medium text-ink"}>{t.name}</td>
                  <td className={td + " font-mono text-[12px]"}>{t.prefix}…</td>
                  <td className={td}>
                    <span className="flex gap-1">
                      {t.scopes.map((s) => (
                        <Badge key={s} tone={s === "publish" ? "warn" : s === "draft" ? "info" : "neutral"}>
                          {s}
                        </Badge>
                      ))}
                    </span>
                  </td>
                  <td className={td + " text-[12.5px]"}>{t.projectIds === "all" ? "All projects" : t.projectIds.map(projectName).join(", ")}</td>
                  <td className={td + " whitespace-nowrap"}>{formatDate(t.createdAt)}</td>
                  <td className={td + " whitespace-nowrap"}>{t.lastUsedAt ? relativeTime(t.lastUsedAt) : "never"}</td>
                  <td className={td + " text-right"}>
                    {t.revokedAt ? (
                      <Badge tone="neutral">Revoked {relativeTime(t.revokedAt)}</Badge>
                    ) : (
                      <Button size="sm" variant="danger" onClick={() => setRevoking(t)}>
                        Revoke
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          setPlaintext(null);
        }}
        title={plaintext ? "Copy your token now" : "Create API token"}
        description={plaintext ? "This is the only time the token is shown." : "Scope tokens to the minimum they need."}
        footer={
          plaintext ? (
            <Button
              variant="primary"
              onClick={() => {
                setPlaintext(null);
                setOpen(false);
              }}
            >
              I&apos;ve stored it securely
            </Button>
          ) : (
            <>
              <Button onClick={() => setOpen(false)}>Cancel</Button>
              <Button variant="primary" onClick={create} disabled={pending}>
                {pending ? "Creating…" : "Create token"}
              </Button>
            </>
          )
        }
      >
        {plaintext ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-md border border-line bg-subtle p-2">
              <code className="min-w-0 flex-1 font-mono text-[12.5px] break-all text-ink">{plaintext}</code>
              <CopyButton value={plaintext} />
            </div>
            <p className="flex items-start gap-2 text-[12.5px] text-warn">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" /> Store it in your MCP client config or a secrets manager. DataOrbyt keeps only a hash and can&apos;t show it again. Don&apos;t paste it into chats or commit it.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <Field label="Name" htmlFor="tok-name" error={errors.name} hint="e.g. “Claude Desktop – Alex”">
              <input id="tok-name" className={inputClass} value={name} aria-invalid={!!errors.name || undefined} onChange={(e) => setName(e.target.value)} />
            </Field>
            <fieldset>
              <legend className="mb-1.5 text-[12.5px] font-medium text-ink-2">Scopes</legend>
              <div className="space-y-1.5">
                {SCOPES.map((s) => (
                  <label key={s.key} className="flex items-start gap-2 text-[13px]">
                    <input type="checkbox" className="mt-0.5" checked={scopes.includes(s.key)} onChange={(e) => setScopes(e.target.checked ? [...scopes, s.key] : scopes.filter((x) => x !== s.key))} />
                    <span>
                      <span className="font-mono text-ink">{s.label}</span> <span className="text-muted">— {s.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
              {errors.scopes && <p className="mt-1 text-[12px] text-bad">{errors.scopes}</p>}
            </fieldset>
            <fieldset>
              <legend className="mb-1.5 text-[12.5px] font-medium text-ink-2">Projects</legend>
              <label className="mb-1.5 flex items-center gap-2 text-[13px]">
                <input type="checkbox" checked={allProjects} onChange={(e) => setAllProjects(e.target.checked)} /> All projects (including future ones)
              </label>
              {!allProjects && (
                <div className="space-y-1 rounded-md border border-line p-2">
                  {projects.map((p) => (
                    <label key={p.id} className="flex items-center gap-2 text-[13px]">
                      <input type="checkbox" checked={projectIds.includes(p.id)} onChange={(e) => setProjectIds(e.target.checked ? [...projectIds, p.id] : projectIds.filter((x) => x !== p.id))} /> {p.name}
                    </label>
                  ))}
                </div>
              )}
              {errors.projectIds && <p className="mt-1 text-[12px] text-bad">{errors.projectIds}</p>}
            </fieldset>
            {formError && !Object.keys(errors).length && <p role="alert" className="text-[12.5px] text-bad">{formError}</p>}
          </div>
        )}
      </Modal>

      <Modal
        open={!!revoking}
        onClose={() => setRevoking(null)}
        title="Revoke token?"
        size="sm"
        footer={
          <>
            <Button onClick={() => setRevoking(null)}>Cancel</Button>
            <Button
              variant="danger"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  await revokeTokenAction(revoking!.id);
                  setRevoking(null);
                })
              }
            >
              Revoke
            </Button>
          </>
        }
      >
        <p className="text-[13px] text-ink-2">
          Clients using <b>{revoking?.name}</b> ({revoking?.prefix}…) will immediately get 401 responses.
        </p>
      </Modal>
    </div>
  );
}
