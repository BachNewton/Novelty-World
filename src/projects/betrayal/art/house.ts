import * as THREE from "three";
import { EDGES, FLOORS, liftTile, placed, type Layout } from "../engine/board";
import { CATALOG } from "../data";
import type { GhostDoor, GhostDoorway } from "../play/ghost";
import type { Edge, FloorId, PlacedTile } from "../types";
import { animationOf, type Animation } from "./animate";
import { ADULT_WALK, isGrounded, walkingOf, type Stride, type Walking } from "./explorers/figure";
import { closedDoors, diffLayout, DIRECTION, falseWindows, printedEdge, tileTurn, wallIsCut, type LayoutChange } from "./house-layout";
import { walkLength, walkPose, type HousePoint, type Walk } from "./house-walk";
import { inlineScheduler, type BakeScheduler } from "./bake-schedule";
import { inlineSlicer, runSteps, type Slicer } from "./build-slices";
import { meshOnBuild, type FigureMesher } from "./figure-mesh";
import { freezeRoom, freezeSteps, type FrozenRoom } from "./freeze";
import { carrying } from "./room-flight";
import { houseMood, type HouseMood } from "./house-mood";
import { EXPLORER_LIGHT_OFFSET, explorerLight, fillLight, houseFog, LIGHTMAP } from "./lighting";
import { createLitFloor, flatRoom, ghostRoom, patchProbe, type LitFloor, type Prepare, type ProbeUniform, type Rebake, type StandInRoom } from "./lit-floor";
import { paletteHex, type PaletteKey } from "./palette";
import { batchParts, type PartBatch } from "./part-batch";
import { COLOUR_RING, DOOR_WIDTH, FLOOR_RINGS, MARK_PLANES, primePlaces, TILE, WALL_HEIGHT, type RoomDefinition } from "./room";
import { pawn } from "./kit/pawn";
import { BENCH_ROOMS } from "./rooms";
import { box, glow, group, lightMaterial } from "./shapes";
import { buildRoom, disposeTree, roomTile, type ExplorerBuilder } from "./stage";
import { earth, flagstones, plaster, texturesUnder, woodPlanks } from "./textures";
/** How far apart the floors are stacked when the whole house shows at once:
 *  far enough apart that one floor never hides the one below. */
export const STACK_GAP = 7;
/** A room offered as a choice glows on its floor: a fill, and a border just inside its walls. */
/** `fill` and `edge` are the heights of the glow's flat fill and border. */
const MARK = { inset: 0.35, border: 0.12, height: 0.04, fill: MARK_PLANES.fill, edge: MARK_PLANES.edge };
/** A stair offered as a choice glows along its run: a band this wide, edged with rails. */
const STAIR_MARK = { width: 1.1, rail: 0.1, lift: 0.06 };
/** A doorway offered as a choice glows across it: a pad this deep, half each side of the wall. */
const DOORWAY_MARK = { depth: 1.4 };
/** What a ghost tile's doorways would do, marked at its edges: a bridge
 *  across a doorway joined to the room beside it, a cross on a door facing a
 *  wall (on the ghost's side for its own door, on the neighbour's for theirs),
 *  and an arrow out of a door onto an empty cell. Sizes in metres. */
const GHOST_DOOR = { bridge: 2.6, bridgeWidth: DOOR_WIDTH, cross: 1.5, crossFrom: 0.9, arrow: 0.95, arrowFrom: 0.3, bar: 0.26, lift: 0.03 };
/** The colour each doorway of a ghost tile is marked in, here and in the panel's key:
 *  cold teal for a way through, red for a false door, moonlight for the unexplored. */
export const GHOST_DOORWAY_COLOUR: Record<GhostDoorway, PaletteKey> = { joined: "tideLight", blind: "scarlet", shut: "scarlet", unexplored: "moonLight" };
/** A ghost room is see-through, and lit by its own colours (tinted moonlight) rather than a bake. It breathes:
 *  its opacity falls to `low` of itself and back every `period` seconds. */
const GHOST_LOOK = { opacity: 0.5, glow: 1.1, low: 0.6, period: 2.4 };
/** How long the active explorer's light takes to move to whoever's turn starts, in seconds. */
const LIGHT_GLIDE = 0.6;
/** The route preview: a dot every `every` metres, kept clear of where the walk starts and ends, at most `most` of them. */
const ROUTE = { every: 0.5, size: 0.14, clear: 0.6, most: 160 };

export type FloorChoice = FloorId | "all";

export type RoomShownAs = "ghost" | "flat" | "lit" | null;

/** A figure standing in the house: an explorer (or anything built like one)
 *  with its player's colour round the base. */
export interface HouseFigure {
  id: string;
  build: ExplorerBuilder;
  colour: PaletteKey;
  /** A second ring outside the colour ring, marking the figure's side: the traitor's red. */
  mark?: PaletteKey | null;
}

export interface PlacedRoom {
  id: string;
  floor: FloorId;
  /** The room as frozen for drawing, with its lights. */
  room: FrozenRoom;
  /** The tile's centre on the floor, in the scene. */
  centre: THREE.Vector3;
}

/** A glow on the house marking something a decision offers, by its id. */
export type Mark = { id: string } & (
  | { kind: "room"; room: string }
  /** An empty cell: a border alone, round where a room could go. */
  | { kind: "cell"; floor: FloorId; x: number; y: number }
  /** A room not yet placed, at a cell, with what its doorways would do. */
  | { kind: "ghost"; floor: FloorId; x: number; y: number; doors: readonly GhostDoor[] }
  /** The stair out of `room` towards the room it links to. */
  | { kind: "stair"; room: string; toward: string }
  | { kind: "figure"; figure: string }
  /** An empty cell on another floor, marked on this one at the same place:
   *  the corners of a smaller square, round where it lies above or below. */
  | { kind: "away"; floor: FloorId; x: number; y: number }
);

export interface House {
  root: THREE.Group;
  readonly layout: Layout;
  readonly rooms: PlacedRoom[];
  /** The floors that have rooms, bottom to top. */
  readonly floors: FloorId[];
  /** Lays out the house anew: rooms added, removed or moved are built (and
   *  rooms whose doors now open on a wall or no longer do), and re-baked with
   *  their neighbours. A floor gets its lighting the first time a room is on it. */
  setLayout: (layout: Layout) => LayoutChange;
  /** Resolves once a room is placed with its light, or at once if it already is. */
  roomShown: (room: string) => Promise<void>;
  /** Whether every room placed so far is built and baked. */
  built: () => boolean;
  /** Whether every figure shows as itself, none still a pawn while it is meshed. */
  figuresIn: () => boolean;
  /** How many rooms show, lit: a room shows once it has its direct light. */
  roomsShown: () => number;
  /** How a room shows now: as a ghost (not yet placed), solid in flat light (placed, its bake still to land), lit, or not at all. */
  shownAs: (room: string) => RoomShownAs;
  /** Shows one floor, or every floor stacked apart. */
  showFloor: (floor: FloorChoice) => void;
  /** The centre in the scene of a cell, with its floor stacked as it shows. */
  cellCentre: (floor: FloorId, x: number, y: number) => THREE.Vector3;
  /** The corners of every room showing: one floor, or all of them. */
  corners: () => THREE.Vector3[];
  /** Cuts the walls for a camera looking from this horizontal direction,
   *  with `focus` the room a close view is on (null for the whole floor);
   *  `raised` stands every wall full, for the player's look at them. */
  setCutaway: (cameraDirection: THREE.Vector2, focus: string | null, raised?: boolean) => void;
  update: (seconds: number) => void;
  /** Each floor's lighting, by floor. */
  lighting: Map<FloorId, LitFloor>;
  /** The first bake of each floor. */
  bakes: Map<FloorId, Rebake>;
  /** Builds a room afresh and re-bakes it with its neighbours, as a room
   *  discovered or moved in play would be. */
  rebake: (room: string) => Promise<Rebake>;
  /** Where in the scene a point in the house is, with its floor stacked as it shows. */
  scenePoint: (point: HousePoint) => THREE.Vector3;
  /** The way a figure faces standing in a room it has just been put in: as the room is turned. */
  roomHeading: (room: string) => number;
  addFigure: (figure: HouseFigure, at: HousePoint, heading: number) => void;
  removeFigure: (id: string) => void;
  /** Stands a figure still at a point, facing `heading` (or as it last faced). */
  stand: (figure: string, point: HousePoint, heading?: number) => void;
  /** Walks a figure, posed from the clock at every update. */
  walk: (figure: string, walk: Walk) => void;
  /** Where a figure is now. */
  figureAt: (figure: string) => HousePoint;
  /** Picks out the figure whose turn it is, with a soft light over them; null for nobody. */
  setActive: (figure: string | null) => void;
  /** Lights up what a decision offers. The focused mark glows clearly, the others softly. */
  setMarks: (marks: readonly Mark[], focused: string | null) => void;
  /** Moves the clear glow to another of the marks showing. */
  focusMark: (focused: string | null) => void;
  /** Dots along the path a walk would take, on the floors it crosses; null clears them. */
  showRoute: (path: readonly HousePoint[] | null) => void;
  /** Shows a room not yet placed as a ghost of itself, at a cell and turned
   *  as given, without baking it; null takes it away. A ghost only ever means
   *  a room not yet placed: one just placed or moved shows solid at once, in
   *  flat light, until its bake lands. */
  setGhost: (ghost: PlacedTile | null) => void;
  /** The light the whole house takes from the sky and the ground; the backdrop's sky is its sky colour. */
  fill: THREE.HemisphereLight;
  fog: THREE.Fog;
  background: THREE.Color;
  /** The house's light as a whole: shifting to the haunt's at its reveal, or set at once. */
  setMood: (mood: HouseMood, how: { shifting: boolean }) => void;
  /** Lifts a room `setLayout` just moved off `from`, its old place, and
   *  carries it with the figures standing in it (`riders`) to where it now
   *  is, solid in flat light; until it lands, the room as it shows there
   *  waits hidden. */
  liftRoom: (room: string, from: PlacedTile, riders: readonly string[]) => RoomFlight;
  /** Resolves once the house as first laid out is built and baked. */
  ready: Promise<void>;
  dispose: () => void;
}

/** Where the active explorer stands in a room with nothing in it: off the
 *  middle, clear of every doorway's lane, whichever doors the tile has. */
const SHELL_PRIME: [x: number, z: number] = [0.8, 0.8];

/** A plain room for a tile with no art yet: bare boards and plaster (or, out
 *  of doors, bare earth inside a fieldstone wall), its doors and windows from
 *  the tile data, and nothing in it. */
export function shellRoom(id: string): RoomDefinition {
  if (roomTile(id).outside) {
    return {
      id,
      floor: () => earth({ seed: id }),
      wall: () => flagstones({ stonePx: 6, seed: id }),
      trim: "ash",
      props: [],
      prime: SHELL_PRIME,
    };
  }
  return {
    id,
    floor: () => woodPlanks({ seed: id }),
    wall: () => plaster({ seed: id }),
    trim: "woodDark",
    props: [],
    prime: SHELL_PRIME,
  };
}

/** The eight corners of a room's box, floor to wall top, round its centre. */
export function tileCorners(centre: THREE.Vector3): THREE.Vector3[] {
  return [0, 1, 2, 3, 4, 5, 6, 7].map((i) =>
    new THREE.Vector3(i & 1 ? TILE / 2 : -TILE / 2, i & 2 ? WALL_HEIGHT : 0, i & 4 ? TILE / 2 : -TILE / 2).add(centre),
  );
}

export function definition(id: string): RoomDefinition {
  return BENCH_ROOMS.find((room) => room.id === id) ?? shellRoom(id);
}

/**
 * The ring of a player's colour round their figure's base. Figures' rings
 * overlap wherever figures stand close (a crowded room, a big monster spread
 * over its neighbours), and two rings in one plane that both wrote
 * depth would fight there. So a ring tests depth (a base or a leg in front
 * still hides it) but writes none, and draws after the room: where two
 * overlap, the later one lies over the other. Three.js orders draws of one
 * render order by material, and each ring has its own, made once, so which
 * lies on top stays the same from frame to frame as the camera moves.
 */
export function colourRing(colour: PaletteKey, { inner, outer }: { inner: number; outer: number } = COLOUR_RING): THREE.Mesh {
  const material = glow(colour);
  material.depthWrite = false;
  const ring = new THREE.Mesh(new THREE.RingGeometry(inner, outer, FLOOR_RINGS.segments), material);
  ring.name = "colour ring";
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = COLOUR_RING.height;
  ring.renderOrder = FLOOR_RINGS.order;
  return ring;
}

/** A figure with their player's colour round the base, and how the figure walks. */
function marked({ id, build, colour, mark = null }: HouseFigure, gait: (seconds: number) => Stride): { marked: THREE.Group; walking: Walking } {
  const rings = [colourRing(colour), ...(mark === null ? [] : [colourRing(mark, FLOOR_RINGS.side)])];
  const figure = build(`${id}:explorer`, gait);
  // A figure that floats has no base for the ring to go round.
  return { marked: isGrounded(figure) ? group(figure, ...rings) : group(figure), walking: walkingOf(figure) };
}

interface Walker {
  holder: THREE.Group;
  /** The baked light where it stands, as an ambient cube. */
  probe: ProbeUniform;
  animations: Animation[];
  /** Draws its parts together, posed as its animations left them. */
  batch: PartBatch;
  at: HousePoint;
  heading: number;
  walk: Walk | null;
  walking: Walking;
  /** Riding in a room in flight, which then shows it whatever floor shows. */
  carried: boolean;
}

/** A flat patch of glow lying on the floor, `w` along x and `d` along z,
 *  centred at (x, z), at height `y`. The marks are flat, at a few set heights,
 *  so a room has only those planes to keep its faces out of. */
function patch(w: number, d: number, x: number, z: number, y: number, material: THREE.Material): THREE.Mesh {
  return new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2).translate(x, y, z), material);
}

/** The glow on a tile's floor that marks it as a choice: a faint fill (none
 *  for an empty cell) and a border just inside its walls. */
function tileMark(fill: THREE.Material | null, border: THREE.Material): THREE.Group {
  const span = TILE - MARK.inset * 2;
  const edge = (w: number, d: number, x: number, z: number) => patch(w, d, x, z, MARK.edge, border);
  const off = span / 2 - MARK.border / 2;
  const mark = group(edge(span, MARK.border, 0, -off), edge(span, MARK.border, 0, off), edge(MARK.border, span - MARK.border * 2, -off, 0), edge(MARK.border, span - MARK.border * 2, off, 0));
  if (fill) mark.add(patch(span, span, 0, 0, MARK.fill, fill));
  return mark;
}

/** A flat bar on the floor, `length` long and `width` wide, centred at
 *  (x, z) in the cell's frame, its length turned `angle` radians from the +z axis. */
function floorBar(x: number, z: number, length: number, width: number, angle: number, material: THREE.Material): THREE.Mesh {
  const bar = box([width, 0.01, length], material, [0, 0, 0]);
  bar.rotation.y = angle;
  bar.position.set(x, MARK.height + GHOST_DOOR.lift, z);
  return bar;
}

/** What one doorway of a ghost tile would do, marked on the floor at its edge. */
function doorwayFate({ direction, doorway }: GhostDoor, material: THREE.Material): THREE.Object3D {
  const { x, z } = DIRECTION[direction];
  const along = Math.atan2(x, z);
  const at = (out: number): [number, number] => [x * out, z * out];
  const edge = TILE / 2;
  const { cross, crossFrom, arrow, arrowFrom, bar } = GHOST_DOOR;
  switch (doorway) {
    case "joined":
      return floorBar(...at(edge), GHOST_DOOR.bridge, GHOST_DOOR.bridgeWidth, along, material);
    case "blind":
    case "shut": {
      const centre = at(doorway === "blind" ? edge - crossFrom : edge + crossFrom);
      return group(floorBar(...centre, cross, bar, along + Math.PI / 4, material), floorBar(...centre, cross, bar, along - Math.PI / 4, material));
    }
    case "unexplored": {
      // An arrow out of the door: a shaft from the doorway, and two arms running back from its tip, 45 degrees either side.
      const tip = edge + arrowFrom + arrow;
      const [tx, tz] = at(tip);
      const arm = (sign: number) => {
        const back = along + Math.PI + (sign * Math.PI) / 4;
        return floorBar(tx + (Math.sin(back) * arrow) / 2, tz + (Math.cos(back) * arrow) / 2, arrow, bar, back, material);
      };
      const shaft = tip - edge + arrowFrom;
      return group(arm(1), arm(-1), floorBar(...at(tip - shaft / 2), shaft, bar, along, material));
    }
  }
}

/** A tile not yet placed: the room glow, with what each of its doorways would do. */
function ghostMark(doors: readonly GhostDoor[], fill: THREE.Material, border: THREE.Material, fates: Record<GhostDoorway, THREE.Material>): THREE.Group {
  const mark = tileMark(fill, border);
  for (const door of doors) mark.add(doorwayFate(door, fates[door.doorway]));
  return mark;
}

/** A room shown without its bake (a ghost, or a room in flat light): as built, and the holder that lays it at its cell. */
interface StandIn {
  tile: PlacedTile;
  room: StandInRoom;
  holder: THREE.Group;
  /** Its doors drawn shut and windows blocked, as a key: a ghost turned another way may need others. */
  shut: string;
}

/** A doorway offered as a choice: a pad across it on the floor, with a border, half inside the room. */
function doorwayMark(direction: Edge, fill: THREE.Material, border: THREE.Material): THREE.Group {
  const { x, z } = DIRECTION[direction];
  const [w, d] = x === 0 ? [DOOR_WIDTH, DOORWAY_MARK.depth] : [DOORWAY_MARK.depth, DOOR_WIDTH];
  const [cx, cz] = [(x * TILE) / 2, (z * TILE) / 2];
  const rim = MARK.border;
  const edge = (ew: number, ed: number, ox: number, oz: number) => patch(ew, ed, cx + ox, cz + oz, MARK.edge, border);
  return group(patch(w, d, cx, cz, MARK.fill, fill), edge(w, rim, 0, -(d - rim) / 2), edge(w, rim, 0, (d - rim) / 2), edge(rim, d - rim * 2, -(w - rim) / 2, 0), edge(rim, d - rim * 2, (w - rim) / 2, 0));
}

/** The glow along a stair's run, in its room's frame: a faint band over the
 *  treads with a bright rail down each side. */
function stairGlow(run: readonly (readonly [number, number, number])[], fill: THREE.Material, border: THREE.Material): THREE.Group {
  const mark = group();
  for (let i = 1; i < run.length; i++) {
    const a = new THREE.Vector3(...run[i - 1]);
    const b = new THREE.Vector3(...run[i]);
    const along = b.clone().sub(a);
    const length = along.length();
    if (length < 1e-3) continue;
    along.normalize();
    const side = along.clone().cross(new THREE.Vector3(0, 1, 0)).normalize();
    const up = side.clone().cross(along);
    const turn = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(along, up, side));
    const piece = (width: number, offset: number, material: THREE.Material) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(length, 0.01, width), material);
      mesh.quaternion.copy(turn);
      mesh.position.copy(a).add(b).multiplyScalar(0.5).addScaledVector(side, offset).addScaledVector(up, STAIR_MARK.lift);
      return mesh;
    };
    const edge = (STAIR_MARK.width - STAIR_MARK.rail) / 2;
    mark.add(piece(STAIR_MARK.width, 0, fill), piece(STAIR_MARK.rail, -edge, border), piece(STAIR_MARK.rail, edge, border));
  }
  return mark;
}

/** A cell on another floor, on this one: the corners of a square half a tile across, open along its sides. */
function awayMark(border: THREE.Material): THREE.Group {
  const half = TILE / 4;
  const arm = TILE / 10;
  const mark = group();
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const [x, z] = [sx * half, sz * half];
    mark.add(patch(arm, MARK.border, x - (sx * arm) / 2, z - (sz * MARK.border) / 2, MARK.edge, border), patch(MARK.border, arm, x - (sx * MARK.border) / 2, z - (sz * arm) / 2, MARK.edge, border));
  }
  return mark;
}

/** A ring round a figure's colour ring. */
function figureMark(border: THREE.Material): THREE.Mesh {
  const ring = new THREE.Mesh(new THREE.RingGeometry(FLOOR_RINGS.choice.inner, FLOOR_RINGS.choice.outer, FLOOR_RINGS.segments), border);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = FLOOR_RINGS.choice.height;
  return ring;
}

/**
 * Every choice mark the house may draw in a room, in the room's own frame:
 * its glow, a pad at each doorway, the glow along each stair and a ring at
 * each prime place (where a figure most often stands to be chosen). They write no depth, so a face of the room's lying in
 * one of their planes fights them: the overlap check reads them.
 */
export function roomMarks(def: RoomDefinition): THREE.Group {
  const fill = lightMaterial(0.1);
  const border = lightMaterial(0.3);
  const tile = roomTile(def.id);
  const marks = group(tileMark(fill, border), ...[...tile.doors, ...tile.passages].map((edge) => doorwayMark(edge, fill, border)));
  for (const run of Object.values(def.stairs ?? {})) marks.add(stairGlow(run, fill, border));
  for (const [x, z] of primePlaces(def)) {
    const ring = figureMark(border);
    ring.position.set(x, ring.position.y, z);
    marks.add(ring);
  }
  return marks;
}

/** Points every so often along a path, leaving its ends bare: the start is
 *  under the explorer, and the end is marked by its room's glow. */
function routeDots(path: readonly HousePoint[]): HousePoint[] {
  const total = walkLength(path);
  const dots: HousePoint[] = [];
  let walked = 0;
  let next = ROUTE.clear;
  for (const [i, b] of path.slice(1).entries()) {
    const a = path[i];
    if (a.floor !== b.floor) continue;
    const length = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    while (next <= walked + length && next <= total - ROUTE.clear) {
      const t = (next - walked) / length;
      dots.push({ floor: a.floor, x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
      next += ROUTE.every;
    }
    walked += length;
  }
  return dots;
}

/** How high a floor stands in the scene, stacked round the ground floor. */
const level = (floor: FloorId) => (FLOORS.indexOf(floor) - FLOORS.indexOf("ground")) * STACK_GAP;

/** A room in flight: posed at `t`, from 0 (on its old cell) to 1 (on its new one), and landed. */
export interface RoomFlight {
  at: (t: number) => void;
  land: () => void;
}

/** An engine layout as a house of rooms, each built in its own frame and laid
 *  at its cell and rotation, on its floor, and the figures in it, who walk
 *  between rooms. Both change as play goes on. */
/** How the house does its slow work: `prepare` readies a room's or a figure's
 *  shaders before it first shows (see `Prepare`), `slices` builds its rooms
 *  (inline, all at once, unless given), and `figures` meshes its figures
 *  (as each is built, unless given). `texelsPerMetre` is its lightmaps'
 *  density: the page's own setting unless a test asks for a coarser one. */
export interface HouseWork {
  prepare?: Prepare;
  slices?: Slicer;
  figures?: FigureMesher;
  texelsPerMetre?: number;
}

export function buildHouse(initial: Layout, bakeQueue: BakeScheduler = inlineScheduler(), { prepare, slices = inlineSlicer(), figures = meshOnBuild, texelsPerMetre = LIGHTMAP.texelsPerMetre }: HouseWork = {}): House {
  const root = group();
  let layout: Layout = { tiles: [] };
  const levels = new Map<FloorId, THREE.Group>();
  const lighting = new Map<FloorId, LitFloor>();
  const bakes = new Map<FloorId, Rebake>();
  const placements = new Map<string, { id: string; room: FrozenRoom; matrix: THREE.Matrix4 }>();
  /** Each room's wait to be shown with its light, while it is pending. */
  const shownWhen = new Map<string, Promise<void>>();
  let pending = 0;
  /** Figures standing in as pawns while theirs are meshed. */
  let figuresComing = 0;
  /** The walls last cut, so they are cut again only when that changes; cleared when rooms change. */
  let lastCut = "";
  const fill = fillLight();
  root.add(fill);

  let showing: FloorChoice = "ground";
  const shows = (floor: FloorId) => showing === "all" || showing === floor;
  const floors = () => FLOORS.filter((floor) => layout.tiles.some((tile) => tile.floor === floor));

  const tileOf = (room: string): PlacedTile => {
    const tile = placed(layout, room);
    if (!tile) throw new Error(`The house has no room "${room}"`);
    return tile;
  };
  /** A room built, frozen and laid at its cell and rotation on its floor's frame, in steps: laid where its tile is once frozen. */
  function* placementSteps(id: string): Generator<void, { id: string; room: FrozenRoom; matrix: THREE.Matrix4 }> {
    const tile = tileOf(id);
    const built = buildRoom(definition(id), { explorer: null, closedDoors: closedDoors(layout, CATALOG, tile), falseWindows: falseWindows(layout, CATALOG, tile) });
    yield;
    const room = yield* freezeSteps(id, built, texelsPerMetre);
    const at = tileOf(id);
    const matrix = new THREE.Matrix4().compose(new THREE.Vector3(at.x * TILE, 0, at.y * TILE), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, tileTurn(at.rotation), 0)), new THREE.Vector3(1, 1, 1));
    return { id, room, matrix };
  }
  /** A tile built, frozen and laid at its cell and rotation on its floor's frame, at once. */
  const placement = (tile: PlacedTile) => runSteps(placementSteps(tile.tile));
  /** The floor's lighting, made (and its level stacked) the first time a room is on it. */
  const floorLighting = (floor: FloorId): LitFloor => {
    const existing = lighting.get(floor);
    if (existing) return existing;
    const lit = createLitFloor(bakeQueue, floor, prepare, dropFlat);
    const holder = group(lit.root);
    holder.position.y = level(floor);
    holder.visible = shows(floor);
    levels.set(floor, holder);
    lighting.set(floor, lit);
    root.add(holder);
    return lit;
  };
  /** Lays a floor's rooms; it resolves once they show their direct light, and the finer passes follow in the background. */
  const placeFloor = (floor: FloorId): Promise<Rebake> =>
    floorLighting(floor).place(layout.tiles.filter((tile) => tile.floor === floor).flatMap((tile) => placements.get(tile.tile) ?? []));
  /** Tracks work on the house until it is done, so readiness waits for it. */
  const track = <T>(work: Promise<T>): Promise<T> => {
    pending++;
    const done = () => {
      pending--;
      lastCut = "";
    };
    work.then(done, done);
    return work;
  };

  /** Rooms waiting to be built, a slice each, by floor: a floor is laid once all of its are built. */
  const unbuilt = new Map<FloorId, Set<string>>();
  /** Rooms to be shown with their light once their floor is next laid: how to hand each the bake. */
  const laying = new Map<FloorId, ((baked: Promise<Rebake>) => void)[]>();
  const sliceKey = (room: string) => `room:${room}`;
  const layFloor = (floor: FloorId) => {
    const baked = track(
      placeFloor(floor).then((rebake) => {
        if (!bakes.has(floor)) bakes.set(floor, rebake);
        return rebake;
      }),
    );
    for (const hand of laying.get(floor) ?? []) hand(baked);
    laying.delete(floor);
    lastCut = "";
  };
  const layIfBuilt = (floor: FloorId) => {
    if ((unbuilt.get(floor)?.size ?? 0) === 0) layFloor(floor);
  };
  /** Takes a room off the build queue; the floor it waited on, if it did. */
  const unqueue = (room: string): FloorId | null => {
    for (const [floor, waiting] of unbuilt) {
      if (!waiting.delete(room)) continue;
      slices.cancel(sliceKey(room));
      pending--;
      return floor;
    }
    return null;
  };
  /** Builds a room a few steps a frame; it waits on the build queue until it is done, so a change to it meanwhile drops it. */
  function* buildNow(room: string, floor: FloorId): Generator<void, void> {
    const fresh = yield* placementSteps(room);
    unbuilt.get(floor)?.delete(room);
    pending--;
    placements.set(room, fresh);
    void track(fresh.room.ready);
    layIfBuilt(floor);
  }

  /** Whether the house as first laid out is in: rooms placed after it show solid, in flat light, while they bake. */
  let started = false;
  const setLayout = (next: Layout): LayoutChange => {
    const change = diffLayout(layout, next, CATALOG);
    const touched = new Set<FloorId>();
    for (const id of change.removed) {
      touched.add(tileOf(id).floor);
      unqueue(id);
      placements.delete(id);
    }
    for (const id of change.moved) touched.add(tileOf(id).floor);
    layout = { tiles: next.tiles.map((tile) => ({ ...tile })) };
    for (const id of change.removed) dropFlat(id);
    // Each stands in before its build starts, so its light can never land first.
    if (started) for (const id of [...change.added, ...change.moved]) settle(id);
    // Every room to build joins the queue before any is built, so a floor is laid only once all of its are in.
    const building = change.rebuilt.map((id) => {
      const left = unqueue(id);
      if (left) touched.add(left);
      const { floor } = tileOf(id);
      touched.add(floor);
      unbuilt.set(floor, (unbuilt.get(floor) ?? new Set()).add(id));
      pending++;
      const shown: Promise<void> = new Promise<Promise<Rebake>>((hand) => {
        laying.set(floor, [...(laying.get(floor) ?? []), hand]);
      })
        .then((baked) => baked)
        .then(() => placements.get(id)?.room.ready)
        .then(() => {
          if (shownWhen.get(id) === shown) shownWhen.delete(id);
        });
      shownWhen.set(id, shown);
      return { id, floor };
    });
    // The floor showing is built first, so it is lit first.
    for (const { id, floor } of building) slices.add(sliceKey(id), () => buildNow(id, floor), () => (shows(floor) ? 1 : 0));
    for (const floor of FLOORS.filter((candidate) => touched.has(candidate) && !building.some((room) => room.floor === candidate))) layIfBuilt(floor);
    lastCut = "";
    return change;
  };

  const scenePoint = (point: HousePoint) => new THREE.Vector3(point.x, point.y + level(point.floor), point.z);
  const cellCentre = (floor: FloorId, x: number, y: number) => new THREE.Vector3(x * TILE, level(floor), y * TILE);
  const rooms = (): PlacedRoom[] =>
    layout.tiles.flatMap((tile) => {
      const placedRoom = placements.get(tile.tile);
      return placedRoom ? [{ id: tile.tile, floor: tile.floor, room: placedRoom.room, centre: cellCentre(tile.floor, tile.x, tile.y) }] : [];
    });

  const walkers = new Map<string, Walker>();
  const walkerOf = (id: string) => {
    const walker = walkers.get(id);
    if (!walker) throw new Error(`The house has no figure "${id}"`);
    return walker;
  };
  const poseWalker = (walker: Walker, seconds: number) => {
    if (walker.walk) {
      const pose = walkPose(walker.walk, seconds, walker.walking.step);
      walker.at = pose.point;
      walker.heading = pose.heading;
    }
    walker.holder.position.copy(scenePoint(walker.at));
    walker.holder.rotation.y = walker.heading;
    walker.holder.visible = walker.carried || shows(walker.at.floor);
    lighting.get(walker.at.floor)?.probeAt(new THREE.Vector3(walker.at.x, walker.at.y, walker.at.z), walker.probe.value);
    for (const animation of walker.animations) animation(seconds);
    walker.batch.sync();
  };
  /** One light follows whoever's turn it is, so the scene's count of lights
   *  never changes: a change recompiles every material. */
  const activeLight = explorerLight();
  root.add(activeLight);
  let active: Walker | null = null;
  /** The light moving to whoever's turn starts: where it set off from, and when, on the stage's clock (null until its first frame). */
  let glide: { from: THREE.Vector3; start: number | null } | null = null;
  const lightGoal = new THREE.Vector3();

  /** A glow in a palette colour, kept out of tone mapping: the exposure that
   *  lifts the dark rooms would wash every glow out to the same white. */
  const glowing = (colour: PaletteKey, opacity: number) => {
    const material = lightMaterial(opacity);
    material.color.set(paletteHex(colour));
    material.toneMapped = false;
    return material;
  };
  const softFill = glowing("moon", 0.08);
  const softBorder = glowing("moonLight", 0.35);
  const focusFill = glowing("amber", 0.14);
  const focusBorder = glowing("amber", 1);
  const fate = (doorway: GhostDoorway) => glowing(GHOST_DOORWAY_COLOUR[doorway], 0.6);
  const fates: Record<GhostDoorway, THREE.Material> = { joined: fate("joined"), blind: fate("blind"), shut: fate("shut"), unexplored: fate("unexplored") };
  const ghostLook = { opacity: GHOST_LOOK.opacity, glow: { value: new THREE.Color(paletteHex("moonLight")).multiplyScalar(GHOST_LOOK.glow) }, fade: { value: 1 } };

  /** A floor's level, which a mark on it shows and hides with. */
  const floorHolder = (floor: FloorId): THREE.Object3D => {
    floorLighting(floor);
    const holder = levels.get(floor);
    if (!holder) throw new Error(`The house has no level for "${floor}"`);
    return holder;
  };
  /** The marks showing, each drawn soft and focused, one of them visible. */
  let marks: { id: string; soft: THREE.Object3D; focused: THREE.Object3D }[] = [];
  const markOf = (mark: Mark, fill: THREE.Material, border: THREE.Material): { object: THREE.Object3D; parent: THREE.Object3D } => {
    switch (mark.kind) {
      case "room": {
        const tile = tileOf(mark.room);
        const object = tileMark(fill, border);
        object.position.set(tile.x * TILE, 0, tile.y * TILE);
        return { object, parent: floorHolder(tile.floor) };
      }
      case "cell":
      case "ghost": {
        const object = mark.kind === "cell" ? tileMark(null, border) : ghostMark(mark.doors, fill, border, fates);
        object.position.set(mark.x * TILE, 0, mark.y * TILE);
        return { object, parent: floorHolder(mark.floor) };
      }
      case "stair": {
        const tile = tileOf(mark.room);
        const run = definition(mark.room).stairs?.[mark.toward];
        if (!run) throw new Error(`${mark.room} has no stair towards ${mark.toward}`);
        const object = stairGlow(run, fill, border);
        object.position.set(tile.x * TILE, 0, tile.y * TILE);
        object.rotation.y = tileTurn(tile.rotation);
        return { object, parent: floorHolder(tile.floor) };
      }
      case "figure":
        return { object: figureMark(border), parent: walkerOf(mark.figure).holder };
      case "away": {
        const object = awayMark(border);
        object.position.set(mark.x * TILE, 0, mark.y * TILE);
        return { object, parent: floorHolder(mark.floor) };
      }
    }
  };
  const clearMarks = () => {
    for (const { soft, focused } of marks) {
      for (const object of [soft, focused]) {
        object.removeFromParent();
        object.traverse((child) => {
          if (child instanceof THREE.Mesh) child.geometry.dispose();
        });
      }
    }
    marks = [];
  };

  /** The room the player is placing, shown as a ghost, and the rooms just placed that are still baking, shown solid in flat light. */
  let choosing: StandIn | null = null;
  const settling = new Map<string, StandIn>();
  /** The way the camera last looked, for cutting a ghost's walls as the house's are cut. */
  let viewedFrom: { x: number; z: number } | null = null;
  let viewFocus: string | null = null;
  /** Whether the player is holding every wall up. */
  let wallsRaised = false;
  /** Rooms moved by a rule, in flight to their new cells: what carries them, and the room that flies, in flat light. */
  const flights = new Map<string, { carrier: THREE.Group; floors: FloorId[]; flying: StandIn; riders: { id: string; walker: Walker }[] }>();
  const standIns = () => [...(choosing ? [choosing] : []), ...settling.values(), ...[...flights.values()].map((flight) => flight.flying)];
  const cutGhost = (ghost: StandIn) => {
    if (!viewedFrom) return;
    const around: Layout = { tiles: [...liftTile(layout, ghost.tile.tile).tiles, ghost.tile] };
    const camera = viewedFrom;
    const cut = wallsRaised ? [] : EDGES.filter((direction) => wallIsCut(around, ghost.tile, direction, camera, viewFocus)).map((direction) => printedEdge(direction, ghost.tile.rotation));
    ghost.room.setCut((edge) => cut.includes(edge));
  };
  /** What of a room at a cell would be blocked there: its doors facing a wall, and its windows against a room. */
  const blockedAt = (around: Layout, tile: PlacedTile) => ({ doors: closedDoors(around, CATALOG, tile), windows: falseWindows(around, CATALOG, tile) });
  const blockedKey = (blocked: ReturnType<typeof blockedAt>) => `${blocked.doors.join()}|${blocked.windows.join()}`;
  /** A room at a cell, turned as given, with what would be blocked there drawn so: as a ghost, or solid in flat light. */
  const standInOf = (tile: PlacedTile, blocked: ReturnType<typeof blockedAt>, look: "ghost" | "flat"): StandIn => {
    const frozen = freezeRoom(tile.tile, buildRoom(definition(tile.tile), { explorer: null, closedDoors: blocked.doors, falseWindows: blocked.windows }), texelsPerMetre);
    const room = look === "ghost" ? ghostRoom(frozen, ghostLook) : flatRoom(frozen);
    const standIn: StandIn = { tile, room, holder: group(room.root), shut: blockedKey(blocked) };
    layGhost(standIn, tile);
    return standIn;
  };
  const layGhost = (ghost: StandIn, tile: PlacedTile) => {
    ghost.tile = tile;
    ghost.holder.position.set(tile.x * TILE, 0, tile.y * TILE);
    ghost.holder.rotation.y = tileTurn(tile.rotation);
    floorHolder(tile.floor).add(ghost.holder);
    cutGhost(ghost);
  };
  const dropGhost = (ghost: StandIn) => {
    ghost.holder.removeFromParent();
    ghost.room.dispose();
  };
  const setGhost = (tile: PlacedTile | null) => {
    if (!tile) {
      if (choosing) dropGhost(choosing);
      choosing = null;
      return;
    }
    const around: Layout = { tiles: [...liftTile(layout, tile.tile).tiles, tile] };
    const blocked = blockedAt(around, tile);
    if (choosing?.tile.tile === tile.tile && choosing.shut === blockedKey(blocked)) layGhost(choosing, tile);
    else {
      if (choosing) dropGhost(choosing);
      choosing = standInOf(tile, blocked, "ghost");
    }
  };
  /** Takes away the flat room standing in for a room: once the room shows lit (in the same frame), or is gone. */
  const dropFlat = (id: string) => {
    const flat = settling.get(id);
    if (flat) dropGhost(flat);
    settling.delete(id);
  };
  /** A room just placed or moved shows solid at once, in flat light, until it shows lit. */
  const settle = (id: string) => {
    dropFlat(id);
    const tile = tileOf(id);
    settling.set(id, standInOf({ ...tile }, blockedAt(layout, tile), "flat"));
  };

  /** A room in flight: the room as it shows at its new cell (lit, or flat while it bakes) waits hidden, and it shows from either floor. */
  const hideLanding = (id: string, flight: { carrier: THREE.Group; floors: FloorId[] }) => {
    const tile = placed(layout, id);
    const lit = tile && lighting.get(tile.floor)?.rooms.get(id);
    if (lit) lit.root.visible = false;
    const waiting = settling.get(id);
    if (waiting) waiting.holder.visible = false;
    flight.carrier.visible = flight.floors.some(shows);
  };
  const landRoom = (id: string) => {
    const flight = flights.get(id);
    if (!flight) return;
    flights.delete(id);
    for (const { id: rider, walker } of flight.riders) {
      walker.carried = false;
      // A figure taken out of the house in flight has nowhere to land.
      if (walkers.get(rider) === walker) root.add(walker.holder);
    }
    flight.carrier.removeFromParent();
    dropGhost(flight.flying);
    const tile = placed(layout, id);
    const lit = tile && lighting.get(tile.floor)?.rooms.get(id);
    if (lit) lit.root.visible = true;
    const waiting = settling.get(id);
    if (waiting) waiting.holder.visible = true;
  };
  const liftRoom = (id: string, from: PlacedTile, riders: readonly string[]): RoomFlight => {
    landRoom(id);
    const to = tileOf(id);
    const carrier = group();
    carrier.matrixAutoUpdate = false;
    root.add(carrier);
    const flying = standInOf({ ...to }, blockedAt(layout, to), "flat");
    carrier.add(flying.holder);
    flying.holder.position.copy(cellCentre(to.floor, to.x, to.y));
    const carried = riders.map((rider) => ({ id: rider, walker: walkerOf(rider) }));
    for (const { walker } of carried) {
      walker.carried = true;
      carrier.add(walker.holder);
    }
    const flight = { carrier, floors: [from.floor, to.floor], flying, riders: carried };
    flights.set(id, flight);
    const ends = [from, to].map((tile) => ({ centre: cellCentre(tile.floor, tile.x, tile.y), turn: tileTurn(tile.rotation) }));
    const at = (t: number) => {
      carrier.matrix.copy(carrying(ends[0], ends[1], t));
      carrier.matrixWorldNeedsUpdate = true;
    };
    at(0);
    hideLanding(id, flight);
    return { at, land: () => landRoom(id) };
  };

  // Every dot of the route is one instance, so the whole route is one draw call.
  const dotGeometry = new THREE.BoxGeometry(ROUTE.size, 0.015, ROUTE.size);
  const route = new THREE.InstancedMesh(dotGeometry, glowing("flame", 0.9), ROUTE.most);
  route.frustumCulled = false;
  route.count = 0;
  root.add(route);
  let routeShown: HousePoint[] = [];
  const placeRoute = () => {
    const showingDots = routeShown.filter((dot) => shows(dot.floor));
    if (showingDots.length > ROUTE.most) throw new Error(`A route of ${showingDots.length} dots; the most is ${ROUTE.most}`);
    const place = new THREE.Matrix4();
    showingDots.forEach((dot, i) => {
      const at = scenePoint(dot);
      route.setMatrixAt(i, place.makeTranslation(at.x, at.y + MARK.height, at.z));
    });
    route.count = showingDots.length;
    route.instanceMatrix.needsUpdate = true;
  };

  // From the layout, not the rooms built, so the camera frames the house while its rooms are still being built.
  const corners = () => layout.tiles.filter((tile) => shows(tile.floor)).flatMap((tile) => tileCorners(cellCentre(tile.floor, tile.x, tile.y)));
  const showFloor = (floor: FloorChoice) => {
    showing = floor;
    for (const [id, holder] of levels) holder.visible = shows(id);
    for (const walker of walkers.values()) walker.holder.visible = shows(walker.at.floor);
    placeRoute();
  };

  setLayout(initial);
  started = true;
  const first = floors();
  showFloor(first.includes("ground") ? "ground" : (first[0] ?? "ground"));
  const ready = Promise.all([...[...placements.values()].map(({ room }) => room.ready), texturesUnder(root), ...[...shownWhen.values()]]).then(() => {
    lastCut = "";
  });

  const fog = houseFog();
  const background = fog.color.clone();
  const mood = houseMood(fill, fog, background);
  return {
    root,
    get layout() {
      return layout;
    },
    get rooms() {
      return rooms();
    },
    get floors() {
      return floors();
    },
    setLayout,
    roomShown: (room) => shownWhen.get(room) ?? Promise.resolve(),
    built: () => pending === 0,
    figuresIn: () => figuresComing === 0,
    roomsShown: () => [...lighting.values()].reduce((sum, lit) => sum + [...lit.rooms.values()].filter((room) => room.root.parent === lit.root).length, 0),
    shownAs: (room) => {
      if (choosing?.tile.tile === room) return "ghost";
      if (settling.has(room) || flights.has(room)) return "flat";
      const tile = placed(layout, room);
      const lit = tile && lighting.get(tile.floor);
      return lit && lit.rooms.get(room)?.root.parent === lit.root ? "lit" : null;
    },
    showFloor,
    cellCentre,
    corners,
    setCutaway: (cameraDirection, focus, raised = false) => {
      const camera = { x: cameraDirection.x, z: cameraDirection.y };
      if (viewedFrom?.x !== camera.x || viewedFrom.z !== camera.z || viewFocus !== focus || wallsRaised !== raised) {
        viewedFrom = camera;
        viewFocus = focus;
        wallsRaised = raised;
        for (const standIn of standIns()) cutGhost(standIn);
      }
      const cuts = layout.tiles.map((tile) => (raised ? [] : EDGES.filter((direction) => wallIsCut(layout, tile, direction, camera, focus)).map((direction) => printedEdge(direction, tile.rotation))));
      const key = JSON.stringify(cuts);
      if (key === lastCut) return;
      lastCut = key;
      for (const [i, tile] of layout.tiles.entries()) {
        const lit = lighting.get(tile.floor)?.rooms.get(tile.tile);
        lit?.setCut((edge) => cuts[i].includes(edge));
      }
    },
    update: (seconds) => {
      mood.update(seconds);
      for (const [id, flight] of flights) hideLanding(id, flight);
      for (const lit of lighting.values()) lit.update(seconds);
      for (const walker of walkers.values()) poseWalker(walker, seconds);
      for (const standIn of standIns()) standIn.room.update(seconds);
      ghostLook.fade.value = 1 - (1 - GHOST_LOOK.low) * (0.5 - 0.5 * Math.cos((seconds * Math.PI * 2) / GHOST_LOOK.period));
      if (active) {
        // The world position, as a figure riding in a moving room is carried in it.
        active.holder.getWorldPosition(lightGoal).add(EXPLORER_LIGHT_OFFSET);
        if (glide) {
          glide.start ??= seconds;
          const t = Math.min(1, (seconds - glide.start) / LIGHT_GLIDE);
          activeLight.position.lerpVectors(glide.from, lightGoal, t * t * (3 - 2 * t));
          if (t >= 1) glide = null;
        } else {
          activeLight.position.copy(lightGoal);
        }
      }
      const pulse = 0.5 + 0.5 * Math.sin(seconds * 3);
      focusFill.opacity = 0.1 + 0.1 * pulse;
      focusBorder.opacity = 0.7 + 0.3 * pulse;
    },
    lighting,
    bakes,
    rebake: (room) => {
      const tile = tileOf(room);
      unqueue(room);
      placements.set(room, placement(tile));
      return track(placeFloor(tile.floor));
    },
    scenePoint,
    roomHeading: (room) => tileTurn(tileOf(room).rotation),
    addFigure: (figure, at, heading) => {
      if (walkers.has(figure.id)) throw new Error(`The house already has a figure "${figure.id}"`);
      const walker: Walker = { holder: group(), probe: { value: [] }, animations: [], batch: { sync: () => undefined }, at, heading, walk: null, walking: ADULT_WALK, carried: false };
      const gait = (seconds: number) => (walker.walk ? walkPose(walker.walk, seconds, walker.walking.step).stride : { phase: 0, amount: 0 });
      /** The figure built, lit by its probe and batched, ready to stand in the holder. */
      const make = (as: HouseFigure) => {
        const { marked: built, walking } = marked(as, gait);
        const animations: Animation[] = [];
        built.traverse((object) => {
          const animation = animationOf(object);
          if (animation) animations.push(animation);
        });
        return { built, walking, animations, probe: patchProbe(built), batch: batchParts(built) };
      };
      const stand = (made: ReturnType<typeof make>) => {
        for (const old of [...walker.holder.children]) {
          old.removeFromParent();
          disposeTree(old);
        }
        Object.assign(walker, { walking: made.walking, animations: made.animations, probe: made.probe, batch: made.batch });
        walker.holder.add(made.built);
        void track(texturesUnder(made.built));
      };
      if (figures.isMeshed(figure.build)) stand(make(figure));
      else {
        // Its pawn in the seat's colour stands in, at once, until the figure is meshed off this thread and its shaders are ready.
        stand(make({ ...figure, build: () => pawn({ colour: figure.colour }) }));
        figuresComing++;
        const standing = () => walkers.get(figure.id) === walker;
        const arrive = (made: ReturnType<typeof make>) => {
          if (standing()) stand(made);
          else disposeTree(made.built);
          figuresComing--;
        };
        void figures.meshed(figure.build).then(() => {
          if (!standing()) {
            figuresComing--;
            return;
          }
          const made = make(figure);
          if (prepare) return prepare(made.built).then(() => arrive(made));
          arrive(made);
        });
      }
      walker.holder.visible = shows(at.floor);
      root.add(walker.holder);
      walkers.set(figure.id, walker);
    },
    removeFigure: (id) => {
      const walker = walkerOf(id);
      if (active === walker) active = null;
      walker.holder.removeFromParent();
      disposeTree(walker.holder);
      walkers.delete(id);
    },
    stand: (id, point, heading) => {
      const walker = walkerOf(id);
      walker.walk = null;
      walker.at = point;
      if (heading !== undefined) walker.heading = heading;
    },
    walk: (id, walk) => {
      walkerOf(id).walk = walk;
    },
    figureAt: (id) => walkerOf(id).at,
    setActive: (id) => {
      const next = id === null ? null : walkerOf(id);
      // The light moves from one explorer to the next, rather than jumping.
      if (active && next && next !== active) glide = { from: activeLight.position.clone(), start: null };
      active = next;
    },
    setMarks: (wanted, focused) => {
      clearMarks();
      marks = wanted.map((mark) => {
        const soft = markOf(mark, softFill, softBorder);
        const lit = markOf(mark, focusFill, focusBorder);
        soft.object.visible = mark.id !== focused;
        lit.object.visible = mark.id === focused;
        soft.parent.add(soft.object);
        lit.parent.add(lit.object);
        return { id: mark.id, soft: soft.object, focused: lit.object };
      });
    },
    focusMark: (focused) => {
      for (const { id, soft, focused: lit } of marks) {
        soft.visible = id !== focused;
        lit.visible = id === focused;
      }
    },
    showRoute: (path) => {
      routeShown = path ? routeDots(path) : [];
      placeRoute();
    },
    setGhost,
    fill,
    fog,
    background,
    setMood: mood.set,
    liftRoom,
    ready,
    dispose: () => {
      for (const id of [...flights.keys()]) landRoom(id);
      clearMarks();
      for (const standIn of standIns()) dropGhost(standIn);
      for (const lit of lighting.values()) lit.dispose();
      disposeTree(root);
      dotGeometry.dispose();
    },
  };
}
