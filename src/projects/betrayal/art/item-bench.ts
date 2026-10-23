import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { ThreeSceneContext, ThreeSceneHandlers } from "@/shared/lib/three/use-three-scene";
import { CATALOG } from "../data";
import { CHARACTERS } from "../data/characters";
import { animationOf, type Animation } from "./animate";
import { workerLanes } from "./bake-workers";
import { createBakeScheduler } from "./bake-schedule";
import { CARD_PALETTE, figureFor, hasFigure } from "./explorers/by-character";
import { handsOf, holdIn } from "./explorers/hands";
import { onTheSpot } from "./explorers/line-up";
import { freezeRoom } from "./freeze";
import { cameraDistance, DEFAULT_PITCH, FIELD_OF_VIEW } from "./house-camera";
import { ITEM_IDS, ITEM_MODELS, type ItemId } from "./items";
import { EXPLORER_LIGHT_OFFSET, explorerLight, fillLight, HOUSE_LIGHT } from "./lighting";
import { createLitFloor, patchProbe, type ProbeUniform } from "./lit-floor";
import { checkFloor } from "./overlap";
import { PALETTE, paletteHex } from "./palette";
import { placeFigures } from "./placement";
import { placementHints } from "./room-floor";
import { BENCH_ROOMS } from "./rooms";
import { shaderReadier } from "./shader-prep";
import { group } from "./shapes";
import { buildRoom, disposeTree } from "./stage";
import { texturesUnder } from "./textures";
import { MOOD_COLOUR, plate } from "./things/looks";

/*
 * The item bench (`?bench=items`): every item and omen model (`items/`) in a
 * grid, each held by an explorer and lying on its plate beside them, named
 * on the floor in front, to judge each model in both its places at once.
 *
 * Everything is lit as the house lights a figure standing in a room: by the
 * light probe a room's own bake gives its prime place (the Foyer, lit, by
 * default; `&room=chapel` is dim), the house's fill over it, and, with
 * `&active`, the house's light over the explorer whose turn it is above
 * every figure, as the explorer in play has. Every cell takes the same
 * light, so the models compare fairly. The clock stands frozen, so a
 * screenshot shows exactly one frame (`tools/item-shots.mjs`).
 *
 * The address holds every setting: `&items=axe,spear` shows only those,
 * `&focus=<id>` frames one, `&camera=` how (`CAMERAS`), `&explorer=<character-id>`,
 * `&t=<s>`.
 */

/** How a cell is laid out, in metres: the figure, and its plate beside it to its right as the camera sees it, the name in front. */
const CELL = { width: 1.9, depth: 1.8, plate: 0.9, name: 0.62 };
/** How many cells to a row. */
const COLUMNS = 4;
/** How far the figure turns from facing the camera, towards its own right, so the hand holding the item shows. */
const FIGURE_TURN = 0.55;

export const CAMERAS = ["all", "close", "hand", "plate", "near", "house"] as const;
export type ItemCamera = (typeof CAMERAS)[number];
export const CAMERA_LABELS: Record<ItemCamera, string> = {
  all: "Every item",
  close: "Held and on its plate",
  hand: "In the hand, close",
  plate: "On its plate, close",
  near: "The house zoomed in",
  house: "The house's whole floor",
};
/** The house camera's zoom for the `near` view: a player zoomed in on a room. */
const NEAR_ZOOM = 3;
/** How far round its middle a detail view (`hand`, `plate`) frames, in metres. */
const DETAIL_REACH = 0.32;

/** Who can hold the items: every explorer with a figure, by character, in their card's colour. */
export const HOLDERS = CHARACTERS.filter(({ id }) => hasFigure(id)).map(({ id, name, card }) => ({ id, name, build: figureFor(id, CARD_PALETTE[card]) }));
const FIRST_HOLDER = "professor-longfellow";

/** The rooms whose light the bench can borrow: the Foyer is lit, the Chapel dim. */
export const LIGHT_ROOMS = ["foyer", "chapel"] as const;

export interface ItemBenchSnapshot {
  items: readonly ItemId[];
  focus: ItemId | null;
  camera: ItemCamera;
  explorer: string;
  room: string;
  active: boolean;
  /** The frozen moment on the stage's clock. */
  at: number;
  building: boolean;
}

export interface ItemBenchApi {
  frameCount: () => number;
  /** The light baked, every model meshed and shown, its shaders and textures ready. */
  isReady: () => boolean;
  /** Every item with a model. */
  items: () => ItemId[];
  /** Shows only these items (every one when empty). */
  setItems: (items: readonly string[]) => void;
  /** Frames one item, or every one shown (null). */
  setFocus: (item: string | null) => void;
  setCamera: (camera: ItemCamera) => void;
  setExplorer: (explorer: string) => void;
  setActive: (on: boolean) => void;
  /** Stops the clock at a moment. */
  freezeClock: (seconds: number) => void;
}

declare global {
  interface Window {
    __betrayalItems?: ItemBenchApi;
  }
}

function itemsFrom(list: readonly string[]): ItemId[] {
  for (const item of list) if (!(ITEM_IDS as readonly string[]).includes(item)) throw new Error(`The item bench has no model "${item}"; it has: ${ITEM_IDS.join(", ")}`);
  return list.length === 0 ? [...ITEM_IDS] : (list as ItemId[]);
}

function focusFrom(item: string | null, shown: readonly ItemId[]): ItemId | null {
  if (item === null) return null;
  if (!(shown as readonly string[]).includes(item)) throw new Error(`The item bench shows no "${item}"; it shows: ${shown.join(", ")}`);
  return item as ItemId;
}

/** The address's settings, read as the bench opens; anything it doesn't know throws, so a typo never passes for a choice. */
function fromAddress(search: string): Omit<ItemBenchSnapshot, "building"> {
  const params = new URLSearchParams(search);
  const one = <T extends string>(name: string, options: readonly T[], fallback: T): T => {
    const value = params.get(name);
    if (value === null) return fallback;
    if (!(options as readonly string[]).includes(value)) throw new Error(`${name}=${value}: it is one of ${options.join(", ")}`);
    return value as T;
  };
  const items = itemsFrom((params.get("items") ?? "").split(",").filter((item) => item !== ""));
  const focus = focusFrom(params.get("focus"), items);
  const at = Number(params.get("t") ?? 2);
  if (!Number.isFinite(at)) throw new Error(`t=${params.get("t") ?? ""}: it is a time in seconds`);
  return {
    items,
    focus,
    camera: one("camera", CAMERAS, focus === null ? "all" : "close"),
    explorer: one("explorer", HOLDERS.map(({ id }) => id), FIRST_HOLDER),
    room: one("room", LIGHT_ROOMS, "foyer"),
    active: params.has("active"),
    at,
  };
}

function setSearchParam(name: string, value: string | null) {
  const url = new URL(window.location.href);
  if (value === null) url.searchParams.delete(name);
  else url.searchParams.set(name, value);
  window.history.replaceState(window.history.state, "", url);
}

/** The light a room's bake gives a figure standing on its prime place, as the six faces of its probe. */
async function roomLight(roomId: string): Promise<THREE.Vector3[]> {
  const def = BENCH_ROOMS.find((room) => room.id === roomId);
  if (!def) throw new Error(`The bench has no room "${roomId}"`);
  const placed = placeFigures(checkFloor(def).plan, placementHints(def, null), [{ id: "prime", size: "person" }]).figures.prime;
  const bakes = createBakeScheduler(() => workerLanes());
  const floor = createLitFloor(bakes, "item-bench");
  const part = buildRoom(def, { explorer: null });
  const frozen = freezeRoom(def.id, part);
  try {
    const done = await floor.place([{ id: def.id, room: frozen, matrix: new THREE.Matrix4() }]);
    await Promise.all([frozen.ready, done.bounce]);
    return floor.probeAt(new THREE.Vector3(placed.x, 0, placed.z), Array.from({ length: 6 }, () => new THREE.Vector3()));
  } finally {
    part.dispose();
    floor.dispose();
    bakes.stop();
  }
}

/** A name lying on the floor, pale on the dark floor, unlit so it reads in any light. */
function nameOnFloor(text: string): THREE.Mesh {
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 96;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No 2D canvas for the item bench's names");
  context.fillStyle = PALETTE.boneLight;
  context.font = "bold 64px serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const name = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.2), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }));
  name.rotation.x = -Math.PI / 2;
  name.position.y = 0.005;
  return name;
}

/** One item's cell, built at its place in the grid. */
interface Cell {
  item: ItemId;
  /** Everything in it, hidden while another cell is framed alone. */
  root: THREE.Group;
  /** What the camera frames for it: the middle of the figure and the plate. */
  centre: THREE.Vector3;
  /** The hand holding the item, whose grip the hand view frames, and the plate's middle. */
  grip: THREE.Object3D;
  plate: THREE.Vector3;
}

/** What the bench shows, built: the cells, the floor, and what poses and lights them. */
interface Shown {
  root: THREE.Group;
  cells: Cell[];
  animations: Animation[];
  probes: ProbeUniform[];
  bounds: THREE.Box3;
}

function buildShown(snapshot: ItemBenchSnapshot): Shown {
  const holder = HOLDERS.find(({ id }) => id === snapshot.explorer);
  if (!holder) throw new Error(`No explorer "${snapshot.explorer}" to hold the items`);
  const animations: Animation[] = [];
  const probes: ProbeUniform[] = [];
  const cells = snapshot.items.map((item, i): Cell => {
    const model = ITEM_MODELS[item];
    const at = new THREE.Vector3((i % COLUMNS) * CELL.width, 0, Math.floor(i / COLUMNS) * CELL.depth);
    const figure = onTheSpot(holder.build, `items:${item}`);
    const hands = handsOf(figure);
    if (!hands) throw new Error(`${holder.name} has no hands to hold an item`);
    holdIn(hands.right, model.held());
    figure.position.copy(at);
    figure.rotation.y = FIGURE_TURN;
    const figures = group(figure);
    const card = CATALOG.cards[item];
    const lying = group(plate(MOOD_COLOUR[card.type === "omen" ? "magic" : "human"]).object, model.floor());
    lying.position.copy(at).add(new THREE.Vector3(CELL.plate, 0, 0));
    const name = nameOnFloor(card.name);
    name.position.add(at).add(new THREE.Vector3(CELL.plate / 2, 0, CELL.name));
    const objects = group(lying, name);
    if (snapshot.active) {
      const light = explorerLight();
      light.position.copy(at).add(EXPLORER_LIGHT_OFFSET);
      figures.add(light);
    }
    figures.traverse((object) => {
      const animation = animationOf(object);
      if (animation) animations.push(animation);
    });
    // The figure and what it holds take a figure's light, the backlight with it; what lies on the floor an object's.
    probes.push(patchProbe(figures), patchProbe(objects, false));
    return {
      item,
      root: group(figures, objects),
      centre: at.clone().add(new THREE.Vector3(CELL.plate / 2, 0.75, 0.1)),
      grip: hands.right.grip,
      plate: lying.position.clone().setY(0.06),
    };
  });
  const bounds = new THREE.Box3();
  for (const { centre } of cells) bounds.expandByPoint(centre.clone().add(new THREE.Vector3(-CELL.width / 2, -0.75, -CELL.depth / 2))).expandByPoint(centre.clone().add(new THREE.Vector3(CELL.width / 2, 0.85, CELL.depth / 2)));
  const middle = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(size.x + 4, size.z + 4).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: paletteHex("woodDark") }));
  ground.position.set(middle.x, 0, middle.z);
  probes.push(patchProbe(ground, false));
  return { root: group(ground, ...cells.map(({ root }) => root)), cells, animations, probes, bounds };
}

export function createItemBench(search: string) {
  let snapshot: ItemBenchSnapshot = { ...fromAddress(search), building: true };
  const listeners = new Set<() => void>();
  const update = (next: Partial<ItemBenchSnapshot>) => {
    snapshot = { ...snapshot, ...next };
    for (const listener of listeners) listener();
  };
  let mounted: { rebuild: () => void; place: () => void } | null = null;
  let frames = 0;
  let ready = false;

  const api: ItemBenchApi = {
    frameCount: () => frames,
    isReady: () => ready,
    items: () => [...ITEM_IDS],
    setItems: (list) => {
      const items = itemsFrom(list);
      const focus = snapshot.focus !== null && items.includes(snapshot.focus) ? snapshot.focus : null;
      update({ items, focus, camera: focus === null ? "all" : snapshot.camera });
      setSearchParam("items", list.length === 0 ? null : items.join(","));
      setSearchParam("focus", focus);
      mounted?.rebuild();
    },
    setFocus: (item) => {
      const focus = focusFrom(item, snapshot.items);
      const camera = focus === null ? "all" : snapshot.camera === "all" ? "close" : snapshot.camera;
      update({ focus, camera });
      setSearchParam("focus", focus);
      setSearchParam("camera", camera === (focus === null ? "all" : "close") ? null : camera);
      mounted?.place();
    },
    setCamera: (camera) => {
      if (!(CAMERAS as readonly string[]).includes(camera)) throw new Error(`The item bench's camera is one of ${CAMERAS.join(", ")}, not ${camera}`);
      if (camera !== "all" && snapshot.focus === null) throw new Error(`The ${camera} camera frames one item: focus on one first`);
      update({ camera });
      setSearchParam("camera", camera);
      mounted?.place();
    },
    setExplorer: (explorer) => {
      if (!HOLDERS.some(({ id }) => id === explorer)) throw new Error(`No explorer "${explorer}" can hold the items; they are ${HOLDERS.map(({ id }) => id).join(", ")}`);
      update({ explorer });
      setSearchParam("explorer", explorer === FIRST_HOLDER ? null : explorer);
      mounted?.rebuild();
    },
    setActive: (on) => {
      update({ active: on });
      setSearchParam("active", on ? "" : null);
      mounted?.rebuild();
    },
    freezeClock: (seconds) => {
      update({ at: seconds });
      setSearchParam("t", String(seconds));
    },
  };

  function mount(ctx: ThreeSceneContext): ThreeSceneHandlers {
    const { scene, camera, renderer } = ctx;
    camera.fov = FIELD_OF_VIEW;
    renderer.toneMappingExposure = 1.5;
    scene.fog = null;
    scene.background = new THREE.Color(paletteHex(HOUSE_LIGHT.fog.colour));
    const readyShaders = shaderReadier(renderer, camera, scene);
    const fill = fillLight();
    scene.add(fill);
    let live = true;
    let light: THREE.Vector3[] | null = null;
    let shown: Shown | null = null;
    let pending: Shown | null = null;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.minDistance = 0.3;
    controls.maxDistance = 80;
    controls.maxPolarAngle = THREE.MathUtils.degToRad(88);

    /** Puts the camera where the snapshot says: over every cell, or on the focused one, close or at the house's distance. */
    const place = () => {
      if (!shown) return;
      const vertical = THREE.MathUtils.degToRad(camera.fov);
      const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * camera.aspect);
      const fit = (reach: number) => reach / Math.sin(Math.min(vertical, horizontal) / 2);
      const cell = shown.cells.find(({ item }) => item === snapshot.focus);
      for (const each of shown.cells) each.root.visible = snapshot.camera === "all" || each === cell;
      let target: THREE.Vector3;
      let distance: number;
      if (snapshot.camera === "all" || !cell) {
        target = shown.bounds.getCenter(new THREE.Vector3());
        const size = shown.bounds.getSize(new THREE.Vector3());
        // As wide as the grid across the screen, and as deep as it, foreshortened, up it.
        distance = Math.max(size.x / 2 / Math.tan(horizontal / 2), ((size.z / 2) * Math.sin(DEFAULT_PITCH) + size.y / 2) / Math.tan(vertical / 2)) * 1.1;
      } else {
        const view = snapshot.camera;
        target = view === "hand" ? cell.grip.getWorldPosition(new THREE.Vector3()) : view === "plate" ? cell.plate.clone() : cell.centre.clone();
        distance = { close: fit(CELL.width * 0.6), hand: fit(DETAIL_REACH), plate: fit(DETAIL_REACH), near: cameraDistance(NEAR_ZOOM, camera.aspect), house: cameraDistance(1, camera.aspect) }[view];
      }
      const pitch = { all: DEFAULT_PITCH, close: THREE.MathUtils.degToRad(25), hand: THREE.MathUtils.degToRad(20), plate: THREE.MathUtils.degToRad(55), near: DEFAULT_PITCH, house: DEFAULT_PITCH }[snapshot.camera];
      camera.position.copy(target).add(new THREE.Vector3(0, Math.sin(pitch), Math.cos(pitch)).multiplyScalar(distance));
      camera.near = Math.max(0.02, distance / 100);
      camera.far = distance * 6;
      camera.updateProjectionMatrix();
      camera.lookAt(target);
      controls.target.copy(target);
      controls.update();
    };

    const rebuild = () => {
      if (pending) disposeTree(pending.root);
      ready = false;
      update({ building: true });
      const next = buildShown(snapshot);
      pending = next;
      const lit = light;
      if (lit) for (const probe of next.probes) probe.value.forEach((face, i) => face.copy(lit[i]));
      void Promise.all([texturesUnder(next.root), readyShaders(next.root)]).then(() => {
        if (pending !== next || !live) return;
        pending = null;
        if (shown) {
          scene.remove(shown.root);
          disposeTree(shown.root);
        }
        shown = next;
        scene.add(next.root);
        place();
        ready = light !== null;
        update({ building: !ready });
      });
    };

    void roomLight(snapshot.room).then((cube) => {
      if (!live) return;
      light = cube;
      for (const probe of [...(shown?.probes ?? []), ...(pending?.probes ?? [])]) probe.value.forEach((face, i) => face.copy(cube[i]));
      if (shown && !pending) {
        ready = true;
        update({ building: false });
      }
    });

    mounted = { rebuild, place };
    window.__betrayalItems = api;
    rebuild();

    return {
      onFrame: () => {
        frames++;
        if (shown) for (const animation of shown.animations) animation(snapshot.at);
        controls.update();
      },
      onResize: place,
      dispose: () => {
        live = false;
        ready = false;
        controls.dispose();
        if (pending) disposeTree(pending.root);
        if (shown) {
          scene.remove(shown.root);
          disposeTree(shown.root);
        }
        scene.remove(fill);
        mounted = null;
        delete window.__betrayalItems;
      },
    };
  }

  return {
    mount,
    api,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot: () => snapshot,
  };
}

export type ItemBench = ReturnType<typeof createItemBench>;
