"use client";

import { useState, useEffect } from "react";
import { ImageOff } from "lucide-react";

interface MapImageProps {
  src: string | null;
  alt: string;
  nextSrc?: string | null;
}

export function MapImage({ src, alt, nextSrc }: MapImageProps) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">(
    "loading",
  );

  // Preload the next image
  useEffect(() => {
    if (!nextSrc) return;
    const img = new Image();
    img.src = nextSrc;
  }, [nextSrc]);

  if (!src) {
    return (
      <div className="flex aspect-video w-full max-w-2xl items-center justify-center rounded-lg bg-surface-elevated">
        <div className="flex flex-col items-center gap-2 text-text-muted">
          <ImageOff size={32} />
          <span className="text-sm">Image unavailable</span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative aspect-video w-full max-w-2xl overflow-hidden rounded-lg bg-surface-elevated">
      {status === "loading" && (
        <div className="absolute inset-0 animate-pulse bg-surface-elevated" />
      )}
      {status === "error" && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2 text-text-muted">
            <ImageOff size={32} />
            <span className="text-sm">Failed to load image</span>
          </div>
        </div>
      )}
      <img
        src={src}
        alt={alt}
        loading="eager"
        onLoad={() => setStatus("loaded")}
        onError={() => setStatus("error")}
        className={`h-full w-full object-cover transition-opacity duration-300 ${
          status === "loaded" ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
}
