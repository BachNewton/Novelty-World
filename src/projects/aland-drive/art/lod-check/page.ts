import { Box3, BufferAttribute, Color, PerspectiveCamera, RenderTarget, Scene, Vector3, WebGPURenderer, type Node } from "three/webgpu";
import { cameraPosition, exp, float, mix, positionWorld, uniform, vec3 } from "three/tsl";
import { themeColor } from "@/shared/lib/three/theme-color";
import type { ArtModel, KitMaterials } from "../catalogue";
import { placeVersion, type RoadsideMaterials } from "../roadside/index";

/*
 * Each model's near and far versions drawn as the game draws them, at the size the swap gives them on the floor
 * screen, from all round: the near version well inside its range and the far just past the swap, so each is whole,
 * each framed to the same metres a pixel. A version that changes shape or colour at the swap is noticed, so the two
 * pictures are compared: the share of the outline one covers and the other doesn't, and how far apart their colours
 * are block by block.
 */

/** The floor's screen: 1440 pixels tall under the game's 60° view. */
const SCREEN_ROWS = 1440;
const FIELD_OF_VIEW = 60;
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
/** Block of pixels whose mean colours are compared. */
const BLOCK = 4;
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

interface Picture {
  size: number;
  pixels: Uint8Array;
}

async function draw(entry: ArtModel, version: "near" | "far", view: (typeof VIEWS)[number]): Promise<Picture> {
  const drawn = entry.drawn;
  if (drawn === undefined) throw new Error(`${entry.name} has no way to be drawn`);
  const { model } = drawn;
  const box = new Box3().setFromBufferAttribute(model.near.getAttribute("position") as BufferAttribute);
  const middle = box.getCenter(new Vector3());
  const radius = box.getSize(new Vector3()).length() / 2;
  const metresPerPixel = (2 * model.swapM * Math.tan((FIELD_OF_VIEW * Math.PI) / 360)) / SCREEN_ROWS;
  const size = Math.min(1024, Math.max(ROW_PIXELS, Math.ceil(((2.2 * radius) / metresPerPixel + 4) / ROW_PIXELS) * ROW_PIXELS));
  const distance = version === "near" ? model.swapM * NEAR_AT : Math.min(model.swapM * FAR_AT, model.swapM + (model.reachM - model.swapM) * FAR_OF_REACH);
  const [azimuth, elevation] = [(view.azimuthDeg * Math.PI) / 180, (view.elevationDeg * Math.PI) / 180];
  const way = new Vector3(Math.cos(elevation) * Math.sin(azimuth), Math.sin(elevation), Math.cos(elevation) * Math.cos(azimuth));
  const camera = new PerspectiveCamera((2 * Math.atan((size * metresPerPixel) / 2 / distance) * 180) / Math.PI, 1, Math.max(0.05, distance - radius * 2), distance + radius * 2);
  camera.position.copy(middle).addScaledVector(way, distance);
  camera.lookAt(middle);
  camera.updateMatrixWorld();
  const scene = new Scene();
  scene.background = new Color(KEY[0] / 255, KEY[1] / 255, KEY[2] / 255);
  for (const mesh of placeVersion(model, version, [{ x: 0, y: 0, z: 0 }], materialsOf(drawn.materials))) scene.add(mesh);
  const target = new RenderTarget(size, size);
  renderer.setRenderTarget(target);
  renderer.render(scene, camera);
  const pixels = (await renderer.readRenderTargetPixelsAsync(target, 0, 0, size, size)) as Uint8Array;
  renderer.setRenderTarget(null);
  target.dispose();
  return { size, pixels };
}

const covered = ({ pixels }: Picture, at: number) => pixels[at * 4] !== KEY[0] || pixels[at * 4 + 1] !== KEY[1] || pixels[at * 4 + 2] !== KEY[2];

/** What a pixel covers, grown by one: an outline a pixel off isn't a change of shape. */
function grown(picture: Picture): Uint8Array {
  const { size } = picture;
  const out = new Uint8Array(size * size);
  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      if (!covered(picture, row * size + column)) continue;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const [r, c] = [row + dr, column + dc];
        if (r >= 0 && c >= 0 && r < size && c < size) out[r * size + c] = 1;
      }
    }
  }
  return out;
}

/** A colour as read back, in linear light 0 to 255, in CIELAB. */
function lab([r, g, b]: number[]): number[] {
  const [lr, lg, lb] = [r / 255, g / 255, b / 255];
  const xyz = [(0.4124 * lr + 0.3576 * lg + 0.1805 * lb) / 0.95047, 0.2126 * lr + 0.7152 * lg + 0.0722 * lb, (0.0193 * lr + 0.1192 * lg + 0.9505 * lb) / 1.08883];
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = xyz.map(f);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** How much the outline changes, as a share of what either covers, and how far apart the colours are where both cover. */
function compare(near: Picture, far: Picture) {
  const { size } = near;
  const [nearGrown, farGrown] = [grown(near), grown(far)];
  let [either, lost, gained] = [0, 0, 0];
  for (let at = 0; at < size * size; at++) {
    const [n, f] = [covered(near, at), covered(far, at)];
    if (n || f) either++;
    if (n && !farGrown[at]) lost++;
    if (f && !nearGrown[at]) gained++;
  }
  let [weight, distance] = [0, 0];
  for (let row = 0; row < size; row += BLOCK) {
    for (let column = 0; column < size; column += BLOCK) {
      const sums = [near, far].map((picture) => {
        const sum = [0, 0, 0, 0];
        for (let r = row; r < row + BLOCK; r++) for (let c = column; c < column + BLOCK; c++) {
          const at = r * size + c;
          if (!covered(picture, at)) continue;
          for (let k = 0; k < 3; k++) sum[k] += picture.pixels[at * 4 + k];
          sum[3]++;
        }
        return sum;
      });
      const shared = Math.min(sums[0][3], sums[1][3]);
      if (shared === 0) continue;
      const [a, b] = sums.map((sum) => lab(sum.slice(0, 3).map((value) => value / sum[3])));
      distance += Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) * shared;
      weight += shared;
    }
  }
  return { changed: lost + gained, either, distance, weight };
}

export interface LodResult {
  name: string;
  /** The share of the outline that changes, 0 to 1, over every view: a sliver seen end on weighs as little as it shows. */
  shape: number;
  /** The mean colour difference where both cover, in CIE76 ΔE, over every view. */
  colour: number;
  /** The view where each changes most, as azimuth and elevation in degrees, to look at. */
  shapeView: [number, number];
  colourView: [number, number];
  /** Pixels the two cover between them, on average over the views: what a model a handful of pixels across has to show. */
  pixels: number;
}

/** Every drawn model of these catalogues with a far version, compared. */
export async function checkAll(catalogues: Record<string, { artModels: () => ArtModel[] }>): Promise<LodResult[]> {
  const results: LodResult[] = [];
  for (const [kit, { artModels }] of Object.entries(catalogues)) {
    for (const entry of artModels()) {
      if (entry.drawn === undefined || entry.drawn.model.far === null) continue;
      const total = { changed: 0, either: 0, distance: 0, weight: 0 };
      let [mostShape, mostColour] = [-1, -1];
      const result: LodResult = { name: `${kit}: ${entry.name}`, shape: 0, colour: 0, shapeView: [0, 0], colourView: [0, 0], pixels: 0 };
      for (const view of VIEWS) {
        const found = compare(await draw(entry, "near", view), await draw(entry, "far", view));
        for (const key of ["changed", "either", "distance", "weight"] as const) total[key] += found[key];
        if (found.changed > mostShape) [mostShape, result.shapeView] = [found.changed, [view.azimuthDeg, view.elevationDeg]];
        if (found.distance > mostColour) [mostColour, result.colourView] = [found.distance, [view.azimuthDeg, view.elevationDeg]];
      }
      result.shape = total.either === 0 ? 0 : total.changed / total.either;
      result.colour = total.weight === 0 ? 0 : total.distance / total.weight;
      result.pixels = Math.round(total.either / VIEWS.length);
      results.push(result);
    }
  }
  return results;
}

/** One model's two versions from a view, side by side on the page's canvas, for a look by eye. */
export async function pictureOf(catalogues: Record<string, { artModels: () => ArtModel[] }>, name: string, azimuthDeg: number, elevationDeg: number): Promise<string> {
  const [kit, model] = name.split(": ");
  const entry = catalogues[kit].artModels().find((candidate) => candidate.name === model);
  if (entry === undefined) throw new Error(`no ${name}`);
  const view = { azimuthDeg, elevationDeg };
  const [near, far] = [await draw(entry, "near", view), await draw(entry, "far", view)];
  const canvas = document.createElement("canvas");
  [canvas.width, canvas.height] = [near.size * 2, near.size];
  const pen = canvas.getContext("2d");
  if (pen === null) throw new Error("no 2D canvas");
  [near, far].forEach(({ size, pixels }, index) => {
    const image = pen.createImageData(size, size);
    // Read back in linear light, so turned to the screen's colours to be seen.
    const shown = (value: number) => {
      const v = value / 255;
      return Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055));
    };
    for (let row = 0; row < size; row++) {
      const line = pixels.subarray(row * size * 4, (row + 1) * size * 4);
      for (let at = 0; at < line.length; at++) image.data[row * size * 4 + at] = at % 4 === 3 ? 255 : shown(line[at]);
    }
    pen.putImageData(image, index * size, 0);
  });
  return canvas.toDataURL("image/png");
}
