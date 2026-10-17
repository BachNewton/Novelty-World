import { Color, DataTexture, LinearFilter, RepeatWrapping, ClampToEdgeWrapping, RGBAFormat, UnsignedByteType, Vector3, Vector4 } from "three";
import { themeColor } from "@/shared/lib/three/theme-color";
import type { Region } from "../../engine/regions";
import { broadleafMix, broadleafShare, groundSeason, plantSeason, SEASON_GROUPS, TIMING_SPREAD, type SeasonGroup } from "../../engine/seasons";
import type { FeatureArt } from "../feature-art";
import { SEASON_PARTS, type SeasonPart } from "../painted";

/*
 * The art of the seasons' features (see `features/seasons.ts`), drawn from
 * the engine's year (`engine/seasons.ts`) on the date's real day of the year.
 *
 * The plants: every plant shape built for the seasons carries what each of
 * its pieces is (a crown of leaves, a far tree's one mass, a branch, bark, a
 * flower's head, a small plant's leaves, stone) and its season group. The
 * year of every group is baked into a small table (a texture a year wide, a
 * row a group: leaf, fresh, turn and bloom), which the vertex shader reads at
 * the date moved by the plant's own timing, from a hash of where it stands:
 * crowns grow in and fall a mass at a time, small plants grow up and die back,
 * flower heads open and go, and each vertex's colour goes from the young
 * green through the summer's to its autumn colour (one of two per kind, by
 * the tree) and bare, with snow on whatever faces up where snow lies. All of
 * it is per vertex, so the fragments pay nothing.
 *
 * The ground: on top of the land's own per-pixel ground (`terrain.ts`, whose
 * locals this reads: the ground before the canopy, the canopy and its share,
 * the woods, the slope, the bands, the noise), the dormant straw, the new
 * green and the autumn gold on the grass, fallen leaves under the
 * broadleaves in their region's autumn colour, and snow lying down to the
 * season's snow line with soft melting patches, thin on steep ground and under
 * the conifers; the far woods' canopy turns, goes bare and takes the snow.
 *
 * Other groups read the same year from the engine, not from here: the
 * ground's season (`groundSeason`: the snow line, and how far the water
 * freezes in from its edges) and the seasons' weights (`seasonWeights`, for
 * a grade), each on the date's real day of the year, which every feature's
 * frame has.
 */

const ROWS = SEASON_GROUPS.length;
const YEAR = 365;

const part = (name: SeasonPart) => SEASON_PARTS.indexOf(name).toFixed(1);
const group = (name: SeasonGroup) => String(SEASON_GROUPS.indexOf(name));

/** The year of every group as a texture: a texel a day across, a row a group. */
function phenologyTable(): DataTexture {
  const data = new Uint8Array(YEAR * ROWS * 4);
  SEASON_GROUPS.forEach((g, row) => {
    for (let day = 0; day < YEAR; day++) {
      const s = plantSeason(g, day + 0.5);
      data.set([s.leaf, s.fresh, s.turn, s.bloom].map((v) => Math.round(v * 255)), (row * YEAR + day) * 4);
    }
  });
  const texture = new DataTexture(data, YEAR, ROWS, RGBAFormat, UnsignedByteType);
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

/** Groups whose shapes carry their autumn colour (the maple wood's maples, the gold aspens, the bracken), so the summer green is the season's own. */
const AUTUMN_IN_SHAPE: readonly SeasonGroup[] = ["aspen", "maple", "bracken"];

const token = (name: string) => themeColor(`--color-hearthwood-valley-season-${name}`);

interface SeasonColours {
  fresh: Color[];
  summer: Color[];
  autumn: Color[];
  autumnAlt: Color[];
  bare: Color[];
}

let colours: SeasonColours | null = null;

/** The seasons' colours, read from their tokens the first time they are needed. */
function seasonColours(): SeasonColours {
  if (colours) return colours;
  const read = (role: string, wanted: (g: SeasonGroup) => boolean, fallback?: (g: SeasonGroup) => Color) =>
    SEASON_GROUPS.map((g) => (g === "rock" ? new Color() : wanted(g) ? token(`${g}-${role}`) : (fallback?.(g) ?? new Color())));
  const inShape = (g: SeasonGroup) => AUTUMN_IN_SHAPE.includes(g);
  const autumnAlt = read("autumn-alt", () => true);
  colours = {
    fresh: read("fresh", () => true),
    summer: read("summer", inShape),
    autumn: read("autumn", (g) => !inShape(g), (g) => autumnAlt[SEASON_GROUPS.indexOf(g)]),
    autumnAlt,
    bare: read("bare", () => true),
  };
  return colours;
}

const falls = new Map<Region, { colour: Color; share: number }>();

/** The colour a region's woods turn, seen from afar, and how much of them turns at all. */
export function regionFall(region: Region): { colour: Color; share: number } {
  const known = falls.get(region);
  if (known) return known;
  const c = seasonColours();
  const colour = new Color(0, 0, 0);
  for (const [g, weight] of Object.entries(broadleafMix(region)) as [SeasonGroup, number][]) {
    const i = SEASON_GROUPS.indexOf(g);
    const turned = g === "maple" ? themeColor("--color-hearthwood-valley-maple-orange") : g === "aspen" ? themeColor("--color-hearthwood-valley-aspen-gold") : c.autumn[i].clone().lerp(c.autumnAlt[i], 0.5);
    colour.add(turned.multiplyScalar(weight));
  }
  const fall = { colour, share: broadleafShare(region) };
  falls.set(region, fall);
  return fall;
}

/** How far a plant's own spot moves the snow line for it, and the soft width of the line, in metres. */
const SNOW_EDGE = { width: 30, wander: 90 };

const FOLIAGE_VERTEX_HEAD = /* glsl */ `
attribute vec4 hwSeason;
attribute vec3 hwSeasonPiece;
uniform sampler2D uHwSeasonTable;
uniform float uHwSeasonDay;
/** Per group: its own timing's spread in days, and whether its shape carries its autumn colour. */
uniform vec4 uHwSeasonGroups[${ROWS}];
uniform vec3 uHwSeasonFresh[${ROWS}];
uniform vec3 uHwSeasonSummer[${ROWS}];
uniform vec3 uHwSeasonAutumn[${ROWS}];
uniform vec3 uHwSeasonAutumnAlt[${ROWS}];
uniform vec3 uHwSeasonBare[${ROWS}];
/** The snow line, its soft width and how far a plant's own spot moves it, in metres. */
uniform vec3 uHwSeasonSnow;
uniform vec3 uHwSeasonSnowColour;
float hwSeasonHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
`;

// The piece's data is there only where its 4th value is 0: a shape without the attributes reads (0, 0, 0, 1).
// Its shape changes everywhere, the shadow's depth too; its colour only where there is one.
const FOLIAGE_VERTEX = /* glsl */ `
if (hwSeason.w < 0.5) {
  float hwPart = floor(hwSeason.x / 16.0 + 0.01);
  int hwG = int(hwSeason.x - hwPart * 16.0 + 0.5);
  vec3 hwRoot = vec3(0.0);
  #ifdef USE_INSTANCING
    hwRoot = instanceMatrix[3].xyz;
  #endif
  hwRoot = (modelMatrix * vec4(hwRoot, 1.0)).xyz;
  float hwOwn = hwSeasonHash(hwRoot.xz);
  float hwDay = uHwSeasonDay - (hwOwn * 2.0 - 1.0) * uHwSeasonGroups[hwG].x;
  vec4 hwState = texture2D(uHwSeasonTable, vec2(hwDay / ${YEAR.toFixed(1)}, (float(hwG) + 0.5) / ${ROWS.toFixed(1)}));
  float hwLeaf = hwState.r;

  // Crowns grow in and fall a mass at a time, far crowns thin to a haze of twigs, small plants grow and die back whole, flowers' heads open and go.
  float hwScale = 1.0;
  // Which of a crown's masses go first is the tree's own; the last ones left are smaller.
  float hwPick = fract(hwSeason.z + hwOwn * 7.31);
  if (hwPart == ${part("crown")}) hwScale = smoothstep(hwPick * 0.85, hwPick * 0.85 + 0.15, hwLeaf) * (0.6 + 0.4 * smoothstep(0.2, 0.9, hwLeaf));
  else if (hwPart == ${part("far-crown")}) hwScale = 0.55 + 0.45 * hwLeaf;
  else if (hwPart == ${part("herb")}) hwScale = hwLeaf;
  else if (hwPart == ${part("blossom")} && hwG == ${group("flowers")}) hwScale = hwState.a * step(0.02, hwLeaf);
  transformed = hwSeasonPiece + (transformed - hwSeasonPiece) * hwScale;

  #if defined(USE_COLOR) && !defined(HW_DEPTH)
    float hwHue = hwSeasonHash(hwRoot.zx + 17.0);
    vec3 hwTint = vec3(1.0);
    #ifdef USE_INSTANCING_COLOR
      hwTint = instanceColor.rgb;
    #endif
    vec3 hwLit = hwTint * hwSeason.y;
    vec3 hwBase = vColor.rgb / max(hwLit, vec3(0.001));
    vec3 hwC = hwBase;
    if (hwPart == ${part("crown")} || hwPart == ${part("far-crown")} || hwPart == ${part("herb")}) {
      bool hwInShape = uHwSeasonGroups[hwG].y > 0.5;
      vec3 hwSummer = hwInShape ? uHwSeasonSummer[hwG] : hwBase;
      vec3 hwAutumn = hwInShape ? mix(hwBase, uHwSeasonAutumnAlt[hwG], hwHue * 0.45) : mix(uHwSeasonAutumn[hwG], uHwSeasonAutumnAlt[hwG], hwHue);
      hwC = mix(hwSummer, uHwSeasonFresh[hwG], hwState.g);
      hwC = mix(hwC, hwAutumn, hwState.b);
      // The last leaves on a turned tree wither, and so do an oak's that stay the winter.
      if (hwPart == ${part("crown")}) hwC = mix(hwC, uHwSeasonBare[hwG] * 1.25, hwState.b * smoothstep(0.75, 0.15, hwLeaf) * 0.7);
      if (hwPart == ${part("far-crown")}) hwC = mix(uHwSeasonBare[hwG], hwC, smoothstep(0.0, 0.7, hwLeaf));
      if (hwPart == ${part("herb")}) hwC = mix(hwC, uHwSeasonBare[hwG], clamp((1.0 - hwLeaf) * 3.5, 0.0, 1.0));
    } else if (hwPart == ${part("blossom")} && hwG == ${group("heather")}) {
      hwC = mix(uHwSeasonBare[hwG], hwBase, hwState.a);
    }
    hwC *= hwLit;

    // Snow where it lies, on whatever faces up: a dusting on the needles' upper tiers, a line along the twigs, caps on stones and low plants.
    float hwUp = inverseTransformDirection(transformedNormal, viewMatrix).y + (hwSeason.z - 0.5) * 0.25;
    float hwSnowHere = smoothstep(uHwSeasonSnow.x - uHwSeasonSnow.y, uHwSeasonSnow.x + uHwSeasonSnow.y, hwRoot.y + (hwOwn - 0.5) * uHwSeasonSnow.z);
    bool hwNeedles = hwG == ${group("conifer")} || hwG == ${group("pine")};
    float hwHolds = hwPart == ${part("none")} ? 0.0 : hwPart == ${part("branch")} || hwPart == ${part("bark")} ? 0.65 : hwNeedles ? 0.7 : 0.9;
    float hwCover = hwSnowHere * hwHolds * (hwNeedles ? smoothstep(0.5, 0.85, hwUp) : smoothstep(0.2, 0.7, hwUp));
    vColor.rgb = mix(hwC, uHwSeasonSnowColour * (0.82 + 0.18 * hwSeason.y), hwCover);
  #endif
}
`;

const FOLIAGE_UNIFORMS = {
  uHwSeasonTable: { value: null as DataTexture | null },
  uHwSeasonDay: { value: 0 },
  uHwSeasonGroups: { value: SEASON_GROUPS.map((g) => new Vector4(TIMING_SPREAD[g], AUTUMN_IN_SHAPE.includes(g) ? 1 : 0, 0, 0)) },
  uHwSeasonFresh: { value: SEASON_GROUPS.map(() => new Color()) },
  uHwSeasonSummer: { value: SEASON_GROUPS.map(() => new Color()) },
  uHwSeasonAutumn: { value: SEASON_GROUPS.map(() => new Color()) },
  uHwSeasonAutumnAlt: { value: SEASON_GROUPS.map(() => new Color()) },
  uHwSeasonBare: { value: SEASON_GROUPS.map(() => new Color()) },
  uHwSeasonSnow: { value: new Vector3(0, SNOW_EDGE.width, SNOW_EDGE.wander) },
  uHwSeasonSnowColour: { value: new Color() },
};

const LAND_VERTEX_HEAD = /* glsl */ `
attribute vec4 hwSeasonFall;
varying vec4 vHwSeasonFall;
`;

const LAND_FRAGMENT_HEAD = /* glsl */ `
varying vec4 vHwSeasonFall;
/** Dormant straw, new green, autumn gold, fallen leaves: each 0 to 1. */
uniform vec4 uHwSeasonGround;
/** The snow line, its soft width and how far the land's noise moves it, in metres. */
uniform vec3 uHwSeasonGroundSnow;
/** The far broadleaves' turn, how bare they are, and how fresh. */
uniform vec3 uHwSeasonCanopy;
uniform vec3 uHwSeasonDormant;
uniform vec3 uHwSeasonFreshGrass;
uniform vec3 uHwSeasonGold;
uniform vec3 uHwSeasonRusset;
uniform vec3 uHwSeasonBareWood;
uniform vec3 uHwSeasonFreshWood;
vec3 hwSeasonRetint(vec3 colour, vec3 target) {
  const vec3 hwLum = vec3(0.3, 0.59, 0.11);
  return target * (dot(colour, hwLum) / max(dot(target, hwLum), 0.001));
}
`;

// Reads the land's own locals (see `terrain.ts`): the ground before its canopy, the canopy, the woods, the bands, the slope and the noise.
const LAND_SURFACE = /* glsl */ `
  float hwFallShare = vHwSeasonFall.a;
  float hwPath = 1.0 - smoothstep(3.0, 6.0, length(hwP - uFire) + (hwWave - 0.5) * 2.0);
  float hwOpen = (1.0 - hwRock) * (1.0 - hwSnow) * smoothstep(0.3, 1.1, hwAbove) * (1.0 - hwPath);
  float hwGrass = hwOpen * (1.0 - smoothstep(0.3, 0.6, hwWood));
  vec3 hwG = hwGround;
  hwG = mix(hwG, hwSeasonRetint(hwG, uHwSeasonFreshGrass) * 1.06, uHwSeasonGround.y * hwOpen * 0.42);
  // Autumn's grass in swathes of gold and russet, with green left in the hollows.
  float hwSwathe = hwValueNoise(hwP / 23.0) * 0.65 + hwValueNoise(hwP / 7.0) * 0.35;
  vec3 hwTurned = mix(uHwSeasonGold, uHwSeasonRusset, smoothstep(0.45, 0.8, hwSwathe));
  hwG = mix(hwG, hwSeasonRetint(hwG, hwTurned) * (0.92 + 0.2 * hwFine), uHwSeasonGround.z * hwGrass * mix(0.35, 0.75, smoothstep(0.2, 0.55, hwSwathe)));
  hwG = mix(hwG, hwSeasonRetint(hwG, uHwSeasonDormant) * (0.95 + 0.15 * hwFine), uHwSeasonGround.x * hwOpen * 0.85);
  // Fallen leaves, in drifts, under the broadleaves.
  float hwUnder = smoothstep(0.2, 0.55, hwWood + (hwFine - 0.5) * 0.25) * hwFallShare * hwOpen;
  float hwDrift = smoothstep(0.3, 0.7, hwValueNoise(hwP * 0.8) * 0.6 + hwValueNoise(hwP * 2.9) * 0.4);
  hwG = mix(hwG, vHwSeasonFall.rgb * (0.55 + 0.35 * hwDrift), uHwSeasonGround.w * hwUnder * (0.55 + 0.4 * hwDrift));
  // Snow down to the season's line, melting in soft patches, thin on steep ground and under the needles.
  float hwLie = hwH + (hwWave - 0.5) * uHwSeasonGroundSnow.z + (hwFine - 0.5) * uHwSeasonGroundSnow.z * 0.25;
  float hwCover = smoothstep(uHwSeasonGroundSnow.x - uHwSeasonGroundSnow.y, uHwSeasonGroundSnow.x + uHwSeasonGroundSnow.y, hwLie);
  // The higher it lies, the steeper the ground it clings to, so only cliffs show bare up the mountains.
  float hwHold = 0.5 * smoothstep(120.0, 480.0, hwH);
  hwCover *= 1.0 - smoothstep(0.85 + hwHold, 1.25 + hwHold, hwSlope + (hwFine - 0.5) * 0.3);
  hwCover *= 1.0 - 0.6 * smoothstep(0.35, 0.85, hwWood) * (1.0 - hwFallShare) * (0.6 + 0.4 * hwFine);
  hwCover *= smoothstep(0.0, 0.5, hwAbove);
  vec3 hwSnowy = uSnow * (1.0 - 0.14 * smoothstep(0.1, 0.9, hwWood)) * (0.96 + 0.06 * hwFine);
  hwG = mix(hwG, hwSnowy, hwCover);
  // The far woods: turning, bare, fresh, and under snow.
  vec3 hwCrownTone = vec3(0.62 + 0.45 * hwCrowns);
  vec3 hwCan = vCanopy * hwCrownTone;
  hwCan = mix(hwCan, uHwSeasonFreshWood * hwCrownTone, uHwSeasonCanopy.z * hwFallShare * 0.6);
  hwCan = mix(hwCan, vHwSeasonFall.rgb * hwCrownTone, uHwSeasonCanopy.x * hwFallShare);
  hwCan = mix(hwCan, uHwSeasonBareWood * hwCrownTone, uHwSeasonCanopy.y * hwFallShare);
  hwCan = mix(hwCan, hwSnowy * (0.8 + 0.2 * hwCrowns), hwCover * (0.3 + 0.45 * hwFallShare));
  diffuseColor.rgb = mix(hwG, hwCan, hwCanopy) * (0.82 + 0.36 * hwGrain);
`;

const LAND_UNIFORMS = {
  uHwSeasonGround: { value: new Vector4() },
  uHwSeasonGroundSnow: { value: new Vector3(0, SNOW_EDGE.width, SNOW_EDGE.wander) },
  uHwSeasonCanopy: { value: new Vector3() },
  uHwSeasonDormant: { value: new Color() },
  uHwSeasonFreshGrass: { value: new Color() },
  uHwSeasonGold: { value: new Color() },
  uHwSeasonRusset: { value: new Color() },
  uHwSeasonBareWood: { value: new Color() },
  uHwSeasonFreshWood: { value: new Color() },
};

let groundColoured = false;

const BROADLEAF_GROUPS: readonly SeasonGroup[] = ["birch", "aspen", "oak", "maple"];

export const SEASONS_ART: readonly FeatureArt[] = [
  {
    feature: "seasonalFoliage",
    chunks: [{ kinds: ["foliage", "solid"], vertexHead: FOLIAGE_VERTEX_HEAD, vertex: FOLIAGE_VERTEX }],
    uniforms: FOLIAGE_UNIFORMS,
    frame: ({ day }) => {
      const u = FOLIAGE_UNIFORMS;
      if (u.uHwSeasonTable.value === null) {
        const c = seasonColours();
        u.uHwSeasonTable.value = phenologyTable();
        SEASON_GROUPS.forEach((_, i) => {
          u.uHwSeasonFresh.value[i].copy(c.fresh[i]);
          u.uHwSeasonSummer.value[i].copy(c.summer[i]);
          u.uHwSeasonAutumn.value[i].copy(c.autumn[i]);
          u.uHwSeasonAutumnAlt.value[i].copy(c.autumnAlt[i]);
          u.uHwSeasonBare.value[i].copy(c.bare[i]);
        });
        u.uHwSeasonSnowColour.value.copy(themeColor("--color-hearthwood-valley-ground-snow"));
      }
      const today = day.date.realDayOfYear;
      u.uHwSeasonDay.value = today;
      u.uHwSeasonSnow.value.x = groundSeason(today).snowLine;
    },
  },
  {
    feature: "seasonalGround",
    chunks: [{ kinds: ["land"], vertexHead: LAND_VERTEX_HEAD, vertex: "vHwSeasonFall = hwSeasonFall;", fragmentHead: LAND_FRAGMENT_HEAD, surface: LAND_SURFACE }],
    uniforms: LAND_UNIFORMS,
    frame: ({ day }) => {
      const u = LAND_UNIFORMS;
      if (!groundColoured) {
        u.uHwSeasonDormant.value.copy(token("ground-dormant"));
        u.uHwSeasonFreshGrass.value.copy(token("ground-fresh"));
        u.uHwSeasonGold.value.copy(token("ground-gold"));
        u.uHwSeasonRusset.value.copy(token("ground-russet"));
        u.uHwSeasonBareWood.value.copy(token("wood-bare"));
        u.uHwSeasonFreshWood.value.copy(seasonColours().fresh[SEASON_GROUPS.indexOf("birch")]);
        groundColoured = true;
      }
      const today = day.date.realDayOfYear;
      const ground = groundSeason(today);
      u.uHwSeasonGround.value.set(ground.dormant, ground.fresh, ground.gold, ground.litter);
      u.uHwSeasonGroundSnow.value.x = ground.snowLine;
      const woods = BROADLEAF_GROUPS.map((g) => plantSeason(g, today));
      const mean = (pick: (s: (typeof woods)[number]) => number) => woods.reduce((sum, s) => sum + pick(s), 0) / woods.length;
      const leaf = mean((s) => s.leaf);
      u.uHwSeasonCanopy.value.set(mean((s) => s.turn) * leaf, 1 - leaf, mean((s) => s.fresh) * leaf);
    },
  },
];
