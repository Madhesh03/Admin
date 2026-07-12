# SOIS Admin Portal

Staff / back-office portal for the **SOIS** multi-tenant sterling-silver
e-commerce store — catalog, media, inventory (suppliers, purchase orders, stock
ledger), orders, returns/RMA, refunds, shipping, and staff/RBAC.

> **Mock-first / UI-only.** There is no database or server in this repo. Every
> flow works end-to-end against an in-memory **mock store** persisted to
> `localStorage`, routed through a single async **data-access seam**
> (`src/lib/admin-api.ts`). The seam is modelled 1:1 on the real Staff API
> (`admin-api.yaml`), so going live is a body-only change — see
> [Connecting the real backend](#connecting-the-real-backend).

---

## Stack

- **Next.js 15** (App Router) · **React 19** · **TypeScript 5**
- **Tailwind CSS v4** with the storefront brand tokens
- **Radix UI** primitives + **lucide-react** (shadcn-style components, in-repo)
- **Zustand** (toasts) · **Zod** (form validation)
- Currency: Indian Rupee, `en-IN` (`₹1,299`)

## Getting started

```bash
npm install
cp .env.example .env.local   # optional — sensible defaults are built in
npm run dev                  # http://localhost:3000
```

### Demo logins (RBAC)

One shared demo password for every seeded staff user; the **email selects the
role**, so you can see permission gating live. Click a role card on the sign-in
screen to log straight in.

| Email             | Role             | Sees / can do                                        |
| ----------------- | ---------------- | ---------------------------------------------------- |
| `owner@sois.in`   | owner            | Everything (superuser bypass)                        |
| `manager@sois.in` | store_manager    | Catalog, orders, returns, shipping, refunds, reports |
| `stock@sois.in`   | inventory_staff  | Products (view), suppliers, POs, stock, reports      |
| `support@sois.in` | support_staff    | Orders, returns, refunds (view/action), products (view) |

Password (all): **`admin123`** — override with `NEXT_PUBLIC_ADMIN_PASSWORD`.
Sidebar items and action buttons are hidden when your role lacks the permission;
the seam also enforces it (a disallowed call throws a 403-style error).

### Scripts

| Command         | Description                      |
| --------------- | -------------------------------- |
| `npm run dev`   | Dev server (Turbopack)           |
| `npm run build` | Production build                 |
| `npm start`     | Serve the production build       |

---

## Modules

| Area | Screens |
| --- | --- |
| **Dashboard** | `/` — counts, revenue, recent orders, status breakdown, pending returns |
| **Catalog** | Products (`/products` · `/products/new` · `/products/:id`), Categories, Collections, Reviews (moderation) |
| **Sales** | Orders (`/orders` · `/orders/:id`), Returns (`/returns` · `/returns/:id`), Shipments (`/shipments` · `/shipments/:id`), Refunds, Customers |
| **Inventory** | Stock (`/stock` — levels · low · valuation · ledger · adjust), Suppliers, Purchase Orders (`/purchase-orders` · `/new` · `/:id`) |
| **Settings** | Staff & Roles (`/staff`) |

Key flows that fully work against the mock:

- **Product** create (→ draft, SKU auto), edit, archive; **media** via the S3
  direct-upload flow (presign → confirm → delete); pricing via
  `price` + `discount_percent` → `effective_price`.
- **Stock** is ledger-driven: quantity changes only via **PO receipt**, **manual
  adjustment** (note required), or an order **cancel** (restock) — never edited
  directly on the product.
- **Orders** follow the state machine (`pending → paid → processing → shipped →
  delivered`, `cancelled`/`returned`/`refunded` branches); illegal transitions
  are blocked. **Cancel** restocks + refunds.
- **Returns/RMA**: approve (books reverse pickup) · reject · retry-pickup ·
  receive · inspect (pass → refund initiated).
- **Shipping**: create (order must be `processing`, auto-advances to `shipped`) ·
  sync (advances tracking; delivered → order `delivered`) · cancel.
- **Refunds** from an order (full or partial) or via return inspection.
- **Staff**: create users, change roles; view every role's permission codenames.

### Mock behaviour

- All data in `localStorage` (keys prefixed `sois_admin_`), survives refresh.
  **Reset demo data** (sidebar footer) reseeds. Seed = 4 staff/4 roles, 6
  categories, 3 collections, ~19 products, reviews, 3 suppliers, 4 POs, a stock
  ledger, ~10 orders across all statuses, 4 returns, refunds, 3 shipments.
- Every seam call awaits **200–400 ms** latency so loading states are real.
- **Simulated errors** opt-in: `localStorage.setItem("sois_admin_simulate_errors","1")`
  (or `setErrorSimulation(true)` from `@/lib/admin-api`) → ~35% of mutations fail.
- Uploaded images are stored as **base64 data URLs** (the mock passes them as the
  `s3_key`), so they persist across refresh.
- **Multi-tenancy**: single tenant `sois-store`, shown in the top bar; the real
  fetch layer would send it as `X-Tenant-ID`.

---

## Architecture

```
Components → src/lib/admin-api.ts (THE SEAM, RBAC + tenant) → src/lib/mock-data.ts (localStorage)
```

- **No component reads the store directly.** `admin-api.ts` is the only seam.
- `src/lib/types.ts` — the API **contract** (all entities + enums).
- `src/lib/internal.ts` — normalized storage shape for products (FK ids); the
  seam joins categories/collections and computes derived fields, like the backend.
- `src/lib/derive.ts` — pure rules (effective_price, slug/SKU, order timeline, PO
  recompute) the backend mirrors.
- `src/lib/seed.ts` + `mock-data.ts` — seed data + the persisted store.
- `src/lib/schemas.ts` — Zod schemas for every form.

---

## Connecting the real backend

Flip `USE_MOCKS` in `src/lib/admin-api.ts` and replace each function body (marked
`// TODO(backend)`) with the matching `fetch(...)`, unwrapping the
`{ success, data, meta }` envelope and sending `Authorization: Bearer <token>` +
`X-Tenant-ID`. Because IDs, SKUs, `effective_price`, order/PO/return state
machines and RBAC are all derived here using the same rules the backend applies,
the swap is mechanical. Endpoint map (excerpt):

| Seam fn | Endpoint |
| --- | --- |
| `login` | `POST /staff/auth/login/` |
| `listProducts` / `getProduct` | `GET /catalog/staff/products/[:id]` |
| `createProduct` / `updateProduct` / `archiveProduct` | `POST` / `PATCH` / `DELETE /catalog/staff/products/:id` |
| `presignMedia` / `confirmMedia` / `deleteMedia` | `POST …/media/presign/` · `…/confirm/` · `DELETE …/media/:id/` |
| `listCategories` / `createCategory` / `updateCategory` | `…/categories/` |
| `listCollections` / `create` / `update` | `…/collections/` |
| `listReviews` / `approveReview` | `…/reviews/[:id/approve/]` |
| `listSuppliers` / `createSupplier` / `updateSupplier` | `/inventory/suppliers/` |
| `createPurchaseOrder` / `confirm` / `receive` / `cancel` | `/inventory/purchase-orders/:id/…` |
| `listLowStock` / `stockValuation` / `productLedger` / `adjustStock` | `/inventory/stock/…` |
| `listOrders` / `getOrder` / `updateOrderStatus` | `/orders/staff/[:id/status/]` |
| `listReturns` / `approve` / `reject` / `retry` / `receive` / `inspect` | `/orders/staff/returns/:id/…` |
| `initiateRefund` | `POST /payments/staff/refund/` |
| `listShipments` / `createShipment` / `sync` / `cancel` | `/shipping/staff/shipments/…` |
| `listStaff` / `createStaff` / `updateStaffRole` / `listRoles` | `/staff/users/` · `/staff/roles/` |

### Gaps the backend spec doesn't cover (client-derived today)

- **Dashboard `getStats`** — no `/stats` endpoint; derived from products/orders/
  returns. Marked `// TODO(backend)`.
- **Customers** — no staff customer endpoints; derived from orders by email.
- **Post-upload image reorder / set-primary** — the media API only has
  presign/confirm/delete, so primary is chosen at upload time and deleting the
  primary auto-promotes the next image.
