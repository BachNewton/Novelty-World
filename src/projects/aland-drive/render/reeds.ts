import { DoubleSide, MeshBasicNodeMaterial, Triangle, Vector3 as Colour, type BufferGeometry, type Node, type PerspectiveCamera, type Scene, type Vector3, type WebGPURenderer } from "three/webgpu";
import { atan, cos, dot, float, fract, If, int, mix, positionGeometry, screenCoordinate, select, sin, smoothstep, uniformArray, varying, vec2, vec3, vec4 } from "three/tsl";
import { buildReedBed, ruralColours, ruralPaint } from "../art/rural";
import { createPlanting, placesWithin, reachOf, roll, type Lattice } from "./planting";
import type { LandAt } from "./tile-reads";

/*
 * Reed beds along the shores, a planting (`planting.ts`) like the verge: no list of
 * beds, only a rule over images every far tile already has, so no tile changes.
 *
 * Reeds grow where the water is sheltered, and the shore's colour can't say where
 * that is: in the photo a reed bed and bare granite are the same pale tan, and over
 * OSM's mapped beds and rocks no rule of colour tells them apart. What does is how
 * much open water lies round a shore. Within a kilometre, mapped reed beds have 36%
 * water at the median and bare rock 71%: reeds fill inner bays, and the open shores
 * are rock. So a bed stands in the water near land, where the water round about is
 * mostly land, and where the shallows are pale enough to be shallow. Over the built
 * tiles that keeps a quarter of the mapped beds' water, 3% of the water off mapped
 * rock, and 7% of other shallows, much of which is beds nobody mapped.
 *
 * A bed faces out to the open water, and stands on the water's own level. Past its
 * swap it's the kit's far bed, painted band by band in the near bed's own colours at
 * that height, so the change is of shape and never of colour.
 */

const WIDEST_BED_M = 6;
const LATTICES: Lattice[] = [{ stepM: 3, ends: [650, 850, 60], salt: 91.7 }];
const SWAP_M = 90;
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
/** The mask's 32 m level, read between texels: a bed stands where at least this share of it is land. */
const BELT_MIP = 3;
const LEAST_LAND = 0.12;
/** The photo's brightness from dark deep water to pale shallows. */
const SHALLOW = [85 / 255, 120 / 255] as const;
const IN_WATER = 0.5;
const ROAD_CLEAR = 0.05;
const MOST_OF_A_PLACE = 0.6;
const SIZES = [0.8, 1.15] as const;
/** How far a bed turns from facing straight out, either way. */
const TURN = 0.45;
const ASPECT_M = 8;

/** A bed in a list is three rows of four floats: where it stands, its look, and its share of the pixels. */
const ROWS = 3;
const FAR_DRAW = 0;
const FAR_DRAWS = 1;
const SEEDS = [1, 2, 3];
/** Shores in view are a small part of what's in reach: lists hold this share of its places. */
const MOST_BEDS = 0.12;

/** The far bed is painted by height in these bands, each the near bed's own mean colour there. */
const BAND_TOPS_M = [0.4, 0.9, 1.5, 2.1, 3.2];

/** A shape's area-weighted mean paint in each height band, in the paint's own light. */
function bandColours(shape: BufferGeometry, colours: Colour[]): Colour[] {
  const position = shape.getAttribute("position");
  const tint = shape.getAttribute("tint");
  const order = shape.getIndex();
  const corner = (at: number) => order?.getX(at) ?? at;
  const triangle = new Triangle();
  const middle = new Colour();
  const sums = BAND_TOPS_M.map(() => ({ sum: new Colour(), area: 0 }));
  for (let at = 0; at < (order?.count ?? position.count); at += 3) {
    const first = corner(at);
    triangle.setFromAttributeAndIndices(position, first, corner(at + 1), corner(at + 2));
    triangle.getMidpoint(middle);
    const band = sums[Math.max(0, BAND_TOPS_M.findIndex((top) => middle.y < top))];
    const area = triangle.getArea();
    band.sum.addScaledVector(colours[Math.round(tint.getX(first) * 255)], area * ((tint.getY(first) * 255) / 128));
    band.area += area;
  }
  const filled = sums.filter(({ area }) => area > 0);
  return sums.map(({ sum, area }) => (area > 0 ? sum.divideScalar(area) : filled[filled.length - 1].sum.clone().divideScalar(filled[filled.length - 1].area)));
}

export interface ReedInputs {
  waterAt: (place: Node<"vec2">, mip: number) => Node<"float">;
  landAt: LandAt;
  roadsAt: (place: Node<"vec2">, mip: number) => Node<"float">;
  groundAt: (place: Node<"vec2">) => Node<"float">;
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

export function createReeds(scene: Scene, renderer: WebGPURenderer, { waterAt, landAt, roadsAt, groundAt, lightOf, linear, hazed }: ReedInputs): Reeds {
  const beds = SEEDS.map((seed) => buildReedBed(seed));
  const pattern = fract(fract(dot(screenCoordinate.xy, vec2(0.06711056, 0.00583715))).mul(52.9829189));
  const colours = ruralColours(linear);
  const paint = ruralPaint(uniformArray(colours));
  const bandsOf = uniformArray(beds.flatMap(({ near }) => bandColours(near, colours)));

  const lattice = LATTICES[0];
  const far = Math.ceil(placesWithin(reachOf(lattice), lattice.stepM) * MOST_BEDS);
  const near = placesWithin(SWAP_M * (1 + SWAP_BAND) + WIDEST_BED_M, lattice.stepM);
  const farShape = beds[0].far;
  if (farShape === null) throw new Error("The reed bed kit has no far version");

  const planting = createPlanting(scene, renderer, {
    lattices: LATTICES,
    widestM: WIDEST_BED_M,
    shapes: [farShape, ...beds.map(({ near: shape }) => shape)],
    capacities: [far, ...beds.map(() => near)],
    rows: ROWS,
    visit({ seed, place, distance, seenOn, left, write }) {
      const chance = roll(seed, 93.989, 67.345).toVar();
      If(chance.lessThan(MOST_OF_A_PLACE).and(waterAt(place, 0).greaterThan(IN_WATER)), () => {
        const land = float(1).sub(waterAt(place, BELT_MIP)).toVar();
        If(land.greaterThan(LEAST_LAND), () => {
          const grid = [-1, 0, 1].flatMap((x) => [-1, 0, 1].map((z) => waterAt(place.add(vec2(x, z).mul(SHELTER_SPREAD_M)), SHELTER_MIP)));
          const open = grid.reduce((sum, read) => sum.add(read)).div(grid.length);
          const sheltered = float(1).sub(smoothstep(float(OPEN[0]), float(OPEN[1]), open));
          const shore = landAt(place);
          const shallow = smoothstep(float(SHALLOW[0]), float(SHALLOW[1]), dot(shore.broad, vec3(1 / 3)));
          const clear = roadsAt(place, 0).lessThan(ROAD_CLEAR);
          If(clear.and(sheltered.mul(shallow).greaterThan(roll(seed, 21.17, 5.71))), () => {
            const water = groundAt(place).toVar();
            If(seenOn(water), () => {
              // Out to the water, from where the mask says there's more of it.
              const across = (offset: [number, number]) => waterAt(place.add(vec2(...offset)), BELT_MIP);
              const out = vec2(across([ASPECT_M, 0]).sub(across([-ASPECT_M, 0])), across([0, ASPECT_M]).sub(across([0, -ASPECT_M])));
              const yaw = atan(out.x, out.y).add(roll(seed, 29.3, 61.7).sub(0.5).mul(2 * TURN));
              const kind = roll(seed, 54.1, 18.7).mul(SEEDS.length).floor().toVar();
              const size = mix(float(SIZES[0]), float(SIZES[1]), roll(seed, 73.31, 29.47));
              const swap = smoothstep(float(SWAP_M * (1 - SWAP_BAND)), float(SWAP_M * (1 + SWAP_BAND)), distance).toVar();
              const remaining = left().toVar();
              const standing = vec4(place.x, water, place.y, yaw).toVar();
              const look = vec4(size, lightOf(shore.shade), kind, 0).toVar();
              If(swap.greaterThan(0).and(remaining.greaterThan(0)), () => {
                write(FAR_DRAW, [standing, look, vec4(float(1).sub(swap), remaining, 0, 0)]);
              });
              If(swap.lessThan(1), () => {
                SEEDS.forEach((_, index) => {
                  If(kind.equal(index), () => {
                    write(index + FAR_DRAWS, [standing, look, vec4(0, float(1).sub(swap), 0, 0)]);
                  });
                });
              });
            });
          });
        });
      });
    },
    materialOf(index, [standing, look, live]) {
      const local = positionGeometry;
      const size = look.x;
      const [yawCos, yawSin] = [cos(standing.w), sin(standing.w)];
      const material = new MeshBasicNodeMaterial();
      material.positionNode = vec3(standing.x.add(local.x.mul(yawCos).add(local.z.mul(yawSin)).mul(size)), standing.y.add(local.y.mul(size)), standing.z.add(local.z.mul(yawCos).sub(local.x.mul(yawSin)).mul(size)));
      const isFar = index < FAR_DRAWS;
      // The model's own height, before the bed's size, picks the band, as it did when the bands were measured.
      const band = BAND_TOPS_M.slice(0, -1).reduce((at: Node<"float">, top) => at.add(select(local.y.greaterThanEqual(top), float(1), float(0))), float(0));
      const painted = isFar ? (bandsOf.element(int(look.z.mul(BAND_TOPS_M.length).add(band))) as unknown as Node<"vec3">) : paint;
      material.colorNode = hazed(varying(painted.mul(look.y)));
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
