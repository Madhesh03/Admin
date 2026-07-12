"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { listCustomers } from "@/lib/admin-api";
import type { Customer } from "@/lib/types";
import { useAsync, useDebouncedValue } from "@/lib/use-async";
import { formatDate, formatPrice } from "@/lib/utils";
import { RequirePermission } from "@/components/permission-gate";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/states";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";

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
  const debounced = useDebouncedValue(search);
  const { data, loading, error, reload } = useAsync<Customer[]>(() => listCustomers({ search: debounced }), [debounced]);

  return (
    <div>
      <PageHeader title="Customers" description="Derived from orders — profiles, spend, and order history." />
      <div className="mb-4 max-w-md">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <Input className="pl-9" placeholder="Search by name or email…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>
      <Card>
        {loading ? (
          <TableSkeleton rows={7} cols={5} />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : !data || data.length === 0 ? (
          <EmptyState title="No customers found" description="Customers appear here once orders are placed." />
        ) : (
          <Table>
            <THead>
              <tr>
                <Th className="w-[34%]">Customer</Th>
                <Th>Phone</Th>
                <Th className="text-center">Orders</Th>
                <Th className="text-right">Total spent</Th>
                <Th>Last order</Th>
              </tr>
            </THead>
            <TBody>
              {data.map((c) => (
                <Tr key={c.email} clickable onClick={() => router.push(`/customers/${encodeURIComponent(c.email)}`)}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sage text-xs font-bold text-forest">{initials(c.name)}</span>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-ink">{c.name}</p>
                        <p className="truncate text-xs text-faint">{c.email}</p>
                      </div>
                    </div>
                  </Td>
                  <Td className="text-muted">{c.phone || "—"}</Td>
                  <Td className="text-center text-muted">{c.order_count}</Td>
                  <Td className="text-right font-semibold">{formatPrice(c.total_spent)}</Td>
                  <Td className="text-muted">{formatDate(c.last_order_date)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
