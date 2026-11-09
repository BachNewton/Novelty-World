import type { CarId } from "../sim/cars";
import { adoptLoss, advanceRun, dropPlayer, phaseOf, reportResult, retryRun, startRun, type CarSample, type ChallengeRun, type Outcome, type RunEvent, type RunPhase } from "./run";
import type { Challenge, StartPlace } from "./types";

/*
 * One challenge being played on this client, from its start to leaving it: the
 * run, which seat on the start line is this client's, the car the player had
 * before, and whether the car is still on its way to the start line, which the
 * run waits for. Everything that restarts a run goes through `retry` (this
 * player's) or `follow` (a teammate's), and what another client measured comes
 * in through `report` and `adoptLoss`, so the network drives a co-op run
 * through the same doors as the menu does a solo one. The session never places
 * the car itself: its host does, at once where the start's ground is loaded
 * and after a load round it where it isn't.
 *
 * In co-op, two to four players, the lights wait for every car still in: this
 * one on its place, and each teammate's client saying its own is on its place
 * for the same attempt. That's the ready gate, and the countdown runs from the
 * moment it opens here, so each player's green is their own and the skew
 * between clients never reaches a result. A teammate who leaves is dropped
 * (`drop`): the gate stops waiting for them and the run settles on the rest.
 */

export interface SessionHost {
  carId: () => CarId;
  /** Hands over a car: the challenge's, for the challenge it's handed for, or the player's own again with null. */
  setCar: (id: CarId, handedFor: Challenge | null) => void;
  /** Puts the car still on a start place, and calls `done` once it's there: at once, or once the ground there has loaded. */
  placeAt: (place: StartPlace, done: () => void) => void;
  /** Where a seat starts, when not the challenge's own start places: a race puts its players behind the racers. */
  startPlaceOf?: (challenge: Challenge, seat: number, players: number) => StartPlace;
  /** Shows a challenge's route on the GPS, or takes it away. */
  showRoute: (challenge: Challenge | null) => void;
  /** An attempt is over. */
  onOver: (challenge: Challenge, outcome: Outcome) => void;
  /** Co-op: this player asked for this attempt, before the car is put back for it. */
  onRetry?: (attempt: number) => void;
  /** Co-op: this car is on its place for this attempt. */
  onReady?: (attempt: number) => void;
  /** Co-op: this player's own time or speed for this attempt, as this client measured it, and in a race their team points. */
  onResult?: (attempt: number, result: number, points?: number) => void;
  /** A race: this player's team points against the racers as they stand, read as they cross the line. */
  pointsNow?: () => number;
  /** Co-op: this client called this attempt lost on its own clock, with the results it had. */
  onLost?: (attempt: number, results: readonly (number | null)[]) => void;
}

export type SessionPhase = RunPhase | "placing" | "waiting";

export class ChallengeSession {
  run: ChallengeRun;
  /** The car the player was driving before, which leaving gives back. */
  readonly previousCar: CarId;
  /** The car is on its way to the start line, and the run waits for it. */
  placing = false;
  /** The attempt each seat's car was last said to be on its place for. */
  private readonly readyFor: number[];
  private left = false;
  /** A co-op race's team points this attempt, by seat, as each player's client scored them against its racers. */
  private scores: (number | null)[];

  constructor(
    readonly challenge: Challenge,
    private readonly host: SessionHost,
    /** This client's place on the start line, and its player in the run. */
    readonly seat = 0,
    players = 1,
  ) {
    this.readyFor = Array.from({ length: players }, () => 0);
    this.scores = this.readyFor.map(() => null);
    this.previousCar = host.carId();
    host.setCar(challenge.car, challenge);
    this.run = startRun(challenge, players);
    this.toStart();
  }

  get coop(): boolean {
    return this.run.players.length > 1;
  }

  /** Every teammate still in has their car on its place for this attempt, or there's no team. */
  get teamReady(): boolean {
    return this.run.players.every(({ gone }, seat) => seat === this.seat || gone || this.readyFor[seat] === this.run.attempt);
  }

  /** How many players are still in, this one among them. */
  get playing(): number {
    return this.run.players.filter(({ gone }) => !gone).length;
  }

  /** Where the attempt stands: on the way to the line, on it waiting for the team, or the run's own phase. */
  get phase(): SessionPhase {
    if (this.placing) return "placing";
    if (!this.teamReady && !this.run.outcome) return "waiting";
    return phaseOf(this.run);
  }

  private toStart(): void {
    this.placing = true;
    this.host.placeAt(this.host.startPlaceOf?.(this.challenge, this.seat, this.run.players.length) ?? this.challenge.starts[this.seat], () => {
      if (this.left) return;
      this.placing = false;
      this.host.showRoute(this.challenge);
      // A teammate's retry that came while the car was on its way renumbered the attempt this placing is for.
      if (this.coop) this.host.onReady?.(this.run.attempt);
    });
  }

  /** Whether the player's input is held off the car: on the way to the line, waiting there for the team, and through the countdown, on the handbrake. */
  holdsCar(): boolean {
    return this.placing || !this.teamReady || phaseOf(this.run) === "countdown";
  }

  /** This player's retry: everyone back on the start line for the next attempt. A retry already on its way to the line is the one asked for. */
  retry(): boolean {
    if (this.placing || this.left) return false;
    this.run = retryRun(this.run);
    this.scores = this.scores.map(() => null);
    // The team hears of the attempt before it hears this car is ready for it.
    if (this.coop) this.host.onRetry?.(this.run.attempt);
    this.toStart();
    return true;
  }

  /**
   * A teammate's retry, for the attempt it names. One for an attempt this client
   * has already started is the same restart (both pressed at once) or an old
   * one, and is dropped. While the car is still on its way to the line, that
   * placing serves the new attempt too.
   */
  follow(attempt: number): boolean {
    if (this.left || attempt <= this.run.attempt) return false;
    this.run = retryRun(this.run, attempt);
    this.scores = this.scores.map(() => null);
    if (!this.placing) this.toStart();
    return true;
  }

  /** A teammate's car is on its place for this attempt. */
  placed(seat: number, attempt: number): void {
    this.readyFor[seat] = Math.max(this.readyFor[seat], attempt);
  }

  /** One step of the simulation, with where this client's car is after it. The clock waits at the line until every car still in is on it. */
  step(stepS: number, sample: CarSample): RunEvent[] {
    if (this.placing || this.left || !this.teamReady) return [];
    const samples = this.run.players.map((_, index) => (index === this.seat ? sample : null));
    return this.settled(advanceRun(this.run, stepS, samples), true);
  }

  /** A teammate's result, as their own client measured it. */
  report(attempt: number, player: number, result: number, points?: number): RunEvent[] {
    // Kept before the result settles the attempt, so the race's team score has every player's points when it's over.
    if (points !== undefined && attempt === this.run.attempt) this.scores[player] = points;
    return this.settled(reportResult(this.run, attempt, player, result), true);
  }

  /** A race's team points this attempt, one for each player still in, or null until every one of them has finished. */
  get teamPoints(): number[] | null {
    const points = this.scores.filter((_, seat) => !this.run.players[seat].gone);
    return points.every((each) => each !== null) ? (points as number[]) : null;
  }

  /** A teammate's client called this attempt lost. */
  adoptLoss(attempt: number, results: readonly (number | null)[]): RunEvent[] {
    return this.settled(adoptLoss(this.run, attempt, results), false);
  }

  /** A teammate left: the rest carry on without them, and the attempt may settle on the rest now. */
  drop(seat: number): RunEvent[] {
    if (seat === this.seat) throw new Error("this client's own seat dropped");
    return this.settled(dropPlayer(this.run, seat, this.seat), true);
  }

  private settled({ run, events }: { run: ChallengeRun; events: RunEvent[] }, decidedHere: boolean): RunEvent[] {
    this.run = run;
    for (const event of events) {
      if (event.kind === "result" && event.player === this.seat) {
        // A race's points are settled as the player crosses the line: no racer behind can pass them then.
        const points = this.challenge.kind === "race" ? this.host.pointsNow?.() : undefined;
        if (points !== undefined) this.scores[this.seat] = points;
        if (this.coop) this.host.onResult?.(run.attempt, event.result, points);
      }
      if (event.kind !== "over") continue;
      if (decidedHere && this.coop && event.outcome.average === null) this.host.onLost?.(run.attempt, event.outcome.results);
      this.host.onOver(this.challenge, event.outcome);
    }
    return events;
  }

  /** Out of the challenge, back in the car from before, where the car is now. */
  leave(): void {
    if (this.left) return;
    this.left = true;
    this.host.showRoute(null);
    this.host.setCar(this.previousCar, null);
  }
}
