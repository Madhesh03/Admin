/**
 * ============================================================================
 *  admin-api.ts — THE SEAM
 * ============================================================================
 * The ONLY module that touches the mock store. Every screen calls these async
 * functions; each mirrors an endpoint in admin-api.yaml 1:1, so wiring the real
 * backend is a body-only change: flip USE_MOCKS and replace each body (marked
 * `// TODO(backend)`) with the matching fetch(...), unwrapping { success, data }.
 *
 * RBAC: mutating/reading endpoints call requirePermission(<codename>) matching
 * the operation's x-required-permission. The `owner` role bypasses (superuser).
 * Tenancy: every call is scoped to the session tenant; the real fetch layer
 * would send it as the `X-Tenant-ID` header.
 */
import { ADMIN_PASSWORD, DEFAULT_TENANT_ID } from "./auth-config";
import { ApiError } from "./http";
import {
  detailPrimaryKey,
  effectivePrice,
  isInStock,
  newId,
  nextOrderNumber,
  nextPoNumber,
  nextSku,
  primaryImageKey,
  recomputePurchaseOrder,
  slugify,
  stockLevel,
  variationSku,
} from "./derive";
import type { StoredProduct, StoredVariation } from "./internal";
import {
  get,
  getStoredSession,
  resetDemoData,
  set,
  setStoredSession,
  type StoredSession,
} from "./mock-data";
import type {
  Address,
  Category,
  Collection,
  Courier,
  Customer,
  DashboardStats,
  MediaType,
  MetalType,
  Order,
  OrderStatus,
  PageMeta,
  ProductDetail,
  ProductList,
  ProductMedia,
  ProductSizeStock,
  ProductStatus,
  PurchaseOrder,
  PurchaseOrderItem,
  Refund,
  Return,
  Review,
  Shipment,
  ShipmentEvent,
  StaffUser,
  StockLedgerEntry,
  StockType,
  StockValuationRow,
  StoneDetail,
  Supplier,
} from "./types";
import { ORDER_TRANSITIONS } from "./types";

/* -------------------------------------------------------------------------- */
/* Simulated network                                                          */
/* -------------------------------------------------------------------------- */

const ERROR_FLAG_KEY = "sois_admin_simulate_errors";
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = () => 200 + Math.round(Math.random() * 200);

function errorsEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(ERROR_FLAG_KEY) === "1";
}
export function setErrorSimulation(on: boolean): void {
  if (typeof window === "undefined") return;
  if (on) window.localStorage.setItem(ERROR_FLAG_KEY, "1");
  else window.localStorage.removeItem(ERROR_FLAG_KEY);
}
export function isErrorSimulationOn(): boolean {
  return errorsEnabled();
}

async function tick(canFail = false): Promise<void> {
  await delay(jitter());
  if (canFail && errorsEnabled() && Math.random() < 0.35) {
    throw new ApiError("Simulated network error — please try again.", 500);
  }
}

const clone = <T>(v: T): T => structuredClone(v);

/* -------------------------------------------------------------------------- */
/* Auth / RBAC helpers                                                        */
/* -------------------------------------------------------------------------- */

function session(): StoredSession {
  const s = getStoredSession();
  if (!s) throw new ApiError("Not authenticated", 401);
  return s;
}

/** Codenames granted to the current staff user (owner ⇒ everything). */
export function sessionPermissions(): Set<string> {
  const s = getStoredSession();
  if (!s) return new Set();
  return new Set(s.staff.role.permissions.map((p) => p.codename));
}

function isOwner(): boolean {
  const s = getStoredSession();
  return s?.staff.role.name === "owner";
}

function requirePermission(codename: string): void {
  if (isOwner()) return; // superuser bypass
  const perms = sessionPermissions();
  if (!perms.has(codename)) {
    throw new ApiError(
      `Your role doesn't grant "${codename}"`,
      403,
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Pagination                                                                 */
/* -------------------------------------------------------------------------- */

export interface Page<T> {
  items: T[];
  meta: PageMeta;
}

function paginate<T>(list: T[], page = 1, pageSize = 20): Page<T> {
  const start = (page - 1) * pageSize;
  return {
    items: list.slice(start, start + pageSize),
    meta: { total: list.length, page, page_size: pageSize },
  };
}

/* -------------------------------------------------------------------------- */
/* Product composition (join FK ids → API shapes)                             */
/* -------------------------------------------------------------------------- */

function catById(id: string | null): Category | null {
  if (!id) return null;
  return get("categories").find((c) => c.id === id) ?? null;
}
function colById(id: string | null): Collection | null {
  if (!id) return null;
  return get("collections").find((c) => c.id === id) ?? null;
}

/** Parse "6,7,8" into distinct trimmed sizes; blank/"Adjustable" → []. */
function parseSizes(raw: string): string[] {
  if (!raw || raw.trim() === "" || raw === "Adjustable") return [];
  const seen: string[] = [];
  for (const part of raw.split(",")) {
    const s = part.trim();
    if (s && !seen.includes(s)) seen.push(s);
  }
  return seen;
}

/** One variation's metadata as written under a product's `variations`. */
interface VariationInput {
  size: string;
  sku?: string;
  price?: number | null;
  net_weight?: number | null;
  is_active?: boolean;
}

/** A blank variation row for a freshly-declared size (stock starts at 0). */
function blankVariation(size: string): StoredVariation {
  return { size, qty: 0, sku: "", price: null, net_weight: null, is_active: true };
}

/**
 * Reconcile the stored variation rows to a size list, applying per-variation
 * metadata (sku/price/weight/active) from `variations` when present. Existing
 * `qty` and untouched metadata are preserved; new sizes default to a blank row;
 * rows for removed sizes are dropped. Mirrors the backend `_reconcile_variations`.
 *
 * The variation SKU is always system-derived from the parent SKU and its size
 * (e.g. `SOIS-RNG-SLV-0001-7`) so every variation is trackable — it is never
 * taken from the payload.
 */
function reconcileSizeStocks(
  raw: string,
  existing: StoredVariation[],
  variations: VariationInput[] | undefined,
  parentSku: string,
): StoredVariation[] {
  const bySize = new Map(existing.map((r) => [r.size, r]));
  const meta = new Map((variations ?? []).map((v) => [v.size.trim(), v]));
  return parseSizes(raw).map((size) => {
    const row = bySize.get(size) ?? blankVariation(size);
    const sku = variationSku(parentSku, size); // always derived, never from input
    const m = meta.get(size);
    // Bare size-list edit: keep existing metadata, only (re)sync the SKU.
    if (!m) return { ...row, sku };
    return {
      ...row,
      sku,
      price: m.price ?? null,
      net_weight: m.net_weight ?? null,
      is_active: m.is_active ?? true,
    };
  });
}

/** Build the API `size_stock` view for a stored product (adds effective_price). */
function toSizeStockView(p: StoredProduct): ProductSizeStock[] {
  const bySize = new Map(p.size_stocks.map((r) => [r.size, r]));
  return parseSizes(p.available_sizes).map((size) => {
    const r = bySize.get(size) ?? blankVariation(size);
    return {
      size,
      sku: r.sku,
      price: r.price,
      effective_price: effectivePrice(r.price ?? p.price, p.discount_percent),
      net_weight: r.net_weight,
      is_active: r.is_active,
      qty: r.qty,
      is_in_stock: r.qty > 0,
    };
  });
}

function toProductList(p: StoredProduct): ProductList {
  const primary = p.media.find((m) => m.is_primary && m.media_type === "image");
  const thumb = primary?.s3_key ?? p.media[0]?.s3_key ?? "";
  return {
    id: p.id,
    sku: p.sku,
    name: p.name,
    slug: p.slug,
    category_name: catById(p.category_id)?.name ?? null,
    collection_name: colById(p.collection_id)?.name ?? null,
    price: p.price,
    discount_percent: p.discount_percent,
    effective_price: effectivePrice(p.price, p.discount_percent),
    metal_type: p.metal_type,
    purity: p.purity,
    stock_type: p.stock_type,
    qty: p.qty,
    is_in_stock: isInStock(p.qty),
    available_sizes: p.available_sizes,
    variant_label: p.variant_label,
    has_sizes: parseSizes(p.available_sizes).length > 0,
    status: p.status,
    is_featured: p.is_featured,
    thumbnail_key: thumb,
    primary_image: primary
      ? { s3_key: primary.s3_key, alt_text: primary.alt_text }
      : null,
    created_at: p.created_at,
  };
}

function toProductDetail(p: StoredProduct): ProductDetail {
  return {
    id: p.id,
    sku: p.sku,
    name: p.name,
    slug: p.slug,
    description: p.description,
    category: catById(p.category_id),
    collection: colById(p.collection_id),
    price: p.price,
    discount_percent: p.discount_percent,
    effective_price: effectivePrice(p.price, p.discount_percent),
    stock_type: p.stock_type,
    qty: p.qty,
    is_in_stock: isInStock(p.qty),
    status: p.status,
    metal_type: p.metal_type,
    purity: p.purity,
    gross_weight: p.gross_weight,
    net_weight: p.net_weight,
    length_mm: p.length_mm,
    width_mm: p.width_mm,
    height_mm: p.height_mm,
    stone_details: p.stone_details,
    certificate_details: p.certificate_details,
    available_sizes: p.available_sizes,
    size_unit: p.size_unit,
    variant_label: p.variant_label,
    has_sizes: parseSizes(p.available_sizes).length > 0,
    // Ordered by the declared sizes; a size with no stored row reports a blank
    // variation — the same contract the backend's get_size_stock() returns.
    size_stock: toSizeStockView(p),
    care_instruction: p.care_instruction,
    is_featured: p.is_featured,
    tags: p.tags,
    thumbnail_key: detailPrimaryKey(toDetailForThumb(p)) ?? "",
    media: p.media,
    created_at: p.created_at,
    updated_at: p.updated_at,
  };
}
// small helper so detailPrimaryKey can read media/thumbnail without recursion
function toDetailForThumb(p: StoredProduct): ProductDetail {
  return {
    media: p.media,
    thumbnail_key: p.media[0]?.s3_key ?? "",
  } as ProductDetail;
}

function storedById(id: string): StoredProduct {
  const p = get("products").find((x) => x.id === id);
  if (!p) throw new ApiError("Product not found", 404);
  return p;
}
function writeProduct(next: StoredProduct): void {
  const products = get("products");
  const i = products.findIndex((p) => p.id === next.id);
  const copy = products.slice();
  if (i === -1) copy.unshift(next);
  else copy[i] = next;
  set("products", copy);
}

/* -------------------------------------------------------------------------- */
/* PRODUCTS                                                                    */
/* -------------------------------------------------------------------------- */

export interface ListProductsParams {
  q?: string;
  category?: string; // category id
  metal_type?: MetalType | "all";
  status?: ProductStatus | "all";
  ordering?: string;
  page?: number;
  page_size?: number;
}

export async function listProducts(
  params: ListProductsParams = {},
): Promise<Page<ProductList>> {
  await tick();
  requirePermission("catalog.view_product");
  // TODO(backend): fetch(`/catalog/staff/products/?${qs}`)
  let list = get("products").slice();

  if (params.status && params.status !== "all") {
    list = list.filter((p) => p.status === params.status);
  } else {
    list = list.filter((p) => p.status !== "archived");
  }
  if (params.category && params.category !== "all") {
    list = list.filter((p) => p.category_id === params.category);
  }
  if (params.metal_type && params.metal_type !== "all") {
    list = list.filter((p) => p.metal_type === params.metal_type);
  }
  const q = params.q?.trim().toLowerCase();
  if (q) {
    list = list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q),
    );
  }

  const ordering = params.ordering ?? "-created_at";
  const dir = ordering.startsWith("-") ? -1 : 1;
  const field = ordering.replace(/^-/, "");
  list.sort((a, b) => {
    let cmp = 0;
    if (field === "price") cmp = a.price - b.price;
    else if (field === "name") cmp = a.name.localeCompare(b.name);
    else cmp = a.created_at.localeCompare(b.created_at);
    return cmp * dir;
  });

  const page = paginate(
    list.map(toProductList),
    params.page,
    params.page_size,
  );
  return clone(page);
}

export async function getProduct(id: string): Promise<ProductDetail | null> {
  await tick();
  requirePermission("catalog.view_product");
  // TODO(backend): fetch(`/catalog/staff/products/${id}/`)
  const p = get("products").find((x) => x.id === id);
  return p ? clone(toProductDetail(p)) : null;
}

export interface ProductWriteInput {
  name: string;
  price: number;
  metal_type: MetalType;
  sku?: string;
  description?: string;
  category_id?: string | null;
  collection_id?: string | null;
  discount_percent?: number;
  stock_type?: StockType;
  status?: ProductStatus;
  purity?: string;
  gross_weight?: number | null;
  net_weight?: number | null;
  length_mm?: number | null;
  width_mm?: number | null;
  height_mm?: number | null;
  stone_details?: StoneDetail[];
  certificate_details?: Record<string, string>;
  available_sizes?: string;
  size_unit?: string;
  variant_label?: string;
  /**
   * WooCommerce-style variations. When present, this is the source of truth for
   * which variant values exist (and derives `available_sizes`); each entry sets
   * that variation's SKU/price/weight/active. Stock is never set here.
   */
  variations?: VariationInput[];
  care_instruction?: string;
  is_featured?: boolean;
  tags?: string[];
}

/** Ordered, de-duplicated variant values derived from a variations payload. */
function sizesFromVariations(variations: VariationInput[]): string {
  return parseSizes(variations.map((v) => v.size).join(",")).join(",");
}

/** Case-insensitive: is `name` already used by another product (excludes `exceptId`)? */
function productNameTaken(name: string, exceptId?: string): boolean {
  const key = name.trim().toLowerCase();
  if (!key) return false;
  return get("products").some(
    (p) => p.id !== exceptId && p.name.trim().toLowerCase() === key,
  );
}

/** Case-insensitive product-name uniqueness within the store (excludes `exceptId`). */
function assertUniqueName(name: string, exceptId?: string): void {
  if (productNameTaken(name, exceptId)) {
    throw new ApiError(
      `A product named "${name.trim()}" already exists.`,
      400,
      "duplicate_name",
      { name: ["A product with this name already exists."] },
    );
  }
}

export interface NameCheckResult {
  name: string;
  available: boolean;
}

/**
 * Live product-name availability check for the create/edit form — lets the UI
 * flag duplicates as the user types, before uploading images or saving.
 * `excludeId` ignores the product's own name when editing.
 */
export async function checkProductName(
  name: string,
  excludeId?: string,
): Promise<NameCheckResult> {
  await tick();
  requirePermission("catalog.view_product");
  // TODO(backend): fetch(`/catalog/staff/products/check-name/?name=...`)
  const trimmed = name.trim();
  return { name: trimmed, available: !!trimmed && !productNameTaken(trimmed, excludeId) };
}

export async function createProduct(
  input: ProductWriteInput,
): Promise<ProductDetail> {
  await tick(true);
  requirePermission("catalog.add_product");
  // TODO(backend): fetch("/catalog/staff/products/", { method:"POST", ... })
  const products = get("products");
  assertUniqueName(input.name);
  const now = new Date().toISOString();
  const baseSlug = slugify(input.name) || "product";
  let slug = baseSlug;
  let n = 2;
  const taken = new Set(products.map((p) => p.slug));
  while (taken.has(slug)) slug = `${baseSlug}-${n++}`;

  // Variations, when supplied, define the ordered size list (mirrors backend).
  const availableSizes = input.variations
    ? sizesFromVariations(input.variations)
    : input.available_sizes ?? "";
  const purity = input.purity ?? "925 Sterling";
  // SKU is always system-generated (self-describing, never caller-supplied).
  const sku = nextSku(
    input.metal_type,
    products.map((p) => p.sku),
    catById(input.category_id ?? null)?.name,
    purity,
    input.name,
  );
  const product: StoredProduct = {
    id: newId(),
    sku,
    name: input.name,
    slug,
    description: input.description ?? "",
    category_id: input.category_id ?? null,
    collection_id: input.collection_id ?? null,
    price: input.price,
    discount_percent: input.discount_percent ?? 0,
    stock_type: input.stock_type ?? "quantity",
    qty: 0, // stock arrives via purchase orders / adjustments (§ Inventory)
    status: "draft", // create always starts as draft
    metal_type: input.metal_type,
    purity,
    gross_weight: input.gross_weight ?? null,
    net_weight: input.net_weight ?? null,
    length_mm: input.length_mm ?? null,
    width_mm: input.width_mm ?? null,
    height_mm: input.height_mm ?? null,
    stone_details: input.stone_details ?? [],
    certificate_details: input.certificate_details ?? {},
    available_sizes: availableSizes,
    size_unit: input.size_unit ?? "",
    variant_label: input.variant_label ?? "",
    // New products start at zero stock everywhere; sizes seed variation rows at
    // qty 0, carrying any SKU/price/weight metadata from the variations payload.
    size_stocks: reconcileSizeStocks(availableSizes, [], input.variations, sku),
    care_instruction: input.care_instruction ?? "",
    is_featured: input.is_featured ?? false,
    tags: input.tags ?? [],
    media: [],
    created_at: now,
    updated_at: now,
  };
  writeProduct(product);
  return clone(toProductDetail(product));
}

export async function updateProduct(
  id: string,
  patch: Partial<ProductWriteInput>,
): Promise<ProductDetail> {
  await tick(true);
  requirePermission("catalog.edit_product");
  // TODO(backend): fetch(`/catalog/staff/products/${id}/`, { method:"PATCH", ... })
  const existing = storedById(id);
  if (patch.name != null) assertUniqueName(patch.name, id);
  const next: StoredProduct = {
    ...existing,
    ...("name" in patch && patch.name != null ? { name: patch.name } : {}),
    ...("price" in patch && patch.price != null ? { price: patch.price } : {}),
    ...(patch.description != null ? { description: patch.description } : {}),
    ...("category_id" in patch ? { category_id: patch.category_id ?? null } : {}),
    ...("collection_id" in patch ? { collection_id: patch.collection_id ?? null } : {}),
    ...(patch.discount_percent != null ? { discount_percent: patch.discount_percent } : {}),
    ...(patch.status != null ? { status: patch.status } : {}),
    ...(patch.metal_type != null ? { metal_type: patch.metal_type } : {}),
    ...(patch.purity != null ? { purity: patch.purity } : {}),
    ...("gross_weight" in patch ? { gross_weight: patch.gross_weight ?? null } : {}),
    ...("net_weight" in patch ? { net_weight: patch.net_weight ?? null } : {}),
    ...("length_mm" in patch ? { length_mm: patch.length_mm ?? null } : {}),
    ...("width_mm" in patch ? { width_mm: patch.width_mm ?? null } : {}),
    ...("height_mm" in patch ? { height_mm: patch.height_mm ?? null } : {}),
    ...(patch.stone_details != null ? { stone_details: patch.stone_details } : {}),
    ...(patch.certificate_details != null ? { certificate_details: patch.certificate_details } : {}),
    ...(patch.available_sizes != null ? { available_sizes: patch.available_sizes } : {}),
    ...(patch.variations != null ? { available_sizes: sizesFromVariations(patch.variations) } : {}),
    ...(patch.size_unit != null ? { size_unit: patch.size_unit } : {}),
    ...(patch.variant_label != null ? { variant_label: patch.variant_label } : {}),
    ...(patch.care_instruction != null ? { care_instruction: patch.care_instruction } : {}),
    ...(patch.is_featured != null ? { is_featured: patch.is_featured } : {}),
    ...(patch.tags != null ? { tags: patch.tags } : {}),
    updated_at: new Date().toISOString(),
  };
  // Keep variation rows in step when the size list or variation metadata is
  // edited; a bare size-list change preserves existing SKUs/prices/weights.
  if (patch.available_sizes != null || patch.variations != null) {
    next.size_stocks = reconcileSizeStocks(
      next.available_sizes,
      existing.size_stocks,
      patch.variations,
      next.sku,
    );
  }
  // Keep status honest with stock when not explicitly archived/draft.
  if (next.status === "active" && next.qty <= 0) next.status = "out_of_stock";
  writeProduct(next);
  return clone(toProductDetail(next));
}

/**
 * A WooCommerce-style price adjustment applied per product in a bulk edit.
 *   • set      — replace with an absolute amount (`unit` ignored)
 *   • increase — add `value` (₹ when unit="amount", % of current when "percent")
 *   • decrease — subtract `value` (same unit rules), floored at 0
 */
export interface BulkPriceOp {
  mode: "set" | "increase" | "decrease";
  value: number;
  unit: "amount" | "percent";
}

/**
 * The common fields a bulk edit can change across many products at once. Every
 * field is optional — an omitted key leaves that attribute untouched on each
 * product. `category_id`/`collection_id` accept `null` to clear the link.
 */
export interface BulkProductChanges {
  price?: BulkPriceOp;
  discount_percent?: number; // set to (0–100)
  status?: ProductStatus;
  category_id?: string | null;
  collection_id?: string | null;
  metal_type?: MetalType;
  is_featured?: boolean;
}

export interface BulkUpdateProductsInput {
  ids: string[];
  changes: BulkProductChanges;
}

/** Resolve one product's new price from its current price and a bulk op. */
function applyPriceOp(current: number, op: BulkPriceOp): number {
  let next = current;
  if (op.mode === "set") {
    next = op.value;
  } else {
    const delta = op.unit === "percent" ? (current * op.value) / 100 : op.value;
    next = op.mode === "increase" ? current + delta : current - delta;
  }
  return Math.max(0, Math.round(next * 100) / 100);
}

/**
 * Apply the same `changes` to every product in `ids` in one shot. Mirrors the
 * per-product `updateProduct` write (including the active/out-of-stock status
 * reconciliation), so a bulk edit and N single edits land the same data.
 */
export async function bulkUpdateProducts(
  input: BulkUpdateProductsInput,
): Promise<{ updated: number }> {
  await tick(true);
  requirePermission("catalog.edit_product");
  // TODO(backend): fetch("/catalog/staff/products/bulk-update/", { method:"POST", ... })
  const { ids, changes } = input;
  if (!ids.length) throw new ApiError("Select at least one product");
  const idSet = new Set(ids);
  const now = new Date().toISOString();
  let updated = 0;
  const next = get("products").map((p) => {
    if (!idSet.has(p.id)) return p;
    updated++;
    let status = changes.status ?? p.status;
    // Keep status honest with stock, exactly like updateProduct.
    if (status === "active" && p.qty <= 0) status = "out_of_stock";
    return {
      ...p,
      ...(changes.price ? { price: applyPriceOp(p.price, changes.price) } : {}),
      ...(changes.discount_percent != null
        ? { discount_percent: Math.min(100, Math.max(0, changes.discount_percent)) }
        : {}),
      status,
      ...("category_id" in changes ? { category_id: changes.category_id ?? null } : {}),
      ...("collection_id" in changes ? { collection_id: changes.collection_id ?? null } : {}),
      ...(changes.metal_type != null ? { metal_type: changes.metal_type } : {}),
      ...(changes.is_featured != null ? { is_featured: changes.is_featured } : {}),
      updated_at: now,
    };
  });
  if (!updated) throw new ApiError("No matching products found", 404);
  set("products", next);
  return { updated };
}

export async function archiveProduct(id: string): Promise<void> {
  await tick(true);
  requirePermission("catalog.delete_product");
  // TODO(backend): fetch(`/catalog/staff/products/${id}/`, { method:"DELETE" })
  const existing = storedById(id);
  writeProduct({ ...existing, status: "archived", updated_at: new Date().toISOString() });
}

/* -------- Media: presign → confirm → delete (S3 direct upload) ----------- */

export interface PresignInput {
  product_id: string;
  media_type: MediaType;
  file_name: string;
  mime_type: string;
}

export async function presignMedia(input: PresignInput): Promise<{
  presigned_url: string;
  s3_key: string;
  expires_in: number;
}> {
  await tick();
  requirePermission("catalog.add_product");
  storedById(input.product_id);
  // TODO(backend): fetch("/catalog/staff/media/presign/", ...) then PUT bytes to presigned_url.
  // Mock: the caller uploads nothing to S3; it passes the base64/URL as s3_key to confirm.
  const s3_key = `mock-s3/${input.product_id}/${newId()}-${input.file_name}`;
  return { presigned_url: `mock://upload/${s3_key}`, s3_key, expires_in: 900 };
}

export interface ConfirmMediaInput {
  product_id: string;
  s3_key: string; // in the mock this holds the base64 data-URI or pasted URL
  media_type: MediaType;
  file_name?: string;
  mime_type?: string;
  file_size?: number | null;
  alt_text?: string;
  is_primary?: boolean;
  sort_order?: number;
}

export async function confirmMedia(
  input: ConfirmMediaInput,
): Promise<ProductMedia> {
  await tick(true);
  requirePermission("catalog.add_product");
  // TODO(backend): fetch("/catalog/staff/media/confirm/", ...) — server head_object verifies S3.
  const product = storedById(input.product_id);
  const media: ProductMedia = {
    id: newId(),
    media_type: input.media_type,
    s3_key: input.s3_key,
    file_name: input.file_name ?? "upload",
    mime_type: input.mime_type ?? "image/*",
    alt_text: input.alt_text ?? product.name,
    sort_order: input.sort_order ?? product.media.length,
    is_primary: input.is_primary ?? product.media.length === 0,
  };
  let nextMedia = [...product.media, media];
  if (media.is_primary) {
    nextMedia = nextMedia.map((m) =>
      m.id === media.id ? m : { ...m, is_primary: false },
    );
  }
  writeProduct({ ...product, media: nextMedia, updated_at: new Date().toISOString() });
  return clone(media);
}

export async function deleteMedia(mediaId: string): Promise<void> {
  await tick(true);
  requirePermission("catalog.edit_product");
  // TODO(backend): fetch(`/catalog/staff/media/${mediaId}/`, { method:"DELETE" })
  const products = get("products");
  const owner = products.find((p) => p.media.some((m) => m.id === mediaId));
  if (!owner) throw new ApiError("Media not found", 404);
  const media = owner.media.filter((m) => m.id !== mediaId);
  // Ensure a primary still exists.
  if (media.length && !media.some((m) => m.is_primary)) media[0].is_primary = true;
  writeProduct({ ...owner, media, updated_at: new Date().toISOString() });
}

/* -------------------------------------------------------------------------- */
/* CATEGORIES                                                                  */
/* -------------------------------------------------------------------------- */

export interface CategoryInput {
  name: string;
  parent?: string | null;
  description?: string;
  image_key?: string;
  is_active?: boolean;
  sort_order?: number;
}

export async function listCategories(): Promise<Category[]> {
  await tick();
  requirePermission("catalog.view_product");
  // TODO(backend): fetch("/catalog/staff/categories/")
  return clone(get("categories").slice().sort((a, b) => a.sort_order - b.sort_order));
}

/* -------- Category image: presign → confirm (S3 direct upload) ----------- */

export interface CategoryImagePresignInput {
  file_name: string;
  mime_type: string;
}

export async function presignCategoryImage(
  input: CategoryImagePresignInput,
): Promise<{ presigned_url: string; s3_key: string; expires_in: number }> {
  await tick();
  requirePermission("catalog.add_product");
  // TODO(backend): fetch("/catalog/staff/categories/media/presign/", ...) then PUT bytes to presigned_url.
  // Mock: nothing is uploaded to S3; the caller passes the base64 data-URI as s3_key to confirm.
  const s3_key = `mock-s3/categories/${newId()}-${input.file_name}`;
  return { presigned_url: `mock://upload/${s3_key}`, s3_key, expires_in: 900 };
}

export interface ConfirmCategoryImageInput {
  s3_key: string; // in the mock this holds the base64 data-URI
  file_name?: string;
  mime_type?: string;
  file_size?: number | null;
}

export async function confirmCategoryImage(
  input: ConfirmCategoryImageInput,
): Promise<{ image_key: string }> {
  await tick(true);
  requirePermission("catalog.add_product");
  // TODO(backend): fetch("/catalog/staff/categories/media/confirm/", ...) — server head_object verifies S3.
  // Mock echoes the key back (a data-URI) so <Thumb> renders it inline.
  return { image_key: input.s3_key };
}

export async function createCategory(input: CategoryInput): Promise<Category> {
  await tick(true);
  requirePermission("catalog.add_product");
  // TODO(backend): fetch("/catalog/staff/categories/", { method:"POST", ... })
  const cat: Category = {
    id: newId(),
    name: input.name,
    slug: slugify(input.name),
    parent: input.parent ?? null,
    description: input.description ?? "",
    image_key: input.image_key ?? "",
    is_active: input.is_active ?? true,
    sort_order: input.sort_order ?? get("categories").length,
  };
  set("categories", [...get("categories"), cat]);
  return clone(cat);
}

export async function updateCategory(
  id: string,
  patch: CategoryInput,
): Promise<Category> {
  await tick(true);
  requirePermission("catalog.edit_product");
  // TODO(backend): fetch(`/catalog/staff/categories/${id}/`, { method:"PATCH", ... })
  const cats = get("categories");
  const i = cats.findIndex((c) => c.id === id);
  if (i === -1) throw new ApiError("Category not found", 404);
  const updated: Category = {
    ...cats[i],
    ...(patch.name != null ? { name: patch.name, slug: slugify(patch.name) } : {}),
    ...("parent" in patch ? { parent: patch.parent ?? null } : {}),
    ...(patch.description != null ? { description: patch.description } : {}),
    ...(patch.image_key != null ? { image_key: patch.image_key } : {}),
    ...(patch.is_active != null ? { is_active: patch.is_active } : {}),
    ...(patch.sort_order != null ? { sort_order: patch.sort_order } : {}),
  };
  const next = cats.slice();
  next[i] = updated;
  set("categories", next);
  return clone(updated);
}

/* -------------------------------------------------------------------------- */
/* COLLECTIONS                                                                 */
/* -------------------------------------------------------------------------- */

export interface CollectionInput {
  name: string;
  description?: string;
  banner_image_key?: string;
  is_active?: boolean;
  sort_order?: number;
}

export async function listCollections(): Promise<Collection[]> {
  await tick();
  requirePermission("catalog.view_product");
  // TODO(backend): fetch("/catalog/staff/collections/")
  return clone(get("collections").slice().sort((a, b) => a.sort_order - b.sort_order));
}

export async function createCollection(
  input: CollectionInput,
): Promise<Collection> {
  await tick(true);
  requirePermission("catalog.add_product");
  const col: Collection = {
    id: newId(),
    name: input.name,
    slug: slugify(input.name),
    description: input.description ?? "",
    banner_image_key: input.banner_image_key ?? "",
    is_active: input.is_active ?? true,
    sort_order: input.sort_order ?? get("collections").length,
  };
  set("collections", [...get("collections"), col]);
  return clone(col);
}

export async function updateCollection(
  id: string,
  patch: CollectionInput,
): Promise<Collection> {
  await tick(true);
  requirePermission("catalog.edit_product");
  const cols = get("collections");
  const i = cols.findIndex((c) => c.id === id);
  if (i === -1) throw new ApiError("Collection not found", 404);
  const updated: Collection = {
    ...cols[i],
    ...(patch.name != null ? { name: patch.name, slug: slugify(patch.name) } : {}),
    ...(patch.description != null ? { description: patch.description } : {}),
    ...(patch.banner_image_key != null ? { banner_image_key: patch.banner_image_key } : {}),
    ...(patch.is_active != null ? { is_active: patch.is_active } : {}),
    ...(patch.sort_order != null ? { sort_order: patch.sort_order } : {}),
  };
  const next = cols.slice();
  next[i] = updated;
  set("collections", next);
  return clone(updated);
}

/* -------------------------------------------------------------------------- */
/* REVIEWS                                                                     */
/* -------------------------------------------------------------------------- */

export async function listReviews(
  params: { approved?: boolean } = {},
): Promise<Review[]> {
  await tick();
  requirePermission("catalog.view_product");
  // TODO(backend): fetch(`/catalog/staff/reviews/?approved=...`)
  let list = get("reviews").slice();
  if (params.approved != null)
    list = list.filter((r) => r.is_approved === params.approved);
  list.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return clone(list);
}

export async function approveReview(id: string): Promise<Review> {
  await tick(true);
  requirePermission("catalog.edit_product");
  // TODO(backend): fetch(`/catalog/staff/reviews/${id}/approve/`, { method:"PATCH" })
  const reviews = get("reviews");
  const i = reviews.findIndex((r) => r.id === id);
  if (i === -1) throw new ApiError("Review not found", 404);
  const updated = { ...reviews[i], is_approved: true };
  const next = reviews.slice();
  next[i] = updated;
  set("reviews", next);
  return clone(updated);
}

/* -------------------------------------------------------------------------- */
/* SUPPLIERS                                                                   */
/* -------------------------------------------------------------------------- */

export interface SupplierInput {
  name: string;
  contact_name?: string;
  phone?: string;
  email?: string;
  address?: string;
  gstin?: string;
  notes?: string;
  is_active?: boolean;
}

export async function listSuppliers(
  params: { active?: boolean } = {},
): Promise<Supplier[]> {
  await tick();
  requirePermission("inventory.view_supplier");
  // TODO(backend): fetch(`/inventory/suppliers/?active=...`)
  let list = get("suppliers").slice();
  if (params.active != null) list = list.filter((s) => s.is_active === params.active);
  return clone(list.sort((a, b) => a.name.localeCompare(b.name)));
}

export async function getSupplier(id: string): Promise<Supplier | null> {
  await tick();
  requirePermission("inventory.view_supplier");
  return clone(get("suppliers").find((s) => s.id === id) ?? null);
}

export async function createSupplier(input: SupplierInput): Promise<Supplier> {
  await tick(true);
  requirePermission("inventory.manage_supplier");
  const suppliers = get("suppliers");
  if (suppliers.some((s) => s.name.toLowerCase() === input.name.trim().toLowerCase()))
    throw new ApiError("A supplier with this name already exists");
  const now = new Date().toISOString();
  const supplier: Supplier = {
    id: newId(),
    name: input.name,
    contact_name: input.contact_name ?? "",
    phone: input.phone ?? "",
    email: input.email ?? "",
    address: input.address ?? "",
    gstin: input.gstin ?? "",
    notes: input.notes ?? "",
    is_active: input.is_active ?? true,
    created_at: now,
    updated_at: now,
  };
  set("suppliers", [...suppliers, supplier]);
  return clone(supplier);
}

export async function updateSupplier(
  id: string,
  patch: SupplierInput,
): Promise<Supplier> {
  await tick(true);
  requirePermission("inventory.manage_supplier");
  const suppliers = get("suppliers");
  const i = suppliers.findIndex((s) => s.id === id);
  if (i === -1) throw new ApiError("Supplier not found", 404);
  const updated: Supplier = {
    ...suppliers[i],
    ...(patch.name != null ? { name: patch.name } : {}),
    ...(patch.contact_name != null ? { contact_name: patch.contact_name } : {}),
    ...(patch.phone != null ? { phone: patch.phone } : {}),
    ...(patch.email != null ? { email: patch.email } : {}),
    ...(patch.address != null ? { address: patch.address } : {}),
    ...(patch.gstin != null ? { gstin: patch.gstin } : {}),
    ...(patch.notes != null ? { notes: patch.notes } : {}),
    ...(patch.is_active != null ? { is_active: patch.is_active } : {}),
    updated_at: new Date().toISOString(),
  };
  const next = suppliers.slice();
  next[i] = updated;
  set("suppliers", next);
  return clone(updated);
}

/* -------------------------------------------------------------------------- */
/* PURCHASE ORDERS                                                             */
/* -------------------------------------------------------------------------- */

export async function listPurchaseOrders(
  params: { status?: PurchaseOrder["status"] } = {},
): Promise<PurchaseOrder[]> {
  await tick();
  requirePermission("inventory.view_purchase_order");
  let list = get("purchaseOrders").slice();
  if (params.status) list = list.filter((po) => po.status === params.status);
  return clone(list.sort((a, b) => b.created_at.localeCompare(a.created_at)));
}

export async function getPurchaseOrder(id: string): Promise<PurchaseOrder | null> {
  await tick();
  requirePermission("inventory.view_purchase_order");
  return clone(get("purchaseOrders").find((po) => po.id === id) ?? null);
}

export interface PurchaseOrderCreateInput {
  supplier_id: string;
  items: { product_id: string; qty_ordered: number; unit_cost: number; size?: string }[];
  order_date?: string | null;
  expected_delivery_date?: string | null;
  tax_amount?: number;
  shipping_cost?: number;
  notes?: string;
}

export async function createPurchaseOrder(
  input: PurchaseOrderCreateInput,
): Promise<PurchaseOrder> {
  await tick(true);
  requirePermission("inventory.manage_purchase_order");
  const supplier = get("suppliers").find((s) => s.id === input.supplier_id);
  if (!supplier) throw new ApiError("Supplier not found");
  if (!input.items.length) throw new ApiError("Add at least one line item");
  const now = new Date().toISOString();
  const items: PurchaseOrderItem[] = input.items.map((it) => {
    const p = storedById(it.product_id);
    const size = (it.size ?? "").trim();
    // Sized products must restock a specific, valid size; unsized must not carry
    // one — same guard the backend enforces so a receipt can't desync per-size.
    const sizes = parseSizes(p.available_sizes);
    if (sizes.length > 0) {
      if (!size) throw new ApiError(`'${p.sku}' is sold in sizes — specify a size for its line.`);
      if (!sizes.includes(size)) throw new ApiError(`Size '${size}' is not available for '${p.sku}'.`);
    } else if (size) {
      throw new ApiError(`'${p.sku}' is not a sized product — remove the size.`);
    }
    return {
      id: newId(),
      product_id: p.id,
      product_sku: p.sku,
      product_name: p.name,
      size,
      qty_ordered: it.qty_ordered,
      qty_received: 0,
      qty_pending: it.qty_ordered,
      unit_cost: it.unit_cost,
      total_cost: it.qty_ordered * it.unit_cost,
      is_fully_received: false,
    };
  });
  const subtotal = items.reduce((s, it) => s + it.total_cost, 0);
  const po: PurchaseOrder = {
    id: newId(),
    po_number: nextPoNumber(get("purchaseOrders").length),
    supplier: supplier.id,
    supplier_name: supplier.name,
    status: "draft",
    order_date: input.order_date ? new Date(input.order_date).toISOString() : null,
    expected_delivery_date: input.expected_delivery_date
      ? new Date(input.expected_delivery_date).toISOString()
      : null,
    received_date: null,
    subtotal,
    tax_amount: input.tax_amount ?? 0,
    shipping_cost: input.shipping_cost ?? 0,
    total_amount: subtotal + (input.tax_amount ?? 0) + (input.shipping_cost ?? 0),
    notes: input.notes ?? "",
    items,
    created_at: now,
    updated_at: now,
  };
  set("purchaseOrders", [po, ...get("purchaseOrders")]);
  return clone(po);
}

function writePo(next: PurchaseOrder): void {
  const list = get("purchaseOrders");
  const i = list.findIndex((po) => po.id === next.id);
  const copy = list.slice();
  copy[i] = next;
  set("purchaseOrders", copy);
}

export async function confirmPurchaseOrder(id: string): Promise<PurchaseOrder> {
  await tick(true);
  requirePermission("inventory.manage_purchase_order");
  const po = get("purchaseOrders").find((p) => p.id === id);
  if (!po) throw new ApiError("Purchase order not found", 404);
  if (po.status !== "draft")
    throw new ApiError(`Cannot confirm a purchase order that is "${po.status}"`);
  const updated: PurchaseOrder = {
    ...po,
    status: "ordered",
    order_date: po.order_date ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  writePo(updated);
  return clone(updated);
}

export async function cancelPurchaseOrder(
  id: string,
  reason?: string,
): Promise<PurchaseOrder> {
  await tick(true);
  requirePermission("inventory.manage_purchase_order");
  const po = get("purchaseOrders").find((p) => p.id === id);
  if (!po) throw new ApiError("Purchase order not found", 404);
  if (po.status === "received" || po.status === "cancelled")
    throw new ApiError(`Cannot cancel a purchase order that is "${po.status}"`);
  const updated: PurchaseOrder = {
    ...po,
    status: "cancelled",
    notes: reason ? `${po.notes}\nCancelled: ${reason}`.trim() : po.notes,
    updated_at: new Date().toISOString(),
  };
  writePo(updated);
  return clone(updated);
}

export async function receivePurchaseOrder(
  id: string,
  receipts: { purchase_order_item_id: string; qty_received: number }[],
  received_date?: string | null,
): Promise<PurchaseOrder> {
  await tick(true);
  requirePermission("inventory.manage_purchase_order");
  // TODO(backend): fetch(`/inventory/purchase-orders/${id}/receive/`, { method:"POST", ... })
  const po = get("purchaseOrders").find((p) => p.id === id);
  if (!po) throw new ApiError("Purchase order not found", 404);
  if (po.status !== "ordered" && po.status !== "partial")
    throw new ApiError(`Cannot receive against a "${po.status}" purchase order`);

  const actor = getStoredSession()?.staff.email ?? "";
  const ts = received_date ? new Date(received_date).toISOString() : new Date().toISOString();
  const items = po.items.map((it) => ({ ...it }));

  for (const r of receipts) {
    const it = items.find((x) => x.id === r.purchase_order_item_id);
    if (!it) throw new ApiError("Line item not found on this purchase order");
    if (r.qty_received < 1) continue;
    if (r.qty_received > it.qty_pending)
      throw new ApiError(
        `Receiving ${r.qty_received} exceeds ${it.qty_pending} pending for ${it.product_sku}`,
      );
    it.qty_received += r.qty_received;
    // Increment product stock + write a ledger entry (reason=purchase). For a
    // sized line, credit that size's row and re-derive the aggregate as the sum
    // across sizes; balance_after is that size's running balance.
    const product = storedById(it.product_id);
    let nextSizeStocks = product.size_stocks;
    let newTotal: number;
    let balanceAfter: number;
    if (it.size) {
      const current = product.size_stocks.find((s) => s.size === it.size)?.qty ?? 0;
      balanceAfter = current + r.qty_received;
      const exists = product.size_stocks.some((s) => s.size === it.size);
      nextSizeStocks = exists
        ? product.size_stocks.map((s) => (s.size === it.size ? { ...s, qty: balanceAfter } : s))
        : [...product.size_stocks, { ...blankVariation(it.size), qty: balanceAfter }];
      newTotal = nextSizeStocks.reduce((sum, s) => sum + s.qty, 0);
    } else {
      newTotal = product.qty + r.qty_received;
      balanceAfter = newTotal;
    }
    writeProduct({
      ...product,
      qty: newTotal,
      size_stocks: nextSizeStocks,
      status: product.status === "out_of_stock" ? "active" : product.status,
      updated_at: ts,
    });
    appendLedger({
      product_id: product.id,
      product_sku: product.sku,
      size: it.size,
      reason: "purchase",
      change_qty: r.qty_received,
      balance_after: balanceAfter,
      reference_type: "purchase_order",
      reference_id: po.id,
      note: `${po.po_number} receipt`,
      actor_email: actor,
      timestamp: ts,
    });
  }

  const recomputed = recomputePurchaseOrder({ ...po, items });
  recomputed.received_date =
    recomputed.status === "received" ? ts : po.received_date;
  recomputed.updated_at = ts;
  writePo(recomputed);
  return clone(recomputed);
}

/* -------------------------------------------------------------------------- */
/* STOCK                                                                       */
/* -------------------------------------------------------------------------- */

function appendLedger(entry: Omit<StockLedgerEntry, "id">): void {
  set("ledger", [{ id: newId(), ...entry }, ...get("ledger")]);
}

export async function listLowStock(
  threshold = 5,
): Promise<{ items: ProductList[]; threshold: number; count: number }> {
  await tick();
  requirePermission("inventory.view_stock_ledger");
  const items = get("products")
    .filter((p) => p.status !== "archived" && p.qty <= threshold)
    .map(toProductList)
    .sort((a, b) => a.qty - b.qty);
  return clone({ items, threshold, count: items.length });
}

export async function stockValuation(): Promise<{
  rows: StockValuationRow[];
  total_valuation: number;
}> {
  await tick();
  requirePermission("reports.view_inventory");
  const pos = get("purchaseOrders");
  const rows: StockValuationRow[] = get("products")
    .filter((p) => p.status === "active" || p.status === "out_of_stock")
    .map((p) => {
      // last known unit cost = most recent PO line for this product
      let last_unit_cost: number | null = null;
      let latest = "";
      for (const po of pos) {
        for (const it of po.items) {
          if (it.product_id === p.id && po.created_at > latest) {
            latest = po.created_at;
            last_unit_cost = it.unit_cost;
          }
        }
      }
      return {
        id: p.id,
        sku: p.sku,
        name: p.name,
        metal_type: p.metal_type,
        qty: p.qty,
        last_unit_cost,
      };
    });
  const total_valuation = rows.reduce(
    (s, r) => s + (r.last_unit_cost ?? 0) * r.qty,
    0,
  );
  return clone({ rows, total_valuation });
}

export async function productLedger(
  productId: string,
  limit = 50,
): Promise<StockLedgerEntry[]> {
  await tick();
  requirePermission("inventory.view_stock_ledger");
  const list = get("ledger")
    .filter((e) => e.product_id === productId)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, limit);
  return clone(list);
}

export async function adjustStock(
  productId: string,
  newQty: number,
  note: string,
  size = "",
): Promise<StockLedgerEntry> {
  await tick(true);
  requirePermission("inventory.adjust_stock");
  // TODO(backend): fetch("/inventory/stock/adjust/", { method:"POST", ... })
  if (!note?.trim()) throw new ApiError("A note is required for a manual adjustment");
  const product = storedById(productId);
  const clamped = Math.max(0, Math.round(newQty));
  const ts = new Date().toISOString();
  const trimmedSize = size.trim();

  let delta: number;
  let balanceAfter: number;
  let nextSizeStocks = product.size_stocks;
  let nextTotal: number;

  if (trimmedSize) {
    // Per-size adjustment: set this size's row, then re-derive the product
    // total as the sum across sizes — mirrors the backend's aggregate cache.
    const current = product.size_stocks.find((r) => r.size === trimmedSize)?.qty ?? 0;
    delta = clamped - current;
    balanceAfter = clamped;
    const exists = product.size_stocks.some((r) => r.size === trimmedSize);
    nextSizeStocks = exists
      ? product.size_stocks.map((r) => (r.size === trimmedSize ? { ...r, qty: clamped } : r))
      : [...product.size_stocks, { ...blankVariation(trimmedSize), qty: clamped }];
    nextTotal = nextSizeStocks.reduce((sum, r) => sum + r.qty, 0);
  } else {
    delta = clamped - product.qty;
    balanceAfter = clamped;
    nextTotal = clamped;
  }

  writeProduct({
    ...product,
    qty: nextTotal,
    size_stocks: nextSizeStocks,
    status:
      product.status === "archived"
        ? "archived"
        : nextTotal > 0
          ? "active"
          : "out_of_stock",
    updated_at: ts,
  });
  const entry: Omit<StockLedgerEntry, "id"> = {
    product_id: product.id,
    product_sku: product.sku,
    size: trimmedSize,
    reason: "adjustment",
    change_qty: delta,
    balance_after: balanceAfter,
    reference_type: "adjustment",
    reference_id: null,
    note,
    actor_email: getStoredSession()?.staff.email ?? "",
    timestamp: ts,
  };
  const withId = { id: newId(), ...entry };
  set("ledger", [withId, ...get("ledger")]);
  return clone(withId);
}

/* -------------------------------------------------------------------------- */
/* ORDERS                                                                      */
/* -------------------------------------------------------------------------- */

export interface ListOrdersParams {
  status?: OrderStatus | "all";
  search?: string;
  from?: string;
  to?: string;
  page?: number;
  page_size?: number;
}

export async function listOrders(
  params: ListOrdersParams = {},
): Promise<Page<Order>> {
  await tick();
  requirePermission("orders.view_order");
  let list = get("orders").slice();
  if (params.status && params.status !== "all")
    list = list.filter((o) => o.status === params.status);
  const q = params.search?.trim().toLowerCase();
  if (q)
    list = list.filter(
      (o) =>
        o.order_number.toLowerCase().includes(q) ||
        o.customer_email.toLowerCase().includes(q) ||
        (o.customer_name ?? "").toLowerCase().includes(q),
    );
  if (params.from) {
    const from = new Date(params.from).getTime();
    list = list.filter((o) => new Date(o.created_at).getTime() >= from);
  }
  if (params.to) {
    const to = new Date(params.to).getTime() + 86_400_000 - 1;
    list = list.filter((o) => new Date(o.created_at).getTime() <= to);
  }
  list.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return clone(paginate(list, params.page, params.page_size));
}

export async function getOrder(id: string): Promise<Order | null> {
  await tick();
  requirePermission("orders.view_order");
  return clone(get("orders").find((o) => o.id === id) ?? null);
}

function writeOrder(next: Order): void {
  const list = get("orders");
  const i = list.findIndex((o) => o.id === next.id);
  const copy = list.slice();
  copy[i] = next;
  set("orders", copy);
}

export async function updateOrderStatus(
  id: string,
  status: OrderStatus,
  note?: string,
): Promise<Order> {
  await tick(true);
  requirePermission("orders.update_order_status");
  // TODO(backend): fetch(`/orders/staff/${id}/status/`, { method:"PATCH", ... })
  const order = get("orders").find((o) => o.id === id);
  if (!order) throw new ApiError("Order not found", 404);
  const allowed = ORDER_TRANSITIONS[order.status];
  if (!allowed.includes(status))
    throw new ApiError(
      `Cannot move an order from "${order.status}" to "${status}"`,
    );

  const now = new Date().toISOString();
  let payment_status = order.payment_status;

  if (status === "cancelled") {
    // Cancel flow: restock items + refund any captured payment.
    for (const it of order.items) {
      const product = get("products").find((p) => p.id === it.product_id);
      if (product) {
        const newQty = product.qty + it.quantity;
        writeProduct({ ...product, qty: newQty, updated_at: now });
        appendLedger({
          product_id: product.id,
          product_sku: product.sku,
          size: "",
          reason: "return",
          change_qty: it.quantity,
          balance_after: newQty,
          reference_type: "order",
          reference_id: order.id,
          note: `Cancelled ${order.order_number}`,
          actor_email: getStoredSession()?.staff.email ?? "",
          timestamp: now,
        });
      }
    }
    if (order.payment_status === "captured") {
      createRefundRecord(order, order.total_amount, note ?? "Order cancelled");
      payment_status = "refunded";
    }
  }
  if (status === "refunded") payment_status = "refunded";

  const updated: Order = {
    ...order,
    status,
    payment_status,
    notes: note ? `${order.notes}\n${note}`.trim() : order.notes,
    updated_at: now,
  };
  writeOrder(updated);
  return clone(updated);
}

/* -------------------------------------------------------------------------- */
/* RETURNS                                                                     */
/* -------------------------------------------------------------------------- */

export interface ListReturnsParams {
  status?: Return["status"];
  reason?: Return["reason"];
  page?: number;
  page_size?: number;
}

export async function listReturns(
  params: ListReturnsParams = {},
): Promise<Page<Return>> {
  await tick();
  requirePermission("orders.view_order");
  let list = get("returns").slice();
  if (params.status) list = list.filter((r) => r.status === params.status);
  if (params.reason) list = list.filter((r) => r.reason === params.reason);
  list.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return clone(paginate(list, params.page, params.page_size));
}

export async function getReturn(id: string): Promise<Return | null> {
  await tick();
  requirePermission("orders.view_order");
  return clone(get("returns").find((r) => r.id === id) ?? null);
}

function writeReturn(next: Return): Return {
  const list = get("returns");
  const i = list.findIndex((r) => r.id === next.id);
  const copy = list.slice();
  copy[i] = { ...next, updated_at: new Date().toISOString() };
  set("returns", copy);
  return copy[i];
}
function findReturn(id: string): Return {
  const r = get("returns").find((x) => x.id === id);
  if (!r) throw new ApiError("Return not found", 404);
  return r;
}

const COURIER_POOL = ["bluedart", "delhivery", "dtdc"];

export async function approveReturn(
  id: string,
  staffNote?: string,
): Promise<Return> {
  await tick(true);
  requirePermission("orders.update_order_status");
  const r = findReturn(id);
  if (r.status !== "requested")
    throw new ApiError(`Cannot approve a return that is "${r.status}"`);
  const courier = COURIER_POOL[Math.floor(Math.random() * COURIER_POOL.length)];
  const awb = `RV${Math.floor(1_000_000 + Math.random() * 8_999_999)}`;
  return clone(
    writeReturn({
      ...r,
      status: "approved",
      staff_note: staffNote ?? r.staff_note,
      return_shipment_awb: awb,
      return_shipment_courier: courier,
      return_tracking_url: `https://track.example.com/${awb}`,
    }),
  );
}

export async function rejectReturn(
  id: string,
  rejectionReason: string,
): Promise<Return> {
  await tick(true);
  requirePermission("orders.update_order_status");
  if (!rejectionReason?.trim()) throw new ApiError("A rejection reason is required");
  const r = findReturn(id);
  if (r.status !== "requested")
    throw new ApiError(`Cannot reject a return that is "${r.status}"`);
  return clone(writeReturn({ ...r, status: "rejected", rejection_reason: rejectionReason }));
}

export async function retryReturnPickup(id: string): Promise<Return> {
  await tick(true);
  requirePermission("orders.update_order_status");
  const r = findReturn(id);
  if (r.status !== "approved")
    throw new ApiError("Retry is only valid for an approved return awaiting pickup");
  const awb = `RV${Math.floor(1_000_000 + Math.random() * 8_999_999)}`;
  return clone(
    writeReturn({ ...r, return_shipment_awb: awb, return_tracking_url: `https://track.example.com/${awb}` }),
  );
}

export async function receiveReturn(id: string): Promise<Return> {
  await tick(true);
  requirePermission("orders.update_order_status");
  const r = findReturn(id);
  if (r.status !== "approved" && r.status !== "shipped_back")
    throw new ApiError(`Cannot mark received from "${r.status}"`);
  return clone(writeReturn({ ...r, status: "received" }));
}

export async function inspectReturn(
  id: string,
  passed: boolean,
  inspectionNote?: string,
): Promise<Return> {
  await tick(true);
  requirePermission("orders.update_order_status");
  const r = findReturn(id);
  if (r.status !== "received")
    throw new ApiError(`Cannot inspect a return that is "${r.status}"`);
  if (!passed) {
    return clone(
      writeReturn({
        ...r,
        status: "rejected_inspection",
        inspection_note: inspectionNote ?? "",
        inspected_at: new Date().toISOString(),
      }),
    );
  }
  // Passed → move toward refund. Create refund for the linked order.
  const order = get("orders").find((o) => o.id === r.order_id);
  let refundId: string | null = r.refund_id;
  if (order) {
    const refund = createRefundRecord(order, order.total_amount, "Return inspected & approved");
    refundId = refund.id;
    writeOrder({ ...order, status: "refunded", payment_status: "refunded", updated_at: new Date().toISOString() });
  }
  return clone(
    writeReturn({
      ...r,
      status: "refund_initiated",
      inspection_note: inspectionNote ?? "",
      inspected_at: new Date().toISOString(),
      refund_id: refundId,
    }),
  );
}

/* -------------------------------------------------------------------------- */
/* REFUNDS                                                                     */
/* -------------------------------------------------------------------------- */

function createRefundRecord(order: Order, amount: number, reason: string): Refund {
  const refund: Refund = {
    id: newId(),
    order_id: order.id,
    razorpay_refund_id: `rfnd_${newId().slice(0, 12)}`,
    amount,
    reason,
    status: "processed",
    created_at: new Date().toISOString(),
  };
  set("refunds", [refund, ...get("refunds")]);
  return refund;
}

export async function listRefunds(): Promise<Refund[]> {
  await tick();
  requirePermission("orders.view_order");
  return clone(get("refunds").slice().sort((a, b) => b.created_at.localeCompare(a.created_at)));
}

export async function initiateRefund(
  orderId: string,
  amount?: number | null,
  reason?: string,
): Promise<Refund> {
  await tick(true);
  requirePermission("orders.process_refund");
  // TODO(backend): fetch("/payments/staff/refund/", { method:"POST", ... })
  const order = get("orders").find((o) => o.id === orderId);
  if (!order) throw new ApiError("Order not found", 404);
  if (order.payment_status !== "captured" && order.payment_status !== "partially_refunded")
    throw new ApiError("No captured payment to refund on this order");
  const refundAmount = amount == null ? order.total_amount : amount;
  if (refundAmount <= 0) throw new ApiError("Refund amount must be positive");
  if (refundAmount > order.total_amount)
    throw new ApiError("Refund amount exceeds the captured amount");
  const refund = createRefundRecord(order, refundAmount, reason ?? "Manual refund");
  writeOrder({
    ...order,
    payment_status:
      refundAmount >= order.total_amount ? "refunded" : "partially_refunded",
    updated_at: new Date().toISOString(),
  });
  return clone(refund);
}

/* -------------------------------------------------------------------------- */
/* SHIPPING                                                                    */
/* -------------------------------------------------------------------------- */

export async function listShipments(
  params: { status?: Shipment["status"] } = {},
): Promise<Shipment[]> {
  await tick();
  requirePermission("shipping.manage_shipment");
  let list = get("shipments").slice();
  if (params.status) list = list.filter((s) => s.status === params.status);
  return clone(list.sort((a, b) => b.created_at.localeCompare(a.created_at)));
}

export async function getShipment(id: string): Promise<Shipment | null> {
  await tick();
  requirePermission("shipping.manage_shipment");
  return clone(get("shipments").find((s) => s.id === id) ?? null);
}

export async function createShipment(
  orderId: string,
  courier: Courier = "delhivery",
  weightKg = 0.5,
): Promise<Shipment> {
  await tick(true);
  requirePermission("shipping.manage_shipment");
  // TODO(backend): fetch("/shipping/staff/shipments/", { method:"POST", ... }) — books Shiprocket
  const order = get("orders").find((o) => o.id === orderId);
  if (!order) throw new ApiError("Order not found", 404);
  if (order.status !== "processing")
    throw new ApiError("Order must be in processing to create a shipment");
  const now = new Date().toISOString();
  const awb = `${courier.slice(0, 2).toUpperCase()}${Math.floor(1e9 + Math.random() * 8e9)}`;
  const shipment: Shipment = {
    id: newId(),
    order_id: order.id,
    order_number: order.order_number,
    shiprocket_order_id: `SR${Math.floor(100000 + Math.random() * 899999)}`,
    shiprocket_shipment_id: `SRS${Math.floor(100000 + Math.random() * 899999)}`,
    courier,
    awb,
    status: "booked",
    tracking_url: `https://track.example.com/${awb}`,
    estimated_delivery: new Date(Date.now() + 5 * 86_400_000).toISOString(),
    delivered_at: null,
    weight_kg: weightKg,
    events: [
      { id: newId(), status: "booked", description: "Shipment booked with Shiprocket", location: order.shipping_address.city, timestamp: now },
    ],
    created_at: now,
    updated_at: now,
  };
  set("shipments", [shipment, ...get("shipments")]);
  // Booking a shipment advances the order to shipped.
  writeOrder({ ...order, status: "shipped", updated_at: now });
  return clone(shipment);
}

function writeShipment(next: Shipment): Shipment {
  const list = get("shipments");
  const i = list.findIndex((s) => s.id === next.id);
  const copy = list.slice();
  copy[i] = { ...next, updated_at: new Date().toISOString() };
  set("shipments", copy);
  return copy[i];
}

const SYNC_NEXT: Record<string, Shipment["status"]> = {
  booked: "picked_up",
  picked_up: "in_transit",
  in_transit: "out_for_delivery",
  out_for_delivery: "delivered",
};

export async function syncShipment(id: string): Promise<Shipment> {
  await tick(true);
  requirePermission("shipping.manage_shipment");
  // TODO(backend): fetch(`/shipping/staff/shipments/${id}/sync/`, { method:"POST" })
  const s = get("shipments").find((x) => x.id === id);
  if (!s) throw new ApiError("Shipment not found", 404);
  const next = SYNC_NEXT[s.status];
  if (!next) throw new ApiError("Nothing to sync — shipment is in a terminal state");
  const now = new Date().toISOString();
  const event: ShipmentEvent = {
    id: newId(),
    status: next,
    description: `Status updated to ${next.replace(/_/g, " ")}`,
    location: "In network",
    timestamp: now,
  };
  const updated = writeShipment({
    ...s,
    status: next,
    delivered_at: next === "delivered" ? now : s.delivered_at,
    events: [...s.events, event],
  });
  // Delivered shipment advances the order.
  if (next === "delivered") {
    const order = get("orders").find((o) => o.id === s.order_id);
    if (order && order.status === "shipped")
      writeOrder({ ...order, status: "delivered", updated_at: now });
  }
  return clone(updated);
}

export async function cancelShipment(id: string): Promise<Shipment> {
  await tick(true);
  requirePermission("shipping.manage_shipment");
  const s = get("shipments").find((x) => x.id === id);
  if (!s) throw new ApiError("Shipment not found", 404);
  if (["in_transit", "out_for_delivery", "delivered"].includes(s.status))
    throw new ApiError(`Cannot cancel a shipment that is "${s.status}"`);
  const now = new Date().toISOString();
  return clone(
    writeShipment({
      ...s,
      status: "failed",
      events: [
        ...s.events,
        { id: newId(), status: "failed", description: "Cancelled by staff", location: "", timestamp: now },
      ],
    }),
  );
}

/* -------------------------------------------------------------------------- */
/* STAFF & ROLES                                                               */
/* -------------------------------------------------------------------------- */

export async function listRoles() {
  await tick();
  session(); // any authenticated staff
  return clone(get("roles"));
}

export async function listStaff(): Promise<StaffUser[]> {
  await tick();
  requirePermission("accounts.manage_staff");
  return clone(get("staff"));
}

export async function getStaff(id: string): Promise<StaffUser | null> {
  await tick();
  requirePermission("accounts.manage_staff");
  return clone(get("staff").find((s) => s.id === id) ?? null);
}

export interface StaffCreateInput {
  email: string;
  password: string;
  first_name?: string;
  last_name?: string;
  role_id: string;
}

export async function createStaff(input: StaffCreateInput): Promise<StaffUser> {
  await tick(true);
  requirePermission("accounts.manage_staff");
  const role = get("roles").find((r) => r.id === input.role_id);
  if (!role) throw new ApiError("Role doesn't belong to this tenant");
  if (get("staff").some((s) => s.email.toLowerCase() === input.email.trim().toLowerCase()))
    throw new ApiError("A staff user with this email already exists");
  const staff: StaffUser = {
    id: newId(),
    email: input.email,
    first_name: input.first_name ?? "",
    last_name: input.last_name ?? "",
    role,
    is_active: true,
    created_at: new Date().toISOString(),
  };
  set("staff", [...get("staff"), staff]);
  return clone(staff);
}

export async function updateStaffRole(
  id: string,
  roleId: string,
): Promise<StaffUser> {
  await tick(true);
  requirePermission("accounts.manage_staff");
  const role = get("roles").find((r) => r.id === roleId);
  if (!role) throw new ApiError("Role doesn't belong to this tenant");
  const staff = get("staff");
  const i = staff.findIndex((s) => s.id === id);
  if (i === -1) throw new ApiError("Staff user not found", 404);
  const updated = { ...staff[i], role };
  const next = staff.slice();
  next[i] = updated;
  set("staff", next);
  return clone(updated);
}

/* -------------------------------------------------------------------------- */
/* AUTH                                                                        */
/* -------------------------------------------------------------------------- */

function fakeJwt(email: string, tenant: string): string {
  // Mock token — NOT a real JWT. The real backend issues simplejwt tokens.
  const payload = btoa(JSON.stringify({ email, tenant_id: tenant, iat: Date.now() }));
  return `mock.${payload}.sig`;
}

export async function login(
  email: string,
  password: string,
): Promise<StaffUser> {
  await tick();
  // TODO(backend): fetch("/staff/auth/login/", { method:"POST", ... })
  const staff = get("staff").find(
    (s) => s.email.toLowerCase() === email.trim().toLowerCase(),
  );
  if (!staff || !staff.is_active || password !== ADMIN_PASSWORD) {
    throw new ApiError("Invalid credentials, or user belongs to a different tenant", 401);
  }
  const tenant = DEFAULT_TENANT_ID;
  const stored: StoredSession = {
    staff,
    tokens: { access: fakeJwt(staff.email, tenant), refresh: fakeJwt(staff.email, tenant) },
    tenant_id: tenant,
  };
  setStoredSession(stored);
  return clone(staff);
}

export async function logout(): Promise<void> {
  await tick();
  setStoredSession(null);
}

export async function getSession(): Promise<StoredSession | null> {
  await tick();
  // TODO(backend): validate the stored access token against the API.
  return clone(getStoredSession());
}

/* -------------------------------------------------------------------------- */
/* DASHBOARD + CUSTOMERS (client-derived — no backend endpoint yet)           */
/* -------------------------------------------------------------------------- */

export async function getStats(): Promise<DashboardStats> {
  await tick();
  requirePermission("orders.view_order");
  // TODO(backend): no /stats endpoint exists — derive from products/orders/returns,
  // or request an aggregate endpoint from the backend team.
  const products = get("products").filter((p) => p.status !== "archived");
  const orders = get("orders");
  const returns = get("returns");

  const active = products.filter((p) => p.status === "active" || p.status === "out_of_stock");
  const low_stock_count = active.filter((p) => stockLevel(p.qty) !== "healthy").length;

  const orders_by_status = {} as Record<OrderStatus, number>;
  (["pending", "paid", "processing", "shipped", "delivered", "cancelled", "returned", "refunded"] as OrderStatus[]).forEach(
    (s) => (orders_by_status[s] = orders.filter((o) => o.status === s).length),
  );

  const orders_needing_action =
    orders_by_status.pending + orders_by_status.paid + orders_by_status.processing;
  const revenue = orders
    .filter((o) => !["cancelled", "refunded"].includes(o.status))
    .reduce((s, o) => s + o.total_amount, 0);
  const pending_returns = returns.filter((r) =>
    ["requested", "approved", "received"].includes(r.status),
  ).length;

  const recent_orders = orders
    .slice()
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 6);

  return clone({
    product_count: products.filter((p) => p.status === "active").length,
    low_stock_count,
    orders_needing_action,
    revenue,
    orders_by_status,
    pending_returns,
    recent_orders,
  });
}

export async function listCustomers(
  params: { search?: string } = {},
): Promise<Customer[]> {
  await tick();
  requirePermission("orders.view_order");
  // TODO(backend): no staff customer endpoint — derived from orders here.
  const byEmail = new Map<string, Order[]>();
  for (const o of get("orders")) {
    const k = o.customer_email.toLowerCase();
    byEmail.set(k, [...(byEmail.get(k) ?? []), o]);
  }
  let customers: Customer[] = [...byEmail.entries()].map(([email, orders]) => {
    const sorted = orders.slice().sort((a, b) => a.created_at.localeCompare(b.created_at));
    const latest = sorted[sorted.length - 1];
    const seen = new Set<string>();
    const addresses = sorted
      .map((o) => o.shipping_address)
      .filter((a) => {
        const key = `${a.line1}|${a.city}|${a.pincode}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    return {
      email: latest.customer_email,
      name: latest.customer_name ?? latest.shipping_address.full_name,
      phone: latest.shipping_address.phone,
      order_count: sorted.length,
      total_spent: sorted
        .filter((o) => !["cancelled", "refunded"].includes(o.status))
        .reduce((s, o) => s + o.total_amount, 0),
      last_order_date: latest.created_at,
      first_order_date: sorted[0].created_at,
      addresses,
    };
  });
  const q = params.search?.trim().toLowerCase();
  if (q)
    customers = customers.filter(
      (c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q),
    );
  customers.sort((a, b) => (b.last_order_date ?? "").localeCompare(a.last_order_date ?? ""));
  return clone(customers);
}

export async function getCustomer(
  email: string,
): Promise<{ customer: Customer; orders: Order[] } | null> {
  await tick();
  requirePermission("orders.view_order");
  const key = email.toLowerCase();
  const orders = get("orders")
    .filter((o) => o.customer_email.toLowerCase() === key)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  if (!orders.length) return null;
  const [customer] = await listCustomers({ search: email });
  const match = customer && customer.email.toLowerCase() === key
    ? customer
    : (await listCustomers()).find((c) => c.email.toLowerCase() === key);
  if (!match) return null;
  return clone({ customer: match, orders });
}

/* -------------------------------------------------------------------------- */
/* Misc re-exports                                                            */
/* -------------------------------------------------------------------------- */

export { resetDemoData };
export { primaryImageKey };
