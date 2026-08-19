"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Search, TriangleAlert } from "lucide-react";
import {
  courierLabel,
  SHIPMENT_STATUSES,
  titleCase,
  type Shipment,
  type ShipmentStatus,
} from "@/lib/types";
import { listShipments } from "@/lib/admin-api";
import { useAsync, useDebouncedValue } from "@/lib/use-async";
import { formatDate, formatPrice } from "@/lib/utils";
import { RequirePermission } from "@/components/permission-gate";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Input, NativeSelect } from "@/components/ui/input";
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
  const [awb, setAwb] = React.useState("");
  const debouncedAwb = useDebouncedValue(awb);

  const { data, loading, error, reload } = useAsync<Shipment[]>(
    () =>
      listShipments({
        ...(status === "all" ? {} : { status }),
        ...(debouncedAwb ? { awb: debouncedAwb } : {}),
      }),
    [status, debouncedAwb],
  );

  return (
    <div>
      <PageHeader title="Shipments" description="Track fulfilment via Shiprocket — sync status and manage bookings." />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <Input className="pl-9" placeholder="Search by AWB…" value={awb} onChange={(e) => setAwb(e.target.value)} />
        </div>
        <NativeSelect className="w-auto min-w-[170px]" value={status} onChange={(e) => setStatus(e.target.value as ShipmentStatus | "all")}>
          <option value="all">All statuses</option>
          {SHIPMENT_STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
        </NativeSelect>
      </div>
      <Card>
        {loading ? (
          <TableSkeleton rows={5} cols={6} />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : !data || data.length === 0 ? (
          <EmptyState title="No shipments" />
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>Order</Th>
                <Th>AWB</Th>
                <Th>Courier</Th>
                <Th className="text-right">Freight</Th>
                <Th>ETA</Th>
                <Th>Status</Th>
              </tr>
            </THead>
            <TBody>
              {data.map((s) => (
                <Tr key={s.id} clickable onClick={() => router.push(`/shipments/${s.id}`)}>
                  <Td className="font-semibold text-ink">{s.order_number}</Td>
                  <Td className="text-muted">
                    {s.awb || (
                      // A booking with no waybill can't ship; it needs a retry,
                      // not a place in the queue looking normal.
                      <span className="inline-flex items-center gap-1 font-medium text-amber-700">
                        <TriangleAlert className="size-3.5" />No AWB
                      </span>
                    )}
                  </Td>
                  <Td className="text-muted">{courierLabel(s)}</Td>
                  <Td className="text-right text-muted">
                    {s.freight_charge != null ? formatPrice(s.freight_charge) : "—"}
                  </Td>
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
