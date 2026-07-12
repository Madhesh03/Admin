"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { listPurchaseOrders } from "@/lib/admin-api";
import { PO_STATUSES, titleCase, type PurchaseOrder, type PurchaseOrderStatus } from "@/lib/types";
import { useAsync } from "@/lib/use-async";
import { formatDate, formatPrice } from "@/lib/utils";
import { useAuth } from "@/components/auth-provider";
import { RequirePermission } from "@/components/permission-gate";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/input";
import { PoStatusBadge } from "@/components/ui/badge";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/states";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";

export default function PurchaseOrdersPage() {
  return (
    <RequirePermission perm="inventory.view_purchase_order">
      <Inner />
    </RequirePermission>
  );
}

function Inner() {
  const router = useRouter();
  const { can } = useAuth();
  const [status, setStatus] = React.useState<PurchaseOrderStatus | "all">("all");
  const { data, loading, error, reload } = useAsync<PurchaseOrder[]>(
    () => listPurchaseOrders(status === "all" ? {} : { status }),
    [status],
  );

  return (
    <div>
      <PageHeader
        title="Purchase Orders"
        description="Raise POs to suppliers and receive stock into inventory."
        actions={can("inventory.manage_purchase_order") && <Button asChild><Link href="/purchase-orders/new"><Plus className="size-4" />New PO</Link></Button>}
      />
      <div className="mb-4 max-w-[180px]">
        <NativeSelect value={status} onChange={(e) => setStatus(e.target.value as PurchaseOrderStatus | "all")}>
          <option value="all">All statuses</option>
          {PO_STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
        </NativeSelect>
      </div>
      <Card>
        {loading ? (
          <TableSkeleton rows={5} cols={5} />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : !data || data.length === 0 ? (
          <EmptyState title="No purchase orders" />
        ) : (
          <Table>
            <THead><tr><Th>PO #</Th><Th>Supplier</Th><Th>Status</Th><Th>Expected</Th><Th className="text-right">Total</Th></tr></THead>
            <TBody>
              {data.map((po) => (
                <Tr key={po.id} clickable onClick={() => router.push(`/purchase-orders/${po.id}`)}>
                  <Td className="font-semibold text-ink">{po.po_number}</Td>
                  <Td className="text-muted">{po.supplier_name}</Td>
                  <Td><PoStatusBadge status={po.status} /></Td>
                  <Td className="text-muted">{formatDate(po.expected_delivery_date)}</Td>
                  <Td className="text-right font-semibold">{formatPrice(po.total_amount)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
