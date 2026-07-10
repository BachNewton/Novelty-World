import * as THREE from "three";

/**
 * The material library — measured values, with their sources, for both the lighting calibration rig
 * and the game itself.
 *
 * ## Why this file exists
 *
 * You cannot judge a lighting model against flat vertex colours. A painted buoy tells you the light
 * ARRIVED; it cannot tell you the light is RIGHT. What tells you that is a surface whose response is
 * known independently of the renderer: an 18 % grey ball is 18 % grey whether you light it with the
 * sun, a softbox, or a bug.
 *
 * ## The on-set trio, which this rig is a copy of
 *
 * Film productions put three objects in the plate whenever the lighting or the camera changes:
 *
 * | object | what it measures |
 * |---|---|
 * | **matte grey ball, 18 % reflectance** | the key's direction, intensity, colour, and shadow softness |
 * | **chrome ball** | the environment — where the lights are, their shape, size and colour |
 * | **Macbeth / X-Rite ColorChecker** | white balance and colour |
 *
 * `GREY_BALL`, `CHROME_BALL` and the reference patches below are the digital twins of exactly that.
 * (CAVE Academy, "The Grey, the Chrome and the Macbeth Chart".)
 *
 * ## Colour space — the trap
 *
 * `baseColor` here is **linear sRGB**, which is what a shader multiplies irradiance by. The `hex` in
 * each comment is the **sRGB-encoded** display value, which is what a colour picker shows. They are
 * not interchangeable, and the classic casualty is middle grey: **18 % reflectance encodes to sRGB
 * 118 (`#767676`), not 128.** `GREY_50_SRGB` exists to keep that honest — if it and `GREY_CARD` ever
 * look the same in a frame, the transfer function is broken.
 *
 * ## The physical range, and what is outside it
 *
 * Filament publishes authoring ranges: dielectric base colour in **[0.04 .. 0.94] linear**, metals in
 * **[0.66 .. 1.0]**. A surface far outside them reads as CG — a crushed black that never picks up
 * bounce light, or a white that out-reflects snow. But these are rules of thumb for hand-painting an
 * albedo texture, and real measured data breaks them (chromium's red F0, gold's blue, charcoal, and
 * seawater all do). `assertPlausible` therefore checks what is actually IMPOSSIBLE, and
 * `outsideAuthoringRange` flags the rest so the test can demand a justification. See both.
 *
 * ## Metalness is binary
 *
 * In the metallic-roughness workflow `baseColor` means two different things. For a **metal** it IS
 * `F0`, the tinted specular reflectance at normal incidence, and there is no diffuse term at all. For
 * a **dielectric** it is the diffuse albedo, and `F0` is a separate achromatic ~4 % the shader adds
 * from `ior` (three's default 1.5 → `((1.5-1)/(1.5+1))² = 0.04`). This is why **rust is `metalness: 0`**:
 * iron oxide is a rough dielectric, not a conductor, and painting it as a dirty metal is the single
 * most common way to make a "PBR" scene look wrong.
 *
 * ## What is measured and what is not
 *
 * Every entry carries its source. Entries marked `derived: true` are physically reasoned but NOT
 * traceable to a published measurement — nobody publishes a measured card for marine gelcoat. They
 * are honest guesses and are labelled as such rather than laundered into the same table as Chromium's
 * spectral F0. The roaming "albedo of common materials" chart usually credited to the Frostbite paper
 * is **not in that paper**; it traces to a blog post and to climatology. Snow and seawater below were
 * checked against snow-science and climate sources directly.
 */

/** Linear-sRGB reflectance triple. NOT an sRGB hex — see the colour-space note above. */
export type LinearRgb = readonly [number, number, number];

export interface MaterialSpec {
  /** Stable key. Used by the debug API, the capture tool, and the reviewer prompts. */
  readonly name: string;
  /** What a human calls it. */
  readonly label: string;
  readonly baseColor: LinearRgb;
  /** Binary in this workflow. A conductor or not; nothing is 0.3 of a metal. */
  readonly metalness: 0 | 1;
  /** three's *perceptual* roughness. GGX alpha = roughness². */
  readonly roughness: number;
  /** Index of refraction. Sets a dielectric's F0; ignored when `metalness` is 1. */
  readonly ior?: number;
  /** A clear resin layer over the base. Gelcoat and automotive paint genuinely have one. */
  readonly clearcoat?: number;
  readonly clearcoatRoughness?: number;
  /** Retroreflective fuzz at grazing angles — woven cloth. */
  readonly sheen?: number;
  /** Scales the dielectric F0. 0 makes a pure Lambertian, which is what the irradiance probe needs. */
  readonly specularIntensity?: number;
  /** Total diffuse hemispherical reflectance, where a source measures it. Metals have none. */
  readonly albedo?: number;
  /** Physically reasoned but not traceable to a published measurement. */
  readonly derived?: boolean;
  readonly source: string;
}

// Keeps each entry's `name` a string LITERAL (so `MaterialName` is a real union) while still typing
// the optional fields, which a bare generic would narrow away entirely.
const spec = <T extends MaterialSpec>(m: T): T & MaterialSpec => m;

// --- The on-set reference trio ----------------------------------------------

/** The production grey ball. 18 % reflectance: the key light's direction, intensity and colour. */
export const GREY_BALL = spec({
  name: "grey-ball-18",
  label: "18% grey ball",
  baseColor: [0.18, 0.18, 0.18], // sRGB #767676
  metalness: 0,
  roughness: 1,
  albedo: 0.18,
  source: "Kodak/ISO 18% photographic middle grey; the on-set grey ball is painted to it",
});

/** The production chrome ball. Reads the environment back at you: sun disc, clouds, horizon. */
export const CHROME_BALL = spec({
  name: "chrome-ball",
  label: "chrome ball",
  baseColor: [0.654, 0.685, 0.701], // Chromium F0, sRGB #D3D8DA
  metalness: 1,
  roughness: 0.02,
  source: "physicallybased.info — Chromium F0 (0.654, 0.685, 0.701)",
});

/** sRGB 128. Deliberately beside the 18 % ball to expose the 118-vs-128 encode gap. */
export const GREY_50_SRGB = spec({
  name: "grey-50-srgb",
  label: "50% sRGB grey (linear 0.216)",
  baseColor: [0.2158605, 0.2158605, 0.2158605], // sRGB #808080
  metalness: 0,
  roughness: 1,
  albedo: 0.216,
  source: "IEC 61966-2-1 inverse EOTF of 128/255. NOT middle grey — that is 0.18 / #767676",
});

// --- Brackets: the darkest and brightest real dielectrics ---------------------

export const CHARCOAL = spec({
  name: "charcoal",
  label: "charcoal (darkest real dielectric)",
  baseColor: [0.02, 0.02, 0.02], // sRGB #272727
  metalness: 0,
  roughness: 0.9,
  ior: 1.5,
  albedo: 0.02,
  source: "physicallybased.info — Charcoal. Nothing real absorbs more than this",
});

export const SNOW = spec({
  name: "snow",
  label: "fresh snow (brightest real dielectric)",
  baseColor: [0.85, 0.85, 0.85], // sRGB #EDEDED
  metalness: 0,
  roughness: 0.5,
  ior: 1.31,
  albedo: 0.85,
  // Snow is strongly spectral: ~0.96 in the visible, ~0.80 broadband once NIR drags it down.
  source: "physicallybased.info — Snow. 0.85 is a visible/broadband compromise; state which you mean",
});

// --- Boat materials ----------------------------------------------------------

export const GELCOAT = spec({
  name: "gelcoat",
  label: "marine gloss white (gelcoat hull)",
  baseColor: [0.8, 0.8, 0.78],
  metalness: 0,
  roughness: 0.35,
  // A literal clearcoat stack: white pigment under a clear resin topcoat. The physics warrants the
  // layer even though nobody has published the exact roughness.
  clearcoat: 1,
  clearcoatRoughness: 0.05,
  albedo: 0.8,
  derived: true,
  source: "DERIVED — pigmented white beneath a clear resin topcoat; clearcoat is physically warranted",
});

export const MATTE_WHITE = spec({
  name: "matte-white",
  label: "matte white paint",
  baseColor: [0.8, 0.8, 0.8],
  metalness: 0,
  roughness: 0.85,
  albedo: 0.8,
  derived: true,
  source: "DERIVED — the same pigment as the gelcoat with the clearcoat removed. The A/B for gloss",
});

export const RUBBER_FENDER = spec({
  name: "rubber",
  label: "rubber fender",
  baseColor: [0.036, 0.036, 0.036], // sRGB #353535
  metalness: 0,
  roughness: 0.95,
  albedo: 0.035,
  source: "Google Filament — dielectric table, Rubber #353535",
});

export const SAILCLOTH = spec({
  name: "sailcloth",
  label: "sailcloth (Dacron)",
  baseColor: [0.7, 0.7, 0.68],
  metalness: 0,
  roughness: 0.6,
  sheen: 0.3,
  albedo: 0.7,
  derived: true,
  source: "DERIVED — a rough woven dielectric; the sheen lobe is what makes cloth read as cloth",
});

// --- Metals ------------------------------------------------------------------

export const ALUMINIUM = spec({
  name: "aluminium",
  label: "aluminium",
  baseColor: [0.916, 0.923, 0.924], // sRGB #F5F6F6
  metalness: 1,
  roughness: 0.1,
  source: "physicallybased.info — Aluminium F0; agrees with Filament #e8eaea",
});

export const STEEL = spec({
  name: "steel",
  label: "stainless steel",
  baseColor: [0.669, 0.639, 0.598], // sRGB #D6D1CB
  metalness: 1,
  roughness: 0.2,
  source: "physicallybased.info — Stainless Steel F0",
});

export const RUSTED_IRON = spec({
  name: "rusted-iron",
  label: "rusted iron",
  baseColor: [0.19, 0.08, 0.04],
  // NOT a metal. Iron oxide is a dielectric; rendering rust as a dirty conductor is the commonest
  // way to make a PBR scene look wrong.
  metalness: 0,
  roughness: 0.85,
  albedo: 0.1,
  derived: true,
  source: "DERIVED — iron oxide is a rough dielectric, not a conductor",
});

export const COPPER = spec({
  name: "copper",
  label: "copper",
  // Two authorities disagree: physicallybased.info gives (0.932, 0.623, 0.522), Filament gives
  // sRGB #f7bc9e -> (0.932, 0.505, 0.350), noticeably more orange. Both derive from spectral n,k
  // with different observers. Filament's is the value film and games actually adopted, so a copper
  // object reads as copper to a human; taking it, and recording the disagreement.
  baseColor: [0.932, 0.505, 0.35],
  metalness: 1,
  roughness: 0.08,
  source: "Google Filament — Copper #f7bc9e. physicallybased.info disagrees: (0.932,0.623,0.522)",
});

export const GOLD = spec({
  name: "gold",
  label: "gold",
  // physicallybased.info's measured red is 1.059 — a reflectance above 1 is meaningful spectrally but
  // three clamps THREE.Color to [0,1], so it arrives as 1.0 either way. Written clamped, deliberately.
  baseColor: [1, 0.773, 0.307], // sRGB #FFE496
  metalness: 1,
  roughness: 0.08,
  source: "physicallybased.info — Gold F0 (1.059, 0.773, 0.307), red clamped to 1.0 for three",
});

// --- The world the game is set in --------------------------------------------

export const OAK = spec({
  name: "oak",
  label: "fresh oak plank",
  baseColor: [0.242, 0.107, 0.045], // sRGB #875C3C
  metalness: 0,
  roughness: 0.6,
  albedo: 0.2,
  source: "Google Filament — dielectric table, Wood #875c3c",
});

export const DRIFTWOOD = spec({
  name: "driftwood",
  label: "weathered driftwood",
  baseColor: [0.2, 0.19, 0.16],
  metalness: 0,
  roughness: 0.85,
  albedo: 0.22,
  derived: true,
  source: "DERIVED — greyed, desaturated, roughened wood. What the raft is actually made of",
});

export const DRY_GRANITE = spec({
  name: "dry-granite",
  label: "dry granite",
  baseColor: [0.3, 0.29, 0.27],
  metalness: 0,
  roughness: 0.75,
  albedo: 0.3,
  source: "EPA rock-reflectance study — granite 0.17..0.55; 0.30 for grey Finnish bedrock",
});

export const WET_GRANITE = spec({
  name: "wet-granite",
  label: "wet granite",
  // Wet rock is darker AND glossier: the water film forward-scatters light that a dry surface would
  // have kicked back. The mechanism is measured (Lekner & Dorf); this exact granite pair is not.
  baseColor: [0.18, 0.17, 0.15],
  metalness: 0,
  roughness: 0.35,
  albedo: 0.18,
  derived: true,
  source: "DERIVED from Lekner & Dorf (wet surfaces darken ~30-40% and gloss up). Not granite-specific",
});

export const SPRUCE_FOLIAGE = spec({
  name: "spruce",
  label: "spruce foliage",
  baseColor: [0.1, 0.14, 0.05],
  metalness: 0,
  roughness: 0.6,
  albedo: 0.1,
  // Conifer NEEDLES transmit far less visible light than broadleaves do — the "foliage is
  // translucent" rule is real but lives mostly in the NIR. Deliberately no `transmission` here.
  source: "Filament Vegetation #7b824e; Hovi et al. 2020 (Silva Fennica) on needle optics",
});

export const SEAWATER = spec({
  name: "seawater",
  label: "seawater",
  baseColor: [0.015, 0.045, 0.06],
  metalness: 0,
  roughness: 0.02,
  ior: 1.333, // -> F0 = ((1.333-1)/(1.333+1))^2 = 0.020, exactly Filament's "water 2%"
  albedo: 0.06,
  source: "physicallybased.info (ior 1.3325); Seferian et al. 2018 for the 0.06 diffuse albedo",
});

/** Everything, in the order the rig lays them out left to right. */
export const MATERIALS = [
  GREY_BALL,
  CHROME_BALL,
  GREY_50_SRGB,
  CHARCOAL,
  SNOW,
  GELCOAT,
  MATTE_WHITE,
  RUBBER_FENDER,
  SAILCLOTH,
  ALUMINIUM,
  STEEL,
  RUSTED_IRON,
  COPPER,
  GOLD,
  OAK,
  DRIFTWOOD,
  DRY_GRANITE,
  WET_GRANITE,
  SPRUCE_FOLIAGE,
  SEAWATER,
] as const;

export type MaterialName = (typeof MATERIALS)[number]["name"];

const BY_NAME = new Map<string, MaterialSpec>(MATERIALS.map((m) => [m.name, m]));

export const isMaterialName = (name: string): name is MaterialName => BY_NAME.has(name);

export const materialByName = (name: MaterialName): MaterialSpec => {
  const found = BY_NAME.get(name);
  if (found === undefined) throw new Error(`unknown material: ${name}`);
  return found;
};

/**
 * The default probe set: the on-set trio's grey and chrome, both brackets, the encode-gap pair, and
 * the four surfaces the game is actually made of. Small enough that every ball stays big enough to
 * read in a 1600px frame, which is the whole point of a calibration rig.
 */
export const DEFAULT_PROBE_SET: MaterialName[] = [
  "charcoal",
  "grey-ball-18",
  "grey-50-srgb",
  "snow",
  "chrome-ball",
  "gelcoat",
  "driftwood",
  "wet-granite",
];

/**
 * Filament's stated authoring ranges: dielectric base colour in **[0.04 .. 0.94]** linear, metals in
 * **[0.66 .. 1.0]**. Outside them a surface is not a style choice, it is a material that does not
 * exist, and it will look like one.
 *
 * But these are guidelines for authoring an albedo TEXTURE, not statements about measured reflectance,
 * and two of the values in this file break them for good reason:
 *
 *  - **Chromium's red F0 is 0.654**, just under the metal floor of 0.66.
 *  - **Gold's blue F0 is 0.307**, and Filament's own published gold (`#ffd891`) has a blue of 0.31.
 *    A strongly tinted metal MUST have a low channel — that is what "tinted" means.
 *  - **Charcoal is 0.02**, below the dielectric floor of 0.04, because the floor is a rule of thumb
 *    ("nothing is blacker than coal") and coal is the thing it is a rule about.
 *  - **Seawater's red is 0.015**, because water is transmissive: almost nothing comes back, which is
 *    the entire reason the sea is blue.
 *
 * So the guard checks what is actually true — a metal's *luminance* must be high even when a channel
 * is not, no channel may exceed 1, and a dielectric must stay under snow — and it demands that every
 * entry which knowingly sits outside the artist-facing range says why in `source`. Silently clamping
 * measured spectral data to a heuristic would be exactly the fudge this project keeps deleting.
 */
export const DIELECTRIC_BASE_COLOR_RANGE = [0.04, 0.94] as const;
export const METAL_BASE_COLOR_RANGE = [0.66, 1.0] as const;

/** Minimum luminance of a conductor's F0. Copper, the dimmest real metal here, sits at 0.585. */
const METAL_MIN_LUMINANCE = 0.5;
/** No dielectric out-reflects fresh snow. */
const DIELECTRIC_MAX = 0.94;

const luminanceOf = ([r, g, b]: LinearRgb) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** Throws on a physically impossible entry. Called by the unit test, not at runtime. */
export const assertPlausible = (m: MaterialSpec): void => {
  if (m.roughness < 0 || m.roughness > 1) throw new Error(`${m.name}: roughness out of [0,1]`);
  for (const channel of m.baseColor) {
    if (channel < 0 || channel > 1) throw new Error(`${m.name}: base colour channel ${channel} ∉ [0,1]`);
  }
  if (m.metalness === 1) {
    // A conductor reflects most of what hits it. Individual channels may go low (that is tint), but
    // the luminance cannot: a "metal" that swallows light is a dielectric wearing a costume.
    const lum = luminanceOf(m.baseColor);
    if (lum < METAL_MIN_LUMINANCE) {
      throw new Error(`${m.name}: metal F0 luminance ${lum.toFixed(3)} < ${METAL_MIN_LUMINANCE}`);
    }
  } else if (Math.max(...m.baseColor) > DIELECTRIC_MAX) {
    throw new Error(`${m.name}: dielectric out-reflects snow (> ${DIELECTRIC_MAX})`);
  }
};

/** Entries that knowingly sit outside Filament's authoring range. Each must justify itself. */
export const outsideAuthoringRange = (m: MaterialSpec): boolean => {
  const [lo, hi] = m.metalness === 1 ? METAL_BASE_COLOR_RANGE : DIELECTRIC_BASE_COLOR_RANGE;
  return m.baseColor.some((c) => c < lo || c > hi);
};

/**
 * Build the three.js material. `MeshPhysicalMaterial` throughout — it is a superset of
 * `MeshStandardMaterial`, and the clearcoat / sheen / ior a real gelcoat or sailcloth needs are only
 * on the physical one. Uniformity matters here: a rig where one ball is Standard and another is
 * Physical is comparing two BRDFs, not two materials.
 */
export const createMaterial = (m: MaterialSpec): THREE.MeshPhysicalMaterial => {
  const material = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color().setRGB(...m.baseColor, THREE.LinearSRGBColorSpace),
    metalness: m.metalness,
    roughness: m.roughness,
  });
  if (m.ior !== undefined) material.ior = m.ior;
  if (m.clearcoat !== undefined) material.clearcoat = m.clearcoat;
  if (m.clearcoatRoughness !== undefined) material.clearcoatRoughness = m.clearcoatRoughness;
  if (m.sheen !== undefined) material.sheen = m.sheen;
  if (m.specularIntensity !== undefined) material.specularIntensity = m.specularIntensity;
  material.name = m.name;
  return material;
};
