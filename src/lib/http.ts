/**
 * ============================================================================
 *  http.ts — real backend transport for the admin seam
 * ============================================================================
 * Everything the real `admin-api.real.ts` needs to talk to the SOIS Django/DRF
 * backend:
 *   - base URL + the {success, data, meta} envelope contract
 *   - Bearer auth from the stored staff session + X-Tenant-ID scoping
 *   - a single-flight access-token refresh on 401 (SimpleJWT rotates the
 *     refresh token, so we persist the new one), then one transparent retry
 *   - ApiError, thrown by BOTH mock and real code paths so `instanceof ApiError`
 *     works regardless of which transport is active
 *
 * Response envelopes (see config/api.py + config/exceptions.py):
 *   list   → { success: true,  data: [...], meta: { total, page, page_size, ... } }
 *   single → { success: true,  data: {...} }
 *   error  → { success: false, error: "msg" | { code, message, details } }
 */
import type { PageMeta } from "./types";
import type { StoredSession } from "./mock-data";

/* -------------------------------------------------------------------------- */
/* Config                                                                     */
/* -------------------------------------------------------------------------- */

/** Base URL of the versioned API, e.g. http://localhost:8000/api/v1 (no trailing slash). */
export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1"
).replace(/\/+$/, "");

/**
 * When true the seam serves in-memory mock data; when false it hits the real
 * backend. Defaults to mocks so the app never breaks before the API is wired —
 * set NEXT_PUBLIC_USE_MOCKS=false (see .env.local) to go live.
 */
export const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS !== "false";

/**
 * Send the resolved tenant id as X-Tenant-ID. Requires the backend to allow the
 * header via CORS (config/settings/base.py → CORS_ALLOW_HEADERS). If unset, the
 * backend falls back to DEFAULT_TENANT_SLUG, which is correct for the current
 * single-tenant deployment.
 */
const SEND_TENANT_HEADER = process.env.NEXT_PUBLIC_SEND_TENANT_HEADER !== "false";

/* -------------------------------------------------------------------------- */
/* Errors                                                                     */
/* -------------------------------------------------------------------------- */

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;
  constructor(message: string, status = 400, code?: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/* -------------------------------------------------------------------------- */
/* Session storage (shared with mock-data — same localStorage key/shape)      */
/* -------------------------------------------------------------------------- */

// Mirrors mock-data.SESSION_KEY. Duplicated as a literal so this module carries
// no runtime import of the mock store (keeps seed data out of the real bundle).
const SESSION_KEY = "sois_admin_session";
const isBrowser = () => typeof window !== "undefined";

export function readSession(): StoredSession | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
}

export function writeSession(session: StoredSession | null): void {
  if (!isBrowser()) return;
  if (session) window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else window.localStorage.removeItem(SESSION_KEY);
}

/* -------------------------------------------------------------------------- */
/* Request core                                                               */
/* -------------------------------------------------------------------------- */

type Query = Record<string, string | number | boolean | null | undefined>;

interface RequestOptions {
  /** Attach the Bearer token + tenant header (default true). */
  auth?: boolean;
  /** JSON body — serialized automatically. */
  body?: unknown;
  /** Query params — nullish/"" values are dropped. */
  query?: Query;
  /** Internal: prevents infinite refresh loops. */
  _retried?: boolean;
}

function buildUrl(path: string, query?: Query): string {
  const url = `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
  if (!query) return url;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === null || v === undefined || v === "") continue;
    qs.append(k, String(v));
  }
  const s = qs.toString();
  return s ? `${url}?${s}` : url;
}

function baseHeaders(auth: boolean): Headers {
  const headers = new Headers({ Accept: "application/json" });
  if (auth) {
    const session = readSession();
    if (session?.tokens.access) {
      headers.set("Authorization", `Bearer ${session.tokens.access}`);
    }
    if (SEND_TENANT_HEADER && session?.tenant_id) {
      headers.set("X-Tenant-ID", session.tenant_id);
    }
  }
  return headers;
}

interface Envelope<T> {
  success: boolean;
  data?: T;
  meta?: PageMeta & Record<string, unknown>;
  error?: string | { code?: string; message?: string; details?: unknown };
}

/** Turn a parsed error envelope (or HTTP failure) into an ApiError. */
function toApiError(status: number, payload: Envelope<unknown> | null): ApiError {
  const err = payload?.error;
  if (typeof err === "string") return new ApiError(err, status);
  if (err && typeof err === "object") {
    return new ApiError(
      err.message ?? err.code ?? "Request failed",
      status,
      err.code,
      err.details,
    );
  }
  return new ApiError(`Request failed (${status})`, status);
}

/** A refresh in flight — coalesces concurrent 401s into one refresh call. */
let refreshInFlight: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const session = readSession();
    if (!session?.tokens.refresh) return false;
    try {
      const res = await fetch(buildUrl("/staff/auth/refresh/"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ refresh: session.tokens.refresh }),
      });
      const payload = (await res.json().catch(() => null)) as Envelope<{
        access: string;
        refresh?: string;
      }> | null;
      if (!res.ok || !payload?.success || !payload.data?.access) return false;
      // ROTATE_REFRESH_TOKENS=True → the response carries a fresh refresh token
      // that must replace the old one (which is now blacklisted).
      writeSession({
        ...session,
        tokens: {
          access: payload.data.access,
          refresh: payload.data.refresh ?? session.tokens.refresh,
        },
      });
      return true;
    } catch {
      return false;
    }
  })();
  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

/** Perform a request and return the whole parsed envelope (data + meta). */
async function requestEnvelope<T>(
  method: string,
  path: string,
  opts: RequestOptions = {},
): Promise<Envelope<T>> {
  const auth = opts.auth ?? true;
  const headers = baseHeaders(auth);
  if (opts.body !== undefined) headers.set("Content-Type", "application/json");

  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError("Network error — could not reach the server.", 0);
  }

  // 204 No Content (e.g. DELETE) — nothing to parse.
  if (res.status === 204) return { success: true } as Envelope<T>;

  const payload = (await res.json().catch(() => null)) as Envelope<T> | null;

  if (res.status === 401 && auth && !opts._retried) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return requestEnvelope<T>(method, path, { ...opts, _retried: true });
    }
    // Refresh failed — the session is dead; drop it so the UI redirects to login.
    writeSession(null);
    throw toApiError(401, payload);
  }

  if (!res.ok || !payload?.success) {
    throw toApiError(res.status, payload);
  }
  return payload;
}

/* -------------------------------------------------------------------------- */
/* Public helpers                                                             */
/* -------------------------------------------------------------------------- */

/** Return type mirrors the mock seam's Page<T> exactly (structural match). */
export interface Page<T> {
  items: T[];
  meta: PageMeta;
}

async function unwrap<T>(p: Promise<Envelope<T>>): Promise<T> {
  const env = await p;
  return env.data as T;
}

export function apiGet<T>(path: string, query?: Query, auth = true): Promise<T> {
  return unwrap<T>(requestEnvelope<T>("GET", path, { query, auth }));
}

export function apiPost<T>(path: string, body?: unknown, auth = true): Promise<T> {
  return unwrap<T>(requestEnvelope<T>("POST", path, { body, auth }));
}

export function apiPatch<T>(path: string, body?: unknown, auth = true): Promise<T> {
  return unwrap<T>(requestEnvelope<T>("PATCH", path, { body, auth }));
}

export async function apiDelete(path: string, auth = true): Promise<void> {
  await requestEnvelope<unknown>("DELETE", path, { auth });
}

/** GET a paginated list → { items, meta }. */
export async function apiGetList<T>(
  path: string,
  query?: Query,
  auth = true,
): Promise<Page<T>> {
  const env = await requestEnvelope<T[]>("GET", path, { query, auth });
  const items = (env.data ?? []) as T[];
  const meta = env.meta;
  return {
    items,
    meta: {
      total: Number(meta?.total ?? items.length),
      page: Number(meta?.page ?? query?.page ?? 1),
      page_size: Number(meta?.page_size ?? query?.page_size ?? items.length),
    },
  };
}

/** GET the full envelope (for endpoints whose meta carries non-pagination data). */
export function apiGetEnvelope<T>(
  path: string,
  query?: Query,
  auth = true,
): Promise<Envelope<T>> {
  return requestEnvelope<T>("GET", path, { query, auth });
}

/** POST returning the full envelope (rarely needed). */
export { requestEnvelope };
