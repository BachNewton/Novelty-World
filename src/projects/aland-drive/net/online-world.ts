import type { Player, Room, RoomEvents, RoomState } from "@/shared/lib/peer";
import type { CarState } from "../sim/car-state";
import { parseGuestMessage, parseHostMessage, wireState, wireTime, type ChallengeMessage, type ComputerCarMessage, type GuestMessage, type HostMessage } from "./protocol";

/*
 * The online world: one room on the relay that every player claims, so the
 * first to arrive hosts and the rest join, and when the host goes the rest
 * claim it again among themselves (`src/shared/lib/peer/`). Each player is the
 * authority over their own car and sends its state 20 times a second, with
 * when it stepped it, so others can show it by when it happened; the
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
 */

/** 20 a second at the simulation's 120 Hz. */
export const SEND_EVERY_STEPS = 6;

export interface OnlineEvents {
  /** Another player's car, as their client last had it, and when their client stepped it, on its own clock, if it said. */
  onCar: (peerId: string, state: CarState, at?: number) => void;
  /** A player has left, or we have. */
  onGone: (peerId: string) => void;
  /** Everyone else in the world, whenever that changes. */
  onPlayers: (others: readonly Player[]) => void;
  /** A co-op challenge's message from another player, for this one or for everyone. */
  onChallenge: (peerId: string, message: ChallengeMessage) => void;
  /** A computer-driven car, from the player who ran it when they sent it. */
  onComputerCar: (peerId: string, car: ComputerCarMessage) => void;
}

export type OnlineRoom = Pick<Room<HostMessage, GuestMessage>, "start" | "stop" | "sendToHost" | "sendTo" | "broadcast">;

export interface OnlineWorld {
  start: () => void;
  stop: () => void;
  /**
   * Each frame, with the steps the simulation took in it, the car as it stands, whether it was put somewhere since the
   * last frame, and the time its last step stood for, in ms on this client's clock.
   */
  send: (steps: number, state: CarState, placed: boolean, at: number) => void;
  /** A co-op challenge's message, to one player, or to everyone with `to` null. */
  sendChallenge: (to: string | null, message: ChallengeMessage) => void;
  /** A computer-driven car this player runs, to everyone, stepped when the last frame's car was; false when there's no one to send it to. */
  sendComputerCar: (car: ComputerCarMessage) => boolean;
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
  /** The time the last frame's step stood for. */
  let steppedAt = 0;
  /** Challenge messages wait out a reconnect, rather than being lost and leaving two clients on different attempts. */
  const owedChallenges: { to: string | null; message: ChallengeMessage }[] = [];

  function forget(keep: ReadonlySet<string>): void {
    for (const peerId of known) {
      if (keep.has(peerId)) continue;
      known.delete(peerId);
      events.onGone(peerId);
    }
  }

  // A message can outlive its sender by a moment on the wire.
  const present = (peerId: string) => peerId !== state.selfId && state.players.some((player) => player.peerId === peerId);

  function hear(peerId: string, carState: CarState, at: number | undefined): void {
    if (!present(peerId)) return;
    known.add(peerId);
    events.onCar(peerId, carState, at);
  }

  function hearChallenge(peerId: string, message: ChallengeMessage): void {
    if (present(peerId)) events.onChallenge(peerId, message);
  }

  function hearComputerCar(peerId: string, car: ComputerCarMessage): void {
    if (present(peerId)) events.onComputerCar(peerId, car);
  }

  const room = createRoom({
    onState(next) {
      const before = state.players.map((player) => player.peerId).join();
      state = next;
      // Reconnecting keeps everyone: a host that went is claimed again on the same sockets, and the new list says who's left.
      if (next.status === "reconnecting") return;
      const others = next.status === "connected" ? next.players.filter((player) => player.peerId !== next.selfId) : [];
      forget(new Set(others.map((player) => player.peerId)));
      if (next.players.map((player) => player.peerId).join() !== before) owed = true;
      events.onPlayers(others);
      flushChallenges();
    },
    onGuestMessage(from, data) {
      const message = parseGuestMessage(data);
      if (message === null) {
        console.warn("aland-drive online: dropping a malformed guest message", from.peerId, data);
        return;
      }
      if (message.kind === "car") {
        hear(from.peerId, message.state, message.at);
        room.broadcast({ kind: "car", from: from.peerId, state: message.state, at: message.at }, from.peerId);
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
      if (message.kind === "car") hear(message.from, message.state, message.at);
      else if (message.kind === "computer") hearComputerCar(message.from, message.car);
      else hearChallenge(message.from, message.message);
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

  function transmit(carState: CarState): void {
    const wire = wireState(carState);
    const at = wireTime(steppedAt);
    if (state.role === "host" && state.selfId !== null) room.broadcast({ kind: "car", from: state.selfId, state: wire, at });
    else if (state.role === "guest") room.sendToHost({ kind: "car", state: wire, at });
  }

  return {
    start: () => room.start(),
    stop: () => room.stop(),
    send(steps, carState, placed, at) {
      steppedAt = at;
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
      const wire = { ...car, state: wireState(car.state), at: wireTime(steppedAt) };
      if (state.role === "host") room.broadcast({ kind: "computer", from: state.selfId, car: wire });
      else room.sendToHost({ kind: "computer", car: wire });
      return true;
    },
    sendChallenge(to, message) {
      owedChallenges.push({ to, message });
      flushChallenges();
    },
    state: () => state,
  };
}
