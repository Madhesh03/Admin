/**
 * Mock auth config. The real backend authenticates via rest_framework_simplejwt
 * against per-user passwords; the mock accepts one shared demo password for any
 * seeded staff user, so you can sign in as different roles to see RBAC in action.
 */
export const ADMIN_PASSWORD =
  process.env.NEXT_PUBLIC_ADMIN_PASSWORD ?? "admin123";

/** Default demo login (the tenant owner — all permissions). */
export const DEMO_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL ?? "owner@sois.in";

/** Single-tenant deployment id (brief/spec §Multi-tenancy → "sois-store"). */
export const DEFAULT_TENANT_ID =
  process.env.NEXT_PUBLIC_TENANT_ID ?? "sois-store";

/** Emails offered as quick logins on the sign-in screen (role demo). */
export const DEMO_LOGINS: { email: string; role: string }[] = [
  { email: "owner@sois.in", role: "owner" },
  { email: "manager@sois.in", role: "store_manager" },
  { email: "stock@sois.in", role: "inventory_staff" },
  { email: "support@sois.in", role: "support_staff" },
];
