import { BufferAttribute, BufferGeometry, DoubleSide, IndirectStorageBufferAttribute, Mesh, MeshBasicNodeMaterial, StorageBufferAttribute, Vector2, Vector3, type Node, type PerspectiveCamera, type Scene, type WebGPURenderer } from "three/webgpu";
import { atomicAdd, atomicStore, attribute, cos, dot, float, floor, Fn, fract, If, instanceIndex, min, mix, screenCoordinate, select, sin, smoothstep, sqrt, storage, uint, uniform, varying, vec2, vec3, vec4 } from "three/tsl";
import { outsideCar } from "../art/car-volume";
import { seedOf, unitOf } from "../art/hash";
import { CLEARING_SLACK_M, HEIGHT_RANGE, HEIGHT_ROLL, JITTER, JITTER_ROLLS, NEAR_STEP_M, ROAD_COVERAGE, ROAD_LOOK_M, SHORTEST_M, STAND_ROLL } from "./tree-place";
import { CONE_FILL, CROWN_REACH, CROWN_SPREAD, FAR_RINGS, FAR_TABLE, GNARL, LEAN, NEAR_RINGS, NEAR_TABLE, RING_VALUES, ROCK_LEAN, ROCK_REACH, ROCK_ROW, STAGES, SWELL, TREE_KINDS, TRUNK_RINGS, WIND_WAY, type TreeKind } from "./tree-shapes";
import { foliageLight, towardsSun } from "./foliage-light";
import { viewSides } from "./view-sides";

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
 * tree can stay to the forest's reach.
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

/** A stand for a scene with no tile: Åland's own mix of pine, spruce and birch, at every place. */
const ANY_STAND = vec4(0.6, 0.15, 0.13, 1);

const NEAR_SIDES = 5;
const FAR_SIDES = 3;

/** A spun outline: per vertex only its ring and its way round, the table saying where a ring goes. A pointed one starts from a point, as a far crown does. */
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
  sun: { azimuthDeg: number; elevationDeg: number };
  /** The forest lab's colours in place of a tree's own. The game passes none, and its shaders hold none of this. */
  paint?: (tree: PaintedTree) => Node<"vec3">;
}

export type ForestModel = "turned" | "cone";

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

export function createForest(scene: Scene, renderer: WebGPURenderer, { knobs, canopyAt, standsAt = () => ANY_STAND, groundAt, roads, clearanceAt, colour, hazed, sun, paint }: ForestInputs): Forest {
  const cameraSpot = uniform(new Vector2());
  const anchor = uniform(new Vector2());
  const placesAcross = uniform(1, "uint");
  const view = viewSides(WORLD_HEIGHTS_M, WIDEST_CROWN_M);
  const { sides } = view;
  const toSun = towardsSun(sun);
  // Interleaved gradient noise: a fixed pattern on the screen, with no clumps for a crossfade to show as.
  const pattern = fract(fract(dot(screenCoordinate.xy, vec2(0.06711056, 0.00583715))).mul(52.9829189));

  const turnedShape = turned(NEAR_RINGS, NEAR_SIDES, false);
  const coneShape = turned(FAR_RINGS, FAR_SIDES, true);
  const indicesOf = (shape: BufferGeometry) => shape.getIndex()?.count ?? 0;
  const draws = new IndirectStorageBufferAttribute(Uint32Array.from([indicesOf(turnedShape), 0, 0, 0, 0, indicesOf(coneShape), 0, 0, 0, 0]), 5);
  const counters = storage(draws, "uint", draws.array.length).toAtomic();
  const turnedRows = placesWithin(FOREST_MOST.fullReachM + bandEnd(HANDOVER)) * ROWS_A_TREE;
  const coneRows = placesWithin(FOREST_MOST.forestReachM) * ROWS_A_TREE;
  const nearShapes = new StorageBufferAttribute(NEAR_TABLE, RING_VALUES);
  const farShapes = new StorageBufferAttribute(FAR_TABLE, RING_VALUES);
  const turnedList = new StorageBufferAttribute(turnedRows, 4);
  const coneList = new StorageBufferAttribute(coneRows, 4);

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
    atomicStore(counters.element(TURNED_DRAW + TREES_AT), uint(0));
    atomicStore(counters.element(CONE_DRAW + TREES_AT), uint(0));
  })().compute(1);

  const writeTurned = storage(turnedList, "vec4", turnedRows);
  const writeCone = storage(coneList, "vec4", coneRows);
  const cull = Fn(() => {
    const cell = vec2(instanceIndex.mod(placesAcross), instanceIndex.div(placesAcross)).add(anchor).toVar();
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

            const list = (rows: typeof writeTurned, draw: number, from: Node<"float">, to: Node<"float">) => {
              const row = atomicAdd(counters.element(draw + TREES_AT), uint(1)).mul(ROWS_A_TREE).toVar();
              rows.element(row).assign(standing);
              rows.element(row.add(1)).assign(vec4(yaw, look, from, to));
              rows.element(row.add(2)).assign(growing);
            };
            If(turnedTo.greaterThan(0), () => list(writeTurned, TURNED_DRAW, float(0), turnedTo));
            If(coneTo.greaterThan(turnedShare), () => list(writeCone, CONE_DRAW, turnedShare, coneTo));
          });
        });
      });
    });
  })().computeKernel([PLACES_A_GROUP]);

  const meshes: { model: ForestModel; mesh: Mesh }[] = [];
  const model = (name: ForestModel, geometry: BufferGeometry, list: StorageBufferAttribute, rows: number, draw: number, shapes: StorageBufferAttribute, rings: number) => {
    geometry.setIndirect(draws, draw * Uint32Array.BYTES_PER_ELEMENT);
    const trees = storage(list, "vec4", rows).toReadOnly();
    const standing = trees.element(instanceIndex.mul(ROWS_A_TREE)).toVar();
    const carried = trees.element(instanceIndex.mul(ROWS_A_TREE).add(1)).toVar();
    const place = standing.xz;
    const height = standing.w;
    const growing = trees.element(instanceIndex.mul(ROWS_A_TREE).add(2)).toVar();
    const kind = floor(carried.y).toVar();
    const packed = fract(carried.y).mul(ROLL_STEPS).toVar();
    const treeRoll = floor(packed).div(ROLL_STEPS - 1).toVar();
    const among = fract(packed).sub((1 - AMONG_KEPT) / 2).div(AMONG_KEPT).clamp(0, 1);
    const rocky = growing.y;

    const yaw = carried.x;
    const unit = attribute<"vec3">("position", "vec3");
    const radial = vec2(unit.x.mul(cos(yaw)).sub(unit.z.mul(sin(yaw))), unit.x.mul(sin(yaw)).add(unit.z.mul(cos(yaw))));
    const table = storage(shapes, "vec4", shapes.count).toReadOnly();
    const shapeAt = (row: Node<"float">) => table.element(uint(row.mul(rings).add(unit.y)));
    const stageRow = kind.mul(STAGES).add(floor(growing.x)).toVar();
    const shape = mix(mix(shapeAt(stageRow), shapeAt(stageRow.add(1)), fract(growing.x)), shapeAt(float(ROCK_ROW)), rocky).toVar();
    const rise = shape.x;
    // Those left past the thinning fill out to cover for the rest, so the forest keeps its weight.
    const filling = smoothstep(knobs.fullReach.add(THINNING[0]), knobs.fullReach.add(bandEnd(THINNING)), place.sub(cameraSpot).length());
    const fill = name === "cone" ? mix(float(1), sqrt(float(1).div(knobs.farDensity)), filling).mul(CONE_FILL) : float(1);
    const width = shape.y.mul(fill).mul(treeRoll.sub(0.5).mul(2 * CROWN_SPREAD).add(1));
    // A rock pine's rings wander from straight, each its own way, though its foot stays where it grew.
    const wander = vec2(sin(unit.y.mul(2.1).add(yaw)), cos(unit.y.mul(1.3).add(yaw.mul(2)))).mul(rocky).mul(GNARL).mul(smoothstep(float(0), float(0.3), rise));
    const across = radial.mul(width).add(growing.zw.mul(rise).mul(rise)).add(wander).mul(height);
    const material = new MeshBasicNodeMaterial();
    material.positionNode = vec3(place.x.add(across.x), standing.y.add(rise.mul(height)), place.y.add(across.y));

    const live = varying(carried.zw);
    const kindHere = varying(kind);
    const ofKind = (colours: Record<TreeKind, Node<"vec3">>) => TREE_KINDS.slice(1).reduce((picked, other, at) => select(kindHere.greaterThan(at + 0.5), colours[other], picked), colours.spruce);
    // Sharp at once, or a crown's underside takes the colour of the trunk it spreads from.
    const leafy = name === "cone" ? float(1) : smoothstep(float(0), float(0.08), varying(unit.y.sub(TRUNK_RINGS - 1).clamp(0, 1)));
    const leaf = ofKind({ spruce: colour("tree-spruce"), pine: colour("tree-pine"), birch: colour("tree-birch"), round: colour("tree-round"), upright: colour("tree-upright") });
    const riseHere = varying(rise);
    // A pine's bark turns from grey-brown to fox red up its trunk, and a birch's is dark at the foot.
    const pineBark = mix(colour("tree-bark"), colour("tree-pine-bark"), smoothstep(float(0.08), float(0.34), riseHere));
    const birchBark = mix(colour("tree-bark"), colour("tree-birch-bark"), smoothstep(float(0.03), float(0.1), riseHere));
    const bark = ofKind({ spruce: colour("tree-bark"), pine: pineBark, birch: birchBark, round: colour("tree-round-bark"), upright: colour("tree-upright-bark") });
    const hue = varying(fract(treeRoll.mul(7.31)).sub(0.5).mul(2 * HUE_ROLL));
    const natural = mix(bark, leaf.mul(vec3(float(1).add(hue), 1, float(1).sub(hue))), leafy);
    const inTrunk = name === "cone" ? float(0) : select(unit.y.lessThan(TRUNK_RINGS - 0.5), float(1), float(0));
    const rounded = varying(vec3(radial.x, shape.z.sub(CROWN_MIDDLE).mul(ROUNDNESS).mul(float(1).sub(inTrunk)), radial.y));
    // Birch and broadleaf let the sun through; conifers don't.
    const seeThrough = select(kindHere.greaterThan(kindAt("birch").sub(0.5)), leafy, float(0));
    const selfShade = mix(mix(float(CROWN_BASE_LIGHT), float(CROWN_TOP_LIGHT), shape.z), float(TRUNK_LIGHT), inTrunk).mul(mix(float(TUCKED_LIGHT), float(1), shape.w));
    const ownShade = varying(mix(float(1), selfShade, mix(float(ALONE_SHADE), float(1), among)));
    const shaded = foliageLight(toSun, rounded, seeThrough).mul(ownShade).mul(varying(mix(float(BRIGHTNESS_ROLL[0]), float(BRIGHTNESS_ROLL[1]), treeRoll)));
    const painted = paint ? paint({ model: name, natural, changing: live.x.greaterThan(0).or(live.y.lessThan(1)), groundGap: varying(groundAt(1, place).sub(groundAt(2, place)).abs()) }) : natural;
    material.colorNode = hazed(painted.mul(shaded));
    material.maskNode = pattern.greaterThanEqual(live.x).and(pattern.lessThan(live.y)).and(outsideCar());
    material.side = DoubleSide;
    const mesh = new Mesh(geometry, material);
    mesh.frustumCulled = false;
    scene.add(mesh);
    meshes.push({ model: name, mesh });
  };
  model("turned", turnedShape, turnedList, turnedRows, TURNED_DRAW, nearShapes, NEAR_RINGS);
  model("cone", coneShape, coneList, coneRows, CONE_DRAW, farShapes, FAR_RINGS);

  const aim = (spot: Vector3) => {
    const across = Math.ceil((2 * knobs.get().forestReachM) / NEAR_STEP_M) + 2;
    placesAcross.value = across;
    anchor.value.set(Math.floor(spot.x / NEAR_STEP_M) - across / 2, Math.floor(spot.z / NEAR_STEP_M) - across / 2);
    cameraSpot.value.set(spot.x, spot.z);
    cull.dispatchSize = [Math.ceil((across * across) / PLACES_A_GROUP), 1, 1];
  };

  aim(new Vector3());

  let counts: ForestDrawn = { turned: 0, cone: 0, triangles: 0 };
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
          const [turnedTrees, coneTrees] = [read[TURNED_DRAW + TREES_AT], read[CONE_DRAW + TREES_AT]];
          counts = { turned: turnedTrees, cone: coneTrees, triangles: (turnedTrees * indicesOf(turnedShape) + coneTrees * indicesOf(coneShape)) / 3 };
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
      turnedList.dispose();
      coneList.dispose();
      nearShapes.dispose();
      farShapes.dispose();
    },
  };
}
