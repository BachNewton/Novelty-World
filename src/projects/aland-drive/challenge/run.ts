import type { Challenge, Gate } from "./types";

/*
 * One attempt at a challenge, as a pure state machine. Each step it is told how
 * far the clock moved and where each car it's the authority over is now, and it
 * finds every line crossed since the step before by intersecting the car's path
 * between the two with the line, so no speed can skip one. The clock runs from
 * the green light, which ends the countdown; a player's time and speed come from
 * their own client, so a partner's arrive as a report rather than as samples.
 *
 * A Route's gates count only in order: a gate passed out of turn isn't counted,
 * and the car carries on until it goes back through the one it missed. The
 * finish is the last gate. Solo, the run is lost once the clock passes the
 * target. In co-op the two times are averaged, so the run is lost once even the
 * best still possible can't make it: each player still driving takes at least
 * the clock's time. Each client has its own clock, so only a client still
 * timing a player of its own may call the loss, and it tells the partner,
 * whose client takes it as it stands (`adoptLoss`): two clients never settle
 * one attempt two ways. A Speed trap has no clock: it ends once everyone has
 * crossed the camera, and passes on the average speed there.
 */

export const COUNTDOWN_S = 3;
const KMH_PER_MS = 3.6;

/** One car this step. A car put somewhere rather than driven there (a reset) crosses nothing on its way. */
export interface CarSample {
  x: number;
  z: number;
  speedMS: number;
  placed?: boolean;
}

export interface PlayerRun {
  /** The car at the end of the last step, or null before its first. */
  last: CarSample | null;
  /** A Route's next gate to pass. */
  nextGate: number;
  /** Seconds from the green light to the finish, or the speed in km/h at the camera, once there. */
  result: number | null;
}

export interface Outcome {
  passed: boolean;
  /** Each player's time or speed, null for a player still on the road when a Route was lost. */
  results: readonly (number | null)[];
  /** The average of the results, null unless every player has one. */
  average: number | null;
}

export interface ChallengeRun {
  challenge: Challenge;
  /** Counts the attempts at this challenge from 1, so a message about one already over can be told apart. */
  attempt: number;
  /** Seconds since the green light, below zero during the countdown. */
  clockS: number;
  players: readonly PlayerRun[];
  outcome: Outcome | null;
}

export type RunEvent =
  | { kind: "green" }
  | { kind: "gate"; player: number; gate: number }
  | { kind: "result"; player: number; result: number }
  | { kind: "over"; outcome: Outcome };

export type RunPhase = "countdown" | "running" | "over";

export function startRun(challenge: Challenge, players: 1 | 2, attempt = 1): ChallengeRun {
  return {
    challenge,
    attempt,
    clockS: -COUNTDOWN_S,
    players: Array.from({ length: players }, () => ({ last: null, nextGate: 0, result: null })),
    outcome: null,
  };
}

/** The next attempt, or a later one a partner has moved on to: everyone back on the start line and the lights again. */
export function retryRun(run: ChallengeRun, attempt = run.attempt + 1): ChallengeRun {
  return startRun(run.challenge, run.players.length as 1 | 2, attempt);
}

export function phaseOf(run: ChallengeRun): RunPhase {
  if (run.outcome) return "over";
  return run.clockS < 0 ? "countdown" : "running";
}

/** Seconds until the green light, 0 once it's lit. */
export function countdownLeftS(run: ChallengeRun): number {
  return Math.max(0, -run.clockS);
}

const forwardOf = (heading: number) => ({ x: -Math.sin(heading), z: -Math.cos(heading) });
const cross = (ax: number, az: number, bx: number, bz: number) => ax * bz - az * bx;

/**
 * Where on the way from one place to the next, as a share from 0 to 1, the path
 * crosses a gate going forwards: null if it doesn't. A path that starts on the
 * line crossed it the step before, so the share is never 0.
 */
export function crossingShare(from: { x: number; z: number }, to: { x: number; z: number }, gate: Gate): number | null {
  const forward = forwardOf(gate.heading);
  const [dx, dz] = [to.x - from.x, to.z - from.z];
  if (dx * forward.x + dz * forward.z <= 0) return null;
  const [ax, az] = [-forward.z, forward.x];
  const denominator = cross(dx, dz, ax, az);
  if (denominator === 0) return null;
  const [gx, gz] = [gate.x - from.x, gate.z - from.z];
  const share = cross(gx, gz, ax, az) / denominator;
  const along = cross(gx, gz, dx, dz) / denominator;
  return share > 0 && share <= 1 && Math.abs(along) <= gate.halfWidthM ? share : null;
}

function averageOf(results: readonly (number | null)[]): number | null {
  const known = results.filter((result): result is number => result !== null);
  return known.length === results.length ? known.reduce((sum, result) => sum + result, 0) / known.length : null;
}

/** A Route is lost once the best average still possible, every player still driving finishing this instant, is over the target. */
function routeLost(run: ChallengeRun, targetS: number): boolean {
  const best = run.players.reduce((sum, { result }) => sum + (result ?? run.clockS), 0) / run.players.length;
  return best > targetS;
}

/** `timedHere`: whether this client is timing a player still on the road, which is what lets it call a Route lost. */
function settle(run: ChallengeRun, events: RunEvent[], timedHere: (player: number) => boolean): ChallengeRun {
  if (run.outcome) return run;
  const results = run.players.map(({ result }) => result);
  const average = averageOf(results);
  const { challenge } = run;
  let outcome: Outcome | null = null;
  if (challenge.kind === "route") {
    if (average !== null) outcome = { passed: average <= challenge.targetS, results, average };
    else if (run.players.some(({ result }, index) => result === null && timedHere(index)) && routeLost(run, challenge.targetS)) outcome = { passed: false, results, average: null };
  } else if (average !== null) {
    outcome = { passed: average >= challenge.targetKmh, results, average };
  }
  if (!outcome) return run;
  events.push({ kind: "over", outcome });
  return { ...run, outcome };
}

function stepPlayer(run: ChallengeRun, index: number, sample: CarSample, stepS: number, events: RunEvent[]): PlayerRun {
  const player = run.players[index];
  const { last } = player;
  const kept = { ...player, last: sample };
  if (!last || sample.placed || player.result !== null) return kept;
  const { challenge } = run;
  const at = (share: number) => run.clockS + share * stepS;
  if (challenge.kind === "speed-trap") {
    const share = crossingShare(last, sample, challenge.camera);
    if (share === null || at(share) < 0) return kept;
    const result = (last.speedMS + share * (sample.speedMS - last.speedMS)) * KMH_PER_MS;
    events.push({ kind: "result", player: index, result });
    return { ...kept, result };
  }
  // One step can pass more than one gate, at a speed and spacing no car reaches, so each is looked for in turn.
  let { nextGate } = player;
  for (;;) {
    const share = crossingShare(last, sample, challenge.gates[nextGate]);
    if (share === null || at(share) < 0) return { ...kept, nextGate };
    if (nextGate === challenge.gates.length - 1) {
      const result = at(share);
      events.push({ kind: "result", player: index, result });
      return { ...kept, nextGate: nextGate + 1, result };
    }
    events.push({ kind: "gate", player: index, gate: nextGate });
    nextGate++;
  }
}

/**
 * The run a step on: the clock moved by `stepS`, and each car this client is the
 * authority over is where its sample says, null for a car whose client reports
 * its own result. During the countdown the cars are only noted.
 */
export function advanceRun(run: ChallengeRun, stepS: number, samples: readonly (CarSample | null)[]): { run: ChallengeRun; events: RunEvent[] } {
  if (run.outcome) return { run, events: [] };
  const events: RunEvent[] = [];
  if (run.clockS < 0 && run.clockS + stepS >= 0) events.push({ kind: "green" });
  const players = run.players.map((player, index) => {
    const sample = samples[index];
    return sample ? stepPlayer(run, index, sample, stepS, events) : player;
  });
  return { run: settle({ ...run, players, clockS: run.clockS + stepS }, events, (index) => samples[index] !== null), events };
}

/** A partner's own time or speed, as their client measured it, for this attempt. A report for another attempt, or for a result already in, changes nothing. */
export function reportResult(run: ChallengeRun, attempt: number, player: number, result: number): { run: ChallengeRun; events: RunEvent[] } {
  if (attempt !== run.attempt || run.outcome || run.players[player].result !== null) return { run, events: [] };
  const events: RunEvent[] = [{ kind: "result", player, result }];
  const players = run.players.map((each, index) => (index === player ? { ...each, result } : each));
  return { run: settle({ ...run, players }, events, (index) => index !== player), events };
}

/** A partner's client called this attempt lost on its own clock, with the results it had: the attempt ends here as it ended there. */
export function adoptLoss(run: ChallengeRun, attempt: number, results: readonly (number | null)[]): { run: ChallengeRun; events: RunEvent[] } {
  if (attempt !== run.attempt || run.outcome || results.length !== run.players.length) return { run, events: [] };
  const outcome: Outcome = { passed: false, results, average: null };
  return { run: { ...run, outcome }, events: [{ kind: "over", outcome }] };
}

/**
 * In co-op, once one player has a result and the other hasn't, what the other
 * now needs for the team to pass: the clock time to finish by, or the speed to
 * reach at the camera. Null otherwise.
 */
export function partnerNeeds(run: ChallengeRun): { player: number; result: number } | null {
  if (run.outcome || run.players.length !== 2) return null;
  const waiting = run.players.findIndex(({ result }) => result === null);
  const done = run.players.find(({ result }) => result !== null);
  if (waiting < 0 || !done || done.result === null) return null;
  const target = run.challenge.kind === "route" ? run.challenge.targetS : run.challenge.targetKmh;
  return { player: waiting, result: 2 * target - done.result };
}

/** How many of a Route's gates a player has passed, the finish included, and how many there are. */
export function gatesPassed(run: ChallengeRun, player: number): { passed: number; of: number } {
  const { challenge } = run;
  return challenge.kind === "route" ? { passed: run.players[player].nextGate, of: challenge.gates.length } : { passed: 0, of: 0 };
}
