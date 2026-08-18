/**
 * ============================================================================
 *  admin-api.real.ts — THE SEAM, wired to the SOIS Django/DRF backend
 * ============================================================================
 * Mirrors every function exported by `admin-api.mock.ts` 1:1, but each body is
 * a real HTTP call through `http.ts`, which handles the {success,data,meta}
 * envelope, Bearer auth, X-Tenant-ID scoping and access-token refresh.
 *
 * Route map (config/urls.py):
 *   auth/staff   → /staff/auth/*, /staff/users, /staff/roles, /staff/dashboard, /staff/customers
 *   catalog      → /catalog/staff/*
 *   inventory    → /inventory/*
 *   orders       → /orders/staff/*   (+ /orders/staff/returns/*)
 *   payments     → /payments/staff/*
 *   shipping     → /shipping/staff/*
 *
 * RBAC/tenancy are enforced server-side; unlike the mock we do not pre-check
 * permissions here — a 403 surfaces as an ApiError from http.ts.
 */
import {
  apiDelete,
  apiGet,
  apiGetEnvelope,
  apiGetList,
  apiPatch,
  apiPost,
  readSession,
  writeSession,
  type Page,
} from "./http";
import { primaryImageKey } from "./derive";
import type { StoredSession } from "./mock-data";
import type {
  Category,
  Collection,
  Courier,
  Customer,
  DashboardStats,
  Order,
  OrderStatus,
  ProductDetail,
  ProductList,
  ProductMedia,
  PurchaseOrder,
  Refund,
  Return,
  Review,
  Role,
  Shipment,
  StaffUser,
  StockLedgerEntry,
  StockValuationRow,
  Supplier,
} from "./types";
// Input DTOs live in the mock module (single source of truth for the seam
// contract). These are type-only imports — erased at compile time, so no mock
// runtime/seed code is pulled into the real bundle.
import type {
  BulkUpdateProductsInput,
  CategoryImagePresignInput,
  CategoryInput,
  CollectionInput,
  ConfirmCategoryImageInput,
  ConfirmMediaInput,
  ListOrdersParams,
  ListProductsParams,
  ListReturnsParams,
  NameCheckResult,
  PresignInput,
  ProductWriteInput,
  PurchaseOrderCreateInput,
  StaffCreateInput,
  SupplierInput,
} from "./admin-api.mock";

/** Drop "all"/empty sentinel values so we don't send them as real filters. */
const filter = (v?: string) => (v && v !== "all" ? v : undefined);

/* -------------------------------------------------------------------------- */
/* PRODUCTS                                                                    */
/* -------------------------------------------------------------------------- */

export function listProducts(
  params: ListProductsParams = {},
): Promise<Page<ProductList>> {
  return apiGetList<ProductList>("/catalog/staff/products/", {
    q: params.q,
    category: filter(params.category),
    metal_type: filter(params.metal_type),
    status: filter(params.status),
    ordering: params.ordering,
    page: params.page,
    page_size: params.page_size,
  });
}

export async function getProduct(id: string): Promise<ProductDetail | null> {
  try {
    return await apiGet<ProductDetail>(`/catalog/staff/products/${id}/`);
  } catch (e) {
    return notFoundToNull(e);
  }
}

export function createProduct(input: ProductWriteInput): Promise<ProductDetail> {
  return apiPost<ProductDetail>("/catalog/staff/products/", input);
}

export function updateProduct(
  id: string,
  patch: Partial<ProductWriteInput>,
): Promise<ProductDetail> {
  return apiPatch<ProductDetail>(`/catalog/staff/products/${id}/`, patch);
}

export function bulkUpdateProducts(
  input: BulkUpdateProductsInput,
): Promise<{ updated: number }> {
  return apiPost<{ updated: number }>(
    "/catalog/staff/products/bulk-update/",
    input,
  );
}

export function archiveProduct(id: string): Promise<void> {
  return apiDelete(`/catalog/staff/products/${id}/`);
}

export function checkProductName(
  name: string,
  excludeId?: string,
): Promise<NameCheckResult> {
  return apiGet<NameCheckResult>("/catalog/staff/products/check-name/", {
    name,
    exclude_id: excludeId,
  });
}

/* -------- Media ---------------------------------------------------------- */

export function presignMedia(input: PresignInput): Promise<{
  presigned_url: string;
  s3_key: string;
  expires_in: number;
}> {
  return apiPost("/catalog/staff/media/presign/", input);
}

export function confirmMedia(input: ConfirmMediaInput): Promise<ProductMedia> {
  return apiPost<ProductMedia>("/catalog/staff/media/confirm/", input);
}

export function deleteMedia(mediaId: string): Promise<void> {
  return apiDelete(`/catalog/staff/media/${mediaId}/`);
}

/* -------------------------------------------------------------------------- */
/* CATEGORIES                                                                  */
/* -------------------------------------------------------------------------- */

export function listCategories(): Promise<Category[]> {
  return apiGet<Category[]>("/catalog/staff/categories/");
}

export function presignCategoryImage(input: CategoryImagePresignInput): Promise<{
  presigned_url: string;
  s3_key: string;
  expires_in: number;
}> {
  return apiPost("/catalog/staff/categories/media/presign/", input);
}

export function confirmCategoryImage(
  input: ConfirmCategoryImageInput,
): Promise<{ image_key: string }> {
  return apiPost("/catalog/staff/categories/media/confirm/", input);
}

export function createCategory(input: CategoryInput): Promise<Category> {
  return apiPost<Category>("/catalog/staff/categories/", input);
}

export function updateCategory(id: string, patch: CategoryInput): Promise<Category> {
  return apiPatch<Category>(`/catalog/staff/categories/${id}/`, patch);
}

/* -------------------------------------------------------------------------- */
/* COLLECTIONS                                                                 */
/* -------------------------------------------------------------------------- */

export function listCollections(): Promise<Collection[]> {
  return apiGet<Collection[]>("/catalog/staff/collections/");
}

export function createCollection(input: CollectionInput): Promise<Collection> {
  return apiPost<Collection>("/catalog/staff/collections/", input);
}

export function updateCollection(
  id: string,
  patch: CollectionInput,
): Promise<Collection> {
  return apiPatch<Collection>(`/catalog/staff/collections/${id}/`, patch);
}

/* -------------------------------------------------------------------------- */
/* REVIEWS                                                                     */
/* -------------------------------------------------------------------------- */

export function listReviews(
  params: { approved?: boolean } = {},
): Promise<Review[]> {
  return apiGet<Review[]>("/catalog/staff/reviews/", {
    approved: params.approved === undefined ? undefined : String(params.approved),
  });
}

export function approveReview(id: string): Promise<Review> {
  return apiPatch<Review>(`/catalog/staff/reviews/${id}/approve/`);
}

/* -------------------------------------------------------------------------- */
/* SUPPLIERS                                                                   */
/* -------------------------------------------------------------------------- */

export function listSuppliers(
  params: { active?: boolean } = {},
): Promise<Supplier[]> {
  return apiGet<Supplier[]>("/inventory/suppliers/", {
    active: params.active === undefined ? undefined : String(params.active),
  });
}

export async function getSupplier(id: string): Promise<Supplier | null> {
  try {
    return await apiGet<Supplier>(`/inventory/suppliers/${id}/`);
  } catch (e) {
    return notFoundToNull(e);
  }
}

export function createSupplier(input: SupplierInput): Promise<Supplier> {
  return apiPost<Supplier>("/inventory/suppliers/", input);
}

export function updateSupplier(id: string, patch: SupplierInput): Promise<Supplier> {
  return apiPatch<Supplier>(`/inventory/suppliers/${id}/`, patch);
}

/* -------------------------------------------------------------------------- */
/* PURCHASE ORDERS                                                             */
/* -------------------------------------------------------------------------- */

export function listPurchaseOrders(
  params: { status?: PurchaseOrder["status"] } = {},
): Promise<PurchaseOrder[]> {
  return apiGet<PurchaseOrder[]>("/inventory/purchase-orders/", {
    status: params.status,
  });
}

export async function getPurchaseOrder(id: string): Promise<PurchaseOrder | null> {
  try {
    return await apiGet<PurchaseOrder>(`/inventory/purchase-orders/${id}/`);
  } catch (e) {
    return notFoundToNull(e);
  }
}

export function createPurchaseOrder(
  input: PurchaseOrderCreateInput,
): Promise<PurchaseOrder> {
  return apiPost<PurchaseOrder>("/inventory/purchase-orders/", input);
}

export function confirmPurchaseOrder(id: string): Promise<PurchaseOrder> {
  return apiPost<PurchaseOrder>(`/inventory/purchase-orders/${id}/confirm/`);
}

export function cancelPurchaseOrder(
  id: string,
  reason?: string,
): Promise<PurchaseOrder> {
  return apiPost<PurchaseOrder>(`/inventory/purchase-orders/${id}/cancel/`, {
    reason,
  });
}

export function receivePurchaseOrder(
  id: string,
  receipts: { purchase_order_item_id: string; qty_received: number }[],
  received_date?: string | null,
): Promise<PurchaseOrder> {
  return apiPost<PurchaseOrder>(`/inventory/purchase-orders/${id}/receive/`, {
    receipts,
    received_date: received_date ?? undefined,
  });
}

/* -------------------------------------------------------------------------- */
/* STOCK                                                                       */
/* -------------------------------------------------------------------------- */

export async function listLowStock(
  threshold = 5,
): Promise<{ items: ProductList[]; threshold: number; count: number }> {
  const env = await apiGetEnvelope<ProductList[]>("/inventory/stock/low/", {
    threshold,
  });
  const items = env.data ?? [];
  return {
    items,
    threshold: Number(env.meta?.threshold ?? threshold),
    count: Number(env.meta?.count ?? items.length),
  };
}

export async function stockValuation(): Promise<{
  rows: StockValuationRow[];
  total_valuation: number;
}> {
  const env = await apiGetEnvelope<StockValuationRow[]>(
    "/inventory/stock/valuation/",
  );
  return {
    rows: env.data ?? [],
    total_valuation: Number(env.meta?.total_valuation ?? 0),
  };
}

export function productLedger(
  productId: string,
  limit = 50,
): Promise<StockLedgerEntry[]> {
  return apiGet<StockLedgerEntry[]>(`/inventory/stock/${productId}/ledger/`, {
    limit,
  });
}

export function adjustStock(
  productId: string,
  newQty: number,
  note: string,
  size = "",
): Promise<StockLedgerEntry> {
  return apiPost<StockLedgerEntry>("/inventory/stock/adjust/", {
    product_id: productId,
    new_qty: newQty,
    note,
    // Only send `size` for a per-size adjustment; blank means whole-product.
    ...(size.trim() ? { size: size.trim() } : {}),
  });
}

/* -------------------------------------------------------------------------- */
/* ORDERS                                                                      */
/* -------------------------------------------------------------------------- */

export function listOrders(params: ListOrdersParams = {}): Promise<Page<Order>> {
  return apiGetList<Order>("/orders/staff/", {
    status: filter(params.status),
    search: params.search,
    from: params.from,
    to: params.to,
    page: params.page,
    page_size: params.page_size,
  });
}

export async function getOrder(id: string): Promise<Order | null> {
  try {
    return await apiGet<Order>(`/orders/staff/${id}/`);
  } catch (e) {
    return notFoundToNull(e);
  }
}

export function updateOrderStatus(
  id: string,
  status: OrderStatus,
  note?: string,
): Promise<Order> {
  return apiPatch<Order>(`/orders/staff/${id}/status/`, { status, note });
}

/* -------------------------------------------------------------------------- */
/* RETURNS                                                                     */
/* -------------------------------------------------------------------------- */

export function listReturns(params: ListReturnsParams = {}): Promise<Page<Return>> {
  return apiGetList<Return>("/orders/staff/returns/", {
    status: params.status,
    reason: params.reason,
    page: params.page,
    page_size: params.page_size,
  });
}

export async function getReturn(id: string): Promise<Return | null> {
  try {
    return await apiGet<Return>(`/orders/staff/returns/${id}/`);
  } catch (e) {
    return notFoundToNull(e);
  }
}

export function approveReturn(id: string, staffNote?: string): Promise<Return> {
  return apiPost<Return>(`/orders/staff/returns/${id}/approve/`, {
    staff_note: staffNote,
  });
}

export function rejectReturn(id: string, rejectionReason: string): Promise<Return> {
  return apiPost<Return>(`/orders/staff/returns/${id}/reject/`, {
    rejection_reason: rejectionReason,
  });
}

export function retryReturnPickup(id: string): Promise<Return> {
  return apiPost<Return>(`/orders/staff/returns/${id}/retry-pickup/`);
}

export function receiveReturn(id: string): Promise<Return> {
  return apiPost<Return>(`/orders/staff/returns/${id}/receive/`);
}

export function inspectReturn(
  id: string,
  passed: boolean,
  inspectionNote?: string,
): Promise<Return> {
  return apiPost<Return>(`/orders/staff/returns/${id}/inspect/`, {
    passed,
    inspection_note: inspectionNote,
  });
}

/* -------------------------------------------------------------------------- */
/* REFUNDS                                                                     */
/* -------------------------------------------------------------------------- */

export function listRefunds(): Promise<Refund[]> {
  return apiGet<Refund[]>("/payments/staff/refunds/");
}

export function initiateRefund(
  orderId: string,
  amount?: number | null,
  reason?: string,
): Promise<Refund> {
  return apiPost<Refund>("/payments/staff/refund/", {
    order_id: orderId,
    amount: amount ?? undefined,
    reason,
  });
}

/* -------------------------------------------------------------------------- */
/* SHIPPING                                                                    */
/* -------------------------------------------------------------------------- */

export function listShipments(
  params: { status?: Shipment["status"] } = {},
): Promise<Shipment[]> {
  return apiGet<Shipment[]>("/shipping/staff/shipments/", {
    status: params.status,
  });
}

export async function getShipment(id: string): Promise<Shipment | null> {
  try {
    return await apiGet<Shipment>(`/shipping/staff/shipments/${id}/`);
  } catch (e) {
    return notFoundToNull(e);
  }
}

export function createShipment(
  orderId: string,
  courier: Courier = "delhivery",
  weightKg = 0.5,
): Promise<Shipment> {
  return apiPost<Shipment>("/shipping/staff/shipments/", {
    order_id: orderId,
    courier,
    weight_kg: weightKg,
  });
}

export function syncShipment(id: string): Promise<Shipment> {
  return apiPost<Shipment>(`/shipping/staff/shipments/${id}/sync/`);
}

export function cancelShipment(id: string): Promise<Shipment> {
  return apiPost<Shipment>(`/shipping/staff/shipments/${id}/cancel/`);
}

/* -------------------------------------------------------------------------- */
/* STAFF & ROLES                                                               */
/* -------------------------------------------------------------------------- */

export function listRoles(): Promise<Role[]> {
  return apiGet<Role[]>("/staff/roles/");
}

export function listStaff(): Promise<StaffUser[]> {
  return apiGet<StaffUser[]>("/staff/users/");
}

export async function getStaff(id: string): Promise<StaffUser | null> {
  try {
    return await apiGet<StaffUser>(`/staff/users/${id}/`);
  } catch (e) {
    return notFoundToNull(e);
  }
}

export function createStaff(input: StaffCreateInput): Promise<StaffUser> {
  return apiPost<StaffUser>("/staff/users/", input);
}

export function updateStaffRole(id: string, roleId: string): Promise<StaffUser> {
  return apiPatch<StaffUser>(`/staff/users/${id}/`, { role_id: roleId });
}

/* -------------------------------------------------------------------------- */
/* AUTH                                                                        */
/* -------------------------------------------------------------------------- */

interface LoginResponse {
  staff: StaffUser;
  tokens: { access: string; refresh: string };
  tenant_id: string | null;
}

export async function login(email: string, password: string): Promise<StaffUser> {
  // Unauthenticated call — tenant resolves server-side via DEFAULT_TENANT_SLUG.
  const data = await apiPost<LoginResponse>(
    "/staff/auth/login/",
    { email, password },
    false,
  );
  const session: StoredSession = {
    staff: data.staff,
    tokens: data.tokens,
    tenant_id: data.tenant_id ?? "",
  };
  writeSession(session);
  return data.staff;
}

export async function logout(): Promise<void> {
  const session = readSession();
  try {
    if (session?.tokens.refresh) {
      await apiPost("/staff/auth/logout/", { refresh: session.tokens.refresh });
    }
  } catch {
    // Best-effort server-side blacklist; always clear the local session below.
  } finally {
    writeSession(null);
  }
}

export async function getSession(): Promise<StoredSession | null> {
  const session = readSession();
  if (!session?.tokens.access) return null;
  // Revalidate against the API; a dead token here triggers refresh in http.ts,
  // and a hard failure clears the session and returns null.
  try {
    const staff = await apiGet<StaffUser>("/staff/auth/me/");
    const fresh: StoredSession = { ...session, staff };
    writeSession(fresh);
    return fresh;
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* DASHBOARD + CUSTOMERS                                                       */
/* -------------------------------------------------------------------------- */

export function getStats(): Promise<DashboardStats> {
  return apiGet<DashboardStats>("/staff/dashboard/stats/");
}

export function listCustomers(
  params: { search?: string } = {},
): Promise<Customer[]> {
  return apiGet<Customer[]>("/staff/customers/", { search: params.search });
}

export async function getCustomer(
  email: string,
): Promise<{ customer: Customer; orders: Order[] } | null> {
  try {
    return await apiGet<{ customer: Customer; orders: Order[] }>(
      `/staff/customers/${encodeURIComponent(email)}/`,
    );
  } catch (e) {
    return notFoundToNull(e);
  }
}

/* -------------------------------------------------------------------------- */
/* Helpers / re-exports                                                        */
/* -------------------------------------------------------------------------- */

/** Map a 404 ApiError to null (detail getters), rethrow anything else. */
function notFoundToNull<T>(e: unknown): T | null {
  if (e && typeof e === "object" && "status" in e && (e as { status: number }).status === 404) {
    return null;
  }
  throw e;
}

// Pure helper, identical to the mock export — pages import it from the seam.
export { primaryImageKey };
