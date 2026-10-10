"use client";

import { claim, padName, padOf, release } from "../../play/pads";
import type { PadSeats } from "./use-pads";

/** A seat's pad, set by touch or mouse: open, or one of the connected pads. */
export function PadPicker({ seat, name, pads }: { seat: number; name: string; pads: PadSeats }) {
  const owner = padOf(pads.assignment, seat);
  const options = [null, ...pads.connected];
  return (
    <div role="group" aria-label={`${name}'s pad`} className="flex flex-wrap items-center gap-1 text-xs">
      {options.map((pad) => (
        <button
          key={pad ?? "open"}
          type="button"
          aria-pressed={owner === pad}
          onClick={() => {
            pads.set(pad === null ? release(pads.assignment, seat) : claim(pads.assignment, seat, pad));
          }}
          className="min-h-9 rounded border border-(--bt-line) bg-(--bt-bg) px-2 py-1 aria-pressed:border-(--bt-accent) aria-pressed:bg-(--bt-room) aria-pressed:font-semibold"
        >
          {pad === null ? "Open" : padName(pad)}
        </button>
      ))}
    </div>
  );
}
