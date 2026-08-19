"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Ban,
  ExternalLink,
  FileText,
  PackageX,
  RefreshCw,
  ScrollText,
  Tag,
  TriangleAlert,
  Truck,
} from "lucide-react";
import {
  assignAwb,
  cancelShipment,
  generateLabel,
  generateManifest,
  getShipment,
  schedulePickup,
  syncShipment,
} from "@/lib/admin-api";
import { courierLabel, type Shipment } from "@/lib/types";
import { useAsync } from "@/lib/use-async";
import { formatDate, formatDateTime, formatPrice } from "@/lib/utils";
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
        description={data?.awb || undefined}
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

  const settled = ["delivered", "failed", "returned", "cancelled"];
  const canCancel = shipment.status === "pending" || shipment.status === "booked";
  const canSync = !settled.includes(shipment.status) && !!shipment.awb;
  const canPickup =
    !!shipment.awb && (shipment.status === "pending" || shipment.status === "booked");
  const canDocs = !!shipment.awb;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        {!shipment.awb && (
          <Card>
            <CardBody className="flex gap-3 bg-amber-50">
              <TriangleAlert className="size-5 shrink-0 text-amber-700" />
              <div className="space-y-2">
                <p className="text-sm font-semibold text-amber-900">No waybill assigned</p>
                <p className="text-sm text-amber-800">
                  The Shiprocket order exists but the courier issued no AWB, so
                  this parcel cannot move. Retry the assignment — booking again
                  would create a second consignment for the same order.
                </p>
                {manage && (
                  <Button
                    size="sm"
                    loading={busy}
                    onClick={() => run(() => assignAwb(shipment.id), "AWB assigned")}
                  >
                    <Tag className="size-4" />Retry AWB assignment
                  </Button>
                )}
              </div>
            </CardBody>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Tracking events</CardTitle>
            <span className="text-xs text-faint">
              {shipment.last_synced_at
                ? `Synced ${formatDateTime(shipment.last_synced_at)}`
                : "Never synced"}
            </span>
          </CardHeader>
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
            <Row label="Courier"><span className="text-ink">{courierLabel(shipment)}</span></Row>
            <Row label="AWB"><span className="text-ink">{shipment.awb || "—"}</span></Row>
            <Row label="Freight">
              <span className="text-ink">
                {shipment.freight_charge != null ? formatPrice(shipment.freight_charge) : "—"}
              </span>
            </Row>
            <Row label="Tracking">
              {shipment.tracking_url ? (
                <a href={shipment.tracking_url} target="_blank" rel="noreferrer" className="text-forest hover:underline">Open</a>
              ) : (
                <span className="text-faint">—</span>
              )}
            </Row>
            <Row label="Est. delivery"><span className="text-ink">{formatDate(shipment.estimated_delivery)}</span></Row>
            <Row label="Delivered"><span className="text-ink">{shipment.delivered_at ? formatDateTime(shipment.delivered_at) : "—"}</span></Row>
            <Row label="Weight"><span className="text-ink">{shipment.weight_kg != null ? `${shipment.weight_kg} kg` : "—"}</span></Row>
            <Row label="Dimensions">
              <span className="text-ink">
                {shipment.length_cm != null
                  ? `${shipment.length_cm}×${shipment.breadth_cm}×${shipment.height_cm} cm`
                  : "—"}
              </span>
            </Row>
            <Row label="Pickup">
              <span className="text-ink">
                {shipment.pickup_scheduled_at
                  ? `${formatDateTime(shipment.pickup_scheduled_at)}${shipment.pickup_token ? ` · ${shipment.pickup_token}` : ""}`
                  : "Not scheduled"}
              </span>
            </Row>
          </CardBody>
        </Card>

        {(shipment.label_url || shipment.manifest_url) && (
          <Card>
            <CardHeader><CardTitle>Documents</CardTitle></CardHeader>
            <CardBody className="space-y-2">
              {shipment.label_url && (
                <Button variant="secondary" className="w-full" asChild>
                  <a href={shipment.label_url} target="_blank" rel="noreferrer">
                    <FileText className="size-4" />Shipping label
                    <ExternalLink className="size-3.5" />
                  </a>
                </Button>
              )}
              {shipment.manifest_url && (
                <Button variant="secondary" className="w-full" asChild>
                  <a href={shipment.manifest_url} target="_blank" rel="noreferrer">
                    <ScrollText className="size-4" />Manifest
                    <ExternalLink className="size-3.5" />
                  </a>
                </Button>
              )}
            </CardBody>
          </Card>
        )}

        {manage && (
          <Card>
            <CardHeader><CardTitle>Actions</CardTitle></CardHeader>
            <CardBody className="space-y-2">
              {canPickup && (
                <Button
                  variant={shipment.pickup_scheduled_at ? "secondary" : "primary"}
                  className="w-full"
                  loading={busy}
                  onClick={() => run(() => schedulePickup(shipment.id), "Pickup requested")}
                >
                  <Truck className="size-4" />
                  {shipment.pickup_scheduled_at ? "Re-request pickup" : "Schedule pickup"}
                </Button>
              )}
              {canDocs && (
                <Button
                  variant="secondary"
                  className="w-full"
                  loading={busy}
                  onClick={() => run(() => generateLabel(shipment.id), "Label generated")}
                >
                  <FileText className="size-4" />
                  {shipment.label_url ? "Regenerate label" : "Generate label"}
                </Button>
              )}
              {canDocs && (
                <Button
                  variant="secondary"
                  className="w-full"
                  loading={busy}
                  onClick={() => run(() => generateManifest(shipment.id), "Manifest generated")}
                >
                  <ScrollText className="size-4" />
                  {shipment.manifest_url ? "Regenerate manifest" : "Generate manifest"}
                </Button>
              )}
              {canSync && (
                <Button
                  variant="secondary"
                  className="w-full"
                  loading={busy}
                  onClick={() => run(() => syncShipment(shipment.id), "Tracking synced")}
                >
                  <RefreshCw className="size-4" />Sync tracking
                </Button>
              )}
              {canCancel && (
                <Button
                  variant="danger"
                  className="w-full"
                  loading={busy}
                  onClick={() => run(() => cancelShipment(shipment.id), "Shipment cancelled")}
                >
                  <Ban className="size-4" />Cancel shipment
                </Button>
              )}
              {!canPickup && !canDocs && !canSync && !canCancel && (
                <p className="text-sm text-faint">No actions available in this state.</p>
              )}
              {shipment.status === "cancelled" && (
                <p className="text-xs text-faint">
                  Cancelled — the order can be booked again with another courier
                  from its own page.
                </p>
              )}
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
