import * as THREE from "three";
import { ROOMS } from "../data/rooms";
import type { Edge, RoomTile } from "../types";
import { animationOf, type Animation } from "./animate";
import { pawn } from "./kit/pawn";
import { anchoredLight } from "./light-anchor";
import { paletteHex } from "./palette";
import {
  CUT_HEIGHT,
  DOOR_HEIGHT,
  DOOR_WIDTH,
  TILE,
  WAINSCOT_DEPTH,
  WAINSCOT_HEIGHT,
  WALL_HEIGHT,
  WALL_THICKNESS,
  WINDOW_SILL,
  WINDOW_TOP,
  WINDOW_WIDTH,
  wallTurn,
  type LightSpec,
  type RoomDefinition,
} from "./room";
import { box, flat, glow, group, textured } from "./shapes";
import { pixelTexture, textureReady } from "./textures";

const EDGES: Edge[] = ["top", "right", "bottom", "left"];
const MAX_LIGHTS = 8;
const MAX_SHADOW_LIGHTS = 2;
/** Draws nothing but stays in the shadow pass. Full walls the camera has cut
 *  away wear it, so the light doesn't change as the camera orbits; so does the
 *  unseen ceiling, so moonlight only gets in through the windows. */
const SHADOW_ONLY = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });

/** Which way each edge's wall faces out of the room. */
const OUTWARD: Record<Edge, THREE.Vector2> = {
  top: new THREE.Vector2(0, -1),
  right: new THREE.Vector2(1, 0),
  bottom: new THREE.Vector2(0, 1),
  left: new THREE.Vector2(-1, 0),
};

interface Opening {
  kind: "door" | "window";
  centre: number;
  width: number;
  bottom: number;
  top: number;
}

/** A solid rectangle of wall in the wall's own plane: x along it, y up. */
interface Span {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export interface Stage {
  root: THREE.Group;
  fog: THREE.Fog;
  background: THREE.Color;
  /** Cut down the walls between the camera and the room, for a camera looking from this horizontal direction. */
  setCutaway: (cameraDirection: THREE.Vector2) => void;
  /** Poses everything that moves (flickering lights, animated pieces) for this moment. */
  update: (seconds: number) => void;
  /** The explorer standing where the room puts its pawn, if it has a place for one. */
  explorer: THREE.Object3D | null;
  /** Resolves once every texture has its pixels (SVG decals decode asynchronously). */
  ready: Promise<void>;
  dispose: () => void;
}

export function roomTile(id: string): RoomTile {
  const tile = ROOMS.find((room) => room.id === id);
  if (!tile) throw new Error(`No room tile with id "${id}"`);
  return tile;
}

function openings(tile: RoomTile, edge: Edge): Opening[] {
  const result: Opening[] = [];
  const door = tile.doors.includes(edge);
  if (door) result.push({ kind: "door", centre: 0, width: DOOR_WIDTH, bottom: 0, top: DOOR_HEIGHT });
  if (tile.windows.includes(edge)) {
    result.push({ kind: "window", centre: door ? 1.7 : 0, width: WINDOW_WIDTH, bottom: WINDOW_SILL, top: WINDOW_TOP });
  }
  return result.sort((a, b) => a.centre - b.centre);
}

function spans(length: number, holes: Opening[], height: number): Span[] {
  const result: Span[] = [];
  let x = -length / 2;
  for (const hole of holes) {
    const left = hole.centre - hole.width / 2;
    const right = hole.centre + hole.width / 2;
    result.push({ x0: x, x1: left, y0: 0, y1: height });
    if (hole.bottom > 0) result.push({ x0: left, x1: right, y0: 0, y1: Math.min(hole.bottom, height) });
    if (hole.top < height) result.push({ x0: left, x1: right, y0: hole.top, y1: height });
    x = right;
  }
  result.push({ x0: x, x1: length / 2, y0: 0, y1: height });
  return result;
}

interface WallParts {
  wall: THREE.Material[];
  wainscot: THREE.Material | null;
  trim: THREE.Material;
}

const LEADED_GLASS = leadedGlass();
function leadedGlass(): string[] {
  const rows: string[] = [];
  for (let y = 0; y < 48; y++) {
    let row = "";
    for (let x = 0; x < 32; x++) {
      const lead = x % 8 === 0 || y % 12 === 0 || (x + y) % 16 === 0 || (x - y + 64) % 16 === 0;
      const glint = !lead && (x * 7 + y * 13) % 29 === 0;
      row += lead ? "l" : glint ? "g" : y < 24 ? "m" : "d";
    }
    rows.push(row);
  }
  return rows;
}

/** One wall, built along x with its inner face towards +z, at a given height. */
function buildWall(length: number, holes: Opening[], height: number, parts: WallParts): THREE.Group {
  const wall = group();
  const half = WALL_THICKNESS / 2;
  const face = half;
  const casing = 0.1;
  const doorEdges = holes.filter((hole) => hole.kind === "door").flatMap((hole) => [hole.centre - hole.width / 2, hole.centre + hole.width / 2]);
  /** Panelling and skirting stop under a door's casing: ending flush with the
   *  opening, their end faces would lie in the plane of the casing's inner
   *  face and fight it. */
  const underCasing = (x: number) => (doorEdges.some((edge) => Math.abs(edge - x) < 1e-6) ? casing : 0);
  for (const span of spans(length, holes, height)) {
    const w = span.x1 - span.x0;
    const h = span.y1 - span.y0;
    if (w <= 0.001 || h <= 0.001) continue;
    const cx = (span.x0 + span.x1) / 2;
    wall.add(box([w, h, WALL_THICKNESS], parts.wall, [cx, span.y0, 0]));
    if (span.y0 === 0) {
      const x0 = span.x0 + underCasing(span.x0);
      const x1 = span.x1 - underCasing(span.x1);
      const dressed = x1 - x0;
      const dx = (x0 + x1) / 2;
      if (parts.wainscot) {
        const panel = Math.min(WAINSCOT_HEIGHT, span.y1);
        wall.add(box([dressed, panel, WAINSCOT_DEPTH], parts.wainscot, [dx, 0, face + WAINSCOT_DEPTH / 2]));
        if (span.y1 > WAINSCOT_HEIGHT) wall.add(box([dressed, 0.05, 0.05], parts.trim, [dx, WAINSCOT_HEIGHT - 0.03, face + 0.025]));
      }
      wall.add(box([dressed, Math.min(0.16, span.y1), 0.05], parts.trim, [dx, 0, face + 0.025]));
    }
    if (span.y1 === WALL_HEIGHT) {
      wall.add(box([w, 0.12, 0.06], parts.trim, [cx, WALL_HEIGHT - 0.12, face + 0.03]));
    }
  }
  for (const hole of holes) {
    const left = hole.centre - hole.width / 2;
    const right = hole.centre + hole.width / 2;
    const jambTop = Math.min(hole.top + casing, height);
    const jambBottom = hole.bottom > 0 ? hole.bottom - casing / 2 : 0;
    if (jambTop > jambBottom) {
      for (const x of [left - casing / 2, right + casing / 2]) {
        wall.add(box([casing, jambTop - jambBottom, 0.07], parts.trim, [x, jambBottom, face + 0.035]));
      }
    }
    if (hole.top + casing <= height) {
      wall.add(box([hole.width + casing * 2, casing, 0.07], parts.trim, [hole.centre, hole.top, face + 0.035]));
    }
    if (hole.kind === "window" && hole.bottom <= height) {
      // The sill stands a little above the wall it rests on, so their tops don't share a plane and fight.
      wall.add(box([hole.width + casing * 2, 0.05, WALL_THICKNESS + 0.1], parts.trim, [hole.centre, hole.bottom - 0.04, 0.05]));
      const glassTop = Math.min(hole.top, height);
      if (glassTop > hole.bottom) {
        const pane = new THREE.Mesh(new THREE.PlaneGeometry(hole.width, glassTop - hole.bottom), glow("moon", pixelTexture(LEADED_GLASS, { l: "soot", m: "moon", d: "moonDark", g: "moonLight" })));
        pane.position.set(hole.centre, (hole.bottom + glassTop) / 2, -half + 0.02);
        pane.userData.noShadow = true;
        wall.add(pane);
        wall.add(box([0.05, glassTop - hole.bottom, 0.05], parts.trim, [hole.centre, hole.bottom, 0]));
        for (const y of [hole.bottom + (glassTop - hole.bottom) * 0.4, hole.bottom + (glassTop - hole.bottom) * 0.75]) {
          if (y < glassTop) wall.add(box([hole.width, 0.04, 0.05], parts.trim, [hole.centre, y, 0]));
        }
      }
    }
  }
  return wall;
}

function edgeLength(edge: Edge): number {
  return edge === "top" || edge === "bottom" ? TILE : TILE - WALL_THICKNESS * 2;
}

function placeOnEdge(object: THREE.Object3D, edge: Edge): THREE.Group {
  object.position.z = -(TILE / 2 - WALL_THICKNESS / 2);
  const holder = group(object);
  holder.rotation.y = THREE.MathUtils.degToRad(wallTurn(edge));
  return holder;
}

function setShadowOnly(object: THREE.Object3D, shadowOnly: boolean) {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const data = child.userData as { material?: THREE.Material | THREE.Material[] };
    data.material ??= child.material as THREE.Material | THREE.Material[];
    child.material = shadowOnly ? SHADOW_ONLY : data.material;
  });
}

function flickerAt(seconds: number, phase: number): number {
  return (
    0.5 * Math.sin(seconds * 7.3 + phase) +
    0.3 * Math.sin(seconds * 13.1 + phase * 2.1) +
    0.2 * Math.sin(seconds * 23.7 + phase * 3.7)
  );
}

interface LiveLight {
  light: THREE.PointLight;
  base: number;
  flicker: number;
  phase: number;
}

function pointLight(spec: Omit<LightSpec, "at">): THREE.PointLight {
  const light = new THREE.PointLight(paletteHex(spec.colour), spec.intensity, spec.range, 2);
  if (spec.shadow) {
    light.castShadow = true;
    light.shadow.mapSize.set(256, 256);
    light.shadow.camera.near = 0.05;
    light.shadow.bias = -0.004;
  }
  return light;
}

/**
 * Where the room's moon stands; it shines towards the centre of the floor. The
 * moonlight's direction is the reverse of this, so a piece built to line up
 * with it (a shaft of light through a window) follows the stage's own moon.
 */
export function moonPosition(def: RoomDefinition): THREE.Vector3 {
  const outward = OUTWARD[def.mood.moonFrom ?? roomTile(def.id).windows.at(0) ?? "top"];
  const elevation = THREE.MathUtils.degToRad(50);
  return new THREE.Vector3(
    outward.x * Math.cos(elevation) * 12 + 1,
    Math.sin(elevation) * 12,
    outward.y * Math.cos(elevation) * 12 + 0.6,
  );
}

/** Builds an explorer figure. The seed gives each figure its own phase, so
 *  several in one room never move in step. */
export type ExplorerBuilder = (seed: string) => THREE.Object3D;

export interface StageOptions {
  /** Who stands at the room's pawn spot; the scale pawn unless told otherwise. */
  explorer?: ExplorerBuilder;
}

export function buildRoomStage(def: RoomDefinition, { explorer: buildExplorer = () => pawn() }: StageOptions = {}): Stage {
  const tile = roomTile(def.id);
  const root = group();
  const wallTexture = def.wall();
  const wallMaterial = textured(wallTexture);
  const cap = flat("soot");
  const parts: WallParts = {
    wall: [wallMaterial, wallMaterial, cap, cap, wallMaterial, wallMaterial],
    wainscot: def.wainscot ? textured(def.wainscot()) : null,
    trim: flat(def.trim),
  };

  const floorMaterial = textured(def.floor());
  const slab = flat("sootLight");
  root.add(box([TILE, 0.2, TILE], [slab, slab, floorMaterial, slab, slab, slab], [0, -0.2, 0]));

  const ceiling = box([TILE, 0.1, TILE], SHADOW_ONLY, [0, WALL_HEIGHT, 0]);
  ceiling.userData.shadowOnly = true;
  root.add(ceiling);

  const walls: { edge: Edge; full: THREE.Group; cut: THREE.Group }[] = [];
  for (const edge of EDGES) {
    if (tile.passages.includes(edge)) continue;
    const holes = openings(tile, edge);
    const full = placeOnEdge(buildWall(edgeLength(edge), holes, WALL_HEIGHT, parts), edge);
    const cut = placeOnEdge(buildWall(edgeLength(edge), holes, CUT_HEIGHT, parts), edge);
    root.add(full, cut);
    walls.push({ edge, full, cut });
  }

  const hung: { edges: Edge[]; object: THREE.Object3D }[] = [];
  for (const prop of def.props) {
    const object = prop.build();
    object.position.set(prop.at[0], prop.y ?? 0, prop.at[1]);
    object.rotation.y = THREE.MathUtils.degToRad(prop.turn ?? 0);
    root.add(object);
    if (prop.walls && (prop.y ?? 0) >= CUT_HEIGHT) hung.push({ edges: prop.walls, object });
  }

  let explorer: THREE.Object3D | null = null;
  if (def.pawn) {
    explorer = buildExplorer(`${def.id}:explorer`);
    explorer.position.set(def.pawn[0], 0, def.pawn[1]);
    root.add(explorer);
  }

  const { mood } = def;
  root.add(new THREE.HemisphereLight(paletteHex(mood.ambientColour), paletteHex("void"), mood.ambient * 6));

  const moon = new THREE.DirectionalLight(paletteHex("moonLight"), mood.moon * 6);
  moon.position.copy(moonPosition(def));
  moon.castShadow = true;
  moon.shadow.mapSize.set(1024, 1024);
  Object.assign(moon.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 30 });
  moon.shadow.camera.updateProjectionMatrix();
  moon.shadow.bias = -0.0015;
  root.add(moon, moon.target);

  const live: LiveLight[] = [];
  const addLight = (spec: Omit<LightSpec, "at">, position: THREE.Vector3) => {
    const light = pointLight(spec);
    light.position.copy(position);
    root.add(light);
    live.push({ light, base: spec.intensity, flicker: spec.flicker ?? 0, phase: live.length * 1.9 });
  };
  root.updateMatrixWorld(true);
  const anchors: THREE.Object3D[] = [];
  const animations: Animation[] = [];
  root.traverse((object) => {
    if (anchoredLight(object)) anchors.push(object);
    const animation = animationOf(object);
    if (animation) animations.push(animation);
  });
  for (const anchor of anchors) {
    const spec = anchoredLight(anchor);
    if (spec) addLight(spec, anchor.getWorldPosition(new THREE.Vector3()));
  }
  for (const spec of def.lights ?? []) addLight(spec, new THREE.Vector3(...spec.at));
  if (live.length > MAX_LIGHTS) throw new Error(`${def.id} has ${live.length} lights; the most a room may have is ${MAX_LIGHTS}`);
  const shadowed = live.filter(({ light }) => light.castShadow).length;
  if (shadowed > MAX_SHADOW_LIGHTS) {
    throw new Error(`${def.id} has ${shadowed} shadow-casting lights; the most a room may have is ${MAX_SHADOW_LIGHTS}`);
  }

  const textures = new Set<THREE.Texture>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = (Array.isArray(object.material) ? object.material : [object.material]) as THREE.Material[];
    const unlit = materials.every((material) => material instanceof THREE.MeshBasicMaterial);
    const data = object.userData as { noShadow?: boolean; shadowOnly?: boolean };
    object.castShadow = data.shadowOnly === true || (!unlit && !data.noShadow);
    object.receiveShadow = !unlit;
    for (const material of materials) {
      if ("map" in material && material.map instanceof THREE.Texture) textures.add(material.map);
    }
  });
  const ready = Promise.all([...textures].map(textureReady)).then(() => undefined);

  const fogColour = paletteHex(mood.fog.colour);

  return {
    root,
    fog: new THREE.Fog(fogColour, 1, 100),
    background: new THREE.Color(fogColour),
    setCutaway: (cameraDirection) => {
      for (const { edge, full, cut } of walls) {
        const facing = OUTWARD[edge].dot(cameraDirection) > 0.01;
        setShadowOnly(full, facing);
        cut.visible = facing;
      }
      for (const { edges, object } of hung) {
        object.visible = edges.every((edge) => OUTWARD[edge].dot(cameraDirection) <= 0.01);
      }
    },
    update: (seconds) => {
      for (const { light, base, flicker, phase } of live) {
        light.intensity = base * (1 + flicker * flickerAt(seconds, phase));
      }
      for (const animation of animations) animation(seconds);
    },
    explorer,
    ready,
    dispose: () => {
      root.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const own = (object.userData as { material?: THREE.Material | THREE.Material[] }).material ?? object.material;
          for (const material of (Array.isArray(own) ? own : [own]) as THREE.Material[]) {
            if (material !== SHADOW_ONLY) material.dispose();
          }
        }
        if (object instanceof THREE.Light) object.dispose();
      });
    },
  };
}
