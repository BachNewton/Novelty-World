"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { ImageOff } from "lucide-react";

interface PokemonImageProps {
  src: string;
  alt: string;
  nextSrc?: string;
}

export function PokemonImage({ src, alt, nextSrc }: PokemonImageProps) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">(
    "loading",
  );

  useEffect(() => {
    if (!nextSrc) return;
    const img = new window.Image();
    img.src = nextSrc;
  }, [nextSrc]);

  return (
    <div className="relative isolate z-0 aspect-square w-full max-w-[220px] sm:max-w-[260px]">
      {/* Loading / error fallback — self-contained rounded box. */}
      {status === "loading" && (
        <div className="absolute inset-0 animate-pulse rounded-lg bg-surface-elevated" />
      )}
      {status === "error" && (
        <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-surface-elevated">
          <div className="flex flex-col items-center gap-2 text-text-muted">
            <ImageOff size={32} />
            <span className="text-sm">Failed to load sprite</span>
          </div>
        </div>
      )}

      {/* Ambient glow: two stacked copies of the sprite, blurred and scaled.
          No overflow-hidden on the wrapper, so the blur naturally bleeds past
          the image frame into surrounding space. */}
      <Image
        src={src}
        alt=""
        aria-hidden
        fill
        priority
        sizes="(max-width: 480px) 100vw, 260px"
        className={`pointer-events-none scale-[2] object-cover blur-[100px] saturate-[4] brightness-150 transition-opacity duration-300 ${
          status === "loaded" ? "opacity-100" : "opacity-0"
        }`}
      />
      <Image
        src={src}
        alt=""
        aria-hidden
        fill
        priority
        sizes="(max-width: 480px) 100vw, 260px"
        style={{ mixBlendMode: "plus-lighter" }}
        className={`pointer-events-none scale-[2] object-cover blur-[100px] saturate-[4] transition-opacity duration-300 ${
          status === "loaded" ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* Sharp foreground sprite. */}
      <Image
        src={src}
        alt={alt}
        fill
        priority
        sizes="(max-width: 480px) 100vw, 260px"
        onLoad={() => setStatus("loaded")}
        onError={() => setStatus("error")}
        className={`relative object-contain transition-opacity duration-300 ${
          status === "loaded" ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
}
