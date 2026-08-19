/**
 * Data contract — mirrors the SOIS Staff/Back-office API (admin-api.yaml).
 * These are the exact shapes the backend returns/accepts, so the seam swap in
 * `admin-api.ts` is body-only. Response envelope: { success, data, meta? }.
 */

/* -------------------------------------------------------------------------- */
/* Enums                                                                      */
/* -------------------------------------------------------------------------- */

export type MetalType =
  | "silver"
  | "gold"
  | "gold_plated"
  | "rose_gold"
  | "antique"
  | "other";

export type ProductStatus = "draft" | "active" | "out_of_stock" | "archived";
export type StockType = "unique" | "quantity";

export type OrderStatus =
  | "pending"
  | "paid"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "returned"
  | "refunded";

export type ReturnStatus =
  | "requested"
  | "approved"
  | "rejected"
  | "shipped_back"
  | "received"
  | "inspected"
  | "rejected_inspection"
  | "refund_initiated"
  | "completed";

export type ReturnReason =
  | "damaged"
  | "wrong_item"
  | "not_as_desc"
  | "changed_mind"
  | "other";

export type PaymentStatus =
  | "created"
  | "authorized"
  | "captured"
  | "failed"
  | "refunded"
  | "partially_refunded";

export type RefundStatus = "initiated" | "processed" | "failed";

/**
 * `pending`   — Shiprocket order created but no AWB yet (retry assign-awb)
 * `booked`    — AWB assigned, label exists, parcel not yet collected
 * `cancelled` — booking withdrawn; the order can be re-booked elsewhere
 */
export type ShipmentStatus =
  | "pending"
  | "booked"
  | "picked_up"
  | "in_transit"
  | "out_for_delivery"
  | "delivered"
  | "failed"
  | "returned"
  | "cancelled";

/**
 * Coarse courier family, for filtering and badges only. The courier actually
 * chosen off the Shiprocket rate card lives in `Shipment.courier_name` —
 * Shiprocket exposes ~170 services, so anything unnamed here lands on "other".
 * Use `courierLabel()` for display.
 */
export type Courier = "bluedart" | "delhivery" | "dtdc" | "other";

export type PurchaseOrderStatus =
  | "draft"
  | "ordered"
  | "partial"
  | "received"
  | "cancelled";

export type StockLedgerReason =
  | "purchase"
  | "sale"
  | "return"
  | "adjustment"
  | "damage";

export type MediaType = "image" | "video" | "certificate";

/* -------------------------------------------------------------------------- */
/* Auth / staff / RBAC                                                        */
/* -------------------------------------------------------------------------- */

export interface TokenPair {
  access: string;
  refresh: string;
}

export interface Permission {
  codename: string; // e.g. "catalog.add_product"
  description: string;
}

export interface Role {
  id: string;
  name: string;
  is_system_role: boolean;
  permissions: Permission[];
  created_at: string;
}

export interface StaffUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: Role;
  is_active: boolean;
  created_at: string;
}

/* -------------------------------------------------------------------------- */
/* Catalog                                                                    */
/* -------------------------------------------------------------------------- */

export interface Category {
  id: string;
  name: string;
  slug: string;
  parent: string | null; // parent category id
  description: string;
  image_key: string; // S3 object key
  /** Presigned GET URL for image_key (real backend); null if S3 unset. */
  image_url?: string | null;
  is_active: boolean;
  sort_order: number;
}

export interface Collection {
  id: string;
  name: string;
  slug: string;
  description: string;
  banner_image_key: string;
  is_active: boolean;
  sort_order: number;
}

export interface ProductMedia {
  id: string;
  media_type: MediaType;
  s3_key: string;
  /** Presigned GET URL for direct <img> use (real backend); null if S3 unset. */
  view_url?: string | null;
  file_name: string;
  mime_type: string;
  alt_text: string;
  sort_order: number;
  is_primary: boolean;
}

export interface StoneDetail {
  type: string;
  weight: string;
  quality: string;
  count: number;
}

/**
 * One product variation (WooCommerce-style) — a single variant value with its
 * own SKU, price, weight and stock. `size` holds the variant value (a ring size,
 * a chain length, a bangle diameter); the axis is named by `variant_label`.
 */
export interface ProductSizeStock {
  size: string;
  /** Variation SKU; "" when not set. */
  sku: string;
  /** Price override for this variation; null ⇒ inherit the product price. */
  price: number | null;
  /** This variation's price after discount (override or product price). */
  effective_price: number;
  /** Metal weight in grams for this variation; null when not measured. */
  net_weight: number | null;
  /** Inactive variations are hidden from the storefront. */
  is_active: boolean;
  qty: number;
  is_in_stock: boolean;
}

export interface ProductList {
  id: string;
  sku: string;
  name: string;
  slug: string;
  category_name: string | null;
  collection_name: string | null;
  price: number;
  discount_percent: number;
  effective_price: number;
  metal_type: MetalType;
  purity: string;
  stock_type: StockType;
  qty: number;
  is_in_stock: boolean;
  /** Comma-separated available sizes (rings/bangles); "" for unsized products. */
  available_sizes: string;
  /** Name of the variant axis ("Ring Size", "Length"); "" ⇒ UI shows "Size". */
  variant_label: string;
  /** True when the product is offered in discrete sizes. */
  has_sizes: boolean;
  status: ProductStatus;
  is_featured: boolean;
  thumbnail_key: string;
  /** Presigned GET URL for thumbnail_key (real backend); null if S3 unset. */
  thumbnail_url?: string | null;
  primary_image: { s3_key: string; view_url?: string | null; alt_text: string } | null;
  created_at: string;
}

export interface ProductDetail {
  id: string;
  sku: string;
  name: string;
  slug: string;
  description: string;
  category: Category | null;
  collection: Collection | null;
  price: number;
  discount_percent: number;
  effective_price: number;
  stock_type: StockType;
  qty: number;
  is_in_stock: boolean;
  status: ProductStatus;
  metal_type: MetalType;
  purity: string;
  gross_weight: number | null;
  net_weight: number | null;
  /** Physical dimensions in millimetres; null when not measured. */
  length_mm: number | null;
  width_mm: number | null;
  height_mm: number | null;
  stone_details: StoneDetail[];
  certificate_details: Record<string, string>;
  available_sizes: string;
  size_unit: string;
  /** Name of the variant axis ("Ring Size", "Length"); "" ⇒ UI shows "Size". */
  variant_label: string;
  /** True when the product is offered in discrete sizes (rings, bangles). */
  has_sizes: boolean;
  /** Per-variation breakdown (SKU/price/weight/stock); empty for unsized. */
  size_stock: ProductSizeStock[];
  care_instruction: string;
  is_featured: boolean;
  tags: string[];
  thumbnail_key: string;
  /** Presigned GET URL for thumbnail_key (real backend); null if S3 unset. */
  thumbnail_url?: string | null;
  media: ProductMedia[];
  created_at: string;
  updated_at: string;
}

export interface Review {
  id: string;
  product: string; // product id
  product_name?: string;
  rating: number; // 1–5
  title: string;
  body: string;
  customer_name: string;
  is_approved: boolean;
  created_at: string;
}

/* -------------------------------------------------------------------------- */
/* Inventory                                                                  */
/* -------------------------------------------------------------------------- */

export interface Supplier {
  id: string;
  name: string;
  contact_name: string;
  phone: string;
  email: string;
  address: string;
  gstin: string;
  notes: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrderItem {
  id: string;
  product_id: string;
  product_sku: string;
  product_name: string;
  /** Size this line restocks for sized products; "" for unsized products. */
  size: string;
  qty_ordered: number;
  qty_received: number;
  qty_pending: number;
  unit_cost: number;
  total_cost: number;
  is_fully_received: boolean;
}

export interface PurchaseOrder {
  id: string;
  po_number: string; // "PO-2024-0001"
  supplier: string; // supplier id
  supplier_name: string;
  status: PurchaseOrderStatus;
  order_date: string | null;
  expected_delivery_date: string | null;
  received_date: string | null;
  subtotal: number;
  tax_amount: number;
  shipping_cost: number;
  total_amount: number;
  notes: string;
  items: PurchaseOrderItem[];
  created_at: string;
  updated_at: string;
}

export interface StockLedgerEntry {
  id: string;
  product_id: string;
  product_sku: string;
  /** Size this movement applies to for sized products; "" for whole-product. */
  size: string;
  reason: StockLedgerReason;
  change_qty: number; // + in / - out
  balance_after: number;
  reference_type: string;
  reference_id: string | null;
  note: string;
  actor_email: string;
  timestamp: string;
}

export interface StockValuationRow {
  id: string;
  sku: string;
  name: string;
  metal_type: MetalType;
  qty: number;
  last_unit_cost: number | null;
}

/* -------------------------------------------------------------------------- */
/* Orders                                                                     */
/* -------------------------------------------------------------------------- */

export interface Address {
  id: string;
  full_name: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  is_default: boolean;
}

export interface OrderItem {
  id: string;
  product_id: string;
  product_sku: string;
  product_name: string;
  metal_type: string;
  purity: string;
  gross_weight: number | null;
  thumbnail_key: string;
  quantity: number;
  selected_size: string;
  unit_price: number;
  discount_percent: number;
  line_total: number;
  is_reviewed: boolean;
}

export interface Order {
  id: string;
  order_number: string;
  customer_email: string;
  customer_name?: string; // convenience for staff UI (from shipping address)
  status: OrderStatus;
  /**
   * Latest payment attempt for the order, or `null` when none exists yet
   * (order created but never taken to Razorpay, or auto-cancelled on the
   * payment-window sweep). The real backend derives this from the Payment
   * table and returns null for such orders, so every consumer must handle it.
   */
  payment_status: PaymentStatus | null;
  shipping_address: Address;
  subtotal: number;
  discount_amount: number;
  shipping_charge: number;
  tax_amount: number;
  total_amount: number;
  notes: string;
  razorpay_order_id: string;
  items: OrderItem[];
  created_at: string;
  updated_at: string;
}

/* -------------------------------------------------------------------------- */
/* Returns                                                                    */
/* -------------------------------------------------------------------------- */

export interface ReturnMedia {
  id: string;
  media_type: "image" | "video";
  s3_key: string;
  file_name: string;
  mime_type: string;
  file_size: number | null;
  uploaded_at: string;
}

export interface Return {
  id: string;
  order_id: string;
  order_number: string;
  status: ReturnStatus;
  reason: ReturnReason;
  customer_note: string;
  staff_note: string;
  rejection_reason: string;
  return_shipment_awb: string;
  return_shipment_courier: string;
  return_tracking_url: string;
  inspection_note: string;
  inspected_at: string | null;
  refund_id: string | null;
  media: ReturnMedia[];
  created_at: string;
  updated_at: string;
}

/* -------------------------------------------------------------------------- */
/* Payments                                                                   */
/* -------------------------------------------------------------------------- */

export interface Refund {
  id: string;
  order_id: string;
  razorpay_refund_id: string;
  amount: number;
  reason: string;
  status: RefundStatus;
  created_at: string;
}

/* -------------------------------------------------------------------------- */
/* Shipping                                                                   */
/* -------------------------------------------------------------------------- */

export interface ShipmentEvent {
  id: string;
  status: string;
  description: string;
  location: string;
  timestamp: string;
}

export interface Shipment {
  id: string;
  order_id: string;
  order_number: string;
  shiprocket_order_id: string;
  shiprocket_shipment_id: string;
  courier: Courier;
  /** Shiprocket courier_company_id chosen from the rate card. */
  courier_id: string;
  /** Rate-card display name, e.g. "Delhivery Surface". Prefer this in the UI. */
  courier_name: string;
  awb: string;
  status: ShipmentStatus;
  tracking_url: string;
  estimated_delivery: string | null;
  delivered_at: string | null;
  weight_kg: number | null;
  length_cm: number | null;
  breadth_cm: number | null;
  height_cm: number | null;
  /** Rate quoted for the chosen courier at booking time (audit trail). */
  freight_charge: number | null;
  pickup_scheduled_at: string | null;
  pickup_token: string;
  /** Courier shipping-label PDF; "" until generated. */
  label_url: string;
  /** Handover manifest PDF; "" until generated. */
  manifest_url: string;
  /** Last tracking refresh, by webhook or polling; null if never. */
  last_synced_at: string | null;
  events: ShipmentEvent[];
  created_at: string;
  updated_at: string;
}

/**
 * One row of the Shiprocket serviceability rate card. The components are
 * broken out so staff can see why one courier costs more, and
 * `extra_over_cheapest` makes the trade-off explicit.
 *
 * Shiprocket quotes net of tax, so `rate` (freight + COD) is *not* what the
 * booking costs — `rate_with_gst` is. Display and compare on that one;
 * `extra_over_cheapest` is already tax-inclusive to match.
 */
export interface CourierRate {
  courier_id: string;
  courier_name: string;
  courier: Courier;
  /** Shiprocket's pre-tax charge: freight + COD. */
  rate: number;
  freight_charge: number;
  cod_charges: number;
  other_charges: number;
  /** GST percentage applied on top of `rate` (SHIPROCKET_GST_RATE); 0 disables. */
  gst_rate: number;
  gst_amount: number;
  /** `rate` + GST — what the Shiprocket wallet is actually debited. */
  rate_with_gst: number;
  /** Days in transit as reported by the courier; "" when not given. */
  estimated_delivery_days: string;
  /** Courier-formatted delivery date; "" when not given. */
  etd: string;
  /** Shiprocket performance rating, 0–5. */
  rating: number;
  is_surface: boolean;
  call_before_delivery: string;
  is_recommended: boolean;
  extra_over_cheapest: number;
  is_cheapest: boolean;
  is_fastest: boolean;
}

/* -------------------------------------------------------------------------- */
/* Notifications                                                              */
/* -------------------------------------------------------------------------- */

export type NotificationChannel = "whatsapp" | "email";
export type NotificationStatus = "pending" | "sent" | "failed";

export type NotificationEventType =
  | "order_placed"
  | "payment_confirmed"
  | "order_packed"
  | "order_shipped"
  | "out_for_delivery"
  | "order_delivered"
  | "order_cancelled"
  | "shipment_failed"
  | "order_returned"
  | "refund_initiated"
  | "password_reset";

/** One delivery attempt of one transactional message on one channel. */
export interface NotificationLog {
  id: string;
  channel: NotificationChannel;
  event_type: NotificationEventType;
  recipient_email: string;
  recipient_phone: string;
  order_id: string | null;
  order_number: string;
  status: NotificationStatus;
  /** The provider's own error text when `status` is "failed". */
  error: string;
  provider_message_id: string;
  sent_at: string | null;
  created_at: string;
}

/* -------------------------------------------------------------------------- */
/* Derived / UI-only (no backend endpoint yet — see admin-api TODOs)          */
/* -------------------------------------------------------------------------- */

export interface Customer {
  email: string;
  name: string;
  phone: string;
  order_count: number;
  total_spent: number;
  last_order_date: string | null;
  addresses: Address[];
  first_order_date: string;
}

export interface DashboardStats {
  product_count: number;
  low_stock_count: number;
  orders_needing_action: number;
  revenue: number;
  orders_by_status: Record<OrderStatus, number>;
  pending_returns: number;
  recent_orders: Order[];
}

export interface PageMeta {
  total: number;
  page: number;
  page_size: number;
}

/* -------------------------------------------------------------------------- */
/* Enum label + option helpers                                                */
/* -------------------------------------------------------------------------- */

export const METAL_TYPES: MetalType[] = [
  "silver",
  "gold",
  "gold_plated",
  "rose_gold",
  "antique",
  "other",
];

export const METAL_LABEL: Record<MetalType, string> = {
  silver: "Silver",
  gold: "Gold",
  gold_plated: "Gold Plated",
  rose_gold: "Rose Gold",
  antique: "Antique",
  other: "Other",
};

export const PRODUCT_STATUSES: ProductStatus[] = [
  "draft",
  "active",
  "out_of_stock",
  "archived",
];

export const ORDER_STATUSES: OrderStatus[] = [
  "pending",
  "paid",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
  "returned",
  "refunded",
];

/** Forward fulfilment flow used to render an order progress timeline. */
export const ORDER_FLOW: OrderStatus[] = [
  "pending",
  "paid",
  "processing",
  "shipped",
  "delivered",
];

/** Allowed status transitions from the order state machine (admin-api.yaml). */
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ["paid", "cancelled"],
  paid: ["processing", "cancelled"],
  processing: ["shipped", "cancelled"],
  // "returned" covers a courier RTO — the parcel comes back without ever
  // being delivered. Normally driven by the Shiprocket webhook, but staff can
  // record it by hand when tracking is stuck.
  shipped: ["delivered", "returned"],
  delivered: ["returned"],
  cancelled: [],
  returned: ["refunded"],
  refunded: [],
};

export const RETURN_STATUSES: ReturnStatus[] = [
  "requested",
  "approved",
  "rejected",
  "shipped_back",
  "received",
  "inspected",
  "rejected_inspection",
  "refund_initiated",
  "completed",
];

export const RETURN_REASONS: ReturnReason[] = [
  "damaged",
  "wrong_item",
  "not_as_desc",
  "changed_mind",
  "other",
];

export const RETURN_REASON_LABEL: Record<ReturnReason, string> = {
  damaged: "Damaged",
  wrong_item: "Wrong item",
  not_as_desc: "Not as described",
  changed_mind: "Changed mind",
  other: "Other",
};

export const SHIPMENT_STATUSES: ShipmentStatus[] = [
  "pending",
  "booked",
  "picked_up",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "failed",
  "returned",
  "cancelled",
];

export const COURIERS: Courier[] = ["bluedart", "delhivery", "dtdc", "other"];
export const COURIER_LABEL: Record<Courier, string> = {
  bluedart: "BlueDart",
  delhivery: "Delhivery",
  dtdc: "DTDC",
  other: "Other",
};

/**
 * How to name a courier on screen. The Shiprocket service name is the honest
 * answer ("Delhivery Surface 10kg" is not the same product as "Delhivery
 * Air"); the family enum is only a fallback for rows booked before we started
 * recording it.
 */
export function courierLabel(
  s: Pick<Shipment, "courier" | "courier_name">,
): string {
  return s.courier_name || COURIER_LABEL[s.courier] || "Courier";
}

export const NOTIFICATION_EVENT_LABEL: Record<NotificationEventType, string> = {
  order_placed: "Order placed",
  payment_confirmed: "Payment confirmed",
  order_packed: "Order packed",
  order_shipped: "Order shipped",
  out_for_delivery: "Out for delivery",
  order_delivered: "Order delivered",
  order_cancelled: "Order cancelled",
  shipment_failed: "Delivery attempt failed",
  order_returned: "Returned to origin",
  refund_initiated: "Refund initiated",
  password_reset: "Password reset",
};

export const PO_STATUSES: PurchaseOrderStatus[] = [
  "draft",
  "ordered",
  "partial",
  "received",
  "cancelled",
];

export const STOCK_TYPES: StockType[] = ["unique", "quantity"];

/**
 * Title-case an enum value for display, e.g. "out_of_stock" → "Out Of Stock".
 * Nullish/empty values render as an em dash rather than throwing — the API can
 * legitimately return null for derived enums (e.g. Order.payment_status).
 */
export function titleCase(value: string | null | undefined): string {
  if (!value) return "—";
  return String(value)
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
