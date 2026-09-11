"use client";

import * as React from "react";
import Link from "next/link";
import { Search, SlidersHorizontal, History, X } from "lucide-react";
import {
  adjustStock,
  listCategories,
  listLowStock,
  listProducts,
  productLedger,
  stockValuation,
} from "@/lib/admin-api";
import { stockLevel } from "@/lib/derive";
import { adjustStockSchema } from "@/lib/schemas";
import { type Category, METAL_LABEL, titleCase, type ProductList, type StockLedgerEntry } from "@/lib/types";
import { useAsync, useDebouncedValue, usePagination } from "@/lib/use-async";
import { cn, formatDateTime, formatPrice, preferStableSrc } from "@/lib/utils";
import { useAuth } from "@/components/auth-provider";
import { RequirePermission } from "@/components/permission-gate";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { StockBadge } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/pagination";
import { Thumb } from "@/components/ui/thumb";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EmptyState, ErrorState, LoadingState, TableSkeleton } from "@/components/ui/states";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";

type Tab = "levels" | "low" | "valuation";
const STOCK_TEXT = { out: "text-red-600", low: "text-amber-600", healthy: "text-ink" } as const;
const STOCK_PAGE_SIZE = 20;

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
  const [category, setCategory] = React.useState<string>("all");
  const [page, setPage] = React.useState(1);
  const debounced = useDebouncedValue(q);
  const cats = useAsync<Category[]>(() => listCategories(), []);
  React.useEffect(() => {
    setPage(1);
  }, [debounced, category]);
  const { data, loading, error, reload } = useAsync(
    () => listProducts({ q: debounced, category, ordering: "name", page, page_size: STOCK_PAGE_SIZE }),
    [debounced, category, refreshKey, page],
  );
  const rows = data?.items ?? [];
  const total = data?.meta.total ?? 0;

  // Bulk selection, scoped to products visible on the current page (mirrors
  // the Products list page's bulk-edit pattern).
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = React.useState(false);
  function toggleOne(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }
  function toggleAll(on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      // Sized products (rings, etc.) track stock per size — the whole-product
      // qty here is just a denormalized sum, so bulk-setting it directly would
      // desync it from the per-size rows. Adjust those on the product page.
      for (const p of rows) {
        if (p.has_sizes) continue;
        if (on) next.add(p.id);
        else next.delete(p.id);
      }
      return next;
    });
  }
  const selectableRows = rows.filter((p) => !p.has_sizes);
  const selectedProducts = rows.filter((p) => selected.has(p.id));
  const allSelected = selectableRows.length > 0 && selectedProducts.length === selectableRows.length;
  const someSelected = selectedProducts.length > 0 && !allSelected;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <Input className="pl-9" placeholder="Search products…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <NativeSelect className="w-auto min-w-[130px]" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="all">All categories</option>
          {(cats.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </NativeSelect>
      </div>

      {canAdjust && selectedProducts.length > 0 && (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-forest/30 bg-forest/5 px-4 py-2.5">
          <span className="text-sm font-semibold text-ink">{selectedProducts.length} selected</span>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setBulkOpen(true)}>
              <SlidersHorizontal className="size-4" />
              Bulk set stock
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              <X className="size-4" />
              Clear
            </Button>
          </div>
        </div>
      )}

      <Card>
        {loading ? (
          <TableSkeleton rows={7} cols={4} />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : rows.length === 0 ? (
          <EmptyState title="No products" />
        ) : (
          <>
          <Table>
            <THead>
              <tr>
                {canAdjust && (
                  <Th className="w-10">
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      className="size-4 cursor-pointer accent-forest align-middle"
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someSelected;
                      }}
                      onChange={(e) => toggleAll(e.target.checked)}
                    />
                  </Th>
                )}
                <Th className="w-[45%]">Product</Th>
                <Th>Availability</Th>
                <Th className="text-right">Qty</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </THead>
            <TBody>
              {rows.map((p) => (
                <Tr key={p.id}>
                  {canAdjust && (
                    <Td onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Select ${p.name}`}
                        className="size-4 cursor-pointer accent-forest align-middle disabled:cursor-not-allowed disabled:opacity-30"
                        checked={selected.has(p.id)}
                        disabled={p.has_sizes}
                        title={p.has_sizes ? "Sized product — adjust stock per size on its product page" : undefined}
                        onChange={(e) => toggleOne(p.id, e.target.checked)}
                      />
                    </Td>
                  )}
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
                      {canAdjust && (
                        p.has_sizes ? (
                          <Button variant="secondary" size="sm" asChild>
                            <Link href={`/products/${p.id}`}>Per size →</Link>
                          </Button>
                        ) : (
                          <Button variant="secondary" size="sm" onClick={() => onAdjust(p)}><SlidersHorizontal className="size-4" />Adjust</Button>
                        )
                      )}
                    </div>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
          <Pagination page={page} pageSize={STOCK_PAGE_SIZE} total={total} onPageChange={setPage} />
          </>
        )}
      </Card>

      {canAdjust && (
        <BulkAdjustDialog
          open={bulkOpen}
          onClose={() => setBulkOpen(false)}
          products={selectedProducts}
          onDone={() => {
            setSelected(new Set());
            reload();
          }}
        />
      )}
    </>
  );
}

function BulkAdjustDialog({
  open,
  onClose,
  products,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  products: ProductList[];
  onDone: () => void;
}) {
  const [qty, setQty] = React.useState("");
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string | undefined>();
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (open) { setQty(""); setNote(""); setError(undefined); }
  }, [open]);

  async function submit() {
    const n = Number(qty);
    if (!Number.isInteger(n) || n < 0) {
      setError("Enter a whole number, 0 or more");
      return;
    }
    setError(undefined);
    setBusy(true);
    let failed = 0;
    let skipped = 0;
    for (const p of products) {
      // Sized products can't be set here — the backend rejects a whole-product
      // qty change for them (it must go through a specific size). The
      // selection UI already excludes them; this is just a backstop.
      if (p.has_sizes) { skipped++; continue; }
      // Already at the target — adjustStock rejects a same-value "change",
      // so leave it alone instead of counting it as a failure.
      if (p.qty === n) { skipped++; continue; }
      try {
        await adjustStock(p.id, n, note.trim());
      } catch {
        failed++;
      }
    }
    setBusy(false);
    const changed = products.length - skipped;
    if (failed) {
      toast.error(`${failed} of ${changed} product${changed > 1 ? "s" : ""} failed to update`);
    } else if (changed === 0) {
      toast.success("Already at that quantity — nothing to change");
    } else {
      toast.success(`Set stock to ${n} for ${changed} product${changed > 1 ? "s" : ""}`);
    }
    onDone();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      {open && (
        <DialogContent
          title="Bulk set stock"
          description={`${products.length} product${products.length > 1 ? "s" : ""} selected — quantity is set to the same value for each`}
        >
          <div className="space-y-4">
            <Field label="New quantity" htmlFor="bulk-qty" required error={error} hint="Every selected product's stock is set to this exact value">
              <Input id="bulk-qty" inputMode="numeric" value={qty} invalid={!!error} onChange={(e) => setQty(e.target.value)} placeholder="e.g. 0" />
            </Field>
            <Field label="Reason / note" htmlFor="bulk-note" hint="Optional — recorded in the stock ledger for each product">
              <Input id="bulk-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Recount after audit" />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
              <Button size="sm" loading={busy} onClick={submit}>Save</Button>
            </div>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}

function LowTab({ onAdjust, refreshKey }: { onAdjust?: (p: ProductList) => void; refreshKey: number }) {
  const [threshold, setThreshold] = React.useState(1);
  const { data, loading, error, reload } = useAsync(() => listLowStock(threshold), [threshold, refreshKey]);
  const { page, setPage, pageRows, total } = usePagination(data?.items ?? [], 20);
  React.useEffect(() => {
    setPage(1);
  }, [threshold, setPage]);

  // `onAdjust` is only passed down when the user has inventory.adjust_stock,
  // so it doubles as the permission check for bulk adjust too.
  const canAdjust = !!onAdjust;
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = React.useState(false);
  function toggleOne(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }
  function toggleAll(on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      // Sized products track stock per size — bulk-setting the whole-product
      // qty would desync it from the per-size rows. Adjust those on the
      // product page instead.
      for (const p of pageRows) {
        if (p.has_sizes) continue;
        if (on) next.add(p.id);
        else next.delete(p.id);
      }
      return next;
    });
  }
  const selectableRows = pageRows.filter((p) => !p.has_sizes);
  const selectedProducts = pageRows.filter((p) => selected.has(p.id));
  const allSelected = selectableRows.length > 0 && selectedProducts.length === selectableRows.length;
  const someSelected = selectedProducts.length > 0 && !allSelected;

  return (
    <>
      <div className="mb-4 flex items-center gap-2">
        <label className="text-sm font-semibold text-ink">Threshold ≤</label>
        <Input type="number" className="w-24" value={threshold} min={0} onChange={(e) => setThreshold(Math.max(0, Number(e.target.value) || 0))} />
        {data && <span className="text-sm text-muted">{data.count} product{data.count !== 1 ? "s" : ""} at or below</span>}
      </div>

      {canAdjust && selectedProducts.length > 0 && (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-forest/30 bg-forest/5 px-4 py-2.5">
          <span className="text-sm font-semibold text-ink">{selectedProducts.length} selected</span>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setBulkOpen(true)}>
              <SlidersHorizontal className="size-4" />
              Bulk set stock
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              <X className="size-4" />
              Clear
            </Button>
          </div>
        </div>
      )}

      <Card>
        {loading ? (
          <TableSkeleton rows={5} cols={3} />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : !data || data.items.length === 0 ? (
          <EmptyState title="All healthy" description="No products at or below this threshold." />
        ) : (
          <>
          <Table>
            <THead>
              <tr>
                {canAdjust && (
                  <Th className="w-10">
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      className="size-4 cursor-pointer accent-forest align-middle"
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someSelected;
                      }}
                      onChange={(e) => toggleAll(e.target.checked)}
                    />
                  </Th>
                )}
                <Th className="w-[50%]">Product</Th><Th>Availability</Th><Th className="text-right">Qty</Th>{onAdjust && <Th />}
              </tr>
            </THead>
            <TBody>
              {pageRows.map((p) => (
                <Tr key={p.id}>
                  {canAdjust && (
                    <Td onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Select ${p.name}`}
                        className="size-4 cursor-pointer accent-forest align-middle disabled:cursor-not-allowed disabled:opacity-30"
                        checked={selected.has(p.id)}
                        disabled={p.has_sizes}
                        title={p.has_sizes ? "Sized product — adjust stock per size on its product page" : undefined}
                        onChange={(e) => toggleOne(p.id, e.target.checked)}
                      />
                    </Td>
                  )}
                  <Td>
                    <Link href={`/products/${p.id}`} className="font-semibold text-ink hover:text-forest">{p.name}</Link>
                    <p className="text-xs text-faint">{p.sku}</p>
                  </Td>
                  <Td><StockBadge level={stockLevel(p.qty)} /></Td>
                  <Td className="text-right"><span className={cn("font-bold", STOCK_TEXT[stockLevel(p.qty)])}>{p.qty}</span></Td>
                  {onAdjust && (
                    <Td className="text-right">
                      {p.has_sizes ? (
                        <Button variant="secondary" size="sm" asChild>
                          <Link href={`/products/${p.id}`}>Per size →</Link>
                        </Button>
                      ) : (
                        <Button variant="secondary" size="sm" onClick={() => onAdjust(p)}>Adjust</Button>
                      )}
                    </Td>
                  )}
                </Tr>
              ))}
            </TBody>
          </Table>
          <Pagination page={page} pageSize={20} total={total} onPageChange={setPage} />
          </>
        )}
      </Card>

      {canAdjust && (
        <BulkAdjustDialog
          open={bulkOpen}
          onClose={() => setBulkOpen(false)}
          products={selectedProducts}
          onDone={() => {
            setSelected(new Set());
            reload();
          }}
        />
      )}
    </>
  );
}

function ValuationTab({ refreshKey }: { refreshKey: number }) {
  const { data, loading, error, reload } = useAsync(() => stockValuation(), [refreshKey]);
  const { page, setPage, pageRows, total } = usePagination(data?.rows ?? [], 20);
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
              {pageRows.map((r) => (
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
          <Pagination page={page} pageSize={20} total={total} onPageChange={setPage} />
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
            <Field label="Reason / note" htmlFor="note" error={errors.note} hint="Optional — recorded in the stock ledger">
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
                <THead><tr><Th>When</Th><Th>Reason</Th><Th>Size</Th><Th className="text-right">Change</Th><Th className="text-right">Balance</Th><Th>Note</Th></tr></THead>
                <TBody>
                  {data.map((e) => (
                    <Tr key={e.id}>
                      <Td className="whitespace-nowrap text-xs text-muted">{formatDateTime(e.timestamp)}</Td>
                      <Td>{titleCase(e.reason)}</Td>
                      <Td className="text-muted">{e.size || "—"}</Td>
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
