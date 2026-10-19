"use client";

import { useActionState, useState } from "react";
import { GitBranch } from "lucide-react";
import { Button, Field, inputClass, SimulatedNote } from "@/components/ui";
import { FormMessage, Modal } from "@/components/ui-client";
import { configureRepoAction } from "@/app/actions/dbt";

export function RepoButton({ projectId, repo }: { projectId: string; repo?: { url: string; branch: string; path: string } }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(configureRepoAction.bind(null, projectId), null);
  const err = state && !state.ok ? state.fieldErrors : undefined;
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <GitBranch aria-hidden className="size-3.5" /> {repo ? "Repository" : "Configure repository"}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Configure dbt repository" description="Point DataOrbyt at the Git repository that holds your dbt project.">
        <form action={action} className="space-y-3">
          <Field label="Repository URL" htmlFor="repo-url" error={err?.url} hint="HTTPS or SSH URL on GitHub, GitLab or Bitbucket.">
            <input id="repo-url" name="url" defaultValue={repo?.url} placeholder="https://github.com/acme/analytics-dbt" className={inputClass} aria-invalid={!!err?.url} required />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Branch" htmlFor="repo-branch" error={err?.branch}>
              <input id="repo-branch" name="branch" defaultValue={repo?.branch ?? "main"} className={inputClass} aria-invalid={!!err?.branch} required />
            </Field>
            <Field label="Project path" htmlFor="repo-path" error={err?.path}>
              <input id="repo-path" name="path" defaultValue={repo?.path ?? "/"} className={inputClass} aria-invalid={!!err?.path} />
            </Field>
          </div>
          <SimulatedNote>Demo: the repository is saved but not cloned, and no deploy key is created. A real integration would use a read-only deploy key or GitHub App installation.</SimulatedNote>
          <div className="flex items-center justify-end gap-2 pt-1">
            <FormMessage state={state} />
            <Button onClick={() => setOpen(false)}>Close</Button>
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? "Saving…" : "Save repository"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
