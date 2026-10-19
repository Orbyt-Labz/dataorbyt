"use client";

import { AlertTriangle } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto mt-16 max-w-md rounded-lg border border-line bg-surface p-6 text-center shadow-card">
      <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-bad-soft text-bad">
        <AlertTriangle className="size-5" aria-hidden />
      </div>
      <h1 className="text-[15px] font-semibold">Something went wrong</h1>
      <p className="mt-1 text-[13px] text-muted">This page failed to load. Your data is unchanged.{error.digest ? ` Reference: ${error.digest}` : ""}</p>
      <div className="mt-4 flex justify-center gap-2">
        <Button variant="primary" onClick={reset}>
          Try again
        </Button>
        <ButtonLink href="/">Go to overview</ButtonLink>
      </div>
    </div>
  );
}
