"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Play, X } from "lucide-react";
import { isDrag } from "@/shared/lib/input";
import { fileUrl } from "../catalog";
import { formatTime } from "../logic";

/** A picture the viewer shows, and, for a photo, where in the book it's described. */
export interface ViewerItem {
  image: string;
  alt: string;
  moment?: { chapter: number; chapterTitle: string; at: number };
}

/** How far a finger travels sideways before a swipe turns the page, in CSS pixels. */
const SWIPE = 50;

/** A picture full screen, and the ones beside it a swipe, an arrow or an arrow key away. */
export function PhotoViewer({
  items,
  index,
  onIndex,
  onClose,
  onPlayFrom,
}: {
  items: ViewerItem[];
  index: number;
  onIndex: (index: number) => void;
  onClose: () => void;
  onPlayFrom: (chapter: number, at: number) => void;
}) {
  const item = items[index];
  const hasPrevious = index > 0;
  const hasNext = index < items.length - 1;
  const close = useRef<HTMLButtonElement>(null);
  const press = useRef<{ x: number; y: number } | null>(null);

  // The handlers the keys call, kept current for the listener added once.
  const keys = useRef({ hasPrevious, hasNext, index, onIndex, onClose });
  useEffect(() => {
    keys.current = { hasPrevious, hasNext, index, onIndex, onClose };
  });

  useEffect(() => {
    close.current?.focus();
    function onKey(e: KeyboardEvent) {
      const k = keys.current;
      if (e.key === "Escape") k.onClose();
      else if (e.key === "ArrowLeft" && k.hasPrevious) k.onIndex(k.index - 1);
      else if (e.key === "ArrowRight" && k.hasNext) k.onIndex(k.index + 1);
      else if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      // Caught on the way down, so the player's own keys (arrows skip the audio) never hear it.
      e.preventDefault();
      e.stopPropagation();
    }
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, []);

  useEffect(() => {
    for (const near of [index - 1, index + 1]) {
      if (near < 0 || near >= items.length) continue;
      const preload = new window.Image();
      preload.src = fileUrl(items[near].image);
    }
  }, [items, index]);

  function onPointerUp(e: React.PointerEvent) {
    const start = press.current;
    press.current = null;
    if (!start) return;
    const end = { x: e.clientX, y: e.clientY };
    const dx = end.x - start.x;
    if (!isDrag(start, end) || Math.abs(dx) < SWIPE || Math.abs(dx) < Math.abs(end.y - start.y)) return;
    if (dx < 0 && hasNext) onIndex(index + 1);
    if (dx > 0 && hasPrevious) onIndex(index - 1);
  }

  return (
    <div
      role="dialog"
      aria-modal
      aria-label="Photo viewer"
      className="fixed inset-0 z-40 flex flex-col bg-surface-primary pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      <div className="flex shrink-0 items-center justify-between px-4 pt-3">
        <span className="font-mono text-sm text-text-muted" aria-label={`Photo ${String(index + 1)} of ${String(items.length)}`}>
          {items.length > 1 && `${String(index + 1)} / ${String(items.length)}`}
        </span>
        <button
          ref={close}
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="rounded-md p-2 text-text-secondary transition-colors hover:bg-surface-elevated hover:text-text-primary"
        >
          <X size={24} />
        </button>
      </div>

      <div
        className="relative flex min-h-0 flex-1 touch-none items-center justify-center px-2 select-none"
        onPointerDown={(e) => (press.current = { x: e.clientX, y: e.clientY })}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (press.current = null)}
      >
        <Image
          key={item.image}
          src={fileUrl(item.image)}
          alt={item.alt}
          width={0}
          height={0}
          unoptimized
          draggable={false}
          sizes="100vw"
          className="h-auto max-h-full w-auto max-w-full rounded-lg"
        />
        {hasPrevious && (
          <ArrowButton label="Previous photo" side="left" onClick={() => onIndex(index - 1)}>
            <ChevronLeft size={28} />
          </ArrowButton>
        )}
        {hasNext && (
          <ArrowButton label="Next photo" side="right" onClick={() => onIndex(index + 1)}>
            <ChevronRight size={28} />
          </ArrowButton>
        )}
      </div>

      {item.moment !== undefined && (
        <div className="flex shrink-0 justify-center px-4 pt-3">
          <button
            type="button"
            aria-label={`Play from here: ${item.moment.chapterTitle}, ${formatTime(item.moment.at)}`}
            onClick={() => item.moment && onPlayFrom(item.moment.chapter, item.moment.at)}
            className="flex max-w-full items-center gap-3 rounded-full bg-surface-elevated py-2 pr-5 pl-2 text-left transition-colors hover:bg-surface-tertiary"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-orange text-surface-primary">
              <Play size={18} fill="currentColor" className="translate-x-px" />
            </span>
            <span className="min-w-0 text-sm break-words">{item.moment.chapterTitle}</span>
            <span className="shrink-0 font-mono text-sm text-text-secondary">{formatTime(item.moment.at)}</span>
          </button>
        </div>
      )}
    </div>
  );
}

function ArrowButton({ label, side, onClick, children }: { label: string; side: "left" | "right"; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      onPointerDown={(e) => e.stopPropagation()}
      className={`absolute top-1/2 -translate-y-1/2 rounded-full bg-surface-primary/60 p-2 text-text-primary transition-colors hover:bg-surface-elevated ${side === "left" ? "left-2" : "right-2"}`}
    >
      {children}
    </button>
  );
}
