"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { PackageX, Check, X, PackageCheck } from "lucide-react";
import {
  cancelPurchaseOrder,
  confirmPurchaseOrder,
  getPurchaseOrder,
  receivePurchaseOrder,
} from "@/lib/admin-api";
import { titleCase, type PurchaseOrder } from "@/lib/types";
import { useAsync } from "@/lib/use-async";
import { formatDate, formatPrice } from "@/lib/utils";
import { useAuth } from "@/components/auth-provider";
import { RequirePermission } from "@/components/permission-gate";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PoStatusBadge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";

export default function PurchaseOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, loading, error, reload, setData } = useAsync<PurchaseOrder | null>(() => getPurchaseOrder(id), [id]);

  return (
    <RequirePermission perm="inventory.view_purchase_order">
      <PageHeader
        title={data ? data.po_number : "Purchase order"}
        description={data?.supplier_name}
        backHref="/purchase-orders"
        actions={data ? <PoStatusBadge status={data.status} /> : undefined}
      />
      {loading ? (
        <Card><LoadingState label="Loading…" /></Card>
      ) : error ? (
        <Card><ErrorState message={error} onRetry={reload} /></Card>
      ) : !data ? (
        <Card><EmptyState icon={PackageX} title="Purchase order not found" /></Card>
      ) : (
        <Detail po={data} onChange={setData} />
      )}
    </RequirePermission>
  );
}

function Detail({ po, onChange }: { po: PurchaseOrder; onChange: (p: PurchaseOrder) => void }) {
  const { can } = useAuth();
  const manage = can("inventory.manage_purchase_order");
  const [busy, setBusy] = React.useState(false);
  const [receiveOpen, setReceiveOpen] = React.useState(false);

  async function run(fn: () => Promise<PurchaseOrder>, ok: string) {
    setBusy(true);
    try {
      onChange(await fn());
      toast.success(ok);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <Card>
          <CardHeader><CardTitle>Items</CardTitle></CardHeader>
          <Table>
            <THead><tr><Th>Product</Th><Th className="text-right">Ordered</Th><Th className="text-right">Received</Th><Th className="text-right">Pending</Th><Th className="text-right">Unit cost</Th><Th className="text-right">Total</Th></tr></THead>
            <TBody>
              {po.items.map((it) => (
                <Tr key={it.id}>
                  <Td>
                    <p className="font-medium text-ink">
                      {it.product_name}
                      {it.size && (
                        <span className="ml-2 rounded bg-surface px-1.5 py-0.5 text-xs font-semibold text-muted">Size {it.size}</span>
                      )}
                    </p>
                    <p className="text-xs text-faint">{it.product_sku}</p>
                  </Td>
                  <Td className="text-right">{it.qty_ordered}</Td>
                  <Td className="text-right">{it.qty_received}</Td>
                  <Td className="text-right font-semibold">{it.qty_pending}</Td>
                  <Td className="text-right text-muted">{formatPrice(it.unit_cost)}</Td>
                  <Td className="text-right font-semibold">{formatPrice(it.total_cost)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
          <CardBody className="space-y-1.5 border-t border-line text-sm">
            <Row label="Subtotal" value={formatPrice(po.subtotal)} />
            <Row label="Tax" value={formatPrice(po.tax_amount)} />
            <Row label="Shipping" value={formatPrice(po.shipping_cost)} />
            <Row label="Total" value={formatPrice(po.total_amount)} strong />
          </CardBody>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader><CardTitle>Summary</CardTitle></CardHeader>
          <CardBody className="space-y-1.5 text-sm">
            <Row label="Supplier" value={po.supplier_name} />
            <Row label="Order date" value={formatDate(po.order_date)} />
            <Row label="Expected" value={formatDate(po.expected_delivery_date)} />
            <Row label="Received" value={formatDate(po.received_date)} />
            {po.notes && <p className="border-t border-line pt-2 text-xs text-muted whitespace-pre-line">{po.notes}</p>}
          </CardBody>
        </Card>

        {manage && (
          <Card>
            <CardHeader><CardTitle>Actions</CardTitle></CardHeader>
            <CardBody className="space-y-2">
              {po.status === "draft" && (
                <Button className="w-full" loading={busy} onClick={() => run(() => confirmPurchaseOrder(po.id), "PO confirmed & sent")}>
                  <Check className="size-4" />Confirm & send
                </Button>
              )}
              {(po.status === "ordered" || po.status === "partial") && (
                <Button className="w-full" onClick={() => setReceiveOpen(true)}><PackageCheck className="size-4" />Receive items</Button>
              )}
              {po.status !== "received" && po.status !== "cancelled" && (
                <Button variant="danger" className="w-full" loading={busy} onClick={() => run(() => cancelPurchaseOrder(po.id), "PO cancelled")}>
                  <X className="size-4" />Cancel PO
                </Button>
              )}
              {(po.status === "received" || po.status === "cancelled") && (
                <p className="text-sm text-faint">This PO is {titleCase(po.status).toLowerCase()} — no further actions.</p>
              )}
            </CardBody>
          </Card>
        )}
      </div>

      {receiveOpen && (
        <ReceiveDialog po={po} onClose={() => setReceiveOpen(false)} onDone={(p) => { onChange(p); setReceiveOpen(false); }} />
      )}
    </div>
  );
}

function ReceiveDialog({ po, onClose, onDone }: { po: PurchaseOrder; onClose: () => void; onDone: (p: PurchaseOrder) => void }) {
  const pending = po.items.filter((it) => it.qty_pending > 0);
  const [qtys, setQtys] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(pending.map((it) => [it.id, String(it.qty_pending)])),
  );
  const [busy, setBusy] = React.useState(false);

  async function submit() {
    const receipts = pending
      .map((it) => ({ purchase_order_item_id: it.id, qty_received: Number(qtys[it.id]) || 0 }))
      .filter((r) => r.qty_received > 0);
    if (receipts.length === 0) return toast.error("Enter at least one quantity");
    setBusy(true);
    try {
      const updated = await receivePurchaseOrder(po.id, receipts);
      toast.success("Receipt recorded — stock updated");
      onDone(updated);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not receive");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Receive items" description="Record received quantities. Stock and the ledger update automatically.">
        <div className="space-y-3">
          {pending.map((it) => (
            <div key={it.id} className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">
                  {it.product_name}
                  {it.size && <span className="text-muted"> · Size {it.size}</span>}
                </p>
                <p className="text-xs text-faint">{it.qty_pending} pending</p>
              </div>
              <Input
                className="w-20"
                inputMode="numeric"
                value={qtys[it.id]}
                onChange={(e) => setQtys({ ...qtys, [it.id]: e.target.value })}
              />
            </div>
          ))}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" loading={busy} onClick={submit}>Record receipt</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className={strong ? "text-base font-bold text-ink" : "font-medium text-ink"}>{value}</span>
    </div>
  );
}
