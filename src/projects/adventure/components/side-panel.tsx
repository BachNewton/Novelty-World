"use client";

import type { MouseEvent, ReactNode, Ref } from "react";

/** A panel's button: its icon, and often its key's glyph. */
export const BUTTON =
  "flex items-center gap-1.5 rounded-md border border-border-default bg-surface-elevated px-2 py-1 text-sm text-text-primary hover:border-border-hover disabled:opacity-40 disabled:hover:border-border-default";

/** A choice that is pressed: one of a group, or a toggle that is on. */
export const PRESSED = "aria-pressed:border-brand-blue aria-pressed:bg-brand-blue/15 aria-pressed:text-brand-blue";

/** A mouse click lets go of the keyboard, so the game's keys work at once and Enter can't press the button again; a pad's or a key's press keeps its focus to move on from. */
export function letGo(event: MouseEvent<HTMLElement>): void {
  if (event.detail > 0) event.currentTarget.blur();
}

/**
 * The panel down the left of the screen that the viewer and the map editor
 * show: `top` stays put and the rest scrolls under it, wide enough for four
 * of the editor's pictures a row.
 */
export function SidePanel({ ref, label, top, children }: { ref?: Ref<HTMLDivElement>; label: string; top: ReactNode; children?: ReactNode }) {
  return (
    <div
      ref={ref}
      role="region"
      aria-label={label}
      className="absolute inset-y-3 left-3 flex w-88 flex-col gap-2 rounded-md border border-border-default bg-surface-primary/90 p-2"
    >
      {top}
      {children !== undefined && <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1 [scrollbar-gutter:stable]">{children}</div>}
    </div>
  );
}

/**
 * A choice shown by its picture: a portrait in the viewer, a piece in the
 * editor's palette. Its name is its tooltip and accessible name, and shown
 * under the picture where the picture alone can't tell it (`caption`).
 * Badges sit over its corners.
 */
export function Tile({
  name,
  title,
  pressed,
  start,
  caption,
  badges,
  onPick,
  children,
}: {
  name: string;
  title?: string;
  pressed: boolean;
  start?: boolean;
  caption?: ReactNode;
  badges?: ReactNode;
  onPick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title ?? name}
      aria-label={name}
      aria-pressed={pressed}
      data-pad-start={start === true ? "" : undefined}
      className={`relative flex w-full flex-col items-center gap-0.5 overflow-hidden rounded-md border border-border-default bg-surface-elevated text-center font-mono text-[10px] leading-tight text-text-secondary hover:border-border-hover ${caption === undefined ? "aspect-square" : "p-1"} ${PRESSED}`}
      onClick={(event) => {
        letGo(event);
        onPick();
      }}
    >
      {children}
      {caption !== undefined && <span className="w-full [overflow-wrap:anywhere]">{caption}</span>}
      {badges}
    </button>
  );
}

/** A tile's picture, or a pulse in its place until it is drawn. */
export function TilePicture({ url, className }: { url: string | undefined; className: string }) {
  return (
    <span className={`relative block ${className}`}>
      {url === undefined ? (
        <span aria-hidden className="absolute inset-[20%] animate-pulse rounded-full bg-surface-tertiary" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- a picture drawn in the page as a data URL, which next/image has nothing to optimise
        <img src={url} alt="" className="size-full object-contain" />
      )}
    </span>
  );
}
