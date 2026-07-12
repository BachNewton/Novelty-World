import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// Procedural archipelago terrain — a seeded HEIGHTFIELD: one surface height per (x, z).
// See docs/ISLANDS.md for the visual target and the reasoning behind every constant here.
//
// THE THESIS. A Finnish island is a DROWNED landform, not an eroded one: granite and gneiss erode
// far slower than post-glacial rebound lifts them, and the Baltic is near-tideless, so there is no
// surf machine cutting beaches. The shape of an island is the shape the ice sheet left, now hoisted
// out of the water. The waterline is not a landform — it is just where today's sea surface cuts a
// continuous, rolling sheet of ice-scoured bedrock.
//
// So there is NO island primitive. We generate ONE continuous bedrock field and let sea level cut
// it; islands, sounds, chains and skerries fall out for free, with the right grain and the right
// size distribution, because that is how the real ones formed. (An earlier version placed a radial
// falloff mask per island. It cannot produce a lineated chain of skerries and always read as a
// muffin — see docs/ISLANDS.md.)
//
// Why a heightfield and not voxels: ships are voxels because you build them; islands are terrain you
// sail past, run aground on, and gather from. Nothing digs them, so the 3D field that Astroneer /
// No Man's Sky pay for buys nothing here — while a heightfield hands the ocean the `height(x, z)`
// it needs for wave shoaling and shallow-water colour. If excavation ever becomes a core loop,
// `height` is the no-overhang special case of a signed distance field
// (`density(x,y,z) = height(x,z) - y`), so this generator survives that migration; only the mesher
// and the collider change.
//
// Everything here is a PURE function of the profile (including its seed). Same seed → same
// archipelago on every client, so a host-authoritative session ships zero terrain bytes — the same
// reason `ocean.ts` chose Gerstner over an FFT height texture.

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
  // `center` is used: it positions the window, not the terrain.
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
const DEEP_ROCK = new THREE.Color(0x1b1f21); // drowned bedrock, algae-darkened
const SHALLOW_ROCK = new THREE.Color(0x2f3531); // just under the surface
const SPLASH_LICHEN = new THREE.Color(0x0f1214); // Verrucaria maura — the black belt
const WET_ROCK = new THREE.Color(0x33312e); // wave-scoured rock just above the splash zone
const GRANITE = new THREE.Color(0x585049); // pink-grey rapakivi
const PALE_LICHEN = new THREE.Color(0x82857a); // grey-white crustose
const MAP_LICHEN = new THREE.Color(0x7d8a45); // acid yellow-green Rhizocarpon
const FRESH_ROCK = new THREE.Color(0x514c47); // steep plucked faces shed lichen
const UNDERBRUSH = new THREE.Color(0x5a5240); // heather, crowberry, dead needles — grey-BROWN
const FOREST = new THREE.Color(0x2c3826); // spruce canopy shadow on the ground
const GRAVEL = new THREE.Color(0x453f38); // the rare dark coarse-gravel pocket

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
 * `slope` is 0 on flat ground → 1 on a vertical face, taken from the mesh normal rather than from
 * finite differences of the height function: `computeVertexNormals` already has to run, and reusing
 * it saves four extra field evaluations per vertex (~1.4 M of them across the window).
 */
const surfaceColor = (
  height: number,
  broad: number,
  slope: number,
  mottle: number,
  gravel: number,
  out: THREE.Color,
): THREE.Color => {
  if (height < SPLASH_BOTTOM) {
    // Submerged: the same rock, continuing down, going dark with depth.
    return out.copy(DEEP_ROCK).lerp(SHALLOW_ROCK, smoothstep(-9, SPLASH_BOTTOM, height));
  }
  if (height < SPLASH_TOP) {
    // The black belt. Blend at both edges so it reads as a band, not a decal.
    const into = smoothstep(SPLASH_BOTTOM, SPLASH_BOTTOM + 0.25, height);
    const outOf = smoothstep(SPLASH_TOP, SPLASH_TOP - 0.2, height);
    out.copy(SHALLOW_ROCK).lerp(SPLASH_LICHEN, Math.min(into, 1));
    return out.lerp(WET_ROCK, 1 - Math.min(1, outOf + 0.35));
  }

  // Bare rock, wet and dark right above the splash zone, drying to granite within a couple of metres.
  out.copy(WET_ROCK).lerp(GRANITE, smoothstep(SPLASH_TOP, 2.5, height));

  // The lichen crust is a RING, not a cap: it peaks a metre or two above the splash zone and fades
  // out higher up, where soil and plants take over. Note the second smoothstep runs downward.
  const crust = smoothstep(SPLASH_TOP, 1.2, height) * smoothstep(6, 2.5, height);
  out.lerp(PALE_LICHEN, crust * clamp01(0.35 + 0.65 * mottle) * 0.45);
  out.lerp(MAP_LICHEN, crust * clamp01(mottle) * 0.45);

  // Steep plucked faces shed lichen and soil — bare rock. This is the roche-moutonnée lee side
  // showing through, and it is what keeps the island from reading as a uniformly furry lump.
  out.lerp(FRESH_ROCK, smoothstep(0.5, 0.78, slope));

  // Undergrowth, then closed forest floor. Both gated on shelter, never on height alone.
  const soil = soilFactor(broad, height, slope);
  out.lerp(UNDERBRUSH, soil * clamp01(0.6 + 0.4 * mottle));
  out.lerp(FOREST, forestFactor(broad, height, slope));

  // The rare dark-gravel pocket: a flat, low, sheltered hollow. Gated hard so it stays rare — this
  // is a pocket you occasionally land a boat on, not a shoreline.
  const pocket =
    smoothstep(0.62, 0.78, gravel) *
    smoothstep(0.16, 0.05, slope) *
    smoothstep(2.2, 1.1, height) *
    smoothstep(0.5, 2, broad);
  return out.lerp(GRAVEL, pocket);
};

// --- Spruce -----------------------------------------------------------------
// Above the rocky rim, an inner-archipelago island IS forest — bald rock reads as snow no matter how
// the rock is coloured (docs/ISLANDS.md). So the canopy has to be geometry, not a green tint.
//
// The whole forest is ONE `InstancedMesh`: the scene-graph traversal cost tracks NODE count, not
// instance count, and `docs/PERFORMANCE.md` records ~12,800 hidden nodes once costing 19 ms/frame.
// A node per tree would re-commit exactly that mistake.

/** Deterministic hash → [0, 1). Same seed and cell → same value on every client. */
const hash01 = (ix: number, iz: number, seed: number): number => {
  let h = (ix * 73856093 + iz * 19349663 + seed * 83492791) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};

/** Metres between candidate tree sites before jitter. Each site is then accepted or rejected by the
 *  forest factor, so this sets the *maximum* density of a closed stand. */
const TREE_SPACING = 2.5;
/** Refuse to plant above this slope even if the forest factor allows it — trees on a cliff read wrong. */
const TREE_MAX_SLOPE = 0.42;
/** Wavelength of the stand-density field, in metres. Without it, an evenly-thinned lattice reads as
 *  an orchard: uniform spacing everywhere. Real stands clump — dense thickets with clearings between. */
const STAND_SCALE = 21;

/** One spruce: a short trunk under three stacked cones, narrow rather than fat (Picea abies is a
 *  spire, not a Christmas-card triangle). Merged into a single geometry so the whole forest is one
 *  instanced draw, and vertex-coloured (trunk / canopy) to avoid a second material and a second node. */
const buildSpruceGeometry = (): THREE.BufferGeometry => {
  const trunk = new THREE.CylinderGeometry(0.06, 0.12, 1.4, 5);
  trunk.translate(0, 0.7, 0);
  const tiers = [
    { r: 1.15, h: 3.4, y: 2.3 },
    { r: 0.85, h: 2.7, y: 4.0 },
    { r: 0.5, h: 2.1, y: 5.6 },
  ].map(({ r, h, y }) => {
    const cone = new THREE.ConeGeometry(r, h, 9);
    cone.translate(0, y, 0);
    return cone;
  });

  const merged = mergeGeometries([trunk, ...tiers]);
  trunk.dispose();
  for (const t of tiers) t.dispose();

  const position = merged.attributes.position;
  const colors = new Float32Array(position.count * 3);
  const bark = new THREE.Color(0x2f2820);
  const needle = new THREE.Color(0x24331f); // deep, cool: warm greens read as larch, not spruce
  for (let i = 0; i < position.count; i++) {
    // Everything below the lowest cone's base is trunk.
    (position.getY(i) < 1.4 ? bark : needle).toArray(colors, i * 3);
  }
  merged.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return merged;
};

export interface Terrain {
  /** Add to the scene once. Holds the bedrock mesh + the instanced spruce — three scene-graph nodes
   *  total, regardless of tree count (see docs/PERFORMANCE.md). */
  object: THREE.Object3D;
  /** Show/hide the instanced spruce alone (the bedrock stays). A cost probe: the forest is one
   *  `InstancedMesh` (1 draw, 1 node) but ~1,000 instances of a multi-cone tree, so its cost is
   *  TRIANGLES, not draw calls — and it is drawn into the shadow map as well as the scene. */
  setTreesVisible: (on: boolean) => void;
  /** Stop the terrain (bedrock AND spruce) CASTING into the sun's shadow map; it still receives.
   *  Isolates what the archipelago costs as a shadow caster from what it costs as visible geometry —
   *  they are separate draws, and only one of them is on screen. */
  setCastShadow: (on: boolean) => void;
  /**
   * Swap the bedrock to an UNLIT material (same geometry, same vertex colours, trivial fragment).
   * `full − flat` is therefore the archipelago's PBR shading + shadow-receiving cost, and `flat` alone
   * is its raw fill — the same subtraction `ocean.setShading` makes for the water.
   *
   * It exists because decimating the bedrock mesh barely moved the frame, which says the terrain is NOT
   * vertex-bound (unlike the ocean) and its cost is in shading the pixels it covers. This proves that
   * rather than inferring it — and it decides whether island LOD should attack triangles or the shader.
   */
  setShading: (mode: "full" | "flat") => void;
  /** Triangles in the bedrock mesh + the spruce (one tree × instance count). The LOD conversation is
   *  about these two numbers, so they have to be reportable. */
  triangleCounts: () => { bedrock: number; trees: number };
  /**
   * Wall-clock ms this window took to GENERATE — the noise field, the displace/colour passes, and the
   * forest scatter — on the main thread.
   *
   * It is deliberately absent from the per-frame cost model: generation runs once, inside scene setup,
   * long before the benchmark's first measured frame. But it is NOT free, and it is on a timer. Today
   * it is a one-off hang at load. The moment terrain STREAMS — which it must, for the world to grow
   * past this 600 m window — the same work runs again every time the player sails into new water, and a
   * one-off load cost becomes a recurring in-play hitch. That is the point at which it has to move to a
   * Web Worker, and this number is how you know how bad the hitch would be.
   */
  generationMs: number;
  /** Bedrock height at a world (x, z). The same function the mesh was built from — anything that
   *  needs to ask the terrain a question (wave shoaling, a collider, prop scatter) reads this,
   *  never the triangles. */
  heightAt: (x: number, z: number) => number;
  /** How many spruce were planted. Reported so the tree count can be watched as the window grows. */
  treeCount: number;
  dispose: () => void;
}

/**
 * An archipelago that isn't there — same interface, no generation.
 *
 * Meshing the window is ~3 M noise evaluations on the main thread and costs SECONDS at load. A
 * benchmark or probe that switches the islands OFF was paying every one of those seconds to build
 * geometry it then immediately hid, on every page load, and the sweep does hundreds of them. Hiding a
 * thing is not the same as not making it, and the difference here is the slowest step in the harness.
 *
 * `heightAt` answers "deep water", which is what "no islands" means to anything that asks.
 */
export const createEmptyTerrain = (): Terrain => ({
  object: new THREE.Group(),
  setTreesVisible: () => {},
  setCastShadow: () => {},
  setShading: () => {},
  triangleCounts: () => ({ bedrock: 0, trees: 0 }),
  generationMs: 0,
  heightAt: () => -100,
  treeCount: 0,
  dispose: () => {},
});

/** Metres between samples. Skerries are 1–4 m tall and a few metres across, so this has to stay fine
 *  enough to resolve them — coarsen it much and the outer archipelago simply disappears. Generating
 *  the window is ~3 M noise evaluations and runs on the main thread at load; a Web Worker is the
 *  proper home for it once terrain streams (roadmap), at which point this can drop back to 1 m.
 *
 *  It is also the terrain's LOD dial, and the direct analogue of the ocean's quad size: at 1.2 m over a
 *  600 m window the bedrock is a 500² grid — a quarter of a million vertices, half a million triangles,
 *  drawn into the scene AND the shadow map. Overridable per-profile so the benchmark can sweep it. */
const SAMPLE_SPACING = 1.2;

/**
 * Mesh an archipelago window from its profile: displace, compute normals, then colour using those
 * normals. Two passes over the vertices, because the colour depends on the slope and the slope
 * comes from the normals.
 */
export function createTerrain(profile: ArchipelagoProfile): Terrain {
  // Generation is ~3 M noise evaluations on the main thread. Timed, because it is the cost that a
  // per-FRAME model cannot see and a streaming world will turn into a per-chunk hitch (see generationMs).
  const genStart = globalThis.performance.now();
  const { height: heightAt, broad: broadAt, sample } = bedrockField(profile);
  const [cx, cz] = profile.center;

  const segments = Math.round(profile.extent / (profile.spacing ?? SAMPLE_SPACING));
  const geometry = new THREE.PlaneGeometry(profile.extent, profile.extent, segments, segments);
  geometry.rotateX(-Math.PI / 2); // lay flat: the plane's local +y becomes world up

  // Displace, remembering `broad` per vertex: the colour pass needs it, and re-deriving it there
  // would evaluate the regional + island octaves a second time across the whole window.
  const position = geometry.attributes.position;
  const shelter = new Float32Array(position.count);
  const field: FieldSample = { height: 0, broad: 0 };
  for (let i = 0; i < position.count; i++) {
    sample(position.getX(i) + cx, position.getZ(i) + cz, field);
    position.setY(i, field.height);
    shelter[i] = field.broad;
  }
  geometry.computeVertexNormals();

  const normal = geometry.attributes.normal;
  const colors = new Float32Array(position.count * 3);
  const color = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i) + cx;
    const z = position.getZ(i) + cz;
    const slope = 1 - Math.abs(normal.getY(i)); // 0 flat → 1 vertical
    const mottle = fbm2(x / MOTTLE_SCALE, z / MOTTLE_SCALE, profile.seed + 909, 3);
    const gravel = noise2(x / GRAVEL_SCALE, z / GRAVEL_SCALE, profile.seed + 404);
    surfaceColor(position.getY(i), shelter[i], slope, mottle, gravel, color).toArray(colors, i * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  // No per-material lighting exception. The land is lit by the same sun and the same sky as the
  // buoys, the raft and the sea — which is the entire point of the lighting overhaul. Its old
  // per-material env scale (0.22, plus a `setEnvironment` that re-pointed the PMREM texture onto
  // this material just so three would honour it) existed only to dim a sky that out-lit the sun
  // ~21:1. Fix the balance and the hack has nothing left to do. See docs/LIGHTING.md.
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.92,
    metalness: 0,
  });

  // Unlit twin of the bedrock material: same vertex colours, no BRDF, no shadow lookup. Built lazily —
  // it is a cost probe, and an unused material should not cost a compile.
  let flatMaterial: THREE.MeshBasicMaterial | undefined;

  // Typed loosely on the material: the flat probe swaps a MeshBasicMaterial in (see setShading).
  const bedrock: THREE.Mesh<THREE.BufferGeometry, THREE.Material> = new THREE.Mesh(geometry, material);
  bedrock.position.set(cx, 0, cz);
  bedrock.name = "bedrock";
  bedrock.castShadow = true;
  bedrock.receiveShadow = true;

  // --- Plant the forest ------------------------------------------------------
  // Walk a lattice of candidate sites, jitter each inside its cell, and accept it with probability
  // equal to the forest factor there. Slope comes from a local finite difference (there is no mesh
  // normal to reuse away from a vertex), and every random draw is a pure hash of the cell — so the
  // same seed grows the same forest on every client, with nothing to synchronise.
  const sites: { x: number; z: number; y: number; scale: number; spin: number }[] = [];
  const half = profile.extent / 2;
  const cells = Math.floor(profile.extent / TREE_SPACING);
  for (let i = 0; i < cells; i++) {
    for (let j = 0; j < cells; j++) {
      const jx = hash01(i, j, profile.seed + 11);
      const jz = hash01(i, j, profile.seed + 12);
      const x = cx - half + (i + jx) * TREE_SPACING;
      const z = cz - half + (j + jz) * TREE_SPACING;

      const y = heightAt(x, z);
      if (y < 1.5) continue; // cheap reject before the expensive slope + shelter samples

      const dhdx = (heightAt(x + 1, z) - heightAt(x - 1, z)) / 2;
      const dhdz = (heightAt(x, z + 1) - heightAt(x, z - 1)) / 2;
      const slope = Math.hypot(dhdx, dhdz);
      if (slope > TREE_MAX_SLOPE) continue;

      // Clump the stands: a low-frequency field thickens some patches into closed thicket and opens
      // others into clearings. A flat acceptance probability plants a perfectly even orchard.
      const stand = 0.55 + 0.75 * fbm2(x / STAND_SCALE, z / STAND_SCALE, profile.seed + 77, 2);
      const density = clamp01(forestFactor(broadAt(x, z), y, slope) * 1.5 * clamp01(stand));
      if (hash01(i, j, profile.seed + 13) > density) continue;

      sites.push({
        x,
        z,
        y,
        scale: 0.55 + 0.95 * hash01(i, j, profile.seed + 14),
        spin: hash01(i, j, profile.seed + 15) * Math.PI * 2,
      });
    }
  }

  const spruceGeometry = buildSpruceGeometry();
  const spruceMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.95,
    metalness: 0,
  });
  const forest = new THREE.InstancedMesh(spruceGeometry, spruceMaterial, Math.max(1, sites.length));
  forest.name = "spruce";
  forest.count = sites.length;
  forest.castShadow = true;
  forest.receiveShadow = true;
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  sites.forEach((site, i) => {
    dummy.position.set(site.x, site.y, site.z);
    dummy.rotation.y = site.spin;
    dummy.scale.setScalar(site.scale);
    dummy.updateMatrix();
    forest.setMatrixAt(i, dummy.matrix);
    // A little per-tree value variation, so a stand doesn't read as one flat green mass. Kept narrow:
    // a wide range pushed the bright end khaki under a warm sun, which reads as larch, not spruce.
    const shade = 0.84 + 0.22 * hash01(i, 0, profile.seed + 16);
    forest.setColorAt(i, tint.setScalar(shade));
  });
  forest.instanceMatrix.needsUpdate = true;
  if (forest.instanceColor) forest.instanceColor.needsUpdate = true;

  const group = new THREE.Group();
  group.name = "archipelago";
  group.add(bedrock, forest);

  const triangleCount = (g: THREE.BufferGeometry) =>
    g.index ? g.index.count / 3 : g.attributes.position.count / 3;

  return {
    object: group,
    heightAt,
    treeCount: sites.length,
    generationMs: globalThis.performance.now() - genStart,
    setTreesVisible: (on) => {
      forest.visible = on;
    },
    setCastShadow: (on) => {
      bedrock.castShadow = on;
      forest.castShadow = on;
    },
    setShading: (mode) => {
      if (mode === "flat") {
        flatMaterial ??= new THREE.MeshBasicMaterial({ vertexColors: true });
        bedrock.material = flatMaterial;
        bedrock.receiveShadow = false; // an unlit material cannot receive one anyway; be explicit
      } else {
        bedrock.material = material;
        bedrock.receiveShadow = true;
      }
    },
    triangleCounts: () => ({
      bedrock: triangleCount(geometry),
      trees: triangleCount(spruceGeometry) * sites.length,
    }),
    dispose: () => {
      geometry.dispose();
      material.dispose();
      flatMaterial?.dispose();
      spruceGeometry.dispose();
      spruceMaterial.dispose();
    },
  };
}
