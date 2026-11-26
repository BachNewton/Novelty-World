import { codeGround, GROUND, GROUND_SIDE, groundRows, isGroundMark, kindAt, onGround, VARIANT_TILES, type GroundLayer } from "../ground";
import { isKitPiece } from "../kit";
import { PATHS, PLACES, PLANTS, TREES, type Place, type Placement } from "../town";

/**
 * The map as data: every kit piece placed in the world, in named places, as a
 * JSON document the map editor saves, loads and keeps in the browser. Its
 * places are the code's own (`TREES`, each part of the town by its constant in
 * `town.ts`, `PLANTS`), so a map maps back onto the code's model, and pieces
 * placed in the editor go into a place of their own, `PLACED`. Its ground is
 * each cell's kind and the tiles chosen for some, from which every tile
 * follows. The villagers stay in the code.
 */
export interface MapDocument {
  version: typeof MAP_VERSION;
  places: readonly Place[];
  ground: GroundLayer;
}

/** The format's version: a later format reads an older one by it, or refuses it by name. Version 1 had no ground, and is read with the code's. */
export const MAP_VERSION = 2;

/** Where pieces placed in the editor go. */
export const PLACED = "PLACED";

/** Places that are pieces standing apart rather than one thing: each piece is named, never the place as a whole. */
export const SCATTERED: ReadonlySet<string> = new Set(["TREES", "PLANTS", PLACED]);

/** The map as the code places it. */
export function codeMap(): MapDocument {
  return {
    version: MAP_VERSION,
    places: [{ name: "TREES", placements: TREES }, ...PLACES, { name: "PLANTS", placements: PLANTS }],
    ground: codeGround(PATHS),
  };
}

/** A map with another ground in its ground's place. */
export function withGround(map: MapDocument, ground: GroundLayer): MapDocument {
  return { ...map, ground };
}

/** Every piece of a map, in its places' order. */
export function piecesOf(map: MapDocument): Placement[] {
  return map.places.flatMap((place) => place.placements);
}

/** The place a placement stands in. */
export function placeOf(map: MapDocument, placement: Placement): string | null {
  return map.places.find((place) => place.placements.includes(placement))?.name ?? null;
}

/** A map with one placement put in another's place, or taken out when `next` is null. */
export function replaced(map: MapDocument, placement: Placement, next: Placement | null): MapDocument {
  return {
    ...map,
    places: map.places.map((place) =>
      place.placements.includes(placement)
        ? { ...place, placements: place.placements.flatMap((p) => (p !== placement ? [p] : next === null ? [] : [next])) }
        : place,
    ),
  };
}

/** A map with a placement added to the editor's own place. */
export function added(map: MapDocument, placement: Placement): MapDocument {
  const has = map.places.some((place) => place.name === PLACED);
  return {
    ...map,
    places: has
      ? map.places.map((place) => (place.name === PLACED ? { ...place, placements: [...place.placements, placement] } : place))
      : [...map.places, { name: PLACED, placements: [placement] }],
  };
}

/** A placement's fields in one order, with only those it has: how the file writes each piece. */
function written(p: Placement): Placement {
  return { piece: p.piece, x: p.x, z: p.z, y: p.y, turn: p.turn, mirror: p.mirror };
}

/** The map as its JSON file: one piece a line, and the ground a row of cells a line, so a file diffs by piece and by row. */
export function serializeMap(map: MapDocument): string {
  const places = map.places.map((place) => {
    const placements = place.placements.map((p) => `        ${JSON.stringify(written(p))}`).join(",\n");
    return `    {\n      "name": ${JSON.stringify(place.name)},\n      "placements": [\n${placements}\n      ]\n    }`;
  });
  const rows = groundRows(map.ground).map((row) => `      ${JSON.stringify(row)}`).join(",\n");
  const variants = Object.entries(map.ground.variants)
    .map(([cell, tile]) => {
      const [x, z] = cell.split(",").map(Number);
      return `      ${JSON.stringify({ x, z, tile })}`;
    })
    .join(",\n");
  const ground = `  "ground": {\n    "rows": [\n${rows}\n    ],\n    "variants": [${variants === "" ? "" : `\n${variants}\n    `}]\n  }`;
  return `{\n  "version": ${map.version},\n  "places": [\n${places.join(",\n")}\n  ],\n${ground}\n}\n`;
}

const PLACEMENT_FIELDS: ReadonlySet<string> = new Set(["piece", "x", "z", "y", "turn", "mirror"]);

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/**
 * A map read from a file's parsed JSON, or an error naming every problem in it:
 * a piece no kit has, a field missing, of the wrong kind or unknown, a place
 * named twice, a row of the ground of the wrong length or with a mark that is
 * no kind, a tile chosen off the ground, on grass, twice or that the kit
 * hasn't, another format's version. Nothing in a bad file is dropped or
 * guessed at, so a map either loads whole or not at all. A version 1 map, from
 * before the ground was the map's, is read with the code's ground.
 */
export function parseMap(json: unknown): MapDocument {
  if (!isRecord(json)) throw new Error("adventure: a map is a JSON object");
  const problems: string[] = [];
  const version = json.version;
  if (version !== 1 && version !== MAP_VERSION) problems.push(`version is ${JSON.stringify(version)}, and this game reads maps of versions 1 and ${MAP_VERSION}`);
  const fields = version === 1 ? ["version", "places"] : ["version", "places", "ground"];
  for (const key of Object.keys(json)) if (!fields.includes(key)) problems.push(`unknown field "${key}"`);
  const ground = version === 1 ? codeGround(PATHS) : parseGround(json.ground, problems);
  if (!Array.isArray(json.places)) {
    problems.push("places is not a list");
    throw new Error(`adventure: the map can't be read: ${problems.join("; ")}`);
  }
  const names = new Set<string>();
  const places: Place[] = json.places.map((place: unknown, i): Place => {
    const at = `places[${i}]`;
    if (!isRecord(place)) {
      problems.push(`${at} is not an object`);
      return { name: "", placements: [] };
    }
    for (const key of Object.keys(place)) if (key !== "name" && key !== "placements") problems.push(`${at} has an unknown field "${key}"`);
    const name = typeof place.name === "string" && place.name !== "" ? place.name : null;
    if (name === null) problems.push(`${at}.name is not a name`);
    else if (names.has(name)) problems.push(`${at}.name ${name} is named twice`);
    else names.add(name);
    if (!Array.isArray(place.placements)) {
      problems.push(`${at}.placements is not a list`);
      return { name: name ?? "", placements: [] };
    }
    const placements = place.placements.flatMap((p: unknown, k): Placement[] => {
      const placement = parsePlacement(p);
      if (typeof placement === "string") {
        problems.push(`${at}.placements[${k}] ${placement}`);
        return [];
      }
      return [placement];
    });
    return { name: name ?? "", placements };
  });
  if (problems.length > 0) throw new Error(`adventure: the map can't be read: ${problems.join("; ")}`);
  return { version: MAP_VERSION, places, ground };
}

/** A map's ground, or a stand-in with its problems added to `problems`. */
function parseGround(json: unknown, problems: string[]): GroundLayer {
  const none: GroundLayer = { cells: "", variants: {} };
  if (!isRecord(json)) {
    problems.push("ground is not an object");
    return none;
  }
  for (const key of Object.keys(json)) if (key !== "rows" && key !== "variants") problems.push(`ground has an unknown field "${key}"`);
  const rows: unknown = json.rows;
  if (!Array.isArray(rows) || rows.length !== GROUND_SIDE) {
    problems.push(`ground.rows is not a list of ${GROUND_SIDE} rows`);
    return none;
  }
  const marks: string[] = [];
  rows.forEach((row: unknown, i) => {
    if (typeof row !== "string" || row.length !== GROUND_SIDE) problems.push(`ground.rows[${i}] is not a row of ${GROUND_SIDE} cells`);
    else if (![...row].every(isGroundMark)) problems.push(`ground.rows[${i}] has a mark that is no kind of ground`);
    else marks.push(row);
  });
  if (marks.length !== GROUND_SIDE) return none;
  const cells = marks.join("");
  if (!Array.isArray(json.variants)) {
    problems.push("ground.variants is not a list");
    return none;
  }
  const variants: Record<string, string> = {};
  json.variants.forEach((v: unknown, i) => {
    const at = `ground.variants[${i}]`;
    if (!isRecord(v)) {
      problems.push(`${at} is not an object`);
      return;
    }
    for (const key of Object.keys(v)) if (key !== "x" && key !== "z" && key !== "tile") problems.push(`${at} has an unknown field "${key}"`);
    const { x, z, tile } = v;
    if (typeof x !== "number" || typeof z !== "number" || !Number.isInteger(x) || !Number.isInteger(z) || !onGround(x, z)) {
      problems.push(`${at} is not a cell of the ground, from ${GROUND.min} to ${GROUND.max} on x and z`);
      return;
    }
    if (typeof tile !== "string" || !VARIANT_TILES.has(tile)) {
      problems.push(`${at} has no tile ${JSON.stringify(tile)} to choose`);
      return;
    }
    const cell = `${x},${z}`;
    if (cell in variants) problems.push(`${at} chooses a tile for ${cell} twice`);
    else if (kindAt({ cells, variants }, x, z) === "grass") problems.push(`${at} chooses a tile for ${cell}, which is grass`);
    else variants[cell] = tile;
  });
  return { cells, variants };
}

/** A placement, or what is wrong with it. */
function parsePlacement(p: unknown): Placement | string {
  if (!isRecord(p)) return "is not an object";
  const wrong: string[] = [];
  for (const key of Object.keys(p)) if (!PLACEMENT_FIELDS.has(key)) wrong.push(`has an unknown field "${key}"`);
  const piece = typeof p.piece === "string" && isKitPiece(p.piece) ? p.piece : null;
  if (piece === null) wrong.push(`has no kit piece ${JSON.stringify(p.piece)}`);
  if (!isNumber(p.x)) wrong.push("has no number x");
  if (!isNumber(p.z)) wrong.push("has no number z");
  if (p.y !== undefined && !isNumber(p.y)) wrong.push("has a y that is not a number");
  if (p.turn !== undefined && !Number.isInteger(p.turn)) wrong.push("has a turn that is not a whole number of quarters");
  if (p.mirror !== undefined && typeof p.mirror !== "boolean") wrong.push("has a mirror that is not true or false");
  if (wrong.length > 0 || piece === null || !isNumber(p.x) || !isNumber(p.z)) return wrong.join(", ");
  const placement: Placement = { piece, x: p.x, z: p.z };
  if (isNumber(p.y)) placement.y = p.y;
  if (typeof p.turn === "number") placement.turn = p.turn;
  if (typeof p.mirror === "boolean") placement.mirror = p.mirror;
  return placement;
}
