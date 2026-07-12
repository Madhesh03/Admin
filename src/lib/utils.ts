import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge conditional class names, de-duplicating Tailwind conflicts. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format an INR integer-rupee amount, e.g. 1299 -> "₹1,299". (Brief §7) */
export const formatPrice = (v: number) => `₹${v.toLocaleString("en-IN")}`;

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
 * Read a File into a base64 data URL (brief §8 — persists across refresh,
 * unlike URL.createObjectURL). // TODO(backend): upload to storage, store URL.
 */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function filesToDataUrls(files: File[]): Promise<string[]> {
  return Promise.all(Array.from(files).map(fileToDataUrl));
}

/** ISO date (yyyy-mm-dd) for <input type="date"> from an ISO datetime. */
export function toDateInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toISOString().slice(0, 10);
}
