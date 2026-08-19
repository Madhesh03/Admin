"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { listOrders, type ListOrdersParams, type OrderOrdering } from "@/lib/admin-api";
import { orderCustomerName } from "@/lib/derive";
import { ORDER_STATUSES, titleCase, type Order } from "@/lib/types";
import { useAsync, useDebouncedValue } from "@/lib/use-async";
import { cn, formatDate, formatPrice } from "@/lib/utils";
import { RequirePermission } from "@/components/permission-gate";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, NativeSelect } from "@/components/ui/input";
import { OrderStatusBadge, PaymentBadge } from "@/components/ui/badge";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/states";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";

const PAGE_SIZE = 20;

export default function OrdersPage() {
  return (
    <RequirePermission perm="orders.view_order">
      <OrdersInner />
    </RequirePermission>
  );
}

function OrdersInner() {
  const router = useRouter();
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState<ListOrdersParams["status"]>("all");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [ordering, setOrdering] = React.useState<OrderOrdering>("-created_at");
  const [page, setPage] = React.useState(1);
  const debounced = useDebouncedValue(search);

  // Any change to what's being asked for invalidates the current page number —
  // page 3 of the old result set is meaningless against the new one.
  React.useEffect(() => {
    setPage(1);
  }, [debounced, status, from, to, ordering]);

  const { data, loading, error, reload } = useAsync(
    () =>
      listOrders({
        search: debounced,
        status,
        from: from || undefined,
        to: to || undefined,
        ordering,
        page,
        page_size: PAGE_SIZE,
      }),
    [debounced, status, from, to, ordering, page],
  );
  const rows: Order[] = data?.items ?? [];
  const total = data?.meta.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const firstOnPage = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastOnPage = Math.min(page * PAGE_SIZE, total);

  /** Toggle a column between ascending and descending. */
  function sortBy(field: "created_at" | "total_amount" | "order_number") {
    setOrdering((current) =>
      current === `-${field}` ? field : (`-${field}` as OrderOrdering),
    );
  }

  return (
    <div>
      <PageHeader title="Orders" description="View orders, update fulfilment status, and manage shipments & refunds." />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <Input className="pl-9" placeholder="Search by order #, name, email or phone…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <NativeSelect className="w-auto min-w-[130px]" value={status} onChange={(e) => setStatus(e.target.value as ListOrdersParams["status"])}>
          <option value="all">All statuses</option>
          {ORDER_STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
        </NativeSelect>
        <div className="flex items-center gap-1.5">
          <Input type="date" className="w-auto" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
          <span className="text-xs text-faint">→</span>
          <Input type="date" className="w-auto" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
        </div>
      </div>

      <Card>
        {loading ? (
          <TableSkeleton rows={8} cols={7} />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : rows.length === 0 ? (
          <EmptyState title="No orders found" description="Try adjusting filters or date range." />
        ) : (
          <>
            <Table>
              <THead>
                <tr>
                  <SortableTh field="order_number" ordering={ordering} onSort={sortBy}>Order</SortableTh>
                  <SortableTh field="created_at" ordering={ordering} onSort={sortBy}>Date</SortableTh>
                  <Th>Customer</Th>
                  <Th className="text-center">Items</Th>
                  <SortableTh field="total_amount" ordering={ordering} onSort={sortBy} className="text-right">Total</SortableTh>
                  <Th>Payment</Th>
                  <Th>Status</Th>
                </tr>
              </THead>
              <TBody>
                {rows.map((o) => (
                  <Tr key={o.id} clickable onClick={() => router.push(`/orders/${o.id}`)}>
                    <Td className="font-semibold text-ink">{o.order_number}</Td>
                    <Td className="text-muted">{formatDate(o.created_at)}</Td>
                    <Td>
                      <p className="font-medium text-ink">{orderCustomerName(o)}</p>
                      <p className="text-xs text-faint">{o.customer_email}</p>
                    </Td>
                    <Td className="text-center text-muted">{o.items.reduce((s, it) => s + it.quantity, 0)}</Td>
                    <Td className="text-right font-semibold">{formatPrice(o.total_amount)}</Td>
                    <Td><PaymentBadge status={o.payment_status} /></Td>
                    <Td><OrderStatusBadge status={o.status} /></Td>
                  </Tr>
                ))}
              </TBody>
            </Table>

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
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="size-4" />Previous
                </Button>
                <span className="text-xs text-muted">Page {page} of {lastPage}</span>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={page >= lastPage}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next<ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

function SortableTh({
  field,
  ordering,
  onSort,
  className,
  children,
}: {
  field: "created_at" | "total_amount" | "order_number";
  ordering: OrderOrdering;
  onSort: (f: "created_at" | "total_amount" | "order_number") => void;
  className?: string;
  children: React.ReactNode;
}) {
  const active = ordering === field || ordering === `-${field}`;
  const desc = ordering === `-${field}`;
  return (
    <Th
      className={cn("p-0", className)}
      aria-sort={active ? (desc ? "descending" : "ascending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(field)}
        className={cn(
          "flex w-full items-center gap-1 px-4 py-3 font-semibold uppercase tracking-wide transition-colors hover:text-ink",
          className?.includes("text-right") && "justify-end",
          active && "text-ink",
        )}
      >
        {children}
        {active &&
          (desc ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}
      </button>
    </Th>
  );
}
