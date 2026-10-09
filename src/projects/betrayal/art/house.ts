import * as THREE from "three";
import { EDGES, FLOORS, type Layout } from "../engine/board";
import { CATALOG } from "../data";
import type { FloorId } from "../types";
import { animationOf, type Animation } from "./animate";
import { ADULT_WALK, hopHeight, walkingOf, type Stride, type Walking } from "./explorers/figure";
import { doorways, printedEdge, tileTurn, wallIsCut } from "./house-layout";
import { inHouse, walkLength, walkPose, type HousePoint, type Walk } from "./house-walk";
import { inlineBaker, type Baker } from "./bake";
import { freezeRoom, type FrozenRoom } from "./freeze";
import { fillLight, houseFog } from "./lighting";
import { createLitFloor, patchProbe, type LitFloor, type ProbeUniform, type Rebake } from "./lit-floor";
import { paletteHex, type PaletteKey } from "./palette";
import { TILE, WALL_HEIGHT, type RoomDefinition } from "./room";
import { BENCH_ROOMS } from "./rooms";
import { box, glow, group, lightMaterial } from "./shapes";
import { buildRoom, disposeTree, roomTile, type ExplorerBuilder } from "./stage";
import { earth, flagstones, plaster, textureReady, woodPlanks } from "./textures";
/** How far apart the floors are stacked when the whole house shows at once:
 *  far enough apart that one floor never hides the one below. */
export const STACK_GAP = 7;
/** The explorer marker: a ring of the player's colour round the base. */
const RING = { inner: 0.4, outer: 0.55, height: 0.03 };
/** A second explorer in a room stands this far from the pawn spot, towards the middle of the room. */
const MAKE_ROOM = 0.9;
/** A room offered as a choice glows on its floor: a fill, and a border just inside its walls. */
const MARK = { inset: 0.35, border: 0.12, height: 0.04 };
/** A stair offered as a choice glows along its run: a band this wide, edged with rails. */
const STAIR_MARK = { width: 1.1, rail: 0.1, lift: 0.06 };
/** The route preview: a dot every `every` metres, kept clear of where the walk starts and ends, at most `most` of them. */
const ROUTE = { every: 0.5, size: 0.14, clear: 0.6, most: 160 };

export interface HouseExplorer {
  id: string;
  /** The room the explorer starts in, at its pawn spot. */
  room: string;
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

export interface House {
  root: THREE.Group;
  rooms: PlacedRoom[];
  /** The floors that have rooms, bottom to top. */
  floors: FloorId[];
  /** Shows one floor, or every floor stacked apart. */
  showFloor: (floor: FloorId | "all") => void;
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
  /** Stands an explorer still at a point, facing `heading` (or as it last faced). */
  stand: (explorer: string, point: HousePoint, heading?: number) => void;
  /** Walks an explorer, posed from the clock at every update. */
  walk: (explorer: string, walk: Walk) => void;
  /** Where an explorer is now. */
  explorerAt: (explorer: string) => HousePoint;
  /** Picks out the explorer whose turn it is, with a soft light over them. */
  setActive: (explorer: string) => void;
  /** Lights up what a decision offers, on its floor: rooms by their id, and
   *  stairs by `stairMark`. The focused one glows clearly, the others softly. */
  markChoices: (marks: readonly string[], focused: string | null) => void;
  /** Dots along the path a walk would take, on the floors it crosses; null clears them. */
  showRoute: (path: readonly HousePoint[] | null) => void;
  fog: THREE.Fog;
  background: THREE.Color;
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

/** An explorer with their player's colour round the base, and how the figure walks. */
function marked({ id, build, colour }: HouseExplorer, gait: (seconds: number) => Stride): { marked: THREE.Group; walking: Walking } {
  const ring = new THREE.Mesh(new THREE.RingGeometry(RING.inner, RING.outer, 24), glow(colour));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = RING.height;
  const figure = build(`${id}:explorer`, gait);
  return { marked: group(figure, ring), walking: walkingOf(figure) };
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

/** The glow on a room's floor that marks it as a choice: a faint fill and a
 *  border just inside its walls. */
function choiceMark(fill: THREE.Material, border: THREE.Material): THREE.Group {
  const span = TILE - MARK.inset * 2;
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(span, span), fill);
  pane.rotation.x = -Math.PI / 2;
  pane.position.y = MARK.height - 0.01;
  const edge = (w: number, d: number, x: number, z: number) => box([w, 0.01, d], border, [x, MARK.height, z]);
  const off = span / 2 - MARK.border / 2;
  const mark = group(pane, edge(span, MARK.border, 0, -off), edge(span, MARK.border, 0, off), edge(MARK.border, span, -off, 0), edge(MARK.border, span, off, 0));
  mark.visible = false;
  return mark;
}

/** The mark of the stair that leads from one room to another it links to. */
export function stairMark(from: string, toward: string): string {
  return `stair:${from}>${toward}`;
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
  mark.visible = false;
  return mark;
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

/** Every placed room of an engine layout, each built in its own frame and laid
 *  at its cell and rotation, on its floor, and the explorers in it, who walk
 *  between rooms. */
export function buildHouse(layout: Layout, explorers: HouseExplorer[] = [], baker: Baker = inlineBaker()): House {
  const root = group();
  const floors = FLOORS.filter((floor) => layout.tiles.some((tile) => tile.floor === floor));
  const levels = new Map(floors.map((floor) => [floor, group()] as const));
  const level = (floor: FloorId) => (FLOORS.indexOf(floor) - FLOORS.indexOf("ground")) * STACK_GAP;

  /** A tile built, frozen and laid at its cell and rotation on its floor's frame. */
  const placement = (tile: Layout["tiles"][number]) => {
    const shut = doorways(layout, CATALOG, tile).flatMap(({ edge, doorway }) => (doorway === "blind" ? [edge] : []));
    const room = freezeRoom(tile.tile, buildRoom(definition(tile.tile), { explorer: null, closedDoors: shut }));
    const matrix = new THREE.Matrix4().compose(new THREE.Vector3(tile.x * TILE, 0, tile.y * TILE), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, tileTurn(tile.rotation), 0)), new THREE.Vector3(1, 1, 1));
    return { id: tile.tile, room, matrix };
  };
  const placements = new Map(layout.tiles.map((tile) => [tile.tile, placement(tile)] as const));
  const lighting = new Map(floors.map((floor) => [floor, createLitFloor(baker)] as const));
  const bakes = new Map<FloorId, Rebake>();
  const placeFloor = (floor: FloorId): Promise<Rebake> => {
    const lit = lighting.get(floor);
    if (!lit) throw new Error(`The house has no floor "${floor}"`);
    return lit.place(layout.tiles.filter((tile) => tile.floor === floor).map((tile) => placements.get(tile.tile)).filter((placed) => placed !== undefined));
  };
  const baked = Promise.all(
    floors.map(async (floor) => {
      const lit = lighting.get(floor);
      if (lit) levels.get(floor)?.add(lit.root);
      bakes.set(floor, await placeFloor(floor));
    }),
  );
  const rooms: PlacedRoom[] = layout.tiles.map((tile) => {
    const placed = placements.get(tile.tile);
    if (!placed) throw new Error(`${tile.tile} was not built`);
    return { id: tile.tile, floor: tile.floor, room: placed.room, centre: new THREE.Vector3(tile.x * TILE, level(tile.floor), tile.y * TILE) };
  });
  for (const [floor, holder] of levels) {
    holder.position.y = level(floor);
    root.add(holder);
  }
  root.add(fillLight());

  let showing: FloorId | "all" = "ground";
  const shows = (floor: FloorId) => showing === "all" || showing === floor;
  const scenePoint = (point: HousePoint) => new THREE.Vector3(point.x, point.y + level(point.floor), point.z);
  const tileOf = (room: string) => {
    const tile = layout.tiles.find((placed) => placed.tile === room);
    if (!tile) throw new Error(`The house has no room "${room}"`);
    return tile;
  };
  const spot = (room: string, slot: number): HousePoint => {
    const pawnSpot = definition(room).pawn;
    if (!pawnSpot) throw new Error(`${room} has no spot for an explorer to stand on`);
    const [x, z] = pawnSpot;
    const towardMiddle = Math.min((slot * MAKE_ROOM) / Math.max(Math.hypot(x, z), 1e-6), 1);
    return inHouse(layout, room, [x * (1 - towardMiddle), 0, z * (1 - towardMiddle)]);
  };

  const walkers = new Map<string, Walker>();
  for (const explorer of explorers) {
    const walker: Walker = {
      holder: group(),
      probe: { value: [] },
      animations: [],
      at: spot(explorer.room, 0),
      heading: tileTurn(tileOf(explorer.room).rotation),
      walk: null,
      walking: ADULT_WALK,
    };
    const { marked: figure, walking } = marked(explorer, (seconds) => (walker.walk ? walkPose(walker.walk, seconds, walker.walking.step).stride : { phase: 0, amount: 0 }));
    walker.walking = walking;
    figure.traverse((object) => {
      const animation = animationOf(object);
      if (animation) walker.animations.push(animation);
    });
    walker.probe = patchProbe(figure);
    walker.holder.add(figure);
    root.add(walker.holder);
    walkers.set(explorer.id, walker);
  }
  const walkerOf = (id: string) => {
    const walker = walkers.get(id);
    if (!walker) throw new Error(`The house has no explorer "${id}"`);
    return walker;
  };
  const poseWalker = (walker: Walker, seconds: number) => {
    let hop = 0;
    if (walker.walk) {
      const pose = walkPose(walker.walk, seconds, walker.walking.step);
      walker.at = pose.point;
      walker.heading = pose.heading;
      hop = hopHeight(walker.walking, pose.stride);
    }
    walker.holder.position.copy(scenePoint(walker.at));
    walker.holder.position.y += hop;
    walker.holder.rotation.y = walker.heading;
    walker.holder.visible = shows(walker.at.floor);
    lighting.get(walker.at.floor)?.probeAt(new THREE.Vector3(walker.at.x, walker.at.y, walker.at.z), walker.probe.value);
    for (const animation of walker.animations) animation(seconds);
  };
  /** One light follows whoever's turn it is, so the scene's count of lights
   *  never changes: a change recompiles every material. */
  const activeLight = new THREE.PointLight(paletteHex("boneLight"), 2.5, 3.5, 2);
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
  const marks = new Map<string, { soft: THREE.Group; focused: THREE.Group }>(
    rooms.map((room) => {
      const soft = choiceMark(softFill, softBorder);
      const focused = choiceMark(focusFill, focusBorder);
      // On the room's own floor, so they show and hide with it.
      for (const mark of [soft, focused]) {
        mark.position.set(room.centre.x, 0, room.centre.z);
        levels.get(room.floor)?.add(mark);
      }
      return [room.id, { soft, focused }] as const;
    }),
  );
  // Every stair run, laid with its room, for when the room it leads to is offered from this floor.
  for (const tile of layout.tiles) {
    for (const [toward, run] of Object.entries(definition(tile.tile).stairs ?? {})) {
      const [soft, focused] = [stairGlow(run, softFill, softBorder), stairGlow(run, focusFill, focusBorder)];
      for (const mark of [soft, focused]) {
        mark.position.set(tile.x * TILE, 0, tile.y * TILE);
        mark.rotation.y = tileTurn(tile.rotation);
        levels.get(tile.floor)?.add(mark);
      }
      marks.set(stairMark(tile.tile, toward), { soft, focused });
    }
  }

  // Every dot of the route is one instance, so the whole route is one draw call.
  const dotGeometry = new THREE.BoxGeometry(ROUTE.size, 0.015, ROUTE.size);
  const route = new THREE.InstancedMesh(dotGeometry, glowing("flame", 0.9), ROUTE.most);
  route.frustumCulled = false;
  root.add(route);
  let routeShown: HousePoint[] = [];
  const placeRoute = () => {
    const showing = routeShown.filter((dot) => shows(dot.floor));
    if (showing.length > ROUTE.most) throw new Error(`A route of ${showing.length} dots; the most is ${ROUTE.most}`);
    const place = new THREE.Matrix4();
    showing.forEach((dot, i) => {
      const at = scenePoint(dot);
      route.setMatrixAt(i, place.makeTranslation(at.x, at.y + MARK.height, at.z));
    });
    route.count = showing.length;
    route.instanceMatrix.needsUpdate = true;
  };

  const corners = () => rooms.filter((room) => shows(room.floor)).flatMap((room) => tileCorners(room.centre));
  const showFloor = (floor: FloorId | "all") => {
    showing = floor;
    for (const [id, holder] of levels) holder.visible = shows(id);
    for (const walker of walkers.values()) walker.holder.visible = shows(walker.at.floor);
    placeRoute();
  };
  showFloor(floors.includes("ground") ? "ground" : floors[0]);

  let lastCut = "";
  // Rooms join their floor once baked, so the walls are cut again then.
  const ready = Promise.all([...[...placements.values()].map(({ room }) => room.ready), texturesUnder(root), baked]).then(() => {
    lastCut = "";
  });

  const fog = houseFog();
  return {
    root,
    rooms,
    floors,
    showFloor,
    corners,
    setCutaway: (cameraDirection, focus) => {
      const camera = { x: cameraDirection.x, z: cameraDirection.y };
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
      if (active) activeLight.position.copy(active.holder.position).add(new THREE.Vector3(0, 2.4, 0.3));
      const pulse = 0.5 + 0.5 * Math.sin(seconds * 3);
      focusFill.opacity = 0.1 + 0.1 * pulse;
      focusBorder.opacity = 0.7 + 0.3 * pulse;
    },
    lighting,
    bakes,
    rebake: async (room) => {
      const tile = tileOf(room);
      const fresh = placement(tile);
      placements.set(room, fresh);
      const placed = rooms.find((candidate) => candidate.id === room);
      if (placed) placed.room = fresh.room;
      const rebake = await placeFloor(tile.floor);
      lastCut = "";
      return rebake;
    },
    scenePoint,
    spot,
    stand: (id, point, heading) => {
      const walker = walkerOf(id);
      walker.walk = null;
      walker.at = point;
      if (heading !== undefined) walker.heading = heading;
    },
    walk: (id, walk) => {
      walkerOf(id).walk = walk;
    },
    explorerAt: (id) => walkerOf(id).at,
    setActive: (id) => {
      active = walkerOf(id);
    },
    markChoices: (choices, focused) => {
      for (const [id, { soft, focused: lit }] of marks) {
        lit.visible = id === focused;
        soft.visible = id !== focused && choices.includes(id);
      }
    },
    showRoute: (path) => {
      routeShown = path ? routeDots(path) : [];
      placeRoute();
    },
    fog,
    background: fog.color.clone(),
    ready,
    dispose: () => {
      for (const lit of lighting.values()) lit.dispose();
      disposeTree(root);
      dotGeometry.dispose();
    },
  };
}
