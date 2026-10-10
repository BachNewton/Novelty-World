"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { StandardButton } from "@/shared/lib/gamepad";
import type { GameView } from "../../engine/view";
import { viewExplorer } from "../../engine/view";
import { ENGINE } from "../../game";
import type { InputKind } from "../../input/controls";
import { padMayAct, padName, padOf, seatListPress } from "../../play/pads";
import { seatLabel } from "../describe";
import { PadPicker } from "./pad-picker";
import { seatDot } from "./seat-colour";
import { buzz, type PadSeats } from "./use-pads";

/*
 * Several pads on one device during the game. Only the pads of the seat the
 * game waits on act (an open seat's, any pad): the rest are idle, but any
 * pad's Menu opens the seats panel, where pads take and give back seats.
 * Touch and the mouse use the same panel, from the header or the status
 * box, and always act for whoever the game waits on.
 */

export interface SeatsGate {
  open: boolean;
  /** Opens or closes the panel, by touch or mouse; the highlight starts on the acting seat. */
  setOpen: (open: boolean) => void;
  /** The seat a pad's d-pad has highlighted in the panel. */
  highlighted: number;
  /** Offered every pad button first: true when the panel took it, or the pad is idle and must do nothing. */
  padButton: (button: StandardButton, pad: number) => boolean;
  /** Whether a pad may act on the house now. */
  padMay: (pad: number) => boolean;
}

export function useSeatsGate(pads: PadSeats, holder: number, seats: number): SeatsGate {
  const [panel, setPanel] = useState<{ highlighted: number } | null>(null);
  const latest = useRef({ pads, holder, seats, panel });
  useEffect(() => {
    latest.current = { pads, holder, seats, panel };
  });

  const setOpen = useCallback((open: boolean) => {
    setPanel(open ? { highlighted: latest.current.holder } : null);
  }, []);

  const padButton = useCallback((button: StandardButton, pad: number) => {
    const { pads: now, holder: acting, seats: count, panel: shown } = latest.current;
    if (button === "Menu") {
      setPanel(shown ? null : { highlighted: acting });
      return true;
    }
    if (shown) {
      if (button === "B") setPanel(null);
      const next = seatListPress(button, pad, { focus: shown.highlighted, count, assignment: now.assignment });
      if (next) {
        setPanel({ highlighted: next.focus });
        if (next.assignment !== now.assignment) {
          now.set(next.assignment);
          if (padOf(next.assignment, next.focus) === pad) buzz(pad);
        }
      }
      return true;
    }
    return !padMayAct(now.assignment, acting, pad);
  }, []);

  const padMay = useCallback((pad: number) => {
    const { pads: now, holder: acting, panel: shown } = latest.current;
    return shown === null && padMayAct(now.assignment, acting, pad);
  }, []);

  return { open: panel !== null, setOpen, highlighted: panel?.highlighted ?? holder, padButton, padMay };
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
    .map(({ pad, seats }) => `${padName(pad)} disconnected: ${new Intl.ListFormat("en").format(seats.map((seat) => seatLabel(view, seat)))} ${seats.length === 1 ? "is" : "are"} open to any pad.`)
    .join(" ");
}

export function SeatsPanel({ view, pads, gate }: { view: GameView; pads: PadSeats; gate: SeatsGate }) {
  if (!gate.open) return null;
  const freed = freedText(view, pads);
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-(--bt-bg)/70 p-3">
      <section role="dialog" aria-label="Seats and pads" className="flex max-h-full w-full max-w-md flex-col gap-3 overflow-y-auto rounded border border-(--bt-line) bg-(--bt-panel) p-4">
        <h2 className="text-lg font-semibold">Seats and pads</h2>
        <p className="text-xs text-(--bt-muted)">
          Choose each seat&apos;s pad: a seat with no pad is open to any pad. Touch and the mouse always act for whoever&apos;s turn it is.
          {pads.connected.length > 0 && " On a pad: the d-pad moves between seats, A takes the highlighted seat for your pad or gives it back, B closes."}
        </p>
        {pads.connected.length === 0 && <p className="text-sm">No pads connected: press a button on a pad to connect it.</p>}
        {freed !== null && <p className="text-sm">{freed}</p>}
        <ul className="flex flex-col gap-2">
          {view.seats.map((seat, index) => {
            const explorer = viewExplorer(view, index);
            return (
              <li
                key={index}
                aria-label={seatLabel(view, index)}
                data-highlighted={(pads.connected.length > 0 && gate.highlighted === index) || undefined}
                className="flex flex-col gap-1 rounded border border-(--bt-line) p-2 data-highlighted:border-(--bt-accent) data-highlighted:bg-(--bt-room)"
              >
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                  {explorer && <span className={`inline-block size-2.5 rounded-full ${seatDot(ENGINE, explorer.definition)}`} />}
                  {seatLabel(view, index)}
                </span>
                <PadPicker seat={index} name={seat.name} pads={pads} />
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          onClick={() => {
            gate.setOpen(false);
          }}
          className="min-h-11 self-end rounded bg-(--bt-accent) px-4 py-1 font-semibold text-(--bt-bg)"
        >
          Done
        </button>
      </section>
    </div>
  );
}
