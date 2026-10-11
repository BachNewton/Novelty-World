import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { readPad, subscribeGamepads, type PadSnapshot } from "@/shared/lib/gamepad";
import type { ThreeSceneContext, ThreeSceneHandlers } from "@/shared/lib/three/use-three-scene";
import { animationOf, type Animation } from "./animate";
import type { Resolution } from "./bench";
import { frameSlicer } from "./build-slices";
import { FIELD_OF_VIEW } from "./house-camera";
import { paletteHex } from "./palette";
import {
  galleryEntries,
  GALLERY_ROOMS,
  kitMatch,
  possibleDuplicates,
  shapeOf,
  shelfLayout,
  sourceGroup,
  sourceLabel,
  type DuplicateGroup,
  type GalleryEntry,
  type GalleryLayout,
  type LayoutSection,
  type PieceShape,
} from "./props-gallery";
import { disposeTree } from "./stage";
import { group } from "./shapes";
import { texturesUnder } from "./textures";

/** What the gallery shows: everything, the kit, the possible duplicates, or one room (by its id). */
export type GalleryShow = "all" | "kit" | "duplicates" | (string & {});

export interface GalleryItem {
  key: string;
  name: string;
  source: string;
}

export interface GalleryDuplicates {
  word: string;
  items: GalleryItem[];
}

export interface GallerySnapshot {
  show: GalleryShow;
  search: string;
  built: number;
  total: number;
  /** How many pieces the filter and search leave on the floor. */
  shown: number;
  /** The piece the camera was last stepped to, and its place among those shown. */
  focused: (GalleryItem & { place: number }) | null;
  /** The possible duplicates, once every piece is built. */
  duplicates: GalleryDuplicates[] | null;
  resolution: Resolution;
}

export interface PropsGalleryApi {
  frameCount: () => number;
  /** Every piece built, its textures drawn, laid out, and the camera at rest. */
  isReady: () => boolean;
  setShow: (show: GalleryShow) => void;
  setSearch: (search: string) => void;
  /** Steps the camera to the next (1) or previous (-1) piece shown. */
  step: (by: number) => void;
  /** Frames every piece shown, as the gallery opens. */
  frameAll: () => void;
  setResolution: (resolution: Resolution) => void;
  /** Turns the camera round what it looks at by quarter turns, as the bench's orbit buttons do. */
  orbit: (quarters: number) => void;
  /** Moves the camera nearer (above 1) or farther (below 1). */
  zoom: (factor: number) => void;
  /** The pieces shown, in order. */
  items: () => GalleryItem[];
  duplicates: () => GalleryDuplicates[] | null;
}

declare global {
  interface Window {
    __betrayalProps?: PropsGalleryApi;
  }
}

export const RESOLUTIONS: Resolution[] = [270, 360, 540, 720, 1080, null];
/** How wide a row of pieces runs before the next row starts, in metres. */
const ROW_WIDTH = 10;
/** How much of a frame the build may take, in milliseconds. */
const BUILD_BUDGET_MS = 6;
/** Labels show for pieces nearer the camera than this, in metres, so a far view isn't a wall of text. */
const LABEL_RANGE = 30;
const TITLE_RANGE = 40;
/** The least a step to one piece frames round its centre. */
const FOCUS_RADIUS = 0.35;
const ELEVATION = THREE.MathUtils.degToRad(32);
const AZIMUTH = THREE.MathUtils.degToRad(20);
/** Pad sticks: the share of the view's distance panned, and the radians turned, per second at full tilt. */
const PAD_PAN = 0.9;
const PAD_TURN = 2;

const LABEL_CLASS =
  "pointer-events-none absolute top-0 left-0 max-w-28 rounded bg-(--bt-panel)/80 px-1 text-center text-[11px] leading-tight whitespace-pre-line text-(--bt-ink) data-[focused=true]:ring-2 data-[focused=true]:ring-(--bt-accent)";
const TITLE_CLASS = "pointer-events-none absolute top-0 left-0 rounded border border-(--bt-line) bg-(--bt-panel) px-2 text-sm font-semibold whitespace-nowrap text-(--bt-accent)";

/** One piece as built: standing on the floor, centred, in a holder the layout moves. */
interface Built {
  entry: GalleryEntry;
  holder: THREE.Group;
  shape: PieceShape;
  item: GalleryItem;
  animations: Animation[];
  label: HTMLDivElement;
  ready: Promise<void>;
}

/** Keeps the address in step, so a link opens on the same filter and search. */
function setSearchParam(name: string, value: string | null) {
  const url = new URL(window.location.href);
  if (value === null || value === "") url.searchParams.delete(name);
  else url.searchParams.set(name, value);
  window.history.replaceState(window.history.state, "", url);
}

/** The props gallery: every kit piece and every room's props, built a slice
 *  at a time, on a grid under an even light, to judge them side by side.
 *  Plain state outside React, like the bench, so the page and shot tools drive the same thing. */
export function createPropsGallery(initialShow: GalleryShow, initialSearch: string) {
  const entries = galleryEntries();
  const showable = new Set(["all", "kit", "duplicates", ...GALLERY_ROOMS.map((room) => room.id)]);
  if (!showable.has(initialShow)) throw new Error(`The props gallery has no group "${initialShow}"`);
  let snapshot: GallerySnapshot = {
    show: initialShow,
    search: initialSearch,
    built: 0,
    total: entries.length,
    shown: 0,
    focused: null,
    duplicates: null,
    resolution: null,
  };
  const listeners = new Set<() => void>();
  const update = (next: Partial<GallerySnapshot>) => {
    snapshot = { ...snapshot, ...next };
    for (const listener of listeners) listener();
  };
  let mounted: {
    relayout: () => void;
    focus: (place: number) => void;
    frameAll: () => void;
    applyResolution: () => void;
    orbit: (quarters: number) => void;
    zoom: (factor: number) => void;
  } | null = null;
  let frames = 0;
  let texturesDrawn = false;
  let order: Built[] = [];

  const api: PropsGalleryApi = {
    frameCount: () => frames,
    isReady: () => snapshot.built === snapshot.total && texturesDrawn,
    setShow: (show) => {
      if (!showable.has(show)) throw new Error(`The props gallery has no group "${show}"`);
      update({ show, focused: null });
      setSearchParam("show", show === "all" ? null : show);
      mounted?.relayout();
      mounted?.frameAll();
    },
    setSearch: (search) => {
      update({ search, focused: null });
      setSearchParam("q", search);
      mounted?.relayout();
    },
    step: (by) => {
      if (order.length === 0) return;
      const from = snapshot.focused?.place ?? (by > 0 ? -1 : 0);
      mounted?.focus((((from + by) % order.length) + order.length) % order.length);
    },
    frameAll: () => mounted?.frameAll(),
    setResolution: (resolution) => {
      update({ resolution });
      mounted?.applyResolution();
    },
    orbit: (quarters) => mounted?.orbit(quarters),
    zoom: (factor) => mounted?.zoom(factor),
    items: () => order.map(({ item }) => item),
    duplicates: () => snapshot.duplicates,
  };

  function mount(ctx: ThreeSceneContext): ThreeSceneHandlers {
    const { scene, camera, renderer, container } = ctx;
    camera.fov = FIELD_OF_VIEW;
    renderer.domElement.style.imageRendering = "pixelated";
    scene.background = new THREE.Color(paletteHex("stoneDark"));
    scene.fog = null;
    // An even light, the same on every piece: a soft fill from all round and one key from the front left.
    const key = new THREE.DirectionalLight(paletteHex("boneLight"), 1.6);
    key.position.set(-4, 8, 6);
    const fill = new THREE.HemisphereLight(paletteHex("boneLight"), paletteHex("stone"), 1.4);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: paletteHex("stone") }));
    floor.position.y = -0.002;
    let grid: THREE.GridHelper | null = null;
    const pieces = group();
    const stage = group(key, key.target, fill, floor, pieces);
    scene.add(stage);

    const labels = document.createElement("div");
    labels.className = "pointer-events-none absolute inset-0 overflow-hidden";
    container.appendChild(labels);
    let titles: { element: HTMLDivElement; at: THREE.Vector3 }[] = [];

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.minDistance = 0.3;
    controls.maxDistance = 120;
    controls.maxPolarAngle = THREE.MathUtils.degToRad(88);
    // As on the bench: one finger pans, a pinch zooms, and two fingers dragged together turn and tilt.
    controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
    controls.listenToKeyEvents(window);
    /** Whether the user's hand (or a step) has placed the camera, so building no longer reframes it. */
    let byHand = false;
    controls.addEventListener("start", () => {
      byHand = true;
    });

    const built = new Map<string, Built>();
    const kitShapes: { name: string; shape: PieceShape }[] = [];
    let layout: GalleryLayout | null = null;

    const build = (entry: GalleryEntry) => {
      const object = entry.build();
      const box = new THREE.Box3().setFromObject(object);
      const centre = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
      object.position.sub(new THREE.Vector3(centre.x, box.isEmpty() ? 0 : box.min.y, centre.z));
      const holder = group(object);
      const shape = shapeOf(object);
      if (entry.source.kind === "kit" && entry.name !== null) kitShapes.push({ name: entry.name, shape });
      const matched = entry.name ?? kitMatch(shape, kitShapes);
      const name = entry.name ?? (matched === null ? `prop #${entry.source.kind === "room" ? entry.source.index : 0}` : `${matched} (kit)`);
      const animations: Animation[] = [];
      holder.traverse((child) => {
        const animation = animationOf(child);
        if (animation) animations.push(animation);
      });
      const label = document.createElement("div");
      label.className = LABEL_CLASS;
      label.textContent = `${name}\n${sourceLabel(entry.source)}`;
      label.style.display = "none";
      labels.appendChild(label);
      pieces.add(holder);
      const item = { key: entry.key, name, source: sourceLabel(entry.source) };
      built.set(entry.key, { entry, holder, shape, item, animations, label, ready: texturesUnder(holder) });
    };

    const shows = (piece: Built): boolean => {
      const search = snapshot.search.trim().toLowerCase();
      return search === "" || `${piece.item.name} ${piece.item.source}`.toLowerCase().includes(search);
    };

    const sections = (): LayoutSection[] => {
      const sized = (piece: Built) => ({ key: piece.entry.key, width: piece.shape.size[0], depth: piece.shape.size[2] });
      const inOrder = entries.flatMap((entry) => {
        const piece = built.get(entry.key);
        return piece && shows(piece) ? [piece] : [];
      });
      if (snapshot.show === "duplicates") {
        const byKey = new Map(inOrder.map((piece) => [piece.entry.key, piece]));
        return (snapshot.duplicates ?? []).map(({ word, items }) => ({
          title: `${word} (${items.length})`,
          items: items.flatMap(({ key: id }) => {
            const piece = byKey.get(id);
            return piece ? [sized(piece)] : [];
          }),
        }));
      }
      const groups = snapshot.show === "all" ? ["kit", ...GALLERY_ROOMS.map((room) => room.id)] : [snapshot.show];
      return groups.map((id) => {
        const members = inOrder.filter((piece) => sourceGroup(piece.entry.source) === id);
        return { title: members[0]?.item.source.replace(/^kit\/.*/, "Kit") ?? id, items: members.map(sized) };
      });
    };

    const relayout = () => {
      const next = shelfLayout(sections(), ROW_WIDTH);
      layout = next;
      order = [];
      for (const piece of built.values()) piece.holder.visible = false;
      for (const [id] of next.at) {
        const piece = built.get(id);
        if (piece) order.push(piece);
      }
      for (const piece of order) {
        const [x, z] = next.at.get(piece.entry.key) ?? [0, 0];
        piece.holder.position.set(x, 0, z);
        piece.holder.visible = true;
      }
      const [x0, x1] = next.bounds.x;
      const [z0, z1] = next.bounds.z;
      const margin = 2;
      floor.scale.set(x1 - x0 + margin * 2, 1, z1 - z0 + margin * 2);
      floor.position.set((x0 + x1) / 2, floor.position.y, (z0 + z1) / 2);
      // A metre grid under the pieces, to judge their sizes by.
      const across = Math.ceil(Math.max(x1 - x0, z1 - z0) + margin * 2);
      if (grid) {
        stage.remove(grid);
        grid.dispose();
      }
      grid = new THREE.GridHelper(across, across, paletteHex("stoneLight"), paletteHex("stoneLight"));
      grid.material.opacity = 0.35;
      grid.material.transparent = true;
      grid.position.set(Math.round((x0 + x1) / 2), 0, Math.round((z0 + z1) / 2));
      stage.add(grid);
      for (const title of titles) title.element.remove();
      titles = next.titles.map(({ title, at: [x, z] }) => {
        const element = document.createElement("div");
        element.className = TITLE_CLASS;
        element.textContent = title;
        labels.appendChild(element);
        return { element, at: new THREE.Vector3(x, 0, z) };
      });
      update({ shown: order.length });
    };

    /** Puts the camera `distance` from `target`, looking from the gallery's front left, or from where it already looks. */
    const look = (target: THREE.Vector3, distance: number, keepDirection: boolean) => {
      const direction = keepDirection
        ? camera.position.clone().sub(controls.target).normalize()
        : new THREE.Vector3(Math.sin(AZIMUTH) * Math.cos(ELEVATION), Math.sin(ELEVATION), Math.cos(AZIMUTH) * Math.cos(ELEVATION));
      controls.target.copy(target);
      camera.position.copy(target).addScaledVector(direction, distance);
      camera.near = Math.max(0.01, distance / 200);
      camera.far = distance * 20 + 200;
      camera.updateProjectionMatrix();
      controls.update();
    };

    const fitDistance = (radius: number) => {
      const vertical = THREE.MathUtils.degToRad(camera.fov);
      const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * camera.aspect);
      return radius / Math.sin(Math.min(vertical, horizontal) / 2);
    };

    /** Frames the first rows shown: their width, and as far back as that width again. */
    const frameAll = () => {
      if (!layout) return;
      const [x0, x1] = layout.bounds.x;
      const [z0, z1] = layout.bounds.z;
      const depth = Math.min(z1 - z0, Math.max((x1 - x0) * 0.6, 4));
      const centre = new THREE.Vector3((x0 + x1) / 2, 0.5, z0 + depth / 2);
      look(centre, fitDistance(Math.hypot(x1 - x0, depth) / 2) * 0.9, false);
      byHand = false;
    };

    const focus = (place: number) => {
      const piece = order.at(place);
      if (!piece) return;
      const sphere = new THREE.Box3().setFromObject(piece.holder).getBoundingSphere(new THREE.Sphere());
      look(sphere.center, fitDistance(Math.max(sphere.radius, FOCUS_RADIUS)) * 1.15, true);
      byHand = true;
      update({ focused: { ...piece.item, place } });
    };

    const applyResolution = () => {
      const shortSide = snapshot.resolution;
      const ratio = shortSide === null ? window.devicePixelRatio : shortSide / Math.min(container.clientWidth, container.clientHeight);
      ctx.setPixelRatio(ratio);
    };

    const slicer = frameSlicer(BUILD_BUDGET_MS);
    // The kit first, whatever is shown: an unnamed room prop is named by the kit piece it matches.
    const wanted = (entry: GalleryEntry) => () => {
      const show = snapshot.show;
      if (entry.source.kind === "kit") return 2;
      return show === "all" || show === "duplicates" || sourceGroup(entry.source) === show ? 1 : 0;
    };
    for (const entry of entries) slicer.add(entry.key, () => build(entry), wanted(entry));

    let builtBefore = 0;
    const finishBuilding = () => {
      const shaped = entries.flatMap((entry) => {
        const piece = built.get(entry.key);
        if (!piece) throw new Error(`The props gallery never built ${entry.key}`);
        return [{ key: entry.key, name: piece.item.name.replace(/ \(kit\)$/, ""), group: sourceGroup(entry.source), shape: piece.shape }];
      });
      const named = shaped.filter((piece) => !/^prop #\d+$/.test(piece.name));
      const groups: DuplicateGroup[] = possibleDuplicates(named);
      update({
        duplicates: groups.map(({ word, keys }) => ({
          word,
          items: keys.map((id) => {
            const piece = built.get(id);
            if (!piece) throw new Error(`The props gallery never built ${id}`);
            return piece.item;
          }),
        })),
      });
      relayout();
      if (!byHand) frameAll();
      void Promise.all([...built.values()].map((piece) => piece.ready)).then(() => {
        texturesDrawn = true;
      });
    };

    /** The pads as last read; their buttons step and their sticks move the camera. */
    let pads: readonly PadSnapshot[] = [];
    const unsubscribePads = subscribeGamepads({
      onFrame: (snapshots) => {
        pads = snapshots;
      },
      onConnectionChange: (snapshots) => {
        pads = snapshots;
      },
      onButton: ({ name, pressed }) => {
        if (!pressed) return;
        if (name === "RB" || name === "DpadRight") api.step(1);
        if (name === "LB" || name === "DpadLeft") api.step(-1);
        if (name === "Y") frameAll();
      },
    });
    const spherical = new THREE.Spherical();
    const offset = new THREE.Vector3();
    /** Moves the camera round its target: turned by `theta` radians, and its distance scaled. */
    const swing = (theta: number, scale: number) => {
      byHand = true;
      spherical.setFromVector3(offset.copy(camera.position).sub(controls.target));
      spherical.theta += theta;
      spherical.radius = THREE.MathUtils.clamp(spherical.radius * scale, controls.minDistance, controls.maxDistance);
      camera.position.copy(controls.target).add(offset.setFromSpherical(spherical));
    };
    const padCamera = (delta: number) => {
      for (const snapshot of pads) {
        const controlsRead = readPad(snapshot).controls;
        if (!controlsRead) continue;
        const { leftStick, rightStick, leftTrigger, rightTrigger } = controlsRead;
        const zoom = rightTrigger - leftTrigger;
        if (leftStick.x === 0 && leftStick.y === 0 && rightStick.x === 0 && rightStick.y === 0 && zoom === 0) continue;
        byHand = true;
        offset.copy(camera.position).sub(controls.target);
        const distance = offset.length();
        // Left stick pans over the floor, as the camera faces; right stick turns and tilts; the triggers zoom.
        const forward = new THREE.Vector3(-offset.x, 0, -offset.z).normalize();
        const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0));
        const pan = right.multiplyScalar(leftStick.x).addScaledVector(forward, -leftStick.y).multiplyScalar(distance * PAD_PAN * delta);
        controls.target.add(pan);
        spherical.setFromVector3(offset);
        spherical.theta -= rightStick.x * PAD_TURN * delta;
        spherical.phi = THREE.MathUtils.clamp(spherical.phi + rightStick.y * PAD_TURN * delta, 0.05, controls.maxPolarAngle);
        spherical.radius = THREE.MathUtils.clamp(distance * Math.exp(-zoom * 1.5 * delta), controls.minDistance, controls.maxDistance);
        camera.position.copy(controls.target).add(offset.setFromSpherical(spherical));
      }
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
      if (event.key === "]" || event.key === "n") api.step(1);
      if (event.key === "[" || event.key === "p") api.step(-1);
      if (event.key === "f") frameAll();
    };
    window.addEventListener("keydown", onKey);

    const projected = new THREE.Vector3();
    /** Places a label at a point on the floor, if that point is in view and near enough to read. */
    const place = (element: HTMLDivElement, at: THREE.Vector3, range: number) => {
      const distance = camera.position.distanceTo(at);
      projected.copy(at).project(camera);
      const inView = distance < range && projected.z < 1 && Math.abs(projected.x) < 1.1 && Math.abs(projected.y) < 1.1;
      element.style.display = inView ? "" : "none";
      if (!inView) return;
      const x = ((projected.x + 1) / 2) * container.clientWidth;
      const y = ((1 - projected.y) / 2) * container.clientHeight;
      element.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, 0)`;
    };
    const labelAt = new THREE.Vector3();

    mounted = {
      relayout,
      focus,
      frameAll,
      applyResolution,
      orbit: (quarters) => swing((quarters * Math.PI) / 2, 1),
      zoom: (factor) => swing(0, 1 / factor),
    };
    window.__betrayalProps = api;
    let seconds = 0;

    return {
      onFrame: (delta) => {
        frames++;
        seconds += delta;
        slicer.frame();
        if (built.size !== builtBefore) {
          builtBefore = built.size;
          update({ built: built.size });
          relayout();
          if (!byHand) frameAll();
          if (built.size === entries.length) finishBuilding();
        }
        padCamera(delta);
        controls.update();
        for (const piece of order) for (const animation of piece.animations) animation(seconds);
        for (const piece of built.values()) {
          if (!piece.holder.visible) {
            piece.label.style.display = "none";
            continue;
          }
          labelAt.set(piece.holder.position.x, 0, piece.holder.position.z + piece.shape.size[2] / 2 + 0.08);
          place(piece.label, labelAt, LABEL_RANGE);
          piece.label.dataset.focused = String(snapshot.focused?.key === piece.entry.key);
        }
        for (const title of titles) place(title.element, title.at, TITLE_RANGE);
      },
      onResize: () => applyResolution(),
      dispose: () => {
        controls.stopListenToKeyEvents();
        controls.dispose();
        window.removeEventListener("keydown", onKey);
        unsubscribePads();
        for (const entry of entries) slicer.cancel(entry.key);
        scene.remove(stage);
        disposeTree(stage);
        grid?.dispose();
        labels.remove();
        mounted = null;
        delete window.__betrayalProps;
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

export type PropsGallery = ReturnType<typeof createPropsGallery>;
