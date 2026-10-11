import * as THREE from "three";
import { createRng } from "@/shared/lib/seeded-random";
import type { Edge } from "../types";
import { PALETTE, paletteHex, type PaletteKey } from "./palette";
import { TEXELS_PER_METRE, textureReady } from "./textures";

/**
 * A mark drawn into one wall's own texture, at the texture's pixel size: a
 * picture's ghost, a blood smear, a scorch, a damp stain, a door edge worn
 * dark. It is part of the wall's surface, so it stands off nothing and fights
 * nothing, and it shows only where the wall stands: a mark above the cut
 * height shows on the full wall alone.
 */
export interface WallMark {
  edge: Edge;
  /** Metres from the wall's centre to the mark's centre, positive to the right as you face the wall (as `onWall`). */
  along: number;
  /** Height of the mark's bottom edge above the floor. */
  y: number;
  size: [width: number, height: number];
  /** What it does to the wall's pixels: turn each palette colour into another
   *  (paper kept from fading, plaster gone damp), or paint one colour over them. */
  change: { recolour: Partial<Record<PaletteKey, PaletteKey>> } | { paint: PaletteKey };
  /** An oval, or by default an oblong. */
  shape?: "oblong" | "oval";
  /** How far in from its rim, in metres, the mark thins out to nothing, dithered pixel by pixel. */
  soft?: number;
  /** Seeds the soft rim's dither. */
  seed?: string;
}

/** The palette key of each colour a wall texture can hold. */
const KEY_OF = new Map<string, PaletteKey>(Object.entries(PALETTE).map(([key, hex]) => [hex, key as PaletteKey]));

const hexOf = (data: Uint8ClampedArray, i: number) =>
  `#${[data[i], data[i + 1], data[i + 2]].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;

/** How far a texture repeats over a wall's face, in texels, to cover a whole wall: a whole number of repeats, so the pattern runs on unbroken. */
function cover(repeat: number, metres: number): number {
  return repeat * Math.ceil((metres * TEXELS_PER_METRE) / repeat);
}

/**
 * A wall texture with marks drawn into it: the wall's own texture repeated
 * over one whole wall, lined up with it as `projectUvs` lays it on a wall
 * built along x (its centre at x = 0), with the marks drawn in. A wall `length`
 * metres long and `height` tall.
 */
export function markedWall(base: THREE.Texture, marks: readonly WallMark[], length: number, height: number): THREE.Texture {
  // Kept for the page's life, as every texture is, so a room rebuilt draws its walls once.
  const key = `${base.uuid}:${length}:${height}:${JSON.stringify(marks)}`;
  let texture = cache.get(key);
  if (!texture) {
    texture = draw(base, marks, length, height);
    cache.set(key, texture);
  }
  return texture;
}

const cache = new Map<string, THREE.Texture>();

function draw(base: THREE.Texture, marks: readonly WallMark[], length: number, height: number): THREE.Texture {
  // An SVG decal fills in later; a wall texture is drawn at once, so its pixels are there to copy.
  if (textureReady(base)) throw new Error("Wall marks draw into a wall texture drawn at once, not one still decoding");
  const source = base.image as HTMLCanvasElement;
  const width = cover(source.width, length);
  const tall = cover(source.height, height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = tall;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("2D canvas unavailable");
  for (let x = 0; x < width; x += source.width) for (let y = 0; y < tall; y += source.height) context.drawImage(source, x, y);
  const image = context.getImageData(0, 0, width, tall);
  const { data } = image;
  for (const mark of marks) {
    const rng = createRng(mark.seed ?? `${mark.edge}:${mark.along}:${mark.y}`);
    const [w, h] = mark.size.map((metres) => Math.round(metres * TEXELS_PER_METRE));
    // A wall's x maps to texture column x × texels (wrapping), and its height y to row `tall` − y × texels.
    const left = Math.round((mark.along - mark.size[0] / 2) * TEXELS_PER_METRE);
    const top = tall - Math.round((mark.y + mark.size[1]) * TEXELS_PER_METRE);
    const soft = (mark.soft ?? 0) * TEXELS_PER_METRE;
    for (let row = 0; row < h; row++) {
      for (let col = 0; col < w; col++) {
        // How far inside the mark's rim this pixel lies, in texels.
        const [dx, dy] = [Math.min(col + 0.5, w - col - 0.5), Math.min(row + 0.5, h - row - 0.5)];
        const inside =
          mark.shape === "oval"
            ? (1 - Math.hypot((col + 0.5 - w / 2) / (w / 2), (row + 0.5 - h / 2) / (h / 2))) * Math.min(w, h) / 2
            : Math.min(dx, dy);
        if (inside <= 0) continue;
        if (soft > 0 && inside < soft && rng.next() > inside / soft) continue;
        const i = ((((top + row) % tall) + tall) % tall * width + (((left + col) % width) + width) % width) * 4;
        const key = KEY_OF.get(hexOf(data, i));
        const next = "paint" in mark.change ? mark.change.paint : key && mark.change.recolour[key];
        if (!next) continue;
        const hex = paletteHex(next);
        for (let channel = 0; channel < 3; channel++) data[i + channel] = parseInt(hex.slice(1 + channel * 2, 3 + channel * 2), 16);
      }
    }
  }
  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}
