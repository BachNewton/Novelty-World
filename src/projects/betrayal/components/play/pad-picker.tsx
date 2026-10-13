"use client";

import { padName, padOf, pickPad } from "../../play/pads";
import { buzz, type PadSeats } from "./use-pads";

/** A seat's pad, set by any input: open, or one of the connected pads. A pad
 *  picked again gives the seat back, and the pad that takes it buzzes, so its
 *  player knows which pad is theirs. */
export function PadPicker({ seat, name, pads }: { seat: number; name: string; pads: PadSeats }) {
  const owner = padOf(pads.assignment, seat);
  const options = [null, ...pads.connected];
  return (
    <div role="group" aria-label={`${name}'s controller`} className="flex flex-wrap items-center gap-1 text-xs">
      {options.map((pad) => (
        <button
          key={pad ?? "open"}
          type="button"
          aria-pressed={owner === pad}
          onClick={() => {
            const next = pickPad(pads.assignment, seat, pad);
            pads.set(next);
            if (pad !== null && padOf(next, seat) === pad) buzz(pad);
          }}
          className="min-h-9 rounded border border-(--bt-line) bg-(--bt-bg) px-2 py-1 aria-pressed:border-(--bt-accent) aria-pressed:bg-(--bt-room) aria-pressed:font-semibold"
        >
          {pad === null ? "Open" : padName(pad)}
        </button>
      ))}
    </div>
  );
}
