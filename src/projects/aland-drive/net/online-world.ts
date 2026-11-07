import type { Player, Room, RoomEvents, RoomState } from "@/shared/lib/peer";
import type { CarState } from "../sim/car-state";
import { parseGuestMessage, parseHostMessage, wireState, type ChallengeMessage, type ComputerCarMessage, type GuestMessage, type HostMessage, type MapPoint, type SharedDestination } from "./protocol";

/*
 * The online world: one room on the relay that every player claims, so the
 * first to arrive hosts and the rest join, and when the host goes the rest
 * claim it again among themselves (`src/shared/lib/peer/`). Each player is the
 * authority over their own car and sends its state 20 times a second; the
 * host is only the hub that hands each one on. Nothing else is shared: every
 * state is the whole car, so a new host, or a player who just arrived, has the
 * world back within a send.
 *
 * Paused, the car stands still for everyone else: no steps, so nothing to send
 * but one state with no motion, sent again whenever someone new arrives or
 * the car is put somewhere.
 *
 * A co-op challenge's messages go the same way, to one player or to everyone:
 * a guest sends each up, and the host hands it on to the one it's for, or to
 * every other guest, naming who it's from. The host only relays: what a
 * message means is `challenge/coop.ts`'s.
 *
 * So does each computer-driven car's state, from the player running it, to
 * everyone: who runs which is `computer-cars.ts`'s.
 *
 * The room has one GPS destination, which anyone may set or clear. A guest
 * sends its pick up, and the host, which puts picks in order, stamps it with
 * who made it and sends it down to every guest, the picker too: two picks at
 * once then end on the same one everywhere, the one the host heard last.
 * Every client keeps the last one, so a new host has it to hand to whoever
 * arrives next.
 */

/** 20 a second at the simulation's 120 Hz. */
export const SEND_EVERY_STEPS = 6;

export interface OnlineEvents {
  /** Another player's car, as their client last had it. */
  onCar: (peerId: string, state: CarState) => void;
  /** A player has left, or we have. */
  onGone: (peerId: string) => void;
  /** Everyone else in the world, whenever that changes. */
  onPlayers: (others: readonly Player[]) => void;
  /** A co-op challenge's message from another player, for this one or for everyone. */
  onChallenge: (peerId: string, message: ChallengeMessage) => void;
  /** A computer-driven car, from the player who ran it when they sent it. */
  onComputerCar: (peerId: string, car: ComputerCarMessage) => void;
  /** The room's destination, as the host has settled it: on arriving, and whenever anyone sets or clears it. */
  onDestination: (destination: SharedDestination) => void;
}

export type OnlineRoom = Pick<Room<HostMessage, GuestMessage>, "start" | "stop" | "sendToHost" | "sendTo" | "broadcast">;

export interface OnlineWorld {
  start: () => void;
  stop: () => void;
  /** Each frame, with the steps the simulation took in it, the car as it stands, and whether it was put somewhere since the last frame. */
  send: (steps: number, state: CarState, placed?: boolean) => void;
  /** A co-op challenge's message, to one player, or to everyone with `to` null. */
  sendChallenge: (to: string | null, message: ChallengeMessage) => void;
  /** A computer-driven car this player runs, to everyone; false when there's no one to send it to. */
  sendComputerCar: (car: ComputerCarMessage) => boolean;
  /** This player's pick of the room's destination, or null to clear it; sent once connected. */
  sendDestination: (point: MapPoint | null) => void;
  state: () => RoomState;
}

const still = (state: CarState): CarState => ({ ...state, velocity: [0, 0, 0], spin: [0, 0, 0] });

export function createOnlineWorld(createRoom: (events: RoomEvents<HostMessage, GuestMessage>) => OnlineRoom, events: OnlineEvents): OnlineWorld {
  let state: RoomState = { status: "idle", role: null, code: "", selfId: null, players: [] };
  const known = new Set<string>();
  let owedSteps = 0;
  /** Send on the next frame whatever the count: someone new hasn't seen this car yet. */
  let owed = true;
  let sentStill = false;
  /** Challenge messages wait out a reconnect, rather than being lost and leaving two clients on different attempts. */
  const owedChallenges: { to: string | null; message: ChallengeMessage }[] = [];
  /** The room's destination as last settled, and a pick of this player's still to go up: only the latest counts. */
  let destination: SharedDestination | null = null;
  let owedPick: { point: MapPoint | null } | null = null;

  function forget(keep: ReadonlySet<string>): void {
    for (const peerId of known) {
      if (keep.has(peerId)) continue;
      known.delete(peerId);
      events.onGone(peerId);
    }
  }

  // A message can outlive its sender by a moment on the wire.
  const present = (peerId: string) => peerId !== state.selfId && state.players.some((player) => player.peerId === peerId);

  function hear(peerId: string, carState: CarState): void {
    if (!present(peerId)) return;
    known.add(peerId);
    events.onCar(peerId, carState);
  }

  function hearChallenge(peerId: string, message: ChallengeMessage): void {
    if (present(peerId)) events.onChallenge(peerId, message);
  }

  function hearComputerCar(peerId: string, car: ComputerCarMessage): void {
    if (present(peerId)) events.onComputerCar(peerId, car);
  }

  /** As the host: the pick settles here, and goes to everyone else. */
  function settle(selfId: string, next: SharedDestination): void {
    destination = next;
    events.onDestination(next);
    room.broadcast({ kind: "destination", from: selfId, destination: next });
  }

  const room = createRoom({
    onState(next) {
      const before = state.players.map((player) => player.peerId).join();
      const was = new Set(state.players.map((player) => player.peerId));
      state = next;
      // Reconnecting keeps everyone: a host that went is claimed again on the same sockets, and the new list says who's left.
      if (next.status === "reconnecting") return;
      const others = next.status === "connected" ? next.players.filter((player) => player.peerId !== next.selfId) : [];
      forget(new Set(others.map((player) => player.peerId)));
      if (next.players.map((player) => player.peerId).join() !== before) owed = true;
      events.onPlayers(others);
      if (next.role === "host" && destination?.point && next.selfId !== null) {
        for (const { peerId } of others) if (!was.has(peerId)) room.sendTo(peerId, { kind: "destination", from: next.selfId, destination });
      }
      flushChallenges();
      flushPick();
    },
    onGuestMessage(from, data) {
      const message = parseGuestMessage(data);
      if (message === null) {
        console.warn("aland-drive online: dropping a malformed guest message", from.peerId, data);
        return;
      }
      if (message.kind === "car") {
        hear(from.peerId, message.state);
        room.broadcast({ kind: "car", from: from.peerId, state: message.state }, from.peerId);
        return;
      }
      if (message.kind === "destination") {
        if (state.selfId !== null) settle(state.selfId, { point: message.point, setter: from.peerId, name: from.name });
        return;
      }
      if (message.kind === "computer") {
        hearComputerCar(from.peerId, message.car);
        room.broadcast({ kind: "computer", from: from.peerId, car: message.car }, from.peerId);
        return;
      }
      const relayed: HostMessage = { kind: "challenge", from: from.peerId, message: message.message };
      if (message.to === undefined) {
        hearChallenge(from.peerId, message.message);
        room.broadcast(relayed, from.peerId);
      } else if (message.to === state.selfId) hearChallenge(from.peerId, message.message);
      // One for a player who has just gone has no one to reach.
      else if (state.players.some((player) => player.peerId === message.to)) room.sendTo(message.to, relayed);
    },
    onHostMessage(data) {
      const message = parseHostMessage(data);
      if (message === null) {
        console.warn("aland-drive online: dropping a malformed host message", data);
        return;
      }
      if (message.kind === "car") hear(message.from, message.state);
      else if (message.kind === "computer") hearComputerCar(message.from, message.car);
      else if (message.kind === "destination") {
        destination = message.destination;
        events.onDestination(message.destination);
      } else hearChallenge(message.from, message.message);
    },
  });

  function flushChallenges(): void {
    const { selfId } = state;
    if (state.status !== "connected" || selfId === null) return;
    for (const { to, message } of owedChallenges.splice(0)) {
      if (state.role === "guest") room.sendToHost(to === null ? { kind: "challenge", message } : { kind: "challenge", to, message });
      else if (to === null) room.broadcast({ kind: "challenge", from: selfId, message });
      else room.sendTo(to, { kind: "challenge", from: selfId, message });
    }
  }

  function flushPick(): void {
    const { selfId } = state;
    if (state.status !== "connected" || selfId === null || owedPick === null) return;
    const { point } = owedPick;
    owedPick = null;
    if (state.role === "guest") room.sendToHost({ kind: "destination", point });
    else {
      const self = state.players.find((player) => player.peerId === selfId);
      if (!self) throw new Error(`the host ${selfId} isn't among its own players`);
      settle(selfId, { point, setter: selfId, name: self.name });
    }
  }

  function transmit(carState: CarState): void {
    const wire = wireState(carState);
    if (state.role === "host" && state.selfId !== null) room.broadcast({ kind: "car", from: state.selfId, state: wire });
    else if (state.role === "guest") room.sendToHost({ kind: "car", state: wire });
  }

  return {
    start: () => room.start(),
    stop: () => room.stop(),
    send(steps, carState, placed = false) {
      if (state.status !== "connected") return;
      // A car put somewhere while paused (a retry's load, a test's hold) is somewhere else now for everyone.
      if (placed) owed = true;
      if (steps === 0) {
        if (sentStill && !owed) return;
        transmit(still(carState));
        sentStill = true;
        owed = false;
        return;
      }
      sentStill = false;
      owedSteps += steps;
      if (owedSteps < SEND_EVERY_STEPS && !owed) return;
      owedSteps = 0;
      owed = false;
      transmit(carState);
    },
    sendComputerCar(car) {
      if (state.status !== "connected" || state.selfId === null) return false;
      const wire = { ...car, state: wireState(car.state) };
      if (state.role === "host") room.broadcast({ kind: "computer", from: state.selfId, car: wire });
      else room.sendToHost({ kind: "computer", car: wire });
      return true;
    },
    sendChallenge(to, message) {
      owedChallenges.push({ to, message });
      flushChallenges();
    },
    sendDestination(point) {
      owedPick = { point };
      flushPick();
    },
    state: () => state,
  };
}
