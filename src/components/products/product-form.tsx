"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Trash2, Save, Boxes } from "lucide-react";
import {
  createProduct,
  listCategories,
  listCollections,
  updateProduct,
  type ProductWriteInput,
} from "@/lib/admin-api";
import { uploadProductImage } from "@/lib/media-upload";
import { effectivePrice } from "@/lib/derive";
import { productFormSchema } from "@/lib/schemas";
import {
  METAL_LABEL,
  METAL_TYPES,
  STOCK_TYPES,
  titleCase,
  type Category,
  type Collection,
  type MetalType,
  type ProductDetail,
  type ProductStatus,
  type StockType,
} from "@/lib/types";
import { useAsync } from "@/lib/use-async";
import { formatPrice } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, NativeSelect, Textarea, Label } from "@/components/ui/input";
import { ToggleField } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { ProductMediaManager } from "./product-media-manager";
import { PendingImagePicker, type PendingImage } from "./pending-image-picker";
import { ProductSizeStock } from "./product-size-stock";

interface Stone { type: string; weight: string; quality: string; count: string }
interface Cert { key: string; value: string }
/** One editable variation row (WooCommerce-style): a value + its own SKU/price/weight. */
interface Variant { size: string; sku: string; price: string; weight: string; active: boolean }

interface FormState {
  name: string;
  sku: string;
  metal_type: MetalType;
  category_id: string;
  collection_id: string;
  description: string;
  price: string;
  discount_percent: string;
  purity: string;
  stock_type: StockType;
  status: ProductStatus;
  gross_weight: string;
  net_weight: string;
  length_mm: string;
  width_mm: string;
  height_mm: string;
  variant_label: string;
  size_unit: string;
  variants: Variant[];
  care_instruction: string;
  is_featured: boolean;
  tags: string;
  stones: Stone[];
  certs: Cert[];
}

function toState(p?: ProductDetail): FormState {
  if (!p)
    return {
      name: "", sku: "", metal_type: "silver", category_id: "", collection_id: "",
      description: "", price: "", discount_percent: "0", purity: "925 Sterling",
      stock_type: "quantity", status: "draft", gross_weight: "", net_weight: "",
      length_mm: "", width_mm: "", height_mm: "",
      variant_label: "", size_unit: "", variants: [],
      care_instruction: "", is_featured: false,
      tags: "", stones: [], certs: [],
    };
  return {
    name: p.name,
    sku: p.sku,
    metal_type: p.metal_type,
    category_id: p.category?.id ?? "",
    collection_id: p.collection?.id ?? "",
    description: p.description,
    price: String(p.price),
    discount_percent: String(p.discount_percent),
    purity: p.purity,
    stock_type: p.stock_type,
    status: p.status,
    gross_weight: p.gross_weight != null ? String(p.gross_weight) : "",
    net_weight: p.net_weight != null ? String(p.net_weight) : "",
    length_mm: p.length_mm != null ? String(p.length_mm) : "",
    width_mm: p.width_mm != null ? String(p.width_mm) : "",
    height_mm: p.height_mm != null ? String(p.height_mm) : "",
    variant_label: p.variant_label,
    size_unit: p.size_unit,
    variants: p.size_stock.map((v) => ({
      size: v.size,
      sku: v.sku,
      price: v.price != null ? String(v.price) : "",
      weight: v.net_weight != null ? String(v.net_weight) : "",
      active: v.is_active,
    })),
    care_instruction: p.care_instruction,
    is_featured: p.is_featured,
    tags: p.tags.join(", "),
    stones: p.stone_details.map((s) => ({ type: s.type, weight: s.weight, quality: s.quality, count: String(s.count) })),
    certs: Object.entries(p.certificate_details).map(([key, value]) => ({ key, value })),
  };
}

type Errors = Partial<Record<string, string>>;

export function ProductForm({
  product,
  onSaved,
}: {
  product?: ProductDetail;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const isEdit = !!product;
  const [form, setForm] = React.useState<FormState>(() => toState(product));
  const [errors, setErrors] = React.useState<Errors>({});
  const [saving, setSaving] = React.useState(false);
  // Images chosen on the *new* page — held locally, uploaded after create.
  const [pending, setPending] = React.useState<PendingImage[]>([]);

  const cats = useAsync<Category[]>(() => listCategories(), []);
  const cols = useAsync<Collection[]>(() => listCollections(), []);

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  const priceNum = Number(form.price) || 0;
  const discNum = Number(form.discount_percent) || 0;
  const effective = effectivePrice(priceNum, discNum);

  function buildPayload(): ProductWriteInput {
    // Variations are the source of truth for which sizes exist. When there are
    // none, send available_sizes:"" so the product is treated as unsized.
    const variants = form.variants.filter((v) => v.size.trim());
    const variationPayload = variants.length
      ? {
          variations: variants.map((v) => ({
            size: v.size.trim(),
            sku: v.sku.trim(),
            price: v.price.trim() ? Number(v.price) : null,
            net_weight: v.weight.trim() ? Number(v.weight) : null,
            is_active: v.active,
          })),
        }
      : { available_sizes: "" };
    return {
      name: form.name,
      price: Number(form.price),
      metal_type: form.metal_type,
      sku: form.sku.trim() || undefined,
      description: form.description,
      category_id: form.category_id || null,
      collection_id: form.collection_id || null,
      discount_percent: Number(form.discount_percent) || 0,
      stock_type: form.stock_type,
      status: isEdit ? form.status : undefined,
      purity: form.purity,
      gross_weight: form.gross_weight ? Number(form.gross_weight) : null,
      net_weight: form.net_weight ? Number(form.net_weight) : null,
      length_mm: form.length_mm ? Number(form.length_mm) : null,
      width_mm: form.width_mm ? Number(form.width_mm) : null,
      height_mm: form.height_mm ? Number(form.height_mm) : null,
      stone_details: form.stones
        .filter((s) => s.type.trim())
        .map((s) => ({ type: s.type, weight: s.weight, quality: s.quality, count: Number(s.count) || 0 })),
      certificate_details: Object.fromEntries(
        form.certs.filter((c) => c.key.trim()).map((c) => [c.key.trim(), c.value]),
      ),
      variant_label: form.variant_label,
      size_unit: form.size_unit,
      ...variationPayload,
      care_instruction: form.care_instruction,
      is_featured: form.is_featured,
      tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = productFormSchema.safeParse(buildPayload());
    if (!parsed.success) {
      const fe = parsed.error.flatten().fieldErrors as Record<string, string[]>;
      const next: Errors = {};
      for (const [k, v] of Object.entries(fe)) if (v?.[0]) next[k] = v[0];
      setErrors(next);
      toast.error("Please fix the highlighted fields");
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      if (isEdit) {
        await updateProduct(product!.id, buildPayload());
        toast.success("Product updated");
        onSaved?.();
        router.push("/products");
      } else {
        const created = await createProduct(buildPayload());
        if (pending.length) {
          // Primary first so it wins the `is_primary` slot on the backend.
          const ordered = [...pending].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
          let failed = 0;
          for (const p of ordered) {
            try {
              await uploadProductImage({
                productId: created.id,
                blob: p.file,
                fileName: p.file.name,
                mime: p.file.type || "application/octet-stream",
                isPrimary: p.isPrimary,
              });
            } catch {
              failed++;
            }
          }
          if (failed) {
            toast.error(`Product created, but ${failed} image${failed > 1 ? "s" : ""} failed to upload — retry below`);
          } else {
            toast.success(`"${created.name}" created with ${pending.length} image${pending.length > 1 ? "s" : ""}`);
          }
        } else {
          toast.success(`"${created.name}" created as draft — add images and publish`);
        }
        router.push("/products");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save product");
    } finally {
      setSaving(false);
    }
  }

  // repeatable helpers
  const addStone = () => set("stones", [...form.stones, { type: "", weight: "", quality: "", count: "1" }]);
  const setStone = (i: number, k: keyof Stone, v: string) =>
    setForm((f) => { const s = f.stones.slice(); s[i] = { ...s[i], [k]: v }; return { ...f, stones: s }; });
  const rmStone = (i: number) => set("stones", form.stones.filter((_, x) => x !== i));

  const addCert = () => set("certs", [...form.certs, { key: "", value: "" }]);
  const setCert = (i: number, k: keyof Cert, v: string) =>
    setForm((f) => { const c = f.certs.slice(); c[i] = { ...c[i], [k]: v }; return { ...f, certs: c }; });
  const rmCert = (i: number) => set("certs", form.certs.filter((_, x) => x !== i));

  const addVariant = () => set("variants", [...form.variants, { size: "", sku: "", price: "", weight: "", active: true }]);
  const setVariant = (i: number, k: keyof Variant, v: string | boolean) =>
    setForm((f) => { const rows = f.variants.slice(); rows[i] = { ...rows[i], [k]: v }; return { ...f, variants: rows }; });
  const rmVariant = (i: number) => set("variants", form.variants.filter((_, x) => x !== i));
  const axisLabel = form.variant_label.trim() || "Size";

  return (
    <form
      onSubmit={handleSubmit}
      // Enter in a single-line field must not submit the whole form — too easy
      // to fire accidentally on a long product form. Submit is the button only.
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target instanceof HTMLElement && e.target.tagName === "INPUT") {
          e.preventDefault();
        }
      }}
      className="grid gap-6 lg:grid-cols-3"
    >
      <div className="space-y-6 lg:col-span-2">
        <Card>
          <CardHeader><CardTitle>Details</CardTitle></CardHeader>
          <CardBody className="space-y-4">
            <Field label="Name" htmlFor="name" required error={errors.name}>
              <Input id="name" value={form.name} invalid={!!errors.name} onChange={(e) => set("name", e.target.value)} placeholder="Celestial Stack Ring" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Metal type" htmlFor="metal" required>
                <NativeSelect id="metal" value={form.metal_type} onChange={(e) => set("metal_type", e.target.value as MetalType)}>
                  {METAL_TYPES.map((m) => <option key={m} value={m}>{METAL_LABEL[m]}</option>)}
                </NativeSelect>
              </Field>
              <Field label="Purity" htmlFor="purity">
                <Input id="purity" value={form.purity} onChange={(e) => set("purity", e.target.value)} placeholder="925 Sterling" />
              </Field>
              <Field label="Category" htmlFor="category">
                <NativeSelect id="category" value={form.category_id} onChange={(e) => set("category_id", e.target.value)}>
                  <option value="">— None —</option>
                  {(cats.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </NativeSelect>
              </Field>
              <Field label="Collection" htmlFor="collection">
                <NativeSelect id="collection" value={form.collection_id} onChange={(e) => set("collection_id", e.target.value)}>
                  <option value="">— None —</option>
                  {(cols.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </NativeSelect>
              </Field>
            </div>
            <Field label="Description" htmlFor="description">
              <Textarea id="description" value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="A short, evocative description…" />
            </Field>
            <Field label="SKU" htmlFor="sku" hint={isEdit ? undefined : "Auto-generated if left blank"}>
              <Input id="sku" value={form.sku} onChange={(e) => set("sku", e.target.value)} disabled={isEdit} placeholder="SOIS-SLV-0001" />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader><CardTitle>Pricing</CardTitle></CardHeader>
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Price (₹)" htmlFor="price" required error={errors.price}>
              <Input id="price" inputMode="numeric" value={form.price} invalid={!!errors.price} onChange={(e) => set("price", e.target.value)} placeholder="1499" />
            </Field>
            <Field label="Discount (%)" htmlFor="discount" error={errors.discount_percent} hint={`Effective: ${formatPrice(effective)}`}>
              <Input id="discount" inputMode="numeric" value={form.discount_percent} invalid={!!errors.discount_percent} onChange={(e) => set("discount_percent", e.target.value)} placeholder="0" />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader><CardTitle>Specifications</CardTitle></CardHeader>
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Gross weight (g)" htmlFor="gw"><Input id="gw" inputMode="decimal" value={form.gross_weight} onChange={(e) => set("gross_weight", e.target.value)} /></Field>
            <Field label="Net weight (g)" htmlFor="nw"><Input id="nw" inputMode="decimal" value={form.net_weight} onChange={(e) => set("net_weight", e.target.value)} /></Field>
            <div className="grid grid-cols-3 gap-4 sm:col-span-2">
              <Field label="Length (mm)" htmlFor="len"><Input id="len" inputMode="decimal" value={form.length_mm} onChange={(e) => set("length_mm", e.target.value)} placeholder="18" /></Field>
              <Field label="Width (mm)" htmlFor="wid"><Input id="wid" inputMode="decimal" value={form.width_mm} onChange={(e) => set("width_mm", e.target.value)} placeholder="6" /></Field>
              <Field label="Height (mm)" htmlFor="hgt"><Input id="hgt" inputMode="decimal" value={form.height_mm} onChange={(e) => set("height_mm", e.target.value)} placeholder="3" /></Field>
            </div>
            <Field label="Tags" htmlFor="tags" hint="Comma-separated" className="sm:col-span-2"><Input id="tags" value={form.tags} onChange={(e) => set("tags", e.target.value)} placeholder="new, bestseller" /></Field>
            <Field label="Care instructions" htmlFor="care" className="sm:col-span-2"><Textarea id="care" value={form.care_instruction} onChange={(e) => set("care_instruction", e.target.value)} /></Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Variations</CardTitle>
              <p className="mt-0.5 text-xs text-faint">
                For sized pieces — rings, chains (by length), bangles (by diameter).
                Each variation carries its own SKU, price and weight.
              </p>
            </div>
            <Button type="button" variant="secondary" size="sm" onClick={addVariant}><Plus className="size-4" />Add variation</Button>
          </CardHeader>
          <CardBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Variant name" htmlFor="variant_label" hint='Axis shown to buyers, e.g. "Ring Size", "Length"'>
                <Input id="variant_label" value={form.variant_label} onChange={(e) => set("variant_label", e.target.value)} placeholder="Ring Size" />
              </Field>
              <Field label="Unit" htmlFor="unit" hint='Optional, e.g. "US", "in", "cm"'>
                <Input id="unit" value={form.size_unit} onChange={(e) => set("size_unit", e.target.value)} placeholder="US" />
              </Field>
            </div>

            {form.variants.length === 0 ? (
              <p className="rounded-lg border border-dashed border-line-strong p-3 text-sm text-muted">
                No variations — this is a single-SKU product. Add one to sell it in
                multiple {axisLabel.toLowerCase()}s, each stocked independently.
              </p>
            ) : (
              <div className="space-y-2">
                <div className="hidden gap-2 px-1 text-xs font-semibold text-faint sm:grid sm:grid-cols-[90px_1fr_100px_90px_auto_auto]">
                  <span>{axisLabel}</span><span>SKU</span><span>Price ₹</span><span>Wt (g)</span><span>Active</span><span />
                </div>
                {form.variants.map((v, i) => (
                  <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-[90px_1fr_100px_90px_auto_auto] sm:items-center">
                    <Input value={v.size} onChange={(e) => setVariant(i, "size", e.target.value)} placeholder="6" aria-label={axisLabel} />
                    <Input value={v.sku} onChange={(e) => setVariant(i, "sku", e.target.value)} placeholder="Auto / SKU" aria-label="Variation SKU" />
                    <Input inputMode="decimal" value={v.price} onChange={(e) => setVariant(i, "price", e.target.value)} placeholder="Inherit" aria-label="Price" />
                    <Input inputMode="decimal" value={v.weight} onChange={(e) => setVariant(i, "weight", e.target.value)} placeholder="—" aria-label="Weight (g)" />
                    <label className="inline-flex items-center gap-1.5 text-sm text-muted">
                      <input type="checkbox" checked={v.active} onChange={(e) => setVariant(i, "active", e.target.checked)} className="size-4 accent-forest" />
                      <span className="sm:hidden">Active</span>
                    </label>
                    <Button type="button" variant="ghost" size="icon" onClick={() => rmVariant(i)}><Trash2 className="size-4 text-faint" /></Button>
                  </div>
                ))}
                <p className="text-xs text-faint">
                  Blank price inherits the product price. Stock per variation is
                  received/adjusted below — it never changes here.
                </p>
              </div>
            )}
          </CardBody>
        </Card>

        {isEdit && product!.has_sizes && (
          <ProductSizeStock product={product!} onChanged={() => onSaved?.()} />
        )}

        <Card>
          <CardHeader>
            <CardTitle>Stones</CardTitle>
            <Button type="button" variant="secondary" size="sm" onClick={addStone}><Plus className="size-4" />Add stone</Button>
          </CardHeader>
          <CardBody className="space-y-3">
            {form.stones.length === 0 && <p className="text-sm text-faint">No stones on this piece.</p>}
            {form.stones.map((s, i) => (
              <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_1fr_auto_auto]">
                <Input value={s.type} onChange={(e) => setStone(i, "type", e.target.value)} placeholder="Type (CZ)" />
                <Input value={s.weight} onChange={(e) => setStone(i, "weight", e.target.value)} placeholder="Weight" />
                <Input value={s.quality} onChange={(e) => setStone(i, "quality", e.target.value)} placeholder="Quality" />
                <Input className="w-16" inputMode="numeric" value={s.count} onChange={(e) => setStone(i, "count", e.target.value)} placeholder="Qty" />
                <Button type="button" variant="ghost" size="icon" onClick={() => rmStone(i)}><Trash2 className="size-4 text-faint" /></Button>
              </div>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Certificate details</CardTitle>
            <Button type="button" variant="secondary" size="sm" onClick={addCert}><Plus className="size-4" />Add row</Button>
          </CardHeader>
          <CardBody className="space-y-3">
            {form.certs.length === 0 && <p className="text-sm text-faint">No certificate details.</p>}
            {form.certs.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input value={c.key} onChange={(e) => setCert(i, "key", e.target.value)} placeholder="Label (BIS)" className="flex-1" />
                <Input value={c.value} onChange={(e) => setCert(i, "value", e.target.value)} placeholder="Value (Hallmarked)" className="flex-1" />
                <Button type="button" variant="ghost" size="icon" onClick={() => rmCert(i)}><Trash2 className="size-4 text-faint" /></Button>
              </div>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader><CardTitle>Images</CardTitle></CardHeader>
          <CardBody>
            {isEdit ? (
              <ProductMediaManager productId={product!.id} media={product!.media} onChanged={() => onSaved?.()} />
            ) : (
              <PendingImagePicker value={pending} onChange={setPending} disabled={saving} />
            )}
          </CardBody>
        </Card>
      </div>

      {/* Sidebar */}
      <div className="space-y-6">
        <Card>
          <CardHeader><CardTitle>Preview</CardTitle></CardHeader>
          <CardBody className="space-y-3 text-sm">
            <Row label="SKU"><code className="rounded bg-surface px-1.5 py-0.5 text-xs font-semibold">{form.sku || (isEdit ? "—" : "Auto")}</code></Row>
            <Row label="Effective price"><span className="font-semibold">{formatPrice(effective)}</span></Row>
            {discNum > 0 && <Row label="List price"><span className="text-faint line-through">{formatPrice(priceNum)}</span></Row>}
            <Row label="Featured"><span className={form.is_featured ? "font-semibold text-forest" : "text-faint"}>{form.is_featured ? "Yes" : "No"}</span></Row>
          </CardBody>
        </Card>

        <Card>
          <CardHeader><CardTitle>Availability</CardTitle></CardHeader>
          <CardBody className="space-y-4">
            {isEdit ? (
              <>
                <Field label="Status" htmlFor="status">
                  <NativeSelect id="status" value={form.status} onChange={(e) => set("status", e.target.value as ProductStatus)}>
                    {(["draft", "active", "out_of_stock", "archived"] as ProductStatus[]).map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
                  </NativeSelect>
                </Field>
                <div className="rounded-lg border border-line bg-surface p-3 text-sm">
                  <p className="font-semibold text-ink">Stock: {product!.qty}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    Quantity is managed through the stock ledger, not here.
                  </p>
                  <Link href="/stock" className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-forest hover:underline">
                    <Boxes className="size-3.5" />Adjust stock
                  </Link>
                </div>
              </>
            ) : (
              <p className="rounded-lg border border-dashed border-line-strong p-3 text-sm text-muted">
                New products are created as a <strong>draft</strong> with zero stock.
                Add images below — they upload automatically on save. Publish and
                receive stock via a purchase order next.
              </p>
            )}
            <Field label="Stock type" htmlFor="stocktype">
              <NativeSelect id="stocktype" value={form.stock_type} onChange={(e) => set("stock_type", e.target.value as StockType)}>
                {STOCK_TYPES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
              </NativeSelect>
            </Field>
            <ToggleField label="Featured product" checked={form.is_featured} onCheckedChange={(v) => set("is_featured", v)} />
          </CardBody>
        </Card>

        <div className="flex flex-col gap-2">
          <Button type="submit" loading={saving}>
            <Save className="size-4" />{isEdit ? "Save changes" : "Create product"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.push("/products")}>Cancel</Button>
        </div>
      </div>
    </form>
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
