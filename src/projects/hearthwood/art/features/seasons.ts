import { ClampToEdgeWrapping, Color, DataTexture, LinearFilter, RepeatWrapping, RGBAFormat, UnsignedByteType, Vector3, Vector4 } from "three";
import { attribute, float, floor, Fn, fract, int, max, mix, modelWorldMatrix, normalWorldGeometry, select, smoothstep, texture, uniform, uniformArray, varying, varyingProperty, vec2, vec3, vec4, vertexColor } from "three/tsl";
import type { Node, NodeBuilder } from "three/webgpu";
import { themeColor } from "@/shared/lib/three/theme-color";
import { REGIONS, type Region } from "../../engine/regions";
import { broadleafMix, broadleafShare, groundSeason, plantSeason, SEASON_GROUPS, TIMING_SPREAD, type SeasonGroup } from "../../engine/seasons";
import type { FeatureArt } from "../feature-art";
import { SEASON_PARTS, type SeasonPart } from "../painted";
import { instancePlacing } from "../instance-placing";
import { GROUND, LAND, REGION_GROUND } from "../terrain-ground";
import { colourUniform, typed } from "../tsl";

/*
 * The art of the seasons' features (see `features/seasons.ts`), drawn from
 * the engine's year (`engine/seasons.ts`) on the date's real day of the year.
 *
 * The plants (`seasonalFoliage`): every plant shape built for the seasons
 * carries what each of its pieces is (a crown of leaves, a far tree's one
 * mass, a branch, bark, a flower's head, a small plant's leaves, stone) and
 * its season group (`painted.ts`), and each copy how far the bands sit from
 * their altitudes where it stands (`hwSeasonBands`, from the plants' scene).
 * The year of every group is baked into a small table (a texture a year
 * wide, a row a group: leaf, fresh, turn and bloom), read in the vertex
 * stage at the date moved by the plant's own timing, from a hash of where it
 * stands: crowns grow in and fall a mass at a time, small plants grow up and
 * die back, flower heads open and go, and the colour goes from the young
 * green through the summer's to its autumn colour (one of two per kind, by
 * the tree) and bare, with snow on whatever faces up where snow lies. All
 * but which way a pixel faces is worked out per vertex.
 *
 * The ground (`seasonalGround`): the land's own ground repainted from its
 * locals (`terrain-ground.ts`'s `LAND`) in the land's one graph: the dormant
 * straw, the new green and the autumn gold on the grass, fallen leaves under
 * the broadleaves in their region's autumn colour, and snow lying down to
 * the season's snow line, shifted with the bands where it lies, with soft
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

/** How far a plant's own spot moves the snow line for it, and the soft width of the line, in metres. */
const SNOW_EDGE = { width: 30, wander: 90 };

const isPart = (part: Node<"float">, name: SeasonPart) => part.sub(SEASON_PARTS.indexOf(name)).abs().lessThan(0.5);
const isGroup = (group: Node<"float">, name: SeasonGroup) => group.sub(SEASON_GROUPS.indexOf(name)).abs().lessThan(0.5);

/** The same hash of where a plant stands as `standHash` (`engine/seasons.ts`), 0 to 1. */
function standHash(p: Node<"vec2">): Node<"float"> {
  const p3 = fract(vec3(p.x, p.y, p.x).mul(0.1031)).toVar();
  p3.addAssign(p3.dot(p3.yzx.add(33.33)));
  return fract(p3.x.add(p3.y).mul(p3.z));
}

/** A colour per season group, as a uniform array of vec3. */
function groupColours() {
  return uniformArray<"vec3">(SEASON_GROUPS.map(() => new Vector3()), "vec3");
}

/** One element of a uniform array, as the type it is in the shader. */
const at = <T extends string>(array: ReturnType<typeof uniformArray<T>>, i: Node<"int">) => typed<T>(array.element(i));

const plants = {
  table: texture(phenologyTable()),
  day: uniform(0),
  /** Per group: its own timing's spread in days, and whether its shape carries its autumn colour. */
  groups: uniformArray<"vec4">(SEASON_GROUPS.map((g) => new Vector4(TIMING_SPREAD[g], AUTUMN_IN_SHAPE.includes(g) ? 1 : 0, 0, 0)), "vec4"),
  fresh: groupColours(),
  summer: groupColours(),
  autumn: groupColours(),
  autumnAlt: groupColours(),
  bare: groupColours(),
  /** The snow line, its soft width and how far a plant's own spot moves it, in metres. */
  snow: uniform(new Vector3(0, SNOW_EDGE.width, SNOW_EDGE.wander)),
  snowColour: colourUniform(),
};

/**
 * A plant's piece through the year, worked out in the vertex stage from its
 * shape's attributes (`painted.ts`: `hwSeason`, the part and group, the
 * shading and its own share; `hwSeasonPiece`, where it grows from) and its
 * copy's (`hwSeasonBands`, how far the bands sit from their altitudes where
 * it stands, from the plants' scene). Null for a shape built without them,
 * which the seasons leave as it is.
 */
function pieceSeason(builder: NodeBuilder) {
  if (!builder.geometry.hasAttribute("hwSeason")) return null;
  const tag = attribute<"vec4">("hwSeason", "vec4");
  const placing = instancePlacing(builder);
  const role = tag.x;
  const part = floor(role.div(16).add(0.01));
  const group = role.sub(part.mul(16));
  const g = int(group.add(0.5));
  const root = modelWorldMatrix.mul(placing ? placing.mul(vec4(0, 0, 0, 1)) : vec4(0, 0, 0, 1)).xyz;
  const own = standHash(root.xz);
  const day = plants.day.sub(own.mul(2).sub(1).mul(at(plants.groups, g).x));
  const state = plants.table.sample(vec2(day.div(YEAR), group.add(0.5).div(ROWS))).level(float(0));
  const bands = builder.geometry.hasAttribute("hwSeasonBands") ? attribute<"float">("hwSeasonBands", "float") : float(0);
  return { tag, placing, part, group, g, root, own, state, bands };
}

type Piece = NonNullable<ReturnType<typeof pieceSeason>>;

/** How big the piece is now: crowns grow in and fall a mass at a time (which go first is the tree's own, the last ones smaller), far crowns thin to a haze of twigs, small plants grow and die back, flowers' heads open and go. */
function growth({ tag, part, group, own, state }: Piece): Node<"float"> {
  const leaf = state.x;
  const pick = fract(tag.z.add(own.mul(7.31)));
  const crown = smoothstep(pick.mul(0.85), pick.mul(0.85).add(0.15), leaf).mul(smoothstep(0.2, 0.9, leaf).mul(0.4).add(0.6));
  return select(
    isPart(part, "crown"),
    crown,
    select(isPart(part, "far-crown"), leaf.mul(0.45).add(0.55), select(isPart(part, "herb"), leaf, select(isPart(part, "blossom").and(isGroup(group, "flowers")), state.w.mul(select(leaf.greaterThan(0.02), float(1), float(0))), float(1)))),
  );
}

function grown(position: Node<"vec3">) {
  return Fn((builder: NodeBuilder) => {
    const piece = pieceSeason(builder);
    if (!piece) return position;
    // The piece's centre placed as the vertex already is: three places an instance before the material's own position.
    const from = attribute<"vec3">("hwSeasonPiece", "vec3");
    const centre = piece.placing ? piece.placing.mul(vec4(from, 1)).xyz : from;
    return centre.add(position.sub(centre).mul(growth(piece)));
  })();
}

/** The piece's own colour through the year, before its copy's tint and its shading. */
function turned(piece: Piece): Node<"vec3"> {
  const { tag, part, group, g, root, state } = piece;
  const base = vertexColor().rgb.div(max(tag.y, 0.001));
  const leaf = state.x;
  const hue = standHash(root.zx.add(17));
  const inShape = at(plants.groups, g).y.greaterThan(0.5);
  const summer = select(inShape, at(plants.summer, g), base);
  const autumn = select(inShape, mix(base, at(plants.autumnAlt, g), hue.mul(0.45)), mix(at(plants.autumn, g), at(plants.autumnAlt, g), hue));
  const bare = at(plants.bare, g);
  const leafy = mix(mix(summer, at(plants.fresh, g), state.y), autumn, state.z);
  // The last leaves on a turned tree wither, and so do an oak's that stay the winter.
  const crown = mix(leafy, bare.mul(1.25), state.z.mul(smoothstep(0.75, 0.15, leaf)).mul(0.7));
  const far = mix(bare, leafy, smoothstep(0, 0.7, leaf));
  const herb = mix(leafy, bare, float(1).sub(leaf).mul(3.5).clamp());
  const heather = mix(bare, base, state.w);
  const colour = select(
    isPart(part, "crown"),
    crown,
    select(isPart(part, "far-crown"), far, select(isPart(part, "herb"), herb, select(isPart(part, "blossom").and(isGroup(group, "heather")), heather, base))),
  );
  return colour.mul(tag.y);
}

/** The copy's own tint, as three's instancing hands it to the fragments, where the mesh has one. */
function copyTint(builder: NodeBuilder): Node<"vec3"> {
  const object = builder.object as { instanceColor?: unknown };
  return object.instanceColor ? varyingProperty("vec3", "vInstanceColor") : vec3(1);
}

/**
 * Snow on the piece, where snow lies against the bands where the plant grows,
 * on whatever faces up (a dusting on the needles' upper tiers, a line along
 * the twigs, caps on stones and low plants): how much the piece holds where
 * it stands, worked out per vertex (x), whether it is needles (y), the
 * shading (z) and its own share (w).
 */
function snowHere(piece: Piece): Node<"vec4"> {
  const { tag, part, group, root, own, bands } = piece;
  const here = smoothstep(plants.snow.x.sub(plants.snow.y), plants.snow.x.add(plants.snow.y), root.y.sub(bands).add(own.sub(0.5).mul(plants.snow.z)));
  const needles = isGroup(group, "conifer").or(isGroup(group, "pine"));
  const holds = select(isPart(part, "none"), float(0), select(isPart(part, "branch").or(isPart(part, "bark")), float(0.65), select(needles, float(0.7), float(0.9))));
  return vec4(here.mul(holds), select(needles, float(1), float(0)), tag.y, tag.z);
}

function seasonedPlant(colour: Node<"vec3">) {
  return Fn((builder: NodeBuilder) => {
    const piece = pieceSeason(builder);
    if (!piece) return colour;
    // The year's colour takes the place of the shape's own; what the stages before made of it is kept as a ratio of the colour three made.
    const made = vertexColor().rgb.mul(copyTint(builder));
    const kept = colour.div(max(made, vec3(0.002)));
    const year = varying(turned(piece), "vHwSeasonColour").mul(copyTint(builder)).mul(kept);
    const snow = varying(snowHere(piece), "vHwSeasonSnow");
    const up = normalWorldGeometry.y.add(snow.w.sub(0.5).mul(0.25));
    const faces = mix(smoothstep(0.2, 0.7, up), smoothstep(0.5, 0.85, up), snow.y);
    return mix(year, plants.snowColour.mul(snow.z.mul(0.18).add(0.82)), snow.x.mul(faces));
  })();
}

const ground = {
  /** Dormant straw, new green, autumn gold, fallen leaves: each 0 to 1. */
  season: uniform(new Vector4()),
  /** The snow line, its soft width and how far the land's noise moves it, in metres. */
  snow: uniform(new Vector3(0, SNOW_EDGE.width, SNOW_EDGE.wander)),
  /** The far broadleaves' turn, how bare they are, and how fresh. */
  canopy: uniform(new Vector3()),
  dormant: colourUniform(),
  fresh: colourUniform(),
  gold: colourUniform(),
  russet: colourUniform(),
  bareWood: colourUniform(),
  freshWood: colourUniform(),
};

/** A colour of the same lightness as `colour`, in the hue of `target`. */
function retint(colour: Node<"vec3">, target: Node<"vec3">): Node<"vec3"> {
  const lum = vec3(0.3, 0.59, 0.11);
  return target.mul(colour.dot(lum).div(max(target.dot(lum), 0.001)));
}

/**
 * The land's ground through the year, repainted from the land's own locals
 * (`terrain-ground.ts`). The ground arrives with the material's grain laid
 * over the land's own surface; the grain is a factor, kept by dividing it
 * back out, so the seasons' ground takes the same grain.
 */
function seasonedGround(colour: Node<"vec3">): Node<"vec3"> {
  const { h, slope, wave, fine, wood, wobble, rock, snow, above, path, crowns, canopyShare } = LAND;
  const grain = colour.div(max(LAND.surface, vec3(0.001)));
  const fall = LAND.fall;
  const bands = GROUND.bands;
  const open = float(1).sub(rock).mul(float(1).sub(snow)).mul(smoothstep(0.3, 1.1, above)).mul(float(1).sub(path));
  const grass = open.mul(float(1).sub(smoothstep(0.3, 0.6, wood)));
  let g: Node<"vec3"> = LAND.ground;
  g = mix(g, retint(g, ground.fresh).mul(1.06), ground.season.y.mul(open).mul(0.42));
  // Autumn's grass in swathes of gold and russet, with green left in the hollows.
  const swathe = LAND.noiseAt(1 / 23).mul(0.7).add(wave.mul(0.3));
  const turnedGrass = mix(ground.gold, ground.russet, smoothstep(0.45, 0.8, swathe));
  g = mix(g, retint(g, turnedGrass).mul(fine.mul(0.2).add(0.92)), ground.season.z.mul(grass).mul(mix(0.35, 0.75, smoothstep(0.2, 0.55, swathe))));
  g = mix(g, retint(g, ground.dormant).mul(fine.mul(0.15).add(0.95)), ground.season.x.mul(open).mul(0.85));
  // Fallen leaves, in drifts, under the broadleaves.
  const under = smoothstep(0.2, 0.55, wood.add(fine.sub(0.5).mul(0.25))).mul(fall.w).mul(open);
  const drift = smoothstep(0.3, 0.7, LAND.noiseAt(0.8).mul(0.6).add(fine.mul(0.4)));
  g = mix(g, fall.xyz.mul(drift.mul(0.35).add(0.55)), ground.season.w.mul(under).mul(drift.mul(0.4).add(0.55)));
  // Snow down to the season's line, against the bands where it is, melting in soft patches, thin on steep ground and under the needles.
  const banded = h.sub(wobble);
  const lie = banded.add(wave.sub(0.5).mul(ground.snow.z)).add(fine.sub(0.5).mul(ground.snow.z.mul(0.25)));
  // The higher it lies against the bands, the steeper the ground it clings to: up through the woods to the treeline, and further up to the lasting snow, so only cliffs show bare up the mountains.
  const hold = smoothstep(bands.x.mul(0.25), bands.x.add(150), banded).mul(0.5).add(smoothstep(bands.x, bands.z, banded).mul(0.3));
  const cover = smoothstep(ground.snow.x.sub(ground.snow.y), ground.snow.x.add(ground.snow.y), lie)
    .mul(float(1).sub(smoothstep(hold.add(0.85), hold.add(1.25), slope.add(fine.sub(0.5).mul(0.3)))))
    .mul(float(1).sub(smoothstep(0.35, 0.85, wood).mul(float(1).sub(fall.w)).mul(fine.mul(0.4).add(0.6)).mul(0.6)))
    .mul(smoothstep(0, 0.5, above));
  const snowy = GROUND.snow.mul(float(1).sub(smoothstep(0.1, 0.9, wood).mul(0.14))).mul(fine.mul(0.06).add(0.96));
  g = mix(g, snowy, cover);
  // The far woods: fresh, turning, bare, and under snow.
  const tone = crowns.mul(0.45).add(0.62);
  let can: Node<"vec3"> = LAND.canopy;
  can = mix(can, ground.freshWood.mul(tone), ground.canopy.z.mul(fall.w).mul(0.6));
  can = mix(can, fall.xyz.mul(tone), ground.canopy.x.mul(fall.w));
  can = mix(can, ground.bareWood.mul(tone), ground.canopy.y.mul(fall.w));
  can = mix(can, snowy.mul(crowns.mul(0.2).add(0.8)), cover.mul(fall.w.mul(0.45).add(0.3)));
  return mix(g, can, canopyShare).mul(grain);
}

let plantsColoured = false;
let groundColoured = false;

const BROADLEAF_GROUPS: readonly SeasonGroup[] = ["birch", "aspen", "oak", "maple"];

const setVector = (to: Vector3, from: Color) => to.set(from.r, from.g, from.b);

export const SEASONS_ART: readonly FeatureArt[] = [
  {
    feature: "seasonalFoliage",
    stages: [{ kinds: ["foliage", "solid"], position: grown, surface: seasonedPlant }],
    frame: ({ day }) => {
      if (!plantsColoured) {
        const c = seasonColours();
        SEASON_GROUPS.forEach((_, i) => {
          setVector(plants.fresh.array[i] as Vector3, c.fresh[i]);
          setVector(plants.summer.array[i] as Vector3, c.summer[i]);
          setVector(plants.autumn.array[i] as Vector3, c.autumn[i]);
          setVector(plants.autumnAlt.array[i] as Vector3, c.autumnAlt[i]);
          setVector(plants.bare.array[i] as Vector3, c.bare[i]);
        });
        plants.snowColour.value.copy(themeColor("--color-hearthwood-valley-ground-snow"));
        plantsColoured = true;
      }
      const today = day.date.realDayOfYear;
      plants.day.value = today;
      plants.snow.value.x = groundSeason(today).snowLine;
    },
  },
  {
    feature: "seasonalGround",
    stages: [{ kinds: ["land"], surface: seasonedGround }],
    frame: ({ day }) => {
      if (!groundColoured) {
        ground.dormant.value.copy(token("ground-dormant"));
        ground.fresh.value.copy(token("ground-fresh"));
        ground.gold.value.copy(token("ground-gold"));
        ground.russet.value.copy(token("ground-russet"));
        ground.bareWood.value.copy(token("wood-bare"));
        ground.freshWood.value.copy(seasonColours().fresh[SEASON_GROUPS.indexOf("birch")]);
        REGIONS.forEach((region, r) => {
          const { colour, share } = regionFall(region);
          REGION_GROUND.fall[r].value.set(colour.r, colour.g, colour.b, share);
        });
        groundColoured = true;
      }
      const today = day.date.realDayOfYear;
      const season = groundSeason(today);
      ground.season.value.set(season.dormant, season.fresh, season.gold, season.litter);
      ground.snow.value.x = season.snowLine;
      let turn = 0;
      let leaf = 0;
      let fresh = 0;
      for (const g of BROADLEAF_GROUPS) {
        const s = plantSeason(g, today);
        turn += s.turn / BROADLEAF_GROUPS.length;
        leaf += s.leaf / BROADLEAF_GROUPS.length;
        fresh += s.fresh / BROADLEAF_GROUPS.length;
      }
      ground.canopy.value.set(turn * leaf, 1 - leaf, fresh * leaf);
    },
  },
];
