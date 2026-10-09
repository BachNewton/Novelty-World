import * as THREE from "three";
import { EDGES, FLOORS, liftTile, placed, type Layout } from "../engine/board";
import { CATALOG } from "../data";
import type { GhostDoor, GhostDoorway } from "../play/ghost";
import type { Edge, FloorId, PlacedTile } from "../types";
import { animationOf, type Animation } from "./animate";
import { ADULT_WALK, isGrounded, walkingOf, type Stride, type Walking } from "./explorers/figure";
import { closedDoors, diffLayout, DIRECTION, printedEdge, tileTurn, wallIsCut, type LayoutChange } from "./house-layout";
import { inHouse, walkLength, walkPose, type HousePoint, type Walk } from "./house-walk";
import { inlineBaker, type Baker } from "./bake";
import { freezeRoom, type FrozenRoom } from "./freeze";
import { EXPLORER_LIGHT_OFFSET, explorerLight, fillLight, houseFog } from "./lighting";
import { createLitFloor, ghostRoom, patchProbe, type GhostRoom, type LitFloor, type ProbeUniform, type Rebake } from "./lit-floor";
import { paletteHex, type PaletteKey } from "./palette";
import { DOOR_WIDTH, explorerSpot, TILE, WALL_HEIGHT, type RoomDefinition } from "./room";
import { BENCH_ROOMS } from "./rooms";
import { box, glow, group, lightMaterial } from "./shapes";
import { buildRoom, disposeTree, roomTile, type ExplorerBuilder } from "./stage";
import { earth, flagstones, plaster, textureReady, woodPlanks } from "./textures";
/** How far apart the floors are stacked when the whole house shows at once:
 *  far enough apart that one floor never hides the one below. */
export const STACK_GAP = 7;
/** The explorer marker: a ring of the player's colour round the base. */
const RING = { inner: 0.4, outer: 0.55, height: 0.03 };
/** A room offered as a choice glows on its floor: a fill, and a border just inside its walls. */
const MARK = { inset: 0.35, border: 0.12, height: 0.04 };
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
/** A figure offered as a choice glows in a ring round its colour ring. */
const FIGURE_MARK = { inner: 0.68, outer: 0.82, height: 0.035 };
/** The route preview: a dot every `every` metres, kept clear of where the walk starts and ends, at most `most` of them. */
const ROUTE = { every: 0.5, size: 0.14, clear: 0.6, most: 160 };

export type FloorChoice = FloorId | "all";

/** A figure standing in the house: an explorer (or anything built like one)
 *  with its player's colour round the base. */
export interface HouseFigure {
  id: string;
  build: ExplorerBuilder;
  colour: PaletteKey;
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
  /** A doorway out of `room`, on a board direction. */
  | { kind: "doorway"; room: string; direction: Edge }
  | { kind: "figure"; figure: string }
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
  /** Shows one floor, or every floor stacked apart. */
  showFloor: (floor: FloorChoice) => void;
  /** The centre in the scene of a cell, with its floor stacked as it shows. */
  cellCentre: (floor: FloorId, x: number, y: number) => THREE.Vector3;
  /** The corners of every room showing: one floor, or all of them. */
  corners: () => THREE.Vector3[];
  /** Cuts the walls for a camera looking from this horizontal direction,
   *  with `focus` the room a close view is on (null for the whole floor). */
  setCutaway: (cameraDirection: THREE.Vector2, focus: string | null) => void;
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
  /** Where an explorer stands in a room: its pawn spot, or for a second
   *  explorer there (`slot` 1), beside it, towards the middle of the room. */
  spot: (room: string, slot: number) => HousePoint;
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
   *  as given, without baking it; null takes it away. A room just placed or
   *  moved shows as a ghost too, until it is baked and shows itself. */
  setGhost: (ghost: PlacedTile | null) => void;
  fog: THREE.Fog;
  background: THREE.Color;
  /** Resolves once the house as first laid out is built and baked. */
  ready: Promise<void>;
  dispose: () => void;
}

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
      pawn: [0.8, 0.8],
    };
  }
  return {
    id,
    floor: () => woodPlanks({ seed: id }),
    wall: () => plaster({ seed: id }),
    trim: "woodDark",
    props: [],
    pawn: [0.8, 0.8],
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

/** A figure with their player's colour round the base, and how the figure walks. */
function marked({ id, build, colour }: HouseFigure, gait: (seconds: number) => Stride): { marked: THREE.Group; walking: Walking } {
  const ring = new THREE.Mesh(new THREE.RingGeometry(RING.inner, RING.outer, 24), glow(colour));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = RING.height;
  const figure = build(`${id}:explorer`, gait);
  // A figure that floats has no base for the ring to go round.
  return { marked: isGrounded(figure) ? group(figure, ring) : group(figure), walking: walkingOf(figure) };
}

function texturesUnder(root: THREE.Object3D): Promise<void> {
  const textures = new Set<THREE.Texture>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    for (const material of [object.material].flat() as THREE.Material[]) {
      if ("map" in material && material.map instanceof THREE.Texture) textures.add(material.map);
    }
  });
  return Promise.all([...textures].map(textureReady)).then(() => undefined);
}

interface Walker {
  holder: THREE.Group;
  /** The baked light where it stands, as an ambient cube. */
  probe: ProbeUniform;
  animations: Animation[];
  at: HousePoint;
  heading: number;
  walk: Walk | null;
  walking: Walking;
}

/** The glow on a tile's floor that marks it as a choice: a faint fill (none
 *  for an empty cell) and a border just inside its walls. */
function tileMark(fill: THREE.Material | null, border: THREE.Material): THREE.Group {
  const span = TILE - MARK.inset * 2;
  const edge = (w: number, d: number, x: number, z: number) => box([w, 0.01, d], border, [x, MARK.height, z]);
  const off = span / 2 - MARK.border / 2;
  const mark = group(edge(span, MARK.border, 0, -off), edge(span, MARK.border, 0, off), edge(MARK.border, span, -off, 0), edge(MARK.border, span, off, 0));
  if (fill) {
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(span, span), fill);
    pane.rotation.x = -Math.PI / 2;
    pane.position.y = MARK.height - 0.01;
    mark.add(pane);
  }
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

/** A room shown as a ghost: as built, and the holder that lays it at its cell. */
interface Ghost {
  tile: PlacedTile;
  room: GhostRoom;
  holder: THREE.Group;
  /** Its doors drawn shut, as a key: a ghost turned another way may need others shut. */
  shut: string;
}

/** A doorway offered as a choice: a pad across it on the floor, with a border, half inside the room. */
function doorwayMark(direction: Edge, fill: THREE.Material, border: THREE.Material): THREE.Group {
  const { x, z } = DIRECTION[direction];
  const [w, d] = x === 0 ? [DOOR_WIDTH, DOORWAY_MARK.depth] : [DOORWAY_MARK.depth, DOOR_WIDTH];
  const centre: [number, number, number] = [(x * TILE) / 2, MARK.height, (z * TILE) / 2];
  const rim = MARK.border;
  const pane = box([w, 0.005, d], fill, [centre[0], MARK.height - 0.01, centre[2]]);
  const edge = (ew: number, ed: number, ox: number, oz: number) => box([ew, 0.01, ed], border, [centre[0] + ox, MARK.height, centre[2] + oz]);
  return group(pane, edge(w, rim, 0, -(d - rim) / 2), edge(w, rim, 0, (d - rim) / 2), edge(rim, d, -(w - rim) / 2, 0), edge(rim, d, (w - rim) / 2, 0));
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

/** A ring round a figure's colour ring. */
function figureMark(border: THREE.Material): THREE.Mesh {
  const ring = new THREE.Mesh(new THREE.RingGeometry(FIGURE_MARK.inner, FIGURE_MARK.outer, 32), border);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = FIGURE_MARK.height;
  return ring;
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

/** An engine layout as a house of rooms, each built in its own frame and laid
 *  at its cell and rotation, on its floor, and the figures in it, who walk
 *  between rooms. Both change as play goes on. */
export function buildHouse(initial: Layout, baker: Baker = inlineBaker()): House {
  const root = group();
  let layout: Layout = { tiles: [] };
  const levels = new Map<FloorId, THREE.Group>();
  const lighting = new Map<FloorId, LitFloor>();
  const bakes = new Map<FloorId, Rebake>();
  const placements = new Map<string, { id: string; room: FrozenRoom; matrix: THREE.Matrix4 }>();
  /** Each room's wait to be shown with its light, while it is pending. */
  const shownWhen = new Map<string, Promise<void>>();
  let pending = 0;
  /** The walls last cut, so they are cut again only when that changes; cleared when rooms change. */
  let lastCut = "";
  root.add(fillLight());

  let showing: FloorChoice = "ground";
  const shows = (floor: FloorId) => showing === "all" || showing === floor;
  const floors = () => FLOORS.filter((floor) => layout.tiles.some((tile) => tile.floor === floor));

  const tileOf = (room: string): PlacedTile => {
    const tile = placed(layout, room);
    if (!tile) throw new Error(`The house has no room "${room}"`);
    return tile;
  };
  /** A tile built, frozen and laid at its cell and rotation on its floor's frame. */
  const placement = (tile: PlacedTile) => {
    const room = freezeRoom(tile.tile, buildRoom(definition(tile.tile), { explorer: null, closedDoors: closedDoors(layout, CATALOG, tile) }));
    const matrix = new THREE.Matrix4().compose(new THREE.Vector3(tile.x * TILE, 0, tile.y * TILE), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, tileTurn(tile.rotation), 0)), new THREE.Vector3(1, 1, 1));
    return { id: tile.tile, room, matrix };
  };
  /** The floor's lighting, made (and its level stacked) the first time a room is on it. */
  const floorLighting = (floor: FloorId): LitFloor => {
    const existing = lighting.get(floor);
    if (existing) return existing;
    const lit = createLitFloor(baker);
    const holder = group(lit.root);
    holder.position.y = level(floor);
    holder.visible = shows(floor);
    levels.set(floor, holder);
    lighting.set(floor, lit);
    root.add(holder);
    return lit;
  };
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

  /** Whether the house as first laid out is in: rooms placed after it show as ghosts while they bake. */
  let started = false;
  const setLayout = (next: Layout): LayoutChange => {
    const change = diffLayout(layout, next, CATALOG);
    const touched = new Set<FloorId>();
    for (const id of change.removed) {
      touched.add(tileOf(id).floor);
      placements.delete(id);
    }
    for (const id of change.moved) touched.add(tileOf(id).floor);
    layout = { tiles: next.tiles.map((tile) => ({ ...tile })) };
    for (const id of change.rebuilt) {
      const tile = tileOf(id);
      touched.add(tile.floor);
      const fresh = placement(tile);
      placements.set(id, fresh);
      void track(fresh.room.ready);
    }
    for (const floor of FLOORS.filter((candidate) => touched.has(candidate))) {
      const baked = track(
        placeFloor(floor).then((rebake) => {
          if (!bakes.has(floor)) bakes.set(floor, rebake);
          return rebake;
        }),
      );
      for (const tile of layout.tiles.filter((candidate) => candidate.floor === floor && change.rebuilt.includes(candidate.tile))) {
        const shown = baked.then(() => {
          shownWhen.delete(tile.tile);
        });
        shownWhen.set(tile.tile, shown);
      }
    }
    lastCut = "";
    if (started) for (const id of [...change.added, ...change.moved]) settle(id);
    for (const id of change.removed) {
      const ghost = settling.get(id);
      if (ghost) dropGhost(ghost);
      settling.delete(id);
    }
    return change;
  };

  const scenePoint = (point: HousePoint) => new THREE.Vector3(point.x, point.y + level(point.floor), point.z);
  const cellCentre = (floor: FloorId, x: number, y: number) => new THREE.Vector3(x * TILE, level(floor), y * TILE);
  const rooms = (): PlacedRoom[] =>
    layout.tiles.flatMap((tile) => {
      const placedRoom = placements.get(tile.tile);
      return placedRoom ? [{ id: tile.tile, floor: tile.floor, room: placedRoom.room, centre: cellCentre(tile.floor, tile.x, tile.y) }] : [];
    });
  const spot = (room: string, slot: number): HousePoint => {
    const pawnSpot = definition(room).pawn;
    if (!pawnSpot) throw new Error(`${room} has no spot for an explorer to stand on`);
    const [x, z] = explorerSpot(pawnSpot, slot);
    return inHouse(layout, room, [x, 0, z]);
  };

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
    walker.holder.visible = shows(walker.at.floor);
    lighting.get(walker.at.floor)?.probeAt(new THREE.Vector3(walker.at.x, walker.at.y, walker.at.z), walker.probe.value);
    for (const animation of walker.animations) animation(seconds);
  };
  /** One light follows whoever's turn it is, so the scene's count of lights
   *  never changes: a change recompiles every material. */
  const activeLight = explorerLight();
  root.add(activeLight);
  let active: Walker | null = null;

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
      case "doorway": {
        const tile = tileOf(mark.room);
        const object = doorwayMark(mark.direction, fill, border);
        object.position.set(tile.x * TILE, 0, tile.y * TILE);
        return { object, parent: floorHolder(tile.floor) };
      }
      case "figure":
        return { object: figureMark(border), parent: walkerOf(mark.figure).holder };
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

  /** The room the player is placing, and the rooms just placed that are still baking, shown as ghosts. */
  let choosing: Ghost | null = null;
  const settling = new Map<string, Ghost>();
  /** The way the camera last looked, for cutting a ghost's walls as the house's are cut. */
  let viewedFrom: { x: number; z: number } | null = null;
  let viewFocus: string | null = null;
  const ghosts = () => [...(choosing ? [choosing] : []), ...settling.values()];
  const cutGhost = (ghost: Ghost) => {
    if (!viewedFrom) return;
    const around: Layout = { tiles: [...liftTile(layout, ghost.tile.tile).tiles, ghost.tile] };
    const camera = viewedFrom;
    const cut = EDGES.filter((direction) => wallIsCut(around, ghost.tile, direction, camera, viewFocus)).map((direction) => printedEdge(direction, ghost.tile.rotation));
    ghost.room.setCut((edge) => cut.includes(edge));
  };
  /** A ghost of a room at a cell, turned as given, with the doors that would face a wall there drawn shut. */
  const ghostOf = (tile: PlacedTile, shut: Edge[]): Ghost => {
    const room = ghostRoom(freezeRoom(tile.tile, buildRoom(definition(tile.tile), { explorer: null, closedDoors: shut })), ghostLook);
    const holder = group(room.root);
    const ghost: Ghost = { tile, room, holder, shut: shut.join() };
    layGhost(ghost, tile);
    return ghost;
  };
  const layGhost = (ghost: Ghost, tile: PlacedTile) => {
    ghost.tile = tile;
    ghost.holder.position.set(tile.x * TILE, 0, tile.y * TILE);
    ghost.holder.rotation.y = tileTurn(tile.rotation);
    floorHolder(tile.floor).add(ghost.holder);
    cutGhost(ghost);
  };
  const dropGhost = (ghost: Ghost) => {
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
    const shut = closedDoors(around, CATALOG, tile);
    if (choosing?.tile.tile === tile.tile && choosing.shut === shut.join()) layGhost(choosing, tile);
    else {
      if (choosing) dropGhost(choosing);
      choosing = ghostOf(tile, shut);
    }
  };
  /** A room just placed or moved shows as a ghost until it is baked and shows itself. */
  const settle = (id: string) => {
    const old = settling.get(id);
    if (old) dropGhost(old);
    const tile = tileOf(id);
    const ghost = ghostOf({ ...tile }, closedDoors(layout, CATALOG, tile));
    settling.set(id, ghost);
    void (shownWhen.get(id) ?? Promise.resolve()).then(() => {
      if (settling.get(id) !== ghost) return;
      dropGhost(ghost);
      settling.delete(id);
    });
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

  const corners = () => rooms().filter((room) => shows(room.floor)).flatMap((room) => tileCorners(room.centre));
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
    showFloor,
    cellCentre,
    corners,
    setCutaway: (cameraDirection, focus) => {
      const camera = { x: cameraDirection.x, z: cameraDirection.y };
      if (viewedFrom?.x !== camera.x || viewedFrom.z !== camera.z || viewFocus !== focus) {
        viewedFrom = camera;
        viewFocus = focus;
        for (const ghost of ghosts()) cutGhost(ghost);
      }
      const cuts = layout.tiles.map((tile) => EDGES.filter((direction) => wallIsCut(layout, tile, direction, camera, focus)).map((direction) => printedEdge(direction, tile.rotation)));
      const key = JSON.stringify(cuts);
      if (key === lastCut) return;
      lastCut = key;
      for (const [i, tile] of layout.tiles.entries()) {
        const lit = lighting.get(tile.floor)?.rooms.get(tile.tile);
        lit?.setCut((edge) => cuts[i].includes(edge));
      }
    },
    update: (seconds) => {
      for (const lit of lighting.values()) lit.update(seconds);
      for (const walker of walkers.values()) poseWalker(walker, seconds);
      for (const ghost of ghosts()) ghost.room.update(seconds);
      ghostLook.fade.value = 1 - (1 - GHOST_LOOK.low) * (0.5 - 0.5 * Math.cos((seconds * Math.PI * 2) / GHOST_LOOK.period));
      if (active) activeLight.position.copy(active.holder.position).add(EXPLORER_LIGHT_OFFSET);
      const pulse = 0.5 + 0.5 * Math.sin(seconds * 3);
      focusFill.opacity = 0.1 + 0.1 * pulse;
      focusBorder.opacity = 0.7 + 0.3 * pulse;
    },
    lighting,
    bakes,
    rebake: (room) => {
      const tile = tileOf(room);
      placements.set(room, placement(tile));
      return track(placeFloor(tile.floor));
    },
    scenePoint,
    spot,
    roomHeading: (room) => tileTurn(tileOf(room).rotation),
    addFigure: (figure, at, heading) => {
      if (walkers.has(figure.id)) throw new Error(`The house already has a figure "${figure.id}"`);
      const walker: Walker = { holder: group(), probe: { value: [] }, animations: [], at, heading, walk: null, walking: ADULT_WALK };
      const { marked: built, walking } = marked(figure, (seconds) => (walker.walk ? walkPose(walker.walk, seconds, walker.walking.step).stride : { phase: 0, amount: 0 }));
      walker.walking = walking;
      built.traverse((object) => {
        const animation = animationOf(object);
        if (animation) walker.animations.push(animation);
      });
      walker.probe = patchProbe(built);
      walker.holder.add(built);
      walker.holder.visible = shows(at.floor);
      root.add(walker.holder);
      walkers.set(figure.id, walker);
      void track(texturesUnder(built));
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
      active = id === null ? null : walkerOf(id);
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
    fog,
    background: fog.color.clone(),
    ready,
    dispose: () => {
      clearMarks();
      for (const ghost of ghosts()) dropGhost(ghost);
      for (const lit of lighting.values()) lit.dispose();
      disposeTree(root);
      dotGeometry.dispose();
    },
  };
}
