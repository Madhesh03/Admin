/**
 * Shared product-image upload helper — the S3 direct-upload flow used by both
 * the edit-page media manager and the new-product image picker.
 *
 *   1. presign → { presigned_url, s3_key }
 *   2. PUT the raw bytes to presigned_url (real backend only)
 *   3. confirm the returned s3_key
 *
 * In mock mode there is no S3: the base64 data-URI is stashed as the "s3_key"
 * so the thumbnail renders inline. Keeping this in one place means the new and
 * edit flows can never drift apart.
 */
import {
  confirmCategoryImage,
  confirmMedia,
  presignCategoryImage,
  presignMedia,
  USE_MOCKS,
} from "./admin-api";
import type { ProductMedia } from "./types";
import { blobToDataUrl } from "./utils";

/**
 * Long-lived cache directive for uploaded images. Safe as `immutable` because
 * every upload mints a NEW s3 key, so a replaced image is always a new URL —
 * the byte content behind a given key never changes. Sent on the S3 PUT so the
 * object carries it for good. This only takes effect if the presigned PUT URL
 * was signed to include `Cache-Control` (backend: add CacheControl to the
 * generate_presigned_url Params); otherwise S3 rejects the unsigned header.
 */
const IMAGE_CACHE_CONTROL = "public, max-age=31536000, immutable";

export async function uploadProductImage({
  productId,
  blob,
  fileName,
  mime,
  isPrimary,
}: {
  productId: string;
  blob: Blob;
  fileName: string;
  mime: string;
  isPrimary: boolean;
}): Promise<ProductMedia> {
  const { presigned_url, s3_key } = await presignMedia({
    product_id: productId,
    media_type: "image",
    file_name: fileName,
    mime_type: mime,
  });

  if (USE_MOCKS) {
    const dataUrl = await blobToDataUrl(blob);
    return confirmMedia({
      product_id: productId,
      s3_key: dataUrl,
      media_type: "image",
      file_name: fileName,
      mime_type: mime,
      is_primary: isPrimary,
    });
  }

  const put = await fetch(presigned_url, {
    method: "PUT",
    headers: { "Content-Type": mime, "Cache-Control": IMAGE_CACHE_CONTROL },
    body: blob,
  });
  if (!put.ok) {
    throw new Error(`Upload to storage failed (${put.status}). Check the bucket's CORS rules.`);
  }
  return confirmMedia({
    product_id: productId,
    s3_key, // the real key from presign — required by the backend's validation
    media_type: "image",
    file_name: fileName,
    mime_type: mime,
    file_size: blob.size,
    is_primary: isPrimary,
  });
}

/**
 * Upload a category thumbnail via the S3 direct-upload flow (presign → PUT →
 * confirm) and return the value to store in `category.image_key`.
 *
 *   • real: bytes are PUT to the presigned URL, then the bare `s3_key` is
 *     confirmed and returned — `mediaUrl` resolves it via NEXT_PUBLIC_MEDIA_BASE_URL.
 *   • mock: no S3 round-trip — the base64 data-URI is confirmed and returned so
 *     <Thumb> renders it inline.
 *
 * Unlike products, a category has no media table: the returned key lives on the
 * category record, so persisting it happens when the category is saved.
 */
export async function uploadCategoryImage({
  blob,
  fileName,
  mime,
}: {
  blob: Blob;
  fileName: string;
  mime: string;
}): Promise<string> {
  const { presigned_url, s3_key } = await presignCategoryImage({
    file_name: fileName,
    mime_type: mime,
  });

  if (USE_MOCKS) {
    const dataUrl = await blobToDataUrl(blob);
    const { image_key } = await confirmCategoryImage({
      s3_key: dataUrl,
      file_name: fileName,
      mime_type: mime,
    });
    return image_key;
  }

  const put = await fetch(presigned_url, {
    method: "PUT",
    headers: { "Content-Type": mime, "Cache-Control": IMAGE_CACHE_CONTROL },
    body: blob,
  });
  if (!put.ok) {
    throw new Error(`Upload to storage failed (${put.status}). Check the bucket's CORS rules.`);
  }
  const { image_key } = await confirmCategoryImage({
    s3_key, // the real key from presign — required by the backend's validation
    file_name: fileName,
    mime_type: mime,
    file_size: blob.size,
  });
  return image_key;
}

/** A pasted image URL, added directly (mock) or fetched then uploaded (real). */
export async function uploadProductImageFromUrl({
  productId,
  url,
  isPrimary,
}: {
  productId: string;
  url: string;
  isPrimary: boolean;
}): Promise<ProductMedia> {
  if (USE_MOCKS) {
    // Mock store renders arbitrary URLs directly — no S3 round-trip.
    await presignMedia({
      product_id: productId,
      media_type: "image",
      file_name: "pasted-url",
      mime_type: "image/*",
    });
    return confirmMedia({
      product_id: productId,
      s3_key: url,
      media_type: "image",
      file_name: "pasted-url",
      mime_type: "image/*",
      is_primary: isPrimary,
    });
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not fetch that URL (${res.status})`);
  const blob = await res.blob();
  const name = url.split("/").pop()?.split("?")[0] || "image";
  return uploadProductImage({
    productId,
    blob,
    fileName: name,
    mime: blob.type || "application/octet-stream",
    isPrimary,
  });
}
