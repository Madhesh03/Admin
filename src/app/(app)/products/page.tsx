"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Search, MoreHorizontal, Pencil, Archive, Star } from "lucide-react";
import {
  archiveProduct,
  listProducts,
  type ListProductsParams,
} from "@/lib/admin-api";
import { stockLevel } from "@/lib/derive";
import {
  METAL_LABEL,
  METAL_TYPES,
  PRODUCT_STATUSES,
  titleCase,
  type Category,
  type ProductList,
} from "@/lib/types";
import { listCategories } from "@/lib/admin-api";
import { useAsync, useDebouncedValue } from "@/lib/use-async";
import { cn, formatPrice, preferStableSrc } from "@/lib/utils";
import { useAuth } from "@/components/auth-provider";
import { RequirePermission } from "@/components/permission-gate";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, NativeSelect } from "@/components/ui/input";
import { Thumb } from "@/components/ui/thumb";
import { ProductStatusBadge } from "@/components/ui/badge";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/states";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";

const STOCK_TEXT = { out: "text-red-600", low: "text-amber-600", healthy: "text-ink" } as const;

export default function ProductsPage() {
  return (
    <RequirePermission perm="catalog.view_product">
      <ProductsInner />
    </RequirePermission>
  );
}

function ProductsInner() {
  const router = useRouter();
  const { can } = useAuth();
  const [q, setQ] = React.useState("");
  const [category, setCategory] = React.useState<string>("all");
  const [metal, setMetal] = React.useState<ListProductsParams["metal_type"]>("all");
  const [status, setStatus] = React.useState<ListProductsParams["status"]>("all");
  const [ordering, setOrdering] = React.useState("-created_at");
  const debounced = useDebouncedValue(q);

  const cats = useAsync<Category[]>(() => listCategories(), []);
  const { data, loading, error, reload } = useAsync(
    () => listProducts({ q: debounced, category, metal_type: metal, status, ordering }),
    [debounced, category, metal, status, ordering],
  );

  const [toArchive, setToArchive] = React.useState<ProductList | null>(null);
  const [archiving, setArchiving] = React.useState(false);

  async function confirmArchive() {
    if (!toArchive) return;
    setArchiving(true);
    try {
      await archiveProduct(toArchive.id);
      toast.success(`"${toArchive.name}" archived`);
      setToArchive(null);
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not archive");
    } finally {
      setArchiving(false);
    }
  }

  const rows = data?.items ?? [];

  return (
    <div>
      <PageHeader
        title="Products"
        description="Manage your catalogue — pricing, imagery, and publication."
        actions={
          can("catalog.add_product") && (
            <Button asChild>
              <Link href="/products/new">
                <Plus className="size-4" />
                Add product
              </Link>
            </Button>
          )
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <Input className="pl-9" placeholder="Search name or SKU…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <NativeSelect className="w-auto min-w-[130px]" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="all">All categories</option>
          {(cats.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </NativeSelect>
        <NativeSelect className="w-auto min-w-[120px]" value={metal} onChange={(e) => setMetal(e.target.value as ListProductsParams["metal_type"])}>
          <option value="all">All metals</option>
          {METAL_TYPES.map((m) => <option key={m} value={m}>{METAL_LABEL[m]}</option>)}
        </NativeSelect>
        <NativeSelect className="w-auto min-w-[120px]" value={status} onChange={(e) => setStatus(e.target.value as ListProductsParams["status"])}>
          <option value="all">All statuses</option>
          {PRODUCT_STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
        </NativeSelect>
        <NativeSelect className="w-auto min-w-[130px]" value={ordering} onChange={(e) => setOrdering(e.target.value)}>
          <option value="-created_at">Newest</option>
          <option value="created_at">Oldest</option>
          <option value="-price">Price: high → low</option>
          <option value="price">Price: low → high</option>
          <option value="name">Name A–Z</option>
        </NativeSelect>
      </div>

      <Card>
        {loading ? (
          <TableSkeleton rows={7} cols={6} />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : rows.length === 0 ? (
          <EmptyState title="No products found" description="Try clearing filters, or add your first product." />
        ) : (
          <Table>
            <THead>
              <tr>
                <Th className="w-[42%]">Product</Th>
                <Th>Category</Th>
                <Th>Metal</Th>
                <Th>Price</Th>
                <Th>Stock</Th>
                <Th>Status</Th>
                <Th className="w-10" />
              </tr>
            </THead>
            <TBody>
              {rows.map((p) => {
                const level = stockLevel(p.qty);
                return (
                  <Tr key={p.id} clickable onClick={() => router.push(`/products/${p.id}`)}>
                    <Td>
                      <div className="flex items-center gap-3">
                        <Thumb src={preferStableSrc(p.thumbnail_key, p.thumbnail_url)} alt={p.name} className="size-11 shrink-0" />
                        <div className="min-w-0">
                          <p className="flex items-center gap-1.5 truncate font-semibold text-ink">
                            {p.name}
                            {p.is_featured && <Star className="size-3.5 shrink-0 fill-amber-400 text-amber-400" />}
                          </p>
                          <p className="truncate text-xs text-faint">{p.sku}</p>
                        </div>
                      </div>
                    </Td>
                    <Td className="text-muted">{p.category_name ?? "—"}</Td>
                    <Td className="text-muted">{METAL_LABEL[p.metal_type]}</Td>
                    <Td>
                      <div className="flex items-baseline gap-1.5">
                        <span className="font-semibold">{formatPrice(p.effective_price)}</span>
                        {p.discount_percent > 0 && (
                          <span className="text-xs text-faint line-through">{formatPrice(p.price)}</span>
                        )}
                      </div>
                    </Td>
                    <Td><span className={cn("font-semibold", STOCK_TEXT[level])}>{p.qty}</span></Td>
                    <Td><ProductStatusBadge status={p.status} /></Td>
                    <Td onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon"><MoreHorizontal className="size-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem asChild>
                            <Link href={`/products/${p.id}`}><Pencil />Edit</Link>
                          </DropdownMenuItem>
                          {can("catalog.delete_product") && p.status !== "archived" && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem destructive onSelect={() => setToArchive(p)}>
                                <Archive />Archive
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>

      <Dialog open={!!toArchive} onOpenChange={(o) => !o && setToArchive(null)}>
        {toArchive && (
          <DialogContent
            title={`Archive "${toArchive.name}"?`}
            description="Archived products are hidden from the catalogue and storefront. Restore by editing its status."
          >
            <div className="mt-2 flex justify-end gap-2">
              <DialogClose asChild><Button variant="secondary" size="sm">Cancel</Button></DialogClose>
              <Button variant="danger" size="sm" loading={archiving} onClick={confirmArchive}>Archive</Button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
