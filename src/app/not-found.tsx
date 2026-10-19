import { SearchX } from "lucide-react";
import { ButtonLink, EmptyState } from "@/components/ui";

export default function NotFound() {
  return (
    <EmptyState
      className="mx-auto mt-16 max-w-lg"
      icon={<SearchX className="size-5" />}
      title="Not found"
      action={<ButtonLink href="/" variant="primary">Back to overview</ButtonLink>}
    >
      This item doesn&apos;t exist in the current project. It may belong to another project, or demo state may have reset when the server restarted.
    </EmptyState>
  );
}
