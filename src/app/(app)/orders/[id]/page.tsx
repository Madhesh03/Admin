"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PackageX, User, IndianRupee, Truck } from "lucide-react";
import {
  createShipment,
  getOrder,
  initiateRefund,
  updateOrderStatus,
} from "@/lib/admin-api";
import { orderCustomerName } from "@/lib/derive";
import { ORDER_TRANSITIONS, titleCase, type Order, type OrderStatus } from "@/lib/types";
import { useAsync } from "@/lib/use-async";
import { formatDateTime, formatPrice } from "@/lib/utils";
import { useAuth } from "@/components/auth-provider";
import { RequirePermission } from "@/components/permission-gate";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect, Field, Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { OrderStatusBadge, PaymentBadge } from "@/components/ui/badge";
import { Thumb } from "@/components/ui/thumb";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { toast } from "@/components/ui/toast";
import { OrderTimeline } from "@/components/orders/order-timeline";

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, loading, error, reload, setData } = useAsync<Order | null>(() => getOrder(id), [id]);

  return (
    <RequirePermission perm="orders.view_order">
      <PageHeader
        title={data ? data.order_number : "Order"}
        description={data ? formatDateTime(data.created_at) : undefined}
        backHref="/orders"
        actions={data ? <OrderStatusBadge status={data.status} /> : undefined}
      />
      {loading ? (
        <Card><LoadingState label="Loading order…" /></Card>
      ) : error ? (
        <Card><ErrorState message={error} onRetry={reload} /></Card>
      ) : !data ? (
        <Card><EmptyState icon={PackageX} title="Order not found" /></Card>
      ) : (
        <OrderDetail order={data} onChange={setData} />
      )}
    </RequirePermission>
  );
}

function OrderDetail({ order, onChange }: { order: Order; onChange: (o: Order) => void }) {
  const { can } = useAuth();
  const [pending, setPending] = React.useState<OrderStatus | "">("");
  const [busy, setBusy] = React.useState(false);
  const [refundOpen, setRefundOpen] = React.useState(false);

  const transitions = ORDER_TRANSITIONS[order.status];
  const a = order.shipping_address;

  async function applyStatus() {
    if (!pending) return;
    setBusy(true);
    try {
      const updated = await updateOrderStatus(order.id, pending);
      onChange(updated);
      setPending("");
      toast.success(`Status updated to "${titleCase(pending)}"`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update status");
    } finally {
      setBusy(false);
    }
  }

  async function makeShipment() {
    setBusy(true);
    try {
      const s = await createShipment(order.id);
      toast.success(`Shipment ${s.awb} booked`);
      onChange(await getOrder(order.id).then((o) => o!));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create shipment");
    } finally {
      setBusy(false);
    }
  }

  const canRefund =
    can("orders.process_refund") &&
    (order.payment_status === "captured" || order.payment_status === "partially_refunded");

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Items</CardTitle>
            <span className="text-sm text-faint">{order.items.length} line{order.items.length > 1 ? "s" : ""}</span>
          </CardHeader>
          <CardBody className="space-y-3">
            {order.items.map((it) => (
              <div key={it.id} className="flex items-center gap-3">
                <Thumb src={it.thumbnail_key} alt={it.product_name} className="size-12 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-ink">{it.product_name}</p>
                  <p className="text-xs text-faint">
                    {it.product_sku} · {formatPrice(it.unit_price)} × {it.quantity}
                    {it.selected_size ? ` · Size ${it.selected_size}` : ""}
                  </p>
                </div>
                <p className="font-semibold text-ink">{formatPrice(it.line_total)}</p>
              </div>
            ))}
            <div className="space-y-1.5 border-t border-line pt-3 text-sm">
              <SummaryRow label="Subtotal" value={formatPrice(order.subtotal)} />
              {order.discount_amount > 0 && <SummaryRow label="Discount" value={`− ${formatPrice(order.discount_amount)}`} />}
              <SummaryRow label="Shipping" value={order.shipping_charge === 0 ? "Free" : formatPrice(order.shipping_charge)} />
              <SummaryRow label="Tax (GST)" value={formatPrice(order.tax_amount)} />
              <SummaryRow label="Total" value={formatPrice(order.total_amount)} strong />
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader><CardTitle>Timeline</CardTitle></CardHeader>
          <CardBody><OrderTimeline status={order.status} /></CardBody>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader><CardTitle>Actions</CardTitle></CardHeader>
          <CardBody className="space-y-3">
            {can("orders.update_order_status") ? (
              transitions.length > 0 ? (
                <>
                  <NativeSelect value={pending} onChange={(e) => setPending(e.target.value as OrderStatus)}>
                    <option value="">Change status to…</option>
                    {transitions.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
                  </NativeSelect>
                  <Button className="w-full" loading={busy} disabled={!pending} onClick={applyStatus}>Apply status</Button>
                </>
              ) : (
                <p className="text-sm text-muted">No further transitions from “{titleCase(order.status)}”.</p>
              )
            ) : (
              <p className="text-sm text-faint">You can view this order but not change it.</p>
            )}

            {order.status === "processing" && can("shipping.manage_shipment") && (
              <Button variant="secondary" className="w-full" loading={busy} onClick={makeShipment}>
                <Truck className="size-4" />Create shipment
              </Button>
            )}
            {can("shipping.manage_shipment") && (
              <Button variant="ghost" className="w-full" asChild>
                <Link href="/shipments">View shipments</Link>
              </Button>
            )}
            {canRefund && (
              <Button variant="secondary" className="w-full" onClick={() => setRefundOpen(true)}>
                <IndianRupee className="size-4" />Issue refund
              </Button>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Customer</CardTitle>
            <Link href={`/customers/${encodeURIComponent(order.customer_email)}`} className="text-xs font-semibold text-forest hover:underline">Profile</Link>
          </CardHeader>
          <CardBody className="space-y-3 text-sm">
            <div className="flex items-center gap-2.5">
              <span className="flex size-9 items-center justify-center rounded-full bg-sage text-forest"><User className="size-4" /></span>
              <div>
                <p className="font-semibold text-ink">{orderCustomerName(order)}</p>
                <p className="text-xs text-faint">{order.customer_email}</p>
              </div>
            </div>
            <div className="space-y-0.5 border-t border-line pt-3 text-muted">
              <p className="text-ink">{a.line1}{a.line2 ? `, ${a.line2}` : ""}</p>
              <p>{a.city}, {a.state} — {a.pincode}</p>
              <p>{a.phone}</p>
            </div>
            <div className="space-y-1.5 border-t border-line pt-3">
              <SummaryRow label="Payment" value={<PaymentBadge status={order.payment_status} />} />
              <SummaryRow label="Razorpay" value={order.razorpay_order_id} />
            </div>
          </CardBody>
        </Card>
      </div>

      <RefundDialog order={order} open={refundOpen} onOpenChange={setRefundOpen} onDone={(o) => onChange(o)} />
    </div>
  );
}

function RefundDialog({
  order,
  open,
  onOpenChange,
  onDone,
}: {
  order: Order;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone: (o: Order) => void;
}) {
  const [amount, setAmount] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => { if (open) { setAmount(""); setReason(""); } }, [open]);

  async function submit() {
    setBusy(true);
    try {
      await initiateRefund(order.id, amount ? Number(amount) : null, reason || undefined);
      toast.success("Refund initiated");
      const updated = await getOrder(order.id);
      if (updated) onDone(updated);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Refund failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Issue refund" description={`Order ${order.order_number} · captured ${formatPrice(order.total_amount)}`}>
        <div className="space-y-4">
          <Field label="Amount (₹)" htmlFor="amt" hint="Leave blank for a full refund">
            <Input id="amt" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={String(order.total_amount)} />
          </Field>
          <Field label="Reason" htmlFor="reason">
            <Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Customer request" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button size="sm" loading={busy} onClick={submit}>Issue refund</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SummaryRow({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className={strong ? "text-base font-bold text-ink" : "font-medium text-ink"}>{value}</span>
    </div>
  );
}
