import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { readPad, subscribeGamepads, type PadSnapshot } from "@/shared/lib/gamepad";
import type { ThreeSceneContext, ThreeSceneHandlers } from "@/shared/lib/three/use-three-scene";
import { CHARACTERS } from "../data/characters";
import { animationOf, type Animation } from "./animate";
import { BENCH_EXPLORERS } from "./explorers";
import { CARD_PALETTE, figureFor, hasFigure } from "./explorers/by-character";
import { CLOTH_MODES, clothMode, type ClothMode } from "./explorers/cloth-sim";
import { burstsOf, cueBurst, isGrounded } from "./explorers/figure";
import { handsOf, holdIn, type Hands } from "./explorers/hands";
import { explorerLineUp } from "./explorers/line-up";
import { STAND_INS } from "./explorers/props";
import { FIGURE_STATES, inMotion, type FigureState } from "./figure-motion";
import { colourRing } from "./house";
import { cameraDistance, DEFAULT_PITCH, FIELD_OF_VIEW } from "./house-camera";
import { SPEED_VALUES } from "./house-walk";
import { HOUSE_LIGHT } from "./lighting";
import { patchProbe, type ProbeUniform } from "./lit-floor";
import { pawn } from "./kit/pawn";
import { banshee, spider } from "./monsters";
import { paletteHex, type PaletteKey } from "./palette";
import { batchParts, type PartBatch } from "./part-batch";
import { shaderReadier } from "./shader-prep";
import { group } from "./shapes";
import { disposeTree, type ExplorerBuilder } from "./stage";
import { texturesUnder } from "./textures";

/*
 * The figure viewer (`?bench=figures`): one figure, or every explorer in a
 * row, on a plain round floor under simple live lights, to judge how each
 * looks and moves. Every state, burst, light, camera and toggle is in the
 * address, so a link opens on exactly what it shows. Plain state outside
 * React, like the bench, so the page and screenshot tools drive the same thing.
 */

/** A figure the viewer shows: an explorer with a figure of their own, a character still shown as a pawn, the scale
 *  pawn, or a monster. `build` makes it stunned where a monster can be. */
export interface ViewerFigure {
  id: string;
  name: string;
  kind: "explorer" | "pawn" | "monster";
  /** The character it shows as a seat shows them, or null for a figure that is no character's. */
  character: string | null;
  build: (stunned: boolean) => ExplorerBuilder;
  /** The seat colour of the ring round its base: the character card's. */
  ring: PaletteKey | null;
  /** A character's Speed track, as their card prints it, and the value they start on; null for any other figure,
   *  which moves at the house's own pace. */
  speed: { track: readonly number[]; start: number } | null;
}

function viewerFigures(): ViewerFigure[] {
  const characters = CHARACTERS.map((character) => {
    const ring = CARD_PALETTE[character.card];
    const build = figureFor(character.id, ring);
    const own = hasFigure(character.id) ? BENCH_EXPLORERS.find((figure) => figure.build === build) : undefined;
    const speed = { track: character.tracks.speed, start: character.tracks.speed[character.start.speed] };
    return own
      ? { id: own.id, name: character.name, kind: "explorer" as const, character: character.id, build: () => build, ring, speed }
      : { id: character.id, name: `${character.name} (pawn)`, kind: "pawn" as const, character: character.id, build: () => build, ring, speed };
  });
  return [
    ...characters.filter(({ kind }) => kind === "explorer"),
    ...characters.filter(({ kind }) => kind === "pawn"),
    { id: "pawn", name: "Scale pawn", kind: "pawn", character: null, build: () => () => pawn(), ring: null, speed: null },
    { id: "banshee", name: "The Banshee", kind: "monster", character: null, build: (stunned) => (seed, gait) => banshee(seed, gait, { stunned }), ring: null, speed: null },
    { id: "spider", name: "The Spider", kind: "monster", character: null, build: (stunned) => (seed, gait) => spider(seed, gait, { stunned }), ring: null, speed: null },
  ];
}

export const VIEWER_FIGURES: readonly ViewerFigure[] = viewerFigures();

/** What a line-up does: every explorer in the same state. */
export const LINE_UP_STATES = ["idle", "walk", "run"] as const satisfies readonly FigureState[];

export const LIGHTS = ["studio", "lamp", "backlit", "moon", "dim", "portrait"] as const;
export type LightPreset = (typeof LIGHTS)[number];
export const LIGHT_LABELS: Record<LightPreset, string> = {
  studio: "Even studio",
  lamp: "Warm lamp in front",
  backlit: "Back-lit",
  moon: "Moonlight only",
  dim: "Dim room",
  portrait: "Portrait backdrop",
};

export const CAMERAS = ["house", "close", "eye", "turntable", "portrait"] as const;
export type CameraPreset = (typeof CAMERAS)[number];
export const CAMERA_LABELS: Record<CameraPreset | "free", string> = {
  house: "House distance",
  close: "Close-up",
  eye: "Eye level",
  turntable: "Turntable",
  portrait: "Portrait",
  free: "Free",
};

export const SPEEDS = [1, 0.5, 0.25] as const;
/** Every Speed value a track prints, lowest first: the line-up's choices. */
const EVERY_SPEED = Array.from({ length: SPEED_VALUES.highest - SPEED_VALUES.lowest + 1 }, (_, i) => SPEED_VALUES.lowest + i);
export type Holding = keyof typeof STAND_INS | "none";
export const HOLDINGS: readonly Holding[] = ["none", "revolver", "candle", "spear"];

/** One frame of the stage's clock, for stepping it by hand. */
export const FRAME = 1 / 60;

export interface ViewerSnapshot {
  figure: string;
  lineUp: boolean;
  state: FigureState;
  /** The figure's named idle bursts, once it is built. */
  bursts: { name: string; lasts: number }[];
  /** The burst playing on cue, or null for the seeded idle. */
  burst: string | null;
  /** Whether the cued burst plays over and over. */
  loop: boolean;
  light: LightPreset;
  camera: CameraPreset | "free";
  speed: number;
  /** The Speed value what is shown walks and runs at, or null for each explorer's starting Speed. */
  stat: number | null;
  /** The Speed values it can be set to: the figure's track's, every one for the line-up, none for a figure without. */
  stats: readonly number[];
  paused: boolean;
  /** The stage's clock, kept up to date while paused. */
  clock: number;
  cloth: ClothMode;
  backlight: boolean;
  ring: boolean;
  holding: Holding;
  stunned: boolean;
  /** Whether what is shown can hold a prop, wear a ring and be stunned. */
  canHold: boolean;
  canRing: boolean;
  canStun: boolean;
  /** Whether the figure (or row) is being built, its shaders and textures readied. */
  building: boolean;
}

export interface FigureViewerApi {
  frameCount: () => number;
  /** The figure built and shown, its textures drawn and its shaders ready. */
  isReady: () => boolean;
  figures: () => string[];
  /** Every character, with the figure that shows them as a seat does: their own, or the pawn in their card's colour. */
  characters: () => { character: string; figure: string }[];
  setFigure: (id: string) => void;
  /** Steps to the next (1) or previous (-1) figure. */
  stepFigure: (by: number) => void;
  setLineUp: (on: boolean) => void;
  setState: (state: FigureState) => void;
  /** Plays the named burst now (on a frozen clock, from the frozen moment), or hands the idle back to its schedule. */
  playBurst: (name: string | null) => void;
  setLoop: (on: boolean) => void;
  setLight: (light: LightPreset) => void;
  setCamera: (camera: CameraPreset) => void;
  /** Turns the camera round the figure by quarter turns. */
  orbit: (quarters: number) => void;
  /** Moves the camera nearer (above 1) or farther (below 1). */
  zoom: (factor: number) => void;
  setSpeed: (speed: number) => void;
  /** Walks and runs what is shown at a Speed value, or (null) each explorer at their starting Speed. */
  setStat: (stat: number | null) => void;
  setPaused: (paused: boolean) => void;
  /** Pauses and moves the stage's clock by whole frames, forward or back. */
  stepFrames: (frames: number) => void;
  /** Pauses the stage's clock at a moment. */
  freezeAt: (seconds: number) => void;
  setCloth: (cloth: ClothMode) => void;
  setBacklight: (on: boolean) => void;
  setRing: (on: boolean) => void;
  setHolding: (holding: Holding) => void;
  setStunned: (stunned: boolean) => void;
}

declare global {
  interface Window {
    __betrayalFigures?: FigureViewerApi;
  }
}

/** The six faces of a probe's ambient cube, +x, −x, +y, −y, +z, −z, each a colour and a strength. */
type Cube = readonly (readonly [PaletteKey, number])[];

interface LightRig {
  background: PaletteKey;
  floor: PaletteKey;
  /** Whether the figure stands on a photographer's sweep, its floor curving up into a backdrop behind it as the
   *  camera sees it, in place of the plain round floor. */
  sweep?: true;
  hemisphere: { sky: PaletteKey; ground: PaletteKey; intensity: number };
  key: { colour: PaletteKey; intensity: number; from: THREE.Vector3 };
  lamp: { colour: PaletteKey; intensity: number; at: THREE.Vector3 };
  probe: Cube;
}

const even = (colour: PaletteKey, side: number, top: number, bottom: number): Cube => [
  [colour, side],
  [colour, side],
  [colour, top],
  [colour, bottom],
  [colour, side],
  [colour, side],
];

/**
 * The lights, live and simple: a hemisphere fill, one directional key, one
 * lamp, and the ambient cube the figure's probe takes in place of a room's
 * baked light (which also drives the backlight). Every rig keeps all three
 * lights, dark where unused, so changing rigs never recompiles a shader.
 * The first view looks from +x +z: the lamp in front stands that side of
 * the figure, the back-lit one the far side.
 */
const LIGHT_RIGS: Record<LightPreset, LightRig> = {
  studio: {
    background: "stoneDark",
    floor: "stone",
    hemisphere: { sky: "boneLight", ground: "stone", intensity: 1.6 },
    key: { colour: "boneLight", intensity: 1.6, from: new THREE.Vector3(0, 6, 5) },
    lamp: { colour: "amber", intensity: 0, at: new THREE.Vector3(1, 1.7, 1) },
    probe: even("boneLight", 1.2, 1.6, 0.5),
  },
  lamp: {
    background: "soot",
    floor: "stoneDark",
    hemisphere: { sky: "moon", ground: "void", intensity: 0.8 },
    key: { colour: "amber", intensity: 0, from: new THREE.Vector3(0, 6, 5) },
    lamp: { colour: "amber", intensity: 6, at: new THREE.Vector3(1.1, 1.8, 1.1) },
    probe: [
      ["amber", 1.6],
      ["moonDark", 0.25],
      ["amber", 0.8],
      ["void", 0.1],
      ["amber", 1.6],
      ["moonDark", 0.25],
    ],
  },
  backlit: {
    background: "soot",
    floor: "stoneDark",
    hemisphere: { sky: "moon", ground: "void", intensity: 0.8 },
    key: { colour: "amber", intensity: 0, from: new THREE.Vector3(0, 6, 5) },
    lamp: { colour: "amber", intensity: 6, at: new THREE.Vector3(-1.1, 1.8, -1.1) },
    probe: [
      ["moonDark", 0.25],
      ["amber", 1.3],
      ["amber", 0.8],
      ["void", 0.1],
      ["moonDark", 0.25],
      ["amber", 1.3],
    ],
  },
  moon: {
    background: "void",
    floor: "stoneDark",
    hemisphere: { sky: HOUSE_LIGHT.fill.sky, ground: HOUSE_LIGHT.fill.ground, intensity: 1.2 },
    key: { colour: HOUSE_LIGHT.moon.colour, intensity: 2.4, from: HOUSE_LIGHT.moon.from },
    lamp: { colour: "amber", intensity: 0, at: new THREE.Vector3(1, 1.7, 1) },
    probe: [
      ["moon", 0.45],
      ["moonDark", 0.15],
      ["moonLight", 0.6],
      ["void", 0.05],
      ["moon", 0.45],
      ["moonDark", 0.15],
    ],
  },
  dim: {
    background: "void",
    floor: "soot",
    hemisphere: { sky: HOUSE_LIGHT.fill.sky, ground: HOUSE_LIGHT.fill.ground, intensity: 1.1 },
    key: { colour: "moonLight", intensity: 0, from: new THREE.Vector3(0, 6, 5) },
    lamp: { colour: "amber", intensity: 2, at: new THREE.Vector3(-2.5, 2.2, 1.5) },
    probe: even("moon", 0.3, 0.45, 0.08),
  },
  // A miniature photographed on a dark backdrop: a soft warm key from the front left, a little warm fill, and the
  // cold moon behind, lighting the backdrop round the figure and catching its edges as a rim.
  portrait: {
    background: "void",
    floor: "ash",
    sweep: true,
    hemisphere: { sky: "moon", ground: "void", intensity: 0.6 },
    key: { colour: "boneLight", intensity: 1.4, from: new THREE.Vector3(0.8, 3, 4) },
    lamp: { colour: "moon", intensity: 4, at: new THREE.Vector3(-1.3, 1, -1.3) },
    probe: [
      ["boneDark", 0.45],
      ["moonLight", 1],
      ["boneLight", 0.6],
      ["void", 0.1],
      ["boneDark", 0.45],
      ["moonLight", 1],
    ],
  },
};

/** How far round the plain floor reaches, in metres. */
const FLOOR_RADIUS = 4;
/** The sweep, in metres: how wide, how far its floor reaches in front of the figure and behind it to the foot of
 *  the backdrop, the radius of the curve between them, and how tall the backdrop stands. */
const SWEEP = { width: 8, front: 3, back: 2.5, bend: 0.8, height: 4 };
const SWEEP_STEPS = 12;
/** The portrait camera: the height it aims at and how far round that its frame reaches, the same for every
 *  figure so their heights stay true, and how far it looks down. */
const PORTRAIT = { aim: 0.85, reach: 0.76, pitch: THREE.MathUtils.degToRad(12) };
/** The camera's tilts for each preset that frames the figure close, and how fast the turntable turns, radians a second. */
const CLOSE_PITCH = THREE.MathUtils.degToRad(18);
/** Where a figure's eyes are, as a share of its height. */
const EYE_HEIGHT = 0.88;
const TURNTABLE_RATE = 0.35;
/** The first view, as the bench's: from the bottom-right corner. */
const FIRST_VIEW = THREE.MathUtils.degToRad(45);
/** How close a close-up comes: the share of the figure's height the frame reaches round it. */
const CLOSE_REACH = 0.62;
/** Pad sticks: the share of the view's distance panned, and the radians turned, per second at full tilt. */
const PAD_PAN = 0.9;
const PAD_TURN = 2;

/** The sweep's surface, facing +z (the camera, once turned to face it) and up: its floor from the front edge back,
 *  round the curve and up the backdrop, as one seamless sheet. */
function sweepGeometry(): THREE.BufferGeometry {
  const { width, front, back, bend, height } = SWEEP;
  const foot = -back + bend;
  const profile = [new THREE.Vector2(front, 0), new THREE.Vector2(foot, 0)];
  for (let step = 1; step <= SWEEP_STEPS; step++) {
    const angle = (step / SWEEP_STEPS) * (Math.PI / 2);
    profile.push(new THREE.Vector2(foot - Math.sin(angle) * bend, bend - Math.cos(angle) * bend));
  }
  profile.push(new THREE.Vector2(-back, height));
  const positions = profile.flatMap(({ x: z, y }) => [-width / 2, y, z, width / 2, y, z]);
  const index = profile.slice(1).flatMap((_, i) => [2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

/** The address's settings, read as the viewer opens; anything it doesn't know throws, so a typo never passes for a choice. */
function fromAddress(search: string) {
  const params = new URLSearchParams(search);
  const one = <T extends string>(name: string, options: readonly T[], fallback: T): T => {
    const value = params.get(name);
    if (value === null) return fallback;
    if (!(options as readonly string[]).includes(value)) throw new Error(`${name}=${value}: it is one of ${options.join(", ")}`);
    return value as T;
  };
  const speed = Number(one("speed", SPEEDS.map(String), "1"));
  const stat = params.get("stat") === null ? null : Number(params.get("stat"));
  if (stat !== null && !Number.isInteger(stat)) throw new Error(`stat=${params.get("stat") ?? ""}: it is a Speed value`);
  const at = Number(params.get("t") ?? 0);
  if (!Number.isFinite(at)) throw new Error(`t=${params.get("t") ?? ""}: it is a time in seconds`);
  return {
    figure: one("explorer", VIEWER_FIGURES.map(({ id }) => id), VIEWER_FIGURES[0].id),
    state: one("state", FIGURE_STATES, "idle"),
    speed,
    stat,
    lineUp: params.has("lineup"),
    burst: params.get("burst"),
    loop: params.get("loop") !== "off",
    light: one("light", LIGHTS, "studio"),
    camera: one<CameraPreset | "free">("camera", CAMERAS, "close"),
    holding: one("prop", HOLDINGS, "none"),
    cloth: clothMode(),
    // As the probe reads it: on unless the address turns it off.
    backlight: params.get("backlight") !== "off",
    ring: params.get("ring") !== "off",
    stunned: params.has("stunned"),
    paused: params.has("paused"),
    at,
  } satisfies Partial<ViewerSnapshot> & { at: number };
}

/** Keeps the address in step with the viewer, so it can be shared as a link to exactly this view. */
function setSearchParam(name: string, value: string | null) {
  const url = new URL(window.location.href);
  if (value === null) url.searchParams.delete(name);
  else url.searchParams.set(name, value);
  window.history.replaceState(window.history.state, "", url);
}

/** The Speed values the line-up, or a figure, can walk at. */
function statsOf(lineUp: boolean, figure: string): readonly number[] {
  if (lineUp) return EVERY_SPEED;
  const speed = figureById(figure).speed;
  return speed ? [...new Set(speed.track)] : [];
}

function figureById(id: string): ViewerFigure {
  const found = VIEWER_FIGURES.find((figure) => figure.id === id);
  if (!found) throw new Error(`The figure viewer has no figure "${id}"`);
  return found;
}

/** The hands of the figure standing anywhere in `root`. */
function handsIn(root: THREE.Object3D): Hands | null {
  let found: Hands | null = null;
  root.traverse((object) => {
    found ??= handsOf(object) ?? null;
  });
  return found;
}

/** What the viewer shows, as built: its root, the figure in it (none for a row), and what poses and lights it. */
interface Subject {
  root: THREE.Object3D;
  figure: THREE.Object3D | null;
  probe: ProbeUniform;
  batch: PartBatch;
  animations: Animation[];
  /** The middle of what is shown at rest, and how tall it stands. */
  centre: THREE.Vector3;
  height: number;
  /** How far round its centre a close-up frames it. */
  reach: number;
  canHold: boolean;
}

export function createFigureViewer(search: string) {
  const { at: startsAt, ...asked } = fromAddress(search);
  let snapshot: ViewerSnapshot = {
    ...asked,
    bursts: [],
    stats: statsOf(asked.lineUp, asked.figure),
    clock: startsAt,
    canHold: false,
    canRing: false,
    canStun: false,
    building: true,
  };
  if (snapshot.lineUp && !(LINE_UP_STATES as readonly string[]).includes(snapshot.state)) {
    throw new Error(`A line-up is ${LINE_UP_STATES.join(", ")}, not ${snapshot.state}`);
  }
  if (snapshot.stat !== null && !snapshot.stats.includes(snapshot.stat)) throw new Error(`stat=${snapshot.stat}: it is one of ${snapshot.stats.join(", ")}`);
  const listeners = new Set<() => void>();
  const update = (next: Partial<ViewerSnapshot>) => {
    snapshot = { ...snapshot, ...next };
    for (const listener of listeners) listener();
  };
  let mounted: { rebuild: () => void; recue: () => void; orbit: (quarters: number) => void; zoom: (factor: number) => void } | null = null;
  let frames = 0;
  let ready = false;
  /** The stage's clock, and when on it the cued burst started. */
  let clock = startsAt;
  // A burst the address asks for starts as the clock does, so `&t=` picks a moment within it.
  let cuedAt = 0;

  const rebuild = () => mounted?.rebuild();
  /** The Speed choices for what is shown next, keeping the value chosen where it is one of them. */
  const statsFor = (lineUp: boolean, figure: string) => {
    const stats = statsOf(lineUp, figure);
    const stat = snapshot.stat !== null && stats.includes(snapshot.stat) ? snapshot.stat : null;
    setSearchParam("stat", stat === null ? null : String(stat));
    return { stats, stat };
  };
  const api: FigureViewerApi = {
    frameCount: () => frames,
    isReady: () => ready,
    figures: () => VIEWER_FIGURES.map(({ id }) => id),
    characters: () => VIEWER_FIGURES.flatMap(({ id, character }) => (character === null ? [] : [{ character, figure: id }])),
    setFigure: (id) => {
      figureById(id);
      update({ figure: id, lineUp: false, burst: null, ...statsFor(false, id) });
      setSearchParam("explorer", id);
      setSearchParam("lineup", null);
      setSearchParam("burst", null);
      rebuild();
    },
    stepFigure: (by) => {
      const at = VIEWER_FIGURES.findIndex(({ id }) => id === snapshot.figure);
      api.setFigure(VIEWER_FIGURES[THREE.MathUtils.euclideanModulo(at + by, VIEWER_FIGURES.length)].id);
    },
    setLineUp: (on) => {
      const state = on && !(LINE_UP_STATES as readonly string[]).includes(snapshot.state) ? "idle" : snapshot.state;
      update({ lineUp: on, state, burst: null, ...statsFor(on, snapshot.figure) });
      setSearchParam("lineup", on ? "" : null);
      setSearchParam("state", state === "idle" ? null : state);
      setSearchParam("burst", null);
      rebuild();
    },
    setState: (state) => {
      if (snapshot.lineUp && !(LINE_UP_STATES as readonly string[]).includes(state)) throw new Error(`A line-up is ${LINE_UP_STATES.join(", ")}, not ${state}`);
      update({ state });
      setSearchParam("state", state === "idle" ? null : state);
      rebuild();
    },
    playBurst: (name) => {
      if (name !== null && !snapshot.bursts.some((known) => known.name === name)) throw new Error(`${snapshot.figure} has no burst "${name}"`);
      cuedAt = clock;
      update({ burst: name });
      setSearchParam("burst", name);
      mounted?.recue();
    },
    setLoop: (on) => {
      update({ loop: on });
      setSearchParam("loop", on ? null : "off");
      mounted?.recue();
    },
    setLight: (light) => {
      update({ light });
      setSearchParam("light", light === "studio" ? null : light);
    },
    setCamera: (camera) => {
      update({ camera });
      setSearchParam("camera", camera === "close" ? null : camera);
    },
    orbit: (quarters) => mounted?.orbit(quarters),
    zoom: (factor) => mounted?.zoom(factor),
    setSpeed: (speed) => {
      if (!(SPEEDS as readonly number[]).includes(speed)) throw new Error(`The viewer plays at ${SPEEDS.join(", ")}, not ${speed}`);
      update({ speed });
      setSearchParam("speed", speed === 1 ? null : String(speed));
    },
    setStat: (stat) => {
      if (stat !== null && !snapshot.stats.includes(stat)) throw new Error(`The Speed is one of ${snapshot.stats.join(", ")}, not ${stat}`);
      update({ stat });
      setSearchParam("stat", stat === null ? null : String(stat));
      rebuild();
    },
    setPaused: (paused) => {
      update({ paused, clock });
      setSearchParam("paused", paused ? "" : null);
    },
    stepFrames: (count) => {
      clock = Math.max(0, clock + count * FRAME);
      api.setPaused(true);
    },
    freezeAt: (seconds) => {
      clock = seconds;
      api.setPaused(true);
    },
    setCloth: (cloth) => {
      if (!(CLOTH_MODES as readonly string[]).includes(cloth)) throw new Error(`cloth=${cloth}: it is one of ${CLOTH_MODES.join(", ")}`);
      update({ cloth });
      // The figures read their cloth from the address as they are built.
      setSearchParam("cloth", cloth === "net" ? null : cloth);
      rebuild();
    },
    setBacklight: (on) => {
      update({ backlight: on });
      // The probe reads the backlight from the address as it lights the figure.
      setSearchParam("backlight", on ? null : "off");
      rebuild();
    },
    setRing: (on) => {
      update({ ring: on });
      setSearchParam("ring", on ? null : "off");
      rebuild();
    },
    setHolding: (holding) => {
      update({ holding });
      setSearchParam("prop", holding === "none" ? null : holding);
      rebuild();
    },
    setStunned: (stunned) => {
      update({ stunned, burst: null });
      setSearchParam("stunned", stunned ? "" : null);
      setSearchParam("burst", null);
      rebuild();
    },
  };

  /** Builds what the snapshot asks for, lit by its own probe and batched, at rest. */
  function buildSubject(): Subject {
    const { lineUp, state, holding } = snapshot;
    let root: THREE.Object3D;
    let figure: THREE.Object3D | null = null;
    let ring: PaletteKey | null = null;
    if (lineUp) {
      root = explorerLineUp("figures", state === "idle" ? undefined : (state as "walk" | "run"), holding === "none" ? undefined : holding, { speed: snapshot.stat ?? undefined });
    } else {
      const chosen = figureById(snapshot.figure);
      const made = inMotion(chosen.build(chosen.kind === "monster" && snapshot.stunned), `figures:${chosen.id}`, state, snapshot.stat ?? chosen.speed?.start);
      root = made.root;
      figure = made.figure;
      const hands = handsIn(figure);
      if (hands && holding !== "none") holdIn(hands.right, STAND_INS[holding]());
      ring = isGrounded(figure) ? chosen.ring : null;
      if (ring !== null && snapshot.ring) figure.parent?.add(colourRing(ring));
    }
    const animations: Animation[] = [];
    root.traverse((object) => {
      const animation = animationOf(object);
      if (animation) animations.push(animation);
    });
    // Measured as posed at the moment it first shows: a figure's parts stand where its builder left them until then.
    for (const animation of animations) animation(clock);
    const box = new THREE.Box3().setFromObject(root);
    const centre = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const height = Math.max(size.y, 0.3);
    const reach = lineUp ? Math.max(size.x, size.z) * 0.75 : Math.max(height * CLOSE_REACH, Math.max(size.x, size.z) * 0.6);
    return {
      root,
      figure,
      probe: patchProbe(root),
      batch: batchParts(root),
      animations,
      centre,
      height,
      reach,
      canHold: lineUp || (figure !== null && handsIn(figure) !== null),
    };
  }

  function mount(ctx: ThreeSceneContext): ThreeSceneHandlers {
    const { scene, camera, renderer } = ctx;
    camera.fov = FIELD_OF_VIEW;
    renderer.toneMappingExposure = 1.5;
    scene.fog = null;
    const readyShaders = shaderReadier(renderer, camera, scene);

    const hemisphere = new THREE.HemisphereLight();
    const key = new THREE.DirectionalLight();
    const lamp = new THREE.PointLight(undefined, 0, 6, 1.5);
    const floorMaterial = new THREE.MeshLambertMaterial();
    const floor = new THREE.Mesh(new THREE.CircleGeometry(FLOOR_RADIUS, 64).rotateX(-Math.PI / 2), floorMaterial);
    floor.position.y = -0.002;
    const sweep = new THREE.Mesh(sweepGeometry(), floorMaterial);
    sweep.position.y = -0.002;
    const stage = group(hemisphere, key, key.target, lamp, floor, sweep);
    scene.add(stage);
    const background = new THREE.Color();
    scene.background = background;
    const cube = Array.from({ length: 6 }, () => new THREE.Vector3());
    const tint = new THREE.Color();
    const light = () => {
      const rig = LIGHT_RIGS[snapshot.light];
      background.set(paletteHex(rig.background));
      floorMaterial.color.set(paletteHex(rig.floor));
      floor.visible = rig.sweep === undefined;
      sweep.visible = !floor.visible;
      hemisphere.color.set(paletteHex(rig.hemisphere.sky));
      hemisphere.groundColor.set(paletteHex(rig.hemisphere.ground));
      hemisphere.intensity = rig.hemisphere.intensity;
      key.color.set(paletteHex(rig.key.colour));
      key.intensity = rig.key.intensity;
      key.position.copy(rig.key.from);
      lamp.color.set(paletteHex(rig.lamp.colour));
      lamp.intensity = rig.lamp.intensity;
      lamp.position.copy(rig.lamp.at);
      rig.probe.forEach(([colour, strength], face) => {
        tint.set(paletteHex(colour));
        cube[face].set(tint.r, tint.g, tint.b).multiplyScalar(strength);
      });
    };

    let shown: Subject | null = null;
    /** The subject being readied to replace what is shown, and whether a newer one has replaced it. */
    let pending: Subject | null = null;

    const recue = () => {
      if (!shown?.figure || snapshot.bursts.length === 0) return;
      cueBurst(shown.figure, snapshot.burst === null ? null : { name: snapshot.burst, at: cuedAt, repeat: snapshot.loop });
    };

    const rebuildNow = () => {
      if (pending) disposeTree(pending.root);
      ready = false;
      update({ building: true });
      const next = buildSubject();
      pending = next;
      const bursts = next.figure ? burstsOf(next.figure) : [];
      const burst = snapshot.burst !== null && bursts.some(({ name }) => name === snapshot.burst) ? snapshot.burst : null;
      if (burst !== snapshot.burst) setSearchParam("burst", null);
      const chosen = snapshot.lineUp ? null : figureById(snapshot.figure);
      update({
        bursts,
        burst,
        canHold: next.canHold,
        canRing: chosen !== null && chosen.ring !== null && next.figure !== null && isGrounded(next.figure),
        canStun: chosen?.kind === "monster",
      });
      void Promise.all([texturesUnder(next.root), readyShaders(next.root)]).then(() => {
        if (pending !== next) return;
        pending = null;
        if (shown) {
          stage.remove(shown.root);
          disposeTree(shown.root);
        }
        shown = next;
        stage.add(next.root);
        recue();
        ready = true;
        update({ building: false });
      });
    };

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.minDistance = 0.3;
    controls.maxDistance = 80;
    controls.maxPolarAngle = THREE.MathUtils.degToRad(88);
    // As on the bench: one finger pans, a pinch zooms, and two fingers dragged together turn and tilt.
    controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
    controls.listenToKeyEvents(window);
    controls.addEventListener("start", () => {
      if (snapshot.camera !== "free") update({ camera: "free" });
    });

    /** The presets' turn round the figure, and how much nearer than the preset's own distance they stand. */
    let azimuth = FIRST_VIEW;
    let nearer = 1;
    const aim = new THREE.Vector3();
    const toward = new THREE.Vector3();

    /** Where a preset puts the camera now: round the figure where it is, as tall as it stands. */
    const placeCamera = (subject: Subject) => {
      if (snapshot.camera === "free") return;
      const preset = snapshot.camera;
      const vertical = THREE.MathUtils.degToRad(camera.fov);
      const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * camera.aspect);
      const fit = subject.reach / Math.sin(Math.min(vertical, horizontal) / 2);
      // A close preset follows the figure round its course; the house's view stands over the middle of the floor.
      if (subject.figure) subject.figure.getWorldPosition(aim);
      else aim.set(0, 0, 0);
      let pitch = CLOSE_PITCH;
      let distance = fit;
      if (preset === "house") {
        aim.set(0, 0, 0);
        pitch = DEFAULT_PITCH;
        distance = cameraDistance(1, camera.aspect);
      } else if (preset === "portrait") {
        aim.y = PORTRAIT.aim;
        pitch = PORTRAIT.pitch;
        distance = PORTRAIT.reach / Math.sin(Math.min(vertical, horizontal) / 2);
      } else {
        aim.x += subject.figure ? 0 : subject.centre.x;
        aim.z += subject.figure ? 0 : subject.centre.z;
        aim.y = subject.centre.y;
        // At eye level the camera stands as high as the figure's eyes, looking at its middle.
        if (preset === "eye") pitch = Math.atan2(subject.height * EYE_HEIGHT - aim.y, fit);
      }
      distance /= nearer;
      toward.set(Math.sin(azimuth) * Math.cos(pitch), Math.sin(pitch), Math.cos(azimuth) * Math.cos(pitch));
      camera.position.copy(aim).addScaledVector(toward, distance);
      // The backdrop stands behind the figure, wherever the camera has turned to.
      sweep.position.set(aim.x, sweep.position.y, aim.z);
      sweep.rotation.y = azimuth;
      controls.target.copy(aim);
      camera.lookAt(aim);
      camera.near = Math.max(0.02, distance / 100);
      camera.far = distance * 4 + FLOOR_RADIUS * 4;
      camera.updateProjectionMatrix();
    };

    const spherical = new THREE.Spherical();
    const offset = new THREE.Vector3();
    /** The presets turn round the figure by quarters and zoom by a factor; the free camera swings round its target. */
    const orbit = (quarters: number) => {
      if (snapshot.camera !== "free") {
        azimuth += (quarters * Math.PI) / 2;
        return;
      }
      spherical.setFromVector3(offset.copy(camera.position).sub(controls.target));
      spherical.theta += (quarters * Math.PI) / 2;
      camera.position.copy(controls.target).add(offset.setFromSpherical(spherical));
    };
    const zoom = (factor: number) => {
      if (snapshot.camera !== "free") {
        nearer = THREE.MathUtils.clamp(nearer * factor, 0.25, 6);
        return;
      }
      spherical.setFromVector3(offset.copy(camera.position).sub(controls.target));
      spherical.radius = THREE.MathUtils.clamp(spherical.radius / factor, controls.minDistance, controls.maxDistance);
      camera.position.copy(controls.target).add(offset.setFromSpherical(spherical));
    };

    /** The pads as last read: their buttons drive the viewer, their sticks the free camera. */
    let pads: readonly PadSnapshot[] = [];
    const cycle = <T>(options: readonly T[], now: T, by = 1): T => options[THREE.MathUtils.euclideanModulo(options.indexOf(now) + by, options.length)];
    const states = () => (snapshot.lineUp ? LINE_UP_STATES : FIGURE_STATES);
    const unsubscribePads = subscribeGamepads({
      onFrame: (snapshots) => {
        pads = snapshots;
      },
      onConnectionChange: (snapshots) => {
        pads = snapshots;
      },
      onButton: ({ name, pressed }) => {
        if (!pressed) return;
        if (name === "RB") api.stepFigure(1);
        if (name === "LB") api.stepFigure(-1);
        if (name === "A") api.setPaused(!snapshot.paused);
        if (name === "DpadRight") api.stepFrames(1);
        if (name === "DpadLeft") api.stepFrames(-1);
        if (name === "DpadUp") api.setState(cycle(states(), snapshot.state, -1));
        if (name === "DpadDown") api.setState(cycle(states(), snapshot.state));
        if (name === "X") playNextBurst();
        if (name === "B") api.setSpeed(cycle(SPEEDS, snapshot.speed as (typeof SPEEDS)[number]));
        if (name === "Y") api.setCamera(snapshot.camera === "free" ? "close" : cycle(CAMERAS, snapshot.camera));
        if (name === "View") api.setLight(cycle(LIGHTS, snapshot.light));
        if (name === "Menu") api.setLineUp(!snapshot.lineUp);
      },
    });
    /** Plays the burst after the one playing, round to the seeded idle after the last. */
    const playNextBurst = () => {
      const names = [null, ...snapshot.bursts.map(({ name }) => name)];
      api.playBurst(cycle(names, snapshot.burst));
    };
    const padCamera = (delta: number) => {
      for (const pad of pads) {
        const read = readPad(pad).controls;
        if (!read) continue;
        const { leftStick, rightStick, leftTrigger, rightTrigger } = read;
        const pull = rightTrigger - leftTrigger;
        if (leftStick.x === 0 && leftStick.y === 0 && rightStick.x === 0 && rightStick.y === 0 && pull === 0) continue;
        if (snapshot.camera !== "free") update({ camera: "free" });
        offset.copy(camera.position).sub(controls.target);
        const distance = offset.length();
        // Left stick pans over the floor, as the camera faces; right stick turns and tilts; the triggers zoom.
        const forward = new THREE.Vector3(-offset.x, 0, -offset.z).normalize();
        const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0));
        controls.target.add(right.multiplyScalar(leftStick.x).addScaledVector(forward, -leftStick.y).multiplyScalar(distance * PAD_PAN * delta));
        spherical.setFromVector3(offset);
        spherical.theta -= rightStick.x * PAD_TURN * delta;
        spherical.phi = THREE.MathUtils.clamp(spherical.phi + rightStick.y * PAD_TURN * delta, 0.05, controls.maxPolarAngle);
        spherical.radius = THREE.MathUtils.clamp(distance * Math.exp(-pull * 1.5 * delta), controls.minDistance, controls.maxDistance);
        camera.position.copy(controls.target).add(offset.setFromSpherical(spherical));
      }
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.metaKey || event.ctrlKey || event.altKey) return;
      const digit = Number(event.key);
      if (Number.isInteger(digit) && digit >= 1 && digit <= snapshot.bursts.length) api.playBurst(snapshot.bursts[digit - 1].name);
      const actions: Partial<Record<string, () => void>> = {
        "]": () => api.stepFigure(1),
        "[": () => api.stepFigure(-1),
        " ": () => api.setPaused(!snapshot.paused),
        ".": () => api.stepFrames(1),
        ",": () => api.stepFrames(-1),
        "0": () => api.playBurst(null),
        s: () => api.setState(cycle(states(), snapshot.state)),
        S: () => api.setState(cycle(states(), snapshot.state, -1)),
        l: () => api.setLight(cycle(LIGHTS, snapshot.light)),
        c: () => api.setCamera(snapshot.camera === "free" ? "close" : cycle(CAMERAS, snapshot.camera)),
        v: () => api.setSpeed(cycle(SPEEDS, snapshot.speed as (typeof SPEEDS)[number])),
        p: () => api.setStat(cycle([null, ...snapshot.stats], snapshot.stat)),
        P: () => api.setStat(cycle([null, ...snapshot.stats], snapshot.stat, -1)),
        u: () => api.setLineUp(!snapshot.lineUp),
        q: () => orbit(-1),
        e: () => orbit(1),
        "-": () => zoom(1 / 1.25),
        "=": () => zoom(1.25),
      };
      const action = actions[event.key];
      if (!action) return;
      event.preventDefault();
      action();
    };
    window.addEventListener("keydown", onKey);

    const applyResolution = () => ctx.setPixelRatio(window.devicePixelRatio);

    mounted = { rebuild: rebuildNow, recue, orbit, zoom };
    window.__betrayalFigures = api;
    light();
    rebuildNow();

    return {
      onFrame: (delta) => {
        frames++;
        if (!snapshot.paused) clock += delta * snapshot.speed;
        if (snapshot.camera === "turntable") azimuth += delta * TURNTABLE_RATE;
        light();
        padCamera(delta);
        controls.update();
        if (shown) {
          shown.probe.value.forEach((face, i) => face.copy(cube[i]));
          for (const animation of shown.animations) animation(clock);
          shown.batch.sync();
          placeCamera(shown);
        }
      },
      onResize: () => applyResolution(),
      dispose: () => {
        controls.stopListenToKeyEvents();
        controls.dispose();
        window.removeEventListener("keydown", onKey);
        unsubscribePads();
        if (pending) disposeTree(pending.root);
        pending = null;
        if (shown) disposeTree(shown.root);
        shown = null;
        scene.remove(stage);
        disposeTree(stage);
        mounted = null;
        delete window.__betrayalFigures;
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

export type FigureViewer = ReturnType<typeof createFigureViewer>;
