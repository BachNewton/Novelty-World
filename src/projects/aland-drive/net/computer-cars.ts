import type { CarState, Vector3 } from "../sim/car-state";
import { SEND_EVERY_STEPS } from "./online-world";
import type { ComputerCarMessage } from "./protocol";

/*
 * Computer-driven cars online: the nearest player runs each. Every computer-
 * driven car, a traffic car or a racer, is run by exactly one player's client
 * at a time, which drives it and sends its state and its driver's record to
 * everyone, 20 times a second, as a player's own car is sent. Everyone else
 * sees it as they see another player's car.
 *
 * Whoever runs a car hands it on: once another player has been clearly nearer
 * it for a moment, the runner sends the car one last time naming them, and
 * they carry on from that state and record. Never mid-fight: while any other
 * car is within a few metres of it, it stays with whoever runs it, so two
 * players and a racer side by side don't pass it back and forth. A car whose
 * runner has gone is handed on by the host, to the player nearest where it
 * was last heard.
 *
 * Each car counts its handovers, and every message carries the count, so a
 * state sent before a handover and arriving after it is known for stale: the
 * newest runner is whoever the highest count names.
 *
 * What a driver's record holds, and how a car is driven from it, is the
 * driver's own: here it is only carried.
 */

/** Another player clearly nearer a car than whoever runs it is nearer by this much... */
export const CLEARLY_NEARER_M = 5;
/** ...and has been for half a second, before the car changes hands. */
export const NEARER_FOR_STEPS = 60;
/** Any other car this near a computer-driven car, and it's in a fight. */
export const FIGHT_M = 8;

/** Who runs a car before this player has an id in the world: this player, alone. */
const ALONE = "";

export interface ComputerCarsLink {
  selfId: () => string | null;
  /** Whether this player hosts the world, and so hands on the cars of a player who has gone. */
  hosts: () => boolean;
  /** Where every player's car is, this player's own included, by their id. */
  places: () => ReadonlyMap<string, Vector3>;
  /** To everyone; false when there's no one to send it to. */
  send: (car: ComputerCarMessage) => boolean;
  /** A car another player runs, as they sent it. */
  onHeard: (car: ComputerCarMessage) => void;
}

interface Kept {
  car: ComputerCarMessage;
  /** Who has been clearly nearer it than its runner, and for how many steps. */
  nearer: { peer: string; steps: number } | null;
}

const distance = (a: Vector3, b: Vector3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/**
 * The player who should run a car instead of its runner: one clearly nearer
 * it, the nearest of them, unless some car (a player's, or another computer
 * car in `cars`) is in a fight with it.
 */
export function clearlyNearer(at: Vector3, runner: string, places: ReadonlyMap<string, Vector3>, cars: readonly Vector3[]): string | null {
  const runnerAt = places.get(runner);
  if (!runnerAt) return null;
  if ([...places.values(), ...cars].some((place) => distance(place, at) < FIGHT_M)) return null;
  let best: { peer: string; off: number } | null = null;
  const most = distance(runnerAt, at) - CLEARLY_NEARER_M;
  for (const [peer, place] of places) {
    const off = distance(place, at);
    if (peer !== runner && off < most && (!best || off < best.off)) best = { peer, off };
  }
  return best?.peer ?? null;
}

export function createComputerCars(link: ComputerCarsLink) {
  const kept = new Map<string, Kept>();
  let owedSteps = 0;

  const self = () => link.selfId() ?? ALONE;
  const runsHere = (car: ComputerCarMessage) => car.runner === self();

  function handOnIfNearer(each: Kept, steps: number, places: ReadonlyMap<string, Vector3>): void {
    const { car } = each;
    const cars = [...kept.values()].filter((other) => other !== each).map((other) => other.car.state.position);
    const peer = clearlyNearer(car.state.position, car.runner, places, cars);
    each.nearer = peer === null ? null : { peer, steps: each.nearer?.peer === peer ? each.nearer.steps + steps : steps };
    if (each.nearer === null || each.nearer.steps < NEARER_FOR_STEPS) return;
    const handed = { ...car, runner: each.nearer.peer, handovers: car.handovers + 1 };
    if (!link.send(handed)) return;
    each.car = handed;
    each.nearer = null;
  }

  return {
    /** A new car, run by this player. */
    add(id: string, state: CarState, driver: Record<string, unknown>): void {
      if (kept.has(id)) throw new Error(`a computer-driven car ${id} already`);
      kept.set(id, { car: { id, runner: self(), handovers: 0, state, driver }, nearer: null });
    },

    /** A car this player runs, as it stands after a step. */
    update(id: string, state: CarState, driver: Record<string, unknown>): void {
      const each = kept.get(id);
      if (!each || !runsHere(each.car)) throw new Error(`this player doesn't run the computer-driven car ${id}`);
      each.car = { ...each.car, state, driver };
    },

    /** A car as another player sent it: news unless a newer runner has sent it since. */
    hear(from: string, car: ComputerCarMessage): void {
      const known = kept.get(car.id);
      if (known && (car.handovers < known.car.handovers || (car.handovers === known.car.handovers && from !== known.car.runner))) return;
      kept.set(car.id, { car, nearer: null });
      // Handed to this player, it carries on from here, and is sent as it goes.
      if (!runsHere(car)) link.onHeard(car);
    },

    /**
     * Each frame, with the steps the simulation took: every car this player
     * runs is sent 20 times a second, and handed on once another player has
     * been clearly nearer it for long enough.
     */
    step(steps: number): void {
      const selfId = link.selfId();
      // Cars made before this player had an id in the world are theirs under it.
      if (selfId !== null) for (const each of kept.values()) if (each.car.runner === ALONE) each.car = { ...each.car, runner: selfId };
      owedSteps += steps;
      if (owedSteps < SEND_EVERY_STEPS) return;
      const places = link.places();
      for (const each of kept.values()) {
        if (!runsHere(each.car)) continue;
        handOnIfNearer(each, owedSteps, places);
        if (runsHere(each.car)) link.send(each.car);
      }
      owedSteps = 0;
    },

    /** Whenever the players in the world change, with every one's id, this player's own included. */
    players(present: ReadonlySet<string>): void {
      if (!link.hosts()) return;
      const places = link.places();
      for (const each of kept.values()) {
        const { car } = each;
        if (present.has(car.runner) || car.runner === ALONE) continue;
        // Nobody else's car has been heard yet: the host runs it.
        let next = { peer: self(), off: Infinity };
        for (const [peer, place] of places) {
          const off = distance(place, car.state.position);
          if (present.has(peer) && off < next.off) next = { peer, off };
        }
        each.car = { ...car, runner: next.peer, handovers: car.handovers + 1 };
        each.nearer = null;
        link.send(each.car);
      }
    },

    /** The cars this player runs: each carries on from its state and its driver's record. */
    running(): ComputerCarMessage[] {
      return [...kept.values()].filter(({ car }) => runsHere(car)).map(({ car }) => car);
    },

    all(): ComputerCarMessage[] {
      return [...kept.values()].map(({ car }) => car);
    },
  };
}

export type ComputerCars = ReturnType<typeof createComputerCars>;
