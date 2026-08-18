/**
 * Seed data for the mock store — one coherent tenant's worth of data across
 * every module in admin-api.yaml: staff/roles, catalog, inventory, orders,
 * returns, refunds, shipments. Ids are readable + deterministic so cross-entity
 * references stay stable across reseeds. Media keys hold inline-SVG data URIs so
 * the demo renders offline; the backend swaps them for real S3/CDN URLs.
 */
import { effectivePrice, nextSku, variationSku } from "./derive";
import type { StoredProduct, StoredVariation } from "./internal";
import type {
  Address,
  Category,
  Collection,
  MetalType,
  Order,
  OrderItem,
  OrderStatus,
  PaymentStatus,
  Permission,
  ProductMedia,
  PurchaseOrder,
  PurchaseOrderItem,
  Refund,
  Return,
  ReturnStatus,
  Review,
  Role,
  Shipment,
  StaffUser,
  StockLedgerEntry,
  StoneDetail,
  Supplier,
} from "./types";

/* -------------------------------------------------------------------------- */
/* Placeholder imagery                                                        */
/* -------------------------------------------------------------------------- */

const METAL_GRADIENT: Record<MetalType, [string, string]> = {
  silver: ["#115e59", "#99f6e4"],
  gold: ["#a16207", "#fde68a"],
  gold_plated: ["#b45309", "#fcd34d"],
  rose_gold: ["#9d174d", "#fbcfe8"],
  antique: ["#334155", "#cbd5e1"],
  other: ["#134e4a", "#a7f3d0"],
};

export function placeholderImage(name: string, metal: MetalType, variant = 0) {
  const [c1, c2] = METAL_GRADIENT[metal];
  const angle = 120 + variant * 40;
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
<defs><linearGradient id="g" gradientTransform="rotate(${angle})"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
<rect width="600" height="600" fill="url(#g)"/>
<circle cx="300" cy="255" r="118" fill="none" stroke="#fff" stroke-opacity="0.55" stroke-width="3"/>
<circle cx="300" cy="255" r="150" fill="none" stroke="#fff" stroke-opacity="0.25" stroke-width="1.5"/>
<text x="300" y="450" font-family="Plus Jakarta Sans, sans-serif" font-size="30" font-weight="700" fill="#fff" text-anchor="middle">${esc(
    name,
  )}</text>
<text x="300" y="490" font-family="Plus Jakarta Sans, sans-serif" font-size="16" font-weight="600" letter-spacing="3" fill="#fff" fill-opacity="0.75" text-anchor="middle">SOIS · ${metal.toUpperCase()}</text>
</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function makeMedia(name: string, metal: MetalType, count = 3): ProductMedia[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `med_${slug(name)}_${i}`,
    media_type: "image" as const,
    s3_key: placeholderImage(name, metal, i),
    file_name: `${slug(name)}-${i + 1}.svg`,
    mime_type: "image/svg+xml",
    alt_text: `${name} — view ${i + 1}`,
    sort_order: i,
    is_primary: i === 0,
  }));
}

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const iso = (d: string) => new Date(d).toISOString();

/* -------------------------------------------------------------------------- */
/* Permissions & roles (RBAC)                                                 */
/* -------------------------------------------------------------------------- */

export const PERMISSIONS: Permission[] = [
  { codename: "accounts.manage_staff", description: "Manage staff users & roles" },
  { codename: "catalog.view_product", description: "View products & catalog" },
  { codename: "catalog.add_product", description: "Create products, media, categories, collections" },
  { codename: "catalog.edit_product", description: "Edit catalog & moderate reviews" },
  { codename: "catalog.delete_product", description: "Archive products" },
  { codename: "inventory.view_supplier", description: "View suppliers" },
  { codename: "inventory.manage_supplier", description: "Create & edit suppliers" },
  { codename: "inventory.view_purchase_order", description: "View purchase orders" },
  { codename: "inventory.manage_purchase_order", description: "Create & receive purchase orders" },
  { codename: "inventory.view_stock_ledger", description: "View stock ledger" },
  { codename: "inventory.adjust_stock", description: "Manually adjust stock" },
  { codename: "reports.view_inventory", description: "View inventory reports" },
  { codename: "orders.view_order", description: "View orders & returns" },
  { codename: "orders.update_order_status", description: "Transition orders & returns" },
  { codename: "orders.process_refund", description: "Process refunds" },
  { codename: "shipping.manage_shipment", description: "Manage shipments" },
];

const ALL_CODES = PERMISSIONS.map((p) => p.codename);
const permsFor = (codes: string[]) =>
  PERMISSIONS.filter((p) => codes.includes(p.codename));

const ROLE_CODES: Record<string, string[]> = {
  owner: ALL_CODES,
  store_manager: [
    "catalog.view_product",
    "catalog.add_product",
    "catalog.edit_product",
    "catalog.delete_product",
    "inventory.view_supplier",
    "inventory.view_purchase_order",
    "inventory.view_stock_ledger",
    "reports.view_inventory",
    "orders.view_order",
    "orders.update_order_status",
    "orders.process_refund",
    "shipping.manage_shipment",
  ],
  inventory_staff: [
    "catalog.view_product",
    "inventory.view_supplier",
    "inventory.manage_supplier",
    "inventory.view_purchase_order",
    "inventory.manage_purchase_order",
    "inventory.view_stock_ledger",
    "inventory.adjust_stock",
    "reports.view_inventory",
  ],
  support_staff: [
    "catalog.view_product",
    "orders.view_order",
    "orders.update_order_status",
    "orders.process_refund",
  ],
};

export const SEED_ROLES: Role[] = [
  { id: "role_owner", name: "owner", is_system_role: true, permissions: permsFor(ROLE_CODES.owner), created_at: iso("2026-01-01") },
  { id: "role_manager", name: "store_manager", is_system_role: true, permissions: permsFor(ROLE_CODES.store_manager), created_at: iso("2026-01-01") },
  { id: "role_inventory", name: "inventory_staff", is_system_role: true, permissions: permsFor(ROLE_CODES.inventory_staff), created_at: iso("2026-01-01") },
  { id: "role_support", name: "support_staff", is_system_role: true, permissions: permsFor(ROLE_CODES.support_staff), created_at: iso("2026-01-01") },
];

const roleById = (id: string) => SEED_ROLES.find((r) => r.id === id)!;

export const SEED_STAFF: StaffUser[] = [
  { id: "staff_owner", email: "owner@sois.in", first_name: "Aditi", last_name: "Rao", role: roleById("role_owner"), is_active: true, created_at: iso("2026-01-02") },
  { id: "staff_manager", email: "manager@sois.in", first_name: "Rohan", last_name: "Verma", role: roleById("role_manager"), is_active: true, created_at: iso("2026-01-03") },
  { id: "staff_inventory", email: "stock@sois.in", first_name: "Neha", last_name: "Kulkarni", role: roleById("role_inventory"), is_active: true, created_at: iso("2026-01-04") },
  { id: "staff_support", email: "support@sois.in", first_name: "Karan", last_name: "Bose", role: roleById("role_support"), is_active: true, created_at: iso("2026-01-05") },
];

/* -------------------------------------------------------------------------- */
/* Categories & collections                                                   */
/* -------------------------------------------------------------------------- */

const CATS: { slug: string; name: string; desc: string }[] = [
  { slug: "rings", name: "Rings", desc: "Stackable statements & everyday bands" },
  { slug: "earrings", name: "Earrings", desc: "Studs, hoops & drops" },
  { slug: "necklaces", name: "Necklaces", desc: "Pendants & chains" },
  { slug: "bracelets", name: "Bracelets", desc: "Cuffs, chains & charms" },
  { slug: "anklets", name: "Anklets", desc: "Delicate silver for sunlit days" },
  { slug: "gifts", name: "Gifts", desc: "Curated sets, beautifully boxed" },
];

export const SEED_CATEGORIES: Category[] = CATS.map((c, i) => ({
  id: `cat_${c.slug}`,
  name: c.name,
  slug: c.slug,
  parent: null,
  description: c.desc,
  image_key: placeholderImage(c.name, "silver", i),
  is_active: true,
  sort_order: i,
}));

export const SEED_COLLECTIONS: Collection[] = [
  { id: "col_bestsellers", name: "Bestsellers", slug: "bestsellers", description: "Our most-loved pieces", banner_image_key: placeholderImage("Bestsellers", "silver", 1), is_active: true, sort_order: 0 },
  { id: "col_new", name: "New Arrivals", slug: "new-arrivals", description: "Fresh from the workshop", banner_image_key: placeholderImage("New Arrivals", "silver", 2), is_active: true, sort_order: 1 },
  { id: "col_gift", name: "Gift Edit", slug: "gift-edit", description: "Ready to gift", banner_image_key: placeholderImage("Gift Edit", "gold_plated", 0), is_active: true, sort_order: 2 },
];

/* -------------------------------------------------------------------------- */
/* Products                                                                   */
/* -------------------------------------------------------------------------- */

const CARE =
  "Store away from moisture. Avoid perfume, lotion and chlorine. Wipe with a soft cloth after each wear. Remove before swimming or exercise.";

interface PInput {
  name: string;
  cat: string; // slug
  metal?: MetalType;
  price: number;
  discount?: number;
  qty: number;
  featured?: boolean;
  tags?: string[];
  stockType?: "unique" | "quantity";
  collection?: string; // collection id
  stones?: StoneDetail[];
  purity?: string;
  sizes?: string;
  variantLabel?: string;
}

const P: PInput[] = [
  { name: "Celestial Stack Ring", cat: "rings", price: 899, qty: 24, tags: ["new"], sizes: "6,7,8,9", collection: "col_new" },
  { name: "Luminous Signet Ring", cat: "rings", price: 1499, discount: 20, qty: 4, featured: true, tags: ["bestseller"], sizes: "6,7,8,9,10", collection: "col_bestsellers" },
  { name: "Twine Wrap Ring", cat: "rings", price: 749, qty: 18, sizes: "Adjustable" },
  { name: "Solitaire Halo Ring", cat: "rings", price: 1899, discount: 16, qty: 0, sizes: "6,7,8", stones: [{ type: "Cubic Zirconia", weight: "0.5ct", quality: "AAA", count: 1 }] },
  { name: "Cascade Hoop Earrings", cat: "earrings", price: 999, discount: 25, qty: 31, featured: true, tags: ["bestseller"], collection: "col_bestsellers" },
  { name: "Ethereal Drop Earrings", cat: "earrings", price: 1199, discount: 25, qty: 12 },
  { name: "Petite Orbit Studs", cat: "earrings", price: 599, qty: 40, tags: ["new"], collection: "col_new" },
  { name: "Lumen Huggie Hoops", cat: "earrings", price: 699, qty: 3 },
  { name: "Crescent Moon Pendant", cat: "necklaces", price: 1599, discount: 19, qty: 22, featured: true, tags: ["bestseller"], collection: "col_bestsellers" },
  { name: "Twisted Rope Necklace", cat: "necklaces", price: 1499, qty: 5, tags: ["new"], collection: "col_new" },
  { name: "Solene Layer Chain", cat: "necklaces", price: 1099, qty: 16 },
  { name: "Aurora Pearl Drop Necklace", cat: "necklaces", price: 2099, discount: 14, qty: 1, stockType: "unique", stones: [{ type: "Freshwater Pearl", weight: "3ct", quality: "AA", count: 1 }] },
  { name: "Starlight Chain Bracelet", cat: "bracelets", price: 1099, qty: 19, tags: ["new"], collection: "col_new" },
  { name: "Cubic Charm Bracelet", cat: "bracelets", price: 1299, discount: 23, qty: 2, stones: [{ type: "Cubic Zirconia", weight: "0.2ct", quality: "AA", count: 5 }] },
  { name: "Eterna Cuff Bracelet", cat: "bracelets", metal: "rose_gold", price: 1399, qty: 14, featured: true, tags: ["bestseller"], purity: "925 Silver · Rose Gold Plated", collection: "col_bestsellers" },
  { name: "Seaside Beaded Anklet", cat: "anklets", price: 649, qty: 27, tags: ["new"], collection: "col_new" },
  { name: "Petal Charm Anklet", cat: "anklets", price: 899, discount: 22, qty: 0 },
  { name: "Everyday Essentials Gift Set", cat: "gifts", price: 3199, discount: 22, qty: 9, featured: true, tags: ["bestseller"], collection: "col_gift" },
  { name: "Celestial Duo Gift Set", cat: "gifts", metal: "gold_plated", price: 1999, qty: 6, tags: ["new"], purity: "925 Silver · 18k Gold Plated", collection: "col_gift" },
];

let createdCursor = Date.parse("2026-01-06T10:00:00.000Z");
const nextCreated = () => {
  createdCursor += 1000 * 60 * 60 * 26;
  return new Date(createdCursor).toISOString();
};

// slug → display name, so seeded SKUs derive the same category code as the app.
const CAT_NAME_BY_SLUG: Record<string, string> = Object.fromEntries(
  CATS.map((c) => [c.slug, c.name]),
);
// Running list of issued SKUs so seeded codes collide-check exactly like the app.
const usedSkus: string[] = [];
function makeSku(metal: MetalType, catSlug: string, purity: string, name: string) {
  const sku = nextSku(metal, usedSkus, CAT_NAME_BY_SLUG[catSlug], purity, name);
  usedSkus.push(sku);
  return sku;
}

/** Parse "6,7,8" into distinct trimmed sizes; "Adjustable"/blank → no sizes. */
function parseSizes(raw: string): string[] {
  if (!raw || raw === "Adjustable") return [];
  const seen: string[] = [];
  for (const part of raw.split(",")) {
    const s = part.trim();
    if (s && !seen.includes(s)) seen.push(s);
  }
  return seen;
}

/**
 * Split a total qty across sizes as evenly as possible (remainder to the front)
 * and build a full variation row per size: a derived SKU and a metal weight that
 * grows slightly with the larger sizes — the WooCommerce-style detail.
 */
function distributeSizeStock(
  raw: string,
  total: number,
  sku: string,
  baseWeight: number,
): StoredVariation[] {
  const sizes = parseSizes(raw);
  if (sizes.length === 0) return [];
  const base = Math.floor(total / sizes.length);
  let remainder = total - base * sizes.length;
  return sizes.map((size, i) => ({
    size,
    qty: base + (remainder-- > 0 ? 1 : 0),
    sku: variationSku(sku, size),
    price: null, // inherit the product price
    net_weight: Math.round(baseWeight * (1 + i * 0.04) * 1000) / 1000,
    is_active: true,
  }));
}

function makeProduct(input: PInput): StoredProduct {
  const metal = input.metal ?? "silver";
  const created = nextCreated();
  const qty = input.qty;
  const status = qty <= 0 ? "out_of_stock" : "active";
  const purity = input.purity ?? "925 Sterling";
  const sku = makeSku(metal, input.cat, purity, input.name);
  const netWeight = Math.round((2.5 + Math.random() * 5) * 100) / 100;
  return {
    id: `prod_${slug(input.name)}`,
    sku,
    name: input.name,
    slug: slug(input.name),
    description: `${input.name} — handcrafted in ${metal.replace("_", " ")} with a tarnish-resistant finish. A SOIS everyday essential.`,
    category_id: `cat_${input.cat}`,
    collection_id: input.collection ?? null,
    price: input.price,
    discount_percent: input.discount ?? 0,
    stock_type: input.stockType ?? "quantity",
    qty,
    status,
    metal_type: metal,
    purity,
    gross_weight: Math.round((3 + Math.random() * 6) * 100) / 100,
    net_weight: netWeight,
    length_mm: Math.round((10 + Math.random() * 40) * 10) / 10,
    width_mm: Math.round((5 + Math.random() * 20) * 10) / 10,
    height_mm: Math.round((2 + Math.random() * 10) * 10) / 10,
    stone_details: input.stones ?? [],
    certificate_details: input.stones?.length
      ? { BIS: "Hallmarked", Purity: "92.5%", Certification: "SGL" }
      : { BIS: "Hallmarked", Purity: "92.5%" },
    available_sizes: input.sizes ?? "",
    size_unit: input.sizes && input.sizes !== "Adjustable" ? "US" : "",
    variant_label: input.variantLabel ?? (input.sizes && input.sizes !== "Adjustable" ? "Ring Size" : ""),
    // Spread the product qty across its discrete sizes so the per-size
    // breakdown reconciles with the denormalized total, exactly like the backend.
    size_stocks: distributeSizeStock(input.sizes ?? "", qty, sku, netWeight),
    care_instruction: CARE,
    is_featured: input.featured ?? false,
    tags: input.tags ?? [],
    media: makeMedia(input.name, metal, 3),
    created_at: created,
    updated_at: created,
  };
}

export function buildSeedProducts(): StoredProduct[] {
  usedSkus.length = 0;
  createdCursor = Date.parse("2026-01-06T10:00:00.000Z");
  return P.map(makeProduct);
}

const productBySlug = (products: StoredProduct[], s: string) =>
  products.find((p) => p.slug === s)!;

/* -------------------------------------------------------------------------- */
/* Reviews                                                                    */
/* -------------------------------------------------------------------------- */

export function buildSeedReviews(products: StoredProduct[]): Review[] {
  const r = (
    i: number,
    s: string,
    rating: number,
    title: string,
    body: string,
    name: string,
    approved: boolean,
    date: string,
  ): Review => {
    const p = productBySlug(products, s);
    return {
      id: `rev_${i}`,
      product: p.id,
      product_name: p.name,
      rating,
      title,
      body,
      customer_name: name,
      is_approved: approved,
      created_at: iso(date),
    };
  };
  return [
    r(1, "crescent-moon-pendant", 5, "Absolutely stunning", "Even prettier in person. Gets compliments everywhere.", "Priya S.", true, "2026-05-10"),
    r(2, "luminous-signet-ring", 5, "Everyday favourite", "Haven't taken it off. No tarnish after weeks.", "Ravi K.", true, "2026-05-14"),
    r(3, "cascade-hoop-earrings", 4, "Lovely but light", "Beautiful hoops, a touch lighter than expected.", "Meera J.", true, "2026-06-01"),
    r(4, "everyday-essentials-gift-set", 5, "Perfect gift", "Gifted to my sister — she loved the packaging.", "Anil D.", true, "2026-06-08"),
    r(5, "aurora-pearl-drop-necklace", 5, "Elegant", "The pearl is gorgeous. Worth it.", "Sneha R.", false, "2026-06-22"),
    r(6, "twisted-rope-necklace", 4, "Good weight", "Feels substantial, layers well.", "Farah M.", false, "2026-06-28"),
    r(7, "petite-orbit-studs", 3, "Small", "Cute but smaller than I imagined.", "Divya N.", false, "2026-07-01"),
    r(8, "eterna-cuff-bracelet", 5, "Beautiful rose gold", "The rose finish is subtle and classy.", "Tara V.", true, "2026-07-02"),
  ];
}

/* -------------------------------------------------------------------------- */
/* Suppliers                                                                  */
/* -------------------------------------------------------------------------- */

export const SEED_SUPPLIERS: Supplier[] = [
  { id: "sup_argent", name: "Argent Silvercraft", contact_name: "Mahesh Jain", phone: "+91 98200 33445", email: "sales@argentsilver.in", address: "Zaveri Bazaar, Mumbai", gstin: "27ABCDE1234F1Z5", notes: "Primary sterling supplier", is_active: true, created_at: iso("2026-01-08"), updated_at: iso("2026-01-08") },
  { id: "sup_lumina", name: "Lumina Findings Co.", contact_name: "Sunita Rao", phone: "+91 99870 11220", email: "orders@luminafindings.in", address: "Sitapura, Jaipur", gstin: "08LMNOP5678Q1Z2", notes: "Clasps, hooks & findings", is_active: true, created_at: iso("2026-01-09"), updated_at: iso("2026-01-09") },
  { id: "sup_stone", name: "Stone & Sparkle", contact_name: "Imran Shaikh", phone: "+91 91230 55667", email: "hello@stonesparkle.in", address: "Surat, Gujarat", gstin: "24RSTUV9012W1Z8", notes: "CZ & pearls", is_active: false, created_at: iso("2026-01-10"), updated_at: iso("2026-02-01") },
];

/* -------------------------------------------------------------------------- */
/* Purchase orders                                                            */
/* -------------------------------------------------------------------------- */

function poItem(products: StoredProduct[], s: string, ordered: number, received: number, cost: number): PurchaseOrderItem {
  const p = productBySlug(products, s);
  return {
    id: `poi_${s}_${Math.round(cost)}`,
    product_id: p.id,
    product_sku: p.sku,
    product_name: p.name,
    size: "",
    qty_ordered: ordered,
    qty_received: received,
    qty_pending: Math.max(0, ordered - received),
    unit_cost: cost,
    total_cost: ordered * cost,
    is_fully_received: received >= ordered,
  };
}

export function buildSeedPurchaseOrders(products: StoredProduct[]): PurchaseOrder[] {
  const mk = (
    id: string,
    num: string,
    supplier: string,
    supplierName: string,
    status: PurchaseOrder["status"],
    items: PurchaseOrderItem[],
    dates: { order?: string; expected?: string; received?: string },
    tax = 0,
    ship = 0,
  ): PurchaseOrder => {
    const subtotal = items.reduce((s, it) => s + it.total_cost, 0);
    return {
      id,
      po_number: num,
      supplier,
      supplier_name: supplierName,
      status,
      order_date: dates.order ? iso(dates.order) : null,
      expected_delivery_date: dates.expected ? iso(dates.expected) : null,
      received_date: dates.received ? iso(dates.received) : null,
      subtotal,
      tax_amount: tax,
      shipping_cost: ship,
      total_amount: subtotal + tax + ship,
      notes: "",
      items,
      created_at: dates.order ? iso(dates.order) : iso("2026-06-01"),
      updated_at: iso("2026-06-20"),
    };
  };

  return [
    mk("po_1", "PO-2026-0001", "sup_argent", "Argent Silvercraft", "draft", [
      poItem(products, "twine-wrap-ring", 30, 0, 320),
      poItem(products, "solene-layer-chain", 20, 0, 540),
    ], { expected: "2026-07-20" }, 900, 250),
    mk("po_2", "PO-2026-0002", "sup_argent", "Argent Silvercraft", "ordered", [
      poItem(products, "luminous-signet-ring", 40, 0, 610),
      poItem(products, "lumen-huggie-hoops", 50, 0, 300),
    ], { order: "2026-06-18", expected: "2026-07-10" }, 1500, 300),
    mk("po_3", "PO-2026-0003", "sup_lumina", "Lumina Findings Co.", "partial", [
      poItem(products, "cubic-charm-bracelet", 25, 10, 520),
      poItem(products, "crescent-moon-pendant", 30, 30, 640),
    ], { order: "2026-06-05", expected: "2026-06-25" }, 1200, 200),
    mk("po_4", "PO-2026-0004", "sup_stone", "Stone & Sparkle", "received", [
      poItem(products, "aurora-pearl-drop-necklace", 6, 6, 940),
      poItem(products, "solitaire-halo-ring", 12, 12, 780),
    ], { order: "2026-05-10", expected: "2026-05-28", received: "2026-05-27" }, 1800, 350),
  ];
}

/* -------------------------------------------------------------------------- */
/* Orders                                                                     */
/* -------------------------------------------------------------------------- */

const ADDRS: Record<string, Address> = {
  aarav: { id: "adr_aarav", full_name: "Aarav Sharma", phone: "+91 98200 11223", line1: "12 Marine Lines", line2: "Flat 4B", city: "Mumbai", state: "Maharashtra", pincode: "400002", country: "India", is_default: true },
  diya: { id: "adr_diya", full_name: "Diya Patel", phone: "+91 99785 44210", line1: "88 CG Road", line2: "Navrangpura", city: "Ahmedabad", state: "Gujarat", pincode: "380009", country: "India", is_default: true },
  ishaan: { id: "adr_ishaan", full_name: "Ishaan Mehta", phone: "+91 90045 66712", line1: "7 Koregaon Park", line2: "Lane 5", city: "Pune", state: "Maharashtra", pincode: "411001", country: "India", is_default: true },
  ananya: { id: "adr_ananya", full_name: "Ananya Reddy", phone: "+91 91234 87650", line1: "22 Jubilee Hills", line2: "Road 36", city: "Hyderabad", state: "Telangana", pincode: "500033", country: "India", is_default: true },
  vivaan: { id: "adr_vivaan", full_name: "Vivaan Gupta", phone: "+91 98110 22334", line1: "45 Hauz Khas Village", line2: "", city: "New Delhi", state: "Delhi", pincode: "110016", country: "India", is_default: true },
  kabir: { id: "adr_kabir", full_name: "Kabir Singh", phone: "+91 98880 77665", line1: "19 Sector 17-C", line2: "", city: "Chandigarh", state: "Punjab", pincode: "160017", country: "India", is_default: true },
  saanvi: { id: "adr_saanvi", full_name: "Saanvi Nair", phone: "+91 94470 55667", line1: "3 MG Road", line2: "Fort Kochi", city: "Kochi", state: "Kerala", pincode: "682001", country: "India", is_default: true },
  myra: { id: "adr_myra", full_name: "Myra Iyer", phone: "+91 90031 44556", line1: "5 Besant Nagar", line2: "2nd Ave", city: "Chennai", state: "Tamil Nadu", pincode: "600090", country: "India", is_default: true },
};

interface OInput {
  n: number;
  email: string;
  addr: keyof typeof ADDRS;
  status: OrderStatus;
  payment: PaymentStatus;
  date: string;
  lines: { slug: string; qty: number; size?: string }[];
}

function makeOrder(products: StoredProduct[], o: OInput): Order {
  const items: OrderItem[] = o.lines.map((l, i) => {
    const p = productBySlug(products, l.slug);
    const unit = effectivePrice(p.price, p.discount_percent);
    return {
      id: `oi_${o.n}_${i}`,
      product_id: p.id,
      product_sku: p.sku,
      product_name: p.name,
      metal_type: p.metal_type,
      purity: p.purity,
      gross_weight: p.gross_weight,
      thumbnail_key: p.media[0]?.s3_key ?? "",
      quantity: l.qty,
      selected_size: l.size ?? "",
      unit_price: unit,
      discount_percent: p.discount_percent,
      line_total: unit * l.qty,
      is_reviewed: o.status === "delivered" && i === 0,
    };
  });
  const subtotal = items.reduce((s, it) => s + it.line_total, 0);
  const shipping_charge = subtotal >= 1499 ? 0 : 49;
  const tax_amount = Math.round(subtotal * 0.03); // 3% GST (jewellery)
  const total_amount = subtotal + shipping_charge + tax_amount;
  const addr = ADDRS[o.addr];
  return {
    id: `order_${o.n}`,
    order_number: `SOIS-2026-${String(o.n).padStart(4, "0")}`,
    customer_email: o.email,
    customer_name: addr.full_name,
    status: o.status,
    payment_status: o.payment,
    shipping_address: addr,
    subtotal,
    discount_amount: 0,
    shipping_charge,
    tax_amount,
    total_amount,
    notes: "",
    razorpay_order_id: `order_R${o.n}xY${o.n}Zk`,
    items,
    created_at: iso(o.date),
    updated_at: iso(o.date),
  };
}

const ORDERS: OInput[] = [
  { n: 1, email: "aarav.sharma@gmail.com", addr: "aarav", status: "delivered", payment: "captured", date: "2026-05-02T09:15:00Z", lines: [{ slug: "crescent-moon-pendant", qty: 1 }, { slug: "petite-orbit-studs", qty: 1 }] },
  { n: 2, email: "diya.patel@gmail.com", addr: "diya", status: "shipped", payment: "captured", date: "2026-06-25T11:05:00Z", lines: [{ slug: "cascade-hoop-earrings", qty: 2 }, { slug: "solene-layer-chain", qty: 1 }] },
  { n: 3, email: "ishaan.mehta@outlook.com", addr: "ishaan", status: "processing", payment: "captured", date: "2026-06-28T14:40:00Z", lines: [{ slug: "eterna-cuff-bracelet", qty: 1 }] },
  { n: 4, email: "ananya.reddy@gmail.com", addr: "ananya", status: "pending", payment: "created", date: "2026-07-02T19:30:00Z", lines: [{ slug: "aurora-pearl-drop-necklace", qty: 1 }] },
  { n: 5, email: "vivaan.gupta@yahoo.com", addr: "vivaan", status: "cancelled", payment: "refunded", date: "2026-06-10T12:00:00Z", lines: [{ slug: "twisted-rope-necklace", qty: 1 }, { slug: "starlight-chain-bracelet", qty: 1 }] },
  { n: 6, email: "kabir.singh@gmail.com", addr: "kabir", status: "delivered", payment: "captured", date: "2026-03-30T15:25:00Z", lines: [{ slug: "celestial-stack-ring", qty: 2, size: "7" }, { slug: "seaside-beaded-anklet", qty: 1 }] },
  { n: 7, email: "saanvi.nair@gmail.com", addr: "saanvi", status: "paid", payment: "captured", date: "2026-07-01T17:10:00Z", lines: [{ slug: "luminous-signet-ring", qty: 1, size: "8" }, { slug: "lumen-huggie-hoops", qty: 1 }] },
  { n: 8, email: "aarav.sharma@gmail.com", addr: "aarav", status: "returned", payment: "captured", date: "2026-06-14T10:00:00Z", lines: [{ slug: "ethereal-drop-earrings", qty: 1 }] },
  { n: 9, email: "myra.iyer@gmail.com", addr: "myra", status: "refunded", payment: "refunded", date: "2026-05-20T08:20:00Z", lines: [{ slug: "everyday-essentials-gift-set", qty: 1 }] },
  { n: 10, email: "diya.patel@gmail.com", addr: "diya", status: "delivered", payment: "captured", date: "2026-04-18T07:05:00Z", lines: [{ slug: "solene-layer-chain", qty: 1 }] },
];

export function buildSeedOrders(products: StoredProduct[]): Order[] {
  return ORDERS.map((o) => makeOrder(products, o));
}

/* -------------------------------------------------------------------------- */
/* Returns & refunds                                                          */
/* -------------------------------------------------------------------------- */

export function buildSeedRefunds(): Refund[] {
  return [
    { id: "refund_1", order_id: "order_5", razorpay_refund_id: "rfnd_R5aAbBcC", amount: 2660, reason: "Order cancelled by customer", status: "processed", created_at: iso("2026-06-10T13:00:00Z") },
    { id: "refund_2", order_id: "order_9", razorpay_refund_id: "rfnd_R9xXyYzZ", amount: 2569, reason: "Return approved & inspected", status: "processed", created_at: iso("2026-06-05T11:00:00Z") },
  ];
}

export function buildSeedReturns(): Return[] {
  const base = (
    id: string,
    orderId: string,
    orderNum: string,
    status: ReturnStatus,
    reason: Return["reason"],
    over: Partial<Return> = {},
  ): Return => ({
    id,
    order_id: orderId,
    order_number: orderNum,
    status,
    reason,
    customer_note: "",
    staff_note: "",
    rejection_reason: "",
    return_shipment_awb: "",
    return_shipment_courier: "",
    return_tracking_url: "",
    inspection_note: "",
    inspected_at: null,
    refund_id: null,
    media: [],
    created_at: iso("2026-06-16T09:00:00Z"),
    updated_at: iso("2026-06-16T09:00:00Z"),
    ...over,
  });

  return [
    base("ret_1", "order_8", "SOIS-2026-0008", "requested", "damaged", {
      customer_note: "One earring arrived with a scratch on the drop.",
    }),
    base("ret_2", "order_9", "SOIS-2026-0009", "completed", "wrong_item", {
      customer_note: "Received the wrong set.",
      staff_note: "Verified — wrong SKU shipped.",
      return_shipment_awb: "DL7788990011",
      return_shipment_courier: "delhivery",
      return_tracking_url: "https://track.delhivery.com/DL7788990011",
      inspection_note: "Item returned in original condition.",
      inspected_at: iso("2026-06-04T10:00:00Z"),
      refund_id: "refund_2",
    }),
    base("ret_3", "order_6", "SOIS-2026-0006", "approved", "changed_mind", {
      customer_note: "Changed my mind about the anklet.",
      staff_note: "Approved, reverse pickup booked.",
      return_shipment_awb: "BD5544332211",
      return_shipment_courier: "bluedart",
      return_tracking_url: "https://bluedart.com/BD5544332211",
    }),
    base("ret_4", "order_1", "SOIS-2026-0001", "rejected", "not_as_desc", {
      customer_note: "Colour looks different.",
      rejection_reason: "Outside the 7-day return window.",
    }),
  ];
}

/* -------------------------------------------------------------------------- */
/* Shipments                                                                  */
/* -------------------------------------------------------------------------- */

export function buildSeedShipments(): Shipment[] {
  const ev = (id: string, status: string, description: string, location: string, ts: string): Shipment["events"][number] => ({
    id,
    status,
    description,
    location,
    timestamp: iso(ts),
  });
  return [
    {
      id: "ship_2", order_id: "order_2", order_number: "SOIS-2026-0002",
      shiprocket_order_id: "SR100002", shiprocket_shipment_id: "SRS100002",
      courier: "delhivery", awb: "DL5566778899", status: "in_transit",
      tracking_url: "https://track.delhivery.com/DL5566778899",
      estimated_delivery: iso("2026-07-05"), delivered_at: null, weight_kg: 0.5,
      events: [
        ev("se_2a", "booked", "Shipment booked", "Ahmedabad", "2026-06-25T12:00:00Z"),
        ev("se_2b", "picked_up", "Picked up by courier", "Ahmedabad Hub", "2026-06-26T09:00:00Z"),
        ev("se_2c", "in_transit", "In transit", "Nagpur Hub", "2026-06-27T18:00:00Z"),
      ],
      created_at: iso("2026-06-25T12:00:00Z"), updated_at: iso("2026-06-27T18:00:00Z"),
    },
    {
      id: "ship_1", order_id: "order_1", order_number: "SOIS-2026-0001",
      shiprocket_order_id: "SR100001", shiprocket_shipment_id: "SRS100001",
      courier: "bluedart", awb: "BD1029384756", status: "delivered",
      tracking_url: "https://bluedart.com/BD1029384756",
      estimated_delivery: iso("2026-05-07"), delivered_at: iso("2026-05-06T14:30:00Z"), weight_kg: 0.4,
      events: [
        ev("se_1a", "booked", "Shipment booked", "Mumbai", "2026-05-02T10:00:00Z"),
        ev("se_1b", "in_transit", "In transit", "Mumbai Hub", "2026-05-03T09:00:00Z"),
        ev("se_1c", "out_for_delivery", "Out for delivery", "Mumbai", "2026-05-06T08:00:00Z"),
        ev("se_1d", "delivered", "Delivered", "Mumbai", "2026-05-06T14:30:00Z"),
      ],
      created_at: iso("2026-05-02T10:00:00Z"), updated_at: iso("2026-05-06T14:30:00Z"),
    },
    {
      id: "ship_6", order_id: "order_6", order_number: "SOIS-2026-0006",
      shiprocket_order_id: "SR100006", shiprocket_shipment_id: "SRS100006",
      courier: "dtdc", awb: "DT9081726354", status: "delivered",
      tracking_url: "https://dtdc.in/DT9081726354",
      estimated_delivery: iso("2026-04-05"), delivered_at: iso("2026-04-04T11:00:00Z"), weight_kg: 0.6,
      events: [
        ev("se_6a", "booked", "Shipment booked", "Chandigarh", "2026-03-30T16:00:00Z"),
        ev("se_6b", "delivered", "Delivered", "Chandigarh", "2026-04-04T11:00:00Z"),
      ],
      created_at: iso("2026-03-30T16:00:00Z"), updated_at: iso("2026-04-04T11:00:00Z"),
    },
  ];
}

/* -------------------------------------------------------------------------- */
/* Stock ledger                                                               */
/* -------------------------------------------------------------------------- */

export function buildSeedLedger(products: StoredProduct[]): StockLedgerEntry[] {
  const entries: StockLedgerEntry[] = [];
  let i = 0;
  const add = (s: string, reason: StockLedgerEntry["reason"], change: number, balAfter: number, refType: string, refId: string | null, note: string, actor: string, ts: string) => {
    const p = productBySlug(products, s);
    entries.push({
      id: `led_${++i}`,
      product_id: p.id,
      product_sku: p.sku,
      size: "",
      reason,
      change_qty: change,
      balance_after: balAfter,
      reference_type: refType,
      reference_id: refId,
      note,
      actor_email: actor,
      timestamp: iso(ts),
    });
  };
  add("aurora-pearl-drop-necklace", "purchase", 6, 7, "purchase_order", "po_4", "PO-2026-0004 receipt", "stock@sois.in", "2026-05-27T10:00:00Z");
  add("solitaire-halo-ring", "purchase", 12, 12, "purchase_order", "po_4", "PO-2026-0004 receipt", "stock@sois.in", "2026-05-27T10:00:00Z");
  add("crescent-moon-pendant", "purchase", 30, 52, "purchase_order", "po_3", "PO-2026-0003 receipt", "stock@sois.in", "2026-06-06T10:00:00Z");
  add("cubic-charm-bracelet", "purchase", 10, 12, "purchase_order", "po_3", "PO-2026-0003 partial receipt", "stock@sois.in", "2026-06-06T10:00:00Z");
  add("crescent-moon-pendant", "sale", -1, 51, "order", "order_1", "Order SOIS-2026-0001", "", "2026-05-02T09:20:00Z");
  add("aurora-pearl-drop-necklace", "adjustment", -6, 1, "adjustment", null, "Damaged in storage — water ingress", "stock@sois.in", "2026-06-15T14:00:00Z");
  add("solitaire-halo-ring", "sale", -12, 0, "order", null, "Bulk corporate order", "", "2026-06-18T14:00:00Z");
  add("petal-charm-anklet", "damage", -3, 0, "adjustment", null, "QC failure — clasp defect", "stock@sois.in", "2026-06-20T11:00:00Z");
  return entries;
}
