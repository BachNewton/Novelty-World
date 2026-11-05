import { DoubleSide, MeshBasicNodeMaterial, type BufferGeometry, type Node, type PerspectiveCamera, type Scene, type Vector3, type WebGPURenderer } from "three/webgpu";
import { cos, dot, float, fract, If, int, mix, normalize, positionGeometry, round, screenCoordinate, select, sin, smoothstep, uniformArray, varying, vec2, vec3, vec4 } from "three/tsl";
import { outsideCar } from "../art/car-volume";
import { buildBirch, buildBush, buildJuniper, ruralColours, ruralPaint } from "../art/rural";
import type { RoadsideInputs, RoadsideModel } from "../art/roadside";
import { groundKinds } from "../art/surfaces";
import { foliageLight } from "./foliage-light";
import { towardsSun } from "../art/sun";
import { bandColours, clearOfBuildings, createPlanting, placesWithin, reachOf, roll, spreadOf, type Lattice } from "./planting";
import { STONE_WALL_HALF_WIDE_M } from "./tile-walls";
import { FAR_CLEARING, onLineReading, type WallDistance } from "./wall-clearing";
import type { LandAt } from "./tile-reads";

/*
 * Bushes, junipers and young birches, a planting (`planting.ts`) like the verge and
 * the reeds: no list, only a rule over images every far tile already has.
 *
 * Hazel and sallow, and birches coming up, stand along forest edges: open ground with
 * the canopy close by, where a field or a meadow meets the trees. Sallow likes water
 * near. Juniper stands on open rock among the trees, as on Åland's grazed outcrops:
 * the photo's stone with forest within about 60 m, because in a spring photo a bare
 * ploughed field is as pale as rock, and fields lie open.
 *
 * The verge's rules for detail hold: nothing changes size, a lattice of bushes and a
 * sparser one of birches each end by dissolving one at a time where they're a few
 * pixels, and far off a plant takes on the photo's colour there. Past its swap each
 * model is the kit's far version, painted band by band in its near version's colours.
 */

const WIDEST_M = 4;
const BUSHES = 0;
const BIRCHES = 1;
const LATTICES: Lattice[] = [
  { stepM: 2.5, ends: [420, 520, 40], salt: 233.9 },
  { stepM: 6, ends: [1100, 1350, 80], salt: 712.4 },
];
/** The farthest any of its plants stands from the camera. */
const REACH_M = Math.max(...LATTICES.map(reachOf));
/** The band each model's near and far versions trade pixels over, either side of the swap its kit gives it. */
const SWAP_BAND = 0.15;

/** A forest edge: open where the place is, and canopy this tall on average within about 32 m. */
const AROUND_MIP = 3;
const NEAR_MIP = 4;
const EDGE = [1, 4] as const;
const OPEN_HERE = [0.5, 2] as const;
/** How much of a whole patch reads as stone, from none to all rock. */
const STONE = [0.5, 0.8] as const;
/** The water mask's 32 m level that says water is near, for sallow. */
const WATER_NEAR = 0.05;
const ROAD_CLEAR = 0.03;
const LEAST_DRY = 0.9;
/** Of a full edge's places, those with a bush; of full rock's, those with a juniper; of an edge's birch places, those with one. */
const EDGE_BUSHES = 0.3;
const ROCK_JUNIPERS = 0.25;
const EDGE_BIRCHES = 0.3;
const SALLOW_NEAR_WATER = 0.6;
/** How far a birch's trunk stands off a wall's line, past what the far clearing can read on the line itself. */
const BIRCH_OFF_WALL_M = onLineReading(FAR_CLEARING) + STONE_WALL_HALF_WIDE_M;

/** How much of a plant is the photo's own colour, near. */
const GROUND_SHARE = 0.1;
/** A plant turns from its own colour towards the photo's between these. */
const MATCHES = [250, 700] as const;

/*
 * A plant's light is the forest's (`foliage-light.ts`), from its direction as a whole:
 * out from its middle, so a bush turns from light to shade as one mass. Then it shades
 * itself, darker at its foot than its top, as a tree standing alone does, and each
 * rolls its own brightness and a touch of its hue. Leaves that let the sun through glow
 * at their edges looking towards it; a juniper's needles don't. On the whole a plant is
 * as bright as under the old flat shading, so it still meets the photo it turns to far off.
 */
const MIDDLE = 0.45;
const ROUNDNESS = 1.4;
const FOOT_LIGHT = 0.87;
const TOP_LIGHT = 1.05;
const BRIGHTNESS_ROLL = [0.86, 1.12] as const;
const HUE_ROLL = 0.07;

const ROWS = 3;
const BANDS = 5;
/** Edges and rock are a small part of what's in reach: lists hold this share of its places. */
const MOST_PLANTS = 0.08;

/** How high a shape reaches above its own foot. */
function tallest(shape: BufferGeometry): number {
  const position = shape.getAttribute("position");
  let top = 0;
  for (let at = 0; at < position.count; at++) top = Math.max(top, position.getY(at));
  return top;
}

interface Kind {
  model: RoadsideModel;
  lattice: number;
  sizes: readonly [number, number];
}

/** The bushes, junipers and birches, every one of which the LOD check measures. */
export const shrubKinds = (): Kind[] => [
  { model: buildBush(1, "hazel"), lattice: BUSHES, sizes: [0.7, 1.4] },
  { model: buildBush(2, "hazel"), lattice: BUSHES, sizes: [0.7, 1.4] },
  { model: buildBush(1, "sallow"), lattice: BUSHES, sizes: [0.7, 1.3] },
  { model: buildJuniper(1, "column"), lattice: BUSHES, sizes: [0.7, 1.15] },
  { model: buildJuniper(2, "spreading"), lattice: BUSHES, sizes: [0.8, 1.3] },
  { model: buildBirch(1, "young"), lattice: BIRCHES, sizes: [3.5, 7] },
  { model: buildBirch(2, "clump"), lattice: BIRCHES, sizes: [3.5, 6.5] },
];

export interface ShrubInputs {
  canopyAt: (place: Node<"vec2">, mip: number) => Node<"float">;
  waterAt: (place: Node<"vec2">, mip: number) => Node<"float">;
  landAt: LandAt;
  roadsAt: (place: Node<"vec2">, mip: number) => Node<"float">;
  groundAt: (place: Node<"vec2">) => Node<"float">;
  /** Metres from the drawn waterline, out into the water and below zero on land, at a place no farther than `reachM` from the camera. */
  shoreAt: (place: Node<"vec2">, reachM: number) => Node<"float">;
  /** Metres from the nearest stone wall's line, to the bushes' reach and to the birches', for none to stand up through one. */
  wallDistanceAt: WallDistance;
  wallDistanceFarAt: WallDistance;
  /** Metres from a place to the nearest building (`pipeline/clearing.py`): a plant stands only where its whole spread clears it. */
  clearanceAt: (place: Node<"vec2">) => Node<"float">;
  /** The ground's baked shade as the light on it. */
  lightOf: (shade: Node<"float">) => Node<"float">;
  linear: (name: string) => Vector3;
  hazed: (color: Node<"vec3">) => Node<"vec3">;
  sun: RoadsideInputs["sun"];
}

export interface ShrubsDrawn {
  near: number;
  far: number;
  triangles: number;
}

export interface Shrubs {
  update: (spot: Vector3, camera: PerspectiveCamera) => void;
  compile: () => Promise<void>;
  show: (shown: boolean) => void;
  drawn: () => ShrubsDrawn;
  dispose: () => void;
}

export function createShrubs(scene: Scene, renderer: WebGPURenderer, { canopyAt, waterAt, landAt, roadsAt, groundAt, shoreAt, wallDistanceAt, wallDistanceFarAt, clearanceAt, lightOf, linear, hazed, sun }: ShrubInputs): Shrubs {
  const kinds = shrubKinds();
  const [HAZEL, , SALLOW, JUNIPER, , BIRCH] = [0, 1, 2, 3, 4, 5];

  const toSun = towardsSun(sun);
  const pattern = fract(fract(dot(screenCoordinate.xy, vec2(0.06711056, 0.00583715))).mul(52.9829189));
  const colours = ruralColours(linear);
  const paint = ruralPaint(uniformArray(colours));
  const tallOf = kinds.map(({ model }) => tallest(model.near));
  const bandsOf = uniformArray(kinds.flatMap(({ model }, index) => bandColours(model.near, colours, Array.from({ length: BANDS }, (_, band) => (tallOf[index] * (band + 1)) / BANDS + (band === BANDS - 1 ? 100 : 0)))));
  const tallsOf = uniformArray(tallOf, "float");
  const lowOf = uniformArray(kinds.map(({ sizes }) => sizes[0]), "float");
  const highOf = uniformArray(kinds.map(({ sizes }) => sizes[1]), "float");
  const spreadOfKind = uniformArray(kinds.map(({ model }) => spreadOf(model.near)), "float");

  const fars = kinds.map(({ model }) => {
    if (model.far === null) throw new Error("A shrub kit model has no far version");
    return model.far;
  });
  const capacityOf = (lattice: number) => Math.ceil(placesWithin(reachOf(LATTICES[lattice]), LATTICES[lattice].stepM) * MOST_PLANTS);
  // A model's swap is for its own size, and a plant is drawn at its own: its change on screen grows with it.
  const nearOf = ({ model, lattice, sizes }: Kind) => placesWithin(model.swapM * sizes[1] * (1 + SWAP_BAND) + WIDEST_M, LATTICES[lattice].stepM);

  const planting = createPlanting(scene, renderer, {
    lattices: LATTICES,
    widestM: WIDEST_M,
    shapes: [...fars, ...kinds.map(({ model }) => model.near)],
    capacities: [...kinds.map(({ lattice }) => capacityOf(lattice)), ...kinds.map(nearOf)],
    rows: ROWS,
    visit({ seed, place, distance, lattice, seenOn, left, write }) {
      const isBushes = lattice === LATTICES[BUSHES];
      const chance = roll(seed, 4).toVar();
      const land = landAt(place);
      If(land.dry.greaterThan(LEAST_DRY).and(roadsAt(place, 1).lessThan(ROAD_CLEAR)).and(shoreAt(place, REACH_M).lessThanEqual(0)), () => {
        const here = canopyAt(place, 0);
        const edge = smoothstep(float(EDGE[0]), float(EDGE[1]), canopyAt(place, AROUND_MIP)).mul(float(1).sub(smoothstep(float(OPEN_HERE[0]), float(OPEN_HERE[1]), here))).toVar();
        const bushes = edge.mul(isBushes ? EDGE_BUSHES : EDGE_BIRCHES).toVar();
        const rock = isBushes
          ? smoothstep(float(STONE[0]), float(STONE[1]), groundKinds(land.wide.pow(vec3(2.2))).stoneShare).mul(select(here.lessThan(OPEN_HERE[0]), float(1), float(0))).mul(smoothstep(float(EDGE[0]), float(EDGE[1]), canopyAt(place, NEAR_MIP)))
          : float(0);
        const junipers = rock.mul(ROCK_JUNIPERS);
        If(chance.lessThan(bushes.add(junipers)), () => {
          const ground = groundAt(place).toVar();
          If(seenOn(ground), () => {
            const pick = roll(seed, 9);
            const near = waterAt(place, AROUND_MIP).greaterThan(WATER_NEAR);
            const bush = select(near.and(pick.lessThan(SALLOW_NEAR_WATER)), float(SALLOW), select(pick.lessThan(0.5), float(HAZEL), float(HAZEL + 1)));
            const kind = (isBushes ? select(chance.lessThan(bushes), bush, select(pick.lessThan(0.5), float(JUNIPER), float(JUNIPER + 1))) : select(pick.lessThan(0.5), float(BIRCH), float(BIRCH + 1))).toVar();
            const size = mix(lowOf.element(int(round(kind))) as unknown as Node<"float">, highOf.element(int(round(kind))) as unknown as Node<"float">, roll(seed, 10)).toVar();
            const spread = size.mul(spreadOfKind.element(int(round(kind))) as unknown as Node<"float">).toVar();
            const clearOfWalls = (isBushes ? wallDistanceAt(place).greaterThan(spread.add(STONE_WALL_HALF_WIDE_M)) : wallDistanceFarAt(place).greaterThan(BIRCH_OFF_WALL_M)).and(clearOfBuildings(clearanceAt, place, spread));
            const remaining = left().toVar();
            const standing = vec4(place.x, ground, place.y, roll(seed, 11).mul(6.283)).toVar();
            const look = vec4(land.broad.pow(vec3(2.2)), lightOf(land.shade)).toVar();
            kinds.forEach((each, index) => {
              if (LATTICES[each.lattice] !== lattice) return;
              If(kind.equal(index), () => {
                const swap = smoothstep(size.mul(each.model.swapM * (1 - SWAP_BAND)), size.mul(each.model.swapM * (1 + SWAP_BAND)), distance).toVar();
                If(clearOfWalls.and(swap.greaterThan(0)).and(remaining.greaterThan(0)), () => {
                  write(index, [standing, look, vec4(float(1).sub(swap), remaining, size, kind)]);
                });
                If(clearOfWalls.and(swap.lessThan(1)), () => {
                  write(kinds.length + index, [standing, look, vec4(0, float(1).sub(swap), size, kind)]);
                });
              });
            });
          });
        });
      });
    },
    materialOf(index, [standing, look, live], camera) {
      const local = positionGeometry;
      const size = live.z;
      const [yawCos, yawSin] = [cos(standing.w), sin(standing.w)];
      const material = new MeshBasicNodeMaterial();
      material.positionNode = vec3(standing.x.add(local.x.mul(yawCos).add(local.z.mul(yawSin)).mul(size)), standing.y.add(local.y.mul(size)), standing.z.add(local.z.mul(yawCos).sub(local.x.mul(yawSin)).mul(size)));
      const isFar = index < kinds.length;
      const kind = varying(int(round(live.w)));
      // The model's own height, before the plant's size, picks the band, as it did when the bands were measured.
      const band = local.y.div(tallsOf.element(kind) as unknown as Node<"float">).mul(BANDS).floor().clamp(0, BANDS - 1);
      const painted = isFar ? (bandsOf.element(int(round(live.w.mul(BANDS).add(band)))) as unknown as Node<"vec3">) : paint;
      const matched = smoothstep(float(MATCHES[0]), float(MATCHES[1]), standing.xz.sub(camera).length());
      const radial = normalize(vec2(local.x.mul(yawCos).add(local.z.mul(yawSin)), local.z.mul(yawCos).sub(local.x.mul(yawSin))).add(vec2(1e-4, 0)));
      const up = local.y.div(tallsOf.element(kind) as unknown as Node<"float">).clamp(0, 1);
      const rounded = varying(vec3(radial.x, up.sub(MIDDLE).mul(ROUNDNESS), radial.y));
      const seeThrough = select(kind.equal(JUNIPER).or(kind.equal(JUNIPER + 1)), float(0), float(1));
      const plantRoll = fract(standing.w.mul(7.31));
      const ownShade = varying(mix(float(FOOT_LIGHT), float(TOP_LIGHT), up).mul(mix(float(BRIGHTNESS_ROLL[0]), float(BRIGHTNESS_ROLL[1]), plantRoll)));
      const hue = varying(fract(plantRoll.mul(3.17)).sub(0.5).mul(2 * HUE_ROLL));
      const lit = foliageLight(toSun, rounded, seeThrough).mul(ownShade);
      const coloured = mix(painted.mul(vec3(float(1).add(hue), 1, float(1).sub(hue))).mul(lit), look.rgb.mul(look.w), mix(float(GROUND_SHARE), float(1), matched));
      material.colorNode = hazed(coloured);
      const pixels = varying(vec2(live.x, live.y));
      material.maskNode = pattern.greaterThanEqual(pixels.x).and(pattern.lessThan(pixels.y)).and(outsideCar());
      material.side = DoubleSide;
      return material;
    },
  });

  return {
    update: planting.update,
    compile: planting.compile,
    show: planting.show,
    drawn() {
      const counts = planting.counts();
      return { far: counts.slice(0, kinds.length).reduce((sum, count) => sum + count, 0), near: counts.slice(kinds.length).reduce((sum, count) => sum + count, 0), triangles: planting.triangles(counts) };
    },
    dispose: planting.dispose,
  };
}
