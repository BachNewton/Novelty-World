import type { RoomRole, RoomStatus } from "@/shared/lib/peer";
import type { Listing } from "@/shared/lib/room-list";

// The co-op wire protocol and the waiting room's rules. The host is
// authoritative: guests send intents up, the host decides and sends results
// down. Co-op play itself isn't built yet, so this covers getting two frogs
// into a room and onto the same course.

/** Namespaces the peer room codes and the open-games list. */
export const COOP_GAME = "frogmino";

/** Co-op is a pair of frogs. */
export const COOP_CAPACITY = 2;

/** Host to guest. */
export type HostMessage =
  /** The round begins on the course grown from this seed. The host draws
   * it, so both frogs meet the same traffic. */
  | { kind: "start"; seed: number }
  /** The guest is turned away: the game already has its partner, or has
   * started. */
  | { kind: "full" };

/** Guest to host: intents, which the host validates. There are none yet;
 * co-op play adds the frog's actions. */
export type GuestMessage = never;

export type CoopPhase = { kind: "waiting" } | { kind: "started"; seed: number };

export const WAITING: CoopPhase = { kind: "waiting" };

/** A fresh course seed: any 32-bit value, as `generateCourse` takes. */
export function drawCourseSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

/** The host's side of the waiting room. */
export interface HostSeat {
  phase: CoopPhase;
  /** The guest who took the partner's place, by peer id. */
  partnerPeerId: string | null;
}

/** A guest arrives. The first one while waiting becomes the partner; any
 * other is turned away. */
export function admitGuest(seat: HostSeat, peerId: string): { seat: HostSeat; admitted: boolean } {
  if (seat.partnerPeerId !== null || seat.phase.kind !== "waiting") return { seat, admitted: false };
  return { seat: { ...seat, partnerPeerId: peerId }, admitted: true };
}

/** A guest leaves. Losing the partner ends any round and reopens the seat. */
export function releaseGuest(seat: HostSeat, peerId: string): { seat: HostSeat; partnerLeft: boolean } {
  if (seat.partnerPeerId !== peerId) return { seat, partnerLeft: false };
  return { seat: { phase: WAITING, partnerPeerId: null }, partnerLeft: true };
}

/** The host starts the round on a seed; only with a partner, and only once. */
export function startRound(seat: HostSeat, seed: number): HostSeat {
  if (seat.partnerPeerId === null) throw new Error("frogmino co-op: can't start without a partner");
  if (seat.phase.kind !== "waiting") throw new Error("frogmino co-op: the round has already started");
  return { ...seat, phase: { kind: "started", seed } };
}

export interface ListingSource {
  role: RoomRole | null;
  status: RoomStatus;
  code: string | null;
  hostName: string;
  seat: HostSeat;
}

/** The host's entry on the open-games list: only while it is connected,
 * waiting, and without a partner. */
export function openListing({ role, status, code, hostName, seat }: ListingSource): Listing | null {
  if (role !== "host" || status !== "connected" || code === null) return null;
  if (seat.phase.kind !== "waiting" || seat.partnerPeerId !== null) return null;
  return { code, hostName, players: 1, capacity: COOP_CAPACITY };
}
