/**
 * Pure helpers replicating backend-side derivations (admin-api.yaml). These live
 * in the mock layer today; the backend applies the same rules server-side.
 */
import {
  ORDER_FLOW,
  type MetalType,
  type Order,
  type OrderStatus,
  type ProductDetail,
  type ProductList,
  type PurchaseOrder,
  type PurchaseOrderItem,
  type PurchaseOrderStatus,
} from "./types";

/** Stable-ish unique id (browser + Node 22 both expose crypto.randomUUID). */
export function newId(): string {
  return crypto.randomUUID();
}

/** lowercase, non-alphanumerics → "-", trimmed. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** effective_price = price × (1 − discount_percent/100), rounded to rupees. */
export function effectivePrice(price: number, discountPercent: number): number {
  const pct = Math.max(0, Math.min(100, discountPercent || 0));
  return Math.round(price * (1 - pct / 100));
}

/** is_in_stock derives from qty > 0. */
export function isInStock(qty: number): boolean {
  return qty > 0;
}

const METAL_CODE: Record<MetalType, string> = {
  silver: "SLV",
  gold: "GLD",
  gold_plated: "GPL",
  rose_gold: "RGD",
  antique: "ANT",
  other: "OTH",
};

const SKU_BRAND = "SOIS";
/** Category segment when a product has no category assigned. */
const CATEGORY_FALLBACK = "GEN";

/**
 * 3-letter category segment for a SKU, derived from the category name.
 * Deterministic so the same category always maps to the same code:
 * multi-word names use word initials (e.g. "Rose Gold" → "RGO"), single
 * words use their first three letters ("Rings" → "RIN"). Falls back to GEN.
 */
export function categoryCode(categoryName: string | null | undefined): string {
  const cleaned = (categoryName ?? "").replace(/[^a-zA-Z ]+/g, " ").trim();
  if (!cleaned) return CATEGORY_FALLBACK;
  const words = cleaned.split(/\s+/);
  const raw =
    words.length > 1
      ? words.map((w) => w[0]).join("")
      : words[0];
  return raw.slice(0, 3).toUpperCase().padEnd(3, "X");
}

/** Digits pulled from a purity string: "925 Sterling" → "925", "22K" → "22". */
export function purityCode(purity: string | null | undefined): string {
  return (purity ?? "").replace(/[^0-9]/g, "").slice(0, 3);
}

/**
 * Short, readable code for a product name — the self-describing tail of the SKU.
 * Multi-word names use word initials (e.g. "Celestial Stack Ring" → "CSR",
 * capped at 4); single words use their first three letters ("Solitaire" →
 * "SOL"). Falls back to ITM for an empty name.
 */
export function nameCode(name: string | null | undefined): string {
  const cleaned = (name ?? "").replace(/[^a-zA-Z ]+/g, " ").trim();
  if (!cleaned) return "ITM";
  const words = cleaned.split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase().padEnd(3, "X");
  return words.map((w) => w[0]).join("").slice(0, 4).toUpperCase();
}

/**
 * Self-describing SKU stem: `SOIS-<category>-<metal><purity>`
 * (e.g. `SOIS-RNG-SLV925`). The product-name code is appended to form the full
 * SKU. Purity is omitted from the metal segment when the string has no digits.
 */
export function skuStem(
  metalType: MetalType,
  categoryName?: string | null,
  purity?: string | null,
): string {
  return `${SKU_BRAND}-${categoryCode(categoryName)}-${METAL_CODE[metalType]}${purityCode(purity)}`;
}

/**
 * Self-describing auto SKU: `SOIS-<category>-<metal><purity>-<name>`
 * (e.g. `SOIS-RNG-SLV925-CSR`) — no running sequence, so the code reads as the
 * product itself. When two pieces resolve to the same code a `-2`, `-3`… is
 * appended to keep it unique within the store.
 */
export function nextSku(
  metalType: MetalType,
  existingSkus: string[],
  categoryName?: string | null,
  purity?: string | null,
  name?: string | null,
): string {
  const base = `${skuStem(metalType, categoryName, purity)}-${nameCode(name)}`;
  const taken = new Set(existingSkus);
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/**
 * SKU-safe code for a variation value: uppercased, with any run of
 * non-alphanumerics collapsed to a single "-" (so "6.5" → "6-5", "US 7" →
 * "US-7"). Keeps distinct sizes distinct inside the SKU.
 */
export function sizeCode(size: string): string {
  return size
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Auto variation SKU derived from its parent: `<parentSku>-<sizeCode>`
 * (e.g. `SOIS-RNG-SLV925-CSR-7`). Returns the bare parent SKU when the size has
 * no usable characters so we never emit a dangling trailing dash.
 */
export function variationSku(parentSku: string, size: string): string {
  const code = sizeCode(size);
  return code ? `${parentSku}-${code}` : parentSku;
}

/** PO-YYYY-000N based on how many POs already exist. */
export function nextPoNumber(existingCount: number): string {
  const year = new Date().getFullYear();
  return `PO-${year}-${String(existingCount + 1).padStart(4, "0")}`;
}

/** SOIS-YYYY-000N order number. */
export function nextOrderNumber(existingCount: number): string {
  const year = new Date().getFullYear();
  return `SOIS-${year}-${String(existingCount + 1).padStart(4, "0")}`;
}

/* -------------------------------------------------------------------------- */
/* Order progress (UI-derived timeline; the API returns status, not a list)   */
/* -------------------------------------------------------------------------- */

export interface OrderStep {
  status: OrderStatus;
  label: string;
  done: boolean;
  current: boolean;
}

const FLOW_LABEL: Record<OrderStatus, string> = {
  pending: "Placed",
  paid: "Paid",
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  returned: "Returned",
  refunded: "Refunded",
};

/**
 * Build a display timeline from an order's current status. Cancelled/returned/
 * refunded are terminal branches shown as a single trailing step.
 */
export function orderSteps(status: OrderStatus): OrderStep[] {
  if (status === "cancelled" || status === "returned" || status === "refunded") {
    const base = ORDER_FLOW.map((s) => ({
      status: s,
      label: FLOW_LABEL[s],
      done: status === "refunded" || status === "returned", // reached delivery first
      current: false,
    }));
    // For cancelled we don't know how far it went; show only up to processing done.
    if (status === "cancelled") {
      base.forEach((step, i) => (step.done = i <= 1));
    }
    return [
      ...base,
      { status, label: FLOW_LABEL[status], done: true, current: true },
    ];
  }

  const idx = ORDER_FLOW.indexOf(status);
  return ORDER_FLOW.map((s, i) => ({
    status: s,
    label: FLOW_LABEL[s],
    done: i <= idx,
    current: i === idx,
  }));
}

/* -------------------------------------------------------------------------- */
/* Purchase order recompute (after create / receipt)                          */
/* -------------------------------------------------------------------------- */

export function recomputePoItem(item: PurchaseOrderItem): PurchaseOrderItem {
  const qty_pending = Math.max(0, item.qty_ordered - item.qty_received);
  return {
    ...item,
    qty_pending,
    total_cost: item.qty_ordered * item.unit_cost,
    is_fully_received: qty_pending === 0,
  };
}

/** Recompute item rollups, totals, and status after a receipt (admin-api.yaml). */
export function recomputePurchaseOrder(po: PurchaseOrder): PurchaseOrder {
  const items = po.items.map(recomputePoItem);
  const subtotal = items.reduce((s, it) => s + it.total_cost, 0);
  const total_amount = subtotal + (po.tax_amount || 0) + (po.shipping_cost || 0);

  let status: PurchaseOrderStatus = po.status;
  if (po.status === "ordered" || po.status === "partial") {
    const anyReceived = items.some((it) => it.qty_received > 0);
    const allReceived = items.every((it) => it.is_fully_received);
    status = allReceived ? "received" : anyReceived ? "partial" : "ordered";
  }

  return { ...po, items, subtotal, total_amount, status };
}

/* -------------------------------------------------------------------------- */
/* Media key → displayable src (mock stores data-URIs / URLs directly)        */
/* -------------------------------------------------------------------------- */

/** In the mock, S3 keys ARE the displayable value. Backend swaps for a CDN URL. */
export function mediaUrl(key: string | null | undefined): string | undefined {
  return key || undefined;
}

export function primaryImageKey(
  p: Pick<ProductList, "thumbnail_key" | "primary_image">,
): string | undefined {
  return p.primary_image?.s3_key || p.thumbnail_key || undefined;
}

export function detailPrimaryKey(p: ProductDetail): string | undefined {
  const primary = p.media.find((m) => m.is_primary && m.media_type === "image");
  return primary?.s3_key || p.thumbnail_key || p.media[0]?.s3_key || undefined;
}

/** low / out / healthy classification for a stock quantity + threshold. */
export type StockLevel = "out" | "low" | "healthy";
export function stockLevel(qty: number, threshold = 5): StockLevel {
  if (qty <= 0) return "out";
  if (qty <= threshold) return "low";
  return "healthy";
}

/** Order convenience: customer display name from shipping address. */
export function orderCustomerName(o: Order): string {
  return o.customer_name || o.shipping_address?.full_name || o.customer_email;
}
