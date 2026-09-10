"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Standard "Showing X–Y of Z … Previous / Page N of M / Next" footer, shared
 * by every paginated list table (server-paginated via page/page_size params,
 * or client-paginated via `usePagination` — see src/lib/use-async.ts). Render
 * it inside the same <Card> as the table, right after it, so the border reads
 * as one block.
 */
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  if (lastPage <= 1) return null;

  const firstOnPage = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastOnPage = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
      <p className="text-xs text-muted">
        Showing <span className="font-semibold text-ink">{firstOnPage}–{lastOnPage}</span> of{" "}
        <span className="font-semibold text-ink">{total}</span>
      </p>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={page <= 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
        >
          <ChevronLeft className="size-4" />Previous
        </Button>
        <span className="text-xs text-muted">Page {page} of {lastPage}</span>
        <Button
          size="sm"
          variant="secondary"
          disabled={page >= lastPage}
          onClick={() => onPageChange(Math.min(lastPage, page + 1))}
        >
          Next<ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
