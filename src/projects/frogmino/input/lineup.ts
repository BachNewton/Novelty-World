import type { DeviceId, Seating } from "./devices";

// Local co-op's lineup: which device holds each player slot. A device joins
// by taking the lowest free slot, and holds at most one; leaving frees its
// slot for the next device to join, and the other player keeps theirs.

export const LOCAL_PLAYERS = 2;

// One entry per player slot, P1 first: the device in it, or null if free.
export type Lineup = readonly (DeviceId | null)[];

export const EMPTY_LINEUP: Lineup = Array.from({ length: LOCAL_PLAYERS }, () => null);

export function seatOf(lineup: Lineup, device: DeviceId): number | null {
  const slot = lineup.indexOf(device);
  return slot === -1 ? null : slot;
}

// A device taking the lowest free slot; unchanged if it already has one or
// every slot is taken.
export function join(lineup: Lineup, device: DeviceId): Lineup {
  if (seatOf(lineup, device) !== null) return lineup;
  const free = lineup.indexOf(null);
  if (free === -1) return lineup;
  return lineup.map((seated, slot) => (slot === free ? device : seated));
}

export function leave(lineup: Lineup, device: DeviceId): Lineup {
  const slot = seatOf(lineup, device);
  if (slot === null) return lineup;
  return lineup.map((seated, i) => (i === slot ? null : seated));
}

// Every slot has a device, so play can start.
export function isFull(lineup: Lineup): boolean {
  return lineup.every((seated) => seated !== null);
}

// The seating the game plays with: each device its slot, any other none.
export function lineupSeating(lineup: Lineup): Seating {
  return (device) => seatOf(lineup, device);
}
