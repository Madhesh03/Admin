import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge conditional class names, de-duplicating Tailwind conflicts. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format an INR amount, e.g. 1299 -> "₹1,299". (Brief §7)
 *
 * Accepts a string too: DRF serialises DecimalField as a JSON string
 * ("4499.10"), so real-backend payloads arrive as strings even where the
 * contract types say `number`. Coercing here keeps grouping/rounding correct
 * instead of silently falling through to String.prototype.toLocaleString.
 */
export const formatPrice = (v: number | string | null | undefined) => {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return "—";
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
};

/** Human date, e.g. "3 Jul 2026". Accepts ISO string. */
export function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Human date + time, e.g. "3 Jul 2026, 4:30 pm". */
export function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Read a Blob/File into a base64 data URL (persists across refresh, unlike
 * URL.createObjectURL). Used by the mock media store to render images inline.
 */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export function fileToDataUrl(file: File): Promise<string> {
  return blobToDataUrl(file);
}

/**
 * Resolve a stored media reference to a displayable URL.
 *   • data:/blob:/http(s) values (mock uploads, pasted URLs) → returned as-is
 *   • bare S3 keys (real backend, e.g. "tenants/…/x.webp") → prefixed with
 *     NEXT_PUBLIC_MEDIA_BASE_URL (a public bucket/CDN origin). Without that env
 *     set, the key is returned unchanged and won't resolve — configure it to
 *     display real uploads.
 */
const MEDIA_BASE_URL = (process.env.NEXT_PUBLIC_MEDIA_BASE_URL ?? "").replace(/\/+$/, "");

/**
 * Whether MEDIA_BASE_URL is a *publicly readable* origin (a public bucket or a
 * CDN in front of a private one). Only then can we serve stable, cacheable key
 * URLs; against a private bucket the raw key URL 403s and we must fall back to
 * per-request presigned URLs. Defaults false — opt in once a public origin/CDN
 * is actually in place.
 */
const MEDIA_PUBLIC_READ = process.env.NEXT_PUBLIC_MEDIA_PUBLIC_READ === "true";

/**
 * SigV4 / GCS presigned URLs carry a per-request signature in the query string.
 * They already change on every fetch (so the browser can't cache them) and
 * appending our own query param would break the signature — detect and leave
 * such URLs untouched.
 */
function isPresigned(url: string): boolean {
  return /[?&](X-Amz-Signature|X-Amz-Credential|X-Goog-Signature|Signature)=/i.test(url);
}

/**
 * Resolve a stored media reference to a displayable URL, optionally appending a
 * `?v=<version>` cache-busting key.
 *   • data:/blob: (mock uploads, local previews) → returned as-is
 *   • presigned http(s) URLs → returned as-is (per-request signature; not
 *     cacheable, and must not gain extra query params)
 *   • stable public keys/URLs (a CDN key via NEXT_PUBLIC_MEDIA_BASE_URL, or a
 *     plain pasted URL) → `?v=<version>` appended when `version` is given, so
 *     the URL stays byte-stable across loads (browser-cacheable) yet changes the
 *     moment the image is replaced.
 */
export function mediaUrl(
  src?: string | null,
  version?: string | number | null,
): string | undefined {
  if (!src) return undefined;
  if (/^(data:|blob:)/i.test(src)) return src;

  let url: string;
  if (/^https?:\/\//i.test(src)) {
    if (isPresigned(src)) return src;
    url = src;
  } else if (!MEDIA_BASE_URL) {
    return src; // bare key with no public base configured — nothing to resolve
  } else {
    url = `${MEDIA_BASE_URL}/${src.replace(/^\/+/, "")}`;
  }

  if (version == null || version === "") return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}v=${encodeURIComponent(String(version))}`;
}

/**
 * Pick the most cache-friendly image source. When a public MEDIA_BASE_URL/CDN is
 * configured, the stable bare key beats a per-request presigned URL — a stable
 * URL is the only kind the browser can actually cache. Without a public base,
 * fall back to the presigned URL so private-bucket setups still render.
 */
export function preferStableSrc(
  key?: string | null,
  presignedUrl?: string | null,
): string | undefined {
  // Only prefer the stable public URL when the origin is actually publicly
  // readable; against a private bucket the raw key URL 403s, so fall back to the
  // per-request presigned URL (works, but not cacheable — front it with a CDN).
  if (MEDIA_BASE_URL && MEDIA_PUBLIC_READ && key) return key;
  return presignedUrl ?? key ?? undefined;
}

export function filesToDataUrls(files: File[]): Promise<string[]> {
  return Promise.all(Array.from(files).map(fileToDataUrl));
}

/** ISO date (yyyy-mm-dd) for <input type="date"> from an ISO datetime. */
export function toDateInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toISOString().slice(0, 10);
}
