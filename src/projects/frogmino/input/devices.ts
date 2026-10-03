import type { PlayerInput } from "../run";

// Input sources turn a device's presses into the rules' player inputs. Each
// source speaks for its devices, never for a player: the seating says which
// player slot a device drives, so the same sources serve solo (every device
// is player 0) and local co-op (each device the slot it joined).

// The keyboard is one device in solo, and two in local co-op, its left half
// (WASD) and its right half (the arrows). Each controller is its own device,
// by its slot.
export type DeviceId = "keys" | "keys:left" | "keys:right" | "touch" | `pad:${number}`;

export function padDevice(index: number): DeviceId {
  return `pad:${index}`;
}

// Which player slot a device drives; null for a device with no seat, whose
// inputs go nowhere.
export type Seating = (device: DeviceId) => number | null;

export const SOLO_SEATING: Seating = () => 0;

// Where the sources send what they hear.
export interface InputSink {
  input: (device: DeviceId, input: PlayerInput) => void;
  restart: () => void;
}

// A sink feeding a session's player slots through a seating.
export function seatedSink(
  seating: Seating,
  session: { input: (player: number, input: PlayerInput) => void; restart: () => void },
): InputSink {
  return {
    input: (device, input) => {
      const player = seating(device);
      if (player !== null) session.input(player, input);
    },
    restart: session.restart,
  };
}
