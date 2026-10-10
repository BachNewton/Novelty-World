"use client";

import { useSyncExternalStore } from "react";
import type { BakeScheduler } from "./bake-schedule";

/**
 * A small mark while the light is still being refined in the background:
 * the house is already shown and answers input, and finer light will land
 * on its own. Work of a kind that usually takes more than a couple of
 * seconds (each pass says whether it is) shows how far it has got, in work
 * across every pass, from the start. It goes when the work is done.
 * `className` places it on the screen.
 */
export function BakeIndicator({ bakes, className }: { bakes: BakeScheduler; className: string }) {
  const status = useSyncExternalStore(bakes.subscribe, bakes.status, bakes.status);
  if (!status.pending) return null;
  const percent = status.total > 0 ? Math.floor((status.done / status.total) * 100) : 0;
  return (
    <div
      role="status"
      aria-label={status.progress ? `Refining the light, ${percent}% done` : "Refining the light"}
      data-bake-indicator={status.progress ? "progress" : "pending"}
      className={`pointer-events-none flex flex-col gap-1 rounded border border-(--bt-line) bg-(--bt-panel) px-1.5 py-1 text-[10px] leading-none text-(--bt-muted) ${className}`}
    >
      <span className="flex items-center gap-1.5 whitespace-nowrap">
        <span aria-hidden className="size-1.5 shrink-0 animate-pulse rounded-full bg-(--bt-door)" />
        Refining light
      </span>
      {status.progress && (
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 flex-1 overflow-hidden rounded bg-(--bt-line)">
            <span className="block h-full bg-(--bt-door)" style={{ width: `${percent}%` }} />
          </span>
          <span className="tabular-nums">{percent}%</span>
        </span>
      )}
    </div>
  );
}
