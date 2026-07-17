// The archipelago GENERATOR — the pure half of the terrain, deliberately free of
// three.js (and of every import): this module runs identically on the main thread,
// in the terrain Web Worker (terrain.worker.ts), and headless in Node (tools/map.ts,
// vitest). Keeping it dependency-free is what keeps the worker bundle small and the
// output byte-identical everywhere. `terrain.ts` re-exports the field functions and
// wraps `generateChunk`'s buffers into meshes; see it for the visual thesis and
// docs/ISLANDS.md for the reasoning behind every constant.
//
// Everything here is a PURE function of its request (including the seed). Same seed
// → same archipelago on every client, so a host-authoritative session ships zero
// terrain bytes — the same reason `ocean.ts` chose Gerstner over an FFT texture.

/** The parameters that make one archipelago. */
export interface ArchipelagoProfile {
  seed: number;
  /** World (x, z) the generated window is centred on. */
  center: [number, number];
  /** Edge length of the meshed window, in metres. */
  extent: number;
  /** Compass direction of the glacial grain, in radians. Islands stretch along it. */
  grain: number;
  /** Depth the field is tapered to at the window's edge, so the archipelago sits in open sea. */
  deep: number;
  /** Metres between bedrock samples — the terrain's LOD dial (default `SAMPLE_SPACING`). Coarser =
   *  quadratically fewer vertices/triangles, and the skerries start to vanish. Set by the benchmark. */
  spacing?: number;
}

/** Bump on ANY change to the field or the mesher: it keys every chunk cache, so stale
 *  geometry from an older generator can never be mistaken for current.
 *  v2: tree records grew to 7 floats (split xz/y scale) + far-tier canopy clumps. */
export const GEN_VERSION = 2;

/** Metres between samples. Skerries are 1–4 m tall and a few metres across, so this has to stay fine
 *  enough to resolve them — coarsen it much and the outer archipelago simply disappears.
 *
 *  It is also the terrain's LOD dial, and the direct analogue of the ocean's quad size: at 1.2 m over a
 *  600 m window the bedrock is a 500² grid — a quarter of a million vertices, half a million triangles.
 *  Overridable per-request so the benchmark can sweep it. */
export const SAMPLE_SPACING = 1.2;

const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Hermite fade — the standard Perlin quintic, zero 1st+2nd derivative at the ends. */
const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

/** smoothstep from `edge0` to `edge1`; `edge0 > edge1` inverts it. */
const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

/** Deterministic integer hash → a unit gradient vector. Bitwise ops keep this in int32, so it
 *  produces identical values in every JS engine (a requirement for co-op determinism). */
const gradient = (ix: number, iz: number, seed: number): [number, number] => {
  let h = (ix * 374761393 + iz * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  const angle = (h >>> 0) * ((Math.PI * 2) / 4294967296);
  return [Math.cos(angle), Math.sin(angle)];
};

/** 2D gradient (Perlin) noise, roughly in [-1, 1]. Pure in (x, z, seed). */
export const noise2 = (x: number, z: number, seed: number): number => {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = x - x0;
  const fz = z - z0;

  const dot = (ix: number, iz: number) => {
    const [gx, gz] = gradient(ix, iz, seed);
    return gx * (x - ix) + gz * (z - iz);
  };

  const u = fade(fx);
  const v = fade(fz);
  const a = lerp(dot(x0, z0), dot(x0 + 1, z0), u);
  const b = lerp(dot(x0, z0 + 1), dot(x0 + 1, z0 + 1), u);
  // Perlin's raw range is ±√2/2; scale to ~±1 so callers can reason in plain amplitudes.
  return lerp(a, b, v) * Math.SQRT2;
};

/** Fractal Brownian motion: `octaves` of `noise2` at doubling frequency, halving amplitude.
 *  Normalised so the result stays in ~[-1, 1] regardless of octave count. */
export const fbm2 = (x: number, z: number, seed: number, octaves: number): number => {
  let sum = 0;
  let amplitude = 1;
  let total = 0;
  let frequency = 1;
  for (let o = 0; o < octaves; o++) {
    sum += amplitude * noise2(x * frequency, z * frequency, seed + o * 101);
    total += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return sum / total;
};

/** Deterministic hash → [0, 1). Same seed and cell → same value on every client. */
const hash01 = (ix: number, iz: number, seed: number): number => {
  let h = (ix * 73856093 + iz * 19349663 + seed * 83492791) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};

// --- The bedrock field -------------------------------------------------------
// Four superposed scales, all sampled in a frame rotated to the glacial grain and STRETCHED along
// it. The stretch is what lineates the archipelago — islands and sounds run parallel, which is the
// single most diagnostic silhouette cue separating a Baltic skerry field from a tropical cay field.

/** Wavelengths along / across the grain, in metres. The stretch ratio is the lineation. */
const SUPER_ALONG = 2100;
const SUPER_ACROSS = 1250;
const REGIONAL_ALONG = 520;
const REGIONAL_ACROSS = 300;
const ISLAND_ALONG = 165;
const ISLAND_ACROSS = 58;
const DETAIL_ALONG = 26;
const DETAIL_ACROSS = 14;

// The amplitude constants below are set from the MEASURED distribution of the summed field, not by
// feel. Normalised fBm looks like it spans [-1, 1] but almost never gets near the ends: the
// regional+island sum has std ≈ 0.15 and a practical range of about ±0.5. Sizing `RELIEF` against
// the nominal ±1 range drowns the entire archipelago — which is exactly what happened first.

/** Metres of relief on the SUPER-REGIONAL scale — the one that decides whether a region is dense
 *  inner archipelago, thin outer skerry field, or open basin.
 *
 *  Without it the field is spectrally FLAT below 520 m, and a flat spectrum splatters same-sized
 *  islands at uniform density forever: measured over 9 km² with this term at 0, the field produced
 *  1,568 islands and NOT ONE above 10 ha, with every 500 m tile holding 11–13 % land. That is a
 *  gravel field, not an archipelago — there is no landfall to sail toward and no exposure zoning for
 *  `ISLANDS.md`'s inner/outer gradient to hang on. At 35 m the same 9 km² yields 3 islands over 10 ha
 *  (largest 50 ha), 9 of 25 tiles open water, and 6 dense — while the skerries survive. Push it to
 *  50 m and the mid-size class collapses (the count halves): the archipelago stops being Finnish. */
const SUPER_RELIEF = 35;
/** Metres of relief the regional + island scales share. Its ±0.5 practical range maps to ±23 m. */
const RELIEF = 46;
/** Roughness right at the cut, in metres (practical range ~±4.5 m). This is what shatters the coast
 *  into skerries and makes islands multi-summited; without it the sea-level contour is a few smooth
 *  blobs, which is the muffin failure in a different costume. */
const DETAIL = 7;
/** Sea level sits near the 88th percentile of the summed field, so ~12 % of the world is land and the
 *  rest is sea — an archipelago, not a continent with lakes. Raise it to drown more skerries.
 *  It is SOLVED against the field, not chosen: add power at any scale and this must be re-solved, or
 *  the extra relief simply floods or drains the world. (It moved -8.8 → -15.0 when `SUPER_RELIEF`
 *  landed, for no change in land fraction.) */
const SEA_LEVEL_BIAS = -15;

/** Surface height and the shelter proxy at one point. Reused across the mesher's hot loop. */
export interface FieldSample {
  height: number;
  broad: number;
}

/**
 * Build the archipelago's bedrock functions.
 *
 * `height` is the surface: world (x, z) → metres, sea level = 0.
 *
 * `broad` is the SAME field with the metre-scale detail removed — every scale above the detail one.
 * It is the **shelter proxy**, and it is the reason skerries stay bare while island interiors grow
 * forest. A skerry is a place where `broad` sits near or below sea level and only `detail` pokes it
 * above the water; a big island's interior is where `broad` itself is high. Gating soil and
 * vegetation on `broad` rather than on `height` therefore separates "exposed rock in the sea" from
 * "sheltered ground that holds soil" — which is the real reason one is bare and the other is
 * forested — and it costs no extra noise, because `height` computes `broad` on the way through.
 *
 * The window taper pulls both down to `deep` near the edge so the archipelago sits in a bowl of open
 * sea rather than ending at a boundary-straight cliff.
 */
export const bedrockField = (profile: ArchipelagoProfile) => {
  const { seed, center, extent, grain, deep } = profile;
  const [cx, cz] = center;
  const cos = Math.cos(-grain);
  const sin = Math.sin(-grain);
  const half = extent / 2;

  // The bedrock is sampled in WORLD coordinates, never relative to the window: the field is a
  // property of the world, and the window is only the part of it we happen to mesh. Sampling
  // relative to `center` would drag the terrain along whenever the window moved, so two adjacent
  // streamed windows could never agree on the coastline between them.
  // Rotate into the grain's frame: `u` runs along the ice flow, `v` across it.
  const alongGrain = (x: number, z: number) => x * cos - z * sin;
  const acrossGrain = (x: number, z: number) => x * sin + z * cos;

  // Chebyshev distance to the window edge — a square taper matches the square mesh, so the
  // archipelago fades to open water on all four sides at the same rate. This is the ONE place
  // `center` is used: it positions the window, not the terrain. Streamed chunks pass a huge
  // `extent` so the taper is 1 everywhere (the world does not end at a chunk).
  const taper = (x: number, z: number) =>
    smoothstep(1, 0.72, Math.max(Math.abs(x - cx), Math.abs(z - cz)) / half);

  const rawBroad = (u: number, v: number) =>
    SEA_LEVEL_BIAS +
    SUPER_RELIEF * fbm2(u / SUPER_ALONG, v / SUPER_ACROSS, seed + 3, 2) +
    RELIEF *
      (0.55 * fbm2(u / REGIONAL_ALONG, v / REGIONAL_ACROSS, seed, 2) +
        0.45 * fbm2(u / ISLAND_ALONG, v / ISLAND_ACROSS, seed + 31, 4));

  // 3 octaves, not 4: the 4th would have an across-grain wavelength of ~1.8 m, below what a 1.2 m
  // sample spacing can resolve — it would alias rather than add detail, and cost an evaluation.
  const rawDetail = (u: number, v: number) =>
    DETAIL * fbm2(u / DETAIL_ALONG, v / DETAIL_ACROSS, seed + 57, 3);

  const height = (x: number, z: number): number => {
    const u = alongGrain(x, z);
    const v = acrossGrain(x, z);
    return lerp(deep, rawBroad(u, v) + rawDetail(u, v), taper(x, z));
  };

  const broad = (x: number, z: number): number =>
    lerp(deep, rawBroad(alongGrain(x, z), acrossGrain(x, z)), taper(x, z));

  /** Both fields at once, sharing the rotation, the taper, and the regional+island evaluations.
   *  The mesher needs both at every vertex; calling `height` then `broad` would evaluate the
   *  regional and island octaves twice. Writes into `out` to stay allocation-free in the hot loop. */
  const sample = (x: number, z: number, out: FieldSample): FieldSample => {
    const u = alongGrain(x, z);
    const v = acrossGrain(x, z);
    const b = rawBroad(u, v);
    const t = taper(x, z);
    out.broad = lerp(deep, b, t);
    out.height = lerp(deep, b + rawDetail(u, v), t);
    return out;
  };

  return { height, broad, sample };
};

/** Convenience: just the surface height. The mesher, the tests, and (later) wave shoaling and the
 *  collider all read this. */
export const bedrockHeight = (profile: ArchipelagoProfile) => bedrockField(profile).height;

// --- Surface colour ----------------------------------------------------------
// Photoreal, not brand palette (see project CLAUDE.md). Every colour here is bedrock, lichen, or
// moss — there is deliberately NO sand anywhere, above or below the waterline.
// Albedos are LOW on purpose. Real granite and gneiss sit around 0.2–0.35 reflectance; a first pass
// used values near 0.6 and the islands rendered as snow-capped bone-white ridges under a 25° sun,
// which also kept the shallow-water rim clipping to white. Dark rock is both the correct look and
// the fix for the rim. Judge these against wet-and-dry Baltic granite, not against a swatch.
//
// Colours are plain [r, g, b] triples in three's working (LINEAR) space — `srgbToLinear` below is
// exactly the conversion `new THREE.Color(hex)` performs, so the emitted vertex colours are
// byte-identical to what the old THREE.Color pipeline produced.

type Rgb = [number, number, number];

/** three's ColorManagement SRGBToLinear, verbatim — keep in lock-step with the installed three. */
const srgbToLinear = (c: number): number =>
  c < 0.04045 ? c * 0.0773993808 : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4);

const rgb = (hex: number): Rgb => [
  srgbToLinear(((hex >> 16) & 255) / 255),
  srgbToLinear(((hex >> 8) & 255) / 255),
  srgbToLinear((hex & 255) / 255),
];

const copyRgb = (out: Rgb, c: Rgb) => {
  out[0] = c[0];
  out[1] = c[1];
  out[2] = c[2];
};
const lerpRgb = (out: Rgb, c: Rgb, t: number) => {
  out[0] += (c[0] - out[0]) * t;
  out[1] += (c[1] - out[1]) * t;
  out[2] += (c[2] - out[2]) * t;
};

const DEEP_ROCK = rgb(0x1b1f21); // drowned bedrock, algae-darkened
const SHALLOW_ROCK = rgb(0x2f3531); // just under the surface
const SPLASH_LICHEN = rgb(0x0f1214); // Verrucaria maura — the black belt
const WET_ROCK = rgb(0x33312e); // wave-scoured rock just above the splash zone
const GRANITE = rgb(0x585049); // pink-grey rapakivi
const PALE_LICHEN = rgb(0x82857a); // grey-white crustose
const MAP_LICHEN = rgb(0x7d8a45); // acid yellow-green Rhizocarpon
const FRESH_ROCK = rgb(0x514c47); // steep plucked faces shed lichen
const UNDERBRUSH = rgb(0x5a5240); // heather, crowberry, dead needles — grey-BROWN
const FOREST = rgb(0x2c3826); // spruce canopy shadow on the ground
const GRAVEL = rgb(0x453f38); // the rare dark coarse-gravel pocket

/** The black lichen belt's vertical extent, in metres. The Baltic is near-tideless, so this band is
 *  THIN and CRISP — a sharp dark line, not a wide intertidal smear. Getting its thinness right is
 *  most of what sells the shoreline (docs/ISLANDS.md). */
const SPLASH_TOP = 0.45;
const SPLASH_BOTTOM = -0.35;

/** Wavelength of the lichen mottling, in metres. Short wavelengths read as speckle / sensor noise
 *  from a boat; lichen patches on real shoreline rock are metres across. */
const MOTTLE_SCALE = 14;
/** Wavelength of the rare gravel-pocket field, in metres. */
const GRAVEL_SCALE = 34;

// Both gates are set against the MEASURED field on this archipelago: over its land, `broad` has a
// median of 2.8 m and a 95th percentile of 7.2 m, and slope has a median of 0.45. Thresholds pitched
// at broad > 3.5–7.5 (a guess) planted 301 trees on the whole island — nothing like the dense stands
// of a real inner-archipelago island. A mature spruce stand runs ~500–1500 stems/ha, i.e. 0.05–0.15
// trees/m², which over this island's ~13,700 m² of sheltered gentle ground means ~1,000–2,000 trees.

/** How much soil the ground holds: needs shelter (see `bedrockField.broad`), gentle slope, and
 *  enough height to be clear of storm wash. This is the gate for ALL vegetation. */
const soilFactor = (broad: number, height: number, slope: number) =>
  smoothstep(0.4, 3, broad) * smoothstep(0.55, 0.3, slope) * smoothstep(1, 2.8, height);

/** Where spruce actually closes into forest: deeper shelter, gentler ground than mere undergrowth. */
const forestFactor = (broad: number, height: number, slope: number) =>
  smoothstep(1.2, 4, broad) * smoothstep(0.48, 0.25, slope) * smoothstep(1.6, 3.2, height);

/**
 * Colour one vertex. Above the waterline the surface is an EXPOSURE gradient, not an elevation one:
 * bare scoured rock at the water, a pale lichen-crusted RING just above the splash zone, then
 * grey-brown undergrowth and spruce wherever there is shelter enough to hold soil.
 *
 * Getting this backwards is the easy mistake, and it was made: ramping pale lichen *up* with height
 * is a snow-line function, and it rendered the islands as snow-capped peaks. The palest part of a
 * real island is its shoreline.
 *
 * `slope` is 0 on flat ground → 1 on a vertical face, taken from the vertex normal.
 */
const surfaceColor = (
  height: number,
  broad: number,
  slope: number,
  mottle: number,
  gravel: number,
  out: Rgb,
): Rgb => {
  if (height < SPLASH_BOTTOM) {
    // Submerged: the same rock, continuing down, going dark with depth.
    copyRgb(out, DEEP_ROCK);
    lerpRgb(out, SHALLOW_ROCK, smoothstep(-9, SPLASH_BOTTOM, height));
    return out;
  }
  if (height < SPLASH_TOP) {
    // The black belt. Blend at both edges so it reads as a band, not a decal.
    const into = smoothstep(SPLASH_BOTTOM, SPLASH_BOTTOM + 0.25, height);
    const outOf = smoothstep(SPLASH_TOP, SPLASH_TOP - 0.2, height);
    copyRgb(out, SHALLOW_ROCK);
    lerpRgb(out, SPLASH_LICHEN, Math.min(into, 1));
    lerpRgb(out, WET_ROCK, 1 - Math.min(1, outOf + 0.35));
    return out;
  }

  // Bare rock, wet and dark right above the splash zone, drying to granite within a couple of metres.
  copyRgb(out, WET_ROCK);
  lerpRgb(out, GRANITE, smoothstep(SPLASH_TOP, 2.5, height));

  // The lichen crust is a RING, not a cap: it peaks a metre or two above the splash zone and fades
  // out higher up, where soil and plants take over. Note the second smoothstep runs downward.
  const crust = smoothstep(SPLASH_TOP, 1.2, height) * smoothstep(6, 2.5, height);
  lerpRgb(out, PALE_LICHEN, crust * clamp01(0.35 + 0.65 * mottle) * 0.45);
  lerpRgb(out, MAP_LICHEN, crust * clamp01(mottle) * 0.45);

  // Steep plucked faces shed lichen and soil — bare rock. This is the roche-moutonnée lee side
  // showing through, and it is what keeps the island from reading as a uniformly furry lump.
  lerpRgb(out, FRESH_ROCK, smoothstep(0.5, 0.78, slope));

  // Undergrowth, then closed forest floor. Both gated on shelter, never on height alone.
  const soil = soilFactor(broad, height, slope);
  lerpRgb(out, UNDERBRUSH, soil * clamp01(0.6 + 0.4 * mottle));
  lerpRgb(out, FOREST, forestFactor(broad, height, slope));

  // The rare dark-gravel pocket: a flat, low, sheltered hollow. Gated hard so it stays rare — this
  // is a pocket you occasionally land a boat on, not a shoreline.
  const pocket =
    smoothstep(0.62, 0.78, gravel) *
    smoothstep(0.16, 0.05, slope) *
    smoothstep(2.2, 1.1, height) *
    smoothstep(0.5, 2, broad);
  lerpRgb(out, GRAVEL, pocket);
  return out;
};

// --- Spruce scatter -----------------------------------------------------------

/** Metres between candidate tree sites before jitter. Each site is then accepted or rejected by the
 *  forest factor, so this sets the *maximum* density of a closed stand. */
export const TREE_SPACING = 2.5;
/** Refuse to plant above this slope even if the forest factor allows it — trees on a cliff read wrong. */
const TREE_MAX_SLOPE = 0.42;
/** Wavelength of the stand-density field, in metres. Without it, an evenly-thinned lattice reads as
 *  an orchard: uniform spacing everywhere. Real stands clump — dense thickets with clearings between. */
const STAND_SCALE = 21;

// --- The chunk mesher ----------------------------------------------------------

/** Everything needed to generate one terrain chunk. Pure data — safe to postMessage. */
export interface ChunkRequest {
  seed: number;
  /** Glacial grain direction, radians (ArchipelagoProfile.grain). */
  grain: number;
  /** Depth the legacy window taper falls to (ArchipelagoProfile.deep). */
  deep: number;
  /** World (x, z) of the chunk's centre. Emitted positions are LOCAL to it (place the
   *  mesh at the origin), which keeps vertex floats small far from the world origin. */
  originX: number;
  originZ: number;
  /** Edge length of the chunk, metres. */
  size: number;
  /** Metres between samples (the LOD dial; see SAMPLE_SPACING). */
  spacing: number;
  /** Scatter individual spruce on the true 2.5 m stand lattice (the near tiers). */
  trees: boolean;
  /** Far-tier CANOPY CLUMPS: scatter on this coarser world lattice (m) instead, each
   *  accepted site emitted as one stand-wide, true-height clump standing in for every
   *  tree in its cell — vegetation is the island's visual MASS (docs/ISLANDS.md), so
   *  far islands must keep their canopy silhouette even where individual trees are
   *  sub-pixel. Sampled from the tile's own height/shelter/normal grids (no extra
   *  field evaluations — the reason trees were ever cut at distance). Ignored when
   *  `trees` is set; must stay ≤ the tile's sample spacing so the apron covers jitter. */
  clumpLattice?: number;
  /** The legacy 600 m window's edge taper, carried as an explicit opt-in so the one-window world
   *  reproduces today's output exactly. Streamed chunks OMIT it — the world must not fade out at
   *  every chunk edge. */
  edgeTaper?: { center: [number, number]; extent: number };
  /** Metres to drop a duplicated perimeter row straight down — a SKIRT wall that hides the sliver
   *  cracks where chunks of different LOD spacing abut (their edge vertices sample the field at
   *  different intervals, so the two polylines interleave). Skirt vertices copy the edge vertex's
   *  normal and colour, so the wall shades like the surface it hangs from and reads as rock, not a
   *  curtain. Omit (streamless single window) = no skirt. */
  skirtDepth?: number;
}

/** The generated buffers. Every array is transferable (postMessage transfer list) — typed over a
 *  plain `ArrayBuffer` (never shared), which is what makes `payloadTransferables` cast-free. */
export interface ChunkPayload {
  /** (n+1)² vertices × (x, y, z); x/z local to the chunk origin, y = world height. */
  positions: Float32Array<ArrayBuffer>;
  normals: Float32Array<ArrayBuffer>;
  /** Linear-space RGB per vertex. Float32 on purpose: these albedos are DARK (drowned rock spans
   *  linear ~0.011–0.028), so 8-bit linear quantisation would band the underwater ramp into a
   *  handful of levels. If chunk memory ever demands bytes, they must be sRGB-encoded with a
   *  shader-side decode — not raw linear bytes. */
  colors: Float32Array<ArrayBuffer>;
  /** Uint16 whenever the vertex count allows (every streamed tile — half the index memory
   *  of Uint32 across ~100 tiles); Uint32 only for the big legacy single window. */
  index: Uint16Array<ArrayBuffer> | Uint32Array<ArrayBuffer>;
  /** Per tree: x, y, z (chunk-local), scaleXZ, scaleY, spin, shade — 7 floats. Width and
   *  height scale split so a far-tier canopy CLUMP can widen to cover its lattice cell
   *  while keeping true canopy height (the silhouette). Composed into instance matrices
   *  on the main thread (three's Object3D), which is trivial next to the field math. */
  trees: Float32Array<ArrayBuffer>;
  treeCount: number;
  /** Wall-clock ms this chunk took to generate — ON WHICHEVER THREAD RAN IT. The number that
   *  decides how bad an in-play streaming hitch would be if this ever ran on the main thread. */
  generationMs: number;
}

/** The legacy one-window world as a chunk request: the whole `extent` in one chunk, WITH the
 *  edge taper (so the archipelago still sits in its bowl of open sea, exactly as before). */
export const windowChunkRequest = (profile: ArchipelagoProfile): ChunkRequest => ({
  seed: profile.seed,
  grain: profile.grain,
  deep: profile.deep,
  originX: profile.center[0],
  originZ: profile.center[1],
  size: profile.extent,
  spacing: profile.spacing ?? SAMPLE_SPACING,
  trees: true,
  edgeTaper: { center: profile.center, extent: profile.extent },
});

/** Every ArrayBuffer in a payload, for postMessage's transfer list. */
export const payloadTransferables = (p: ChunkPayload): ArrayBuffer[] => [
  p.positions.buffer,
  p.normals.buffer,
  p.colors.buffer,
  p.index.buffer,
  p.trees.buffer,
];

/**
 * Generate one terrain chunk: heights (with a one-sample APRON so edge normals are exact),
 * central-difference normals, vertex colours, and the spruce scatter — as plain buffers.
 *
 * Two properties matter more than anything else here:
 *
 *  - **World-anchored everything.** Heights sample world coordinates; tree candidates hash WORLD
 *    lattice cells (`floor(worldX / TREE_SPACING)`), not window-local indices. Two adjacent chunks
 *    therefore agree exactly on the coastline AND on every tree near their shared edge.
 *  - **Apron normals.** `computeVertexNormals` on a lone chunk gets edge normals wrong (it can't
 *    see the neighbour's triangles), which reads as a lighting seam at every chunk border. Central
 *    differences of the height grid — sampled one step beyond the chunk on all sides — are exact
 *    at the edges and cheaper than the face-averaging pass.
 */
export function generateChunk(req: ChunkRequest): ChunkPayload {
  const genStart = globalThis.performance.now();
  const profile: ArchipelagoProfile = {
    seed: req.seed,
    grain: req.grain,
    deep: req.deep,
    // No taper for streamed chunks: a huge extent puts every sample deep inside the
    // smoothstep's flat 1 region (the same trick tools/map.ts uses to chart the raw field).
    center: req.edgeTaper?.center ?? [0, 0],
    extent: req.edgeTaper?.extent ?? 1e9,
  };
  const { height: heightAt, broad: broadAt, sample } = bedrockField(profile);

  const n = Math.max(1, Math.round(req.size / req.spacing)); // cells per side
  const step = req.size / n; // actual spacing after rounding (mirrors PlaneGeometry)
  const verts = n + 1;
  const half = req.size / 2;

  // Height + shelter over the apron grid: (n+3)² samples, indices -1..n+1.
  const apron = n + 3;
  const heights = new Float32Array(apron * apron);
  const shelter = new Float32Array(verts * verts);
  const field: FieldSample = { height: 0, broad: 0 };
  for (let jz = -1; jz <= n + 1; jz++) {
    for (let jx = -1; jx <= n + 1; jx++) {
      const wx = req.originX - half + jx * step;
      const wz = req.originZ - half + jz * step;
      const inCore = jx >= 0 && jx <= n && jz >= 0 && jz <= n;
      if (inCore) {
        // Core vertices need broad too (the colour pass); sample() shares the evaluations.
        sample(wx, wz, field);
        heights[(jz + 1) * apron + (jx + 1)] = field.height;
        shelter[jz * verts + jx] = field.broad;
      } else {
        heights[(jz + 1) * apron + (jx + 1)] = heightAt(wx, wz);
      }
    }
  }

  // Positions + central-difference normals. Vertex order is row-major over z then x,
  // matching PlaneGeometry's layout. Skirt vertices (if any) append after the grid.
  const skirtVerts = req.skirtDepth !== undefined ? 4 * n : 0;
  const totalVerts = verts * verts + skirtVerts;
  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const inv2s = 1 / (2 * step);
  for (let jz = 0; jz <= n; jz++) {
    for (let jx = 0; jx <= n; jx++) {
      const i = jz * verts + jx;
      const h = heights[(jz + 1) * apron + (jx + 1)];
      positions[i * 3] = -half + jx * step;
      positions[i * 3 + 1] = h;
      positions[i * 3 + 2] = -half + jz * step;
      const dhdx = (heights[(jz + 1) * apron + (jx + 2)] - heights[(jz + 1) * apron + jx]) * inv2s;
      const dhdz = (heights[(jz + 2) * apron + (jx + 1)] - heights[jz * apron + (jx + 1)]) * inv2s;
      const invLen = 1 / Math.sqrt(dhdx * dhdx + 1 + dhdz * dhdz);
      normals[i * 3] = -dhdx * invLen;
      normals[i * 3 + 1] = invLen;
      normals[i * 3 + 2] = -dhdz * invLen;
    }
  }

  // Colour pass: slope from the normal (saves four field evaluations per vertex), plus the
  // mottle + gravel noise fields, sampled in WORLD coordinates like everything else.
  const colors = new Float32Array(totalVerts * 3);
  const out: Rgb = [0, 0, 0];
  for (let jz = 0; jz <= n; jz++) {
    for (let jx = 0; jx <= n; jx++) {
      const i = jz * verts + jx;
      const wx = req.originX + positions[i * 3];
      const wz = req.originZ + positions[i * 3 + 2];
      const slope = 1 - Math.abs(normals[i * 3 + 1]); // 0 flat → 1 vertical
      const mottle = fbm2(wx / MOTTLE_SCALE, wz / MOTTLE_SCALE, req.seed + 909, 3);
      const gravel = noise2(wx / GRAVEL_SCALE, wz / GRAVEL_SCALE, req.seed + 404);
      surfaceColor(positions[i * 3 + 1], shelter[i], slope, mottle, gravel, out);
      colors[i * 3] = out[0];
      colors[i * 3 + 1] = out[1];
      colors[i * 3 + 2] = out[2];
    }
  }

  // Index: PlaneGeometry's exact cell split and winding, for continuity with the old mesh.
  // Uint16 when it fits (every streamed tile) — see the ChunkPayload doc.
  const index =
    totalVerts <= 65535
      ? new Uint16Array(n * n * 6 + skirtVerts * 6)
      : new Uint32Array(n * n * 6 + skirtVerts * 6);
  let k = 0;
  for (let jz = 0; jz < n; jz++) {
    for (let jx = 0; jx < n; jx++) {
      const a = jz * verts + jx;
      const b = (jz + 1) * verts + jx;
      const c = (jz + 1) * verts + jx + 1;
      const d = jz * verts + jx + 1;
      index[k++] = a;
      index[k++] = b;
      index[k++] = d;
      index[k++] = b;
      index[k++] = c;
      index[k++] = d;
    }
  }

  // Skirt: walk the perimeter as one ring — south (+x), east (+z), north (−x), west (−z) —
  // duplicate each ring vertex `skirtDepth` lower with the SAME normal and colour, and wall each
  // edge with two outward-facing triangles. (With that ring order, (a, b, bottomB) faces away
  // from the chunk on every side; derived from (b−a)×(bottomB−a) = −depth·(edge×ŷ).)
  if (req.skirtDepth !== undefined) {
    const ring: number[] = [];
    for (let jx = 0; jx < n; jx++) ring.push(0 * verts + jx); // south row, −half → +half
    for (let jz = 0; jz < n; jz++) ring.push(jz * verts + n); // east column
    for (let jx = n; jx > 0; jx--) ring.push(n * verts + jx); // north row, reversed
    for (let jz = n; jz > 0; jz--) ring.push(jz * verts + 0); // west column, reversed
    const base = verts * verts;
    for (let r = 0; r < ring.length; r++) {
      const src = ring[r] * 3;
      const dst = (base + r) * 3;
      positions[dst] = positions[src];
      positions[dst + 1] = positions[src + 1] - req.skirtDepth;
      positions[dst + 2] = positions[src + 2];
      for (let c = 0; c < 3; c++) {
        normals[dst + c] = normals[src + c];
        colors[dst + c] = colors[src + c];
      }
    }
    for (let r = 0; r < ring.length; r++) {
      const a = ring[r];
      const b = ring[(r + 1) % ring.length];
      const aBottom = base + r;
      const bBottom = base + ((r + 1) % ring.length);
      index[k++] = a;
      index[k++] = b;
      index[k++] = bBottom;
      index[k++] = a;
      index[k++] = bBottom;
      index[k++] = aBottom;
    }
  }

  // --- Plant the forest ------------------------------------------------------
  // Walk the WORLD lattice of candidate sites overlapping this chunk, jitter each inside its cell,
  // and accept it with probability equal to the forest factor there. Every random draw is a pure
  // hash of the WORLD cell — so the same seed grows the same forest on every client AND the same
  // tree from whichever chunk owns its cell (ownership = the cell's base corner).
  const trees: number[] = [];
  if (req.trees) {
    const lo = req.originX - half;
    const hi = req.originX + half;
    const loZ = req.originZ - half;
    const hiZ = req.originZ + half;
    const ci0 = Math.ceil(lo / TREE_SPACING);
    const ci1 = Math.ceil(hi / TREE_SPACING) - 1;
    const cj0 = Math.ceil(loZ / TREE_SPACING);
    const cj1 = Math.ceil(hiZ / TREE_SPACING) - 1;
    for (let ci = ci0; ci <= ci1; ci++) {
      for (let cj = cj0; cj <= cj1; cj++) {
        const jx = hash01(ci, cj, req.seed + 11);
        const jz = hash01(ci, cj, req.seed + 12);
        const x = (ci + jx) * TREE_SPACING;
        const z = (cj + jz) * TREE_SPACING;

        const y = heightAt(x, z);
        if (y < 1.5) continue; // cheap reject before the expensive slope + shelter samples

        const dhdx = (heightAt(x + 1, z) - heightAt(x - 1, z)) / 2;
        const dhdz = (heightAt(x, z + 1) - heightAt(x, z - 1)) / 2;
        const slope = Math.hypot(dhdx, dhdz);
        if (slope > TREE_MAX_SLOPE) continue;

        // Clump the stands: a low-frequency field thickens some patches into closed thicket and
        // opens others into clearings. A flat acceptance probability plants a perfectly even orchard.
        const stand = 0.55 + 0.75 * fbm2(x / STAND_SCALE, z / STAND_SCALE, req.seed + 77, 2);
        const density = clamp01(forestFactor(broadAt(x, z), y, slope) * 1.5 * clamp01(stand));
        if (hash01(ci, cj, req.seed + 13) > density) continue;

        const scale = 0.55 + 0.95 * hash01(ci, cj, req.seed + 14);
        trees.push(
          x - req.originX,
          y,
          z - req.originZ,
          scale, // a real tree scales uniformly — width and height together
          scale,
          hash01(ci, cj, req.seed + 15) * Math.PI * 2, // spin
          // A little per-tree value variation, so a stand doesn't read as one flat green mass.
          // Kept narrow: a wide range pushed the bright end khaki under a warm sun (larch, not
          // spruce). Hashed on the WORLD cell — the old code hashed the site's array index,
          // which was window-relative and order-dependent.
          0.84 + 0.22 * hash01(ci, cj, req.seed + 16), // shade
        );
      }
    }
  } else if (req.clumpLattice !== undefined) {
    // --- Canopy clumps (far tiers) -------------------------------------------
    // Same stand fields, same world-cell hashing, but candidates walk the COARSE clump
    // lattice and read height/shelter/slope by bilinear interpolation of the grids this
    // tile already sampled for its mesh — pure array math, no field evaluations. An
    // accepted clump is widened to cover its cell (coverage ≈ the true forest's) at
    // true canopy height, so a far island keeps its forested mass and silhouette; the
    // stands it marks are where the near tiers grow their individual trees, so sailing
    // in reads as clumps RESOLVING, not forest appearing.
    const L = req.clumpLattice;
    const lerp2 = (a: number, b: number, t: number) => a + (b - a) * t;
    // Bilinear over the apron height grid at chunk-local (lx, lz); clamped at the rim.
    const gridAt = (arr: Float32Array, stride: number, lx: number, lz: number): number => {
      const gx = Math.min(Math.max((lx + half) / step, -1), n + 1) + 1;
      const gz = Math.min(Math.max((lz + half) / step, -1), n + 1) + 1;
      const x0 = Math.floor(gx);
      const z0 = Math.floor(gz);
      const x1 = Math.min(x0 + 1, n + 2);
      const z1 = Math.min(z0 + 1, n + 2);
      const fx = gx - x0;
      const fz = gz - z0;
      return lerp2(
        lerp2(arr[z0 * stride + x0], arr[z0 * stride + x1], fx),
        lerp2(arr[z1 * stride + x0], arr[z1 * stride + x1], fx),
        fz,
      );
    };
    // The shelter grid covers core vertices only (no apron); clamp into it.
    const shelterAt = (lx: number, lz: number): number => {
      const gx = Math.min(Math.max((lx + half) / step, 0), n);
      const gz = Math.min(Math.max((lz + half) / step, 0), n);
      const x0 = Math.floor(gx);
      const z0 = Math.floor(gz);
      const x1 = Math.min(x0 + 1, n);
      const z1 = Math.min(z0 + 1, n);
      const fx = gx - x0;
      const fz = gz - z0;
      return lerp2(
        lerp2(shelter[z0 * verts + x0], shelter[z0 * verts + x1], fx),
        lerp2(shelter[z1 * verts + x0], shelter[z1 * verts + x1], fx),
        fz,
      );
    };
    const lo = req.originX - half;
    const hi = req.originX + half;
    const loZ = req.originZ - half;
    const hiZ = req.originZ + half;
    const ci0 = Math.ceil(lo / L);
    const ci1 = Math.ceil(hi / L) - 1;
    const cj0 = Math.ceil(loZ / L);
    const cj1 = Math.ceil(hiZ / L) - 1;
    for (let ci = ci0; ci <= ci1; ci++) {
      for (let cj = cj0; cj <= cj1; cj++) {
        const x = (ci + hash01(ci, cj, req.seed + 11)) * L;
        const z = (cj + hash01(ci, cj, req.seed + 12)) * L;
        const lx = x - req.originX;
        const lz = z - req.originZ;

        const y = gridAt(heights, apron, lx, lz);
        if (y < 1.5) continue;
        // Slope from the finite differences of the height grid, at the grid's own scale —
        // the same quantity the vertex normals encode.
        const dhdx = (gridAt(heights, apron, lx + step, lz) - gridAt(heights, apron, lx - step, lz)) / (2 * step);
        const dhdz = (gridAt(heights, apron, lx, lz + step) - gridAt(heights, apron, lx, lz - step)) / (2 * step);
        const slope = Math.hypot(dhdx, dhdz);
        if (slope > TREE_MAX_SLOPE) continue;

        const stand = 0.55 + 0.75 * fbm2(x / STAND_SCALE, z / STAND_SCALE, req.seed + 77, 2);
        const density = clamp01(forestFactor(shelterAt(lx, lz), y, slope) * 1.5 * clamp01(stand));
        if (hash01(ci, cj, req.seed + 13) > density) continue;

        trees.push(
          lx,
          y,
          lz,
          // Widen to the cell: the base spruce canopy is ~2.3 m across at scale 1, so
          // L/2.3 covers a cell edge-to-edge; jittered so the canopy line stays ragged.
          (L / 2.3) * (0.75 + 0.5 * hash01(ci, cj, req.seed + 14)),
          0.8 + 0.4 * hash01(ci, cj, req.seed + 18), // true canopy height, slight variation
          hash01(ci, cj, req.seed + 15) * Math.PI * 2,
          0.84 + 0.22 * hash01(ci, cj, req.seed + 16),
        );
      }
    }
  }

  return {
    positions,
    normals,
    colors,
    index,
    trees: new Float32Array(trees),
    treeCount: trees.length / 7,
    generationMs: globalThis.performance.now() - genStart,
  };
}
