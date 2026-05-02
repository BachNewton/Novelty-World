"use client";

import { useState } from "react";
import { ImageOff } from "lucide-react";
import { cn } from "@/shared/lib/utils";

interface HotlinkImageProps {
  src: string;
  alt: string;
  /** How the image fills its container.
   *  - `cover` / `contain`: container has fixed dimensions; img scales to fit.
   *  - `natural`: img keeps its intrinsic aspect ratio at full container
   *    width — used for masonry layouts where each card's height should
   *    follow its image's true proportions instead of being cropped. */
  fit?: "cover" | "contain" | "natural";
  className?: string;
  imgClassName?: string;
}

/**
 * Renders a hotlinked image from an arbitrary external URL with a loading
 * skeleton and an error fallback. Uses a plain `<img>` element rather than
 * `next/image` because catalogue images come from many uncontrolled hosts;
 * adding every host to remotePatterns is impractical, and the user
 * explicitly opted into hotlinking rather than Next's optimizer.
 */
export function HotlinkImage({
  src,
  alt,
  fit = "cover",
  className,
  imgClassName,
}: HotlinkImageProps) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");

  if (fit === "natural") {
    return (
      <div className={cn("relative w-full overflow-hidden", className)}>
        {status === "loading" && (
          <div className="aspect-[4/3] w-full animate-pulse bg-surface-elevated" />
        )}
        {status === "error" && (
          <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 bg-surface-elevated text-text-muted">
            <ImageOff size={28} />
            <span className="text-xs">Image failed to load</span>
          </div>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element -- catalogue images are user-curated hotlinks from arbitrary hosts; per-host remotePatterns config is impractical and Next's optimizer is intentionally bypassed for these external URLs */}
        <img
          src={src}
          alt={alt}
          onLoad={() => setStatus("loaded")}
          onError={() => setStatus("error")}
          className={cn(
            // Don't use `hidden` here — it removes the layout box, and a
            // lazy-loading img with no layout box is never observed as
            // in-viewport, so the browser never starts the load and
            // onLoad never fires. Stack the img after the placeholder
            // so the placeholder reserves space until the real height
            // is known from natural sizing.
            "block h-auto w-full",
            status === "loaded" ? "" : "absolute inset-x-0 top-0 opacity-0",
            imgClassName,
          )}
        />
      </div>
    );
  }

  return (
    <div className={cn("relative h-full w-full overflow-hidden", className)}>
      {status === "loading" && (
        <div className="absolute inset-0 animate-pulse bg-surface-elevated" />
      )}
      {status === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-surface-elevated text-text-muted">
          <ImageOff size={28} />
          <span className="text-xs">Image failed to load</span>
        </div>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element -- catalogue images are user-curated hotlinks from arbitrary hosts; per-host remotePatterns config is impractical and Next's optimizer is intentionally bypassed for these external URLs */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onLoad={() => setStatus("loaded")}
        onError={() => setStatus("error")}
        className={cn(
          "h-full w-full transition-opacity duration-300",
          fit === "cover" ? "object-cover" : "object-contain",
          status === "loaded" ? "opacity-100" : "opacity-0",
          imgClassName,
        )}
      />
    </div>
  );
}
