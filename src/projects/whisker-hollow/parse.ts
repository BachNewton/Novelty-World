import { LOOK_COLOURS } from "./caretaker";
import { CAST } from "./cast";
import { cleanName } from "./world";
import type { Animal, Avatar, Look, Naming, Pair, Point, Whereabouts, World } from "./types";

/** Everything that arrives from outside (the wire, a save) is untrusted and checked here. */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function parsePoint(value: unknown): Point | null {
  return isRecord(value) && finite(value.x) && finite(value.z) ? { x: value.x, z: value.z } : null;
}

function parseWhereabouts(value: unknown): Whereabouts | null {
  if (!isRecord(value)) return null;
  switch (value.kind) {
    case "lost": {
      const at = parsePoint(value.at);
      return at === null ? null : { kind: "lost", at };
    }
    case "home":
      return { kind: "home" };
    case "carried":
      return typeof value.by === "string" ? { kind: "carried", by: value.by } : null;
    default:
      return null;
  }
}

function parseNaming(value: unknown): Naming | null | undefined {
  if (value === null) return null;
  if (!isRecord(value) || typeof value.name !== "string" || typeof value.by !== "string") return undefined;
  const name = cleanName(value.name);
  return name === null ? undefined : { name, by: value.by };
}

function isSpecies(value: unknown): value is string {
  return typeof value === "string" && CAST.some((s) => s.id === value);
}

function parseAnimal(value: unknown): Animal | null {
  if (!isRecord(value) || typeof value.id !== "string" || !isSpecies(value.species)) return null;
  const where = parseWhereabouts(value.where);
  return where === null ? null : { id: value.id, species: value.species, where };
}

function parsePair(value: unknown): Pair | null {
  if (!isRecord(value) || !isSpecies(value.species) || typeof value.broughtBy !== "string") return null;
  const naming = parseNaming(value.naming);
  return naming === undefined ? null : { species: value.species, broughtBy: value.broughtBy, naming };
}

function parseAll<T>(values: unknown, parse: (value: unknown) => T | null): T[] | null {
  if (!Array.isArray(values)) return null;
  const parsed: T[] = [];
  for (const value of values) {
    const one = parse(value);
    if (one === null) return null;
    parsed.push(one);
  }
  return parsed;
}

/** A whole world, or null if any of it is malformed: a save is never half-read. */
export function parseWorld(value: unknown): World | null {
  if (!isRecord(value)) return null;
  const animals = parseAll(value.animals, parseAnimal);
  const pairs = parseAll(value.pairs, parsePair);
  return animals === null || pairs === null ? null : { animals, pairs };
}

function isColour(part: keyof Look, value: unknown): value is string {
  return typeof value === "string" && LOOK_COLOURS[part].includes(value);
}

function parseLook(value: unknown): Look | null {
  if (!isRecord(value)) return null;
  const { shirt, hair, skin } = value;
  return isColour("shirt", shirt) && isColour("hair", hair) && isColour("skin", skin) ? { shirt, hair, skin } : null;
}

export function parseAvatar(value: unknown): Avatar | null {
  if (!isRecord(value) || !finite(value.x) || !finite(value.z) || !finite(value.heading)) return null;
  if (typeof value.moving !== "boolean") return null;
  const look = parseLook(value.look);
  return look === null ? null : { x: value.x, z: value.z, heading: value.heading, moving: value.moving, look };
}
