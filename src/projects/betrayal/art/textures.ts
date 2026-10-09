import * as THREE from "three";
import { createRng, pick, type Rng } from "@/shared/lib/seeded-random";
import { PALETTE, paletteHex, RAMPS, type PaletteKey, type Ramp } from "./palette";

/** Every surface in every room shows this many texels per metre, so pixels are
 *  the same size everywhere: a 64px texture covers 2 m. */
export const TEXELS_PER_METRE = 32;

/** World size, in metres, one repeat of a texture covers. */
export function textureMetres(texture: THREE.Texture): { u: number; v: number } {
  const image = texture.image as { width: number; height: number };
  return { u: image.width / TEXELS_PER_METRE, v: image.height / TEXELS_PER_METRE };
}

/** Rasterised SVG decals resolve after the image decodes; the stage waits on this. */
export function textureReady(texture: THREE.Texture): Promise<void> | undefined {
  return (texture.userData as { ready?: Promise<void> }).ready;
}

function canvas(width: number, height: number) {
  const element = document.createElement("canvas");
  element.width = width;
  element.height = height;
  const context = element.getContext("2d");
  if (!context) throw new Error("2D canvas unavailable");
  return { element, context };
}

function finish(element: HTMLCanvasElement, repeat: boolean): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(element);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  if (repeat) texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/** Textures are small and shared between props and rooms, so each distinct
 *  set of parameters is drawn once and kept for the page's life. */
const cache = new Map<string, THREE.Texture>();
function cached(key: string, draw: () => THREE.Texture): THREE.Texture {
  let texture = cache.get(key);
  if (!texture) {
    texture = draw();
    cache.set(key, texture);
  }
  return texture;
}

type Paint = (x: number, y: number, w: number, h: number, colour: PaletteKey) => void;

function painter(context: CanvasRenderingContext2D): Paint {
  return (x, y, w, h, colour) => {
    context.fillStyle = paletteHex(colour);
    context.fillRect(x, y, w, h);
  };
}

function between(rng: Rng, low: number, high: number): number {
  return low + Math.floor(rng.next() * (high - low + 1));
}

export interface PlankOptions {
  /** Dark to light; the darkest is the seams, the lightest the odd highlight. */
  ramp?: Ramp;
  /** Plank width in texels (8 = 25 cm). */
  plankPx?: number;
  /** Texture size in texels (64 = 2 m). */
  size?: number;
  seed?: string;
}

/** Floorboards running along the texture's width. */
export function woodPlanks({
  ramp = RAMPS.wood,
  plankPx = 8,
  size = 64,
  seed = "planks",
}: PlankOptions = {}): THREE.Texture {
  return cached(`planks:${ramp.join()}:${plankPx}:${size}:${seed}`, () => {
    const { element, context } = canvas(size, size);
    const paint = painter(context);
    const rng = createRng(seed);
    const dark = ramp[0];
    const bodies = ramp.slice(1, -1);
    const light = ramp[ramp.length - 1];
    for (let y = 0; y < size; y += plankPx) {
      const start = between(rng, 0, size / 2);
      for (let x = start; x < start + size; ) {
        const length = Math.min(between(rng, size / 2, size), start + size - x);
        const body = pick(rng, bodies);
        const marks: [number, number, number, number, PaletteKey][] = [[x, y, length, plankPx, body]];
        for (let streak = 0; streak < length / 6; streak++) {
          marks.push([x + between(rng, 0, length - 1), y + between(rng, 1, plankPx - 2), between(rng, 3, 9), 1, dark]);
        }
        if (rng.next() < 0.35) marks.push([x + between(rng, 3, length - 4), y + between(rng, 2, plankPx - 3), 2, 1, dark]);
        marks.push([x, y + 1, 1, plankPx - 1, light], [x + length - 1, y, 1, plankPx, dark]);
        for (const [mx, my, mw, mh, colour] of marks) {
          paint(mx, my, mw, mh, colour);
          paint(mx - size, my, mw, mh, colour);
        }
        x += length;
      }
      paint(0, y, size, 1, dark);
    }
    return finish(element, true);
  });
}

export interface StoneOptions {
  ramp?: Ramp;
  /** Mortar between stones. */
  mortar?: PaletteKey;
  /** Typical stone height in texels. */
  stonePx?: number;
  size?: number;
  seed?: string;
}

/** Staggered rough-cut flagstones, for floors or bare stone walls. */
export function flagstones({
  ramp = RAMPS.stone,
  mortar = "soot",
  stonePx = 16,
  size = 64,
  seed = "flagstones",
}: StoneOptions = {}): THREE.Texture {
  return cached(`stone:${ramp.join()}:${mortar}:${stonePx}:${size}:${seed}`, () => {
    const { element, context } = canvas(size, size);
    const paint = painter(context);
    const rng = createRng(seed);
    paint(0, 0, size, size, mortar);
    const shadow = ramp[0];
    const bodies = ramp.slice(1, -1);
    const light = ramp[ramp.length - 1];
    for (let y = 0; y < size; y += stonePx) {
      const start = between(rng, 0, stonePx * 2);
      for (let x = start; x < start + size; ) {
        const width = Math.min(between(rng, stonePx, stonePx * 2), start + size - x);
        const body = pick(rng, bodies);
        const sx = x + 1;
        const sy = y + 1;
        const w = width - 1;
        const h = stonePx - 1;
        const marks: [number, number, number, number, PaletteKey][] = [
          [sx, sy, w, h, body],
          [sx, sy, w, 1, light],
          [sx, sy, 1, h, light],
          [sx, sy + h - 1, w, 1, shadow],
          [sx + w - 1, sy, 1, h, shadow],
        ];
        for (let speck = 0; speck < (w * h) / 14; speck++) {
          marks.push([sx + between(rng, 1, w - 2), sy + between(rng, 1, h - 2), 1, 1, rng.next() < 0.6 ? shadow : light]);
        }
        for (const [mx, my, mw, mh, colour] of marks) {
          paint(mx, my, mw, mh, colour);
          paint(mx - size, my, mw, mh, colour);
        }
        x += width;
      }
    }
    return finish(element, true);
  });
}

export interface PlasterOptions {
  ramp?: Ramp;
  size?: number;
  seed?: string;
}

/** Bare, stained plaster: a flat body with damp blotches and hairline cracks. */
export function plaster({
  ramp = RAMPS.bone,
  size = 64,
  seed = "plaster",
}: PlasterOptions = {}): THREE.Texture {
  return cached(`plaster:${ramp.join()}:${size}:${seed}`, () => {
    const { element, context } = canvas(size, size);
    const paint = painter(context);
    const rng = createRng(seed);
    const body = ramp[Math.min(1, ramp.length - 1)];
    paint(0, 0, size, size, body);
    for (let blot = 0; blot < 6; blot++) {
      const cx = between(rng, 0, size);
      const cy = between(rng, 0, size);
      const radius = between(rng, 3, 9);
      for (let i = 0; i < radius * radius * 1.5; i++) {
        const angle = rng.next() * Math.PI * 2;
        const r = Math.sqrt(rng.next()) * radius;
        const x = (cx + Math.round(Math.cos(angle) * r) + size) % size;
        const y = (cy + Math.round(Math.sin(angle) * r) + size) % size;
        paint(x, y, 1, 1, ramp[0]);
      }
    }
    for (let crack = 0; crack < 3; crack++) {
      let x = between(rng, 0, size);
      let y = between(rng, 0, size);
      for (let step = 0; step < 14; step++) {
        paint((x + size) % size, (y + size) % size, 1, 1, ramp[0]);
        x += between(rng, -1, 1);
        y += 1;
      }
    }
    for (let fleck = 0; fleck < size; fleck++) {
      paint(between(rng, 0, size), between(rng, 0, size), 1, 1, ramp[ramp.length - 1]);
    }
    return finish(element, true);
  });
}

export interface WallpaperOptions {
  ground?: PaletteKey;
  stripe?: PaletteKey;
  motif?: PaletteKey;
  /** A small pixel motif repeated in a half-drop; defaults to a damask lily. */
  pattern?: readonly string[];
  /** Texture width in texels; the motif repeats twice across it. */
  size?: number;
  seed?: string;
}

const DAMASK = [
  "...#...",
  "..###..",
  ".#.#.#.",
  "##.#.##",
  ".#.#.#.",
  "..###..",
  "...#...",
  "..#.#..",
  ".#...#.",
];

/** Faded striped wallpaper with a repeating motif and age spots. */
export function wallpaper({
  ground = "bruiseDark",
  stripe = "bruise",
  motif = "bruiseLight",
  pattern = DAMASK,
  size = 32,
  seed = "wallpaper",
}: WallpaperOptions = {}): THREE.Texture {
  return cached(`paper:${ground}:${stripe}:${motif}:${pattern.join("/")}:${size}:${seed}`, () => {
    const height = size * 2;
    const { element, context } = canvas(size, height);
    const paint = painter(context);
    const rng = createRng(seed);
    paint(0, 0, size, height, ground);
    const half = size / 2;
    paint(0, 0, 1, height, stripe);
    paint(half, 0, 1, height, stripe);
    const mw = pattern[0].length;
    const mh = pattern.length;
    const stamp = (ox: number, oy: number) => {
      pattern.forEach((row, y) => {
        [...row].forEach((cell, x) => {
          if (cell !== ".") paint((ox + x) % size, (oy + y) % height, 1, 1, motif);
        });
      });
    };
    const ox = Math.floor((half - mw) / 2) + 1;
    for (let oy = 0; oy < height; oy += mh * 2 + 2) {
      stamp(ox, oy);
      stamp(ox + half, oy + mh + 1);
    }
    for (let spot = 0; spot < size / 2; spot++) {
      paint(between(rng, 0, size), between(rng, 0, height), between(rng, 1, 2), 1, stripe);
    }
    return finish(element, true);
  });
}

export interface PanelOptions {
  ramp?: Ramp;
  /** Panel width in texels; the texture is one panel wide and one metre tall. */
  panelPx?: number;
  seed?: string;
}

/** Raised wooden wall panelling (wainscot): framed panels with bevel light and shadow. */
export function panelling({ ramp = RAMPS.wood, panelPx = 24, seed = "panels" }: PanelOptions = {}): THREE.Texture {
  return cached(`panels:${ramp.join()}:${panelPx}:${seed}`, () => {
    const height = TEXELS_PER_METRE;
    const { element, context } = canvas(panelPx, height);
    const paint = painter(context);
    const rng = createRng(seed);
    const [dark, frame, inner, light] = [ramp[0], ramp[1], ramp[Math.min(2, ramp.length - 1)], ramp[ramp.length - 1]];
    paint(0, 0, panelPx, height, frame);
    const inset = 4;
    const w = panelPx - inset * 2;
    const h = height - inset * 2;
    paint(inset, inset, w, h, inner);
    paint(inset - 1, inset - 1, w + 2, 1, dark);
    paint(inset - 1, inset - 1, 1, h + 2, dark);
    paint(inset - 1, inset + h, w + 2, 1, light);
    paint(inset + w, inset - 1, 1, h + 2, light);
    paint(0, 0, 1, height, dark);
    for (let streak = 0; streak < 8; streak++) {
      paint(between(rng, inset + 1, inset + w - 2), between(rng, inset + 1, inset + h - 6), 1, between(rng, 2, 5), frame);
    }
    return finish(element, true);
  });
}

export interface BrickOptions {
  /** Dark to light: the shadow along a brick's foot and its chips, the bodies
   *  (every key but the first and last, or all of a two-key ramp), and the
   *  light along a brick's top. */
  ramp?: Ramp;
  mortar?: PaletteKey;
  /** How worn the faces are, 0–1: how often a brick's top catches the light and its foot is shadowed. 0 is flat colour, chips only. */
  wear?: number;
  /** Texture size in texels (64 = 2 m). */
  size?: number;
  seed?: string;
}

/** Brick in stretcher bond, 25 × 12.5 cm a brick with its joint (8 × 4
 *  texels): each brick a body colour from the ramp, its top edge catching the
 *  light and its foot in shadow here and there, the odd one chipped. */
export function bricks({ ramp = RAMPS.brick, mortar = "soot", wear = 0.35, size = 64, seed = "bricks" }: BrickOptions = {}): THREE.Texture {
  return cached(`bricks:${ramp.join()}:${mortar}:${wear}:${size}:${seed}`, () => {
    const { element, context } = canvas(size, size);
    const paint = painter(context);
    const rng = createRng(seed);
    const at = (x: number, y: number, colour: PaletteKey) => paint((x + size) % size, y, 1, 1, colour);
    const shadow = ramp[0];
    const light = ramp[ramp.length - 1];
    const bodies = ramp.length > 2 ? ramp.slice(1, -1) : ramp;
    paint(0, 0, size, size, mortar);
    for (let course = 0; course < size / 4; course++) {
      const y = course * 4;
      const offset = (course % 2) * 4;
      for (let brick = 0; brick < size / 8; brick++) {
        const x0 = brick * 8 + offset;
        const body = pick(rng, bodies);
        paint(x0, y, 7, 3, body);
        paint(x0 - size, y, 7, 3, body);
        for (let dx = 0; dx < 7; dx++) {
          if (dx > 0 && rng.next() < wear * 0.8) at(x0 + dx, y, light);
          if (rng.next() < wear) at(x0 + dx, y + 2, shadow);
        }
        if (rng.next() < 0.3) at(x0 + 1 + between(rng, 0, 4), y + 1, shadow);
      }
    }
    return finish(element, true);
  });
}

export interface EarthOptions {
  /** Dark to light: pits, the body of the soil, clods. */
  soil?: Ramp;
  /** Dark to light: grass blades, then their tips. An empty ramp is bare earth. */
  grass?: Ramp;
  /** How many patches of grass grow over one texture. */
  patches?: number;
  size?: number;
  seed?: string;
}

/** Bare earth with clods and pebbles, and patches of rough grass: the ground of an outdoor room. */
export function earth({ soil = ["soot", "woodDark", "wood"], grass = ["wraithDark", "wraith"], patches = 7, size = 64, seed = "earth" }: EarthOptions = {}): THREE.Texture {
  return cached(`earth:${soil.join()}:${grass.join()}:${patches}:${size}:${seed}`, () => {
    const { element, context } = canvas(size, size);
    const paint = painter(context);
    const rng = createRng(seed);
    const dot = (x: number, y: number, w: number, h: number, colour: PaletteKey) => paint((x + size) % size, (y + size) % size, w, h, colour);
    paint(0, 0, size, size, soil[Math.min(1, soil.length - 1)]);
    for (let i = 0; i < size * 1.5; i++) dot(between(rng, 0, size), between(rng, 0, size), between(rng, 1, 2), 1, soil[0]);
    for (let i = 0; i < size; i++) dot(between(rng, 0, size), between(rng, 0, size), between(rng, 1, 3), 1, soil[soil.length - 1]);
    for (let i = 0; i < size / 4; i++) {
      const x = between(rng, 0, size);
      const y = between(rng, 0, size);
      dot(x, y, 1, 1, "stoneDark");
      dot(x, y - 1, 1, 1, "stone");
    }
    if (grass.length === 0) return finish(element, true);
    for (let patch = 0; patch < patches; patch++) {
      const cx = between(rng, 0, size);
      const cy = between(rng, 0, size);
      const radius = between(rng, 4, 10);
      for (let tuft = 0; tuft < radius * radius * 0.6; tuft++) {
        const angle = rng.next() * Math.PI * 2;
        const r = Math.sqrt(rng.next()) * radius;
        const x = cx + Math.round(Math.cos(angle) * r);
        const y = cy + Math.round(Math.sin(angle) * r * 0.7);
        const tall = between(rng, 1, 3);
        dot(x, y - tall + 1, 1, tall, grass[0]);
        dot(x, y - tall, 1, 1, grass[grass.length - 1]);
      }
    }
    return finish(element, true);
  });
}

/** Maps each character of a pixel grid to a palette colour; `null` is transparent. */
export type PixelLegend = Record<string, PaletteKey | null>;

/**
 * Small hand-placed pixel art: each row is a string, each character a pixel,
 * looked up in the legend. `.` is transparent unless the legend says otherwise.
 */
export function pixelTexture(rows: readonly string[], legend: PixelLegend, repeat = false): THREE.Texture {
  const key = `pixels:${rows.join("/")}:${JSON.stringify(legend)}:${repeat}`;
  return cached(key, () => {
    const width = rows[0].length;
    const { element, context } = canvas(width, rows.length);
    const paint = painter(context);
    const lookup: PixelLegend = { ".": null, ...legend };
    rows.forEach((row, y) => {
      if (row.length !== width) throw new Error(`Pixel row ${y} is ${row.length} wide, expected ${width}`);
      [...row].forEach((cell, x) => {
        if (!(cell in lookup)) throw new Error(`Pixel character "${cell}" has no legend entry`);
        const colour = lookup[cell];
        if (colour) paint(x, y, 1, 1, colour);
      });
    });
    return finish(element, repeat);
  });
}

const PALETTE_RGB = Object.values(PALETTE).map((hex) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
]);

function snapToPalette(context: CanvasRenderingContext2D, width: number, height: number) {
  const image = context.getImageData(0, 0, width, height);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) {
      data[i + 3] = 0;
      continue;
    }
    let best = PALETTE_RGB[0];
    let bestDistance = Infinity;
    for (const rgb of PALETTE_RGB) {
      const distance = (rgb[0] - data[i]) ** 2 + (rgb[1] - data[i + 1]) ** 2 + (rgb[2] - data[i + 2]) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = rgb;
      }
    }
    data[i] = best[0];
    data[i + 1] = best[1];
    data[i + 2] = best[2];
    data[i + 3] = 255;
  }
  context.putImageData(image, 0, 0);
}

/**
 * Rasterises an SVG (drawn with `paletteHex` colours) into a small texture,
 * then snaps every pixel to the palette so anti-aliased edges become crisp
 * pixel-art edges. Draw at the size you want the pixels, e.g. 64×96 for a
 * 2×3 m rug. The texture fills in once the image decodes; `textureReady`.
 */
export function svgTexture(svg: string, width: number, height: number): THREE.Texture {
  return cached(`svg:${width}x${height}:${svg}`, () => {
    const { element, context } = canvas(width, height);
    const texture = finish(element, false);
    const image = new Image(width, height);
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    texture.userData.ready = image.decode().then(() => {
      context.drawImage(image, 0, 0, width, height);
      snapToPalette(context, width, height);
      texture.needsUpdate = true;
    });
    return texture;
  });
}
