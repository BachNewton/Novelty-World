"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { seatName, viewExplorer, type GameView } from "../../engine/view";
import { ENGINE } from "../../game";
import type { InputKind } from "../../input/controls";
import { padMayAct, padName, padOf } from "../../play/pads";
import { PadPicker } from "./pad-picker";
import { seatDot } from "./seat-colour";
import type { PadSeats } from "./use-pads";

/*
 * Several pads on one device during the game. Only the pads of the seat the
 * game waits on act (an open seat's, any pad): the rest are idle, but any
 * pad's Menu opens the game menu, where pads take and give back seats. Touch
 * and the mouse use the same menu, from its button, and always act for
 * whoever the game waits on.
 */

export interface SeatsGate {
  /** Whether the game menu is open: the house and its pads wait while it is. */
  menuOpen: boolean;
  setMenuOpen: (open: boolean) => void;
  /** Whether a pad may act on the house now: the acting seat's, with the menu shut. */
  padMay: (pad: number) => boolean;
  /** Whether a pad plays the seat the game waits on, menu or not. */
  padActs: (pad: number) => boolean;
}

export function useSeatsGate(pads: PadSeats, holder: number): SeatsGate {
  const [menuOpen, setMenuOpen] = useState(false);
  const latest = useRef({ pads, holder, menuOpen });
  useEffect(() => {
    latest.current = { pads, holder, menuOpen };
  });
  const padActs = useCallback((pad: number) => padMayAct(latest.current.pads.assignment, latest.current.holder, pad), []);
  const padMay = useCallback((pad: number) => !latest.current.menuOpen && padActs(pad), [padActs]);
  return { menuOpen, setMenuOpen, padMay, padActs };
}

/** Hints follow the input the acting seat last used: each seat's is remembered, and restored when the game turns to that seat. */
export function useSeatInputs(holder: number, input: InputKind, pads: PadSeats, setInput: (kind: InputKind) => void): void {
  const remembered = useRef(new Map<number, InputKind>());
  const was = useRef(holder);
  useEffect(() => {
    if (holder !== was.current) {
      was.current = holder;
      const kind = remembered.current.get(holder) ?? (padOf(pads.assignment, holder) === null ? null : "pad");
      if (kind !== null && kind !== input) {
        setInput(kind);
        return;
      }
    }
    remembered.current.set(holder, input);
  }, [holder, input, pads.assignment, setInput]);
}

/** Which pads went away, and the seats they leave open. */
export function freedText(view: GameView, pads: PadSeats): string | null {
  if (pads.freed.length === 0) return null;
  return pads.freed
    .map(({ pad, seats }) => `${padName(pad)} disconnected: ${new Intl.ListFormat("en").format(seats.map((seat) => seatName(view, seat)))} ${seats.length === 1 ? "is" : "are"} open to any controller.`)
    .join(" ");
}

/** The game menu's seats: each seat's pad, picked by any input. */
export function SeatsSection({ view, pads }: { view: GameView; pads: PadSeats }) {
  const freed = freedText(view, pads);
  return (
    <section aria-label="Seats and controllers" className="flex flex-col gap-2">
      <h3 className="font-semibold">Seats and controllers</h3>
      <p className="text-xs text-(--bt-muted)">Choose each seat&apos;s controller: a seat with none is open to any controller. Touch and the mouse always act for whoever&apos;s turn it is.</p>
      {pads.connected.length === 0 && <p className="text-sm">No controllers connected: press a button on a controller to connect it.</p>}
      {freed !== null && <p className="text-sm">{freed}</p>}
      <ul className="flex flex-col gap-2">
        {view.seats.map((_seat, index) => {
          const explorer = viewExplorer(view, index);
          return (
            <li key={index} aria-label={seatName(view, index)} className="flex flex-col gap-1 rounded border border-(--bt-line) p-2">
              <span className="flex items-center gap-1.5 text-sm font-semibold">
                {explorer && <span className={`inline-block size-2.5 rounded-full ${seatDot(ENGINE, explorer.definition)}`} />}
                {seatName(view, index)}
              </span>
              <PadPicker seat={index} name={seatName(view, index)} pads={pads} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
