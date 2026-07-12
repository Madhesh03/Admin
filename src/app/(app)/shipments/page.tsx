"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { COURIER_LABEL, SHIPMENT_STATUSES, titleCase, type Shipment, type ShipmentStatus } from "@/lib/types";
import { listShipments } from "@/lib/admin-api";
import { useAsync } from "@/lib/use-async";
import { formatDate } from "@/lib/utils";
import { RequirePermission } from "@/components/permission-gate";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/input";
import { ShipmentStatusBadge } from "@/components/ui/badge";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/states";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";

export default function ShipmentsPage() {
  return (
    <RequirePermission perm="shipping.manage_shipment">
      <Inner />
    </RequirePermission>
  );
}

function Inner() {
  const router = useRouter();
  const [status, setStatus] = React.useState<ShipmentStatus | "all">("all");
  const { data, loading, error, reload } = useAsync<Shipment[]>(
    () => listShipments(status === "all" ? {} : { status }),
    [status],
  );

  return (
    <div>
      <PageHeader title="Shipments" description="Track fulfilment via Shiprocket — sync status and manage bookings." />
      <div className="mb-4 max-w-[200px]">
        <NativeSelect value={status} onChange={(e) => setStatus(e.target.value as ShipmentStatus | "all")}>
          <option value="all">All statuses</option>
          {SHIPMENT_STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
        </NativeSelect>
      </div>
      <Card>
        {loading ? (
          <TableSkeleton rows={5} cols={5} />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : !data || data.length === 0 ? (
          <EmptyState title="No shipments" />
        ) : (
          <Table>
            <THead><tr><Th>Order</Th><Th>AWB</Th><Th>Courier</Th><Th>ETA</Th><Th>Status</Th></tr></THead>
            <TBody>
              {data.map((s) => (
                <Tr key={s.id} clickable onClick={() => router.push(`/shipments/${s.id}`)}>
                  <Td className="font-semibold text-ink">{s.order_number}</Td>
                  <Td className="text-muted">{s.awb}</Td>
                  <Td className="text-muted">{COURIER_LABEL[s.courier]}</Td>
                  <Td className="text-muted">{formatDate(s.estimated_delivery)}</Td>
                  <Td><ShipmentStatusBadge status={s.status} /></Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
