"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { PackageX, Printer } from "lucide-react";
import { getOrder } from "@/lib/admin-api";
import { orderCustomerName } from "@/lib/derive";
import type { Order } from "@/lib/types";
import { useAsync } from "@/lib/use-async";
import { formatDateTime, formatPrice } from "@/lib/utils";
import { RequirePermission } from "@/components/permission-gate";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";

/**
 * Pick list + packing slip — the sheet that goes in the box.
 *
 * Packing was the one step of fulfilment with nothing to hand the person doing
 * it: staff read line items off a screen built for reviewing money. This is
 * ink-friendly (no chrome, black on white) and doubles as the pick list, with
 * a tick box per line so a part-picked order is visible on paper.
 */
export default function PackingSlipPage() {
  const { id } = useParams<{ id: string }>();
  const { data, loading, error, reload } = useAsync<Order | null>(
    () => getOrder(id),
    [id],
  );

  return (
    <RequirePermission perm="orders.view_order">
      <div className="print:hidden">
        <PageHeader
          title="Packing slip"
          description={data?.order_number}
          backHref={`/orders/${id}`}
          actions={
            data ? (
              <Button onClick={() => window.print()}>
                <Printer className="size-4" />Print
              </Button>
            ) : undefined
          }
        />
      </div>
      {loading ? (
        <Card><LoadingState label="Loading order…" /></Card>
      ) : error ? (
        <Card><ErrorState message={error} onRetry={reload} /></Card>
      ) : !data ? (
        <Card><EmptyState icon={PackageX} title="Order not found" /></Card>
      ) : (
        <Card className="print:border-0 print:shadow-none">
          <CardBody>
            <Slip order={data} />
          </CardBody>
        </Card>
      )}
    </RequirePermission>
  );
}

function Slip({ order }: { order: Order }) {
  const a = order.shipping_address;
  const units = order.items.reduce((s, it) => s + it.quantity, 0);

  return (
    <div className="mx-auto max-w-2xl space-y-6 text-ink">
      <header className="flex items-start justify-between gap-4 border-b border-line pb-4">
        <div>
          <p className="text-lg font-bold">SOIS Store</p>
          <p className="text-xs text-muted">Packing slip</p>
        </div>
        <div className="text-right text-sm">
          <p className="font-bold">{order.order_number}</p>
          <p className="text-xs text-muted">{formatDateTime(order.created_at)}</p>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
            Deliver to
          </p>
          <p className="font-semibold">{orderCustomerName(order)}</p>
          <p className="text-sm">{a.line1}{a.line2 ? `, ${a.line2}` : ""}</p>
          <p className="text-sm">{a.city}, {a.state} — {a.pincode}</p>
          <p className="text-sm">{a.phone}</p>
        </div>
        <div className="sm:text-right">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
            Summary
          </p>
          <p className="text-sm">{order.items.length} line{order.items.length === 1 ? "" : "s"} · {units} unit{units === 1 ? "" : "s"}</p>
          <p className="text-sm">Order total {formatPrice(order.total_amount)}</p>
        </div>
      </section>

      <section>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
          Items to pick
        </p>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-y border-line text-left text-xs uppercase tracking-wide text-muted">
              <th className="w-10 py-2 font-semibold">✓</th>
              <th className="py-2 font-semibold">Item</th>
              <th className="py-2 font-semibold">SKU</th>
              <th className="py-2 font-semibold">Size</th>
              <th className="py-2 text-right font-semibold">Qty</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((it) => (
              <tr key={it.id} className="border-b border-line align-top">
                <td className="py-2.5">
                  <span className="inline-block size-4 border border-ink" />
                </td>
                <td className="py-2.5 pr-2">
                  <p className="font-medium">{it.product_name}</p>
                  <p className="text-xs text-muted">
                    {it.metal_type}{it.purity ? ` · ${it.purity}` : ""}
                    {it.gross_weight != null ? ` · ${it.gross_weight} g` : ""}
                  </p>
                </td>
                <td className="py-2.5 pr-2 font-mono text-xs">{it.product_sku}</td>
                <td className="py-2.5 pr-2">{it.selected_size || "—"}</td>
                <td className="py-2.5 text-right font-semibold">{it.quantity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {order.notes && (
        <section>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
            Order notes
          </p>
          <p className="whitespace-pre-line text-sm text-muted">{order.notes}</p>
        </section>
      )}

      <section className="grid gap-6 border-t border-line pt-4 text-xs sm:grid-cols-3">
        <SignOff label="Picked by" />
        <SignOff label="Packed by" />
        <SignOff label="Weight / dimensions" />
      </section>
    </div>
  );
}

function SignOff({ label }: { label: string }) {
  return (
    <div>
      <p className="font-semibold uppercase tracking-wide text-muted">{label}</p>
      <div className="mt-6 border-b border-ink" />
    </div>
  );
}
