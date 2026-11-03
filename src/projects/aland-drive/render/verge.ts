import { DoubleSide, MeshBasicNodeMaterial, Triangle, Vector3 as Colour, type BufferGeometry, type Node, type PerspectiveCamera, type Scene, type Vector3, type WebGPURenderer } from "three/webgpu";
import { attribute, cos, dot, float, floor, fract, If, int, mix, positionGeometry, round, screenCoordinate, select, sin, smoothstep, uniform, uniformArray, varying, vec2, vec3, vec4 } from "three/tsl";
import { STREET_PARTS, streetColours, streetPaint, streetPalette, type StreetPart } from "../art/street";
import { MOTION_RANGE_M } from "../art/street/paint";
import { buildGrassTuft, buildSeedGrass, buildVergeCard, buildWildflowers } from "../art/street/verge";
import type { RoadsideModel } from "../art/roadside/models";
import { groundFloor, groundKinds } from "../art/surfaces";
import type { LandAt } from "./tile-reads";
import { createPlanting, placesWithin, reachOf, roll, type Lattice } from "./planting";

/*
 * The grass and flowers of the verges, with no list of tufts anywhere, as the forest
 * has no list of trees: a tuft is a place on a lattice of the world, and what stands
 * there comes from the images a tile already has. So nothing is stored or streamed
 * for one, no tile changes, and it costs the same however much road there is.
 *
 * It's a planting (`planting.ts`): each frame a pass goes through the places within
 * reach and keeps those beside a road, on dry ground that isn't paving or rock,
 * cheapest test first. Survivors go into a list for each model near the camera, and past that into
 * one list of a three-point card in the near tuft's own colours, its green and, in its
 * middle blade, as much of its straw as the tuft has, or for a flower one tipped with
 * its colour, so the swap changes the shape and not the colours. They trade
 * pixels over a band. A tuft takes the colour and the baked shade of the ground it
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
const SWAP_M = 34;
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
/** The pale and seed-head paints of a tuft, which stand out of the green as gold. */
const STRAW: readonly StreetPart[] = ["grass-pale", "grass-seed"];
const STRAW_BLADE = STREET_PARTS.indexOf("grass-pale");
/** One blade of a far card's three is a third of it. */
const CARD_BLADES = 3;
const WIND_SPEED = 1.25;
const WIND_WAVES = 0.8;
const SINK_M = 0.04;

/** A tuft in a list is three rows of four floats. */
const ROWS = 3;
const FAR_DRAW = 0;
const FAR_FLOWER_DRAW = 1;
const FAR_DRAWS = 2;
/** Of `STANDS`, one in each kind of flower, and in those `FLOWER_SHARE` of tufts: so never more than this share of places has a far flower. */
const MOST_FAR_FLOWERS = 0.2;

interface Kind {
  model: RoadsideModel;
  /** How tall its far card stands. */
  tallM: number;
  /** The paint of its far card's tips. */
  tip?: StreetPart;
}

/** What a tuft's blades, stems and leaves average to, by the area each covers, in the paint's own light: its green, its straw, and how much of it is straw. */
function tuftColours(shape: BufferGeometry, colours: Colour[]) {
  const position = shape.getAttribute("position");
  const tint = shape.getAttribute("tint");
  const order = shape.getIndex();
  const corner = (at: number) => order?.getX(at) ?? at;
  const triangle = new Triangle();
  const green = { sum: new Colour(), area: 0 };
  const straw = { sum: new Colour(), area: 0 };
  const strawParts = STRAW.map((part) => STREET_PARTS.indexOf(part));
  for (let at = 0; at < (order?.count ?? position.count); at += 3) {
    const first = corner(at);
    const part = Math.round(tint.getX(first) * 255);
    if (part >= FIRST_PETAL) continue;
    triangle.setFromAttributeAndIndices(position, first, corner(at + 1), corner(at + 2));
    const area = triangle.getArea();
    const into = strawParts.includes(part) ? straw : green;
    into.sum.addScaledVector(colours[part], area * ((tint.getY(first) * 255) / 128));
    into.area += area;
  }
  const strawShare = straw.area / (green.area + straw.area);
  return { green: green.sum.divideScalar(green.area), straw: straw.area > 0 ? straw.sum.divideScalar(straw.area) : green.sum.clone(), strawShare };
}

export interface VergeInputs {
  landAt: LandAt;
  roadsAt: (place: Node<"vec2">, mip: number) => Node<"float">;
  /** How much of a place is boulder field: stones, where no verge grows. */
  fieldsAt: (place: Node<"vec2">) => Node<"float">;
  groundAt: (place: Node<"vec2">) => Node<"float">;
  /** Metres from the drawn waterline, out into the water and below zero on land. */
  shoreAt: (place: Node<"vec2">) => Node<"float">;
  /** The ground's baked shade as the light on it. */
  lightOf: (shade: Node<"float">) => Node<"float">;
  linear: (name: string) => Vector3;
  hazed: (color: Node<"vec3">) => Node<"vec3">;
  litterColour: Node<"vec3">;
  tileM: number;
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

export function createVerge(scene: Scene, renderer: WebGPURenderer, { landAt, roadsAt, fieldsAt, groundAt, shoreAt, lightOf, linear, hazed, litterColour, tileM }: VergeInputs): Verge {
  const kinds: Kind[] = [
    { model: buildGrassTuft(), tallM: 0.62 },
    { model: buildSeedGrass(), tallM: 0.8 },
    { model: buildWildflowers("daisy"), tallM: 0.55, tip: "petal-white" },
    { model: buildWildflowers("buttercup"), tallM: 0.5, tip: "petal-yellow" },
    { model: buildWildflowers("cow-parsley"), tallM: 0.95, tip: "petal-white" },
    { model: buildWildflowers("lupine"), tallM: 0.9, tip: "petal-lupine" },
    { model: buildWildflowers("fireweed"), tallM: 1.05, tip: "petal-fireweed" },
  ];
  const flowers = kinds.length - 2;

  const seconds = uniform(0);
  const pattern = fract(fract(dot(screenCoordinate.xy, vec2(0.06711056, 0.00583715))).mul(52.9829189));

  const far = LATTICES.reduce((sum, lattice) => sum + placesWithin(reachOf(lattice), lattice.stepM), 0);
  const near = LATTICES.reduce((sum, { stepM }) => sum + placesWithin(SWAP_M * (1 + SWAP_BAND) + 1, stepM), 0);

  const tallOf = uniformArray(kinds.map(({ tallM }) => tallM), "float");
  const tipOf = uniformArray(kinds.map(({ tip }) => (tip === undefined ? -1 : STREET_PARTS.indexOf(tip))), "float");
  const colours = streetColours(linear);
  const tufts = kinds.map(({ model }) => tuftColours(model.near, colours));
  const greenOf = uniformArray(tufts.map(({ green }) => green));
  // A straw blade is a third of a card: so a tuft a third straw has it all straw, and one a sixth straw has it half.
  const strawOf = uniformArray(tufts.map(({ green, straw, strawShare }) => green.clone().lerp(straw, Math.min(1, strawShare * CARD_BLADES))));
  const palette = streetPalette(linear);
  const paint = streetPaint(palette);

  const planting = createPlanting(scene, renderer, {
    lattices: LATTICES,
    widestM: WIDEST_TUFT_M,
    shapes: [buildVergeCard(false), buildVergeCard(true), ...kinds.map(({ model }) => model.near)],
    capacities: [far, Math.ceil(far * MOST_FAR_FLOWERS), ...kinds.map(() => near)],
    rows: ROWS,
    visit({ seed, place, distance, seenOn, left, write }) {
      const chance = roll(seed, 93.989, 67.345).toVar();
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
          If(clear.greaterThan(roll(seed, 21.17, 5.71)).and(land.dry.greaterThan(LEAST_DRY)).and(smoothstep(float(PAVED[0]), float(PAVED[1]), stoneShare).lessThan(roll(seed, 3.11, 47.3))).and(shoreAt(place).lessThanEqual(0)).and(fieldsAt(place).lessThan(roll(seed, 71.9, 2.3))), () => {
            const ground = groundAt(place).toVar();
            If(seenOn(ground), () => {
              const stand = roll(floor(place.div(STAND_M)), 7.13, 3.77).mul(STANDS).floor().toVar();
              const isFlower = stand.lessThan(flowers).and(roll(seed, 17.3, 91.1).lessThan(FLOWER_SHARE));
              const kind = select(isFlower, stand.add(2), select(roll(seed, 54.1, 18.7).lessThan(SEED_SHARE), float(1), float(0))).toVar();
              // Thinner towards the edge of a verge, by the place and never by the distance.
              const size = mix(float(SIZES[0]), float(SIZES[1]), roll(seed, 73.31, 29.47)).mul(float(1).sub(smoothstep(float(0.75), float(1), turn))).toVar();
              const swap = smoothstep(float(SWAP_M * (1 - SWAP_BAND)), float(SWAP_M * (1 + SWAP_BAND)), distance).toVar();
              const remaining = left().toVar();
              const standing = vec4(place.x, ground.sub(SINK_M), place.y, roll(seed, 29.3, 61.7).mul(6.283)).toVar();
              const photo = land.broad.pow(vec3(2.2)).toVar();
              const colour = vec4(groundFloor(photo, litterColour, groundKinds(photo)), lightOf(land.shade)).toVar();

              If(swap.greaterThan(0).and(remaining.greaterThan(0)), () => {
                const card = vec4(size.mul(tallOf.element(int(kind)) as unknown as Node<"float">), float(1).sub(swap), remaining, kind).toVar();
                If(isFlower, () => {
                  write(FAR_FLOWER_DRAW, [standing, colour, card]);
                }).Else(() => {
                  write(FAR_DRAW, [standing, colour, card]);
                });
              });
              If(swap.lessThan(1), () => {
                kinds.forEach((_, index) => {
                  If(kind.equal(index), () => {
                    write(index + FAR_DRAWS, [standing, colour, vec4(size, float(0), float(1).sub(swap), 0)]);
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
      const isFar = index < FAR_DRAWS;
      const local = positionGeometry;
      const phase = rollPhase(standing.xz).add(seconds.mul(WIND_SPEED)).add(local.x.mul(-WIND_WAVES));
      const sway = tint.b.mul(MOTION_RANGE_M).mul(sin(phase));
      const z = local.z.add(sway);
      const [yawCos, yawSin] = [cos(standing.w), sin(standing.w)];
      const material = new MeshBasicNodeMaterial();
      const wide = size.mul(WIDE);
      material.positionNode = vec3(standing.x.add(local.x.mul(yawCos).add(z.mul(yawSin)).mul(wide)), standing.y.add(local.y.mul(size)), standing.z.add(z.mul(yawCos).sub(local.x.mul(yawSin)).mul(wide)));

      const matched = smoothstep(float(MATCHES[0]), float(MATCHES[1]), standing.xz.sub(camera).length());
      const foot = mix(mix(float(FOOT_SHADE), float(1), smoothstep(float(0), float(FOOT_M), local.y.mul(size))), float(1), matched);
      // A card is one list for every kind, so it takes its paints from the tuft's kind.
      const kindOf = int(carried.w);
      const tip = palette.element(int(tipOf.element(kindOf) as unknown as Node<"float">)) as unknown as Node<"vec3">;
      const body = mix(greenOf.element(kindOf) as unknown as Node<"vec3">, strawOf.element(kindOf) as unknown as Node<"vec3">, select(part.equal(STRAW_BLADE), float(1), float(0)));
      const painted = isFar ? mix(body, tip, select(isPetal, float(1), float(0))) : paint;
      // A flower holds its colour longer than the grass round it.
      const groundShare = mix(mix(float(GROUND_SHARE), float(1), matched), matched.mul(matched), select(isPetal, float(1), float(0)));
      const lit = varying(mix(painted, colour.rgb, groundShare).mul(colour.w).mul(foot));
      const live = varying(vec2(carried.y, carried.z));
      material.colorNode = hazed(lit);
      material.maskNode = isFar ? pattern.greaterThanEqual(live.x).and(pattern.lessThan(live.y)) : pattern.lessThan(live.y);
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
      return { far: tufts[FAR_DRAW] + tufts[FAR_FLOWER_DRAW], near: tufts.slice(FAR_DRAWS).reduce((sum, count) => sum + count, 0), triangles: planting.triangles(tufts) };
    },
    dispose: planting.dispose,
  };
}

const rollPhase = (place: Node<"vec2">) => roll(place, 12.9898, 78.233).mul(6.283);
