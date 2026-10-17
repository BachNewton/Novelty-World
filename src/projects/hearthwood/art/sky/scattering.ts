/*
 * The air the sky is seen through, as a physical model: a planet's
 * atmosphere of molecules (Rayleigh scattering, which makes the sky blue
 * and the low sun red), aerosols (Mie scattering, the white glare round the
 * sun and the pale horizon) and a layer of ozone (which absorbs orange and
 * keeps the twilight sky blue after the sun has set). Light scattered more
 * than once is folded in from a small table worked out once, after the idea
 * in Hillaire's "A Scalable and Production Ready Sky and Atmosphere
 * Rendering Technique" (2020): the light reaching a point from every
 * direction, scattered a second time, summed as a geometric series.
 *
 * Pure and in plain numbers: the sky's shader draws the same model per pixel
 * from the same tables (`scattering-glsl.ts`), and the light reads it here
 * for the sun's colour through the air, the horizon's colour and the light
 * the sky casts all round. Lengths are metres; the light is per unit of the
 * sun's (or the moon's) light arriving at the top of the air.
 */

export type Rgb = [number, number, number];

export interface Vec {
  x: number;
  y: number;
  z: number;
}

/** The earth's air, by the published coefficients (scattering and absorption per metre at sea level, and how fast each thins with height), with half the usual aerosols: the clear air of the north, before any weather. */
export const AIR = {
  planet: 6_360_000,
  top: 6_460_000,
  rayleigh: [5.802e-6, 13.558e-6, 33.1e-6] as Rgb,
  rayleighHeight: 8000,
  mie: 2.0e-6,
  mieExtinction: 2.22e-6,
  mieHeight: 1200,
  /** How strongly the aerosols scatter forwards: the glare round the sun. */
  mieG: 0.8,
  ozone: [0.65e-6, 1.881e-6, 0.085e-6] as Rgb,
  ozoneCentre: 25_000,
  ozoneHalfWidth: 15_000,
  /** How much light the ground gives back, for the light scattered more than once. */
  groundAlbedo: 0.3,
} as const;

/** The sun's angular radius: its light fades out over its own disc as it sinks behind the earth's limb. */
const SUN_RADIUS = 0.0047;

export const TRANSMITTANCE_SIZE = { width: 128, height: 48 } as const;
export const MULTIPLE_SIZE = { width: 32, height: 32 } as const;

/** A table of colours: `width × height` texels of RGBA, row by row. */
export interface Table {
  width: number;
  height: number;
  data: Float32Array;
}

const clamp = (x: number, low: number, high: number) => Math.min(high, Math.max(low, x));

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Each constituent's density at a height above the ground, against sea level's. */
function densities(height: number): Rgb {
  return [
    Math.exp(-height / AIR.rayleighHeight),
    Math.exp(-height / AIR.mieHeight),
    Math.max(0, 1 - Math.abs(height - AIR.ozoneCentre) / AIR.ozoneHalfWidth),
  ];
}

/** How much light is taken out of a beam per metre at a height, by colour. */
function extinction(height: number, out: Rgb): Rgb {
  const [rayleigh, mie, ozone] = densities(height);
  for (let c = 0; c < 3; c++) out[c] = AIR.rayleigh[c] * rayleigh + AIR.mieExtinction * mie + AIR.ozone[c] * ozone;
  return out;
}

/** How far a ray from radius `r` at cosine `mu` from the zenith runs before leaving the air. */
export function distanceToTop(r: number, mu: number): number {
  const discriminant = r * r * (mu * mu - 1) + AIR.top * AIR.top;
  return Math.max(0, -r * mu + Math.sqrt(Math.max(0, discriminant)));
}

/** Whether a ray from radius `r` at cosine `mu` meets the ground. */
export function hitsGround(r: number, mu: number): boolean {
  return mu < 0 && r * r * (mu * mu - 1) + AIR.planet * AIR.planet >= 0;
}

function distanceToGround(r: number, mu: number): number {
  return Math.max(0, -r * mu - Math.sqrt(Math.max(0, r * r * (mu * mu - 1) + AIR.planet * AIR.planet)));
}

/** The cosine from the zenith of the horizon seen from radius `r`: anything lower is behind the earth. */
export function horizonMu(r: number): number {
  return -Math.sqrt(Math.max(0, 1 - (AIR.planet / r) ** 2));
}

const HORIZON_SPAN = Math.sqrt(AIR.top * AIR.top - AIR.planet * AIR.planet);

/** A transmittance texel's coordinates (0 to 1) for a radius and cosine: dense round the horizon, where the colour changes fastest (Bruneton's mapping). */
export function transmittanceUv(r: number, mu: number): [number, number] {
  const rho = Math.sqrt(Math.max(0, r * r - AIR.planet * AIR.planet));
  const d = distanceToTop(r, mu);
  const dMin = AIR.top - r;
  const dMax = rho + HORIZON_SPAN;
  return [(d - dMin) / Math.max(1e-6, dMax - dMin), rho / HORIZON_SPAN];
}

function fromTransmittanceUv(u: number, v: number): [number, number] {
  const rho = HORIZON_SPAN * v;
  const r = Math.sqrt(rho * rho + AIR.planet * AIR.planet);
  const dMin = AIR.top - r;
  const dMax = rho + HORIZON_SPAN;
  const d = dMin + u * (dMax - dMin);
  const mu = d === 0 ? 1 : (HORIZON_SPAN * HORIZON_SPAN - rho * rho - d * d) / (2 * r * d);
  return [r, clamp(mu, -1, 1)];
}

/** A texel's centre against the table's edge, so the first and last texels sit on 0 and 1. */
function toTexel(x: number, size: number): number {
  return 0.5 / size + clamp(x, 0, 1) * (1 - 1 / size);
}

function fromTexel(i: number, size: number): number {
  return i / (size - 1);
}

/** The fraction of light that crosses the air from radius `r` along cosine `mu` to space, worked out by marching. */
function marchTransmittance(r: number, mu: number, steps = 40): Rgb {
  const length = distanceToTop(r, mu);
  const depth: Rgb = [0, 0, 0];
  const sigma: Rgb = [0, 0, 0];
  const dt = length / steps;
  for (let i = 0; i < steps; i++) {
    const t = (i + 0.5) * dt;
    const height = Math.sqrt(r * r + t * t + 2 * r * mu * t) - AIR.planet;
    extinction(height, sigma);
    for (let c = 0; c < 3; c++) depth[c] += sigma[c] * dt;
  }
  return [Math.exp(-depth[0]), Math.exp(-depth[1]), Math.exp(-depth[2])];
}

/** The transmittance table: how much of each colour crosses the air to space, by height and direction. */
export function buildTransmittance(): Table {
  const { width, height } = TRANSMITTANCE_SIZE;
  const data = new Float32Array(width * height * 4);
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const [r, mu] = fromTransmittanceUv(fromTexel(i, width), fromTexel(j, height));
      const t = marchTransmittance(r, mu);
      data.set([t[0], t[1], t[2], 1], (j * width + i) * 4);
    }
  }
  return { width, height, data };
}

/** A table read between its texels, like a linearly filtered texture. */
function sample(table: Table, u: number, v: number, out: Rgb): Rgb {
  const x = clamp(u * table.width - 0.5, 0, table.width - 1);
  const y = clamp(v * table.height - 0.5, 0, table.height - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(table.width - 1, x0 + 1);
  const y1 = Math.min(table.height - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const d = table.data;
  for (let c = 0; c < 3; c++) {
    const a = d[(y0 * table.width + x0) * 4 + c] * (1 - fx) + d[(y0 * table.width + x1) * 4 + c] * fx;
    const b = d[(y1 * table.width + x0) * 4 + c] * (1 - fx) + d[(y1 * table.width + x1) * 4 + c] * fx;
    out[c] = a * (1 - fy) + b * fy;
  }
  return out;
}

/** The light from a body at cosine `mu` from the zenith that reaches radius `r`: none once it has set behind the earth, fading over its disc. */
export function transmittanceTo(table: Table, r: number, mu: number, out: Rgb = [0, 0, 0]): Rgb {
  const horizon = -Math.sqrt(Math.max(0, 1 - (AIR.planet / r) ** 2));
  const visible = smoothstep(horizon - SUN_RADIUS, horizon + SUN_RADIUS, mu);
  if (visible === 0) {
    out[0] = out[1] = out[2] = 0;
    return out;
  }
  const along = Math.max(mu, horizon);
  const rho = Math.sqrt(Math.max(0, r * r - AIR.planet * AIR.planet));
  const dMin = AIR.top - r;
  const dMax = rho + HORIZON_SPAN;
  const u = (distanceToTop(r, along) - dMin) / Math.max(1e-6, dMax - dMin);
  sample(table, toTexel(u, table.width), toTexel(rho / HORIZON_SPAN, table.height), out);
  out[0] *= visible;
  out[1] *= visible;
  out[2] *= visible;
  return out;
}

function rayleighPhase(cosine: number): number {
  return (3 / (16 * Math.PI)) * (1 + cosine * cosine);
}

/** The aerosols' phase: Cornette and Shanks's, a Henyey-Greenstein that keeps some light going backwards. */
function miePhase(cosine: number): number {
  const g = AIR.mieG;
  const k = (3 / (8 * Math.PI)) * ((1 - g * g) / (2 + g * g));
  return (k * (1 + cosine * cosine)) / Math.pow(1 + g * g - 2 * g * cosine, 1.5);
}

/** Directions spread evenly over the sphere (a Fibonacci spiral). */
export function sphereDirections(count: number): Vec[] {
  const golden = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: count }, (_, i) => {
    const y = 1 - (2 * (i + 0.5)) / count;
    const ring = Math.sqrt(1 - y * y);
    return { x: Math.cos(golden * i) * ring, y, z: Math.sin(golden * i) * ring };
  });
}

/**
 * The light scattered more than once, per unit of scattering, by height and
 * the sun's cosine from the zenith: the light reaching a point from every
 * direction after one scattering (and off the ground), scattered once more
 * evenly, and the series of further scatterings that follows summed.
 */
export function buildMultipleScattering(transmittance: Table, directions = 48, steps = 16): Table {
  const { width, height } = MULTIPLE_SIZE;
  const data = new Float32Array(width * height * 4);
  const rays = sphereDirections(directions);
  const sigma: Rgb = [0, 0, 0];
  const toSun: Rgb = [0, 0, 0];
  for (let j = 0; j < height; j++) {
    const r = AIR.planet + Math.max(1, fromTexel(j, height) * (AIR.top - AIR.planet));
    for (let i = 0; i < width; i++) {
      const muSun = fromTexel(i, width) * 2 - 1;
      const sun = { x: Math.sqrt(1 - muSun * muSun), y: muSun, z: 0 };
      const second: Rgb = [0, 0, 0];
      const transfer: Rgb = [0, 0, 0];
      for (const ray of rays) {
        const ground = hitsGround(r, ray.y);
        const length = ground ? distanceToGround(r, ray.y) : distanceToTop(r, ray.y);
        const dt = length / steps;
        let through0 = 1;
        let through1 = 1;
        let through2 = 1;
        for (let s = 0; s < steps; s++) {
          const t = (s + 0.5) * dt;
          const px = ray.x * t;
          const py = r + ray.y * t;
          const pz = ray.z * t;
          const pr = Math.sqrt(px * px + py * py + pz * pz);
          const h = pr - AIR.planet;
          const rayleigh = Math.exp(-h / AIR.rayleighHeight);
          const mie = Math.exp(-h / AIR.mieHeight);
          extinction(h, sigma);
          transmittanceTo(transmittance, pr, (px * sun.x + py * sun.y) / pr, toSun);
          for (let c = 0; c < 3; c++) {
            const through = c === 0 ? through0 : c === 1 ? through1 : through2;
            const scattering = AIR.rayleigh[c] * rayleigh + AIR.mie * mie;
            const step = Math.exp(-sigma[c] * dt);
            const integral = (1 - step) / Math.max(1e-12, sigma[c]);
            second[c] += through * scattering * toSun[c] * integral * (1 / (4 * Math.PI));
            transfer[c] += through * scattering * integral;
            if (c === 0) through0 *= step;
            else if (c === 1) through1 *= step;
            else through2 *= step;
          }
        }
        if (ground) {
          const ax = ray.x * length;
          const ay = r + ray.y * length;
          const az = ray.z * length;
          const atR = Math.sqrt(ax * ax + ay * ay + az * az);
          const lit = Math.max(0, (ax * sun.x + ay * sun.y) / atR);
          transmittanceTo(transmittance, atR, lit, toSun);
          const bounce = lit * (AIR.groundAlbedo / Math.PI);
          second[0] += through0 * toSun[0] * bounce;
          second[1] += through1 * toSun[1] * bounce;
          second[2] += through2 * toSun[2] * bounce;
        }
      }
      for (let c = 0; c < 3; c++) {
        const meanSecond = second[c] / directions;
        const meanTransfer = transfer[c] / directions;
        data[(j * width + i) * 4 + c] = meanSecond / (1 - meanTransfer);
      }
      data[(j * width + i) * 4 + 3] = 1;
    }
  }
  return { width, height, data };
}

/** Where in the multiple-scattering table a height and the sun's cosine lie. */
export function multipleUv(r: number, muSun: number): [number, number] {
  return [toTexel(muSun * 0.5 + 0.5, MULTIPLE_SIZE.width), toTexel((r - AIR.planet) / (AIR.top - AIR.planet), MULTIPLE_SIZE.height)];
}

/** Both tables, worked out once and kept: the sky's shader and the light read the same ones. */
export interface SkyTables {
  transmittance: Table;
  multiple: Table;
}

let tables: SkyTables | null = null;

export function skyTables(): SkyTables {
  if (tables) return tables;
  const transmittance = buildTransmittance();
  tables = { transmittance, multiple: buildMultipleScattering(transmittance) };
  return tables;
}

/** A body lighting the air: its direction and the light it brings, by colour, at the top of the air, and a tint over the glow its light makes round it in the aerosols. */
export interface SkyLight {
  direction: Vec;
  light: Rgb;
  glow?: Rgb;
}

/**
 * The light reaching an eye at `altitude` metres from direction `view`
 * (unit, the world's axes, up +y), scattered towards it by the air from
 * each of `lights`. Below the horizon the ray stops at the ground.
 */
export function skyRadiance(view: Vec, altitude: number, lights: readonly SkyLight[], steps = 16, { transmittance, multiple }: SkyTables = skyTables()): Rgb {
  const r = AIR.planet + Math.max(1, altitude);
  const ground = hitsGround(r, view.y);
  const length = ground ? distanceToGround(r, view.y) : distanceToTop(r, view.y);
  const out: Rgb = [0, 0, 0];
  const through: Rgb = [1, 1, 1];
  const sigma: Rgb = [0, 0, 0];
  const toLight: Rgb = [0, 0, 0];
  const many: Rgb = [0, 0, 0];
  const glows = lights.map(({ glow }) => glow ?? [1, 1, 1]);
  const phases = lights.map(({ direction: d }) => {
    const cosine = view.x * d.x + view.y * d.y + view.z * d.z;
    return [rayleighPhase(cosine), miePhase(cosine)] as const;
  });
  let previous = 0;
  for (let s = 0; s < steps; s++) {
    // Steps closer together near the eye, where the air is thickest.
    const next = length * ((s + 1) / steps) ** 2;
    const t = (previous + next) / 2;
    const dt = next - previous;
    previous = next;
    const p = { x: view.x * t, y: r + view.y * t, z: view.z * t };
    const pr = Math.hypot(p.x, p.y, p.z);
    const height = pr - AIR.planet;
    const [rayleigh, mie] = densities(height);
    extinction(height, sigma);
    const source: Rgb = [0, 0, 0];
    lights.forEach(({ direction: d, light }, k) => {
      const mu = (p.x * d.x + p.y * d.y + p.z * d.z) / pr;
      transmittanceTo(transmittance, pr, mu, toLight);
      const [u, v] = multipleUv(pr, mu);
      sample(multiple, u, v, many);
      const [phaseR, phaseM] = phases[k];
      for (let c = 0; c < 3; c++) {
        const scatterR = AIR.rayleigh[c] * rayleigh;
        const scatterM = AIR.mie * mie;
        source[c] += light[c] * (toLight[c] * (scatterR * phaseR + scatterM * phaseM * glows[k][c]) + many[c] * (scatterR + scatterM));
      }
    });
    for (let c = 0; c < 3; c++) {
      const step = Math.exp(-sigma[c] * dt);
      out[c] += (through[c] * source[c] * (1 - step)) / Math.max(1e-12, sigma[c]);
      through[c] *= step;
    }
  }
  return out;
}

/** The colour a body's light keeps after crossing the air down to `altitude` from cosine `mu` from the zenith: white overhead, reddening as it sinks. */
export function lightThroughAir(altitude: number, mu: number, { transmittance }: SkyTables = skyTables()): Rgb {
  return transmittanceTo(transmittance, AIR.planet + Math.max(1, altitude), mu);
}
