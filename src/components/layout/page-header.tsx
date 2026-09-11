import * as React from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  backHref,
  onBack,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  backHref?: string;
  /**
   * Prefer this over `backHref` when returning to a list that may have
   * filters/pagination in its URL — `router.back()` restores that state,
   * while a fixed `backHref` always navigates to the bare, filter-less URL.
   */
  onBack?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("mb-6 flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="mb-1.5 inline-flex items-center gap-1 text-sm font-medium text-muted transition-colors hover:text-forest"
          >
            <ChevronLeft className="size-4" />
            Back
          </button>
        ) : (
          backHref && (
            <Link
              href={backHref}
              className="mb-1.5 inline-flex items-center gap-1 text-sm font-medium text-muted transition-colors hover:text-forest"
            >
              <ChevronLeft className="size-4" />
              Back
            </Link>
          )
        )}
        <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
