import type { MapChallenge } from "../map/draw";
import { PLAY_MODES, readPasses, withOutcome, type ChallengePass, type ChallengePasses, type PlayMode } from "./passes";
import type { Outcome } from "./run";
import { betterMedal, type Medal } from "./standings";
import type { Challenge, ScenePoint } from "./types";

/*
 * The challenges a drive knows, the races among them: the lists, and any of the page's own (a test's,
 * laid on its own world's roads), which of them stand in this world, which have
 * been passed and with what best, and whose start ring the car is in. The maps
 * and the start rings in the world draw from it; passes, solo and co-op apart,
 * are kept by whatever store it's handed.
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

  /** How many of the bucket list's challenges in this world have been passed, solo or in co-op, and how many there are. */
  get bucketList(): { done: number; total: number } {
    const listed = this.challenges.filter(({ kind }) => kind !== "race");
    return { done: listed.filter((challenge) => this.passed(challenge)).length, total: listed.length };
  }

  /** How many of the races in this world have earned a medal, solo or in co-op, and how many there are. */
  get races(): { done: number; total: number } {
    const races = this.challenges.filter(({ kind }) => kind === "race");
    return { done: races.filter((race) => this.passed(race)).length, total: races.length };
  }

  /** Each start in this world as the maps draw it. */
  marks(): MapChallenge[] {
    return this.challenges.map((challenge) => ({
      ...ringCentre(challenge),
      id: challenge.id,
      title: challenge.title,
      kind: challenge.kind,
      passed: this.passed(challenge),
      race: challenge.kind === "race" ? { number: challenge.number, ground: challenge.ground, shape: challenge.shape, laps: challenge.laps, lengthM: challenge.lengthM, medal: this.medal(challenge) } : undefined,
    }));
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

  passOf(challenge: Challenge, mode: PlayMode): ChallengePass | null {
    return (this.passes[mode][challenge.id] as ChallengePass | undefined) ?? null;
  }

  /** Whether a challenge has been passed in either mode, or a race won a medal in either, which is what the maps and the start rings show. */
  passed(challenge: Challenge): boolean {
    if (challenge.kind === "race") return this.medal(challenge) !== null;
    return PLAY_MODES.some((mode) => this.passOf(challenge, mode) !== null);
  }

  /** A race's best medal in either mode, or in one. */
  medal(challenge: Challenge, mode?: PlayMode): Medal | null {
    let best: Medal | null = null;
    for (const each of mode ? [mode] : PLAY_MODES) {
      const medal = this.passOf(challenge, each)?.medal ?? null;
      if (betterMedal(medal, best)) best = medal;
    }
    return best;
  }

  /** An attempt played in a mode is over: a pass, or a better best, is kept for that mode. */
  record(challenge: Challenge, mode: PlayMode, outcome: Outcome): void {
    const next = withOutcome(this.passes, challenge, mode, outcome);
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
