import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { ThreeSceneContext, ThreeSceneHandlers } from "@/shared/lib/three/use-three-scene";
import { workerLanes } from "./bake-workers";
import { createBakeScheduler, type BakeScheduler } from "./bake-schedule";
import { freezeRoom } from "./freeze";
import { FIELD_OF_VIEW } from "./house-camera";
import { budgetGuard, EXPLORER_LIGHT_OFFSET, explorerLight, fillLight, HOUSE_LIGHT, type BakedLight } from "./lighting";
import { createLitFloor } from "./lit-floor";
import { paletteHex, type PaletteKey } from "./palette";
import { TILE, WALL_HEIGHT, type LampKind, type RoomDefinition } from "./room";
import { BENCH_ROOMS } from "./rooms";
import { box, flat, group, textured } from "./shapes";
import { shineOn, shiny, type Shine } from "./shine";
import { disposeTree, roomTile, type RoomPart } from "./stage";
import { texturesUnder } from "./textures";

/*
 * The shine bench (`?bench=shine`): every floor the built rooms lay, side by
 * side as swatches, under one light the page picks and moves. A room's shell
 * never shines (`shine.ts`), so the floors are matte: the bench shows how they
 * take each light, and tries a shine on all of them at once, to see a preset
 * on a flat surface under the house's own lighting.
 *
 * The swatches go through the house's own path: frozen and baked as a room is
 * (`freezeRoom`, `createLitFloor`), so a lamp's highlight is shown as far as
 * the bake says its light reaches, with its flicker signal, exactly as in the
 * house. The house's fill lights them too. Where it differs from a room: the
 * moon, when on, falls from the open sky (the house's moon, from its fixed
 * corner) rather than through a window, and when off an unseen ceiling stops
 * it in the bake, as a room's does; nothing stands round the swatches, so no
 * walls bounce light back onto them; and there is no fog.
 */

/** One swatch: a floor as rooms lay it, and the rooms that lay it. */
export interface Swatch {
  look: THREE.Texture;
  rooms: string[];
}

/** A light the bench can stand in the scene: a warm lamp, a candle, or a light of one of the colours with a meaning. */
export interface BenchLight {
  id: string;
  label: string;
  colour: PaletteKey;
  intensity: number;
  range: number;
  flicker: number;
  kind?: LampKind;
  /** How high it hangs by default, in metres. */
  height: number;
}

/** Lamps as rooms set them (the Entrance Hall's lamp, the Foyer's chandelier, the kit's candle) and one of each colour in the colour language. */
export const BENCH_LIGHTS: readonly BenchLight[] = [
  { id: "lamp", label: "Warm lamp", colour: "amber", intensity: 5, range: 7, flicker: 0.05, height: 1.45 },
  { id: "chandelier", label: "Chandelier", colour: "amber", intensity: 9, range: 10, flicker: 0.1, height: 2.2 },
  { id: "candle", label: "Candle", colour: "amber", intensity: 1.5, range: 4, flicker: 0.15, kind: "candle", height: 0.9 },
  { id: "teal", label: "Teal (haunting)", colour: "spectre", intensity: 7, range: 6, flicker: 0.15, height: 1.45 },
  { id: "green", label: "Green (corrupt)", colour: "wraithLight", intensity: 9, range: 8, flicker: 0.12, height: 1.45 },
  { id: "red", label: "Red (danger)", colour: "scarlet", intensity: 4.5, range: 6.5, flicker: 0, height: 1.45 },
  { id: "violet", label: "Violet (omen)", colour: "violet", intensity: 9, range: 8, flicker: 0.08, height: 1.45 },
  { id: "gold", label: "Gold (holy)", colour: "gold", intensity: 6, range: 8, flicker: 0.12, height: 1.45 },
];
/** No lamp: only the moon (when on), the fill, and the explorer's light. */
export const NO_LAMP = "none";

/** Camera tilts, in degrees above level: the game's start, and lower and higher ones within its range. */
export const TILTS = [
  { label: "High (game)", degrees: 40 },
  { label: "Low", degrees: 18 },
  { label: "Eye level", degrees: 9 },
  { label: "Top", degrees: 80 },
] as const;
const ZOOMS = [1, 1.6, 2.4, 3.6];

/** Every floor of the built rooms: one swatch per look, with the rooms that share it. */
export function floorSwatches(rooms: readonly RoomDefinition[] = BENCH_ROOMS): Swatch[] {
  const swatches = new Map<string, Swatch>();
  for (const def of rooms) {
    const look = def.floor();
    const name = roomTile(def.id).name;
    const found = swatches.get(look.uuid);
    if (found) found.rooms.push(name);
    else swatches.set(look.uuid, { look, rooms: [name] });
  }
  return [...swatches.values()];
}

/** Where each swatch lies on the tile: a square grid, filled from the middle out, so the first swatches lie round a light at the centre. */
function layout(count: number): { size: number; at: (index: number) => [number, number] } {
  const columns = Math.ceil(Math.sqrt(count));
  const pitch = (TILE - 0.4) / columns;
  const slots = Array.from({ length: columns * columns }, (_, k): [number, number] => [
    ((k % columns) - (columns - 1) / 2) * pitch,
    (Math.floor(k / columns) - (columns - 1) / 2) * pitch,
  ]);
  slots.sort((a, b) => Math.hypot(...a) - Math.hypot(...b) || Math.atan2(a[1], a[0]) - Math.atan2(b[1], b[0]));
  return { size: pitch * 0.8, at: (index) => slots[index] };
}

const SWATCH_DEPTH = 0.02;

export interface ShineBenchSnapshot {
  light: string;
  /** Where the lamp stands, in metres from the tile's centre. */
  at: [x: number, y: number, z: number];
  moon: boolean;
  explorerLight: boolean;
  shine: boolean;
  tilt: number;
  view: number;
  zoom: number;
  frozen: boolean;
  selected: number | null;
  /** A shine tried on every swatch, or null for the floors as rooms lay them: matte. */
  tried: Shine | null;
  /** Whether a bake is under way, and how long the last one took to show its whole light. */
  baking: boolean;
  bakeMs: number | null;
}

export interface ShineBenchApi {
  frameCount: () => number;
  isReady: () => boolean;
  setLight: (id: string) => void;
  setLightAt: (at: [number, number, number]) => void;
  setMoon: (on: boolean) => void;
  setExplorerLight: (on: boolean) => void;
  setShine: (on: boolean) => void;
  setTilt: (degrees: number) => void;
  setView: (view: number) => void;
  setZoom: (zoom: number) => void;
  freezeClock: (frozen: boolean) => void;
  select: (index: number | null) => void;
  /** Tries a shine on every swatch; null puts them back to matte. */
  tune: (shine: Shine | null) => void;
}

declare global {
  interface Window {
    __betrayalShineBench?: ShineBenchApi;
  }
}

/** Keeps the address in step with the page's shine setting, which `shineOn` reads. */
function setShineParam(on: boolean) {
  const url = new URL(window.location.href);
  if (on) url.searchParams.delete("shine");
  else url.searchParams.set("shine", "off");
  window.history.replaceState(window.history.state, "", url);
}

/** The swatches as a room part, ready to freeze and bake: a matte slab, the swatches on it, the lamp, and (moon off) an unseen ceiling. */
function swatchPart(swatches: readonly Swatch[], snapshot: ShineBenchSnapshot): RoomPart {
  const { size, at } = layout(swatches.length);
  const base = flat("sootLight");
  const root = group(box([TILE, 0.2, TILE], flat("soot"), [0, -0.2, 0]));
  swatches.forEach((swatch, index) => {
    const material = textured(swatch.look);
    if (snapshot.tried && snapshot.shine) shiny(material, snapshot.tried);
    const [x, z] = at(index);
    root.add(box([size, SWATCH_DEPTH, size], [base, base, material, base, base, base], [x, 0, z]));
  });
  if (!snapshot.moon) {
    const ceiling = box([TILE * 3, 0.1, TILE * 3], flat("void"), [0, WALL_HEIGHT, 0]);
    ceiling.userData.bakeOnly = true;
    root.add(ceiling);
  }
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) object.castShadow = true;
  });
  const lamp = BENCH_LIGHTS.find((light) => light.id === snapshot.light);
  const lights: BakedLight[] = lamp
    ? [{ at: new THREE.Vector3(...snapshot.at), colour: lamp.colour, intensity: lamp.intensity, range: lamp.range, flicker: lamp.flicker, kind: lamp.kind }]
    : [];
  return {
    root,
    walls: [],
    corners: [],
    hung: [],
    cutWalls: () => undefined,
    update: () => undefined,
    explorer: null,
    lights,
    spots: [],
    ready: texturesUnder(root),
    dispose: () => disposeTree(root),
  };
}

/** A number on a swatch's corner, matching the list's. */
function label(text: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 32;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2D canvas unavailable");
  context.fillStyle = paletteHex("soot");
  context.fillRect(0, 0, 64, 32);
  context.fillStyle = paletteHex("boneLight");
  context.font = "bold 22px monospace";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, 32, 17);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, toneMapped: false, fog: false }));
  sprite.scale.set(0.24, 0.12, 1);
  return sprite;
}

/** The bench's state outside React, so the page and screenshot tools drive the same thing. */
export function createShineBench() {
  const swatches = floorSwatches();
  const firstLamp = BENCH_LIGHTS[0];
  let snapshot: ShineBenchSnapshot = {
    light: firstLamp.id,
    at: [0, firstLamp.height, 0],
    moon: false,
    explorerLight: false,
    shine: shineOn(),
    tilt: TILTS[0].degrees,
    view: 0,
    zoom: ZOOMS[0],
    frozen: false,
    selected: null,
    tried: null,
    baking: true,
    bakeMs: null,
  };
  const listeners = new Set<() => void>();
  let mounted: { rebake: () => void; place: () => void; lights: () => void; select: () => void } | null = null;
  let ready = false;
  let frames = 0;

  function update(next: ShineBenchSnapshot) {
    snapshot = next;
    for (const listener of listeners) listener();
  }
  const rebaking = (next: ShineBenchSnapshot) => {
    update(next);
    mounted?.rebake();
  };

  const api: ShineBenchApi = {
    frameCount: () => frames,
    isReady: () => ready,
    setLight: (id) => {
      const lamp = BENCH_LIGHTS.find((light) => light.id === id);
      if (!lamp && id !== NO_LAMP) throw new Error(`The shine bench has no light "${id}"`);
      rebaking({ ...snapshot, light: id, at: lamp ? [snapshot.at[0], lamp.height, snapshot.at[2]] : snapshot.at });
    },
    setLightAt: (at) => {
      rebaking({ ...snapshot, at });
    },
    setMoon: (on) => {
      rebaking({ ...snapshot, moon: on });
    },
    setExplorerLight: (on) => {
      update({ ...snapshot, explorerLight: on });
      mounted?.lights();
    },
    setShine: (on) => {
      setShineParam(on);
      rebaking({ ...snapshot, shine: on });
    },
    setTilt: (degrees) => {
      update({ ...snapshot, tilt: degrees });
      mounted?.place();
    },
    setView: (view) => {
      update({ ...snapshot, view: ((view % 4) + 4) % 4 });
      mounted?.place();
    },
    setZoom: (zoom) => {
      update({ ...snapshot, zoom });
      mounted?.place();
    },
    freezeClock: (frozen) => {
      update({ ...snapshot, frozen });
    },
    select: (index) => {
      if (index !== null && !(index in swatches)) throw new Error(`The shine bench has no swatch ${index}`);
      update({ ...snapshot, selected: index });
      mounted?.select();
    },
    tune: (shine) => {
      if (shine) for (const [key, value] of Object.entries(shine)) if (!(value >= 0 && value <= 1)) throw new Error(`A shine's ${key} is ${value}; it runs from 0 to 1`);
      rebaking({ ...snapshot, tried: shine });
    },
  };

  function mount(ctx: ThreeSceneContext): ThreeSceneHandlers {
    const { scene, camera, renderer } = ctx;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.domElement.style.imageRendering = "pixelated";
    renderer.toneMappingExposure = 1.5;
    camera.fov = FIELD_OF_VIEW;
    camera.near = 0.05;
    camera.far = 200;
    camera.updateProjectionMatrix();
    scene.background = new THREE.Color(paletteHex(HOUSE_LIGHT.fog.colour));
    scene.fog = null;

    const guard = budgetGuard(renderer);
    const bakes: BakeScheduler = createBakeScheduler(() => workerLanes());
    const floor = createLitFloor(bakes, "shine-bench");
    const fill = fillLight();
    const overExplorer = explorerLight();
    const lampMarker = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), new THREE.MeshBasicMaterial({ toneMapped: false }));
    const { size, at } = layout(swatches.length);
    const labels = swatches.map((_, index) => {
      const sprite = label(String(index + 1));
      const [x, z] = at(index);
      sprite.position.set(x - size / 2 + 0.12, 0.1, z + size / 2 + 0.02);
      return sprite;
    });
    const outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
      new THREE.LineBasicMaterial({ color: paletteHex("goldLight"), toneMapped: false }),
    );
    outline.visible = false;
    scene.add(floor.root, fill, overExplorer, lampMarker, outline, ...labels);

    const lights = () => {
      const lamp = BENCH_LIGHTS.find((light) => light.id === snapshot.light);
      lampMarker.visible = lamp !== undefined;
      if (lamp) lampMarker.material.color.set(paletteHex(lamp.colour));
      lampMarker.position.set(...snapshot.at);
      overExplorer.visible = snapshot.explorerLight;
      overExplorer.position.set(snapshot.at[0], 0, snapshot.at[2]).add(EXPLORER_LIGHT_OFFSET);
    };
    let bakeId = 0;
    /** Rebuilds the swatches and bakes them afresh: a light moved, the moon, the shine or the one tried changed. */
    const rebake = () => {
      const id = ++bakeId;
      ready = false;
      update({ ...snapshot, baking: true });
      lights();
      const part = swatchPart(swatches, snapshot);
      const frozen = freezeRoom(`shine-bench-${id}`, part);
      void floor.place([{ id: "swatches", room: frozen, matrix: new THREE.Matrix4() }]).then((done) =>
        Promise.all([frozen.ready, done.bounce]).then(([, bounceMs]) => {
          part.dispose();
          if (id !== bakeId) return;
          ready = true;
          update({ ...snapshot, baking: false, bakeMs: bounceMs ?? done.ms });
        }),
      );
    };
    const select = () => {
      const index = snapshot.selected;
      outline.visible = index !== null;
      if (index === null) return;
      const [x, z] = at(index);
      outline.scale.set(size + 0.06, 0.06, size + 0.06);
      outline.position.set(x, SWATCH_DEPTH / 2, z);
    };

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.minDistance = 0.5;
    controls.maxDistance = 40;
    controls.maxPolarAngle = THREE.MathUtils.degToRad(88);
    controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
    /** Puts the camera where the presets say: round the tile's centre, from a quarter view, at the tilt and zoom. */
    const place = () => {
      const vertical = THREE.MathUtils.degToRad(camera.fov);
      const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * camera.aspect);
      const radius = TILE * 0.62;
      const distance = Math.max(radius / Math.sin(vertical / 2), radius / Math.sin(horizontal / 2)) / snapshot.zoom;
      const angle = THREE.MathUtils.degToRad(45 + 90 * snapshot.view);
      const elevation = THREE.MathUtils.degToRad(snapshot.tilt);
      const target = controls.target.clone().setY(0);
      camera.position
        .copy(target)
        .add(new THREE.Vector3(Math.sin(angle) * Math.cos(elevation), Math.sin(elevation), Math.cos(angle) * Math.cos(elevation)).multiplyScalar(distance));
      camera.lookAt(target);
      controls.target.copy(target);
      controls.update();
    };

    // A click picks a swatch; a shift-click stands the lamp there. A drag only moves the camera.
    const raycaster = new THREE.Raycaster();
    const down = new THREE.Vector2();
    const onPointerDown = (event: PointerEvent) => down.set(event.clientX, event.clientY);
    const onPointerUp = (event: PointerEvent) => {
      if (down.distanceTo(new THREE.Vector2(event.clientX, event.clientY)) > 4) return;
      const rect = renderer.domElement.getBoundingClientRect();
      raycaster.setFromCamera(
        new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1),
        camera,
      );
      const hit = raycaster.intersectObject(floor.root, true).at(0);
      if (!hit) return;
      if (event.shiftKey) {
        api.setLightAt([hit.point.x, snapshot.at[1], hit.point.z]);
        return;
      }
      const index = swatches.findIndex((_, i) => {
        const [x, z] = at(i);
        return Math.abs(hit.point.x - x) <= size / 2 + 0.05 && Math.abs(hit.point.z - z) <= size / 2 + 0.05;
      });
      api.select(index === -1 ? null : index);
    };
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointerup", onPointerUp);

    mounted = { rebake, place, lights, select };
    rebake();
    place();
    window.__betrayalShineBench = api;

    let seconds = 0;
    return {
      onFrame: (delta) => {
        guard.check();
        frames++;
        if (!snapshot.frozen) seconds += delta;
        floor.update(seconds);
        controls.update();
      },
      onResize: place,
      dispose: () => {
        // Disposing cancels the bake, which resolves its promise: this mount's bake must not mark the next one's ready.
        bakeId++;
        ready = false;
        renderer.domElement.removeEventListener("pointerdown", onPointerDown);
        renderer.domElement.removeEventListener("pointerup", onPointerUp);
        controls.dispose();
        floor.dispose();
        bakes.stop();
        for (const sprite of labels) {
          sprite.material.map?.dispose();
          sprite.material.dispose();
        }
        disposeTree(lampMarker);
        disposeTree(outline);
        scene.remove(floor.root, fill, overExplorer, lampMarker, outline, ...labels);
        mounted = null;
        delete window.__betrayalShineBench;
      },
    };
  }

  return {
    mount,
    api,
    swatches,
    zooms: ZOOMS,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot: () => snapshot,
  };
}

export type ShineBench = ReturnType<typeof createShineBench>;
