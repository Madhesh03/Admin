"use client";

import * as React from "react";
import { Star, Check, X } from "lucide-react";
import { approveReview, listReviews, rejectReview } from "@/lib/admin-api";
import type { Review } from "@/lib/types";
import { useAsync, usePagination } from "@/lib/use-async";
import { formatDate, cn } from "@/lib/utils";
import { useAuth } from "@/components/auth-provider";
import { RequirePermission } from "@/components/permission-gate";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { toast } from "@/components/ui/toast";

export default function ReviewsPage() {
  return (
    <RequirePermission perm="catalog.view_product">
      <ReviewsInner />
    </RequirePermission>
  );
}

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} className={cn("size-3.5", i < rating ? "fill-amber-400 text-amber-400" : "text-line-strong")} />
      ))}
    </div>
  );
}

type Filter = "all" | "pending" | "approved" | "rejected";

function reviewParams(filter: Filter): { approved?: boolean; rejected?: boolean } {
  switch (filter) {
    case "pending":
      return { approved: false, rejected: false };
    case "approved":
      return { approved: true };
    case "rejected":
      return { rejected: true };
    default:
      return {};
  }
}

function ReviewsInner() {
  const { can } = useAuth();
  const [filter, setFilter] = React.useState<Filter>("pending");
  const { data, loading, error, reload } = useAsync<Review[]>(
    () => listReviews(reviewParams(filter)),
    [filter],
  );
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const { page, setPage, pageRows, total } = usePagination(data ?? [], 10);
  React.useEffect(() => {
    setPage(1);
  }, [filter, setPage]);

  async function approve(r: Review) {
    setBusyId(r.id);
    try {
      await approveReview(r.id);
      toast.success("Review approved");
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not approve");
    } finally {
      setBusyId(null);
    }
  }

  async function reject(r: Review) {
    setBusyId(r.id);
    try {
      await rejectReview(r.id);
      toast.success("Review rejected");
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not reject");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <PageHeader title="Reviews" description="Moderate customer reviews before they appear on the storefront." />
      <div className="mb-4 max-w-[200px]">
        <NativeSelect value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
          <option value="pending">Pending approval</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="all">All reviews</option>
        </NativeSelect>
      </div>

      {loading ? (
        <Card><LoadingState label="Loading reviews…" /></Card>
      ) : error ? (
        <Card><ErrorState message={error} onRetry={reload} /></Card>
      ) : !data || data.length === 0 ? (
        <Card><EmptyState icon={Star} title="Nothing here" description="No reviews match this filter." /></Card>
      ) : (
        <div className="space-y-3">
          {pageRows.map((r) => (
            <Card key={r.id}>
              <div className="flex flex-wrap items-start justify-between gap-3 p-5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Stars rating={r.rating} />
                    <span className="font-semibold text-ink">{r.title}</span>
                    {r.is_approved ? (
                      <Badge className="bg-green-100 text-green-700">Approved</Badge>
                    ) : r.is_rejected ? (
                      <Badge className="bg-red-100 text-red-700">Rejected</Badge>
                    ) : (
                      <Badge className="bg-amber-100 text-amber-700">Pending</Badge>
                    )}
                  </div>
                  <p className="mt-1.5 text-sm text-muted">{r.body}</p>
                  {r.images.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {r.images.map((img) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={img.id}
                          src={img.view_url}
                          alt=""
                          className="size-14 rounded-md border border-line object-cover"
                        />
                      ))}
                    </div>
                  )}
                  <p className="mt-2 text-xs text-faint">
                    {r.customer_name} · {r.product_name ?? "Product"} · {formatDate(r.created_at)}
                  </p>
                </div>
                {!r.is_approved && !r.is_rejected && can("catalog.edit_product") && (
                  <div className="flex gap-2">
                    <Button size="sm" loading={busyId === r.id} onClick={() => approve(r)}>
                      <Check className="size-4" />Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      loading={busyId === r.id}
                      onClick={() => reject(r)}
                    >
                      <X className="size-4" />Reject
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          ))}
          <Card>
            <Pagination page={page} pageSize={10} total={total} onPageChange={setPage} />
          </Card>
        </div>
      )}
    </div>
  );
}
