import type { MapChallenge } from "../map/draw";
import { readPasses, withOutcome, type ChallengePass, type ChallengePasses } from "./passes";
import type { Outcome } from "./run";
import type { Challenge, ScenePoint } from "./types";

/*
 * The challenges a drive knows: the list, and any of the page's own (a test's,
 * laid on its own world's roads), which of them stand in this world, which have
 * been passed and with what best, and whose start ring the car is in. The maps
 * and the start rings in the world draw from it; passes are kept by whatever
 * store it's handed.
 */

/** A start ring's reach from its middle, which lies between the two start places. */
export const START_RING_M = 12;

export interface PassStore {
  load: () => unknown;
  save: (passes: ChallengePasses) => void;
}

/** The middle of a challenge's start ring, between its two places on the line. */
export function ringCentre({ starts: [first, second] }: Challenge): ScenePoint {
  return { x: (first.x + second.x) / 2, z: (first.z + second.z) / 2 };
}

export class ChallengeBoard {
  private readonly known: Challenge[];
  private passes: ChallengePasses;
  /** Moves on whenever what the maps show changes: a pass, or a challenge added. */
  revision = 0;

  constructor(
    challenges: readonly Challenge[],
    private readonly store: PassStore,
    /** Whether a place is in this drive's world: a challenge whose start isn't is on no map and has no ring. */
    private readonly here: (place: ScenePoint) => boolean,
  ) {
    this.known = [...challenges];
    this.passes = readPasses(store.load(), challenges);
  }

  /** The challenges whose start is in this world. */
  get challenges(): readonly Challenge[] {
    return this.known.filter((challenge) => this.here(ringCentre(challenge)));
  }

  /** Each start in this world as the maps draw it. */
  marks(): MapChallenge[] {
    return this.challenges.map((challenge) => ({ ...ringCentre(challenge), title: challenge.title, kind: challenge.kind, passed: this.passOf(challenge) !== null }));
  }

  /** A challenge of the page's own, beside the list's. */
  add(challenge: Challenge): void {
    if (this.known.some(({ id }) => id === challenge.id)) throw new Error(`a second challenge ${challenge.id}`);
    this.known.push(challenge);
    this.revision++;
  }

  byId(id: string): Challenge {
    const challenge = this.known.find((each) => each.id === id);
    if (!challenge) throw new Error(`no challenge ${id}`);
    return challenge;
  }

  passOf(challenge: Challenge): ChallengePass | null {
    return (this.passes[challenge.id] as ChallengePass | undefined) ?? null;
  }

  /** An attempt is over: a pass, or a better best, is kept. */
  record(challenge: Challenge, outcome: Outcome): void {
    const next = withOutcome(this.passes, challenge, outcome);
    if (next === this.passes) return;
    this.passes = next;
    this.revision++;
    this.store.save(next);
  }

  /** The challenge whose start ring holds a place, the nearest if two do. */
  ringAt(x: number, z: number): Challenge | null {
    let best: Challenge | null = null;
    let nearest = START_RING_M;
    for (const challenge of this.challenges) {
      const centre = ringCentre(challenge);
      const distance = Math.hypot(centre.x - x, centre.z - z);
      if (distance <= nearest) {
        nearest = distance;
        best = challenge;
      }
    }
    return best;
  }
}
