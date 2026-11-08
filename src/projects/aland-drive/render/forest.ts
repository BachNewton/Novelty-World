import { BufferAttribute, BufferGeometry, DoubleSide, IndirectStorageBufferAttribute, Mesh, MeshBasicNodeMaterial, StorageBufferAttribute, Vector2, Vector3, type Node, type PerspectiveCamera, type Scene, type WebGPURenderer } from "three/webgpu";
import { abs, atomicAdd, atomicStore, attribute, cameraPosition, cos, dot, float, floor, Fn, fract, If, instanceIndex, min, mix, normalize, positionWorld, screenCoordinate, select, sin, smoothstep, sqrt, storage, uint, uniform, varying, vec2, vec3, vec4 } from "three/tsl";
import { outsideCar } from "../art/car-volume";
import { placeSeed, seedOf, unitOf } from "../art/hash";
import { clumpSizeOf, crownLeftOf, CROWN_GONE, FALL_SPAN, FRESH_SHARE, HAZE_EDGE, HAZE_LIGHT, hazeByDistance, leavesOf, snowHeldOf, snowOnFace } from "../art/leaves";
import { BARE_KINDS, BRANCHES, CLUMPS, FIRST_BARE_KIND, PART_TWIG, ROWS_A_VERTEX, type BareModel } from "./bare-tree";
import { seasonNodes, type SeasonLook } from "../art/season";
import { flatNormal } from "../art/flat-normal";
import { CLEARING_SLACK_M, HEIGHT_RANGE, HEIGHT_ROLL, JITTER, JITTER_ROLLS, LEAF_ROLL, NEAR_STEP_M, ROAD_COVERAGE, ROAD_LOOK_M, SHORTEST_M, SNOW_ROLL, SPECIES_ROLL, STAND_ROLL } from "./tree-place";
import { CONE_FILL, CROWN_REACH, CROWN_SPREAD, FAR_RINGS, FAR_TABLE, GNARL, LEAN, NEAR_RINGS, NEAR_TABLE, RING_VALUES, ROCK_LEAN, ROCK_REACH, ROCK_ROW, SPECIES, STAGES, SWELL, TREE_KINDS, TRUNK_RINGS, WIND_WAY, type TreeKind } from "./tree-shapes";
import { foliageLight } from "./foliage-light";
import { towardsSun } from "../art/sun";
import { spiralCell, spiralPlaces } from "./spiral";
import { viewSides } from "./view-sides";
import { type Sun } from "../art/sun";

/*
 * The forest, with no list of trees anywhere: a tree is a place on a lattice of the
 * world. What stands there is worked out from the place, how tall from the tile's
 * canopy image, which species and whether at all from its stands (`pipeline/stands.py`)
 * and the rest from rolls, so a tree is the same tree whenever it comes
 * back, and nothing is stored or streamed for one.
 *
 * Each frame a compute pass goes through the places within the forest's reach of the
 * camera and keeps those where a tree stands, clear of roads and in the view, writing
 * them into one list for each model with all a vertex needs. Only the lists are drawn,
 * so a place with no tree and a tree behind the camera cost no vertices, and every
 * tree can stay to the forest's reach. The pass walks the places in a spiral from the
 * camera's cell outwards (`spiral.ts`), so each list comes out near to far and the
 * depth test spares the crowns behind those drawn first.
 *
 * Near a building a tree is no taller than lets its crown, at the widest any tree's
 * spreads, clear the building's outline, as the tile's clearing image measures it
 * (`pipeline/clearing.py`), so no crown or trunk stands in a building.
 *
 * A tree never changes height, and stands on ground chosen by its distance and not its
 * model, so a handover can't move it. It's the turned shape out to `fullReachM`, then
 * a plain cone where it's a few pixels, by a screen-door crossfade: for those metres
 * it's on both lists, and the two take opposite pixels of a fixed pattern, so a tree is
 * always whole. At the far edge trees dissolve, tiny, and by then the terrain has risen
 * by the canopy behind them (`canopyLift`).
 *
 * Every kind of tree is one mesh, and a table says where its rings go (`tree-shapes.ts`).
 * The compute pass decides what a tree is: its kind from the stand, with other broadleaf
 * rounder the more open it stands; its stage of life from its height, so a sapling
 * isn't a shrunken old tree; and whether it's a pine grown on bare rock, from being
 * short among gaps in the canopy, which also tells it from a young pine in a thicket.
 * A far tree reads the same table at fewer rings, so the forest's mix and its age
 * carry out to its reach. None of that adds a draw.
 *
 * A broadleaf without all its leaves is another object (`bare-tree.ts`): its trunk forks
 * into limbs and branches, clumps of leaves sit on those while it has any, and a faint
 * see-through haze fills its crown's outline for the fine twigs no triangle could draw.
 * As its leaves fall, over a fortnight or so of its own, its leafy crown shrinks away
 * inside its clumps and the clumps then shrink away one by one, so a stand in October
 * has full, thinning and bare trees side by side; in spring the same runs backwards.
 * Near, it's on the branch, clump and haze lists, handing over by the same crossfade
 * as the leafy crown to a far crown shrunk by the leaves it has lost and a far haze.
 * The haze is blended, not a screen pattern, and grows denser with distance as the
 * branches it stands for thin below a pixel.
 */

export interface ForestSettings {
  /** How far out every tree is the full shape. */
  fullReachM: number;
  /** How far out there are trees. */
  forestReachM: number;
  /** The share of places that stay past the full shape: below 1 the rest dissolve and those left fill out to cover for them. */
  farDensity: number;
}

/** The buffers are sized for this, so a setting at or below it changes a number and rebuilds nothing. */
export const FOREST_MOST: ForestSettings = { fullReachM: 1000, forestReachM: 2400, farDensity: 1 };

const PLACES_A_GROUP = 64;
/** Each change starts between the first pair, by a roll for each tree, and takes the run. The first two count from the full reach, the last from the forest's. */
const HANDOVER: Band = [0, 68, 24];
const THINNING: Band = [92, 252, 64];
const EDGE: Band = [-220, -90, 90];
/** Stood this far into the ground, so the coarser ground a shader reads never shows under a trunk on a slope. */
const SINK_M = 0.5;
/** A tree eases from each ring's ground to the next's over these runs, by its distance, and each run is done before the ring it leaves runs out. */
const GROUND_RUNS: [number, number][] = [
  [200, 340],
  [560, 740],
  [1200, 1450],
];
/** No ground in the world, with the tallest tree the canopy image can hold on it, is outside these, or a tree's crown wider than this. */
const WORLD_HEIGHTS_M = [-10, 225] as const;
const WIDEST_CROWN_M = 15;
/** A share of a tree's height: past this from the middle of its trunk there's none of it, whichever model, leaning or not. */
const TREE_BOUND = 0.7;
/** A tree in a list is three rows of four floats. */
const ROWS_A_TREE = 3;
/** Where each list's draw starts in the buffer of draws, and where in a draw its count of trees is. */
const TURNED_DRAW = 0;
const CONE_DRAW = 5;
const BRANCH_DRAW = 10;
const CLUMP_DRAW = 15;
const HAZE_DRAW = 20;
const FAR_HAZE_DRAW = 25;
const DRAWS = [TURNED_DRAW, CONE_DRAW, BRANCH_DRAW, CLUMP_DRAW, HAZE_DRAW, FAR_HAZE_DRAW];
const TREES_AT = 1;

type Band = [from: number, to: number, run: number];

/** How tall a tree is at each stage of life, and how far a roll moves that, so a stand doesn't change all at one height. Most of Åland's trees stand from 5 to 25 m. */
const YOUNG_M = 5;
const GROWN_M = 13;
const OLD_M = 22;
const STAGE_SPREAD_M = 1.5;
/** The canopy's mean round a tree, as a share of its own place's: below the first it stands in the open, above the second among others. Read off a level of the image 32 m across. */
const AROUND_MIP = 3;
const AMONG_OTHERS: [number, number] = [0.6, 0.95];
/** Short and in the open is a pine on rock: the aerial photo is about a quarter brighter under such trees than under short ones among others. Above this height it's no longer one. */
const ROCK_TALLEST_M: [number, number] = [9, 13];
/** How much of other broadleaf is round, and how much more in the open, where oak and ash stand in meadows. */
const ROUND_SHARE = 0.35;
const ROUND_OPEN_SHARE = 0.5;
const DOWNWIND = vec2(...WIND_WAY);
/** A tree's roll and how crowded it stands share one float after its kind: the roll in steps, the crowding inside a step, kept off a step's edges. */
const ROLL_STEPS = 256;
const AMONG_KEPT = 0.98;

/*
 * A tree's light is its leaves' (`foliage-light.ts`), from the crown's direction as a
 * whole: out from its middle. Then the crown shades itself: dark at its base and
 * between its tiers, lit at its top, and darker still among other trees than standing
 * alone. A tree's own brightness and a touch of its hue are rolled, so no two in a
 * stand are alike.
 */
const CROWN_MIDDLE = 0.4;
const ROUNDNESS = 1.6;
const CROWN_BASE_LIGHT = 0.72;
const CROWN_TOP_LIGHT = 1.12;
const TRUNK_LIGHT = 0.86;
const TUCKED_LIGHT = 0.7;
/** How much of its own shade a tree standing alone keeps: the sky reaches its lower crown. */
const ALONE_SHADE = 0.45;
const BRIGHTNESS_ROLL: [number, number] = [0.86, 1.12];
/** How far a tree's leaves lean yellow or blue, either way. */
const HUE_ROLL = 0.07;

/** How much snow lies on a bare broadleaf's limbs, against a conifer's crown, and how much each tree's own share varies. */
const TWIG_SNOW = 0.4;
const SNOW_ROLLED: [number, number] = [0.65, 1];

/** How much of its crown a tree's twig haze fills, and how much snow greys it. Leaf fall's own numbers are `art/leaves.ts`'s, shared with the lindens and bushes. */
const HAZE_SPREAD = 0.92;
const HAZE_SNOW = 0.05;
/** How dense each bare kind's twigs are: a birch's are the finest and most. */
const TWIG_DENSITY: Record<(typeof BARE_KINDS)[number], number> = { birch: 1, round: 0.75, upright: 0.85 };

/** A stand for a scene with no tile: Åland's own mix of pine, spruce and birch, at every place. */
const ANY_STAND = vec4(0.6, 0.15, 0.13, 1);

const NEAR_SIDES = 5;
const FAR_SIDES = 3;

/** A spun outline: per vertex only its ring and its way round, the table saying where a ring goes. A pointed one starts from a point, as a far crown does. Its triangles' trunk must stay `bare-tree.ts`'s. */
function turned(rings: number, sides: number, pointed: boolean): BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const across = sides + 1;
  for (let level = 0; level < rings; level++) {
    for (let side = 0; side < across; side++) {
      // Each ring turns a little from the last and swells unevenly, so a tree isn't a lathe's.
      const angle = ((side % sides) + level * 0.37) * ((2 * Math.PI) / sides);
      const swell = 1 + SWELL * Math.sin((side % sides) * 2.4 + level * 1.7);
      positions.push(Math.sin(angle) * swell, level, Math.cos(angle) * swell);
      if (level > 0 && side < sides) {
        const here = level * across + side;
        if (level === rings - 1) indices.push(here - across, here - across + 1, here);
        else if (level === 1 && pointed) indices.push(here - across, here + 1, here);
        else indices.push(here - across, here - across + 1, here, here, here - across + 1, here + 1);
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(Float32Array.from(positions), 3));
  geometry.setIndex(indices);
  return geometry;
}

const kindAt = (kind: TreeKind) => float(TREE_KINDS.indexOf(kind));

const roll = (cell: Node<"vec2">, salt: number) => unitOf(seedOf(cell.x, cell.y), salt);

/** The most lattice places in a circle, with room for a tree's jitter and the lattice's edge, so a list can't overrun. */
const placesWithin = (metres: number) => Math.ceil(Math.PI * (metres / NEAR_STEP_M + 2) ** 2);

const bandEnd = ([, to, run]: Band) => to + run;

/** The settings as a shader reads them. The terrain's canopy rise reads the same reach, so the two can't part. */
export interface ForestKnobs {
  fullReach: Node<"float">;
  forestReach: Node<"float">;
  farDensity: Node<"float">;
  get: () => ForestSettings;
  set: (settings: ForestSettings) => void;
}

export function forestKnobs(settings: ForestSettings): ForestKnobs {
  const fullReach = uniform(0);
  const forestReach = uniform(0);
  const farDensity = uniform(0);
  const knobs: ForestKnobs = {
    fullReach,
    forestReach,
    farDensity,
    get: () => ({ fullReachM: fullReach.value, forestReachM: forestReach.value, farDensity: farDensity.value }),
    set({ fullReachM, forestReachM, farDensity: density }) {
      fullReach.value = Math.min(fullReachM, FOREST_MOST.fullReachM);
      forestReach.value = Math.min(forestReachM, FOREST_MOST.forestReachM);
      farDensity.value = Math.min(density, FOREST_MOST.farDensity);
    },
  };
  knobs.set(settings);
  return knobs;
}

/** Where each change of detail starts and has finished by, for the lab to mark on the ground: the handover, the thinning and the edge. */
export function forestBands({ fullReachM, forestReachM, farDensity }: ForestSettings): [number, number][] {
  return [
    [fullReachM + HANDOVER[0], fullReachM + bandEnd(HANDOVER)],
    farDensity < 1 ? [fullReachM + THINNING[0], fullReachM + bandEnd(THINNING)] : [0, 0],
    [forestReachM + EDGE[0], forestReachM + bandEnd(EDGE)],
  ];
}

export interface ForestInputs {
  knobs: ForestKnobs;
  /** The canopy's height at a place, at a level of its mips. */
  canopyAt: (place: Node<"vec2">, mip: number) => Node<"float">;
  /** The shares of pine, spruce and birch at a place, what's left being other broadleaf, then the share of places holding a tree. */
  standsAt?: (place: Node<"vec2">) => Node<"vec4">;
  /** The ground at a place on one of the terrain's rings. */
  groundAt: (ring: number, place: Node<"vec2">) => Node<"float">;
  /** How much road the mask holds at a place, and the size of a tile: a tree stands clear of roads, and of a neighbour's over a tile's edge. */
  roads?: { at: (place: Node<"vec2">) => Node<"float">; tileM: number };
  /** Metres from a place to the nearest building: a tree is no taller than its crown can spread clear of it. */
  clearanceAt?: (place: Node<"vec2">) => Node<"float">;
  colour: (name: string) => Node<"vec3">;
  hazed: (color: Node<"vec3">) => Node<"vec3">;
  sun: Sun;
  /** The season the broadleaves turn and fall by and the snow lies in; summer if none. */
  season?: SeasonLook;
  /** The forest lab's colours in place of a tree's own. The game passes none, and its shaders hold none of this. */
  paint?: (tree: PaintedTree) => Node<"vec3">;
}

export type ForestModel = "turned" | "cone" | "branches" | "clumps" | "haze";

export interface PaintedTree {
  model: ForestModel;
  /** The tree's own colour. */
  natural: Node<"vec3">;
  /** Part way through a handover, or dissolving. */
  changing: Node<"bool">;
  /** How far the ground under a tree moves between two rings. */
  groundGap: Node<"float">;
}

/** How many trees each list drew, and their triangles. */
export interface ForestDrawn {
  turned: number;
  cone: number;
  branches: number;
  clumps: number;
  /** Near and far. */
  haze: number;
  triangles: number;
}

export interface Forest {
  /** Picks this frame's trees: distance is measured from a spot and the view is a camera's, which the map's flight keeps apart. */
  update: (spot: Vector3, camera: PerspectiveCamera) => void;
  /** Builds the compute pipelines, which would otherwise stall the first frame that uses them. */
  compile: () => Promise<void>;
  show: (model: ForestModel, shown: boolean) => void;
  /** The GPU's counts, read back without holding a frame up, so a few frames old, and nothing at first. */
  drawn: () => ForestDrawn;
  dispose: () => void;
}

export function createForest(scene: Scene, renderer: WebGPURenderer, { knobs, canopyAt, standsAt = () => ANY_STAND, groundAt, roads, clearanceAt, colour, hazed, sun, season, paint }: ForestInputs): Forest {
  const cameraSpot = uniform(new Vector2());
  /** The lattice cell under the camera, which the spiral of places winds out from. */
  const centre = uniform(new Vector2());
  const view = viewSides(WORLD_HEIGHTS_M, WIDEST_CROWN_M);
  const { sides } = view;
  const toSun = towardsSun(sun);
  const seasons = seasonNodes(season);
  // A tree's species within its shape, as when its leaves go and their autumn colour: the first that fits wins.
  const speciesOf = (kind: Node<"float">, pick: Node<"float">) =>
    (["birch", "round", "upright"] as const)
      .flatMap((shape) => SPECIES[shape].map((species, at, all) => ({ ...species, shape, below: at === all.length - 1 ? 2 : all.slice(0, at + 1).reduce((sum, { share }) => sum + share, 0) })))
      .reduceRight(
        (chosen, { shape, below, goes, autumn }) => {
          const is = kind.equal(kindAt(shape)).and(pick.lessThan(below));
          return { goes: select(is, vec2(...goes), chosen.goes), autumn: select(is, colour(autumn), chosen.autumn) };
        },
        { goes: vec2(0, 1) as Node<"vec2">, autumn: colour("tree-birch") },
      );
  const isBroadleaf = (kind: Node<"float">) => kind.greaterThan(kindAt("birch").sub(0.5));
  /** A tree's leaves, from its place: the compute pass and every model's shader work them out alike. */
  const leavesAt = (kind: Node<"float">, place: Node<"vec2">) => {
    const roll = (salt: number) => unitOf(placeSeed(place), salt);
    const species = speciesOf(kind, roll(SPECIES_ROLL));
    const leaves = leavesOf(seasons, mix(species.goes.x, species.goes.y, roll(LEAF_ROLL)), FALL_SPAN);
    return { species, leaves, share: select(isBroadleaf(kind), leaves.inLeaf, float(1)) };
  };
  // Interleaved gradient noise: a fixed pattern on the screen, with no clumps for a crossfade to show as.
  const pattern = fract(fract(dot(screenCoordinate.xy, vec2(0.06711056, 0.00583715))).mul(52.9829189));

  const turnedShape = turned(NEAR_RINGS, NEAR_SIDES, false);
  const coneShape = turned(FAR_RINGS, FAR_SIDES, true);
  const bareShape = (model: BareModel) => {
    const geometry = new BufferGeometry();
    // A vertex is only which of its kind's rows it reads.
    geometry.setAttribute("position", new BufferAttribute(Float32Array.from({ length: model.vertices * 3 }, (_, at) => (at % 3 === 0 ? at / 3 : 0)), 3));
    geometry.setIndex(model.indices);
    return geometry;
  };
  const branchShape = bareShape(BRANCHES);
  const clumpShape = bareShape(CLUMPS);
  const hazeShape = turned(NEAR_RINGS, NEAR_SIDES, false);
  const farHazeShape = turned(FAR_RINGS, FAR_SIDES, true);
  const indicesOf = (shape: BufferGeometry) => shape.getIndex()?.count ?? 0;
  const shapeOfDraw: [number, BufferGeometry][] = [
    [TURNED_DRAW, turnedShape],
    [CONE_DRAW, coneShape],
    [BRANCH_DRAW, branchShape],
    [CLUMP_DRAW, clumpShape],
    [HAZE_DRAW, hazeShape],
    [FAR_HAZE_DRAW, farHazeShape],
  ];
  const drawArgs = new Uint32Array(FAR_HAZE_DRAW + 5);
  for (const [draw, shape] of shapeOfDraw) drawArgs[draw] = indicesOf(shape);
  const draws = new IndirectStorageBufferAttribute(drawArgs, 5);
  const counters = storage(draws, "uint", draws.array.length).toAtomic();
  const nearRows = placesWithin(FOREST_MOST.fullReachM + bandEnd(HANDOVER)) * ROWS_A_TREE;
  const farRows = placesWithin(FOREST_MOST.forestReachM) * ROWS_A_TREE;
  const nearShapes = new StorageBufferAttribute(NEAR_TABLE, RING_VALUES);
  const farShapes = new StorageBufferAttribute(FAR_TABLE, RING_VALUES);
  const branchTable = new StorageBufferAttribute(BRANCHES.table, 4);
  const clumpTable = new StorageBufferAttribute(CLUMPS.table, 4);
  const lists = {
    turned: new StorageBufferAttribute(nearRows, 4),
    cone: new StorageBufferAttribute(farRows, 4),
    branches: new StorageBufferAttribute(nearRows, 4),
    clumps: new StorageBufferAttribute(nearRows, 4),
    haze: new StorageBufferAttribute(nearRows, 4),
    farHaze: new StorageBufferAttribute(farRows, 4),
  };

  const shareLeft = (distance: Node<"float">, tree: Node<"float">, reach: Node<"float">, [from, to, run]: Band) => {
    const starts = mix(reach.add(from), reach.add(to), tree);
    return float(1).sub(smoothstep(starts, starts.add(run), distance));
  };

  const roadsAround = (place: Node<"vec2">) => {
    if (!roads) return float(0);
    // The mask stops at a tile's edge, so close to one a tree looks over it too.
    const inTile = fract(place.div(roads.tileM)).mul(roads.tileM).toVar();
    const over = (spot: Node<"float">) => select(spot.lessThan(ROAD_LOOK_M), float(-ROAD_LOOK_M), select(spot.greaterThan(roads.tileM - ROAD_LOOK_M), float(ROAD_LOOK_M), float(0)));
    return roads.at(place).max(roads.at(place.add(vec2(over(inTile.x), over(inTile.y)))));
  };

  const reset = Fn(() => {
    for (const draw of DRAWS) atomicStore(counters.element(draw + TREES_AT), uint(0));
  })().compute(1);

  const writeTo = {
    turned: storage(lists.turned, "vec4", nearRows),
    cone: storage(lists.cone, "vec4", farRows),
    branches: storage(lists.branches, "vec4", nearRows),
    clumps: storage(lists.clumps, "vec4", nearRows),
    haze: storage(lists.haze, "vec4", nearRows),
    farHaze: storage(lists.farHaze, "vec4", farRows),
  };
  const cull = Fn(() => {
    const cell = spiralCell(instanceIndex).add(centre).toVar();
    const jitter = vec2(roll(cell, JITTER_ROLLS[0]), roll(cell, JITTER_ROLLS[1])).sub(0.5).mul(JITTER * NEAR_STEP_M);
    const place = cell.mul(NEAR_STEP_M).add(jitter).toVar();
    const distance = place.sub(cameraSpot).length().toVar();
    // The world's heights stand in for the ground at first, so a place behind the camera costs no read of any image.
    const perhapsSeen = sides.map(({ plane, rough }) => dot(plane.xz, place).add(rough).greaterThanEqual(0)).reduce((all, side) => all.and(side));

    If(distance.lessThan(knobs.forestReach).and(perhapsSeen), () => {
      const canopy = canopyAt(place, 0).toVar();
      const rolled = canopy.mul(mix(float(HEIGHT_RANGE[0]), float(HEIGHT_RANGE[1]), roll(cell, HEIGHT_ROLL)));
      const clearance = clearanceAt ? clearanceAt(place).sub(CLEARING_SLACK_M).toVar() : null;
      const height = (clearance ? rolled.min(clearance.div(CROWN_REACH)) : rolled).toVar();
      const stand = standsAt(place).toVar();
      If(height.greaterThanEqual(SHORTEST_M).and(roll(cell, STAND_ROLL).lessThan(stand.a)), () => {
        If(roadsAround(place).lessThanEqual(ROAD_COVERAGE), () => {
          const ground = float(0).toVar();
          const between = (ring: number) => {
            const [from, to] = GROUND_RUNS[ring];
            ground.assign(mix(groundAt(ring, place), groundAt(ring + 1, place), smoothstep(float(from), float(to), distance)));
          };
          If(distance.lessThan(GROUND_RUNS[0][1]), () => between(0))
            .ElseIf(distance.lessThan(GROUND_RUNS[1][1]), () => between(1))
            .Else(() => between(2));

          const middle = vec3(place.x, ground.add(height.mul(0.5)), place.y).toVar();
          const seen = sides.map(({ plane }) => dot(plane.xyz, middle).add(plane.w).add(height.mul(TREE_BOUND)).greaterThanEqual(0)).reduce((all, side) => all.and(side));
          If(seen, () => {
            const tree = roll(cell, 5).toVar();
            const edgeShare = shareLeft(distance, tree, knobs.forestReach, EDGE);
            const stays = roll(cell, 6).lessThan(knobs.farDensity);
            const coneTo = select(stays, edgeShare, min(edgeShare, shareLeft(distance, tree, knobs.fullReach, THINNING))).toVar();
            const turnedShare = shareLeft(distance, tree, knobs.fullReach, HANDOVER).toVar();
            const turnedTo = min(turnedShare, coneTo).toVar();

            const mixRoll = roll(cell, 7).toVar();
            const among = smoothstep(float(AMONG_OTHERS[0]), float(AMONG_OTHERS[1]), canopyAt(place, AROUND_MIP).div(canopy)).toVar();
            const open = float(1).sub(among).toVar();
            const broadleaf = select(roll(cell, 8).lessThan(open.mul(ROUND_OPEN_SHARE).add(ROUND_SHARE)), kindAt("round"), kindAt("upright"));
            const toPine = stand.g.add(stand.r).toVar();
            const kind = select(mixRoll.lessThan(stand.g), kindAt("spruce"), select(mixRoll.lessThan(toPine), kindAt("pine"), select(mixRoll.lessThan(toPine.add(stand.b)), kindAt("birch"), broadleaf))).toVar();
            const look = kind.add(floor(roll(cell, 9).mul(ROLL_STEPS)).add(among.mul(AMONG_KEPT).add((1 - AMONG_KEPT) / 2)).div(ROLL_STEPS)).toVar();
            const reached = height.add(roll(cell, 10).sub(0.5).mul(2 * STAGE_SPREAD_M)).toVar();
            const stage = select(reached.lessThan(GROWN_M), reached.sub(YOUNG_M).div(GROWN_M - YOUNG_M), reached.sub(GROWN_M).div(OLD_M - GROWN_M).add(1)).clamp(0, STAGES - 1.001).toVar();
            // A rock pine leans and forks wider than any other tree, so one too near a building to fit grows straight.
            const roomToLean = clearance ? select(height.mul(ROCK_REACH).lessThanEqual(clearance), float(1), float(0)) : float(1);
            const rocky = select(kind.equal(kindAt("pine")), open.mul(float(1).sub(smoothstep(float(ROCK_TALLEST_M[0]), float(ROCK_TALLEST_M[1]), height))).mul(roomToLean), float(0)).toVar();
            const leanWay = roll(cell, 11).mul(6.283).toVar();
            const lean = vec2(cos(leanWay), sin(leanWay)).mul(LEAN).mul(roll(cell, 12)).toVar();
            const blown = DOWNWIND.mul(mix(float(ROCK_LEAN[0]), float(ROCK_LEAN[1]), roll(cell, 13))).mul(rocky);
            const growing = vec4(stage, rocky, lean.add(blown)).toVar();
            const yaw = roll(cell, 14).mul(6.283).toVar();
            const standing = vec4(place.x, ground.sub(SINK_M), place.y, height).toVar();
            // A broadleaf short of all its leaves is its branches, what clumps it still has, and its twigs' haze; its leafy crown stays only while it shrinks away inside them.
            const leafShare = leavesAt(kind, place).share.toVar();
            const crowned = leafShare.greaterThan(CROWN_GONE).toVar();
            const bare = isBroadleaf(kind).and(leafShare.lessThan(1)).toVar();
            const hasLeaves = leafShare.greaterThan(0).toVar();

            const list = (rows: typeof writeTo.turned, draw: number, from: Node<"float">, to: Node<"float">) => {
              const row = atomicAdd(counters.element(draw + TREES_AT), uint(1)).mul(ROWS_A_TREE).toVar();
              rows.element(row).assign(standing);
              rows.element(row.add(1)).assign(vec4(yaw, look, from, to));
              rows.element(row.add(2)).assign(growing);
            };
            const near = turnedTo.greaterThan(0).toVar();
            const far = coneTo.greaterThan(turnedShare).toVar();
            If(near.and(crowned), () => list(writeTo.turned, TURNED_DRAW, float(0), turnedTo));
            If(near.and(bare), () => list(writeTo.branches, BRANCH_DRAW, float(0), turnedTo));
            If(near.and(bare), () => list(writeTo.haze, HAZE_DRAW, float(0), turnedTo));
            If(near.and(bare).and(hasLeaves), () => list(writeTo.clumps, CLUMP_DRAW, float(0), turnedTo));
            If(far.and(hasLeaves), () => list(writeTo.cone, CONE_DRAW, turnedShare, coneTo));
            If(far.and(bare), () => list(writeTo.farHaze, FAR_HAZE_DRAW, turnedShare, coneTo));
          });
        });
      });
    });
  })().computeKernel([PLACES_A_GROUP]);

  const readOnly = (shapes: StorageBufferAttribute) => storage(shapes, "vec4", shapes.count).toReadOnly();
  /** What a model's vertex knows of its tree, from its row of a list. */
  const treeOf = (list: StorageBufferAttribute, rows: number) => {
    const trees = storage(list, "vec4", rows).toReadOnly();
    const standing = trees.element(instanceIndex.mul(ROWS_A_TREE)).toVar();
    const carried = trees.element(instanceIndex.mul(ROWS_A_TREE).add(1)).toVar();
    const growing = trees.element(instanceIndex.mul(ROWS_A_TREE).add(2)).toVar();
    const kind = floor(carried.y).toVar();
    const packed = fract(carried.y).mul(ROLL_STEPS).toVar();
    const treeRoll = floor(packed).div(ROLL_STEPS - 1).toVar();
    const among = fract(packed).sub((1 - AMONG_KEPT) / 2).div(AMONG_KEPT).clamp(0, 1);
    const place = standing.xz;
    const yaw = carried.x;
    const season = leavesAt(kind, place);
    const turn = (way: Node<"vec2">) => vec2(way.x.mul(cos(yaw)).sub(way.y.mul(sin(yaw))), way.x.mul(sin(yaw)).add(way.y.mul(cos(yaw))));
    /** A ring of the outline table at this tree's stage of life, between two of its stages' rows. */
    const tables = new Map<StorageBufferAttribute, ReturnType<typeof readOnly>>();
    const ringOf = (shapes: StorageBufferAttribute, rings: number, ring: Node<"float">) => {
      const table = tables.get(shapes) ?? readOnly(shapes);
      tables.set(shapes, table);
      const stageRow = kind.mul(STAGES).add(floor(growing.x));
      const at = (row: Node<"float">) => table.element(uint(row.mul(rings).add(ring)));
      return mix(at(stageRow), at(stageRow.add(1)), fract(growing.x));
    };
    const snowHeld = snowHeldOf(seasons, unitOf(placeSeed(place), SNOW_ROLL)).mul(mix(float(SNOW_ROLLED[0]), float(SNOW_ROLLED[1]), treeRoll));
    const ownShade = (selfShade: Node<"float">) => varying(mix(float(1), selfShade, mix(float(ALONE_SHADE), float(1), among)));
    const brightness = varying(mix(float(BRIGHTNESS_ROLL[0]), float(BRIGHTNESS_ROLL[1]), treeRoll));
    const hue = varying(fract(treeRoll.mul(7.31)).sub(0.5).mul(2 * HUE_ROLL));
    const spread = treeRoll.sub(0.5).mul(2 * CROWN_SPREAD).add(1);
    return { standing, carried, growing, kind, treeRoll, among, place, height: standing.w, yaw, season, turn, ringOf, snowHeld, ownShade, brightness, hue, spread, live: varying(carried.zw) };
  };
  type Tree = ReturnType<typeof treeOf>;

  const leafColourOf = (tree: Tree) => {
    const summer = ofKind({ spruce: colour("tree-spruce"), pine: colour("tree-pine"), birch: colour("tree-birch"), round: colour("tree-round"), upright: colour("tree-upright") }, tree.kind);
    const { leaves, species } = tree.season;
    const turnedTo = mix(mix(summer, colour("tree-fresh"), leaves.fresh.mul(FRESH_SHARE)), species.autumn, leaves.turned);
    return select(isBroadleaf(tree.kind), turnedTo, summer);
  };
  const barkOf = (kind: Node<"float">, rise: Node<"float">) => {
    // A pine's bark turns from grey-brown to fox red up its trunk, and a birch's is dark at the foot.
    const pineBark = mix(colour("tree-bark"), colour("tree-pine-bark"), smoothstep(float(0.08), float(0.34), rise));
    const birchBark = mix(colour("tree-bark"), colour("tree-birch-bark"), smoothstep(float(0.03), float(0.1), rise));
    return ofKind({ spruce: colour("tree-bark"), pine: pineBark, birch: birchBark, round: colour("tree-round-bark"), upright: colour("tree-upright-bark") }, kind);
  };

  const meshes: { model: ForestModel; mesh: Mesh }[] = [];
  const add = (name: ForestModel, geometry: BufferGeometry, draw: number, material: MeshBasicNodeMaterial, tree: Tree, natural: Node<"vec3">, light: Node<"float">) => {
    geometry.setIndirect(draws, draw * Uint32Array.BYTES_PER_ELEMENT);
    const { place, live } = tree;
    const painted = paint ? paint({ model: name, natural, changing: live.x.greaterThan(0).or(live.y.lessThan(1)), groundGap: varying(groundAt(1, place).sub(groundAt(2, place)).abs()) }) : natural;
    material.colorNode = hazed(painted.mul(light));
    material.maskNode = pattern.greaterThanEqual(live.x).and(pattern.lessThan(live.y)).and(outsideCar());
    material.side = DoubleSide;
    const mesh = new Mesh(geometry, material);
    mesh.frustumCulled = false;
    scene.add(mesh);
    meshes.push({ model: name, mesh });
  };

  const crownModel = (name: "turned" | "cone", geometry: BufferGeometry, list: StorageBufferAttribute, rows: number, draw: number, shapes: StorageBufferAttribute, rings: number) => {
    const tree = treeOf(list, rows);
    const { standing, growing, kind, place, height, yaw, season } = tree;
    const rocky = growing.y;
    const unit = attribute<"vec3">("position", "vec3");

    // A broadleaf losing its leaves shrinks its crown away, near inside its clumps and far by the leaves it has lost; near, its trunk is its branches' from the first leaf that falls.
    const broadleaf = isBroadleaf(kind);
    const crownTrunk = name === "cone" ? float(1) : select(unit.y.greaterThan(TRUNK_RINGS - 0.5), float(1), float(0));
    const crownLeft = name === "cone" ? sqrt(season.share) : crownLeftOf(season.share);
    const trunkLeft = select(season.share.lessThan(1), float(0), float(1));
    const leaving = mix(trunkLeft, crownLeft, crownTrunk);
    const radial = tree.turn(unit.xz);
    const table = storage(shapes, "vec4", shapes.count).toReadOnly();
    const shapeAt = (row: Node<"float">) => table.element(uint(row.mul(rings).add(unit.y)));
    const stageRow = kind.mul(STAGES).add(floor(growing.x)).toVar();
    const shape = mix(mix(shapeAt(stageRow), shapeAt(stageRow.add(1)), fract(growing.x)), shapeAt(float(ROCK_ROW)), rocky).toVar();
    // A shrinking crown draws in on its middle, so it goes as a ball of leaves going, not a spindle.
    const baseAt = (row: Node<"float">) => table.element(uint(row.mul(rings).add(name === "cone" ? 0 : TRUNK_RINGS))).x;
    const crownMiddle = mix(baseAt(stageRow), baseAt(stageRow.add(1)), fract(growing.x)).mul(1 - CROWN_MIDDLE).add(CROWN_MIDDLE);
    const rise = select(broadleaf.and(crownTrunk.greaterThan(0.5)), mix(crownMiddle, shape.x, leaving), shape.x);
    // Those left past the thinning fill out to cover for the rest, so the forest keeps its weight.
    const filling = smoothstep(knobs.fullReach.add(THINNING[0]), knobs.fullReach.add(bandEnd(THINNING)), place.sub(cameraSpot).length());
    const fill = name === "cone" ? mix(float(1), sqrt(float(1).div(knobs.farDensity)), filling).mul(CONE_FILL) : float(1);
    const width = shape.y.mul(fill).mul(tree.spread).mul(select(broadleaf, leaving, float(1)));
    // A rock pine's rings wander from straight, each its own way, though its foot stays where it grew.
    const wander = vec2(sin(unit.y.mul(2.1).add(yaw)), cos(unit.y.mul(1.3).add(yaw.mul(2)))).mul(rocky).mul(GNARL).mul(smoothstep(float(0), float(0.3), rise));
    const across = radial.mul(width).add(growing.zw.mul(rise).mul(rise)).add(wander).mul(height);
    const material = new MeshBasicNodeMaterial();
    material.name = `forest-${name}`;
    material.positionNode = vec3(place.x.add(across.x), standing.y.add(rise.mul(height)), place.y.add(across.y));

    const kindHere = varying(kind);
    // Sharp at once, or a crown's underside takes the colour of the trunk it spreads from.
    const leafy = name === "cone" ? float(1) : smoothstep(float(0), float(0.08), varying(unit.y.sub(TRUNK_RINGS - 1).clamp(0, 1)));
    const leaf = varying(leafColourOf(tree));
    // Only a conifer's crown holds snow: a broadleaf's crown is its leaves, gone before the snow comes but for a rare early fall.
    const snowHeld = varying(tree.snowHeld.mul(select(broadleaf, float(0), float(1))));
    const riseHere = varying(rise);
    const bark = barkOf(kindHere, riseHere);
    const inTrunk = name === "cone" ? float(0) : select(unit.y.lessThan(TRUNK_RINGS - 0.5), float(1), float(0));
    const rounded = varying(vec3(radial.x, shape.z.sub(CROWN_MIDDLE).mul(ROUNDNESS).mul(float(1).sub(inTrunk)), radial.y));
    const crown = mix(leaf.mul(vec3(float(1).add(tree.hue), 1, float(1).sub(tree.hue))), colour("tree-snow"), snowHeld.mul(snowOnFace(flatNormal().y)));
    const natural = mix(bark, crown, leafy);
    // Birch and broadleaf let the sun through; conifers don't.
    const seeThrough = select(isBroadleaf(kindHere), leafy, float(0));
    const selfShade = mix(mix(float(CROWN_BASE_LIGHT), float(CROWN_TOP_LIGHT), shape.z), float(TRUNK_LIGHT), inTrunk).mul(mix(float(TUCKED_LIGHT), float(1), shape.w));
    const light = foliageLight(toSun, rounded, seeThrough).mul(tree.ownShade(selfShade)).mul(tree.brightness);
    add(name, geometry, draw, material, tree, natural, light);
  };

  /** A crown point of a bare tree (across as a share of the crown's width, its ring, across) placed on this tree, with an offset as a share of its height on top. */
  const placeBare = (tree: Tree, point: Node<"vec3">, offset: Node<"vec3">) => {
    const ring = point.y.toVar();
    const lower = floor(ring).clamp(0, NEAR_RINGS - 2).toVar();
    const shape = mix(tree.ringOf(nearShapes, NEAR_RINGS, lower), tree.ringOf(nearShapes, NEAR_RINGS, lower.add(1)), ring.sub(lower)).toVar();
    const rise = shape.x;
    const across = tree.turn(point.xz).mul(shape.y).mul(tree.spread).add(tree.turn(offset.xz)).add(tree.growing.zw.mul(rise).mul(rise)).mul(tree.height);
    return { position: vec3(tree.place.x.add(across.x), tree.standing.y.add(rise.add(offset.y).mul(tree.height)), tree.place.y.add(across.y)), shape };
  };
  const bareRows = (model: BareModel, table: StorageBufferAttribute, tree: Tree) => {
    const rows = storage(table, "vec4", table.count).toReadOnly();
    const slot = tree.kind.sub(FIRST_BARE_KIND).mul(model.vertices).add(attribute<"vec3">("position", "vec3").x).mul(ROWS_A_VERTEX).toVar();
    return [rows.element(uint(slot)), rows.element(uint(slot.add(1)))] as const;
  };

  const branchModel = () => {
    const tree = treeOf(lists.branches, nearRows);
    const [crownPoint, offset] = bareRows(BRANCHES, branchTable, tree);
    const { position, shape } = placeBare(tree, crownPoint.xyz, offset.xyz);
    const material = new MeshBasicNodeMaterial();
    material.name = "forest-branches";
    material.positionNode = position;
    // Lit as a trunk is, each branch round its own length: its sides' way out, or the trunk's.
    const out = select(offset.xyz.length().greaterThan(1e-6), vec3(tree.turn(offset.xz).x, offset.y, tree.turn(offset.xz).y), vec3(tree.turn(crownPoint.xz).x, 0, tree.turn(crownPoint.xz).y));
    const rounded = varying(out);
    const thin = varying(offset.w);
    const twig = varying(select(crownPoint.w.greaterThan(PART_TWIG - 0.5), float(1), float(0)));
    // A birch's limbs are white as its trunk, its finest branches dark purple-brown; other bark darkens to the twigs' too.
    const wood = mix(barkOf(varying(tree.kind), varying(shape.x)), colour("tree-twig"), smoothstep(float(0.45), float(1), thin).max(twig.mul(0.6)));
    const snow = varying(tree.snowHeld.mul(TWIG_SNOW * 2)).mul(snowOnFace(flatNormal().y)).mul(float(1).sub(thin.mul(0.5)));
    const natural = mix(wood, colour("tree-snow"), snow.clamp(0, 1));
    const light = foliageLight(toSun, rounded, float(0)).mul(tree.ownShade(float(TRUNK_LIGHT))).mul(tree.brightness);
    add("branches", branchShape, BRANCH_DRAW, material, tree, natural, light);
  };

  const clumpModel = () => {
    const tree = treeOf(lists.clumps, nearRows);
    const [corner, middle] = bareRows(CLUMPS, clumpTable, tree);
    // The clumps grow out of the leafy crown as the first leaves go, then each falls at its own share of the tree's leaves, shrinking to its middle; in spring the same runs backwards.
    const size = clumpSizeOf(tree.season.share, fract(corner.w.add(tree.treeRoll.mul(0.37))));
    const point = mix(middle.xyz, corner.xyz, size).toVar();
    const { position, shape } = placeBare(tree, point, vec3(0));
    const material = new MeshBasicNodeMaterial();
    material.name = "forest-clumps";
    material.positionNode = position;
    const outward = tree.turn(point.xz.div(0.6));
    const rounded = varying(vec3(outward.x, shape.z.sub(CROWN_MIDDLE).mul(ROUNDNESS), outward.y));
    const leaf = varying(leafColourOf(tree));
    const natural = leaf.mul(vec3(float(1).add(tree.hue), 1, float(1).sub(tree.hue)));
    const tucked = smoothstep(float(0.15), float(0.55), middle.xz.length());
    const selfShade = mix(float(CROWN_BASE_LIGHT), float(CROWN_TOP_LIGHT), shape.z).mul(mix(float(TUCKED_LIGHT), float(1), tucked));
    const light = foliageLight(toSun, rounded, float(1)).mul(tree.ownShade(selfShade)).mul(tree.brightness);
    add("clumps", clumpShape, CLUMP_DRAW, material, tree, natural, light);
  };

  /** The fine twigs no triangle could draw: the crown's outline, faintly see-through, fainter where a crown is thin at its edges and denser far off as the branches go below a pixel. */
  const hazeModel = (geometry: BufferGeometry, list: StorageBufferAttribute, rows: number, draw: number, shapes: StorageBufferAttribute, rings: number, far: boolean) => {
    const tree = treeOf(list, rows);
    const unit = attribute<"vec3">("position", "vec3");
    // A near crown's trunk rings fold to its base, so the haze is the crown alone.
    const ring = far ? unit.y : unit.y.max(TRUNK_RINGS);
    const shape = tree.ringOf(shapes, rings, ring).toVar();
    const rise = shape.x;
    const filling = smoothstep(knobs.fullReach.add(THINNING[0]), knobs.fullReach.add(bandEnd(THINNING)), tree.place.sub(cameraSpot).length());
    const fill = far ? mix(float(1), sqrt(float(1).div(knobs.farDensity)), filling).mul(CONE_FILL) : float(1);
    const inCrown = far ? float(1) : select(unit.y.greaterThan(TRUNK_RINGS - 0.5), float(1), float(0));
    const radial = tree.turn(unit.xz);
    const across = radial.mul(shape.y).mul(fill).mul(tree.spread).mul(HAZE_SPREAD).mul(inCrown).add(tree.growing.zw.mul(rise).mul(rise)).mul(tree.height);
    const material = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
    material.name = far ? "forest-haze-far" : "forest-haze";
    material.positionNode = vec3(tree.place.x.add(across.x), tree.standing.y.add(rise.mul(tree.height)), tree.place.y.add(across.y));
    const rounded = varying(vec3(radial.x, shape.z.sub(CROWN_MIDDLE).mul(ROUNDNESS), radial.y));
    const natural = mix(colour("tree-twig"), colour("tree-snow"), varying(tree.snowHeld.mul(HAZE_SNOW)));
    const selfShade = mix(float(CROWN_BASE_LIGHT), float(CROWN_TOP_LIGHT), shape.z).mul(HAZE_LIGHT);
    const light = foliageLight(toSun, rounded, float(0)).mul(tree.ownShade(selfShade)).mul(tree.brightness);
    const density = BARE_KINDS.slice(1).reduce((picked, kind) => select(tree.kind.equal(kindAt(kind)), float(TWIG_DENSITY[kind]), picked), float(TWIG_DENSITY.birch) as Node<"float">);
    const bareness = varying(float(1).sub(tree.season.share).mul(density));
    const fromCamera = positionWorld.sub(cameraPosition);
    const thickness = smoothstep(float(0), float(HAZE_EDGE), abs(dot(normalize(rounded), normalize(fromCamera))));
    const byDistance = hazeByDistance(fromCamera.length());
    material.opacityNode = bareness.mul(byDistance).mul(thickness);
    add("haze", geometry, draw, material, tree, natural, light);
  };

  crownModel("turned", turnedShape, lists.turned, nearRows, TURNED_DRAW, nearShapes, NEAR_RINGS);
  crownModel("cone", coneShape, lists.cone, farRows, CONE_DRAW, farShapes, FAR_RINGS);
  branchModel();
  clumpModel();
  hazeModel(hazeShape, lists.haze, nearRows, HAZE_DRAW, nearShapes, NEAR_RINGS, false);
  hazeModel(farHazeShape, lists.farHaze, farRows, FAR_HAZE_DRAW, farShapes, FAR_RINGS, true);

  const aim = (spot: Vector3) => {
    const rings = Math.ceil(knobs.get().forestReachM / NEAR_STEP_M) + 1;
    centre.value.set(Math.floor(spot.x / NEAR_STEP_M), Math.floor(spot.z / NEAR_STEP_M));
    cameraSpot.value.set(spot.x, spot.z);
    cull.dispatchSize = [Math.ceil(spiralPlaces(rings) / PLACES_A_GROUP), 1, 1];
  };

  aim(new Vector3());

  let counts: ForestDrawn = { turned: 0, cone: 0, branches: 0, clumps: 0, haze: 0, triangles: 0 };
  let reading = false;
  return {
    update(spot, camera) {
      aim(spot);
      view.update(camera);
      void renderer.compute([reset, cull]);
    },
    async compile() {
      await renderer.computeAsync([reset, cull]);
    },
    show(shown, visible) {
      for (const { model: entry, mesh } of meshes) {
        if (entry === shown) mesh.visible = visible;
      }
    },
    drawn() {
      if (!reading) {
        reading = true;
        void renderer.getArrayBufferAsync(draws).then((bytes) => {
          const read = new Uint32Array(bytes as ArrayBuffer);
          const trees = (draw: number) => read[draw + TREES_AT];
          counts = {
            turned: trees(TURNED_DRAW),
            cone: trees(CONE_DRAW),
            branches: trees(BRANCH_DRAW),
            clumps: trees(CLUMP_DRAW),
            haze: trees(HAZE_DRAW) + trees(FAR_HAZE_DRAW),
            triangles: shapeOfDraw.reduce((sum, [draw, shape]) => sum + (trees(draw) * indicesOf(shape)) / 3, 0),
          };
          reading = false;
        });
      }
      return counts;
    },
    dispose() {
      for (const { mesh } of meshes) {
        scene.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as MeshBasicNodeMaterial).dispose();
      }
      reset.dispose();
      cull.dispose();
      draws.dispose();
      for (const list of Object.values(lists)) list.dispose();
      nearShapes.dispose();
      farShapes.dispose();
      branchTable.dispose();
      clumpTable.dispose();
    },
  };
}

/** Picks a kind's colour, from the kind as a float. */
function ofKind(colours: Record<TreeKind, Node<"vec3">>, which: Node<"float">): Node<"vec3"> {
  return TREE_KINDS.slice(1).reduce((picked, other, at) => select(which.greaterThan(at + 0.5), colours[other], picked), colours.spruce);
}
