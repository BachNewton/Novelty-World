"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { HotlinkImage } from "./hotlink-image";

export function ImageCarousel({
  images,
  alt,
}: {
  images: string[];
  alt: string;
}) {
  const [index, setIndex] = useState(0);

  const total = images.length;
  const next = useCallback(
    () => setIndex((i) => (i + 1) % total),
    [total],
  );
  const prev = useCallback(
    () => setIndex((i) => (i - 1 + total) % total),
    [total],
  );

  useEffect(() => {
    if (total <= 1) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, total]);

  if (total === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="relative h-[40vh] w-full overflow-hidden rounded-lg bg-surface-secondary sm:h-[50vh]">
        <HotlinkImage src={images[index]} alt={alt} fit="contain" />

        {total > 1 && (
          <>
            <button
              type="button"
              onClick={prev}
              aria-label="Previous image"
              className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-surface-primary/80 p-2 text-text-primary transition-colors hover:bg-surface-elevated"
            >
              <ChevronLeft size={24} />
            </button>
            <button
              type="button"
              onClick={next}
              aria-label="Next image"
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-surface-primary/80 p-2 text-text-primary transition-colors hover:bg-surface-elevated"
            >
              <ChevronRight size={24} />
            </button>
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-surface-primary/80 px-3 py-1 text-xs text-text-secondary">
              {index + 1} / {total}
            </div>
          </>
        )}
      </div>

      {total > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-2">
          {images.map((src, i) => (
            <button
              key={src + i}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Show image ${i + 1}`}
              className={cn(
                "h-16 w-24 shrink-0 overflow-hidden rounded-md border-2 transition-colors",
                i === index
                  ? "border-brand-pink"
                  : "border-transparent hover:border-border-hover",
              )}
            >
              <HotlinkImage src={src} alt="" fit="cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
