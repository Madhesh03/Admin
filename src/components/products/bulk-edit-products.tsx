"use client";

import * as React from "react";
import { bulkUpdateProducts } from "@/lib/admin-api";
import type { BulkProductChanges, BulkPriceOp } from "@/lib/admin-api";
import {
  METAL_LABEL,
  METAL_TYPES,
  PRODUCT_STATUSES,
  titleCase,
  type Category,
  type Collection,
  type MetalType,
  type ProductStatus,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Field, FieldError, Input, NativeSelect } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";

/** Sentinel for a "leave as-is" select — never sent to the API. */
const KEEP = "__keep__";
/** Sentinel for clearing a link (category/collection → null). */
const CLEAR = "__clear__";

type PriceMode = "none" | "set" | "increase" | "decrease";

/**
 * WooCommerce-style bulk editor for the common product fields — regular price
 * (set / increase / decrease by ₹ or %), discount, status, category,
 * collection, metal and featured. Only the fields the user touches are sent, so
 * one submit patches every selected product through `bulkUpdateProducts`.
 */
export function BulkEditProductsDialog({
  open,
  onOpenChange,
  productIds,
  categories,
  collections,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productIds: string[];
  categories: Category[];
  collections: Collection[];
  onDone: () => void;
}) {
  const [priceMode, setPriceMode] = React.useState<PriceMode>("none");
  const [priceUnit, setPriceUnit] = React.useState<BulkPriceOp["unit"]>("amount");
  const [priceValue, setPriceValue] = React.useState("");
  const [discount, setDiscount] = React.useState("");
  const [status, setStatus] = React.useState<string>(KEEP);
  const [categoryId, setCategoryId] = React.useState<string>(KEEP);
  const [collectionId, setCollectionId] = React.useState<string>(KEEP);
  const [metal, setMetal] = React.useState<string>(KEEP);
  const [featured, setFeatured] = React.useState<string>(KEEP);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  // Re-seed to a clean slate every time the dialog opens.
  React.useEffect(() => {
    if (!open) return;
    setPriceMode("none");
    setPriceUnit("amount");
    setPriceValue("");
    setDiscount("");
    setStatus(KEEP);
    setCategoryId(KEEP);
    setCollectionId(KEEP);
    setMetal(KEEP);
    setFeatured(KEEP);
    setError(null);
  }, [open]);

  const count = productIds.length;

  /** Collect the touched fields into a changes payload; null ⇒ nothing to do. */
  function buildChanges(): BulkProductChanges | null {
    const changes: BulkProductChanges = {};

    if (priceMode !== "none") {
      const value = Number(priceValue);
      if (!priceValue.trim() || Number.isNaN(value) || value < 0) {
        setError("Enter a valid price amount.");
        return null;
      }
      changes.price = { mode: priceMode, value, unit: priceUnit };
    }
    if (discount.trim()) {
      const value = Number(discount);
      if (Number.isNaN(value) || value < 0 || value > 100) {
        setError("Discount must be between 0 and 100.");
        return null;
      }
      changes.discount_percent = value;
    }
    if (status !== KEEP) changes.status = status as ProductStatus;
    if (categoryId !== KEEP) changes.category_id = categoryId === CLEAR ? null : categoryId;
    if (collectionId !== KEEP) changes.collection_id = collectionId === CLEAR ? null : collectionId;
    if (metal !== KEEP) changes.metal_type = metal as MetalType;
    if (featured !== KEEP) changes.is_featured = featured === "yes";

    if (Object.keys(changes).length === 0) {
      setError("Choose at least one field to change.");
      return null;
    }
    return changes;
  }

  async function apply() {
    setError(null);
    const changes = buildChanges();
    if (!changes) return;
    setSaving(true);
    try {
      const { updated } = await bulkUpdateProducts({ ids: productIds, changes });
      toast.success(`Updated ${updated} product${updated === 1 ? "" : "s"}`);
      onOpenChange(false);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bulk update failed");
    } finally {
      setSaving(false);
    }
  }

  const showUnit = priceMode === "increase" || priceMode === "decrease";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <DialogContent
          title={`Bulk edit ${count} product${count === 1 ? "" : "s"}`}
          description="Only the fields you change are applied. Everything left on “No change” is untouched."
        >
          <div className="space-y-4">
            {/* Regular price */}
            <Field label="Regular price">
              <div className="flex gap-2">
                <NativeSelect
                  className="w-auto min-w-[130px]"
                  value={priceMode}
                  onChange={(e) => setPriceMode(e.target.value as PriceMode)}
                >
                  <option value="none">No change</option>
                  <option value="set">Set to</option>
                  <option value="increase">Increase by</option>
                  <option value="decrease">Decrease by</option>
                </NativeSelect>
                {priceMode !== "none" && (
                  <>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      inputMode="decimal"
                      placeholder={priceUnit === "percent" && showUnit ? "0" : "0.00"}
                      value={priceValue}
                      onChange={(e) => setPriceValue(e.target.value)}
                    />
                    {showUnit ? (
                      <NativeSelect
                        className="w-auto min-w-[80px]"
                        value={priceUnit}
                        onChange={(e) => setPriceUnit(e.target.value as BulkPriceOp["unit"])}
                      >
                        <option value="amount">₹</option>
                        <option value="percent">%</option>
                      </NativeSelect>
                    ) : (
                      <span className="flex h-10 items-center px-1 text-sm text-faint">₹</span>
                    )}
                  </>
                )}
              </div>
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Discount %" hint="Leave blank to keep each product’s discount.">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step="1"
                  inputMode="numeric"
                  placeholder="No change"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                />
              </Field>

              <Field label="Status">
                <NativeSelect value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value={KEEP}>No change</option>
                  {PRODUCT_STATUSES.map((s) => (
                    <option key={s} value={s}>{titleCase(s)}</option>
                  ))}
                </NativeSelect>
              </Field>

              <Field label="Category">
                <NativeSelect value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                  <option value={KEEP}>No change</option>
                  <option value={CLEAR}>— Clear —</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </NativeSelect>
              </Field>

              <Field label="Collection">
                <NativeSelect value={collectionId} onChange={(e) => setCollectionId(e.target.value)}>
                  <option value={KEEP}>No change</option>
                  <option value={CLEAR}>— Clear —</option>
                  {collections.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </NativeSelect>
              </Field>

              <Field label="Metal">
                <NativeSelect value={metal} onChange={(e) => setMetal(e.target.value)}>
                  <option value={KEEP}>No change</option>
                  {METAL_TYPES.map((m) => (
                    <option key={m} value={m}>{METAL_LABEL[m]}</option>
                  ))}
                </NativeSelect>
              </Field>

              <Field label="Featured">
                <NativeSelect value={featured} onChange={(e) => setFeatured(e.target.value)}>
                  <option value={KEEP}>No change</option>
                  <option value="yes">Featured</option>
                  <option value="no">Not featured</option>
                </NativeSelect>
              </Field>
            </div>

            <FieldError>{error}</FieldError>

            <div className="flex justify-end gap-2 pt-1">
              <DialogClose asChild>
                <Button variant="secondary" size="sm">Cancel</Button>
              </DialogClose>
              <Button size="sm" loading={saving} onClick={apply}>
                Apply to {count}
              </Button>
            </div>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
