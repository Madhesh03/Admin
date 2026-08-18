"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Trash2, Save, Boxes } from "lucide-react";
import {
  checkProductName,
  createProduct,
  deleteMedia,
  listCategories,
  listCollections,
  updateProduct,
  type ProductWriteInput,
} from "@/lib/admin-api";
import { ApiError } from "@/lib/http";
import { uploadProductImage } from "@/lib/media-upload";
import { effectivePrice, nameCode, skuStem, variationSku } from "@/lib/derive";
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
  // Images chosen locally — held and uploaded on save (create or update).
  const [pending, setPending] = React.useState<PendingImage[]>([]);
  // Existing media (edit mode) marked for deletion — removed on save.
  const [removedMedia, setRemovedMedia] = React.useState<Set<string>>(new Set());

  const cats = useAsync<Category[]>(() => listCategories(), []);
  const cols = useAsync<Collection[]>(() => listCollections(), []);
  // Live name-uniqueness: checked against the server as the user types (debounced)
  // so duplicates surface immediately — before filling the form or uploading images.
  const [checkingName, setCheckingName] = React.useState(false);
  // Monotonic id so a slow in-flight check can't overwrite a newer one (and so a
  // re-render can't leave `checkingName` stuck true, which would hide the error).
  const nameCheckSeq = React.useRef(0);
  const productId = product?.id;
  const originalName = (product?.name ?? "").trim().toLowerCase();

  React.useEffect(() => {
    const name = form.name.trim();
    // Empty, or the product's own unchanged name on edit → always fine.
    if (!name || name.toLowerCase() === originalName) {
      nameCheckSeq.current++; // invalidate any in-flight check
      setCheckingName(false);
      setErrors((prev) => (prev.name ? { ...prev, name: undefined } : prev));
      return;
    }
    const seq = ++nameCheckSeq.current;
    setCheckingName(true);
    setErrors((prev) => (prev.name ? { ...prev, name: undefined } : prev));
    const handle = setTimeout(async () => {
      try {
        const res = await checkProductName(name, productId);
        if (seq !== nameCheckSeq.current) return; // a newer check superseded this
        setErrors((prev) => ({
          ...prev,
          name: res.available ? undefined : "A product with this name already exists",
        }));
      } catch {
        // Network/permission hiccup — don't block typing; save still validates.
      } finally {
        if (seq === nameCheckSeq.current) setCheckingName(false);
      }
    }, 400);
    return () => clearTimeout(handle);
  }, [form.name, originalName, productId]);

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
            // SKU is always system-derived from the product SKU + size.
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
      // SKU is always system-generated; never sent from the form.
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

  // Upload the locally-held images against a product id. Primary first so it
  // wins the `is_primary` slot on the backend. Returns how many failed.
  async function uploadPending(productId: string): Promise<number> {
    const ordered = [...pending].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
    let failed = 0;
    for (const p of ordered) {
      try {
        await uploadProductImage({
          productId,
          blob: p.file,
          fileName: p.file.name,
          mime: p.file.type || "application/octet-stream",
          isPrimary: p.isPrimary,
        });
      } catch {
        failed++;
      }
    }
    return failed;
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
    // Product names must be unique across the store. The live check runs as the
    // user types; block save while it's pending or if it already flagged a clash
    // (the API enforces it too, as a backstop).
    if (checkingName) {
      toast.error("Still checking the product name — try again in a moment");
      return;
    }
    if (errors.name) {
      toast.error("Please fix the highlighted fields");
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      if (isEdit) {
        await updateProduct(product!.id, buildPayload());
        // Image changes are held locally and applied now, on save: delete the
        // images marked for removal, then upload the newly-picked ones.
        let failed = 0;
        for (const id of removedMedia) {
          try {
            await deleteMedia(id);
          } catch {
            failed++;
          }
        }
        failed += pending.length ? await uploadPending(product!.id) : 0;
        setRemovedMedia(new Set());
        setPending([]);
        if (failed) {
          toast.error(`Product updated, but ${failed} image change${failed > 1 ? "s" : ""} failed`);
        } else {
          toast.success("Product updated");
        }
        onSaved?.();
        router.push("/products");
      } else {
        const created = await createProduct(buildPayload());
        if (pending.length) {
          const failed = await uploadPending(created.id);
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
      // Surface a server-side duplicate-name error inline on the field.
      const fieldErrors = (err instanceof ApiError ? err.details : undefined) as
        | Record<string, string[]>
        | undefined;
      if (fieldErrors?.name?.[0]) {
        setErrors({ name: fieldErrors.name[0] });
      }
      toast.error(err instanceof Error ? err.message : "Could not save product");
    } finally {
      setSaving(false);
    }
  }

  // repeatable helpers
  const addVariant = () => set("variants", [...form.variants, { size: "", sku: "", price: "", weight: "", active: true }]);
  const setVariant = (i: number, k: keyof Variant, v: string | boolean) =>
    setForm((f) => { const rows = f.variants.slice(); rows[i] = { ...rows[i], [k]: v }; return { ...f, variants: rows }; });
  const rmVariant = (i: number) => set("variants", form.variants.filter((_, x) => x !== i));
  const axisLabel = form.variant_label.trim() || "Size";

  // Live SKU previews (read-only). The self-describing product SKU is generated
  // on save: SOIS-<category>-<metal><purity>-<name>. Each variation's SKU is
  // that code + size. Shown so staff see exactly what will be stored.
  const catName = (cats.data ?? []).find((c) => c.id === form.category_id)?.name;
  const productSkuPreview = isEdit
    ? form.sku
    : `${skuStem(form.metal_type, catName, form.purity)}-${nameCode(form.name)}`;
  const variationSkuPreview = (size: string) =>
    size.trim() ? variationSku(productSkuPreview, size) : "Auto";

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
            <Field
              label="Name"
              htmlFor="name"
              required
              error={errors.name}
              hint={checkingName ? "Checking availability…" : undefined}
            >
              <Input
                id="name"
                value={form.name}
                invalid={!!errors.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Celestial Stack Ring"
              />
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
            <Field label="SKU" htmlFor="sku" hint={isEdit ? "System-generated — not editable" : "Generated automatically on save — not editable"}>
              <Input id="sku" value={isEdit ? form.sku : ""} readOnly disabled placeholder={productSkuPreview} />
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
                    <Input value={v.sku.trim() || (v.size.trim() ? variationSkuPreview(v.size) : "")} readOnly disabled placeholder="Auto" aria-label="Variation SKU" title="System-generated from the product SKU + size" />
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
                  SKU is system-generated from the product SKU and size (e.g.{" "}
                  <code>{variationSkuPreview(form.variants.find((v) => v.size.trim())?.size ?? "6")}</code>)
                  and isn&apos;t editable. Blank price inherits the product price.
                  Stock per variation is received/adjusted below — it never changes here.
                </p>
              </div>
            )}
          </CardBody>
        </Card>

        {isEdit && product!.has_sizes && (
          <ProductSizeStock product={product!} onChanged={() => onSaved?.()} />
        )}

        <Card>
          <CardHeader><CardTitle>Images</CardTitle></CardHeader>
          <CardBody className="space-y-4">
            {isEdit && product!.media.length > 0 && (
              <ProductMediaManager
                productId={product!.id}
                media={product!.media}
                onChanged={() => onSaved?.()}
                hideAdd
                removedIds={removedMedia}
                onToggleRemove={(id) =>
                  setRemovedMedia((prev) => {
                    const next = new Set(prev);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    return next;
                  })
                }
              />
            )}
            <PendingImagePicker value={pending} onChange={setPending} disabled={saving} />
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
