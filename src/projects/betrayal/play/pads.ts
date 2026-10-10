import type { StandardButton } from "@/shared/lib/gamepad";

/*
 * Pad assignment: which controller plays which seats on this device, for a
 * hot-seat game round one screen with several controllers (a TV and two
 * pads). A pad is a gamepad slot; a pad may play several seats, and a seat
 * has at most one pad. A seat with no pad is open: any pad may play it, so a
 * game with no assignments plays exactly as with one controller passed round.
 *
 * It is the device's setup, never game state: not in the engine, the sync
 * state, the saved game or its share code. (Not to be confused with a seat's
 * controller in the engine's sense, human, bot or AI.)
 *
 * Touch and keyboard + mouse are the device itself, so they are never gated:
 * they always act for whoever the game waits on.
 */

/** Seat to pad slot. A seat missing from it is open. */
export type PadAssignment = Readonly<Record<number, number>>;

export const NO_PADS: PadAssignment = {};

/** The pad a seat is assigned, or null when the seat is open. */
export function padOf(assignment: PadAssignment, seat: number): number | null {
  return seat in assignment ? assignment[seat] : null;
}

/** The seats a pad plays, in seat order. */
export function seatsOf(assignment: PadAssignment, pad: number): number[] {
  return seatEntries(assignment)
    .filter(([, owner]) => owner === pad)
    .map(([seat]) => seat);
}

/** Gives the seat to the pad, taking it from any pad that had it. */
export function claim(assignment: PadAssignment, seat: number, pad: number): PadAssignment {
  return { ...assignment, [seat]: pad };
}

/** Opens the seat to any pad. */
export function release(assignment: PadAssignment, seat: number): PadAssignment {
  if (!(seat in assignment)) return assignment;
  return Object.fromEntries(seatEntries(assignment).filter(([owner]) => owner !== seat));
}

/** What A on a pad does to a seat: claims it, or releases it when that pad already has it. */
export function toggle(assignment: PadAssignment, seat: number, pad: number): PadAssignment {
  return padOf(assignment, seat) === pad ? release(assignment, seat) : claim(assignment, seat, pad);
}

/** Only the seats a game has: a seat removed at setup takes its pad with it. */
export function trimSeats(assignment: PadAssignment, count: number): PadAssignment {
  return Object.fromEntries(seatEntries(assignment).filter(([seat]) => seat < count));
}

/** A pad that went away, and the seats it played, which are open now. */
export interface FreedPad {
  pad: number;
  seats: number[];
}

/** Opens every seat whose pad is no longer connected. A pad that comes back
 *  must claim its seats again: identical pads can't be told apart, so a slot
 *  coming back is not known to be the same pad. */
export function keepConnected(assignment: PadAssignment, connected: readonly number[]): { assignment: PadAssignment; freed: FreedPad[] } {
  const gone = [...new Set(Object.values(assignment))].filter((pad) => !connected.includes(pad)).sort((a, b) => a - b);
  if (gone.length === 0) return { assignment, freed: [] };
  return {
    assignment: Object.fromEntries(seatEntries(assignment).filter(([, pad]) => !gone.includes(pad))),
    freed: gone.map((pad) => ({ pad, seats: seatsOf(assignment, pad) })),
  };
}

/** Whether a pad may act for the seat the game waits on: the seat's own pad,
 *  or any pad when the seat is open or nothing waits on anyone. */
export function padMayAct(assignment: PadAssignment, seat: number | null, pad: number): boolean {
  if (seat === null) return true;
  const owner = padOf(assignment, seat);
  return owner === null || owner === pad;
}

/** A pad's press on a list of seats (at setup, and in the game's seats
 *  panel), any pad moving the highlight: the d-pad's up and down move it
 *  round the seats, and A takes the highlighted seat for that pad, or
 *  releases it when the pad has it already. Null for a button the list doesn't use. */
export function seatListPress(
  button: StandardButton,
  pad: number,
  list: { focus: number; count: number; assignment: PadAssignment },
): { focus: number; assignment: PadAssignment } | null {
  const { focus, count, assignment } = list;
  if (button === "DpadDown" || button === "DpadUp") return { focus: (focus + (button === "DpadDown" ? 1 : -1) + count) % count, assignment };
  if (button === "A") return { focus, assignment: toggle(assignment, focus, pad) };
  return null;
}

/** A pad's name for players: its slot counted from one. */
export function padName(pad: number): string {
  return `Pad ${pad + 1}`;
}

function seatEntries(assignment: PadAssignment): [number, number][] {
  return Object.entries(assignment)
    .map(([seat, pad]): [number, number] => [Number(seat), pad])
    .sort(([a], [b]) => a - b);
}
