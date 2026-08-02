"use client";

import * as React from "react";
import { ImageOff } from "lucide-react";
import { cn, mediaUrl } from "@/lib/utils";

/**
 * Image with a graceful fallback. Uses a plain <img> (not next/image) so that
 * base64 data URLs and arbitrary pasted URLs render without remote-pattern
 * config — appropriate for a mock-first admin tool.
 */
export function Thumb({
  src,
  alt,
  className,
  version,
}: {
  src?: string;
  alt: string;
  className?: string;
  /** Cache-busting key (e.g. media id / updated_at) appended as `?v=` to
   *  stable CDN URLs so they cache across loads yet refresh when replaced. */
  version?: string | number | null;
}) {
  const [failed, setFailed] = React.useState(false);
  const resolved = mediaUrl(src, version);
  // Retry when the source changes (e.g. a versioned URL after a replaced image).
  React.useEffect(() => setFailed(false), [resolved]);
  const showFallback = !resolved || failed;

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
          src={resolved}
          alt={alt}
          className="size-full object-cover"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}
