import { Box3, BufferAttribute, Color, PerspectiveCamera, RenderTarget, Scene, Vector3, WebGPURenderer, type Node } from "three/webgpu";
import { cameraPosition, exp, float, mix, positionWorld, uniform, vec3 } from "three/tsl";
import { themeColor } from "@/shared/lib/three/theme-color";
import type { ArtModel, KitMaterials } from "../catalogue";
import { placeVersion, type RoadsideMaterials } from "../roadside/index";
import { flip, type LinearPicture } from "./flip";

/*
 * Each model's near and far versions drawn as the game draws them, at the size the swap gives them on the floor
 * screen, from all round: the near version well inside its range and the far just past the swap, so each is whole,
 * each framed to the same metres a pixel. Two established measures say whether the swap is noticed:
 *
 * - Shape, as Simplygon judges a level of detail: how far the far version's outline lies from the near one's, in
 *   pixels of the floor's screen, from the side where it lies furthest. Not the very furthest pixel, which a speck
 *   or a hairline decides: the distance all but a fiftieth of what either covers keeps within, so a part counts once
 *   it's a share of the model, a leg or a mast. A deviation shrinks in step with distance, so it says outright what
 *   swap would hide it.
 * - Look, by FLIP (`flip.ts`): how different the two pictures are to a person at the floor's viewing distance, over
 *   what the model covers, from its colours after the eye's contrast sensitivity and from its edges and points.
 *
 * So a change has two cures: a later swap, for the near version's cost over more ground, or a far version that
 * matches. A model that changes is told the earliest swap, up to twice its own, that hides both; past that, the far
 * version is what's wrong.
 */

/** The floor's screen: 1440 pixels tall under the game's 60° view, a 34-inch 3440×1440 seen from 70 cm. */
const SCREEN_ROWS = 1440;
const FIELD_OF_VIEW = 60;
const PIXELS_PER_DEGREE = ((0.7 * 3440) / 0.8) * (Math.PI / 180);
const SUN = { azimuthDeg: 215, elevationDeg: 30 };
const HAZE_M = 16000;
/**
 * Where each version is drawn whole: the near at a share of the swap inside every place's spread, the far past the
 * swap's band yet a share of the way from the swap to the reach, short of where it dissolves.
 */
const NEAR_AT = 0.6;
const FAR_AT = 1.3;
const FAR_OF_REACH = 0.4;
const VIEWS = [3, 25].flatMap((elevationDeg) => Array.from({ length: 8 }, (_, step) => ({ azimuthDeg: step * 45, elevationDeg })));
/**
 * What a swap may change, set where art matched by hand and accepted in the game (lamps, poles, sheds, bales, sheep,
 * cows, boulders, lindens, the stone wall) stays and what the owner has seen change (the daisy's flat head turning
 * pointed, a cyclist turning into a pole) doesn't: an outline that moves 6 pixels, a sheep's legs, and FLIP's mean
 * between the stone wall's and a deck chair's. Simplygon's own rule of thumb, a pixel, is for a mesh simplified by
 * machine, with no crossfade to soften the swap.
 */
export const NOTICED = { deviationPx: 6, look: 0.55 };
/** The latest swap tried as a cure, as a multiple of the model's own: the near version over four times the ground. */
const LATEST_SWAP = 2;
const SWAPS_TRIED = [1.25, 1.5, 2];
/** The outline is measured on pictures this many times finer than the floor's screen, so a deviation reads under a pixel. */
const FINER = 2;
const LARGEST = 1024;
/** The share of what either version covers that may lie further off than the deviation. */
const STRAY = 0.02;
/** A readback's rows are padded to 256 bytes, so a square this many pixels a side reads back as it was drawn. */
const ROW_PIXELS = 64;

const token = (name: string) => themeColor(`--color-aland-drive-${name}`);
const colour = (name: string): Node<"vec3"> => {
  const { r, g, b } = token(name);
  return vec3(r, g, b);
};
const linear = (name: string) => {
  const { r, g, b } = token(name);
  return new Vector3(r, g, b);
};
const hazed = (shade: Node<"vec3">) => mix(shade, colour("sky"), float(1).sub(exp(positionWorld.sub(cameraPosition).length().div(HAZE_M).pow(2).negate())));
const inputs = { linear, colour, hazed, sun: SUN, time: uniform(0) };
const KEY = [255, 0, 255];

const renderer = new WebGPURenderer({ antialias: false, reversedDepthBuffer: true });
await renderer.init();
if (!("isWebGPUBackend" in renderer.backend)) throw new Error("no WebGPU");

const kitMaterials = new Map<KitMaterials, RoadsideMaterials>();
const materialsOf = (make: KitMaterials) => {
  let made = kitMaterials.get(make);
  if (made === undefined) kitMaterials.set(make, (made = make(inputs)));
  return made;
};

/** A version as drawn: what it covers on the fine picture, and how it looks at the floor screen's own pixels. */
interface Drawn {
  fine: number;
  finer: number;
  covers: Uint8Array;
  seen: LinearPicture;
  /** What it covers at the floor screen's pixels. */
  shows: Uint8Array;
}

async function draw(entry: ArtModel, version: "near" | "far", view: (typeof VIEWS)[number], swapM?: number): Promise<Drawn> {
  const drawn = entry.drawn;
  if (drawn === undefined) throw new Error(`${entry.name} has no way to be drawn`);
  const model = swapM === undefined ? drawn.model : { ...drawn.model, swapM };
  const box = new Box3().setFromBufferAttribute(model.near.getAttribute("position") as BufferAttribute);
  const middle = box.getCenter(new Vector3());
  const radius = box.getSize(new Vector3()).length() / 2;
  const metresPerPixel = (2 * model.swapM * Math.tan((FIELD_OF_VIEW * Math.PI) / 360)) / SCREEN_ROWS;
  const size = Math.min(LARGEST, Math.max(ROW_PIXELS, Math.ceil(((2.2 * radius) / metresPerPixel + 4) / ROW_PIXELS) * ROW_PIXELS));
  const finer = Math.max(1, Math.min(FINER, Math.floor(LARGEST / size)));
  const fine = size * finer;
  const distance = version === "near" ? model.swapM * NEAR_AT : Math.min(model.swapM * FAR_AT, model.swapM + (model.reachM - model.swapM) * FAR_OF_REACH);
  const [azimuth, elevation] = [(view.azimuthDeg * Math.PI) / 180, (view.elevationDeg * Math.PI) / 180];
  const way = new Vector3(Math.cos(elevation) * Math.sin(azimuth), Math.sin(elevation), Math.cos(elevation) * Math.cos(azimuth));
  const camera = new PerspectiveCamera((2 * Math.atan((size * metresPerPixel) / 2 / distance) * 180) / Math.PI, 1, Math.max(0.05, distance - radius * 2), distance + radius * 2);
  camera.position.copy(middle).addScaledVector(way, distance);
  camera.lookAt(middle);
  camera.updateMatrixWorld();
  const scene = new Scene();
  scene.background = new Color(KEY[0] / 255, KEY[1] / 255, KEY[2] / 255);
  const meshes = "materials" in drawn ? placeVersion(model, version, [{ x: 0, y: 0, z: 0 }], materialsOf(drawn.materials)) : drawn.place(version, model.swapM, inputs);
  for (const mesh of meshes) scene.add(mesh);
  const target = new RenderTarget(fine, fine);
  renderer.setRenderTarget(target);
  renderer.render(scene, camera);
  const pixels = (await renderer.readRenderTargetPixelsAsync(target, 0, 0, fine, fine)) as Uint8Array;
  renderer.setRenderTarget(null);
  target.dispose();
  // Read back in linear light; the background stands as the sky the model is seen against.
  const sky = linear("sky");
  const covers = new Uint8Array(fine * fine);
  const rgb = new Float32Array(size * size * 3);
  const shows = new Uint8Array(size * size);
  for (let at = 0; at < fine * fine; at++) {
    const keyed = pixels[at * 4] === KEY[0] && pixels[at * 4 + 1] === KEY[1] && pixels[at * 4 + 2] === KEY[2];
    const coarse = Math.floor(Math.floor(at / fine) / finer) * size + Math.floor((at % fine) / finer);
    const shade = keyed ? [sky.x, sky.y, sky.z] : [pixels[at * 4] / 255, pixels[at * 4 + 1] / 255, pixels[at * 4 + 2] / 255];
    for (let k = 0; k < 3; k++) rgb[coarse * 3 + k] += shade[k] / (finer * finer);
    if (keyed) continue;
    covers[at] = 1;
    shows[coarse] = 1;
  }
  return { fine, finer, covers, seen: { width: size, height: size, rgb }, shows };
}

/** Each pixel's squared distance to the nearest one covered: Felzenszwalb and Huttenlocher's exact transform. */
function distances(covers: Uint8Array, side: number): Float64Array {
  const out = Float64Array.from(covers, (on) => (on ? 0 : 1e12));
  const f = new Float64Array(side);
  const hull = new Int32Array(side);
  const bounds = new Float64Array(side + 1);
  const pass = (start: number, stride: number) => {
    for (let k = 0; k < side; k++) f[k] = out[start + k * stride];
    let top = 0;
    [hull[0], bounds[0], bounds[1]] = [0, -Infinity, Infinity];
    for (let q = 1; q < side; q++) {
      let s = (f[q] + q * q - (f[hull[top]] + hull[top] * hull[top])) / (2 * q - 2 * hull[top]);
      while (s <= bounds[top]) {
        top--;
        s = (f[q] + q * q - (f[hull[top]] + hull[top] * hull[top])) / (2 * q - 2 * hull[top]);
      }
      top++;
      [hull[top], bounds[top], bounds[top + 1]] = [q, s, Infinity];
    }
    let k = 0;
    for (let q = 0; q < side; q++) {
      while (bounds[k + 1] < q) k++;
      out[start + q * stride] = (q - hull[k]) ** 2 + f[hull[k]];
    }
  };
  for (let row = 0; row < side; row++) pass(row * side, 1);
  for (let column = 0; column < side; column++) pass(column, side);
  return out;
}

/**
 * How far apart two outlines lie, in pixels of the floor's screen: how far from the other version all but `STRAY` of
 * what either covers lies. A version with nothing in view is as far off as the picture is wide.
 */
function deviation(near: Drawn, far: Drawn): number {
  const side = near.fine;
  const [toNear, toFar] = [distances(near.covers, side), distances(far.covers, side)];
  // Counted by whole fine pixels of distance, the furthest bin holding all that's off the picture.
  const counts = new Uint32Array(side + 1);
  let total = 0;
  for (let at = 0; at < side * side; at++) {
    for (const [mine, theirs] of [[far.covers, toNear], [near.covers, toFar]] as const) {
      if (!mine[at]) continue;
      counts[Math.min(side, Math.ceil(Math.sqrt(theirs[at])))]++;
      total++;
    }
  }
  let [within, bin] = [0, 0];
  while (bin < side && (within += counts[bin]) < total * (1 - STRAY)) bin++;
  return bin / near.finer;
}

/** FLIP's error summed over what either version shows, and how many pixels that is. */
function look(near: Drawn, far: Drawn): { error: number; pixels: number } {
  const errors = flip(near.seen, far.seen, PIXELS_PER_DEGREE);
  let [error, pixels] = [0, 0];
  for (let at = 0; at < errors.length; at++) {
    if (!near.shows[at] && !far.shows[at]) continue;
    error += errors[at];
    pixels++;
  }
  return { error, pixels };
}

export interface LodResult {
  name: string;
  /** How far the outline moves at the swap, in pixels of the floor's screen, at the view where it moves most. */
  deviation: number;
  /** FLIP's mean error over what the model covers, over every view. */
  look: number;
  /** The view where each changes most, as azimuth and elevation in degrees, to look at. */
  deviationView: [number, number];
  lookView: [number, number];
  /** Pixels the two cover between them, on average over the views. */
  pixels: number;
  swapM: number;
  reachM: number;
  /** For a model whose change is noticed: the earliest swap tried that hides it, or null where none up to twice its own does. */
  hiddenAtM?: number | null;
}

export const noticed = (result: Pick<LodResult, "deviation" | "look">) => result.deviation > NOTICED.deviationPx || result.look > NOTICED.look;

async function measure(entry: ArtModel, swapM?: number) {
  let [most, error, pixels, worstLook] = [-1, 0, 0, -1];
  let [deviationView, lookView]: [number, number][] = [
    [0, 0],
    [0, 0],
  ];
  for (const view of VIEWS) {
    const [near, far] = [await draw(entry, "near", view, swapM), await draw(entry, "far", view, swapM)];
    const moved = deviation(near, far);
    if (moved > most) [most, deviationView] = [moved, [view.azimuthDeg, view.elevationDeg]];
    const seen = look(near, far);
    [error, pixels] = [error + seen.error, pixels + seen.pixels];
    if (seen.pixels > 0 && seen.error / seen.pixels > worstLook) [worstLook, lookView] = [seen.error / seen.pixels, [view.azimuthDeg, view.elevationDeg]];
  }
  const round = (value: number, places: number) => Number(value.toFixed(places));
  return { deviation: round(most, 2), look: round(pixels === 0 ? 0 : error / pixels, 3), deviationView, lookView, pixels: Math.round(pixels / VIEWS.length) };
}

/**
 * Every drawn model of these catalogues with a far version, compared, and each noticed one tried at later swaps: this
 * page's `part` of `parts`, so several pages share the work.
 */
export async function checkAll(catalogues: Record<string, { artModels: () => ArtModel[] }>, part: number, parts: number): Promise<LodResult[]> {
  const results: LodResult[] = [];
  let index = 0;
  for (const [kit, { artModels }] of Object.entries(catalogues)) {
    for (const entry of artModels()) {
      if (entry.drawn === undefined || entry.drawn.model.far === null) continue;
      if (index++ % parts !== part) continue;
      const { swapM, reachM } = entry.drawn.model;
      const result: LodResult = { name: `${kit}: ${entry.name}`, ...(await measure(entry)), swapM, reachM };
      if (noticed(result)) {
        result.hiddenAtM = null;
        // A deviation shrinks in step with distance, so the outline alone says how far the swap must go.
        const outlineHidden = swapM * Math.max(1, result.deviation / NOTICED.deviationPx);
        const tried = [outlineHidden, ...SWAPS_TRIED.map((factor) => swapM * factor)].filter((at) => at >= outlineHidden && at > swapM && at <= swapM * LATEST_SWAP && at < reachM * 0.8).sort((a, b) => a - b);
        for (const at of tried) {
          if (!noticed(await measure(entry, at))) {
            result.hiddenAtM = Math.ceil(at);
            break;
          }
        }
      }
      results.push(result);
    }
  }
  return results;
}

/** One model's two versions from a view, side by side at the floor screen's pixels, for a look by eye: at its own swap, or one tried. */
export async function pictureOf(catalogues: Record<string, { artModels: () => ArtModel[] }>, name: string, azimuthDeg: number, elevationDeg: number, swapM?: number): Promise<string> {
  const [kit, model] = name.split(": ");
  const entry = catalogues[kit].artModels().find((candidate) => candidate.name === model);
  if (entry === undefined) throw new Error(`no ${name}`);
  const view = { azimuthDeg, elevationDeg };
  const [near, far] = [await draw(entry, "near", view, swapM), await draw(entry, "far", view, swapM)];
  const size = near.seen.width;
  const canvas = document.createElement("canvas");
  [canvas.width, canvas.height] = [size * 2, size];
  const pen = canvas.getContext("2d");
  if (pen === null) throw new Error("no 2D canvas");
  const shown = (v: number) => Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055));
  [near, far].forEach(({ seen }, index) => {
    const image = pen.createImageData(size, size);
    for (let at = 0; at < size * size; at++) {
      for (let k = 0; k < 3; k++) image.data[at * 4 + k] = shown(seen.rgb[at * 3 + k]);
      image.data[at * 4 + 3] = 255;
    }
    pen.putImageData(image, index * size, 0);
  });
  return canvas.toDataURL("image/png");
}
