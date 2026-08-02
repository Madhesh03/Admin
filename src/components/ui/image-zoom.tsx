"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { ZoomIn, ZoomOut, RotateCcw, X, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ZoomImage {
  src?: string;
  alt: string;
  /** Small caption shown in the toolbar, e.g. the file name. */
  label?: string;
}

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const STEP = 0.5;

/**
 * Full-screen image viewer with zoom + pan. Zoom via the toolbar buttons, the
 * scroll wheel, or +/- keys; pan by dragging once zoomed in. When multiple
 * images are supplied, the arrow keys / chevrons page between them. Rendered in
 * a portal so it escapes any overflow/stacking context of the trigger.
 */
export function ImageZoomModal({
  images,
  index,
  onIndexChange,
  onClose,
}: {
  images: ZoomImage[];
  index: number | null;
  onIndexChange: (next: number) => void;
  onClose: () => void;
}) {
  const [mounted, setMounted] = React.useState(false);
  const [scale, setScale] = React.useState(1);
  const [offset, setOffset] = React.useState({ x: 0, y: 0 });
  const drag = React.useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  React.useEffect(() => setMounted(true), []);

  const open = index !== null && index >= 0 && index < images.length;

  // Reset the transform whenever the viewer opens on a new image.
  const resetView = React.useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);
  React.useEffect(() => {
    resetView();
  }, [index, resetView]);

  const zoomBy = React.useCallback((delta: number) => {
    setScale((s) => {
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, +(s + delta).toFixed(2)));
      if (next === MIN_SCALE) setOffset({ x: 0, y: 0 });
      return next;
    });
  }, []);

  const hasMany = images.length > 1;
  const go = React.useCallback(
    (dir: number) => {
      if (index === null) return;
      const next = (index + dir + images.length) % images.length;
      onIndexChange(next);
    },
    [index, images.length, onIndexChange],
  );

  // Keyboard controls while open.
  React.useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "+" || e.key === "=") zoomBy(STEP);
      else if (e.key === "-" || e.key === "_") zoomBy(-STEP);
      else if (e.key === "0") resetView();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, zoomBy, resetView, go]);

  if (!mounted || !open || index === null) return null;
  const active = images[index];

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    zoomBy(e.deltaY < 0 ? STEP : -STEP);
  }

  function onPointerDown(e: React.PointerEvent) {
    if (scale <= 1) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    setOffset({
      x: drag.current.ox + (e.clientX - drag.current.x),
      y: drag.current.oy + (e.clientY - drag.current.y),
    });
  }
  function endDrag() {
    drag.current = null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-ink/85 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={active.alt}
      onClick={onClose}
    >
      {/* Toolbar */}
      <div
        className="flex items-center justify-between gap-2 p-3 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="max-w-[50%] truncate text-sm text-white/80">
          {active.label ?? active.alt}
          {hasMany && <span className="ml-2 text-white/50">{index + 1} / {images.length}</span>}
        </span>
        <div className="flex items-center gap-1">
          <ToolButton title="Zoom out (-)" disabled={scale <= MIN_SCALE} onClick={() => zoomBy(-STEP)}>
            <ZoomOut className="size-4" />
          </ToolButton>
          <span className="w-12 text-center text-xs tabular-nums text-white/70">
            {Math.round(scale * 100)}%
          </span>
          <ToolButton title="Zoom in (+)" disabled={scale >= MAX_SCALE} onClick={() => zoomBy(STEP)}>
            <ZoomIn className="size-4" />
          </ToolButton>
          <ToolButton title="Reset (0)" disabled={scale === 1 && offset.x === 0 && offset.y === 0} onClick={resetView}>
            <RotateCcw className="size-4" />
          </ToolButton>
          <ToolButton title="Close (Esc)" onClick={onClose}>
            <X className="size-4" />
          </ToolButton>
        </div>
      </div>

      {/* Stage */}
      <div
        className="relative flex flex-1 select-none items-center justify-center overflow-hidden"
        onWheel={onWheel}
      >
        {hasMany && (
          <ToolButton
            title="Previous (←)"
            className="absolute left-3 top-1/2 -translate-y-1/2"
            onClick={(e) => { e.stopPropagation(); go(-1); }}
          >
            <ChevronLeft className="size-6" />
          </ToolButton>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={active.src}
          alt={active.alt}
          draggable={false}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={() => (scale > 1 ? resetView() : zoomBy(STEP * 2))}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className={cn(
            "max-h-full max-w-full object-contain shadow-2xl transition-transform",
            scale > 1 ? (drag.current ? "cursor-grabbing" : "cursor-grab") : "cursor-zoom-in",
          )}
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transitionDuration: drag.current ? "0ms" : "120ms",
          }}
        />
        {hasMany && (
          <ToolButton
            title="Next (→)"
            className="absolute right-3 top-1/2 -translate-y-1/2"
            onClick={(e) => { e.stopPropagation(); go(1); }}
          >
            <ChevronRight className="size-6" />
          </ToolButton>
        )}
      </div>
    </div>,
    document.body,
  );
}

function ToolButton({
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        "rounded-lg p-2 text-white/90 transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-30",
        className,
      )}
      {...props}
    />
  );
}
