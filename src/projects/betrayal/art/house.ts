import * as THREE from "three";
import { EDGES, FLOORS, type Layout } from "../engine/board";
import { CATALOG } from "../data";
import type { FloorId } from "../types";
import { doorways, printedEdge, tileTurn, wallIsCut } from "./house-layout";
import { paletteHex, type PaletteKey } from "./palette";
import { TILE, WALL_HEIGHT, type Mood, type RoomDefinition } from "./room";
import { BENCH_ROOMS } from "./rooms";
import { glow, group } from "./shapes";
import { buildRoom, disposeTree, sceneLight, type ExplorerBuilder, type RoomPart } from "./stage";
import { plaster, woodPlanks } from "./textures";

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

export interface HouseExplorer {
  /** The room the explorer stands in, at its pawn spot. */
  room: string;
  build: ExplorerBuilder;
  colour: PaletteKey;
  /** The explorer whose turn it is, picked out by a soft light. */
  active: boolean;
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

function definition(id: string): RoomDefinition {
  return BENCH_ROOMS.find((room) => room.id === id) ?? shellRoom(id);
}

/** An explorer with their player's colour round the base and, when it is
 *  their turn, a soft light over them. */
function marked({ build, colour, active }: HouseExplorer): ExplorerBuilder {
  return (seed) => {
    const ring = new THREE.Mesh(new THREE.RingGeometry(RING.inner, RING.outer, 24), glow(colour));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = RING.height;
    ring.userData.noShadow = true;
    const figure = group(build(seed), ring);
    if (active) {
      const light = new THREE.PointLight(paletteHex("boneLight"), 2.5, 3.5, 2);
      light.position.set(0, 2.4, 0.3);
      figure.add(light);
    }
    return figure;
  };
}

/** Every placed room of an engine layout, each built in its own frame and laid
 *  at its cell and rotation, on its floor. */
export function buildHouse(layout: Layout, explorers: HouseExplorer[] = []): House {
  const root = group();
  const floors = FLOORS.filter((floor) => layout.tiles.some((tile) => tile.floor === floor));
  const levels = new Map(floors.map((floor) => [floor, group()] as const));
  const level = (floor: FloorId) => (FLOORS.indexOf(floor) - FLOORS.indexOf("ground")) * STACK_GAP;

  const rooms: PlacedRoom[] = layout.tiles.map((tile) => {
    const standing = explorers.find((explorer) => explorer.room === tile.tile);
    const shut = doorways(layout, CATALOG, tile).flatMap(({ edge, doorway }) => (doorway === "blind" ? [edge] : []));
    const part = buildRoom(definition(tile.tile), { explorer: standing ? marked(standing) : null, closedDoors: shut });
    part.root.position.set(tile.x * TILE, 0, tile.y * TILE);
    part.root.rotation.y = tileTurn(tile.rotation);
    levels.get(tile.floor)?.add(part.root);
    return { id: tile.tile, floor: tile.floor, part, centre: new THREE.Vector3(tile.x * TILE, level(tile.floor), tile.y * TILE) };
  });
  for (const [floor, holder] of levels) {
    holder.position.y = level(floor);
    root.add(holder);
  }
  for (const explorer of explorers) {
    if (!rooms.some((room) => room.id === explorer.room && room.part.explorer)) {
      throw new Error(`No room in the house for the explorer in ${explorer.room}`);
    }
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

  let showing: FloorId | "all" = "ground";
  const corners = () => rooms.filter((room) => showing === "all" || room.floor === showing).flatMap((room) => tileCorners(room.centre));
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
    for (const [id, holder] of levels) holder.visible = floor === "all" || floor === id;
    aimMoon();
  };
  showFloor(floors.includes("ground") ? "ground" : floors[0]);

  let lastCut = "";
  const ready = Promise.all(rooms.map((room) => room.part.ready)).then(redrawShadows);

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
    },
    redrawShadows,
    fog: new THREE.Fog(fogColour, 1, 100),
    background: new THREE.Color(fogColour),
    ready,
    dispose: () => disposeTree(root),
  };
}

