import type { RoomRole, RoomStatus } from "@/shared/lib/peer";
import type { Listing } from "@/shared/lib/room-list";
import type { CourseSpec } from "./courses";
import type { FrogAction, HeldAction, PlayerInput } from "./run";

// The co-op wire protocol and the waiting room's rules. The host is
// authoritative: guests send intents up, the host decides and sends results
// down. Every message is checked as it comes off the wire, and one that isn't
// a message of the protocol fails loudly.

/** Namespaces the peer room codes and the open-games list. */
export const COOP_GAME = "frogmino";

/** Co-op is a pair of frogs. */
export const COOP_CAPACITY = 2;

/** The player slots: the host plays Sprout, its partner Splash. */
export const HOST_SLOT = 0;
export const GUEST_SLOT = 1;

/** The host's messages during play, numbered from 0 so the guest takes them
 * in order (see `online.ts`). */
export type HostPlay =
  /** An input in the host's final order: stamped with the tick it applies
   * at, after every input stamped then or earlier. The guest's own carry the
   * number the guest gave them. */
  | { kind: "input"; seq: number; tick: number; player: number; input: PlayerInput; id?: number }
  /** Every input before `tick` is final; `hash` fingerprints the run there. */
  | { kind: "confirm"; seq: number; tick: number; hash: number }
  /** The reply to a ping: the host's tick when it came. */
  | { kind: "pong"; seq: number; at: number; tick: number }
  /** The round starts over, from tick 0. */
  | { kind: "restart"; seq: number };

/** Host to guest. */
export type HostMessage =
  /** The round begins on this course. The host's clock starts as it sends
   * it, the guest's as it arrives. */
  | { kind: "start"; course: CourseSpec }
  /** The guest is turned away: the game already has its partner, or has
   * started. */
  | { kind: "full" }
  | HostPlay;

/** Guest to host: intents, which the host validates, numbered from 0 like
 * the host's. `round` counts restarts, so the host can drop what was meant
 * for a round it has already restarted. */
export type GuestMessage =
  /** One of the guest's inputs, stamped with the guest's tick and numbered. */
  | { kind: "input"; seq: number; round: number; id: number; tick: number; input: PlayerInput }
  /** Please start the round over. */
  | { kind: "restart"; seq: number; round: number }
  /** For the round trip: `at` is the guest's own clock. */
  | { kind: "ping"; seq: number; at: number }
  /** The guest's run disagreed with the host's at a confirmed tick. */
  | { kind: "desync"; seq: number; tick: number };

type Fields = Record<string, unknown>;

function isRecord(value: unknown): value is Fields {
  return typeof value === "object" && value !== null;
}

function bad(what: string, value: unknown): never {
  throw new Error(`frogmino co-op: not a ${what}: ${JSON.stringify(value)}`);
}

function whole(fields: Fields, key: string, what: string): number {
  const value = fields[key];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) bad(what, fields);
  return value;
}

const ACTIONS: readonly FrogAction[] = ["left", "right", "rotateCcw", "rotateCw", "hop", "forward", "back"];
const HELD: readonly HeldAction[] = ["forward", "back", "left", "right"];

function parseInput(value: unknown): PlayerInput {
  if (!isRecord(value)) bad("player input", value);
  const action = value.action;
  switch (value.kind) {
    case "act": {
      const act = ACTIONS.find((a) => a === action);
      if (act !== undefined) return { kind: "act", action: act };
      break;
    }
    case "press":
    case "release": {
      const held = HELD.find((a) => a === action);
      if (held !== undefined) return { kind: value.kind, action: held };
      break;
    }
    case "releaseAll":
      return { kind: "releaseAll" };
  }
  return bad("player input", value);
}

function parseCourse(value: unknown): CourseSpec {
  if (isRecord(value) && (value.kind === "solo" || value.kind === "coop")) return { kind: value.kind };
  return bad("course", value);
}

/** A host message off the wire, checked. */
export function parseHostMessage(value: unknown): HostMessage {
  const what = "host message";
  if (!isRecord(value)) bad(what, value);
  switch (value.kind) {
    case "start":
      return { kind: "start", course: parseCourse(value.course) };
    case "full":
      return { kind: "full" };
    case "input": {
      const message: HostPlay = {
        kind: "input",
        seq: whole(value, "seq", what),
        tick: whole(value, "tick", what),
        player: whole(value, "player", what),
        input: parseInput(value.input),
      };
      return value.id === undefined ? message : { ...message, id: whole(value, "id", what) };
    }
    case "confirm":
      return { kind: "confirm", seq: whole(value, "seq", what), tick: whole(value, "tick", what), hash: whole(value, "hash", what) };
    case "pong":
      return { kind: "pong", seq: whole(value, "seq", what), at: whole(value, "at", what), tick: whole(value, "tick", what) };
    case "restart":
      return { kind: "restart", seq: whole(value, "seq", what) };
  }
  return bad(what, value);
}

/** A guest message off the wire, checked. */
export function parseGuestMessage(value: unknown): GuestMessage {
  const what = "guest message";
  if (!isRecord(value)) bad(what, value);
  switch (value.kind) {
    case "input":
      return {
        kind: "input",
        seq: whole(value, "seq", what),
        round: whole(value, "round", what),
        id: whole(value, "id", what),
        tick: whole(value, "tick", what),
        input: parseInput(value.input),
      };
    case "restart":
      return { kind: "restart", seq: whole(value, "seq", what), round: whole(value, "round", what) };
    case "ping":
      return { kind: "ping", seq: whole(value, "seq", what), at: whole(value, "at", what) };
    case "desync":
      return { kind: "desync", seq: whole(value, "seq", what), tick: whole(value, "tick", what) };
  }
  return bad(what, value);
}

export type CoopPhase = { kind: "waiting" } | { kind: "started"; course: CourseSpec };

export const WAITING: CoopPhase = { kind: "waiting" };

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

/** The host starts the round on a course; only with a partner, and only once. */
export function startRound(seat: HostSeat, course: CourseSpec): HostSeat {
  if (seat.partnerPeerId === null) throw new Error("frogmino co-op: can't start without a partner");
  if (seat.phase.kind !== "waiting") throw new Error("frogmino co-op: the round has already started");
  return { ...seat, phase: { kind: "started", course } };
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
