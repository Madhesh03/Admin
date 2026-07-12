"use client";

import * as React from "react";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Image with a graceful fallback. Uses a plain <img> (not next/image) so that
 * base64 data URLs and arbitrary pasted URLs render without remote-pattern
 * config — appropriate for a mock-first admin tool.
 */
export function Thumb({
  src,
  alt,
  className,
}: {
  src?: string;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = React.useState(false);
  const showFallback = !src || failed;

  return (
    <div
      className={cn(
        "relative flex items-center justify-center overflow-hidden rounded-md bg-surface",
        className,
      )}
    >
      {showFallback ? (
        <ImageOff className="size-1/3 text-faint" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          className="size-full object-cover"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}
