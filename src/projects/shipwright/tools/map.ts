// Render the archipelago as a top-down chart, straight from the bedrock field. No browser, no GPU,
// no dev server — this imports `terrain.ts` and samples the same pure function the mesher does.
//
//   npx tsx tools/map.ts <out.png> [--seed 13] [--span 3000] [--px 1000] [--ss 1] [--window]
//
// WHY THIS EXISTS. The 3D scene renders a 600 m window, and a 600 m window is SMALLER THAN THE SCALE
// AN ARCHIPELAGO IS ORGANISED INTO. Whole classes of terrain bug are therefore invisible from inside
// the game: the field once splattered same-sized islands at uniform density with no basins and no
// landfall, and the scene looked fine. A map at 3-50 km makes that obvious in one glance, and it
// costs nothing to look. Run it whenever you touch the field's spectrum. See docs/ISLANDS.md and
// docs/MAPS.md (which also covers the in-game chart this could become).

import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import * as THREE from "three";
import { bedrockField, type ArchipelagoProfile } from "../terrain.ts";

const arg = (name: string, fallback: number): number => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : Number(process.argv[i + 1]);
};

// `.at()`, not `[2]`: indexing types as `string` and lies when the arg is missing, which is the one
// case this check exists for.
const out = process.argv.at(2);
if (out === undefined || out.startsWith("--")) {
  console.error("usage: npx tsx tools/map.ts <out.png> [--seed 13] [--span 3000] [--px 1000] [--ss 1] [--window]");
  process.exit(1);
}

const SEED = arg("seed", 13);
const SPAN = arg("span", 3000); // metres across the map
const OUT_PX = arg("px", 1000); // output image side, in pixels
/** Supersample factor. At a 50 km span one output pixel is 31 m and a skerry is a few metres across,
 *  so point-sampling would silently DELETE the small islands and lie about the world. Sampling finer
 *  and box-averaging keeps them as faint pixels — an honest coastline instead of a flattering one. */
const SS = Math.max(1, arg("ss", 1));
/** Draw the live scene's 600 m window + the raft's spawn. Keep in sync with scene.ts ARCHIPELAGO. */
const SHOW_WINDOW = process.argv.includes("--window");
const WINDOW_CENTER: [number, number] = [100, -100];
const WINDOW_EXTENT = 600;

const N = OUT_PX * SS;
const STEP = SPAN / N;

// `extent` is deliberately enormous: the window taper is a property of the MESHED WINDOW, not of the
// world, and we want to chart the world. At 1e6 m the taper is 1 everywhere in frame.
const PROFILE: ArchipelagoProfile = {
  seed: SEED,
  center: [0, 0],
  extent: 1e6,
  grain: Math.PI / 8,
  deep: -30,
};

const { height } = bedrockField(PROFILE);

const field = new Float32Array(N * N);
for (let j = 0; j < N; j++) {
  for (let i = 0; i < N; i++) {
    field[j * N + i] = height(-SPAN / 2 + (i + 0.5) * STEP, -SPAN / 2 + (j + 0.5) * STEP);
  }
}

// --- shading ------------------------------------------------------------------------------------
// A chart, not a render: hypsometric tint + hillshade. It shows the CUT (where sea level meets the
// bedrock) far more legibly than a photoreal frame ever could, which is the whole point.
const DEEP = new THREE.Color(0x0c2a34);
const SHOAL = new THREE.Color(0x285c68);
const SHORE = new THREE.Color(0x1c2418); // the black lichen belt, as a coastline stroke
const LOW = new THREE.Color(0x3e5040);
const HIGH = new THREE.Color(0xaab08a);

const shade = (i: number, j: number): number => {
  const dx = (field[j * N + Math.min(N - 1, i + 1)] - field[j * N + Math.max(0, i - 1)]) / (2 * STEP);
  const dz = (field[Math.min(N - 1, j + 1) * N + i] - field[Math.max(0, j - 1) * N + i]) / (2 * STEP);
  const len = Math.hypot(-dx, 1, -dz);
  return Math.max(0.35, Math.min(1.4, 0.55 + 0.8 * ((dx * 0.577 + 0.577 + dz * 0.577) / len)));
};

const hi = new Uint8Array(N * N * 3);
const color = new THREE.Color();
for (let j = 0; j < N; j++) {
  for (let i = 0; i < N; i++) {
    const y = field[j * N + i];
    if (y > 0) {
      color.copy(LOW).lerp(HIGH, Math.min(1, y / 18)).multiplyScalar(shade(i, j));
      if (y < 0.6) color.lerp(SHORE, 0.65);
    } else {
      color.copy(SHOAL).lerp(DEEP, Math.min(1, -y / 25));
    }
    const o = (j * N + i) * 3;
    hi[o] = color.r * 255;
    hi[o + 1] = color.g * 255;
    hi[o + 2] = color.b * 255;
  }
}

// --- resolve to the output image ------------------------------------------------------------------
const image = new Uint8Array(OUT_PX * OUT_PX * 3);
for (let j = 0; j < OUT_PX; j++) {
  for (let i = 0; i < OUT_PX; i++) {
    let r = 0;
    let g = 0;
    let b = 0;
    for (let sj = 0; sj < SS; sj++) {
      for (let si = 0; si < SS; si++) {
        const o = ((j * SS + sj) * N + (i * SS + si)) * 3;
        r += hi[o];
        g += hi[o + 1];
        b += hi[o + 2];
      }
    }
    const o = (j * OUT_PX + i) * 3;
    image[o] = r / (SS * SS);
    image[o + 1] = g / (SS * SS);
    image[o + 2] = b / (SS * SS);
  }
}

const toPx = (world: number) => Math.round(((world + SPAN / 2) / SPAN) * OUT_PX);
const put = (i: number, j: number, c: [number, number, number]) => {
  if (i < 0 || j < 0 || i >= OUT_PX || j >= OUT_PX) return;
  const o = (j * OUT_PX + i) * 3;
  [image[o], image[o + 1], image[o + 2]] = c;
};

if (SHOW_WINDOW) {
  const half = WINDOW_EXTENT / 2;
  const [x0, x1] = [toPx(WINDOW_CENTER[0] - half), toPx(WINDOW_CENTER[0] + half)];
  const [z0, z1] = [toPx(WINDOW_CENTER[1] - half), toPx(WINDOW_CENTER[1] + half)];
  for (let t = 0; t < 2; t++) {
    for (let i = x0; i <= x1; i++) {
      put(i, z0 + t, [255, 232, 70]);
      put(i, z1 - t, [255, 232, 70]);
    }
    for (let j = z0; j <= z1; j++) {
      put(x0 + t, j, [255, 232, 70]);
      put(x1 - t, j, [255, 232, 70]);
    }
  }
  // the raft's spawn, at the world origin
  for (let dj = -7; dj <= 7; dj++) {
    for (let di = -7; di <= 7; di++) {
      const rr = Math.hypot(di, dj);
      if (rr <= 7 && rr >= 4.5) put(toPx(0) + di, toPx(0) + dj, [255, 55, 55]);
    }
  }
}

// --- island statistics ----------------------------------------------------------------------------
// The numbers the map can only suggest. Flood-fill the land into islands and report the SIZE
// DISTRIBUTION and the ZONING, because those are the two things a flat spectrum quietly destroys.
const label = new Int32Array(N * N).fill(-1);
const areas: number[] = [];
const stack: number[] = [];
for (let s = 0; s < N * N; s++) {
  if (field[s] <= 0 || label[s] !== -1) continue;
  const id = areas.length;
  let cells = 0;
  stack.push(s);
  label[s] = id;
  while (stack.length) {
    const p = stack.pop();
    if (p === undefined) break;
    cells++;
    const pi = p % N;
    const pj = (p / N) | 0;
    const push = (q: number) => {
      if (field[q] > 0 && label[q] === -1) {
        label[q] = id;
        stack.push(q);
      }
    };
    if (pi > 0) push(p - 1);
    if (pi < N - 1) push(p + 1);
    if (pj > 0) push(p - N);
    if (pj < N - 1) push(p + N);
  }
  areas.push(cells * STEP * STEP);
}

const HECTARE = 10_000;
const between = (lo: number, hi2: number) => areas.filter((a) => a >= lo && a < hi2).length;
const land = field.reduce((n, v) => n + (v > 0 ? 1 : 0), 0) / (N * N);

// Land fraction per 500 m tile. A real archipelago is ZONED — dense inner, thin outer, open basin —
// so this must vary a lot. A uniform splatter shows a tiny spread and reads as a gravel field.
const tile = Math.max(1, Math.round(500 / STEP));
const tiles: number[] = [];
for (let tj = 0; tj + tile <= N; tj += tile) {
  for (let ti = 0; ti + tile <= N; ti += tile) {
    let n = 0;
    for (let j = tj; j < tj + tile; j++) {
      for (let i = ti; i < ti + tile; i++) if (field[j * N + i] > 0) n++;
    }
    tiles.push(n / (tile * tile));
  }
}
const mean = tiles.reduce((a, b) => a + b, 0) / tiles.length;
const sd = Math.sqrt(tiles.reduce((a, b) => a + (b - mean) ** 2, 0) / tiles.length);

console.log(`\nseed ${SEED} — ${SPAN / 1000} km, ${(SPAN / OUT_PX).toFixed(1)} m/px, ${SS}x supersampled`);
console.log(`land          ${(100 * land).toFixed(1)} %`);
console.log(`islands       ${areas.length}`);
console.log(`  < 0.1 ha    ${between(0, 1000)}`);
console.log(`  0.1 – 1 ha  ${between(1000, HECTARE)}`);
console.log(`  1 – 10 ha   ${between(HECTARE, 10 * HECTARE)}`);
console.log(`  10 – 100 ha ${between(10 * HECTARE, 100 * HECTARE)}`);
console.log(`  > 100 ha    ${between(100 * HECTARE, Infinity)}`);
console.log(`largest       ${(Math.max(...areas, 0) / HECTARE).toFixed(1)} ha`);
console.log(`zoning        land/500 m tile: relative sd ${(sd / mean).toFixed(2)} (flat splatter ≈ 0.5, zoned ≈ 1.6)`);

// --- PNG (zlib is in node; no image dependency) ----------------------------------------------------
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) === 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf: Buffer): number => {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer): Buffer => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(OUT_PX, 0);
ihdr.writeUInt32BE(OUT_PX, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 2; // truecolour
const scanlines = Buffer.alloc(OUT_PX * (OUT_PX * 3 + 1));
for (let j = 0; j < OUT_PX; j++) {
  scanlines[j * (OUT_PX * 3 + 1)] = 0; // filter: none
  Buffer.from(image.buffer, j * OUT_PX * 3, OUT_PX * 3).copy(scanlines, j * (OUT_PX * 3 + 1) + 1);
}
// eslint-disable-next-line security/detect-non-literal-fs-filename -- dev-only charting tool; `out` is the output path typed by the developer running it, never external input
writeFileSync(
  out,
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(scanlines, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]),
);
console.log(`\nwrote ${out} (${OUT_PX}x${OUT_PX})`);
