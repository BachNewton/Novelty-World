import { DoubleSide, MeshBasicNodeMaterial, type Node, type PerspectiveCamera, type Scene, type Vector3, type WebGPURenderer } from "three/webgpu";
import { cos, dot, float, fract, If, int, mix, positionGeometry, screenCoordinate, select, sin, smoothstep, uniformArray, varying, vec2, vec3, vec4 } from "three/tsl";
import { buildReedClump, ruralColours, ruralPaint } from "../art/rural";
import { bandColours, createPlanting, placesWithin, reachOf, roll, type Lattice } from "./planting";
import type { LandAt } from "./tile-reads";

/*
 * Reeds along the shores, a planting (`planting.ts`) like the verge: no list of
 * clumps, only a rule over images every far tile already has, so no tile changes.
 *
 * Reeds grow where the water is sheltered, and the shore's colour can't say where
 * that is: in the photo a reed bed and bare granite are the same pale tan, and over
 * OSM's mapped beds and rocks no rule of colour tells them apart. What does is how
 * much open water lies round a shore. Within a kilometre, mapped reed beds have 36%
 * water at the median and bare rock 71%: reeds fill inner bays, and the open shores
 * are rock. So a clump stands in the water near land, where the water round about is
 * mostly land, where the shallows are pale enough to be shallow, and away from a
 * town's quays, which its roads give away. Over the built
 * tiles that keeps a quarter of the mapped beds' water, 3% of the water off mapped
 * rock, and 7% of other shallows, much of which is beds nobody mapped.
 *
 * A clump is stems in the round, never a card, and the verge's rules for detail hold:
 * a clump never changes size, a fine lattice near and a sparse one to the horizon each
 * end by their clumps dissolving one at a time where they're a few pixels, and far
 * off a clump takes the photo's own colour there, which over a reed bed is the reeds',
 * so one dissolving changes nothing. Past its swap a clump is three points, painted
 * band by band in the near clump's own colours at that height.
 */

const WIDEST_CLUMP_M = 2;
const LATTICES: Lattice[] = [
  { stepM: 1, ends: [330, 420, 30], salt: 91.7 },
  { stepM: 3, ends: [850, 1050, 60], salt: 404.1 },
];
const SWAP_M = 60;
const SWAP_BAND = 0.15;

/**
 * How open the water is round a shore: the mask's 256 m level, read on a grid of
 * nine this far apart, about a kilometre square. A coarser level won't do: each mip
 * halves rounding down, so a tile's 1500 pixels are 5 at 1 km, which hold only its
 * first 1280 and are stretched over all of it, reading water up to 900 m from where
 * it is.
 */
const SHELTER_MIP = 6;
const SHELTER_SPREAD_M = 400;
/** Open water within a kilometre, from as much as reeds take to as much as they never do. */
const OPEN = [0.3, 0.55] as const;
/** The mask's 32 m level, read between texels: a clump stands where at least this share of it is land. */
const BELT_MIP = 3;
const LEAST_LAND = 0.12;
/** The photo's brightness from dark deep water to pale shallows. */
const SHALLOW = [85 / 255, 120 / 255] as const;
const IN_WATER = 0.5;
/**
 * Roads as a share of the land round a shore, at the mask's 256 m level: a town's is a
 * fifth road, a country shore's a twentieth, and a town's has quays, not reeds. Of the
 * land, not of everything, or the water beside a quay would dilute it.
 */
const BUILT_MIP = 6;
const BUILT = [0.1, 0.16] as const;
const LEAST_LAND_AROUND = 0.1;
const ROAD_CLEAR = 0.05;
const MOST_OF_A_PLACE = 0.8;
const SIZES = [0.85, 1.2] as const;

/** How much of a clump is the photo's own colour, near. */
const GROUND_SHARE = 0.15;
/** A clump turns from its own colour towards the photo's between these. */
const MATCHES = [200, 600] as const;

/** A clump in a list is three rows of four floats: where it stands, its look, and its share of the pixels. */
const ROWS = 3;
const FAR_DRAW = 0;
const FAR_DRAWS = 1;
const SEEDS = [1, 2, 3];
/** Shores in view are a small part of what's in reach: lists hold this share of its places. */
const MOST_CLUMPS = 0.1;

/** The far clump is painted by height in these bands, each the near clump's own mean colour there. */
const BAND_TOPS_M = [0.4, 0.9, 1.4, 1.9, 3.2];

export interface ReedInputs {
  waterAt: (place: Node<"vec2">, mip: number) => Node<"float">;
  landAt: LandAt;
  roadsAt: (place: Node<"vec2">, mip: number) => Node<"float">;
  groundAt: (place: Node<"vec2">) => Node<"float">;
  /** Metres from the drawn waterline, out into the water and below zero on land. */
  shoreAt: (place: Node<"vec2">) => Node<"float">;
  /** The ground's baked shade as the light on it. */
  lightOf: (shade: Node<"float">) => Node<"float">;
  linear: (name: string) => Vector3;
  hazed: (color: Node<"vec3">) => Node<"vec3">;
}

export interface ReedsDrawn {
  near: number;
  far: number;
  triangles: number;
}

export interface Reeds {
  update: (spot: Vector3, camera: PerspectiveCamera) => void;
  compile: () => Promise<void>;
  show: (shown: boolean) => void;
  drawn: () => ReedsDrawn;
  dispose: () => void;
}

export function createReeds(scene: Scene, renderer: WebGPURenderer, { waterAt, landAt, roadsAt, groundAt, shoreAt, lightOf, linear, hazed }: ReedInputs): Reeds {
  const clumps = SEEDS.map((seed) => buildReedClump(seed));
  const pattern = fract(fract(dot(screenCoordinate.xy, vec2(0.06711056, 0.00583715))).mul(52.9829189));
  const colours = ruralColours(linear);
  const paint = ruralPaint(uniformArray(colours));
  const bandsOf = uniformArray(clumps.flatMap(({ near }) => bandColours(near, colours, BAND_TOPS_M)));

  const far = Math.ceil(LATTICES.reduce((sum, lattice) => sum + placesWithin(reachOf(lattice), lattice.stepM), 0) * MOST_CLUMPS);
  const near = LATTICES.reduce((sum, { stepM }) => sum + placesWithin(SWAP_M * (1 + SWAP_BAND) + WIDEST_CLUMP_M, stepM), 0);
  const farShape = clumps[0].far;
  if (farShape === null) throw new Error("The reed clump kit has no far version");

  const planting = createPlanting(scene, renderer, {
    lattices: LATTICES,
    widestM: WIDEST_CLUMP_M,
    shapes: [farShape, ...clumps.map(({ near: shape }) => shape)],
    capacities: [far, ...clumps.map(() => near)],
    rows: ROWS,
    visit({ seed, place, distance, seenOn, left, write }) {
      const chance = roll(seed, 93.989, 67.345).toVar();
      If(chance.lessThan(MOST_OF_A_PLACE).and(waterAt(place, 0).greaterThan(IN_WATER)).and(shoreAt(place).greaterThan(0)), () => {
        const land = float(1).sub(waterAt(place, BELT_MIP)).toVar();
        If(land.greaterThan(LEAST_LAND), () => {
          const grid = [-1, 0, 1].flatMap((x) => [-1, 0, 1].map((z) => waterAt(place.add(vec2(x, z).mul(SHELTER_SPREAD_M)), SHELTER_MIP)));
          const open = grid.reduce((sum, read) => sum.add(read)).div(grid.length);
          const built = roadsAt(place, BUILT_MIP).div(float(1).sub(waterAt(place, BUILT_MIP)).max(LEAST_LAND_AROUND));
          const sheltered = float(1).sub(smoothstep(float(OPEN[0]), float(OPEN[1]), open)).mul(float(1).sub(smoothstep(float(BUILT[0]), float(BUILT[1]), built)));
          const shore = landAt(place);
          const shallow = smoothstep(float(SHALLOW[0]), float(SHALLOW[1]), dot(shore.broad, vec3(1 / 3)));
          const clear = roadsAt(place, 0).lessThan(ROAD_CLEAR);
          If(clear.and(sheltered.mul(shallow).greaterThan(roll(seed, 21.17, 5.71))), () => {
            const water = groundAt(place).toVar();
            If(seenOn(water), () => {
              const kind = roll(seed, 54.1, 18.7).mul(SEEDS.length).floor().toVar();
              const size = mix(float(SIZES[0]), float(SIZES[1]), roll(seed, 73.31, 29.47));
              const swap = smoothstep(float(SWAP_M * (1 - SWAP_BAND)), float(SWAP_M * (1 + SWAP_BAND)), distance).toVar();
              const remaining = left().toVar();
              const standing = vec4(place.x, water, place.y, roll(seed, 29.3, 61.7).mul(6.283)).toVar();
              const photo = shore.broad.pow(vec3(2.2)).toVar();
              const look = vec4(photo, lightOf(shore.shade)).toVar();
              If(swap.greaterThan(0).and(remaining.greaterThan(0)), () => {
                write(FAR_DRAW, [standing, look, vec4(float(1).sub(swap), remaining, size, kind)]);
              });
              If(swap.lessThan(1), () => {
                SEEDS.forEach((_, index) => {
                  If(kind.equal(index), () => {
                    write(index + FAR_DRAWS, [standing, look, vec4(0, float(1).sub(swap), size, kind)]);
                  });
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
      const isFar = index < FAR_DRAWS;
      // The model's own height, before the clump's size, picks the band, as it did when the bands were measured.
      const band = BAND_TOPS_M.slice(0, -1).reduce((at: Node<"float">, top) => at.add(select(local.y.greaterThanEqual(top), float(1), float(0))), float(0));
      const painted = isFar ? (bandsOf.element(int(live.w.mul(BAND_TOPS_M.length).add(band))) as unknown as Node<"vec3">) : paint;
      const matched = smoothstep(float(MATCHES[0]), float(MATCHES[1]), standing.xz.sub(camera).length());
      const coloured = mix(painted, look.rgb, mix(float(GROUND_SHARE), float(1), matched));
      material.colorNode = hazed(varying(coloured.mul(look.w)));
      const pixels = varying(vec2(live.x, live.y));
      material.maskNode = pattern.greaterThanEqual(pixels.x).and(pattern.lessThan(pixels.y));
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
      return { far: counts[FAR_DRAW], near: counts.slice(FAR_DRAWS).reduce((sum, count) => sum + count, 0), triangles: planting.triangles(counts) };
    },
    dispose: planting.dispose,
  };
}
