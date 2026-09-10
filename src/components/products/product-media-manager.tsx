"use client";

import * as React from "react";
import { Upload, Link2, Trash2, Star, Eye, ImagePlus, ZoomIn, RotateCcw } from "lucide-react";
import { deleteMedia } from "@/lib/admin-api";
import { uploadProductImage, uploadProductImageFromUrl } from "@/lib/media-upload";
import type { ProductMedia } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Thumb } from "@/components/ui/thumb";
import { ImageZoomModal } from "@/components/ui/image-zoom";
import { toast } from "@/components/ui/toast";
import { cn, mediaUrl, preferStableSrc } from "@/lib/utils";

/**
 * Media manager using the real S3 direct-upload flow (presign → PUT → confirm),
 * plus delete. Images can be dragged in, browsed, or pasted as a URL, previewed
 * with zoom, and one marked primary and/or a (different) one marked hover — the
 * image swapped in when a shopper hovers the product card on the storefront.
 * Post-upload reorder/set-primary/set-hover has no API endpoint yet, so both
 * are chosen at upload time and deletes auto-promote the next image (primary
 * only — hover has no forced replacement, a product can have none). The upload
 * plumbing lives in `@/lib/media-upload`.
 */
export function ProductMediaManager({
  productId,
  media,
  onChanged,
  hideAdd = false,
  onToggleRemove,
  removedIds,
}: {
  productId: string;
  media: ProductMedia[];
  onChanged: () => void;
  /** Hide the upload/URL controls — show existing media (with delete) only. */
  hideAdd?: boolean;
  /**
   * When provided, the trash button marks/unmarks an image for deletion instead
   * of deleting it live — the parent performs the delete on save. Pair with
   * `removedIds` to render the marked (pending-removal) state.
   */
  onToggleRemove?: (id: string) => void;
  removedIds?: ReadonlySet<string>;
}) {
  const [url, setUrl] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  const [primaryNext, setPrimaryNext] = React.useState(media.length === 0);
  // A single image can't be both (the backend rejects it — a hover "swap" to
  // itself is a no-op) so checking one clears the other.
  const [hoverNext, setHoverNext] = React.useState(false);
  const [zoom, setZoom] = React.useState<number | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  function togglePrimaryNext(v: boolean) {
    setPrimaryNext(v);
    if (v) setHoverNext(false);
  }
  function toggleHoverNext(v: boolean) {
    setHoverNext(v);
    if (v) setPrimaryNext(false);
  }

  async function handleFiles(files: FileList | null) {
    const images = Array.from(files ?? []).filter((f) => f.type.startsWith("image/"));
    if (!images.length) return;
    setBusy(true);
    try {
      let makePrimary = primaryNext;
      let makeHover = hoverNext;
      for (const file of images) {
        await uploadProductImage({
          productId,
          blob: file,
          fileName: file.name,
          mime: file.type || "application/octet-stream",
          isPrimary: makePrimary,
          isHover: makeHover,
        });
        // only the first upload in a batch can claim primary/hover
        makePrimary = false;
        makeHover = false;
      }
      setPrimaryNext(false);
      setHoverNext(false);
      toast.success(`Added ${images.length} image${images.length > 1 ? "s" : ""}`);
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
      await uploadProductImageFromUrl({ productId, url: trimmed, isPrimary: primaryNext, isHover: hoverNext });
      setPrimaryNext(false);
      setHoverNext(false);
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
          {media.map((m, i) => {
            const marked = removedIds?.has(m.id) ?? false;
            return (
            <div
              key={m.id}
              className={cn(
                "group relative aspect-square overflow-hidden rounded-lg border",
                m.is_primary ? "border-forest ring-1 ring-forest/30" : m.is_hover ? "border-amber-500 ring-1 ring-amber-500/30" : "border-line",
                marked && "opacity-40 ring-1 ring-red-500",
              )}
            >
              <Thumb src={preferStableSrc(m.s3_key, m.view_url)} version={m.id} alt={m.alt_text} className="size-full rounded-none" />
              {marked ? (
                <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-0.5 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  Will be removed
                </span>
              ) : (
                <>
                  {m.is_primary && (
                    <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-0.5 rounded bg-forest px-1.5 py-0.5 text-[10px] font-bold text-white">
                      <Star className="size-2.5" />Primary
                    </span>
                  )}
                  {m.is_hover && (
                    <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-0.5 rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                      <Eye className="size-2.5" />Hover
                    </span>
                  )}
                </>
              )}
              <div className="absolute inset-0 flex flex-col justify-between bg-gradient-to-t from-ink/60 via-transparent to-transparent p-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                <div className="flex justify-start">
                  <button
                    type="button"
                    title="Preview"
                    onClick={() => setZoom(i)}
                    className="rounded bg-white/90 p-1 text-ink hover:bg-white"
                  >
                    <ZoomIn className="size-3.5" />
                  </button>
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    title={onToggleRemove ? (marked ? "Restore" : "Remove") : "Remove"}
                    disabled={busy}
                    onClick={() => (onToggleRemove ? onToggleRemove(m.id) : remove(m))}
                    className={cn(
                      "rounded bg-white/90 p-1 hover:bg-white",
                      marked ? "text-forest" : "text-red-600",
                    )}
                  >
                    {marked ? <RotateCcw className="size-3.5" /> : <Trash2 className="size-3.5" />}
                  </button>
                </div>
              </div>
            </div>
            );
          })}
        </div>
      )}

      {!hideAdd && (
      <>
      {/* Drop zone */}
      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
      <button
        type="button"
        disabled={busy}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
        className={cn(
          "flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors",
          dragging ? "border-forest bg-sage/40" : "border-line-strong hover:border-forest/60 hover:bg-surface",
          busy && "pointer-events-none opacity-50",
        )}
      >
        <span className={cn("rounded-full p-2.5", dragging ? "bg-forest text-white" : "bg-surface text-forest")}>
          <ImagePlus className="size-5" />
        </span>
        <span className="text-sm font-semibold text-ink">
          {dragging ? "Drop to upload" : "Drag & drop images, or click to browse"}
        </span>
        <span className="text-xs text-muted">PNG, JPG, WEBP</span>
      </button>

      <label className="flex items-center gap-2 text-xs text-muted">
        <input
          type="checkbox"
          checked={primaryNext}
          onChange={(e) => togglePrimaryNext(e.target.checked)}
          className="size-3.5 accent-[var(--color-forest)]"
        />
        Set next upload as the primary image
      </label>

      <label className="flex items-center gap-2 text-xs text-muted">
        <input
          type="checkbox"
          checked={hoverNext}
          onChange={(e) => toggleHoverNext(e.target.checked)}
          className="size-3.5 accent-amber-500"
        />
        Set next upload as the hover image
        <span className="text-faint">— shown when a shopper hovers the product card</span>
      </label>

      <div className="flex items-center gap-2">
        <span className="text-xs text-faint">or paste a URL</span>
        <div className="relative flex-1">
          <Link2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <Input
            className="h-8 pl-9 text-xs"
            placeholder="https://…/image.jpg"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addUrl(); } }}
          />
        </div>
        <Button type="button" variant="secondary" size="sm" loading={busy} disabled={!url.trim()} onClick={addUrl}>
          <Upload className="size-4" />Add
        </Button>
      </div>
      </>
      )}

      <ImageZoomModal
        images={media.map((m) => ({
          src: mediaUrl(preferStableSrc(m.s3_key, m.view_url), m.id),
          alt: m.alt_text,
          label: m.file_name,
        }))}
        index={zoom}
        onIndexChange={setZoom}
        onClose={() => setZoom(null)}
      />
    </div>
  );
}
