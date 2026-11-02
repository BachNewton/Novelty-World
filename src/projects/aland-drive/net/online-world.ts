import type { Player, Room, RoomEvents, RoomState } from "@/shared/lib/peer";
import type { CarState } from "../sim/car-state";
import { parseGuestMessage, parseHostMessage, wireState, type GuestMessage, type HostMessage } from "./protocol";

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
 * but one state with no motion, sent again whenever someone new arrives.
 */

/** 20 a second at the simulation's 120 Hz. */
export const SEND_EVERY_STEPS = 6;

export interface OnlineEvents {
  /** Another player's car, as their client last had it. */
  onCar: (peerId: string, car: string, state: CarState) => void;
  /** A player has left, or we have. */
  onGone: (peerId: string) => void;
  /** Everyone else in the world, whenever that changes. */
  onPlayers: (others: readonly Player[]) => void;
}

export type OnlineRoom = Pick<Room<HostMessage, GuestMessage>, "start" | "stop" | "sendToHost" | "broadcast">;

export interface OnlineWorld {
  start: () => void;
  stop: () => void;
  /** Each frame, with the steps the simulation took in it and the car as it stands. */
  send: (steps: number, car: string, state: CarState) => void;
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

  function forget(keep: ReadonlySet<string>): void {
    for (const peerId of known) {
      if (keep.has(peerId)) continue;
      known.delete(peerId);
      events.onGone(peerId);
    }
  }

  function hear(peerId: string, car: string, carState: CarState): void {
    // A state can outlive its sender by a moment on the wire.
    if (peerId === state.selfId || !state.players.some((player) => player.peerId === peerId)) return;
    known.add(peerId);
    events.onCar(peerId, car, carState);
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
    },
    onGuestMessage(from, data) {
      const message = parseGuestMessage(data);
      if (message === null) {
        console.warn("aland-drive online: dropping a malformed guest message", from.peerId, data);
        return;
      }
      hear(from.peerId, message.car, message.state);
      room.broadcast({ kind: "car", from: from.peerId, car: message.car, state: message.state }, from.peerId);
    },
    onHostMessage(data) {
      const message = parseHostMessage(data);
      if (message === null) {
        console.warn("aland-drive online: dropping a malformed host message", data);
        return;
      }
      hear(message.from, message.car, message.state);
    },
  });

  function transmit(car: string, carState: CarState): void {
    const wire = wireState(carState);
    if (state.role === "host" && state.selfId !== null) room.broadcast({ kind: "car", from: state.selfId, car, state: wire });
    else if (state.role === "guest") room.sendToHost({ kind: "car", car, state: wire });
  }

  return {
    start: () => room.start(),
    stop: () => room.stop(),
    send(steps, car, carState) {
      if (state.status !== "connected") return;
      if (steps === 0) {
        if (sentStill && !owed) return;
        transmit(car, still(carState));
        sentStill = true;
        owed = false;
        return;
      }
      sentStill = false;
      owedSteps += steps;
      if (owedSteps < SEND_EVERY_STEPS && !owed) return;
      owedSteps = 0;
      owed = false;
      transmit(car, carState);
    },
    state: () => state,
  };
}
