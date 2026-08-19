/**
 * In-memory mock store, persisted to localStorage. NOTHING outside admin-api.ts
 * imports from here — components go through the seam. Hydrates on first access,
 * writes back on every mutation, reseeds on demand ("Reset demo data").
 */
import {
  buildSeedLedger,
  buildSeedNotifications,
  buildSeedOrders,
  buildSeedProducts,
  buildSeedPurchaseOrders,
  buildSeedRefunds,
  buildSeedReturns,
  buildSeedReviews,
  buildSeedShipments,
  SEED_CATEGORIES,
  SEED_COLLECTIONS,
  SEED_ROLES,
  SEED_STAFF,
  SEED_SUPPLIERS,
} from "./seed";
import type { StoredProduct } from "./internal";
import type {
  Category,
  Collection,
  NotificationLog,
  Order,
  PurchaseOrder,
  Refund,
  Return,
  Review,
  Role,
  Shipment,
  StaffUser,
  StockLedgerEntry,
  Supplier,
  TokenPair,
} from "./types";

const KEY = (name: string) => `sois_admin_${name}`;
export const SESSION_KEY = KEY("session");
const VERSION_KEY = KEY("version");
const SEED_VERSION = "3";

const isBrowser = () => typeof window !== "undefined";

function read<T>(key: string): T | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function write<T>(key: string, value: T): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / private mode — tolerate in-memory only */
  }
}

interface DB {
  products: StoredProduct[];
  categories: Category[];
  collections: Collection[];
  reviews: Review[];
  suppliers: Supplier[];
  purchaseOrders: PurchaseOrder[];
  ledger: StockLedgerEntry[];
  orders: Order[];
  returns: Return[];
  refunds: Refund[];
  shipments: Shipment[];
  notifications: NotificationLog[];
  staff: StaffUser[];
  roles: Role[];
}

type Collections = keyof DB;

const CACHE: Partial<DB> = {};

function freshSeed(): DB {
  const products = buildSeedProducts();
  return {
    products,
    categories: SEED_CATEGORIES,
    collections: SEED_COLLECTIONS,
    reviews: buildSeedReviews(products),
    suppliers: SEED_SUPPLIERS,
    purchaseOrders: buildSeedPurchaseOrders(products),
    ledger: buildSeedLedger(products),
    orders: buildSeedOrders(products),
    returns: buildSeedReturns(),
    refunds: buildSeedRefunds(),
    shipments: buildSeedShipments(),
    notifications: buildSeedNotifications(),
    staff: SEED_STAFF,
    roles: SEED_ROLES,
  };
}

let hydrated = false;
function ensureHydrated(): void {
  if (hydrated) return;
  const version = read<string>(VERSION_KEY);
  const seed = freshSeed();
  if (version !== SEED_VERSION) {
    Object.assign(CACHE, seed);
    (Object.keys(seed) as Collections[]).forEach((k) => write(KEY(k), seed[k]));
    write(VERSION_KEY, SEED_VERSION);
  } else {
    (Object.keys(seed) as Collections[]).forEach((k) => {
      const stored = read(KEY(k));
      (CACHE as Record<string, unknown>)[k] = stored ?? seed[k];
      if (!stored) write(KEY(k), seed[k]);
    });
  }
  hydrated = true;
}

export function get<K extends Collections>(name: K): DB[K] {
  ensureHydrated();
  return CACHE[name] as DB[K];
}

export function set<K extends Collections>(name: K, value: DB[K]): void {
  CACHE[name] = value;
  write(KEY(name), value);
}

/* -------------------------------------------------------------------------- */
/* Session                                                                     */
/* -------------------------------------------------------------------------- */

export interface StoredSession {
  staff: StaffUser;
  tokens: TokenPair;
  tenant_id: string;
}

export function getStoredSession(): StoredSession | null {
  return read<StoredSession>(SESSION_KEY);
}
export function setStoredSession(session: StoredSession | null): void {
  if (!isBrowser()) return;
  if (session) write(SESSION_KEY, session);
  else window.localStorage.removeItem(SESSION_KEY);
}

/* -------------------------------------------------------------------------- */
/* Reset                                                                       */
/* -------------------------------------------------------------------------- */

export function resetDemoData(): void {
  const seed = freshSeed();
  Object.assign(CACHE, seed);
  (Object.keys(seed) as Collections[]).forEach((k) => write(KEY(k), seed[k]));
  write(VERSION_KEY, SEED_VERSION);
  hydrated = true;
  // Session preserved so the admin stays logged in.
}
