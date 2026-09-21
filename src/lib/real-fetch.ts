/**
 * real-fetch.ts — scoped real-backend client (Reviews only, Phase C).
 *
 * The rest of Admin runs entirely on mock/localStorage data — see
 * `USE_MOCKS` in `admin-api.ts`. This file is a narrow, intentional
 * exception: it talks to the real sois-backend, but ONLY to support the
 * reviews moderation screen. It is not a general auth overhaul and does not
 * replace the mock session used everywhere else in the app for RBAC
 * (`useAuth().can()`, `requirePermission()` in admin-api.ts) — those keep
 * working exactly as before. This client keeps its own separate, in-memory
 * staff JWT for the handful of real reviews calls.
 *
 * Env:
 *   NEXT_PUBLIC_API_URL — base URL of the real backend's API root, e.g.
 *     https://api.sois.in/api/v1 in production. Defaults to
 *     http://localhost:8000/api/v1 for local dev against a `manage.py
 *     runserver` backend. Documented in `.env.example` at the repo root.
 */
import { ADMIN_PASSWORD, DEFAULT_TENANT_ID, DEMO_EMAIL } from "./auth-config";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

/**
 * The backend's TenantContextMiddleware resolves `X-Tenant-ID` by filtering
 * `Tenant.objects.filter(id=<header>)` — a UUIDField. If the header isn't a
 * valid UUID, Django's UUIDField raises a ValidationError while building the
 * query (verified directly: `UUIDField().get_prep_value("sois-store")`
 * raises, it doesn't just no-match), which surfaces as a 500 on every call,
 * including login. DEFAULT_TENANT_ID falls back to the slug "sois-store"
 * when NEXT_PUBLIC_TENANT_ID isn't set (the common local-dev case) — so we
 * only attach the header when it actually looks like a UUID; otherwise we
 * omit it and let the middleware's own default-tenant-by-slug fallback
 * (step 3) resolve the same tenant.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TENANT_HEADER: Record<string, string> = UUID_RE.test(DEFAULT_TENANT_ID)
  ? { "X-Tenant-ID": DEFAULT_TENANT_ID }
  : {};

export class RealApiError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/** In-memory staff access token for the real backend. Module-level cache is
 * intentional here — this is a small scoped client, not a full auth layer. */
let accessToken: string | null = null;
let loginInFlight: Promise<string> | null = null;

/**
 * Staff login against the real backend, reusing the same demo credentials
 * the mock login screen uses (see auth-config.ts) so this scoped path signs
 * in as the same demo staff user without needing new secrets.
 */
async function login(): Promise<string> {
  const res = await fetch(`${API_BASE}/staff/auth/login/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...TENANT_HEADER,
    },
    body: JSON.stringify({ email: DEMO_EMAIL, password: ADMIN_PASSWORD }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    throw new RealApiError(
      json?.error ?? "Staff login failed.",
      res.status || 401,
    );
  }
  const token: string | undefined = json.data?.tokens?.access;
  if (!token) {
    throw new RealApiError("Login response was missing an access token.", 500);
  }
  accessToken = token;
  return token;
}

async function getToken(): Promise<string> {
  if (accessToken) return accessToken;
  if (!loginInFlight) {
    loginInFlight = login().finally(() => {
      loginInFlight = null;
    });
  }
  return loginInFlight;
}

/**
 * Authenticated fetch against the real backend. Attaches the staff bearer
 * token and tenant header, unwraps the `{ success, data }` envelope, and
 * throws a RealApiError on `{ success: false, error }` or a network/HTTP
 * failure. On a 401 (expired/invalid token) it re-logs in once and retries
 * the call before giving up.
 */
export async function realFetch<T>(
  path: string,
  init: RequestInit = {},
  _retried = false,
): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...TENANT_HEADER,
      ...init.headers,
    },
  });

  if (res.status === 401 && !_retried) {
    accessToken = null; // force a fresh login
    return realFetch<T>(path, init, true);
  }

  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    throw new RealApiError(
      json?.error ?? `Request failed (${res.status}).`,
      res.status,
    );
  }
  return json.data as T;
}
