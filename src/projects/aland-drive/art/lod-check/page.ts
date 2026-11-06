import { Box3, BufferAttribute, Color, PerspectiveCamera, RenderTarget, Scene, Vector3, WebGPURenderer, type Node } from "three/webgpu";
import { cameraPosition, exp, float, mix, positionWorld, uniform, vec3 } from "three/tsl";
import { themeColor } from "@/shared/lib/three/theme-color";
import type { ArtModel, KitMaterials } from "../catalogue";
import { fingerprint } from "../lod-swaps";
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
 * - Look, by FLIP (`flip.ts`): how different the two pictures are to a person at the floor's viewing distance, from
 *   their colours after the eye's contrast sensitivity and from their edges and points. Judged twice: its mean over
 *   what the model covers, and its worst spot, its mean over a patch a few pixels across where that is highest, so a
 *   part that is a small share of the model but changes outright (a car's wheels, its lights) is noticed too.
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
 *
 * The worst spot's limit is set by the world cars' first stand-ins, which dropped the wheels and lights and merged
 * the glass: the owner saw every one turn into a grey box at the swap the mean alone gave it (29–59 m), where the
 * spot read 0.917 (Droska) to 0.975, and accepted all of them swapping at 120 m, where it read 0.51 to 0.88
 * (Raggare). Brev, at 0.97 even at 120 m, was the one car whose far version was noticed there. The accepted art keeps passing at the
 * swaps set by hand: its worst there is the woodshed's 0.84 and the stone wall's 0.73. Over 10 pixels (a fifth of a
 * degree on the floor's screen) the two sets of cars stand furthest apart: over 8 they overlap, a square filled by a
 * part's own pixels at any distance, and over 12 they meet, a square taking in so much unchanged body.
 * `check.mjs --score` measures a model at chosen swaps, which is how these were read.
 */
export const NOTICED = { deviationPx: 6, look: 0.55, spot: 0.9 };
/** The side of the square the worst spot is judged over, in pixels of the floor's screen. */
const SPOT_PX = 10;
/** The nearest swap tried, and each one after it this much further. */
const NEAREST_SWAP_M = 4;
const SWAP_STEP = 1.15;
/** The latest swap tried, as a share of the model's reach: past it the far version is hardly seen before it goes. */
const LATEST_OF_REACH = 0.7;
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

/**
 * FLIP's error summed over what either version shows and how many pixels that is, and its worst spot: the most FLIP
 * averages over any `SPOT_PX` square centred on what either shows. FLIP is near its top wherever a part comes or goes,
 * so a single pixel's says only that something changed, and the mean over the whole model hides a part that is a small
 * share of it, a car's wheels or lights; the square counts a change by how much of a patch the eye takes in at once it
 * covers.
 */
function look(near: Drawn, far: Drawn): { error: number; pixels: number; spot: number } {
  const errors = flip(near.seen, far.seen, PIXELS_PER_DEGREE);
  const side = near.seen.width;
  const showing = (at: number) => near.shows[at] === 1 || far.shows[at] === 1;
  let [error, pixels] = [0, 0];
  for (let at = 0; at < errors.length; at++) {
    if (!showing(at)) continue;
    error += errors[at];
    pixels++;
  }
  // A summed-area table, so each square's sum is four reads.
  const row = side + 1;
  const sums = new Float64Array(row * row);
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) sums[(y + 1) * row + x + 1] = errors[y * side + x] + sums[y * row + x + 1] + sums[(y + 1) * row + x] - sums[y * row + x];
  let spot = 0;
  for (let y = 0; y + SPOT_PX <= side; y++) {
    for (let x = 0; x + SPOT_PX <= side; x++) {
      if (!showing((y + (SPOT_PX >> 1)) * side + x + (SPOT_PX >> 1))) continue;
      const sum = sums[(y + SPOT_PX) * row + x + SPOT_PX] - sums[y * row + x + SPOT_PX] - sums[(y + SPOT_PX) * row + x] + sums[y * row + x];
      spot = Math.max(spot, sum / SPOT_PX ** 2);
    }
  }
  return { error, pixels, spot };
}

export interface LodResult {
  name: string;
  /** Its versions' fingerprint, which `swaps.json` is keyed by. */
  fingerprint: string;
  /** How far the outline moves at the measured swap, in pixels of the floor's screen, at the view where it moves most. */
  deviation: number;
  /** FLIP's mean error over what the model covers, over every view, at the measured swap. */
  look: number;
  /** FLIP's worst spot at the measured swap, at the view where it is worst. */
  spot: number;
  /** The view where each changes most, as azimuth and elevation in degrees, to look at. */
  deviationView: [number, number];
  lookView: [number, number];
  spotView: [number, number];
  /** Pixels the two cover between them, on average over the views. */
  pixels: number;
  /** The nearest swap tried at which the change isn't noticed, or, where none is, the one nearest the swap it was built with. */
  swapM: number;
  /** The swap it was built with: the kit's own, or what `swaps.json` held. */
  builtM: number;
  reachM: number;
  /** False where neither the swap it was built with nor the latest tried hides the change: its far version has to match. */
  hidden: boolean;
  nearTriangles: number;
  farTriangles: number;
}

export const noticed = (result: Pick<LodResult, "deviation" | "look" | "spot">) => result.deviation > NOTICED.deviationPx || result.look > NOTICED.look || result.spot > NOTICED.spot;

async function measure(entry: ArtModel, swapM: number) {
  let [most, error, pixels, worstLook, worstSpot] = [-1, 0, 0, -1, -1];
  let [deviationView, lookView, spotView]: [number, number][] = [
    [0, 0],
    [0, 0],
    [0, 0],
  ];
  for (const view of VIEWS) {
    const [near, far] = [await draw(entry, "near", view, swapM), await draw(entry, "far", view, swapM)];
    const moved = deviation(near, far);
    if (moved > most) [most, deviationView] = [moved, [view.azimuthDeg, view.elevationDeg]];
    const seen = look(near, far);
    if (seen.spot > worstSpot) [worstSpot, spotView] = [seen.spot, [view.azimuthDeg, view.elevationDeg]];
    [error, pixels] = [error + seen.error, pixels + seen.pixels];
    if (seen.pixels > 0 && seen.error / seen.pixels > worstLook) [worstLook, lookView] = [seen.error / seen.pixels, [view.azimuthDeg, view.elevationDeg]];
  }
  const round = (value: number, places: number) => Number(value.toFixed(places));
  return { deviation: round(most, 2), look: round(pixels === 0 ? 0 : error / pixels, 3), deviationView, lookView, spot: round(worstSpot, 3), spotView, pixels: Math.round(pixels / VIEWS.length) };
}

/** One model's measures at a swap, or at the swap it was built with, to calibrate `NOTICED` by. */
export async function scoreOf(catalogues: Record<string, { artModels: () => ArtModel[] }>, name: string, swapM?: number) {
  const [kit, model] = name.split(": ");
  const entry = catalogues[kit].artModels().find((candidate) => candidate.name === model);
  if (entry?.drawn === undefined) throw new Error(`no drawn ${name}`);
  const at = swapM ?? entry.drawn.model.swapM;
  return { name, swapM: at, ...(await measure(entry, at)) };
}

/** The nearest swap whose picture holds the whole model: nearer, the model is wider than the largest picture drawn. */
function nearestHeld(model: ArtModel["drawn"] & object): number {
  const radius = new Box3().setFromBufferAttribute(model.model.near.getAttribute("position") as BufferAttribute).getSize(new Vector3()).length() / 2;
  const metresPerPixel = (2.2 * radius) / (LARGEST - ROW_PIXELS);
  return (metresPerPixel * SCREEN_ROWS) / (2 * Math.tan((FIELD_OF_VIEW * Math.PI) / 360));
}

const triangles = (geometry: { index: { count: number } | null; getAttribute: (name: string) => { count: number } }) => (geometry.index?.count ?? geometry.getAttribute("position").count) / 3;

/**
 * Every drawn model of these catalogues with a far version, and the nearest swap at which its change isn't noticed:
 * this page's `part` of `parts`, so several pages share the work. The swaps tried stand `SWAP_STEP` apart from the
 * nearest the picture holds to the latest its reach allows, and a change only shrinks with distance, so the nearest
 * unnoticed one is found by halving. Where `written` already holds a swap for the art, that one and the one before it
 * are tried first: when it's unnoticed and the one before isn't, it stands, and no other is drawn. Given `only`, just
 * the models it names.
 */
export async function checkAll(catalogues: Record<string, { artModels: () => ArtModel[] }>, part: number, parts: number, written: Record<string, { swapM: number } | undefined>, only: readonly string[] = []): Promise<LodResult[]> {
  const results: LodResult[] = [];
  let index = 0;
  for (const [kit, { artModels }] of Object.entries(catalogues)) {
    for (const entry of artModels()) {
      if (entry.drawn === undefined || entry.drawn.model.far === null) continue;
      if (only.length > 0 && !only.includes(`${kit}: ${entry.name}`)) continue;
      if (index++ % parts !== part) continue;
      const { near, far, swapM: builtM, reachM } = entry.drawn.model;
      const swaps: number[] = [];
      for (let at = Math.max(NEAREST_SWAP_M, nearestHeld(entry.drawn)); at <= reachM * LATEST_OF_REACH; at *= SWAP_STEP) swaps.push(Math.round(at));
      if (swaps.length === 0) swaps.push(Math.round(reachM * LATEST_OF_REACH));
      const measured = new Map<number, Awaited<ReturnType<typeof measure>>>();
      const at = async (rung: number) => {
        const known = measured.get(rung);
        if (known !== undefined) return known;
        const made = await measure(entry, swaps[rung]);
        measured.set(rung, made);
        return made;
      };
      const print = fingerprint(near, far);
      const was = swaps.indexOf(written[print]?.swapM ?? -1);
      const top = swaps.length - 1;
      // The rung nearest the swap it was built with, which is where the search starts.
      const built = swaps.reduce((best, swap, rung) => (Math.abs(Math.log(swap / builtM)) < Math.abs(Math.log(swaps[best] / builtM)) ? rung : best), 0);
      let [low, high] = [0, top];
      let hidden = true;
      if (was !== -1 && !noticed(await at(was)) && (was === 0 || noticed(await at(was - 1)))) [low, high] = [was, was];
      else if (!noticed(await at(built))) high = built;
      // Outwards, a later swap hides the change only if the latest one tried does. Nowhere else is a single rung trusted that
      // far out: a thin part shrunk under a pixel there draws nothing, which reads as a change the size of the picture.
      else if (!noticed(await at(top))) low = built + 1;
      else [low, high, hidden] = [built, built, false];
      while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (noticed(await at(middle))) low = middle + 1;
        else high = middle;
      }
      results.push({ name: `${kit}: ${entry.name}`, fingerprint: print, ...(await at(high)), swapM: swaps[high], builtM, reachM, hidden, nearTriangles: triangles(near), farTriangles: triangles(far) });
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
