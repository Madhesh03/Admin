"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Search, Users, ShoppingBag, UserPlus, IndianRupee, type LucideIcon } from "lucide-react";
import { listCustomers, getCustomerSummary, type CustomerSort } from "@/lib/admin-api";
import type { Customer, CustomerSummary } from "@/lib/types";
import { useAsync, useDebouncedValue } from "@/lib/use-async";
import { cn, formatDate, formatPrice } from "@/lib/utils";
import { RequirePermission } from "@/components/permission-gate";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, NativeSelect } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState, ErrorState, Skeleton, TableSkeleton } from "@/components/ui/states";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";

const PAGE_SIZE = 20;

const initials = (name: string) =>
  name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

export default function CustomersPage() {
  return (
    <RequirePermission perm="orders.view_order">
      <CustomersInner />
    </RequirePermission>
  );
}

function CustomersInner() {
  const router = useRouter();
  const [search, setSearch] = React.useState("");
  const [hasOrders, setHasOrders] = React.useState<"" | "true" | "false">("");
  const [sort, setSort] = React.useState<CustomerSort>("last_order_date");
  const [page, setPage] = React.useState(1);
  const debounced = useDebouncedValue(search);

  React.useEffect(() => {
    setPage(1);
  }, [debounced, hasOrders, sort]);

  const summary = useAsync<CustomerSummary>(() => getCustomerSummary(), []);
  const { data, loading, error, reload } = useAsync(
    () =>
      listCustomers({
        search: debounced,
        has_orders: hasOrders || undefined,
        sort,
        page,
        page_size: PAGE_SIZE,
      }),
    [debounced, hasOrders, sort, page],
  );
  const rows: Customer[] = data?.items ?? [];
  const total = data?.meta.total ?? 0;

  return (
    <div>
      <PageHeader title="Customers" description="Every registered customer — profiles, spend, and order history." />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summary.loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardBody className="space-y-3"><Skeleton className="h-9 w-9 rounded-lg" /><Skeleton className="h-7 w-20" /><Skeleton className="h-4 w-24" /></CardBody></Card>
          ))
        ) : summary.error || !summary.data ? (
          <Card className="sm:col-span-2 xl:col-span-4"><ErrorState message={summary.error ?? undefined} onRetry={summary.reload} /></Card>
        ) : (
          <>
            <StatCard icon={Users} tone="forest" label="Total customers" value={String(summary.data.total)} />
            <StatCard icon={ShoppingBag} tone="blue" label="With orders" value={String(summary.data.with_orders)} />
            <StatCard icon={UserPlus} tone="amber" label="Zero-order" value={String(summary.data.zero_order)} />
            <StatCard icon={IndianRupee} tone="green" label="Lifetime revenue" value={formatPrice(summary.data.total_revenue)} />
          </>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <Input className="pl-9" placeholder="Search by name, email or phone…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <NativeSelect className="w-auto min-w-[140px]" value={hasOrders} onChange={(e) => setHasOrders(e.target.value as "" | "true" | "false")}>
          <option value="">All customers</option>
          <option value="true">With orders</option>
          <option value="false">Zero orders</option>
        </NativeSelect>
        <NativeSelect className="w-auto min-w-[150px]" value={sort} onChange={(e) => setSort(e.target.value as CustomerSort)}>
          <option value="last_order_date">Recent order</option>
          <option value="created_at">Newest joined</option>
          <option value="total_spent">Top spenders</option>
          <option value="order_count">Most orders</option>
          <option value="name">Name (A–Z)</option>
        </NativeSelect>
      </div>

      <Card>
        {loading ? (
          <TableSkeleton rows={7} cols={6} />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : rows.length === 0 ? (
          <EmptyState title="No customers found" description="Try adjusting your search or filters." />
        ) : (
          <>
            <Table>
              <THead>
                <tr>
                  <Th className="w-[32%]">Customer</Th>
                  <Th>Phone</Th>
                  <Th className="text-center">Orders</Th>
                  <Th className="text-right">Total spent</Th>
                  <Th>Joined</Th>
                  <Th>Last order</Th>
                </tr>
              </THead>
              <TBody>
                {rows.map((c) => (
                  <Tr key={c.email} clickable onClick={() => router.push(`/customers/${encodeURIComponent(c.email)}`)}>
                    <Td>
                      <div className="flex items-center gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sage text-xs font-bold text-forest">{initials(c.name || c.email)}</span>
                        <div className="min-w-0">
                          <p className="flex items-center gap-2 truncate font-semibold text-ink">
                            {c.name || "—"}
                            {c.order_count === 0 && <Badge className="bg-surface text-muted">No orders</Badge>}
                          </p>
                          <p className="truncate text-xs text-faint">{c.email}</p>
                        </div>
                      </div>
                    </Td>
                    <Td className="text-muted">{c.phone || "—"}</Td>
                    <Td className="text-center text-muted">{c.order_count}</Td>
                    <Td className="text-right font-semibold">{formatPrice(c.total_spent)}</Td>
                    <Td className="text-muted">{formatDate(c.created_at)}</Td>
                    <Td className="text-muted">{formatDate(c.last_order_date)}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
            <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
          </>
        )}
      </Card>
    </div>
  );
}

const TONE: Record<string, string> = {
  forest: "bg-sage text-forest",
  amber: "bg-amber-100 text-amber-700",
  blue: "bg-blue-100 text-blue-700",
  green: "bg-green-100 text-green-700",
};

function StatCard({ icon: Icon, tone, label, value }: { icon: LucideIcon; tone: string; label: string; value: string }) {
  return (
    <Card>
      <CardBody>
        <span className={cn("flex size-10 items-center justify-center rounded-lg", TONE[tone] ?? TONE.forest)}><Icon className="size-5" /></span>
        <p className="mt-3 text-2xl font-bold text-ink">{value}</p>
        <p className="text-sm text-muted">{label}</p>
      </CardBody>
    </Card>
  );
}
