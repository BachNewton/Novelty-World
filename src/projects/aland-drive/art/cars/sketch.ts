// A car's shape on the CPU, for iterating on it when the GPU is busy: draws a car's near model from the side, the front
// and rear three-quarters, above, the front, the rear, the chase camera and a front wheel, and its far model, each a PNG,
// in a second or two, with no browser. It draws each surface in a flat colour under one light with a hint of sky
// reflected, so it shows proportions, sections, bands, parts and wheels; the game's material, paint and lamps are the
// gallery's to judge (`gallery.mjs`), which is still the review a car is signed off on.
//
//   npx tsx src/projects/aland-drive/art/cars/sketch.ts --car=<id> <out-folder> [--zebra]
//
// --zebra mirrors bands of light and dark in the paint, the standard check of a fair surface: the bands bend in smooth
// lines over a fair panel and kink or wobble over a lump. The door and hood views are for it.

import sharp from "sharp";
import { CAR_IDS, isCarId } from "../../sim/cars";
import { axleY, buildCarParts, groundY, type CarDetail } from "./build";
import { SURFACES, type Soup } from "./mesh";
import { CARS } from "./specs";

const COLOURS: Record<string, [number, number, number]> = {
  paint: [43, 95, 191],
  glass: [25, 38, 50],
  trim: [22, 24, 27],
  cladding: [36, 39, 42],
  gap: [8, 8, 9],
  under: [8, 9, 10],
  tyre: [24, 26, 28],
  rim: [190, 195, 200],
  rimDark: [58, 63, 68],
  grille: [14, 16, 18],
  plate: [233, 234, 234],
  lensTail: [170, 20, 25],
  lensReverse: [217, 220, 220],
  lensAmber: [201, 122, 20],
  lensHead: [215, 225, 230],
  seat: [43, 38, 34],
  seatTan: [138, 106, 72],
  interior: [30, 32, 35],
  disc: [109, 113, 118],
  rack: [22, 24, 27],
  plateBand: [42, 79, 158],
  stripe: [31, 79, 143],
  lensIndicator: [122, 69, 18],
  caliper: [226, 169, 31],
  rimGold: [201, 161, 74],
};

type V = [number, number, number];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V, b: V): V => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: V): V => {
  const l = Math.hypot(...a);
  return [a[0] / l, a[1] / l, a[2] / l];
};

interface Tri {
  p: [V, V, V];
  n: [V, V, V];
  s: number;
}

function trisOf(soup: Soup, place: (p: V) => V, turn: (n: V) => V): Tri[] {
  const out: Tri[] = [];
  for (let f = 0; f < soup.triangles; f++) {
    const p = [0, 1, 2].map((c) =>
      place(
        Array.from(
          soup.positions.subarray((f * 3 + c) * 3, (f * 3 + c) * 3 + 3),
        ) as V,
      ),
    ) as [V, V, V];
    const n = [0, 1, 2].map((c) =>
      turn(
        Array.from(
          soup.normals.subarray((f * 3 + c) * 3, (f * 3 + c) * 3 + 3),
        ) as V,
      ),
    ) as [V, V, V];
    out.push({ p, n, s: soup.surfaces[f * 3] });
  }
  return out;
}

async function draw(
  index: number,
  detail: CarDetail,
  eye: V,
  at: V,
  fov: number,
  out: string,
  W = 1200,
  H = 700,
) {
  const spec = CARS[index];
  const parts = buildCarParts(spec, detail);
  const tris: Tri[] = [
    ...trisOf(
      parts.body,
      (p) => p,
      (n) => n,
    ),
  ];
  if (parts.glass)
    tris.push(
      ...trisOf(
        parts.glass,
        (p) => p,
        (n) => n,
      ),
    );
  const ay = axleY(spec);
  for (const z of spec.body.axleZ)
    for (const side of [1, -1]) {
      const x = (side * spec.body.trackM) / 2;
      const flip = (p: V): V => (side < 0 ? [-p[0], p[1], -p[2]] : p);
      tris.push(
        ...trisOf(
          parts.wheel,
          (p) => {
            const q = flip(p);
            return [q[0] + x, q[1] + ay, q[2] + z];
          },
          flip,
        ),
      );
      if (parts.calipers)
        tris.push(
          ...trisOf(
            parts.calipers[side < 0 ? 1 : 0],
            (p) => [p[0] + x, p[1] + ay, p[2] + z],
            (n) => n,
          ),
        );
    }
  const fwd = norm(sub(at, eye));
  const right = norm(cross(fwd, [0, 1, 0]));
  const up = cross(right, fwd);
  const f = 1 / Math.tan((fov * Math.PI) / 360);
  const project = (p: V): V => {
    const d = sub(p, eye);
    const z = dot(d, fwd);
    return [
      W / 2 + ((dot(d, right) * f) / z) * (H / 2),
      H / 2 - ((dot(d, up) * f) / z) * (H / 2),
      z,
    ];
  };
  const img = Buffer.alloc(W * H * 3);
  const depth = new Float32Array(W * H).fill(Infinity);
  const ground = groundY(spec);
  // The sky, then the road and the grass wherever a pixel's ray meets the ground.
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      img.set([140, 190, 230], (y * W + x) * 3);
      const dir = norm([
        fwd[0] +
          right[0] * ((x - W / 2) / (H / 2) / f) +
          up[0] * (-(y - H / 2) / (H / 2) / f),
        fwd[1] +
          right[1] * ((x - W / 2) / (H / 2) / f) +
          up[1] * (-(y - H / 2) / (H / 2) / f),
        fwd[2] +
          right[2] * ((x - W / 2) / (H / 2) / f) +
          up[2] * (-(y - H / 2) / (H / 2) / f),
      ]);
      if (dir[1] >= 0) continue;
      const t = (ground - eye[1]) / dir[1];
      const gx = eye[0] + dir[0] * t;
      const i = (y * W + x) * 3;
      const c = Math.abs(gx) < 4 ? [85, 88, 92] : [108, 152, 84];
      img[i] = c[0];
      img[i + 1] = c[1];
      img[i + 2] = c[2];
    }
  const sun = norm([-0.5, 0.75, 0.45]);
  for (const t of tris) {
    const [a, b, c] = t.p.map(project);
    if (a[2] <= 0.05 || b[2] <= 0.05 || c[2] <= 0.05) continue;
    const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (area === 0) continue;
    const name = SURFACES[t.s];
    const base = COLOURS[name] ?? [255, 0, 255];
    const minX = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]))),
      maxX = Math.min(W - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
    const minY = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]))),
      maxY = Math.min(H - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
    for (let y = minY; y <= maxY; y++)
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5,
          py = y + 0.5;
        const w0 =
          ((b[0] - px) * (c[1] - py) - (b[1] - py) * (c[0] - px)) / area;
        const w1 =
          ((c[0] - px) * (a[1] - py) - (c[1] - py) * (a[0] - px)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const z = 1 / (w0 / a[2] + w1 / b[2] + w2 / c[2]);
        const k = y * W + x;
        if (z >= depth[k]) continue;
        depth[k] = z;
        const n = norm(
          [0, 1, 2].map(
            (ax) => t.n[0][ax] * w0 + t.n[1][ax] * w1 + t.n[2][ax] * w2,
          ) as V,
        );
        const toEye = norm(
          sub(
            eye,
            [0, 1, 2].map(
              (ax) => t.p[0][ax] * w0 + t.p[1][ax] * w1 + t.p[2][ax] * w2,
            ) as V,
          ),
        );
        const facing = dot(n, toEye);
        const lit = 0.55 + 0.6 * Math.max(0, dot(n, sun));
        const refl = sub(
          [n[0] * 2 * facing, n[1] * 2 * facing, n[2] * 2 * facing],
          toEye,
        );
        const glossy = name === "paint" || name === "glass" || name === "rim";
        // With --zebra, paint mirrors bands of light and dark: a fair surface bends them in smooth lines, a lump kinks them.
        const sky = ZEBRA ? (Math.floor(Math.atan2(refl[1], Math.hypot(refl[0], refl[2])) * 14) % 2 === 0 ? 0.95 : 0.05) : refl[1] > 0.02 ? 0.85 : 0.25;
        const fres = ZEBRA && name === "paint" ? 0.85 : glossy ? 0.06 + 0.5 * Math.pow(1 - Math.abs(facing), 4) : 0;
        const i = k * 3;
        for (let ch = 0; ch < 3; ch++)
          img[i + ch] = Math.min(
            255,
            base[ch] * lit * (1 - fres) + 230 * sky * fres,
          );
      }
  }
  await sharp(img, { raw: { width: W, height: H, channels: 3 } })
    .png()
    .toFile(out);
}

const ZEBRA = process.argv.includes("--zebra");
const asked =
  process.argv.find((arg) => arg.startsWith("--car="))?.slice(6) ?? "";
if (!isCarId(asked)) throw new Error(`--car= takes ${CAR_IDS.join(", ")}`);
const index = CAR_IDS.indexOf(asked);
const outDir =
  process.argv.slice(2).find((arg) => !arg.startsWith("--")) ?? ".";
const views: [string, V, V, number][] = [
  ["side", [12, 0.6, 0], [0, 0.55, 0], 26],
  ["front34", [5, 1.3, -6.5], [0, 0.45, 0], 34],
  ["rear34", [5, 1.6, 6.5], [0, 0.45, 0], 34],
  ["top", [0.01, 14, 0], [0, 0, 0], 22],
  ["front", [0, 0.8, -9], [0, 0.55, 0], 18],
  ["rear", [0, 1.0, 9], [0, 0.55, 0], 18],
  ["chase", [0, 2.15, 6.2], [0, 0.9, -7], 62],
];
const front = CARS[index].body.axleZ[0];
const track = CARS[index].body.trackM / 2;
views.push([
  "wheel",
  [track + 2.6, axleY(CARS[index]) + 0.2, front - 1.4],
  [track, axleY(CARS[index]), front],
  22,
]);
views.push(["door", [3.4, 1.0, -2.2], [0.9, 0.45, 0.2], 40], ["hood", [2.6, 1.9, -3.6], [0, 0.6, -1.2], 40]);
for (const [name, eye, at, fov] of views)
  await draw(index, "hero", eye, at, fov, `${outDir}/${name}.png`);
await draw(index, "far", [5, 1.3, -6.5], [0, 0.45, 0], 34, `${outDir}/far.png`);
console.log("drawn");
