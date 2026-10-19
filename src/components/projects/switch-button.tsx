"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ArrowRightLeft, Loader2 } from "lucide-react";
import { switchProject } from "@/app/actions/shell";
import { Button } from "@/components/ui";

export function SwitchProjectButton({ projectId, label = "Switch to", goTo, variant = "secondary", size = "sm" }: { projectId: string; label?: string; goTo?: string; variant?: "primary" | "secondary"; size?: "sm" | "md" }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size={size}
      variant={variant}
      disabled={pending}
      onClick={() =>
        start(async () => {
          await switchProject(projectId);
          if (goTo) router.push(goTo);
          else router.refresh();
        })
      }
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowRightLeft className="size-3.5" />}
      {label}
    </Button>
  );
}
