import { FACES, type Face } from "../cliffs";
import {
  codeGround,
  GROUND,
  GROUND_MARKS,
  GROUND_SIDE,
  groundCells,
  isCliffMark,
  isGroundMark,
  isHeightMark,
  kindAt,
  onGround,
  rowsOf,
  VARIANT_TILES,
  type GroundLayer,
} from "../ground";
import { isTownTexture, TOWN_TEXTURES } from "../fantasy-town";
import { isKitPiece, isNaturePiece } from "../kit";
import { PATHS, PLACES, PLANTS, TREES, type Place, type Placement } from "../town";

/**
 * The map as data: every kit piece placed in the world, in named places, as a
 * JSON document the map editor saves, loads and keeps in the browser. Its
 * places are the code's own (`TREES`, each part of the town by its constant in
 * `town.ts`, `PLANTS`), so a map maps back onto the code's model, and pieces
 * placed in the editor go into a place of their own, `PLACED`. Its ground is
 * each cell's kind, height and cliff, the tiles chosen for some and the faces
 * of some, from which every tile and cliff follows. The villagers stay in the
 * code.
 */
export interface MapDocument {
  version: typeof MAP_VERSION;
  places: readonly Place[];
  ground: GroundLayer;
}

/**
 * The format's version: a later format reads an older one by it, or refuses it
 * by name. Version 1 had no ground, and is read with the code's; versions 1
 * and 2 had no textures, so their pieces all wear the kit's own; versions 1 to
 * 3 had no heights, their rises standing as pieces, so they are read with the
 * code's rises (`fromFlatGround`).
 */
export const MAP_VERSION = 4;

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
  return { piece: p.piece, x: p.x, z: p.z, y: p.y, turn: p.turn, mirror: p.mirror, texture: p.texture };
}

/** The map as its JSON file: one piece a line, and the ground a row of cells a line, so a file diffs by piece and by row. */
export function serializeMap(map: MapDocument): string {
  const places = map.places.map((place) => {
    const placements = place.placements.map((p) => `        ${JSON.stringify(written(p))}`).join(",\n");
    return `    {\n      "name": ${JSON.stringify(place.name)},\n      "placements": [\n${placements}\n      ]\n    }`;
  });
  const rows = (marks: string): string => `[\n${rowsOf(marks).map((row) => `      ${JSON.stringify(row)}`).join(",\n")}\n    ]`;
  const byCell = (entries: Record<string, unknown>[]): string => (entries.length === 0 ? "[]" : `[\n${entries.map((e) => `      ${JSON.stringify(e)}`).join(",\n")}\n    ]`);
  const cellOf = (cell: string): { x: number; z: number } => {
    const [x, z] = cell.split(",").map(Number);
    return { x, z };
  };
  const { cells, heights, cliffs, variants, faces } = map.ground;
  const ground = [
    `    "rows": ${rows(cells)}`,
    `    "heights": ${rows(heights)}`,
    `    "cliffs": ${rows(cliffs)}`,
    `    "variants": ${byCell(Object.entries(variants).map(([cell, tile]) => ({ ...cellOf(cell), tile })))}`,
    `    "faces": ${byCell(Object.entries(faces).map(([cell, face]) => ({ ...cellOf(cell), face })))}`,
  ].join(",\n");
  return `{\n  "version": ${map.version},\n  "places": [\n${places.join(",\n")}\n  ],\n  "ground": {\n${ground}\n  }\n}\n`;
}

const PLACEMENT_FIELDS: ReadonlySet<string> = new Set(["piece", "x", "z", "y", "turn", "mirror", "texture"]);

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/**
 * A map read from a file's parsed JSON, or an error naming every problem in it:
 * a piece no kit has, a field missing, of the wrong kind or unknown, a place
 * named twice, a row of the ground of the wrong length or with a mark that is
 * no kind, a height that is no digit or raises an empty cell, a cliff that is
 * no way of making one, a tile chosen off the ground, on grass or nothing,
 * twice or that the kit hasn't, a face that is none, off the ground, on an
 * empty cell or given twice, a texture the town kit hasn't or on a Nature Kit
 * piece, another format's version. Nothing in a bad file is dropped or guessed
 * at, so a map either loads whole or not at all. A version 1 map, from before
 * the ground was the map's, is read with the code's ground; versions 1 to 3,
 * from before the ground had heights, with the code's rises.
 */
export function parseMap(json: unknown): MapDocument {
  if (!isRecord(json)) throw new Error("adventure: a map is a JSON object");
  const problems: string[] = [];
  const version = json.version;
  const flat = version === 1 || version === 2 || version === 3;
  if (!flat && version !== MAP_VERSION) problems.push(`version is ${JSON.stringify(version)}, and this game reads maps of versions 1 to ${MAP_VERSION}`);
  const fields = version === 1 ? ["version", "places"] : ["version", "places", "ground"];
  for (const key of Object.keys(json)) if (!fields.includes(key)) problems.push(`unknown field "${key}"`);
  const ground = version === 1 ? codeGround(PATHS) : parseGround(json.ground, flat, problems);
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
  if (!flat) return { version: MAP_VERSION, places, ground };
  const raised = raisedPieces();
  return {
    version: MAP_VERSION,
    places: places.map((place) => ({ ...place, placements: place.placements.filter((p) => !raised.has(placementKey(p))) })),
    ground: version === 1 ? ground : fromFlatGround(ground),
  };
}

/**
 * A ground from before heights, on the code's rises: each cell the code
 * leaves at the ground's level takes the file's kind and chosen tile, and each
 * cell the code raises keeps the code's, since the file's lay hidden under it.
 */
function fromFlatGround(flat: GroundLayer): GroundLayer {
  const code = codeGround(PATHS);
  const level = (i: number): boolean => code.heights[i] === "0";
  const cells = [...code.cells].map((mark, i) => (level(i) ? flat.cells[i] : mark)).join("");
  const variants: Record<string, string> = {};
  for (const [cell, tile] of Object.entries(code.variants)) if (!level(indexOfCell(cell))) variants[cell] = tile;
  for (const [cell, tile] of Object.entries(flat.variants)) if (level(indexOfCell(cell))) variants[cell] = tile;
  return { ...code, cells, variants };
}

const indexOfCell = (cell: string): number => {
  const [x, z] = cell.split(",").map(Number);
  return (z - GROUND.min) * GROUND_SIDE + (x - GROUND.min);
};

/** The pieces the code's rises stood as placements before the ground had heights, which the heights now stand: every cliff, and every tile above the ground's level. */
function raisedPieces(): Set<string> {
  const cells = groundCells(codeGround(PATHS), new Set());
  return new Set(cells.flatMap((c) => [...(c.tile === null || (c.tile.y ?? 0) === 0 ? [] : [c.tile]), ...c.cliffs]).map(placementKey));
}

const placementKey = (p: Placement): string => `${p.piece} ${p.x} ${p.y ?? 0} ${p.z} ${(((p.turn ?? 0) % 4) + 4) % 4} ${p.mirror === true} ${p.texture ?? ""}`;

/**
 * A map's ground, or a stand-in with its problems added to `problems`. A
 * ground from before heights (`flat`) has only its kinds and chosen tiles, all
 * at the ground's level.
 */
function parseGround(json: unknown, flat: boolean, problems: string[]): GroundLayer {
  const none: GroundLayer = { cells: "", heights: "", cliffs: "", variants: {}, faces: {} };
  if (!isRecord(json)) {
    problems.push("ground is not an object");
    return none;
  }
  const fields = flat ? ["rows", "variants"] : ["rows", "heights", "cliffs", "variants", "faces"];
  for (const key of Object.keys(json)) if (!fields.includes(key)) problems.push(`ground has an unknown field "${key}"`);
  const before = problems.length;
  const cells = parseRows(json.rows, "rows", isGroundMark, "a mark that is no kind of ground", problems);
  const heights = flat ? "0".repeat(cells.length) : parseRows(json.heights, "heights", isHeightMark, "a height that is no digit of half storeys", problems);
  const cliffs = flat ? "p".repeat(cells.length) : parseRows(json.cliffs, "cliffs", isCliffMark, "a mark that is no way of making a cliff", problems);
  if (problems.length > before) return none;
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] === GROUND_MARKS.empty && heights[i] !== "0") {
      problems.push(`ground.heights raises ${GROUND.min + (i % GROUND_SIDE)},${GROUND.min + Math.floor(i / GROUND_SIDE)}, which is empty`);
    }
  }
  const variants: Record<string, string> = {};
  const faces: Record<string, Face> = {};
  const ground: GroundLayer = { cells, heights, cliffs, variants, faces };
  byCell(json.variants, "variants", "tile", problems, (at, cell, [x, z], tile) => {
    const kind = kindAt(ground, x, z);
    if (typeof tile !== "string" || !VARIANT_TILES.has(tile)) problems.push(`${at} has no tile ${JSON.stringify(tile)} to choose`);
    else if (cell in variants) problems.push(`${at} chooses a tile for ${cell} twice`);
    else if (kind === "grass" || kind === "empty") problems.push(`${at} chooses a tile for ${cell}, which is ${kind}`);
    else variants[cell] = tile;
  });
  if (!flat) {
    byCell(json.faces, "faces", "face", problems, (at, cell, [x, z], face) => {
      const known = FACES.find((f) => f === face);
      if (known === undefined) problems.push(`${at} has no face ${JSON.stringify(face)}: the faces are ${FACES.join(", ")}`);
      else if (cell in faces) problems.push(`${at} gives ${cell} a face twice`);
      else if (kindAt(ground, x, z) === "empty") problems.push(`${at} gives a face to ${cell}, which is empty`);
      else faces[cell] = known;
    });
  }
  return ground;
}

/** One of the ground's strings from its rows, each a row of marks, or "" with what is wrong added to `problems`. */
function parseRows(rows: unknown, field: string, isMark: (mark: string) => boolean, wrongMark: string, problems: string[]): string {
  if (!Array.isArray(rows) || rows.length !== GROUND_SIDE) {
    problems.push(`ground.${field} is not a list of ${GROUND_SIDE} rows`);
    return "";
  }
  const good: string[] = [];
  rows.forEach((row: unknown, i) => {
    if (typeof row !== "string" || row.length !== GROUND_SIDE) problems.push(`ground.${field}[${i}] is not a row of ${GROUND_SIDE} cells`);
    else if (![...row].every(isMark)) problems.push(`ground.${field}[${i}] has ${wrongMark}`);
    else good.push(row);
  });
  return good.length === GROUND_SIDE ? good.join("") : "";
}

/** Each entry of a list of the ground's cells, `{ x, z, <field> }`, handed to `read` once its cell is known to be on the ground. */
function byCell(
  list: unknown,
  name: string,
  field: string,
  problems: string[],
  read: (at: string, cell: string, xz: readonly [number, number], value: unknown) => void,
): void {
  if (!Array.isArray(list)) {
    problems.push(`ground.${name} is not a list`);
    return;
  }
  list.forEach((v: unknown, i) => {
    const at = `ground.${name}[${i}]`;
    if (!isRecord(v)) {
      problems.push(`${at} is not an object`);
      return;
    }
    for (const key of Object.keys(v)) if (key !== "x" && key !== "z" && key !== field) problems.push(`${at} has an unknown field "${key}"`);
    const { x, z } = v;
    if (typeof x !== "number" || typeof z !== "number" || !Number.isInteger(x) || !Number.isInteger(z) || !onGround(x, z)) {
      problems.push(`${at} is not a cell of the ground, from ${GROUND.min} to ${GROUND.max} on x and z`);
      return;
    }
    read(at, `${x},${z}`, [x, z], v[field]);
  });
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
  const texture = typeof p.texture === "string" && isTownTexture(p.texture) ? p.texture : undefined;
  if (p.texture !== undefined && texture === undefined) {
    wrong.push(`has no texture ${JSON.stringify(p.texture)}: the town kit's are ${TOWN_TEXTURES.join(", ")}, and its own is no texture at all`);
  } else if (texture !== undefined && piece !== null && isNaturePiece(piece)) wrong.push(`has a texture, and ${piece} is a Nature Kit piece, which has none`);
  if (wrong.length > 0 || piece === null || !isNumber(p.x) || !isNumber(p.z)) return wrong.join(", ");
  const placement: Placement = { piece, x: p.x, z: p.z };
  if (isNumber(p.y)) placement.y = p.y;
  if (typeof p.turn === "number") placement.turn = p.turn;
  if (typeof p.mirror === "boolean") placement.mirror = p.mirror;
  if (texture !== undefined) placement.texture = texture;
  return placement;
}
