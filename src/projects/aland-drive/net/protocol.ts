import { playgroundAsked } from "../playground/place";
import { RELAY_PARAM, relayUrlFromSearch } from "@/shared/lib/peer";
import { LAMPS_OFF, type CarLamps, type CarState, type Rotation, type Vector3 } from "../sim/car-state";
import { DEFAULT_CAR, isCarId, type CarId } from "../sim/cars";
import type { LaneRecord, VehicleKind } from "../traffic/lane-driver";
import { MOST_PLAYERS } from "../challenge/types";

/*
 * What players send each other in the online world: each car's state, as its
 * own client has it, which names the car it is, each computer-driven car's
 * from the player running it, the lane traffic each player runs, the messages of a co-op challenge, and the
 * room's one shared GPS destination. A guest sends its own up; the host hands each one on to every
 * other guest, or to the one player a challenge message is for, naming whose
 * it is, and sends its own down. Every payload off the wire is untrusted and
 * parsed here.
 */

export const GAME = "aland-drive";
/** Everyone shares one world: the first to arrive hosts it. */
export const WORLD_CODE = "island";
/** Test only: a world of a test's own, so tests running at once never meet. */
export const WORLD_PARAM = "drive-world";
const WORLD_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * A car's state, and when its client stepped it, in ms on that client's own clock, so it's shown by when it happened
 * rather than when it arrived (`sim/remote-timeline.ts`). A version of the game from before that sends no time.
 */
export interface CarMessage {
  state: CarState;
  at?: number;
  /** The race this player is in, if any, and how far round it they are. */
  race?: RaceProgress;
}

/**
 * Where a player stands in a race, sent with their car: who is in which race and attempt, which says who may run its
 * racers (`net/computer-cars.ts`), and how far round they are, which places them among the racers and lets a racer
 * take their place if they leave it unfinished (`racers/shared.ts`).
 */
export interface RaceProgress {
  race: string;
  attempt: number;
  /** The next line to cross, counted over every lap. */
  nextGate: number;
  /** Lines crossed and how near the next, as a count of lines (`racers/racer.ts`'s `progressOf`). */
  progress: number;
  /** Seconds from their green to their finish, null while still racing. */
  finishedS: number | null;
}

/**
 * A co-op challenge's messages (`challenge/coop.ts`), each naming the challenge
 * and the attempt it's about. Invite, to everyone, and accept: forming a team.
 * Start: the inviter's team, by seat, the inviter first, told to everyone so
 * none of them is offered another and every other invitee drops the invite.
 * Retry: the attempt everyone goes back for. Ready: this car is on its start
 * place for the attempt. Result: this player's own time or speed, and in a race
 * their team points. Lost: this client called the attempt lost
 * on its own clock, with the results it had. Leave: out of the challenge, or
 * an invite or accept taken back.
 */
export type ChallengeMessage =
  | { type: "invite" | "accept" | "retry" | "ready" | "leave"; challenge: string; attempt: number }
  | { type: "start"; challenge: string; attempt: number; team: string[] }
  | { type: "result"; challenge: string; attempt: number; result: number; points?: number }
  | { type: "lost"; challenge: string; attempt: number; results: (number | null)[] };

export type ChallengeType = ChallengeMessage["type"];

/**
 * A computer-driven car (`computer-cars.ts`), sent by the player who runs it:
 * its state, the player running it now, how many times it has changed hands,
 * when it was stepped, and its driver's record, whose shape is its driver's own; or, with `gone`,
 * taken out of the world by whoever ran it.
 */
export interface ComputerCarMessage {
  id: string;
  runner: string;
  handovers: number;
  state: CarState;
  /** As a player's car's: when the runner stepped it, on the runner's clock. */
  at?: number;
  driver: Record<string, unknown>;
  gone?: true;
}

/**
 * A vehicle of the lane traffic (`shared-traffic.ts`), from the player running it, or handed by them to another: its
 * driver's whole record, how many times it has changed hands, and who runs it now, the sender when null.
 */
export interface TrafficVehicle {
  record: LaneRecord;
  handovers: number;
  runner: string | null;
}

/**
 * The traffic one player sends at once: the vehicles it runs that someone is near, those it has taken away, or out of
 * the traffic as hit, and every other player it knows the place of, whose vehicles near it it has sent from then on.
 */
export interface TrafficMessage {
  vehicles: TrafficVehicle[];
  gone: { id: string; handovers: number; hit: boolean }[];
  knows: string[];
}

/** A place on the ground, in metres. */
export interface MapPoint {
  x: number;
  z: number;
}

/**
 * The room's GPS destination as the host last set it: the point everyone's GPS
 * routes to from where they are, or null once cleared, and the player who set
 * or cleared it, by peer id and by name, so it still names them after they go.
 */
export interface SharedDestination {
  point: MapPoint | null;
  setter: string;
  name: string;
}

/**
 * A challenge message for one player, or for everyone when `to` is left out. A guest asks the host for the world's
 * time once it's in (`ask-time`), and the host answers with where the game's calendar stands (`time`, game days).
 */
export type GuestMessage =
  | ({ kind: "car" } & CarMessage)
  | { kind: "challenge"; to?: string; message: ChallengeMessage }
  | { kind: "computer"; car: ComputerCarMessage }
  | { kind: "traffic"; traffic: WireTraffic }
  | { kind: "ask-time" }
  | { kind: "destination"; point: MapPoint | null };
export type HostMessage =
  | ({ kind: "car"; from: string } & CarMessage)
  | { kind: "challenge"; from: string; message: ChallengeMessage }
  | { kind: "computer"; from: string; car: ComputerCarMessage }
  | { kind: "traffic"; from: string; traffic: WireTraffic }
  | { kind: "time"; gameDays: number }
  | { kind: "destination"; from: string; destination: SharedDestination };

/**
 * The relay to join the online world on, or null to drive alone. A page on
 * tiles of its own (`?tiles=`) is a tool's or a test's, on a world that isn't
 * the real island, and a browser driven by automation is a tool: both drive
 * alone unless they name a relay (`?relay=local:<port>`), as the multiplayer
 * tests do.
 */
export function onlineRelay(search: string, automated: boolean): string | null {
  const query = new URLSearchParams(search);
  if (query.has(RELAY_PARAM)) return relayUrlFromSearch(search);
  if (query.has("tiles") || playgroundAsked(search) || automated) return null;
  return relayUrlFromSearch(search);
}

export function worldCodeFromSearch(search: string): string {
  const named = new URLSearchParams(search).get(WORLD_PARAM);
  if (named === null) return WORLD_CODE;
  if (!WORLD_PATTERN.test(named)) throw new Error(`?${WORLD_PARAM}=${named} is not a world's name`);
  return named;
}

/** Centimetres and ten-thousandths: what a drawn car can show, in a third of the characters. */
const metres = (value: number) => Math.round(value * 100) / 100;
const fine = (value: number) => Math.round(value * 10000) / 10000;
/** A tenth of a millisecond: a car at top speed moves 7 mm in it. */
export const wireTime = (ms: number) => Math.round(ms * 10) / 10;
const isTime = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

export function wireState(state: CarState): CarState {
  return {
    position: state.position.map(metres) as Vector3,
    rotation: state.rotation.map(fine) as Rotation,
    velocity: state.velocity.map(metres) as Vector3,
    spin: state.spin.map(metres) as Vector3,
    car: state.car,
    steer: fine(state.steer),
    suspension: [fine(state.suspension[0]), fine(state.suspension[1]), fine(state.suspension[2]), fine(state.suspension[3])],
    roll: state.roll.map(metres) as CarState["roll"],
    lamps: state.lamps,
    ...(state.paint === undefined ? {} : { paint: state.paint }),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function numbers(value: unknown, count: number): number[] | null {
  if (!Array.isArray(value) || value.length !== count) return null;
  return value.every((item) => typeof item === "number" && Number.isFinite(item)) ? (value as number[]) : null;
}

/** A car this version of the game knows, or its default car: another version may have a car this one doesn't. */
function knownCar(car: string): CarId {
  if (isCarId(car)) return car;
  console.warn(`aland-drive online: no car ${car} in this version; drawing ${DEFAULT_CAR}`);
  return DEFAULT_CAR;
}

function parseState(value: unknown): CarState | null {
  if (!isRecord(value)) return null;
  const position = numbers(value.position, 3);
  const rotation = numbers(value.rotation, 4);
  const velocity = numbers(value.velocity, 3);
  const spin = numbers(value.spin, 3);
  const suspension = numbers(value.suspension, 4);
  const roll = numbers(value.roll, 4);
  const [steer, car] = [value.steer, value.car];
  if (typeof car !== "string" || car.length === 0 || car.length > 64) return null;
  if (!position || !rotation || !velocity || !spin || !suspension || typeof steer !== "number" || !Number.isFinite(steer) || !roll) return null;
  const length = Math.hypot(...rotation);
  if (length < 0.5) return null;
  return {
    position: position as Vector3,
    rotation: rotation.map((part) => part / length) as Rotation,
    velocity: velocity as Vector3,
    spin: spin as Vector3,
    car: knownCar(car),
    steer,
    suspension: suspension as CarState["suspension"],
    roll: roll as CarState["roll"],
    lamps: parseLamps(value.lamps),
    ...parsePaint(value.paint),
  };
}

/** More paints than any car has, so an index off the wire stays a small whole number; the car's art judges the rest. */
const MOST_PAINTS = 64;

/** A paint is an index into the car's own list; anything else draws the car's default, as one from before paints did. */
function parsePaint(value: unknown): { paint?: number } {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < MOST_PAINTS ? { paint: value } : {};
}

/** A version of the game from before lamps were sent sends none: its car shows them off. */
function parseLamps(value: unknown): CarLamps {
  if (!isRecord(value)) return LAMPS_OFF;
  const lit = (name: string) => value[name] === true;
  return { head: lit("head"), brake: lit("brake"), reverse: lit("reverse") };
}

function parseCar(value: Record<string, unknown>): CarMessage | null {
  const state = parseState(value.state);
  if (!state) return null;
  // A race this version can't read is no race: the car still draws.
  const race = parseRaceProgress(value.race);
  return { state, ...(isTime(value.at) ? { at: value.at } : {}), ...(race ? { race } : {}) };
}

const isAmount = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;

export function parseRaceProgress(value: unknown): RaceProgress | null {
  if (!isRecord(value)) return null;
  const { race, attempt, nextGate, progress, finishedS } = value;
  if (!isName(race) || !isCount(attempt) || !isCount(nextGate) || !isAmount(progress)) return null;
  if (finishedS !== null && !isAmount(finishedS)) return null;
  return { race, attempt, nextGate, progress, finishedS };
}

const isName = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 64;
/** More attempts, or handovers, than any session makes, and well inside what a number counts exactly. */
const MOST_ATTEMPTS = 1_000_000;

export function parseComputerCar(value: unknown): ComputerCarMessage | null {
  if (!isRecord(value)) return null;
  const { id, runner, handovers, driver } = value;
  if (!isName(id) || !isName(runner) || !isRecord(driver) || Array.isArray(driver)) return null;
  if (typeof handovers !== "number" || !Number.isInteger(handovers) || handovers < 0 || handovers > MOST_ATTEMPTS) return null;
  if (value.gone !== undefined && value.gone !== true) return null;
  const state = parseState(value.state);
  if (!state) return null;
  const gone = value.gone ? { gone: true as const } : {};
  return isTime(value.at) ? { id, runner, handovers, state, at: value.at, driver, ...gone } : { id, runner, handovers, state, driver, ...gone };
}
const PLAIN_TYPES = new Set<unknown>(["invite", "accept", "retry", "ready", "leave"]);
const isResult = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;

export function parseChallengeMessage(value: unknown): ChallengeMessage | null {
  if (!isRecord(value)) return null;
  const { type, challenge, attempt } = value;
  if (!isName(challenge) || typeof attempt !== "number" || !Number.isInteger(attempt) || attempt < 1 || attempt > MOST_ATTEMPTS) return null;
  if (PLAIN_TYPES.has(type)) return { type: type as "invite", challenge, attempt };
  if (type === "start") {
    const { team } = value;
    if (!Array.isArray(team) || team.length < 2 || team.length > MOST_PLAYERS || !team.every(isName) || new Set(team).size !== team.length) return null;
    return { type, challenge, attempt, team: team as string[] };
  }
  if (type === "result") {
    if (!isResult(value.result)) return null;
    if (value.points === undefined) return { type, challenge, attempt, result: value.result };
    return isResult(value.points) ? { type, challenge, attempt, result: value.result, points: value.points } : null;
  }
  if (type === "lost") {
    const { results } = value;
    if (!Array.isArray(results) || results.length < 1 || results.length > MOST_PLAYERS || !results.every((each) => each === null || isResult(each))) return null;
    return { type, challenge, attempt, results: results as (number | null)[] };
  }
  return null;
}

/*
 * Traffic on the wire is compact, since a crowded street has a hundred vehicles in it: each vehicle an array, its
 * numbers in centimetres and ten-thousandths, and the fields at its end that hold their usual value left off.
 */
type WireVehicle = (string | number)[];
/** A gone vehicle: its id, handovers and 1 if it was hit. */
type WireGone = [string, number, number];
export interface WireTraffic {
  v: WireVehicle[];
  g: WireGone[];
  k: string[];
}

const KINDS: readonly VehicleKind[] = ["car", "bike", "walker"];
const MEETINGS: readonly LaneRecord["meeting"][] = [null, "passes", "yields", "creeps"];
const FLAGS = { finished: 1, waiting: 2, onRoad: 4, goingRound: 8 } as const;
/** A line's kind on the wire: a lane, a connector or a link. */
const lineCode = (line: { connector: boolean; link?: boolean }) => (line.link ? 2 : line.connector ? 1 : 0);
const lineOfCode = (code: number) => ({ connector: code === 1, ...(code === 2 ? { link: true } : {}) });
/** The usual values of a vehicle's last fields: no next line, crossing or exit, and no time waited or blocked. */
const USUAL_TAIL = [-1, -1, -1, 0, 0, 0];
const TAIL_FROM = 19;

export function wireTraffic({ vehicles, gone, knows }: TrafficMessage): WireTraffic {
  const v = vehicles.map(({ record, handovers, runner }): WireVehicle => {
    const { place, body, next, exit } = record;
    if (next && next.tile !== place.tile) throw new Error(`${record.id}'s next line is on ${next.tile}, not its own ${place.tile}`);
    const flags =
      (record.finished ? FLAGS.finished : 0) | (record.waiting ? FLAGS.waiting : 0) | (record.onRoad ? FLAGS.onRoad : 0) | (record.goingRound ? FLAGS.goingRound : 0) | (MEETINGS.indexOf(record.meeting) << 4);
    const wire: WireVehicle = [
      record.id,
      handovers,
      runner ?? "",
      KINDS.indexOf(record.kind),
      record.seed,
      record.model,
      place.tile,
      lineCode(place),
      place.index,
      metres(place.along),
      metres(record.speedMS),
      metres(body.x),
      metres(body.z),
      fine(body.heading),
      fine(body.wheels),
      metres(record.shiftM),
      metres(record.wantShiftM),
      flags,
      record.picks,
      next ? next.index * 3 + lineCode(next) : -1,
      record.crossing ?? -1,
      exit ? exit.link : -1,
      exit ? metres(exit.along) : 0,
      metres(record.waitedS),
      metres(record.blockedS),
    ];
    while (wire.length > TAIL_FROM && wire[wire.length - 1] === USUAL_TAIL[wire.length - 1 - TAIL_FROM]) wire.pop();
    return wire;
  });
  return { v, g: gone.map(({ id, handovers, hit }): WireGone => [id, handovers, hit ? 1 : 0]), k: knows };
}

const isCount = (value: unknown, most = MOST_ATTEMPTS): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= most;
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
/** -1 for none, or a whole number. */
const isChoice = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= -1 && value <= MOST_ATTEMPTS;

function parseVehicle(value: unknown): TrafficVehicle | null {
  if (!Array.isArray(value) || value.length < TAIL_FROM || value.length > TAIL_FROM + USUAL_TAIL.length) return null;
  const wire = [...(value as unknown[]), ...USUAL_TAIL.slice(value.length - TAIL_FROM)];
  const [id, handovers, runner, kind, seed, model, tile, line, index, along, speedMS, x, z, heading, wheels, shiftM, wantShiftM, flags, picks, next, crossing, exitLink, exitAlong, waitedS, blockedS] = wire;
  if (!isName(id) || !isCount(handovers) || typeof runner !== "string" || runner.length > 64 || !isCount(kind, KINDS.length - 1) || !isCount(seed, 2 ** 32) || !isCount(model, 255) || !isName(tile)) return null;
  if (!isCount(line, 2) || !isCount(index) || !isCount(flags, 63) || flags >> 4 >= MEETINGS.length || !isCount(picks) || !isChoice(next) || !isChoice(crossing) || !isChoice(exitLink)) return null;
  if (!isNumber(along) || !isNumber(speedMS) || !isNumber(x) || !isNumber(z) || !isNumber(heading) || !isNumber(wheels) || !isNumber(shiftM) || !isNumber(wantShiftM) || !isNumber(exitAlong) || !isNumber(waitedS) || !isNumber(blockedS)) return null;
  const record: LaneRecord = {
    id,
    kind: KINDS[kind],
    seed,
    model,
    place: { tile, index, ...lineOfCode(line), along },
    speedMS,
    next: next === -1 ? null : { tile, index: Math.floor(next / 3), ...lineOfCode(next % 3) },
    crossing: crossing === -1 ? null : crossing,
    onRoad: (flags & FLAGS.onRoad) !== 0,
    exit: exitLink === -1 ? null : { link: exitLink, along: exitAlong },
    finished: (flags & FLAGS.finished) !== 0,
    body: { x, z, heading, wheels },
    shiftM,
    wantShiftM,
    meeting: MEETINGS[flags >> 4],
    waitedS,
    goingRound: (flags & FLAGS.goingRound) !== 0,
    blockedS,
    waiting: (flags & FLAGS.waiting) !== 0,
    picks,
  };
  return { record, handovers, runner: runner === "" ? null : runner };
}

function parseGone(value: unknown): TrafficMessage["gone"][number] | null {
  if (!Array.isArray(value) || value.length !== 3) return null;
  const [id, handovers, hit] = value as unknown[];
  return isName(id) && isCount(handovers) && (hit === 0 || hit === 1) ? { id, handovers, hit: hit === 1 } : null;
}

/** Traffic off the wire; one vehicle that isn't one makes the whole message none, as for any malformed message. */
export function parseTraffic(value: unknown): TrafficMessage | null {
  if (!isRecord(value) || !Array.isArray(value.v) || !Array.isArray(value.g) || !Array.isArray(value.k) || !(value.k as unknown[]).every(isName)) return null;
  const vehicles: TrafficVehicle[] = [];
  for (const each of value.v as unknown[]) {
    const vehicle = parseVehicle(each);
    if (!vehicle) return null;
    vehicles.push(vehicle);
  }
  const gone: TrafficMessage["gone"] = [];
  for (const each of value.g as unknown[]) {
    const one = parseGone(each);
    if (!one) return null;
    gone.push(one);
  }
  return { vehicles, gone, knows: value.k as string[] };
}

/** Further than any road on Åland is from the world's origin. */
const FARTHEST_M = 1_000_000;

function parsePoint(value: unknown): MapPoint | null | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  const { x, z } = value;
  const within = (part: unknown): part is number => typeof part === "number" && Number.isFinite(part) && Math.abs(part) <= FARTHEST_M;
  return within(x) && within(z) ? { x, z } : undefined;
}

export function parseDestination(value: unknown): SharedDestination | null {
  if (!isRecord(value) || !isName(value.setter) || !isName(value.name)) return null;
  const point = parsePoint(value.point);
  return point === undefined ? null : { point, setter: value.setter, name: value.name };
}

export function parseGuestMessage(value: unknown): GuestMessage | null {
  if (!isRecord(value)) return null;
  if (value.kind === "ask-time") return { kind: "ask-time" };
  if (value.kind === "traffic") {
    // Kept as it came, to be handed on: what it says is read where it's heard.
    return parseTraffic(value.traffic) && { kind: "traffic", traffic: value.traffic as WireTraffic };
  }
  if (value.kind === "destination") {
    const point = parsePoint(value.point);
    return point === undefined ? null : { kind: "destination", point };
  }
  if (value.kind === "computer") {
    const car = parseComputerCar(value.car);
    return car && { kind: "computer", car };
  }
  if (value.kind === "challenge") {
    const message = parseChallengeMessage(value.message);
    if (!message) return null;
    if (value.to === undefined) return { kind: "challenge", message };
    return isName(value.to) ? { kind: "challenge", to: value.to, message } : null;
  }
  if (value.kind !== "car") return null;
  const car = parseCar(value);
  return car && { kind: "car", ...car };
}

export function parseHostMessage(value: unknown): HostMessage | null {
  if (!isRecord(value)) return null;
  if (value.kind === "time") return typeof value.gameDays === "number" && Number.isFinite(value.gameDays) ? { kind: "time", gameDays: value.gameDays } : null;
  if (!isName(value.from)) return null;
  if (value.kind === "traffic") {
    return parseTraffic(value.traffic) && { kind: "traffic", from: value.from, traffic: value.traffic as WireTraffic };
  }
  if (value.kind === "destination") {
    const destination = parseDestination(value.destination);
    return destination && { kind: "destination", from: value.from, destination };
  }
  if (value.kind === "computer") {
    const car = parseComputerCar(value.car);
    return car && { kind: "computer", from: value.from, car };
  }
  if (value.kind === "challenge") {
    const message = parseChallengeMessage(value.message);
    return message && { kind: "challenge", from: value.from, message };
  }
  if (value.kind !== "car") return null;
  const car = parseCar(value);
  return car && { kind: "car", from: value.from, ...car };
}
