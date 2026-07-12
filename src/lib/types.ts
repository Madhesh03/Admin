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

export type ShipmentStatus =
  | "pending"
  | "booked"
  | "picked_up"
  | "in_transit"
  | "out_for_delivery"
  | "delivered"
  | "failed"
  | "returned";

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
  status: ProductStatus;
  is_featured: boolean;
  thumbnail_key: string;
  primary_image: { s3_key: string; alt_text: string } | null;
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
  stone_details: StoneDetail[];
  certificate_details: Record<string, string>;
  available_sizes: string;
  size_unit: string;
  care_instruction: string;
  is_featured: boolean;
  tags: string[];
  thumbnail_key: string;
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
  payment_status: PaymentStatus;
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
  awb: string;
  status: ShipmentStatus;
  tracking_url: string;
  estimated_delivery: string | null;
  delivered_at: string | null;
  weight_kg: number | null;
  events: ShipmentEvent[];
  created_at: string;
  updated_at: string;
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
  shipped: ["delivered"],
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
];

export const COURIERS: Courier[] = ["bluedart", "delhivery", "dtdc", "other"];
export const COURIER_LABEL: Record<Courier, string> = {
  bluedart: "BlueDart",
  delhivery: "Delhivery",
  dtdc: "DTDC",
  other: "Other",
};

export const PO_STATUSES: PurchaseOrderStatus[] = [
  "draft",
  "ordered",
  "partial",
  "received",
  "cancelled",
];

export const STOCK_TYPES: StockType[] = ["unique", "quantity"];

/** Title-case an enum value for display, e.g. "out_of_stock" → "Out Of Stock". */
export function titleCase(value: string): string {
  return value
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
