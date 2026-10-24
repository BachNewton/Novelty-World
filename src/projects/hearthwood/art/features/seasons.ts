import { ClampToEdgeWrapping, Color, DataTexture, LinearFilter, RepeatWrapping, RGBAFormat, UnsignedByteType } from "three";
import { themeColor } from "@/shared/lib/three/theme-color";
import type { Region } from "../../engine/regions";
import { broadleafMix, broadleafShare, groundSeason, plantSeason, SEASON_GROUPS, TIMING_SPREAD, type SeasonGroup } from "../../engine/seasons";
import type { FeatureArt } from "../feature-art";
import { SEASON_PARTS } from "../painted";

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
 * the tree) and bare, with snow on whatever faces up where snow lies, its
 * line shifted with the bands where the plant grows (each copy carries its
 * own shift). All of it is per vertex, so the fragments pay nothing.
 *
 * The ground: on top of the land's own per-pixel ground (`terrain.ts`, whose
 * locals this reads: the ground before the canopy, the canopy and its share,
 * the woods, the slope, the bands, the noise), the dormant straw, the new
 * green and the autumn gold on the grass, fallen leaves under the
 * broadleaves in their region's autumn colour, and snow lying down to the
 * season's snow line, shifted with the bands where it lies, with soft
 * melting patches, thin on steep ground and under the conifers; the far
 * woods' canopy turns, goes bare and takes the snow.
 *
 * Other groups read the same year from the engine, not from here: the
 * ground's season (`groundSeason`: the snow line, and how far the water
 * freezes in from its edges) and the seasons' weights (`seasonWeights`, for
 * a grade), each on the date's real day of the year, which every feature's
 * frame has.
 */

const ROWS = SEASON_GROUPS.length;
const YEAR = 365;

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

// The stages are rewritten for WebGPU in the next step; the table and the colours above stay.
void phenologyTable;
void SEASON_PARTS;
void groundSeason;
void plantSeason;
void TIMING_SPREAD;
export const SEASONS_ART: readonly FeatureArt[] = [{ feature: "seasonalFoliage" }, { feature: "seasonalGround" }];
