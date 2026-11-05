import { DoubleSide, MeshBasicNodeMaterial, type Node, type PerspectiveCamera, type Scene, type Vector3, type WebGPURenderer } from "three/webgpu";
import { attribute, cos, dot, float, floor, fract, If, int, min, mix, positionGeometry, round, screenCoordinate, select, sin, smoothstep, uniform, uniformArray, varying, vec2, vec3, vec4 } from "three/tsl";
import { outsideCar } from "../art/car-volume";
import { placeSeed, unitOf } from "../art/hash";
import { changeOf, seasonNodes, type SeasonLook } from "../art/season";
import { STREET_PARTS, streetPaint, streetPalette } from "../art/street";
import { MOTION_RANGE_M } from "../art/street/paint";
import { buildGrassTuft, buildSeedGrass, buildWildflowers } from "../art/street/verge";
import type { RoadsideModel } from "../art/roadside/models";
import { groundFloor, groundKinds } from "../art/surfaces";
import type { LandAt } from "./tile-reads";
import { clearOfBuildings, createPlanting, placesWithin, reachOf, roll, spreadOf, type Lattice } from "./planting";
import { STONE_WALL_HALF_WIDE_M } from "./tile-walls";
import type { WallDistance } from "./wall-clearing";

/*
 * The grass and flowers of the verges, with no list of tufts anywhere, as the forest
 * has no list of trees: a tuft is a place on a lattice of the world, and what stands
 * there comes from the images a tile already has. So nothing is stored or streamed
 * for one, no tile changes, and it costs the same however much road there is.
 *
 * It's a planting (`planting.ts`): each frame a pass goes through the places within
 * reach and keeps those beside a road, on dry ground that isn't paving, rock or a town's mown ground,
 * cheapest test first. Survivors go into a list for each model near the camera, and past its
 * swap into a list of that model's own far version: both as the kit draws them, at the swap the
 * LOD check measured for them (`art/lod-swaps.ts`), so what the check passed is what the game
 * draws. They trade pixels over a band. A tuft takes the colour and the baked shade of the ground it
 * stands on, and more of it with distance, which is what makes the grass and the
 * photo one thing.
 *
 * As the forest's trees, a tuft never changes size: it's there from the moment it
 * can be seen until the car has passed it. Two lattices hold them, a fine one near and
 * a sparse one far out, and each ends by its tufts dissolving, one at a time at a
 * distance of its own, where a tuft is a few pixels.
 */

const WIDEST_TUFT_M = 2;

const LATTICES: Lattice[] = [
  { stepM: 0.5, ends: [120, 190, 25], salt: 0 },
  { stepM: 1.5, ends: [380, 470, 30], salt: 517.3 },
];
/** The farthest any of its plants stands from the camera. */
const REACH_M = Math.max(...LATTICES.map(reachOf));
const SWAP_BAND = 0.12;

/** The mask's level that says a road is near, and how much of one fades the verge in. At 16 m it reaches about 20 m from a carriageway. */
const NEAR_ROAD_MIP = 2;
const NEAR_ROAD = [0.005, 0.12] as const;
/** The mask's own 4 m level, read between pixels: under this share of road is clear of the carriageway. */
const ON_ROAD = [0.12, 0.4] as const;
const ROAD_LOOK_M = 4;
const MOST_OF_A_PLACE = 0.75;
const ROADSIDE_THICKEST = 0.75;
const LEAST_DRY = 0.9;
/** How much of a whole patch reads as stone before it's paving or rock, not a pale verge. */
const PAVED = [0.55, 0.95] as const;

const STAND_M = 17;
const FLOWER_SHARE = 0.16;
/** Of this many stands, one in each kind of flower and the rest plain grass. */
const STANDS = 15;
const SEED_SHARE = 0.25;
const SIZES = [0.8, 1.35] as const;
/** How much wider than the kit's a tuft spreads, so a few cover the ground. */
const WIDE = 1.35;

/** How much of a blade is the ground's own colour, near. */
const GROUND_SHARE = 0.25;
/** A tuft turns from its own colour towards its ground's between these. */
const MATCHES = [140, 420] as const;
const FOOT_SHADE = 0.6;
const FOOT_M = 0.45;
const FIRST_PETAL = STREET_PARTS.indexOf("petal-white");
const WIND_SPEED = 1.25;
const WIND_WAVES = 0.8;
const SINK_M = 0.04;

/*
 * Through the year (Reference, Leaves): the grass goes to straw as the leaves come down and greens again in the last
 * days of April, tuft by tuft; a flower blooms from leaf-out until the leaves turn, its heads folding away outside that;
 * fallen leaves lie at the tufts' feet; and deep snow buries a tuft, each at a depth of its own, since snow lays
 * grass flat long before it's as deep as the grass is tall. Near and far versions both wear the kit's paint, so one
 * rule serves both.
 */
const STRAW_ROLL = 31;
const BLOOM_ROLL = 32;
const LITTER_ROLL = 33;
const BURIED_ROLL = 34;
/** A tuft goes to straw once this share of the broadleaves or more is bare, by its roll. */
const STRAWS_FROM = 0.55;
const STRAW_SHARE = 0.85;
/** A flower's bloom, by its roll, against the share in leaf and not yet turned. */
const BLOOMS: [number, number] = [0.15, 0.85];
/** Fallen leaves at a tuft's foot, up to this high, and how much of it they cover. */
const LITTER_M = 0.3;
const LITTER_SHARE = 0.75;
/** The snow's depth that buries a tuft, from the first to the last. */
const BURIED_CM: [number, number] = [3, 24];

/** A tuft in a list is three rows of four floats. */
const ROWS = 3;

interface Kind {
  model: RoadsideModel;
  /** The most of the places within reach this kind can be: of `STANDS`, one in each flower, and in those `FLOWER_SHARE` of tufts. */
  most: number;
}

/** The verge's models, every one of which the LOD check measures. */
export const vergeKinds = (): Kind[] => [
  { model: buildGrassTuft(), most: 1 },
  { model: buildSeedGrass(), most: 0.4 },
  ...(["daisy", "buttercup", "cow-parsley", "lupine", "fireweed"] as const).map((kind) => ({ model: buildWildflowers(kind), most: 0.08 })),
];

export interface VergeInputs {
  landAt: LandAt;
  pavedAt: (place: Node<"vec2">) => Node<"float">;
  roadsAt: (place: Node<"vec2">, mip: number) => Node<"float">;
  /** How much of a place is boulder field: stones, where no verge grows. */
  fieldsAt: (place: Node<"vec2">) => Node<"float">;
  groundAt: (place: Node<"vec2">) => Node<"float">;
  /** Metres from the drawn waterline, out into the water and below zero on land, at a place no farther than `reachM` from the camera. */
  shoreAt: (place: Node<"vec2">, reachM: number) => Node<"float">;
  /** Metres from the nearest stone wall's line, for no tuft to stand up through one. */
  wallDistanceAt: WallDistance;
  /** Metres from a place to the nearest building (`pipeline/clearing.py`): a plant stands only where its whole spread clears it. */
  clearanceAt: (place: Node<"vec2">) => Node<"float">;
  /** The ground's baked shade as the light on it. */
  lightOf: (shade: Node<"float">) => Node<"float">;
  linear: (name: string) => Vector3;
  hazed: (color: Node<"vec3">) => Node<"vec3">;
  litterColour: Node<"vec3">;
  tileM: number;
  /** The season the grass, flowers and fallen leaves follow; summer if none. */
  season?: SeasonLook;
}

export interface VergeDrawn {
  near: number;
  far: number;
  triangles: number;
}

export interface Verge {
  update: (spot: Vector3, camera: PerspectiveCamera, seconds: number) => void;
  /** Builds the compute pipelines, which would otherwise stall the first frame that uses them. */
  compile: () => Promise<void>;
  show: (shown: boolean) => void;
  drawn: () => VergeDrawn;
  dispose: () => void;
}

export function createVerge(scene: Scene, renderer: WebGPURenderer, { landAt, pavedAt, roadsAt, fieldsAt, groundAt, shoreAt, wallDistanceAt, clearanceAt, lightOf, linear, hazed, litterColour, tileM, season }: VergeInputs): Verge {
  const kinds = vergeKinds();
  const flowers = kinds.length - 2;
  const farOf = ({ far }: RoadsideModel) => {
    if (far === null) throw new Error("A verge kit model has no far version");
    return far;
  };

  const seconds = uniform(0);
  const pattern = fract(fract(dot(screenCoordinate.xy, vec2(0.06711056, 0.00583715))).mul(52.9829189));

  const far = LATTICES.reduce((sum, lattice) => sum + placesWithin(reachOf(lattice), lattice.stepM), 0);
  // A model's swap is for its own size, and a tuft is drawn at its size and spread wider: its change on screen grows with both.
  const nearOf = ({ swapM }: RoadsideModel) => LATTICES.reduce((sum, { stepM }) => sum + placesWithin(swapM * SIZES[1] * WIDE * (1 + SWAP_BAND) + 1, stepM), 0);

  const swapOf = uniformArray(kinds.map(({ model }) => model.swapM), "float");
  const spreadOfKind = uniformArray(kinds.map(({ model }) => spreadOf(model.near) * WIDE), "float");
  const palette = streetPalette(linear);
  const paint = streetPaint(palette);
  const seasons = seasonNodes(season);
  const straw = vec3(linear("autumn-straw"));
  const fallenLeaves = vec3(linear("autumn-litter"));

  const planting = createPlanting(scene, renderer, {
    lattices: LATTICES,
    widestM: WIDEST_TUFT_M,
    shapes: [...kinds.map(({ model }) => farOf(model)), ...kinds.map(({ model }) => model.near)],
    capacities: [...kinds.map(({ most }) => Math.ceil(far * most)), ...kinds.map(({ model }) => nearOf(model))],
    rows: ROWS,
    visit({ seed, place, distance, seenOn, left, write }) {
      const chance = roll(seed, 4).toVar();
      If(chance.lessThan(MOST_OF_A_PLACE), () => {
        // A neighbour's roads aren't in a tile's own mask.
        const inTile = fract(place.div(tileM)).mul(tileM).toVar();
        const over = (spot: Node<"float">) => select(spot.lessThan(ROAD_LOOK_M), float(-ROAD_LOOK_M), select(spot.greaterThan(tileM - ROAD_LOOK_M), float(ROAD_LOOK_M), float(0)));
        const lookOver = place.add(vec2(over(inTile.x), over(inTile.y))).toVar();
        const roadsAround = (mip: number) => roadsAt(place, mip).max(roadsAt(lookOver, mip));

        const nearRoad = smoothstep(float(NEAR_ROAD[0]), float(NEAR_ROAD[1]), roadsAround(NEAR_ROAD_MIP)).toVar();
        const turn = chance.div(nearRoad.mul(ROADSIDE_THICKEST).max(0.001)).toVar();
        If(turn.lessThan(1), () => {
          const clear = float(1).sub(smoothstep(float(ON_ROAD[0]), float(ON_ROAD[1]), roadsAround(0))).toVar();
          const land = landAt(place);
          const { stoneShare } = groundKinds(land.wide.pow(vec3(2.2)));
          If(clear.greaterThan(roll(seed, 5)).and(land.dry.greaterThan(LEAST_DRY)).and(smoothstep(float(PAVED[0]), float(PAVED[1]), stoneShare).lessThan(roll(seed, 6))).and(shoreAt(place, REACH_M).lessThanEqual(0)).and(fieldsAt(place).lessThan(roll(seed, 7))).and(pavedAt(place).lessThan(0.5)), () => {
            const ground = groundAt(place).toVar();
            If(seenOn(ground), () => {
              const stand = roll(floor(place.div(STAND_M)), 18).mul(STANDS).floor().toVar();
              const isFlower = stand.lessThan(flowers).and(roll(seed, 8).lessThan(FLOWER_SHARE));
              const kind = select(isFlower, stand.add(2), select(roll(seed, 9).lessThan(SEED_SHARE), float(1), float(0))).toVar();
              // Thinner towards the edge of a verge, by the place and never by the distance.
              const size = mix(float(SIZES[0]), float(SIZES[1]), roll(seed, 10)).mul(float(1).sub(smoothstep(float(0.75), float(1), turn))).toVar();
              const swapM = (swapOf.element(int(round(kind))) as unknown as Node<"float">).mul(size).mul(WIDE);
              const swap = smoothstep(swapM.mul(1 - SWAP_BAND), swapM.mul(1 + SWAP_BAND), distance).toVar();
              const spread = size.mul(spreadOfKind.element(int(round(kind))) as unknown as Node<"float">).toVar();
              const clearOfWalls = wallDistanceAt(place).greaterThan(spread.add(STONE_WALL_HALF_WIDE_M)).and(clearOfBuildings(clearanceAt, place, spread));
              const remaining = left().toVar();
              const standing = vec4(place.x, ground.sub(SINK_M), place.y, roll(seed, 11).mul(6.283)).toVar();
              const photo = land.broad.pow(vec3(2.2)).toVar();
              const colour = vec4(groundFloor(photo, litterColour, groundKinds(photo)), lightOf(land.shade)).toVar();

              kinds.forEach((_, index) => {
                If(kind.equal(index), () => {
                  If(clearOfWalls.and(swap.greaterThan(0)).and(remaining.greaterThan(0)), () => {
                    write(index, [standing, colour, vec4(size, float(1).sub(swap), remaining, 0)]);
                  });
                  If(clearOfWalls.and(swap.lessThan(1)), () => {
                    write(kinds.length + index, [standing, colour, vec4(size, float(0), float(1).sub(swap), 0)]);
                  });
                });
              });
            });
          });
        });
      });
    },
    materialOf(index, [standing, colour, carried], camera) {
      const tint = attribute<"vec4">("tint", "vec4");
      const size = carried.x;
      const part = round(tint.r.mul(255));
      const isPetal = part.greaterThanEqual(FIRST_PETAL);
      const isFar = index < kinds.length;
      const local = positionGeometry;
      const phase = rollPhase(standing.xz).add(seconds.mul(WIND_SPEED)).add(local.x.mul(-WIND_WAVES));
      const sway = tint.b.mul(MOTION_RANGE_M).mul(sin(phase));
      const z = local.z.add(sway);
      const [yawCos, yawSin] = [cos(standing.w), sin(standing.w)];
      const material = new MeshBasicNodeMaterial();
      const tuftRoll = (salt: number) => unitOf(placeSeed(standing.xz), salt);
      const buried = select(seasons.snowDepthCm.greaterThan(mix(float(BURIED_CM[0]), float(BURIED_CM[1]), tuftRoll(BURIED_ROLL))), float(0), float(1));
      const bloom = changeOf(seasons.leafed.mul(float(1).sub(seasons.turned)), mix(float(BLOOMS[0]), float(BLOOMS[1]), tuftRoll(BLOOM_ROLL)));
      // Out of bloom a flower's heads fold to nothing at its foot, leaving its leaves.
      const shown = select(isPetal, bloom, float(1)).mul(buried);
      const wide = size.mul(WIDE).mul(shown);
      material.positionNode = vec3(standing.x.add(local.x.mul(yawCos).add(z.mul(yawSin)).mul(wide)), standing.y.add(local.y.mul(size).mul(shown)), standing.z.add(z.mul(yawCos).sub(local.x.mul(yawSin)).mul(wide)));
      // It browns as the leaves come down, and greens as the trees lose their autumn colour, before they leaf out.
      const strawRoll = tuftRoll(STRAW_ROLL);
      const strawed = min(changeOf(float(1).sub(seasons.leafed), mix(float(STRAWS_FROM), float(1), strawRoll)), changeOf(seasons.turned, strawRoll)).mul(STRAW_SHARE);
      const littered = changeOf(seasons.fallen, tuftRoll(LITTER_ROLL)).mul(float(1).sub(smoothstep(float(0), float(LITTER_M), local.y.mul(size)))).mul(LITTER_SHARE);
      const painted = select(isPetal, paint, mix(mix(paint, straw.mul(tint.g.mul(255 / 128)), strawed), fallenLeaves, littered));

      const matched = smoothstep(float(MATCHES[0]), float(MATCHES[1]), standing.xz.sub(camera).length());
      const foot = mix(mix(float(FOOT_SHADE), float(1), smoothstep(float(0), float(FOOT_M), local.y.mul(size))), float(1), matched);
      // A flower holds its colour longer than the grass round it.
      const groundShare = mix(mix(float(GROUND_SHARE), float(1), matched), matched.mul(matched), select(isPetal, float(1), float(0)));
      // The ground's share is the spring photo's colour, so it goes to straw with the grass.
      const ground = mix(colour.rgb, straw.mul(colour.rgb.dot(vec3(1 / 3)).div(straw.dot(vec3(1 / 3)))), strawed);
      const lit = varying(mix(painted, ground, groundShare).mul(colour.w).mul(foot));
      const live = varying(vec2(carried.y, carried.z));
      material.colorNode = hazed(lit);
      material.maskNode = (isFar ? pattern.greaterThanEqual(live.x).and(pattern.lessThan(live.y)) : pattern.lessThan(live.y)).and(outsideCar());
      material.side = DoubleSide;
      return material;
    },
  });

  return {
    update(spot, camera, elapsed) {
      seconds.value += elapsed;
      planting.update(spot, camera);
    },
    compile: planting.compile,
    show: planting.show,
    drawn() {
      const tufts = planting.counts();
      const sum = (counts: number[]) => counts.reduce((total, count) => total + count, 0);
      return { far: sum(tufts.slice(0, kinds.length)), near: sum(tufts.slice(kinds.length)), triangles: planting.triangles(tufts) };
    },
    dispose: planting.dispose,
  };
}

const rollPhase = (place: Node<"vec2">) => unitOf(placeSeed(place), 1).mul(6.283);
