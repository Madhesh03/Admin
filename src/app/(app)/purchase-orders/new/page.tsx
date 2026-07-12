"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Save } from "lucide-react";
import { createPurchaseOrder, listProducts, listSuppliers } from "@/lib/admin-api";
import type { ProductList, Supplier } from "@/lib/types";
import { useAsync } from "@/lib/use-async";
import { formatPrice } from "@/lib/utils";
import { RequirePermission } from "@/components/permission-gate";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/states";
import { toast } from "@/components/ui/toast";

interface Line { product_id: string; qty_ordered: string; unit_cost: string }

export default function NewPurchaseOrderPage() {
  return (
    <RequirePermission perm="inventory.manage_purchase_order">
      <Inner />
    </RequirePermission>
  );
}

function Inner() {
  const router = useRouter();
  const suppliers = useAsync<Supplier[]>(() => listSuppliers({ active: true }), []);
  const products = useAsync(() => listProducts({ page_size: 200, ordering: "name" }), []);

  const [supplierId, setSupplierId] = React.useState("");
  const [orderDate, setOrderDate] = React.useState("");
  const [expected, setExpected] = React.useState("");
  const [tax, setTax] = React.useState("0");
  const [shipping, setShipping] = React.useState("0");
  const [notes, setNotes] = React.useState("");
  const [lines, setLines] = React.useState<Line[]>([{ product_id: "", qty_ordered: "1", unit_cost: "" }]);
  const [busy, setBusy] = React.useState(false);

  const productList: ProductList[] = products.data?.items ?? [];

  const subtotal = lines.reduce((s, l) => s + (Number(l.qty_ordered) || 0) * (Number(l.unit_cost) || 0), 0);
  const total = subtotal + (Number(tax) || 0) + (Number(shipping) || 0);

  function setLine(i: number, k: keyof Line, v: string) {
    setLines((ls) => { const c = ls.slice(); c[i] = { ...c[i], [k]: v }; return c; });
  }

  async function submit() {
    if (!supplierId) return toast.error("Select a supplier");
    const items = lines
      .filter((l) => l.product_id && Number(l.qty_ordered) > 0)
      .map((l) => ({ product_id: l.product_id, qty_ordered: Number(l.qty_ordered), unit_cost: Number(l.unit_cost) || 0 }));
    if (items.length === 0) return toast.error("Add at least one line item");
    setBusy(true);
    try {
      const po = await createPurchaseOrder({
        supplier_id: supplierId,
        items,
        order_date: orderDate || null,
        expected_delivery_date: expected || null,
        tax_amount: Number(tax) || 0,
        shipping_cost: Number(shipping) || 0,
        notes,
      });
      toast.success(`${po.po_number} created`);
      router.push(`/purchase-orders/${po.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create PO");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title="New purchase order" description="Draft a PO, then confirm to send it to the supplier." backHref="/purchase-orders" />

      {suppliers.data && suppliers.data.length === 0 ? (
        <Card><EmptyState title="No active suppliers" description="Add a supplier first." /></Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Card>
              <CardHeader><CardTitle>Line items</CardTitle><Button variant="secondary" size="sm" onClick={() => setLines([...lines, { product_id: "", qty_ordered: "1", unit_cost: "" }])}><Plus className="size-4" />Add line</Button></CardHeader>
              <CardBody className="space-y-3">
                {lines.map((l, i) => (
                  <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_90px_120px_auto]">
                    <NativeSelect value={l.product_id} onChange={(e) => setLine(i, "product_id", e.target.value)}>
                      <option value="">Select product…</option>
                      {productList.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                    </NativeSelect>
                    <Input inputMode="numeric" placeholder="Qty" value={l.qty_ordered} onChange={(e) => setLine(i, "qty_ordered", e.target.value)} />
                    <Input inputMode="numeric" placeholder="Unit cost ₹" value={l.unit_cost} onChange={(e) => setLine(i, "unit_cost", e.target.value)} />
                    <Button variant="ghost" size="icon" onClick={() => setLines(lines.filter((_, x) => x !== i))}><Trash2 className="size-4 text-faint" /></Button>
                  </div>
                ))}
              </CardBody>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader><CardTitle>Details</CardTitle></CardHeader>
              <CardBody className="space-y-4">
                <Field label="Supplier" required>
                  <NativeSelect value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                    <option value="">Select…</option>
                    {(suppliers.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </NativeSelect>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Order date"><Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} /></Field>
                  <Field label="Expected"><Input type="date" value={expected} onChange={(e) => setExpected(e.target.value)} /></Field>
                  <Field label="Tax (₹)"><Input inputMode="numeric" value={tax} onChange={(e) => setTax(e.target.value)} /></Field>
                  <Field label="Shipping (₹)"><Input inputMode="numeric" value={shipping} onChange={(e) => setShipping(e.target.value)} /></Field>
                </div>
                <Field label="Notes"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
              </CardBody>
            </Card>

            <Card>
              <CardBody className="space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-muted">Subtotal</span><span className="font-medium">{formatPrice(subtotal)}</span></div>
                <div className="flex justify-between"><span className="text-muted">Tax</span><span>{formatPrice(Number(tax) || 0)}</span></div>
                <div className="flex justify-between"><span className="text-muted">Shipping</span><span>{formatPrice(Number(shipping) || 0)}</span></div>
                <div className="flex justify-between border-t border-line pt-1.5"><span className="text-muted">Total</span><span className="text-base font-bold text-ink">{formatPrice(total)}</span></div>
              </CardBody>
            </Card>

            <div className="flex flex-col gap-2">
              <Button loading={busy} onClick={submit}><Save className="size-4" />Create draft PO</Button>
              <Button variant="secondary" onClick={() => router.push("/purchase-orders")}>Cancel</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
