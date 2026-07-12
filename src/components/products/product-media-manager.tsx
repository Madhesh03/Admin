"use client";

import * as React from "react";
import { Upload, Link2, Trash2, Star } from "lucide-react";
import { confirmMedia, deleteMedia, presignMedia } from "@/lib/admin-api";
import { fileToDataUrl } from "@/lib/utils";
import type { ProductMedia } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Thumb } from "@/components/ui/thumb";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

/**
 * Media manager using the real S3 direct-upload flow: presign → (PUT bytes) →
 * confirm, plus delete. In the mock the base64/URL is passed straight as the
 * s3_key; the backend swap PUTs bytes to the presigned URL then confirms the
 * returned key. Post-upload reorder/set-primary has no API endpoint yet, so
 * primary is chosen at upload time and deletes auto-promote the next image.
 */
export function ProductMediaManager({
  productId,
  media,
  onChanged,
}: {
  productId: string;
  media: ProductMedia[];
  onChanged: () => void;
}) {
  const [url, setUrl] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [primaryNext, setPrimaryNext] = React.useState(media.length === 0);
  const fileRef = React.useRef<HTMLInputElement>(null);

  async function storeOne(s3Key: string, fileName: string, mime: string, isPrimary: boolean) {
    // TODO(backend): PUT the file bytes to presign_url, then confirm the real s3_key.
    const { s3_key } = await presignMedia({
      product_id: productId,
      media_type: "image",
      file_name: fileName,
      mime_type: mime,
    });
    void s3_key; // mock ignores the mock path; stores the data-URI/URL instead
    await confirmMedia({
      product_id: productId,
      s3_key: s3Key,
      media_type: "image",
      file_name: fileName,
      mime_type: mime,
      is_primary: isPrimary,
    });
  }

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      let makePrimary = primaryNext;
      for (const file of Array.from(files)) {
        const dataUrl = await fileToDataUrl(file);
        await storeOne(dataUrl, file.name, file.type || "image/*", makePrimary);
        makePrimary = false; // only the first can claim primary
      }
      setPrimaryNext(false);
      toast.success(`Added ${files.length} image${files.length > 1 ? "s" : ""}`);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function addUrl() {
    const trimmed = url.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      await storeOne(trimmed, "pasted-url", "image/*", primaryNext);
      setPrimaryNext(false);
      setUrl("");
      toast.success("Image added");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add image");
    } finally {
      setBusy(false);
    }
  }

  async function remove(m: ProductMedia) {
    setBusy(true);
    try {
      await deleteMedia(m.id);
      toast.success("Image removed");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {media.length > 0 && (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {media.map((m) => (
            <div
              key={m.id}
              className={cn(
                "group relative aspect-square overflow-hidden rounded-lg border",
                m.is_primary ? "border-forest ring-1 ring-forest/30" : "border-line",
              )}
            >
              <Thumb src={m.s3_key} alt={m.alt_text} className="size-full rounded-none" />
              {m.is_primary && (
                <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-0.5 rounded bg-forest px-1.5 py-0.5 text-[10px] font-bold text-white">
                  <Star className="size-2.5" />Primary
                </span>
              )}
              <div className="absolute inset-x-0 bottom-0 flex justify-end bg-gradient-to-t from-ink/60 to-transparent p-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  type="button"
                  title="Remove"
                  disabled={busy}
                  onClick={() => remove(m)}
                  className="rounded bg-white/90 p-1 text-red-600 hover:bg-white"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <label className="flex items-center gap-2 text-xs text-muted">
        <input
          type="checkbox"
          checked={primaryNext}
          onChange={(e) => setPrimaryNext(e.target.checked)}
          className="size-3.5 accent-[var(--color-forest)]"
        />
        Set next upload as the primary image
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
        <Button type="button" variant="secondary" size="sm" loading={busy} onClick={() => fileRef.current?.click()}>
          <Upload className="size-4" />Upload images
        </Button>
        <span className="text-xs text-faint">or</span>
        <div className="flex min-w-[220px] flex-1 items-center gap-2">
          <div className="relative flex-1">
            <Link2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
            <Input
              className="h-8 pl-9 text-xs"
              placeholder="Paste an image URL…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addUrl(); } }}
            />
          </div>
          <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={addUrl}>Add</Button>
        </div>
      </div>
    </div>
  );
}
