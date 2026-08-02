"use client";

import * as React from "react";
import { Upload, Trash2, Star, ImagePlus, ZoomIn } from "lucide-react";
import { cn } from "@/lib/utils";
import { ImageZoomModal } from "@/components/ui/image-zoom";

export interface PendingImage {
  id: string;
  file: File;
  url: string; // object URL for local preview
  isPrimary: boolean;
}

/** Create a PendingImage (with a preview object URL) from a File. */
function toPending(file: File, isPrimary: boolean): PendingImage {
  return {
    id: `${file.name}-${file.size}-${crypto.randomUUID()}`,
    file,
    url: URL.createObjectURL(file),
    isPrimary,
  };
}

/**
 * Image picker for the *new* product page. Images can be dragged in or browsed,
 * are previewed instantly from a local object URL, reordered by primary, and
 * zoomed — but nothing is uploaded until the product is created (there is no
 * product id yet). The parent uploads `value` after createProduct succeeds.
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
    // Promote a new primary if we removed the current one.
    if (target?.isPrimary && next.length && !next.some((p) => p.isPrimary)) {
      next = next.map((p, i) => (i === 0 ? { ...p, isPrimary: true } : p));
    }
    onChange(next);
  }

  function makePrimary(id: string) {
    onChange(value.map((p) => ({ ...p, isPrimary: p.id === id })));
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
                  p.isPrimary ? "border-forest ring-1 ring-forest/30" : "border-line",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={p.file.name} className="size-full object-cover" />

                {p.isPrimary && (
                  <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-0.5 rounded bg-forest px-1.5 py-0.5 text-[10px] font-bold text-white">
                    <Star className="size-2.5" />Primary
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
                    {!p.isPrimary ? (
                      <button
                        type="button"
                        title="Set as primary"
                        onClick={() => makePrimary(p.id)}
                        className="rounded bg-white/90 p-1 text-forest hover:bg-white"
                      >
                        <Star className="size-3.5" />
                      </button>
                    ) : (
                      <span />
                    )}
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
            {value.length} image{value.length > 1 ? "s" : ""} ready — uploaded automatically once you create the product.
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
