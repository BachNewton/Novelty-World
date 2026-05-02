"use client";

import { useState } from "react";
import { ImageOff } from "lucide-react";
import { cn } from "@/shared/lib/utils";

interface HotlinkImageProps {
  src: string;
  alt: string;
  fit?: "cover" | "contain";
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
