"use client";

import * as React from "react";
import { Upload, Trash2, Star, Eye, ImagePlus, ZoomIn } from "lucide-react";
import { cn } from "@/lib/utils";
import { ImageZoomModal } from "@/components/ui/image-zoom";

export interface PendingImage {
  id: string;
  file: File;
  url: string; // object URL for local preview
  isPrimary: boolean;
  /** Shown in place of the primary image when a shopper hovers the product card. */
  isHover: boolean;
}

/** Create a PendingImage (with a preview object URL) from a File. */
function toPending(file: File, isPrimary: boolean): PendingImage {
  return {
    id: `${file.name}-${file.size}-${crypto.randomUUID()}`,
    file,
    url: URL.createObjectURL(file),
    isPrimary,
    isHover: false,
  };
}

/**
 * Image picker for the *new* product page. Images can be dragged in or browsed,
 * are previewed instantly from a local object URL, one marked primary and/or a
 * different one marked hover (the image swapped in when a shopper hovers the
 * product card), and zoomed — but nothing is uploaded until the product is
 * created (there is no product id yet). The parent uploads `value` after
 * createProduct succeeds.
 */
export function PendingImagePicker({
  value,
  onChange,
  disabled,
}: {
  value: PendingImage[];
  onChange: (next: PendingImage[]) => void;
  disabled?: boolean;
}) {
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = React.useState(false);
  const [zoom, setZoom] = React.useState<number | null>(null);

  // Revoke every preview URL we created when the picker unmounts.
  const valueRef = React.useRef(value);
  valueRef.current = value;
  React.useEffect(() => {
    return () => valueRef.current.forEach((p) => URL.revokeObjectURL(p.url));
  }, []);

  function addFiles(files: FileList | null) {
    const images = Array.from(files ?? []).filter((f) => f.type.startsWith("image/"));
    if (!images.length) return;
    const hasPrimary = value.some((p) => p.isPrimary);
    const additions = images.map((f, i) => toPending(f, !hasPrimary && i === 0));
    onChange([...value, ...additions]);
  }

  function remove(id: string) {
    const target = value.find((p) => p.id === id);
    if (target) URL.revokeObjectURL(target.url);
    let next = value.filter((p) => p.id !== id);
    // Promote a new primary if we removed the current one. Hover has no
    // forced replacement — a product can validly have none.
    if (target?.isPrimary && next.length && !next.some((p) => p.isPrimary)) {
      next = next.map((p, i) => (i === 0 ? { ...p, isPrimary: true } : p));
    }
    onChange(next);
  }

  function makePrimary(id: string) {
    // Primary and hover are mutually exclusive on the same image (the swap
    // would be a no-op), so claiming primary here clears hover if it was set.
    onChange(value.map((p) => ({ ...p, isPrimary: p.id === id, isHover: p.id === id ? false : p.isHover })));
  }

  function makeHover(id: string) {
    onChange(value.map((p) => ({ ...p, isHover: p.id === id, isPrimary: p.id === id ? false : p.isPrimary })));
  }

  function clearHover(id: string) {
    onChange(value.map((p) => (p.id === id ? { ...p, isHover: false } : p)));
  }

  return (
    <div className="space-y-3">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {/* Drop zone */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          addFiles(e.dataTransfer.files);
        }}
        className={cn(
          "flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors",
          dragging ? "border-forest bg-sage/40" : "border-line-strong hover:border-forest/60 hover:bg-surface",
          disabled && "pointer-events-none opacity-50",
        )}
      >
        <span className={cn("rounded-full p-2.5", dragging ? "bg-forest text-white" : "bg-surface text-forest")}>
          <ImagePlus className="size-5" />
        </span>
        <span className="text-sm font-semibold text-ink">
          {dragging ? "Drop to add images" : "Drag & drop images here"}
        </span>
        <span className="text-xs text-muted">or click to browse — PNG, JPG, WEBP</span>
      </button>

      {value.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {value.map((p, i) => (
              <div
                key={p.id}
                className={cn(
                  "group relative aspect-square overflow-hidden rounded-lg border",
                  p.isPrimary ? "border-forest ring-1 ring-forest/30" : p.isHover ? "border-amber-500 ring-1 ring-amber-500/30" : "border-line",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={p.file.name} className="size-full object-cover" />

                {p.isPrimary && (
                  <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-0.5 rounded bg-forest px-1.5 py-0.5 text-[10px] font-bold text-white">
                    <Star className="size-2.5" />Primary
                  </span>
                )}
                {p.isHover && (
                  <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-0.5 rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                    <Eye className="size-2.5" />Hover
                  </span>
                )}

                {/* Hover controls */}
                <div className="absolute inset-0 flex flex-col justify-between bg-gradient-to-t from-ink/70 via-transparent to-ink/10 p-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <div className="flex justify-end">
                    <button
                      type="button"
                      title="Preview"
                      onClick={() => setZoom(i)}
                      className="rounded bg-white/90 p-1 text-ink hover:bg-white"
                    >
                      <ZoomIn className="size-3.5" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex gap-1">
                      {!p.isPrimary && (
                        <button
                          type="button"
                          title="Set as primary"
                          onClick={() => makePrimary(p.id)}
                          className="rounded bg-white/90 p-1 text-forest hover:bg-white"
                        >
                          <Star className="size-3.5" />
                        </button>
                      )}
                      {p.isHover ? (
                        <button
                          type="button"
                          title="Unset as hover image"
                          onClick={() => clearHover(p.id)}
                          className="rounded bg-amber-500 p-1 text-white hover:bg-amber-600"
                        >
                          <Eye className="size-3.5" />
                        </button>
                      ) : (
                        !p.isPrimary && (
                          <button
                            type="button"
                            title="Set as hover image"
                            onClick={() => makeHover(p.id)}
                            className="rounded bg-white/90 p-1 text-amber-600 hover:bg-white"
                          >
                            <Eye className="size-3.5" />
                          </button>
                        )
                      )}
                    </div>
                    <button
                      type="button"
                      title="Remove"
                      disabled={disabled}
                      onClick={() => remove(p.id)}
                      className="rounded bg-white/90 p-1 text-red-600 hover:bg-white"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <Upload className="size-3.5" />
            {value.length} image{value.length > 1 ? "s" : ""} ready — uploaded automatically when you save.
          </p>
        </>
      )}

      <ImageZoomModal
        images={value.map((p) => ({ src: p.url, alt: p.file.name, label: p.file.name }))}
        index={zoom}
        onIndexChange={setZoom}
        onClose={() => setZoom(null)}
      />
    </div>
  );
}
