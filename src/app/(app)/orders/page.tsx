"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { listOrders, type ListOrdersParams } from "@/lib/admin-api";
import { orderCustomerName } from "@/lib/derive";
import { ORDER_STATUSES, titleCase, type Order } from "@/lib/types";
import { useAsync, useDebouncedValue } from "@/lib/use-async";
import { formatDate, formatPrice } from "@/lib/utils";
import { RequirePermission } from "@/components/permission-gate";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Input, NativeSelect } from "@/components/ui/input";
import { OrderStatusBadge, PaymentBadge } from "@/components/ui/badge";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/states";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";

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
  const debounced = useDebouncedValue(search);

  const { data, loading, error, reload } = useAsync(
    () => listOrders({ search: debounced, status, from: from || undefined, to: to || undefined }),
    [debounced, status, from, to],
  );
  const rows: Order[] = data?.items ?? [];

  return (
    <div>
      <PageHeader title="Orders" description="View orders, update fulfilment status, and manage shipments & refunds." />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <Input className="pl-9" placeholder="Search by order #, name or email…" value={search} onChange={(e) => setSearch(e.target.value)} />
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
          <Table>
            <THead>
              <tr>
                <Th>Order</Th>
                <Th>Date</Th>
                <Th>Customer</Th>
                <Th className="text-center">Items</Th>
                <Th className="text-right">Total</Th>
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
        )}
      </Card>
    </div>
  );
}
