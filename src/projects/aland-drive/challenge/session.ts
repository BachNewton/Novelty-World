import type { CarId } from "../sim/cars";
import { advanceRun, phaseOf, reportResult, retryRun, startRun, type CarSample, type ChallengeRun, type Outcome, type RunEvent } from "./run";
import type { Challenge, StartPlace } from "./types";

/*
 * One challenge being played on this client, from its start to leaving it: the
 * run, which seat on the start line is this client's, the car the player had
 * before, and whether the car is still on its way to the start line, which the
 * run waits for. Everything that restarts a run goes through `retry`, and a
 * result measured on another client comes in through `report`, so the network
 * drives a co-op run through the same two doors as the menu does a solo one.
 * The session never places the car itself: its host does, at once where the
 * start's ground is loaded and after a load round it where it isn't.
 */

export interface SessionHost {
  carId: () => CarId;
  setCar: (id: CarId) => void;
  /** Puts the car still on a start place, and calls `done` once it's there: at once, or once the ground there has loaded. */
  placeAt: (place: StartPlace, done: () => void) => void;
  /** Shows a challenge's route on the GPS, or takes it away. */
  showRoute: (challenge: Challenge | null) => void;
  /** An attempt is over. */
  onOver: (challenge: Challenge, outcome: Outcome) => void;
}

export class ChallengeSession {
  run: ChallengeRun;
  /** The car the player was driving before, which leaving gives back. */
  readonly previousCar: CarId;
  /** The car is on its way to the start line, and the run waits for it. */
  placing = false;
  private left = false;

  constructor(
    readonly challenge: Challenge,
    private readonly host: SessionHost,
    /** This client's place on the start line, and its player in the run. */
    readonly seat: 0 | 1 = 0,
    players: 1 | 2 = 1,
  ) {
    this.previousCar = host.carId();
    host.setCar(challenge.car);
    this.run = startRun(challenge, players);
    this.toStart();
  }

  private toStart(): void {
    this.placing = true;
    const { attempt } = this.run;
    this.host.placeAt(this.challenge.starts[this.seat], () => {
      if (this.left || this.run.attempt !== attempt) return;
      this.placing = false;
      this.host.showRoute(this.challenge);
    });
  }

  /** Whether the player's input is held off the car: on the way to the line and through the countdown, on the handbrake. */
  holdsCar(): boolean {
    return this.placing || phaseOf(this.run) === "countdown";
  }

  /** Everyone back on the start line for the next attempt. A retry already on its way to the line is the one asked for. */
  retry(): boolean {
    if (this.placing || this.left) return false;
    this.run = retryRun(this.run);
    this.toStart();
    return true;
  }

  /** One step of the simulation, with where this client's car is after it. */
  step(stepS: number, sample: CarSample): RunEvent[] {
    if (this.placing || this.left) return [];
    const samples = this.run.players.map((_, index) => (index === this.seat ? sample : null));
    return this.settled(advanceRun(this.run, stepS, samples));
  }

  /** A partner's result, as their own client measured it. */
  report(attempt: number, player: number, result: number): RunEvent[] {
    return this.settled(reportResult(this.run, attempt, player, result));
  }

  private settled({ run, events }: { run: ChallengeRun; events: RunEvent[] }): RunEvent[] {
    this.run = run;
    for (const event of events) if (event.kind === "over") this.host.onOver(this.challenge, event.outcome);
    return events;
  }

  /** Out of the challenge, back in the car from before, where the car is now. */
  leave(): void {
    if (this.left) return;
    this.left = true;
    this.host.showRoute(null);
    this.host.setCar(this.previousCar);
  }
}
