import { MOST_PLAYERS, type Challenge, type Gate } from "./types";

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
 * target. In co-op, two to four players, the times are averaged, so the run is
 * lost once even the best still possible can't make it: each player still
 * driving takes at least the clock's time. Each client has its own clock, so
 * only a client still timing a player of its own may call the loss, and it
 * tells the team, whose clients take it as it stands (`adoptLoss`): two clients
 * never settle one attempt two ways. A Speed trap has no clock: it ends once
 * everyone has crossed the camera, and passes on the average speed there.
 *
 * A player who leaves a co-op run is gone from it (`dropPlayer`): the rest carry
 * on, and the average is theirs alone, this attempt and every one after it.
 *
 * A race's lines are a Route's gates lap after lap: one lap's are crossed in
 * order, then the same again, and the last line of the last lap is the finish.
 * It has no target to lose against: it ends once everyone has finished, in the
 * place that earns its medal (`standings.ts`).
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
  /** The next line to cross, counted over every lap of a race. */
  nextGate: number;
  /** Seconds from the green light to the finish, or the speed in km/h at the camera, once there. */
  result: number | null;
  /** Left the co-op run: not waited for, and not in the average. */
  gone: boolean;
}

export interface Outcome {
  passed: boolean;
  /** Each player's time or speed, null for a player still on the road when a Route was lost, or one who left. */
  results: readonly (number | null)[];
  /** The average of the results of every player still in, null unless each has one. */
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

/** A run for this many players, one to four, those marked gone having left. */
export function startRun(challenge: Challenge, players: number, attempt = 1, gone: readonly boolean[] = []): ChallengeRun {
  if (!Number.isInteger(players) || players < 1 || players > MOST_PLAYERS) throw new Error(`a run for ${players} players`);
  return {
    challenge,
    attempt,
    clockS: -COUNTDOWN_S,
    players: Array.from({ length: players }, (_, index) => ({ last: null, nextGate: 0, result: null, gone: gone[index] ?? false })),
    outcome: null,
  };
}

/** The next attempt, or a later one a teammate has moved on to: everyone still in back on the start line and the lights again. */
export function retryRun(run: ChallengeRun, attempt = run.attempt + 1): ChallengeRun {
  return startRun(run.challenge, run.players.length, attempt, run.players.map(({ gone }) => gone));
}

export function phaseOf(run: ChallengeRun): RunPhase {
  if (run.outcome) return "over";
  return run.clockS < 0 ? "countdown" : "running";
}

/** Seconds until the green light, 0 once it's lit. */
export function countdownLeftS(run: ChallengeRun): number {
  return Math.max(0, -run.clockS);
}

/** How many lines a run has to cross in order: a Route's gates, a race's every lap, a Speed trap's camera. */
export function linesOf(challenge: Challenge): number {
  if (challenge.kind === "speed-trap") return 1;
  return challenge.kind === "race" ? challenge.gates.length * challenge.laps : challenge.gates.length;
}

/** The line to cross after `crossed` others, the camera for a Speed trap. */
export function lineAt(challenge: Challenge, crossed: number): Gate {
  if (challenge.kind === "speed-trap") return challenge.camera;
  return challenge.gates[crossed % challenge.gates.length];
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

const present = (run: ChallengeRun) => run.players.filter(({ gone }) => !gone);

/** The average of the results of every player still in, null until each of them has one. */
function averageOf(run: ChallengeRun): number | null {
  const results = present(run).map(({ result }) => result);
  const known = results.filter((result): result is number => result !== null);
  return known.length === results.length ? known.reduce((sum, result) => sum + result, 0) / known.length : null;
}

/** A Route is lost once the best average still possible, every player still driving finishing this instant, is over the target. */
function routeLost(run: ChallengeRun, targetS: number): boolean {
  const players = present(run);
  const best = players.reduce((sum, { result }) => sum + (result ?? run.clockS), 0) / players.length;
  return best > targetS;
}

/** `timedHere`: whether this client is timing a player still on the road, which is what lets it call a Route lost. */
function settle(run: ChallengeRun, events: RunEvent[], timedHere: (player: number) => boolean): ChallengeRun {
  if (run.outcome) return run;
  const results = run.players.map(({ result, gone }) => (gone ? null : result));
  const average = averageOf(run);
  const { challenge } = run;
  let outcome: Outcome | null = null;
  if (challenge.kind === "race") {
    if (average !== null) outcome = { passed: true, results, average };
  } else if (challenge.kind === "route") {
    if (average !== null) outcome = { passed: average <= challenge.targetS, results, average };
    else if (run.players.some(({ result, gone }, index) => !gone && result === null && timedHere(index)) && routeLost(run, challenge.targetS)) outcome = { passed: false, results, average: null };
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
  if (!last || sample.placed || player.result !== null || player.gone) return kept;
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
  const lines = linesOf(challenge);
  for (;;) {
    const share = crossingShare(last, sample, lineAt(challenge, nextGate));
    if (share === null || at(share) < 0) return { ...kept, nextGate };
    if (nextGate === lines - 1) {
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
  if (attempt !== run.attempt || run.outcome || run.players[player].result !== null || run.players[player].gone) return { run, events: [] };
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
 * A player left the co-op run, which goes on without them: they're no longer
 * waited for or in the average, so the attempt may settle on the rest at once.
 * `timedHere` is the player this client times, the one whose clock may call a
 * Route lost.
 */
export function dropPlayer(run: ChallengeRun, player: number, timedHere: number): { run: ChallengeRun; events: RunEvent[] } {
  if (run.players[player].gone) return { run, events: [] };
  const events: RunEvent[] = [];
  const players = run.players.map((each, index) => (index === player ? { ...each, result: null, gone: true } : each));
  return { run: settle({ ...run, players }, events, (index) => index === timedHere), events };
}

/**
 * In co-op, once a teammate has a result and some still driving haven't, the
 * average those still driving now need between them for the team to pass: the
 * clock time to finish by, or the speed to reach at the camera. Null otherwise.
 */
export function teamNeeds(run: ChallengeRun): { players: number[]; result: number } | null {
  const players = present(run);
  if (run.outcome || players.length < 2 || run.challenge.kind === "race") return null;
  const done = players.flatMap(({ result }) => (result === null ? [] : [result]));
  const waiting = run.players.flatMap(({ result, gone }, index) => (!gone && result === null ? [index] : []));
  if (done.length === 0 || waiting.length === 0) return null;
  const target = run.challenge.kind === "route" ? run.challenge.targetS : run.challenge.targetKmh;
  return { players: waiting, result: (players.length * target - done.reduce((sum, result) => sum + result, 0)) / waiting.length };
}

/** How many of a Route's gates a player has passed, the finish included, and how many there are: on a race, of this lap's. */
export function gatesPassed(run: ChallengeRun, player: number): { passed: number; of: number } {
  const { challenge } = run;
  const { nextGate } = run.players[player];
  if (challenge.kind === "route") return { passed: nextGate, of: challenge.gates.length };
  if (challenge.kind === "race") return { passed: nextGate - (lapOf(run, player).lap - 1) * challenge.gates.length, of: challenge.gates.length };
  return { passed: 0, of: 0 };
}

/** The lap a player is on in a race, from 1, and how many there are; the last once they've finished. */
export function lapOf(run: ChallengeRun, player: number): { lap: number; of: number } {
  const { challenge } = run;
  if (challenge.kind !== "race") return { lap: 1, of: 1 };
  return { lap: Math.min(challenge.laps, Math.floor(run.players[player].nextGate / challenge.gates.length) + 1), of: challenge.laps };
}
