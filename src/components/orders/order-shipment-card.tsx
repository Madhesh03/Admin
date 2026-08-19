"use client";

import * as React from "react";
import Link from "next/link";
import { ExternalLink, RefreshCw, Truck, TriangleAlert } from "lucide-react";
import { assignAwb, listShipments, syncShipment } from "@/lib/admin-api";
import { courierLabel, type Order, type Shipment } from "@/lib/types";
import { formatDate, formatDateTime, formatPrice } from "@/lib/utils";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { ShipmentStatusBadge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/states";
import { toast } from "@/components/ui/toast";

/** Statuses where nothing more will arrive, so polling would be waste. */
const SETTLED = ["delivered", "failed", "returned", "cancelled"];
/** Courier scans land minutes apart at best — a slow poll is plenty. */
const POLL_MS = 45_000;

/**
 * The order's own shipment, in-place.
 *
 * Previously the order screen linked to the full shipments list, so after
 * booking there was no way to see the AWB or tracking from the order you just
 * booked — the two halves of one job lived on two screens.
 *
 * Re-fetches on `refreshKey` so a booking made in the dialog shows up here
 * without a page reload.
 */
export function OrderShipmentCard({
  order,
  refreshKey,
  onOrderMayHaveChanged,
}: {
  order: Order;
  refreshKey: number;
  onOrderMayHaveChanged: () => void;
}) {
  const { can } = useAuth();
  const [shipment, setShipment] = React.useState<Shipment | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);

  /** Fetch the live shipment. Returns it so callers can diff, not just render. */
  const load = React.useCallback(
    async (silent = false): Promise<Shipment | null> => {
      if (!silent) setLoading(true);
      try {
        const list = await listShipments({ order_id: order.id });
        // Newest non-cancelled booking is the live one; a cancelled booking is
        // still worth showing when it's all there is, so staff know why.
        const live = list.find((s) => s.status !== "cancelled") ?? list[0] ?? null;
        setShipment(live);
        return live;
      } catch {
        if (!silent) setShipment(null);
        return null;
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [order.id],
  );

  React.useEffect(() => {
    void load();
  }, [load, refreshKey]);

  // Tracking arrives by webhook, on the courier's schedule rather than ours.
  // Without this the screen silently goes stale: the parcel gets picked up and
  // the order still reads "processing" until someone thinks to reload. Poll
  // only while the parcel is actually moving, and reload the order only when
  // the status really changed — a background poll must never yank the page out
  // from under someone mid-edit.
  const status = shipment?.status;
  const inFlight = !!shipment?.awb && !!status && !SETTLED.includes(status);

  React.useEffect(() => {
    if (!inFlight) return;
    const timer = setInterval(async () => {
      const fresh = await load(true);
      if (fresh && fresh.status !== status) onOrderMayHaveChanged();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [inFlight, status, load, onOrderMayHaveChanged]);

  if (loading) {
    return (
      <Card>
        <CardHeader><CardTitle>Shipment</CardTitle></CardHeader>
        <CardBody className="flex justify-center py-6"><Spinner /></CardBody>
      </Card>
    );
  }
  if (!shipment) return null;

  const manage = can("shipping.manage_shipment");

  async function run(fn: () => Promise<Shipment>, ok: string) {
    setBusy(true);
    try {
      setShipment(await fn());
      toast.success(ok);
      // Tracking can advance the order (picked up → shipped, delivered).
      onOrderMayHaveChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  const canSync = !SETTLED.includes(shipment.status);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Shipment</CardTitle>
        <ShipmentStatusBadge status={shipment.status} />
      </CardHeader>
      <CardBody className="space-y-3 text-sm">
        {!shipment.awb && (
          <div className="flex gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
            <TriangleAlert className="size-4 shrink-0" />
            <div className="space-y-2">
              <p>
                Booked with the courier, but no AWB was issued — the parcel
                cannot ship until one is. Retry rather than re-booking, which
                would create a duplicate consignment.
              </p>
              {manage && (
                <Button
                  size="sm"
                  variant="secondary"
                  loading={busy}
                  onClick={() => run(() => assignAwb(shipment.id), "AWB assigned")}
                >
                  Retry AWB
                </Button>
              )}
            </div>
          </div>
        )}

        <Row label="Courier">
          <span className="text-ink">{courierLabel(shipment)}</span>
        </Row>
        {shipment.awb && (
          <Row label="AWB"><span className="font-medium text-ink">{shipment.awb}</span></Row>
        )}
        {shipment.freight_charge != null && (
          <Row label="Freight">
            <span className="text-ink">{formatPrice(shipment.freight_charge)}</span>
          </Row>
        )}
        {shipment.weight_kg != null && (
          <Row label="Parcel">
            <span className="text-ink">
              {shipment.weight_kg} kg
              {shipment.length_cm != null &&
                ` · ${shipment.length_cm}×${shipment.breadth_cm}×${shipment.height_cm} cm`}
            </span>
          </Row>
        )}
        <Row label="Est. delivery">
          <span className="text-ink">{formatDate(shipment.estimated_delivery)}</span>
        </Row>
        {shipment.pickup_scheduled_at && (
          <Row label="Pickup">
            <span className="text-ink">{formatDateTime(shipment.pickup_scheduled_at)}</span>
          </Row>
        )}
        <Row label="Last synced">
          <span className="text-ink">
            {shipment.last_synced_at ? formatDateTime(shipment.last_synced_at) : "Never"}
          </span>
        </Row>

        <div className="flex flex-wrap gap-2 border-t border-line pt-3">
          {shipment.tracking_url && (
            <Button size="sm" variant="secondary" asChild>
              <a href={shipment.tracking_url} target="_blank" rel="noreferrer">
                <ExternalLink className="size-4" />Track
              </a>
            </Button>
          )}
          {manage && canSync && shipment.awb && (
            <Button
              size="sm"
              variant="secondary"
              loading={busy}
              onClick={() => run(() => syncShipment(shipment.id), "Tracking synced")}
            >
              <RefreshCw className="size-4" />Sync
            </Button>
          )}
          <Button size="sm" variant="ghost" asChild>
            <Link href={`/shipments/${shipment.id}`}>
              <Truck className="size-4" />Manage
            </Link>
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted">{label}</span>
      {children}
    </div>
  );
}
