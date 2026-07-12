"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PackageX, RefreshCw, Ban } from "lucide-react";
import { cancelShipment, getShipment, syncShipment } from "@/lib/admin-api";
import { COURIER_LABEL, type Shipment } from "@/lib/types";
import { useAsync } from "@/lib/use-async";
import { formatDate, formatDateTime } from "@/lib/utils";
import { useAuth } from "@/components/auth-provider";
import { RequirePermission } from "@/components/permission-gate";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShipmentStatusBadge } from "@/components/ui/badge";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { toast } from "@/components/ui/toast";

export default function ShipmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, loading, error, reload, setData } = useAsync<Shipment | null>(() => getShipment(id), [id]);

  return (
    <RequirePermission perm="shipping.manage_shipment">
      <PageHeader
        title={data ? `Shipment · ${data.order_number}` : "Shipment"}
        description={data?.awb}
        backHref="/shipments"
        actions={data ? <ShipmentStatusBadge status={data.status} /> : undefined}
      />
      {loading ? (
        <Card><LoadingState label="Loading shipment…" /></Card>
      ) : error ? (
        <Card><ErrorState message={error} onRetry={reload} /></Card>
      ) : !data ? (
        <Card><EmptyState icon={PackageX} title="Shipment not found" /></Card>
      ) : (
        <Detail shipment={data} onChange={setData} />
      )}
    </RequirePermission>
  );
}

function Detail({ shipment, onChange }: { shipment: Shipment; onChange: (s: Shipment) => void }) {
  const { can } = useAuth();
  const manage = can("shipping.manage_shipment");
  const [busy, setBusy] = React.useState(false);

  async function run(fn: () => Promise<Shipment>, ok: string) {
    setBusy(true);
    try { onChange(await fn()); toast.success(ok); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Action failed"); }
    finally { setBusy(false); }
  }

  const canCancel = !["in_transit", "out_for_delivery", "delivered", "failed", "returned"].includes(shipment.status);
  const canSync = !["delivered", "failed", "returned"].includes(shipment.status);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <Card>
          <CardHeader><CardTitle>Tracking events</CardTitle></CardHeader>
          <CardBody>
            {shipment.events.length === 0 ? (
              <p className="text-sm text-faint">No events yet.</p>
            ) : (
              <ol className="space-y-0">
                {shipment.events.slice().reverse().map((e, i, arr) => (
                  <li key={e.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span className="mt-1 size-2.5 shrink-0 rounded-full bg-forest" />
                      {i < arr.length - 1 && <span className="w-0.5 flex-1 bg-line" />}
                    </div>
                    <div className="pb-5">
                      <p className="text-sm font-semibold capitalize text-ink">{e.status.replace(/_/g, " ")}</p>
                      <p className="text-sm text-muted">{e.description}</p>
                      <p className="text-xs text-faint">{e.location ? `${e.location} · ` : ""}{formatDateTime(e.timestamp)}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader><CardTitle>Details</CardTitle></CardHeader>
          <CardBody className="space-y-1.5 text-sm">
            <Row label="Order"><Link href={`/orders/${shipment.order_id}`} className="font-semibold text-forest hover:underline">{shipment.order_number}</Link></Row>
            <Row label="Courier"><span className="text-ink">{COURIER_LABEL[shipment.courier]}</span></Row>
            <Row label="AWB"><span className="text-ink">{shipment.awb}</span></Row>
            <Row label="Tracking"><a href={shipment.tracking_url} target="_blank" rel="noreferrer" className="text-forest hover:underline">Open</a></Row>
            <Row label="Est. delivery"><span className="text-ink">{formatDate(shipment.estimated_delivery)}</span></Row>
            <Row label="Delivered"><span className="text-ink">{shipment.delivered_at ? formatDateTime(shipment.delivered_at) : "—"}</span></Row>
            <Row label="Weight"><span className="text-ink">{shipment.weight_kg != null ? `${shipment.weight_kg} kg` : "—"}</span></Row>
          </CardBody>
        </Card>

        {manage && (
          <Card>
            <CardHeader><CardTitle>Actions</CardTitle></CardHeader>
            <CardBody className="space-y-2">
              {canSync && <Button variant="secondary" className="w-full" loading={busy} onClick={() => run(() => syncShipment(shipment.id), "Tracking synced")}><RefreshCw className="size-4" />Sync tracking</Button>}
              {canCancel && <Button variant="danger" className="w-full" loading={busy} onClick={() => run(() => cancelShipment(shipment.id), "Shipment cancelled")}><Ban className="size-4" />Cancel shipment</Button>}
              {!canSync && !canCancel && <p className="text-sm text-faint">No actions available in this state.</p>}
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-3"><span className="text-muted">{label}</span>{children}</div>;
}
