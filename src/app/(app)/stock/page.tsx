"use client";

import * as React from "react";
import Link from "next/link";
import { Search, SlidersHorizontal, History } from "lucide-react";
import {
  adjustStock,
  listLowStock,
  listProducts,
  productLedger,
  stockValuation,
} from "@/lib/admin-api";
import { stockLevel } from "@/lib/derive";
import { adjustStockSchema } from "@/lib/schemas";
import { METAL_LABEL, titleCase, type ProductList, type StockLedgerEntry } from "@/lib/types";
import { useAsync, useDebouncedValue } from "@/lib/use-async";
import { cn, formatDateTime, formatPrice, preferStableSrc } from "@/lib/utils";
import { useAuth } from "@/components/auth-provider";
import { RequirePermission } from "@/components/permission-gate";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { StockBadge } from "@/components/ui/badge";
import { Thumb } from "@/components/ui/thumb";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EmptyState, ErrorState, LoadingState, TableSkeleton } from "@/components/ui/states";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";

type Tab = "levels" | "low" | "valuation";
const STOCK_TEXT = { out: "text-red-600", low: "text-amber-600", healthy: "text-ink" } as const;

export default function StockPage() {
  return (
    <RequirePermission perm="inventory.view_stock_ledger">
      <StockInner />
    </RequirePermission>
  );
}

function StockInner() {
  const { can } = useAuth();
  const [tab, setTab] = React.useState<Tab>("levels");
  const [adjust, setAdjust] = React.useState<ProductList | null>(null);
  const [ledgerFor, setLedgerFor] = React.useState<ProductList | null>(null);
  const [refreshKey, setRefreshKey] = React.useState(0);

  const tabs: { id: Tab; label: string; show: boolean }[] = [
    { id: "levels", label: "Stock levels", show: true },
    { id: "low", label: "Low stock", show: true },
    { id: "valuation", label: "Valuation", show: can("reports.view_inventory") },
  ];

  return (
    <div>
      <PageHeader title="Stock" description="Monitor levels, review the ledger, and make manual adjustments." />

      <div className="mb-4 flex gap-1 border-b border-line">
        {tabs.filter((t) => t.show).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "-mb-px border-b-2 px-4 py-2 text-sm font-semibold transition-colors",
              tab === t.id ? "border-forest text-forest" : "border-transparent text-muted hover:text-ink",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "levels" && (
        <LevelsTab
          canAdjust={can("inventory.adjust_stock")}
          onAdjust={setAdjust}
          onLedger={setLedgerFor}
          refreshKey={refreshKey}
        />
      )}
      {tab === "low" && <LowTab onAdjust={can("inventory.adjust_stock") ? setAdjust : undefined} refreshKey={refreshKey} />}
      {tab === "valuation" && <ValuationTab refreshKey={refreshKey} />}

      <AdjustDialog product={adjust} onClose={() => setAdjust(null)} onDone={() => setRefreshKey((k) => k + 1)} />
      <LedgerDialog product={ledgerFor} onClose={() => setLedgerFor(null)} />
    </div>
  );
}

function LevelsTab({
  canAdjust,
  onAdjust,
  onLedger,
  refreshKey,
}: {
  canAdjust: boolean;
  onAdjust: (p: ProductList) => void;
  onLedger: (p: ProductList) => void;
  refreshKey: number;
}) {
  const [q, setQ] = React.useState("");
  const debounced = useDebouncedValue(q);
  const { data, loading, error, reload } = useAsync(
    () => listProducts({ q: debounced, ordering: "name", page_size: 100 }),
    [debounced, refreshKey],
  );
  const rows = data?.items ?? [];

  return (
    <>
      <div className="mb-4 max-w-md">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <Input className="pl-9" placeholder="Search products…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      <Card>
        {loading ? (
          <TableSkeleton rows={7} cols={4} />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : rows.length === 0 ? (
          <EmptyState title="No products" />
        ) : (
          <Table>
            <THead>
              <tr>
                <Th className="w-[45%]">Product</Th>
                <Th>Availability</Th>
                <Th className="text-right">Qty</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </THead>
            <TBody>
              {rows.map((p) => (
                <Tr key={p.id}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <Thumb src={preferStableSrc(p.thumbnail_key, p.thumbnail_url)} alt={p.name} className="size-10 shrink-0" />
                      <div className="min-w-0">
                        <Link href={`/products/${p.id}`} className="truncate font-semibold text-ink hover:text-forest">{p.name}</Link>
                        <p className="truncate text-xs text-faint">{p.sku} · {p.stock_type}</p>
                      </div>
                    </div>
                  </Td>
                  <Td><StockBadge level={stockLevel(p.qty)} /></Td>
                  <Td className="text-right"><span className={cn("font-bold", STOCK_TEXT[stockLevel(p.qty)])}>{p.qty}</span></Td>
                  <Td>
                    <div className="flex justify-end gap-1.5">
                      <Button variant="ghost" size="sm" onClick={() => onLedger(p)}><History className="size-4" />Ledger</Button>
                      {canAdjust && <Button variant="secondary" size="sm" onClick={() => onAdjust(p)}><SlidersHorizontal className="size-4" />Adjust</Button>}
                    </div>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}

function LowTab({ onAdjust, refreshKey }: { onAdjust?: (p: ProductList) => void; refreshKey: number }) {
  const [threshold, setThreshold] = React.useState(5);
  const { data, loading, error, reload } = useAsync(() => listLowStock(threshold), [threshold, refreshKey]);

  return (
    <>
      <div className="mb-4 flex items-center gap-2">
        <label className="text-sm font-semibold text-ink">Threshold ≤</label>
        <Input type="number" className="w-24" value={threshold} min={0} onChange={(e) => setThreshold(Math.max(0, Number(e.target.value) || 0))} />
        {data && <span className="text-sm text-muted">{data.count} product{data.count !== 1 ? "s" : ""} at or below</span>}
      </div>
      <Card>
        {loading ? (
          <TableSkeleton rows={5} cols={3} />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : !data || data.items.length === 0 ? (
          <EmptyState title="All healthy" description="No products at or below this threshold." />
        ) : (
          <Table>
            <THead><tr><Th className="w-[50%]">Product</Th><Th>Availability</Th><Th className="text-right">Qty</Th>{onAdjust && <Th />}</tr></THead>
            <TBody>
              {data.items.map((p) => (
                <Tr key={p.id}>
                  <Td>
                    <Link href={`/products/${p.id}`} className="font-semibold text-ink hover:text-forest">{p.name}</Link>
                    <p className="text-xs text-faint">{p.sku}</p>
                  </Td>
                  <Td><StockBadge level={stockLevel(p.qty)} /></Td>
                  <Td className="text-right"><span className={cn("font-bold", STOCK_TEXT[stockLevel(p.qty)])}>{p.qty}</span></Td>
                  {onAdjust && <Td className="text-right"><Button variant="secondary" size="sm" onClick={() => onAdjust(p)}>Adjust</Button></Td>}
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}

function ValuationTab({ refreshKey }: { refreshKey: number }) {
  const { data, loading, error, reload } = useAsync(() => stockValuation(), [refreshKey]);
  return (
    <Card>
      {loading ? (
        <TableSkeleton rows={7} cols={5} />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data ? null : (
        <>
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <p className="text-sm text-muted">{data.rows.length} products</p>
            <p className="text-sm">Total valuation: <span className="text-lg font-bold text-ink">{formatPrice(data.total_valuation)}</span></p>
          </div>
          <Table>
            <THead><tr><Th>SKU</Th><Th>Product</Th><Th>Metal</Th><Th className="text-right">Qty</Th><Th className="text-right">Last unit cost</Th><Th className="text-right">Value</Th></tr></THead>
            <TBody>
              {data.rows.map((r) => (
                <Tr key={r.id}>
                  <Td className="text-faint">{r.sku}</Td>
                  <Td className="font-medium text-ink">{r.name}</Td>
                  <Td className="text-muted">{METAL_LABEL[r.metal_type]}</Td>
                  <Td className="text-right">{r.qty}</Td>
                  <Td className="text-right text-muted">{r.last_unit_cost != null ? formatPrice(r.last_unit_cost) : "—"}</Td>
                  <Td className="text-right font-semibold">{formatPrice((r.last_unit_cost ?? 0) * r.qty)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </>
      )}
    </Card>
  );
}

function AdjustDialog({ product, onClose, onDone }: { product: ProductList | null; onClose: () => void; onDone: () => void }) {
  const [qty, setQty] = React.useState("");
  const [note, setNote] = React.useState("");
  const [errors, setErrors] = React.useState<{ new_qty?: string; note?: string }>({});
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (product) { setQty(String(product.qty)); setNote(""); setErrors({}); }
  }, [product]);

  async function submit() {
    const parsed = adjustStockSchema.safeParse({ new_qty: qty, note });
    if (!parsed.success) {
      const f = parsed.error.flatten().fieldErrors;
      setErrors({ new_qty: f.new_qty?.[0], note: f.note?.[0] });
      return;
    }
    if (!product) return;
    setBusy(true);
    try {
      await adjustStock(product.id, parsed.data.new_qty, parsed.data.note);
      toast.success("Stock adjusted");
      onDone();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not adjust");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!product} onOpenChange={(o) => !o && onClose()}>
      {product && (
        <DialogContent title="Adjust stock" description={`${product.name} · current ${product.qty}`}>
          <div className="space-y-4">
            <Field label="New quantity" htmlFor="qty" required error={errors.new_qty}>
              <Input id="qty" inputMode="numeric" value={qty} invalid={!!errors.new_qty} onChange={(e) => setQty(e.target.value)} />
            </Field>
            <Field label="Reason / note" htmlFor="note" required error={errors.note} hint="Recorded in the stock ledger">
              <Input id="note" value={note} invalid={!!errors.note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Recount after audit" />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
              <Button size="sm" loading={busy} onClick={submit}>Save adjustment</Button>
            </div>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}

function LedgerDialog({ product, onClose }: { product: ProductList | null; onClose: () => void }) {
  const { data, loading, error } = useAsync<StockLedgerEntry[]>(
    () => (product ? productLedger(product.id) : Promise.resolve([])),
    [product?.id],
  );

  return (
    <Dialog open={!!product} onOpenChange={(o) => !o && onClose()}>
      {product && (
        <DialogContent title="Stock ledger" description={`${product.name} · ${product.sku}`} className="max-w-2xl">
          <div className="max-h-[60vh] overflow-y-auto">
            {loading ? (
              <LoadingState label="Loading ledger…" />
            ) : error ? (
              <ErrorState message={error} />
            ) : !data || data.length === 0 ? (
              <EmptyState title="No movements" description="No stock ledger entries for this product yet." />
            ) : (
              <Table>
                <THead><tr><Th>When</Th><Th>Reason</Th><Th className="text-right">Change</Th><Th className="text-right">Balance</Th><Th>Note</Th></tr></THead>
                <TBody>
                  {data.map((e) => (
                    <Tr key={e.id}>
                      <Td className="whitespace-nowrap text-xs text-muted">{formatDateTime(e.timestamp)}</Td>
                      <Td>{titleCase(e.reason)}</Td>
                      <Td className={cn("text-right font-semibold", e.change_qty >= 0 ? "text-green-600" : "text-red-600")}>{e.change_qty > 0 ? `+${e.change_qty}` : e.change_qty}</Td>
                      <Td className="text-right">{e.balance_after}</Td>
                      <Td className="text-xs text-muted">{e.note}{e.actor_email ? ` · ${e.actor_email}` : ""}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            )}
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
