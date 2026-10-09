import * as THREE from "three";
import { EDGES, FLOORS, type Layout } from "../engine/board";
import { CATALOG } from "../data";
import type { FloorId } from "../types";
import { animationOf, type Animation } from "./animate";
import type { Stride } from "./explorers/figure";
import { doorways, printedEdge, tileTurn, wallIsCut } from "./house-layout";
import { inHouse, walkLength, walkPose, type HousePoint, type Walk } from "./house-walk";
import { paletteHex, type PaletteKey } from "./palette";
import { TILE, WALL_HEIGHT, type Mood, type RoomDefinition } from "./room";
import { BENCH_ROOMS } from "./rooms";
import { box, glow, group, lightMaterial } from "./shapes";
import { buildRoom, disposeTree, sceneLight, type ExplorerBuilder, type RoomPart } from "./stage";
import { plaster, textureReady, woodPlanks } from "./textures";

/** The whole house shares one fill, one moon and one fog: three.js lights
 *  every mesh with every light, so a room can't keep a mood of its own. */
export const HOUSE_MOOD: Mood = {
  ambient: 0.45,
  ambientColour: "moon",
  moon: 1.2,
  fog: { colour: "soot", density: 0.4 },
};
/** Where the house's moon shines from, relative to what it lights: high in
 *  the sky beyond the bottom-right corner of the board. */
const MOON_FROM = new THREE.Vector3(6, 9.2, 5.6);
/** How far apart the floors are stacked when the whole house shows at once:
 *  far enough apart that one floor never hides the one below. */
export const STACK_GAP = 7;
/** The explorer marker: a ring of the player's colour round the base. */
const RING = { inner: 0.4, outer: 0.55, height: 0.03 };
/** A second explorer in a room stands this far from the pawn spot, towards the middle of the room. */
const MAKE_ROOM = 0.9;
/** How high a walking miniature hops off the floor at each step. */
const HOP = 0.04;
/** A room offered as a choice glows on its floor: a fill, and a border just inside its walls. */
const MARK = { inset: 0.35, border: 0.12, height: 0.04 };
/** A stair offered as a choice glows along its run: a band this wide, edged with rails. */
const STAIR_MARK = { width: 1.1, rail: 0.1, lift: 0.06 };
/** The route preview: a dot every `every` metres, kept clear of where the walk starts and ends. */
const ROUTE = { every: 0.5, size: 0.14, clear: 0.6 };

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
  part: RoomPart;
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
  /** Shadows are drawn only on demand: call this when something that casts
   *  one has moved for good (an explorer stepping into another room). */
  redrawShadows: () => void;
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

/** A plain room for a tile with no art yet: bare boards and plaster, its doors
 *  and windows from the tile data, and nothing in it. */
export function shellRoom(id: string): RoomDefinition {
  return {
    id,
    floor: () => woodPlanks({ seed: id }),
    wall: () => plaster({ seed: id }),
    trim: "woodDark",
    props: [],
    mood: HOUSE_MOOD,
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

/** An explorer with their player's colour round the base, lit and shadowed
 *  as a room's own pieces are. */
function marked({ id, build, colour }: HouseExplorer, gait: (seconds: number) => Stride): THREE.Group {
  const ring = new THREE.Mesh(new THREE.RingGeometry(RING.inner, RING.outer, 24), glow(colour));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = RING.height;
  ring.userData.noShadow = true;
  const figure = group(build(`${id}:explorer`, gait), ring);
  figure.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const unlit = object.material instanceof THREE.MeshBasicMaterial;
    object.castShadow = !unlit && !(object.userData as { noShadow?: boolean }).noShadow;
    object.receiveShadow = !unlit;
  });
  return figure;
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
  animations: Animation[];
  at: HousePoint;
  heading: number;
  walk: Walk | null;
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
export function buildHouse(layout: Layout, explorers: HouseExplorer[] = []): House {
  const root = group();
  const floors = FLOORS.filter((floor) => layout.tiles.some((tile) => tile.floor === floor));
  const levels = new Map(floors.map((floor) => [floor, group()] as const));
  const level = (floor: FloorId) => (FLOORS.indexOf(floor) - FLOORS.indexOf("ground")) * STACK_GAP;

  const rooms: PlacedRoom[] = layout.tiles.map((tile) => {
    const shut = doorways(layout, CATALOG, tile).flatMap(({ edge, doorway }) => (doorway === "blind" ? [edge] : []));
    const part = buildRoom(definition(tile.tile), { explorer: null, closedDoors: shut });
    part.root.position.set(tile.x * TILE, 0, tile.y * TILE);
    part.root.rotation.y = tileTurn(tile.rotation);
    levels.get(tile.floor)?.add(part.root);
    return { id: tile.tile, floor: tile.floor, part, centre: new THREE.Vector3(tile.x * TILE, level(tile.floor), tile.y * TILE) };
  });
  for (const [floor, holder] of levels) {
    holder.position.y = level(floor);
    root.add(holder);
  }

  const { fill, moon } = sceneLight(HOUSE_MOOD, MOON_FROM, { mapSize: 2048 });
  root.add(fill, moon, moon.target);

  /*
   * Redrawing every shadow every frame (six views of the scene per candle,
   * one for the moon) cost most of the frame, and no light moves: shadows are
   * drawn when the house is built and again only when what casts them
   * changes. The cost: an animated piece's shadow stands still.
   */
  const shadowed = [moon, ...rooms.flatMap((room) => room.part.lights)];
  for (const light of shadowed) light.shadow.autoUpdate = false;
  const redrawShadows = () => {
    for (const light of shadowed) light.shadow.needsUpdate = true;
  };
  /** A walker's shadow is redrawn only where it can fall: the moon's, and
   *  those of the lights that reach it. A light it has just walked out of is
   *  redrawn once more, to clear the shadow it left there. */
  const lit = new Set<(typeof shadowed)[number]>();
  const redrawAround = (points: THREE.Vector3[]) => {
    moon.shadow.needsUpdate = true;
    const reaching = new Set(
      shadowed.filter((light) => light instanceof THREE.PointLight && points.some((point) => light.getWorldPosition(new THREE.Vector3()).distanceTo(point) < light.distance + 1)),
    );
    for (const light of new Set([...lit, ...reaching])) light.shadow.needsUpdate = true;
    lit.clear();
    for (const light of reaching) lit.add(light);
  };

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
    const walker: Walker = { holder: group(), animations: [], at: spot(explorer.room, 0), heading: tileTurn(tileOf(explorer.room).rotation), walk: null };
    const figure = marked(explorer, (seconds) => (walker.walk ? walkPose(walker.walk, seconds).stride : { phase: 0, amount: 0 }));
    figure.traverse((object) => {
      const animation = animationOf(object);
      if (animation) walker.animations.push(animation);
    });
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
      const pose = walkPose(walker.walk, seconds);
      walker.at = pose.point;
      walker.heading = pose.heading;
      hop = Math.abs(Math.sin(pose.stride.phase)) * HOP * pose.stride.amount;
    }
    walker.holder.position.copy(scenePoint(walker.at));
    walker.holder.position.y += hop;
    walker.holder.rotation.y = walker.heading;
    walker.holder.visible = shows(walker.at.floor);
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

  const route = group();
  root.add(route);
  const dotGeometry = new THREE.BoxGeometry(ROUTE.size, 0.015, ROUTE.size);
  const dotMaterial = glowing("flame", 0.9);
  let routeShown: HousePoint[] = [];
  const placeRoute = () => {
    route.clear();
    for (const dot of routeShown) {
      if (!shows(dot.floor)) continue;
      const mesh = new THREE.Mesh(dotGeometry, dotMaterial);
      mesh.position.copy(scenePoint(dot));
      mesh.position.y += MARK.height;
      route.add(mesh);
    }
  };

  const corners = () => rooms.filter((room) => shows(room.floor)).flatMap((room) => tileCorners(room.centre));
  /** The moon's shadow follows what is showing, so its map is spent there. */
  const aimMoon = () => {
    const sphere = new THREE.Sphere().setFromPoints(corners());
    moon.target.position.copy(sphere.center);
    moon.position.copy(sphere.center).add(MOON_FROM);
    const camera = moon.shadow.camera;
    Object.assign(camera, { left: -sphere.radius, right: sphere.radius, top: sphere.radius, bottom: -sphere.radius, far: MOON_FROM.length() + sphere.radius * 2 });
    camera.updateProjectionMatrix();
    redrawShadows();
  };
  const showFloor = (floor: FloorId | "all") => {
    showing = floor;
    for (const [id, holder] of levels) holder.visible = shows(id);
    for (const walker of walkers.values()) walker.holder.visible = shows(walker.at.floor);
    placeRoute();
    aimMoon();
  };
  showFloor(floors.includes("ground") ? "ground" : floors[0]);

  let lastCut = "";
  const ready = Promise.all([...rooms.map((room) => room.part.ready), texturesUnder(root)]).then(redrawShadows);

  const fogColour = paletteHex(HOUSE_MOOD.fog.colour);
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
      for (const [i, cut] of cuts.entries()) rooms[i].part.cutWalls((edge) => cut.includes(edge));
      // Hung props come and go with their walls, and they cast shadows.
      redrawShadows();
    },
    update: (seconds) => {
      for (const room of rooms) room.part.update(seconds);
      for (const walker of walkers.values()) poseWalker(walker, seconds);
      if (active) activeLight.position.copy(active.holder.position).add(new THREE.Vector3(0, 2.4, 0.3));
      const pulse = 0.5 + 0.5 * Math.sin(seconds * 3);
      focusFill.opacity = 0.1 + 0.1 * pulse;
      focusBorder.opacity = 0.7 + 0.3 * pulse;
      // An explorer walking through the house takes its shadow with it.
      const moving = [...walkers.values()].filter((walker) => walker.walk && walker.holder.visible).map((walker) => walker.holder.position);
      if (moving.length > 0 || lit.size > 0) redrawAround(moving);
    },
    redrawShadows,
    scenePoint,
    spot,
    stand: (id, point, heading) => {
      const walker = walkerOf(id);
      walker.walk = null;
      walker.at = point;
      if (heading !== undefined) walker.heading = heading;
      redrawShadows();
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
    fog: new THREE.Fog(fogColour, 1, 100),
    background: new THREE.Color(fogColour),
    ready,
    dispose: () => {
      disposeTree(root);
      dotGeometry.dispose();
    },
  };
}
