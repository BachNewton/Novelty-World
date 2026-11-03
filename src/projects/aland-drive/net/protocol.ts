import { RELAY_PARAM, relayUrlFromSearch } from "@/shared/lib/peer";
import type { CarState, Rotation, Vector3 } from "../sim/car-state";
import { DEFAULT_CAR, isCarId, type CarId } from "../sim/cars";

/*
 * What players send each other in the online world: each car's state, as its
 * own client has it, which names the car it is. A guest sends its own up; the
 * host hands each one on to every other guest, naming whose it is, and sends
 * its own down. Every payload off the wire is untrusted and parsed here.
 */

export const GAME = "aland-drive";
/** Everyone shares one world: the first to arrive hosts it. */
export const WORLD_CODE = "island";
/** Test only: a world of a test's own, so tests running at once never meet. */
export const WORLD_PARAM = "drive-world";
const WORLD_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export interface CarMessage {
  state: CarState;
}

export type GuestMessage = { kind: "car" } & CarMessage;
export type HostMessage = { kind: "car"; from: string } & CarMessage;

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
  if (query.has("tiles") || automated) return null;
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

export function wireState(state: CarState): CarState {
  return {
    position: state.position.map(metres) as Vector3,
    rotation: state.rotation.map(fine) as Rotation,
    velocity: state.velocity.map(metres) as Vector3,
    spin: state.spin.map(metres) as Vector3,
    car: state.car,
    steer: fine(state.steer),
    suspension: [fine(state.suspension[0]), fine(state.suspension[1]), fine(state.suspension[2]), fine(state.suspension[3])],
    roll: metres(state.roll),
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
  const [steer, roll, car] = [value.steer, value.roll, value.car];
  if (typeof car !== "string" || car.length === 0 || car.length > 64) return null;
  if (!position || !rotation || !velocity || !spin || !suspension || typeof steer !== "number" || !Number.isFinite(steer) || typeof roll !== "number" || !Number.isFinite(roll)) return null;
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
    roll,
  };
}

function parseCar(value: Record<string, unknown>): CarMessage | null {
  const state = parseState(value.state);
  return state && { state };
}

export function parseGuestMessage(value: unknown): GuestMessage | null {
  if (!isRecord(value) || value.kind !== "car") return null;
  const car = parseCar(value);
  return car && { kind: "car", ...car };
}

export function parseHostMessage(value: unknown): HostMessage | null {
  if (!isRecord(value) || value.kind !== "car" || typeof value.from !== "string") return null;
  const car = parseCar(value);
  return car && { kind: "car", from: value.from, ...car };
}
