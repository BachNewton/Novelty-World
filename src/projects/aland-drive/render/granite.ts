import { DoubleSide, MeshBasicNodeMaterial, Vector3, type BufferGeometry, type Node, type PerspectiveCamera, type Scene, type WebGPURenderer } from "three/webgpu";
import { abs, cameraPosition, cos, dot, float, fract, If, int, mix, normalize, positionGeometry, positionWorld, round, screenCoordinate, select, sin, smoothstep, uniformArray, varying, vec2, vec3, vec4 } from "three/tsl";
import { outsideCar } from "../art/car-volume";
import { buildBoulder, buildOutcrop, rapakivi, ROCK_SEEDS, RURAL_PARTS, ruralColours, type RuralPart } from "../art/rural";
import type { RoadsideInputs } from "../art/roadside";
import { flatNormal } from "../art/flat-normal";
import { groundFloor, groundKinds, rockFloor } from "../art/surfaces";
import { createPlanting, placesWithin, reachOf, roll, type Lattice } from "./planting";
import type { LandAt } from "./tile-reads";
import { towardsSun } from "../art/sun";

/*
 * Åland's granite where it breaks through the ground: bare domes and slabs along the
 * shores and through thin pine, a planting (`planting.ts`) like the shrubs, over the
 * rock the Topographic Database maps (`pipeline/rocks.py`, the mask's alpha).
 *
 * The rock's shape is already the ground: bare rock has nothing on it for the
 * elevation model to see past, so its domes and steps are the terrain, and the car
 * drives on them. What the 4 m mesh can't carry is the rock's own skin: its edge
 * where turf gives out, the low swell of each slab and its joints. So an outcrop
 * is the rural kit's dome laid over the ground rather than stood on it: every
 * corner lies on the 4 m mesh's own triangles, raised by a few decimetres of the
 * dome's profile, and its rim sinks under. Each corner is raised only as far as the
 * mapped rock reaches, and sinks again at water, a carriageway or the rock's edge,
 * so the outcrop's outline is the map's and a shore slab slides under the sea.
 *
 * It wears the ground's own colour, the photo and its baked shade as the terrain
 * has them and its granite red over the photo's bleached pale (`rockFloor`), with
 * the kit's crystals and cracks over it, and the grass a spring photo shows on thin
 * turf turned to rock. Its light
 * is the ground's, times how much more or less its own facets face the sun than the
 * ground under them. So from afar an outcrop is the photo, and it ends by
 * dissolving one place at a time where it is a few pixels high and the photo
 * already carries the rock. It ends inside the innermost ring of terrain, which is
 * exactly the mesh it lies on.
 *
 * Outcrops don't stop the car: they lift the drivable ground by a few decimetres at
 * most, where the rock under them is already the ground the car drives on.
 *
 * A boulder field (the mapped fields, `fieldsAt`) is a carpet of stones the ice
 * dumped, too many to list: the ground's relief carries them from afar, and close
 * up they stand on it as a second planting of the kit's boulder, small and many.
 * They don't stop the car either: a field's biggest stones are listed as boulders,
 * which do.
 */

const LATTICE: Lattice = { stepM: 7, ends: [180, 230, 30], salt: 517.3 };
/** The widest an outcrop reaches from its place: the kit's longest dome at its largest size. */
const WIDEST_M = 9;
/** The band near and far versions trade pixels over, either side of the swap: the kit's, for its own size, times a place's size. */
const SWAP_BAND = 0.15;

/** The mapped rock's share at a place, from none to all, and at a corner, from where it sinks to where it lifts fully. */
const ROCK_HERE = [0.4, 0.9] as const;
const ROCK_EDGE = [0.25, 0.75] as const;
/** Under trees, a share of rock's places: the forest floor on rock is moss and needles over much of it. */
const TREES_M = [2, 8] as const;
const UNDER_TREES = 0.45;
const PLACED = 0.6;
/** A place stands off the carriageway at the mask's own 4 m; its corners keep off the road by sinking. */
const ROAD_CLEAR = 0.05;
const LEAST_DRY = 0.9;
/** A corner sinks over this much carriageway or water. */
const ROAD_SINKS = [0.02, 0.15] as const;
const WATER_SINKS = [0.1, 0.5] as const;

const SIZES = [0.5, 1.1] as const;
/** How high an outcrop's crown rises over the ground under it, and how far its rim sinks below. */
const LIFTS_M = [0.12, 0.35] as const;
const SINK_M = 0.4;

/** How much of the photo's thin turf on rock turns to rock. */
const TURF_GREYED = 0.7;
/** How much of the kit's crystals, cracks and lichen an outcrop wears over the photo's colour, and how much lichen takes to a face that looks up. */
const SURFACE = 0.55;
const LICHEN_UPWARD = 0.6;
/** The share of an outcrop's height above ground that moss reaches from its foot. */
const MOSS_FOOT = 3;

// As the rural kit lights its own.
const AMBIENT = 0.68;
const SUN_SHARE = 0.5;

/** Outcrops lie on a share of rock's places, and rock is a share of what's in reach. */
const MOST_OUTCROPS = 0.3;
const SEEDS = [3, 24] as const;

/** How big a field's stones are, as shares of the kit's boulder, about a metre and a half across: from a third of a metre to three quarters. */
const STONE_SIZES = [0.2, 0.5] as const;
/**
 * A stone lasts until it is about three pixels across on the floor's screen (1440 pixels over a 60° view): this many
 * metres away for each of the kit's boulders it measures, a metre and a half across. A small stone goes sooner than a big
 * one, each dissolving over the last share of its own reach, so none is seen to come or go.
 */
const STONE_REACH_PER_SIZE = 690;
const STONE_DISSOLVING = 0.15;
const STONES: Lattice = { stepM: 0.9, ends: [STONE_REACH_PER_SIZE * STONE_SIZES[1], STONE_REACH_PER_SIZE * STONE_SIZES[1], 0], salt: 911.7 };
/** The most boulder field within the stones' reach anywhere on the island, measured over every tile's fields: L3122B's. */
const MOST_FIELD_M2 = 85_000;
/** The field's share at a place, from no stones to its most. */
const FIELD_HERE = [0.25, 0.75] as const;
const MOST_STONES = 0.85;
const STONE_PARTS: RuralPart[] = ["field-stone", "field-stone-pink", "rapakivi"];
/** Stones sit a little into the ground, as a share of their size. */
const STONE_SINK = 0.05;

function tallest(shape: BufferGeometry): number {
  const position = shape.getAttribute("position");
  let top = 0;
  for (let at = 0; at < position.count; at++) top = Math.max(top, position.getY(at));
  return top;
}

export interface GraniteInputs {
  rockAt: (place: Node<"vec2">, mip: number) => Node<"float">;
  fieldsAt: (place: Node<"vec2">) => Node<"float">;
  canopyAt: (place: Node<"vec2">, mip: number) => Node<"float">;
  waterAt: (place: Node<"vec2">, mip: number) => Node<"float">;
  roadsAt: (place: Node<"vec2">, mip: number) => Node<"float">;
  landAt: LandAt;
  closeLandAt: (place: Node<"vec2">) => { photo: Node<"vec3">; shade: Node<"float"> };
  /** The ground at a place, for whether an outcrop's place is in view. */
  groundAt: (place: Node<"vec2">) => Node<"float">;
  /** The ground on the drawn mesh's own triangles, which an outcrop lies on. */
  groundOnMeshAt: (place: Node<"vec2">) => Node<"float">;
  lightOf: (shade: Node<"float">) => Node<"float">;
  linear: (name: string) => Vector3;
  colour: RoadsideInputs["colour"];
  hazed: (color: Node<"vec3">) => Node<"vec3">;
  litterColour: Node<"vec3">;
  sun: RoadsideInputs["sun"];
}

export interface GraniteDrawn {
  near: number;
  far: number;
  stones: number;
  triangles: number;
}

/** The outcrops and the field's stones, every one of which the LOD check measures. */
export const graniteModels = () => ({ outcrops: SEEDS.map((seed) => buildOutcrop(seed)), stones: ROCK_SEEDS.map((seed) => buildBoulder(seed)) });

export function createGranite(scene: Scene, renderer: WebGPURenderer, inputs: GraniteInputs) {
  const { rockAt, fieldsAt, canopyAt, waterAt, roadsAt, landAt, closeLandAt, groundAt, groundOnMeshAt, lightOf, linear, colour, hazed, litterColour, sun } = inputs;
  const { outcrops: models, stones: boulders } = graniteModels();
  const fars = models.map(({ far }) => {
    if (far === null) throw new Error("The kit's outcrop has no far version");
    return far;
  });
  const tallsOf = uniformArray(models.map(({ near }) => tallest(near)), "float");

  const toSun = towardsSun(sun);
  const lightOn = (normal: Node<"vec3">) => float(AMBIENT).add(normal.dot(toSun).max(0).mul(SUN_SHARE));
  const pattern = fract(fract(dot(screenCoordinate.xy, vec2(0.06711056, 0.00583715))).mul(52.9829189));
  const graniteColour = ruralColours(linear)[RURAL_PARTS.indexOf("rapakivi")];
  const granite = vec3(graniteColour.x, graniteColour.y, graniteColour.z);
  const stoneColours = uniformArray(STONE_PARTS.map((part) => ruralColours(linear)[RURAL_PARTS.indexOf(part)]), "vec3");

  const capacity = Math.ceil(placesWithin(reachOf(LATTICE), LATTICE.stepM) * MOST_OUTCROPS);
  const nearCapacity = placesWithin(Math.max(...models.map(({ swapM }) => swapM)) * SIZES[1] * (1 + SWAP_BAND) + WIDEST_M, LATTICE.stepM);

  const planting = createPlanting(scene, renderer, {
    lattices: [LATTICE],
    widestM: WIDEST_M,
    shapes: [...fars, ...models.map(({ near }) => near)],
    capacities: [...models.map(() => capacity), ...models.map(() => nearCapacity)],
    rows: 3,
    visit({ seed, place, distance, seenOn, left, write }) {
      const chance = roll(seed, 12).toVar();
      If(landAt(place).dry.greaterThan(LEAST_DRY).and(roadsAt(place, 0).lessThan(ROAD_CLEAR)), () => {
        const rock = smoothstep(float(ROCK_HERE[0]), float(ROCK_HERE[1]), rockAt(place, 0));
        const open = float(1).sub(smoothstep(float(TREES_M[0]), float(TREES_M[1]), canopyAt(place, 0)));
        If(chance.lessThan(rock.mul(mix(float(UNDER_TREES), float(1), open)).mul(PLACED)), () => {
          const ground = groundAt(place).toVar();
          If(seenOn(ground), () => {
            const kind = select(roll(seed, 9).lessThan(0.5), float(0), float(1)).toVar();
            const size = mix(float(SIZES[0]), float(SIZES[1]), roll(seed, 10));
            const lift = mix(float(LIFTS_M[0]), float(LIFTS_M[1]), roll(seed, 13));
            const remaining = left().toVar();
            const standing = vec4(place.x, ground, place.y, roll(seed, 11).mul(6.283)).toVar();
            const shape = vec4(lift, 0, 0, 0);
            models.forEach((model, index) => {
              If(kind.equal(index), () => {
                const swap = smoothstep(size.mul(model.swapM * (1 - SWAP_BAND)), size.mul(model.swapM * (1 + SWAP_BAND)), distance).toVar();
                If(swap.greaterThan(0).and(remaining.greaterThan(0)), () => {
                  write(index, [standing, vec4(float(1).sub(swap), remaining, size, kind), shape]);
                });
                If(swap.lessThan(1), () => {
                  write(models.length + index, [standing, vec4(0, float(1).sub(swap), size, kind), shape]);
                });
              });
            });
          });
        });
      });
    },
    materialOf(_, [standing, live, shape]) {
      const local = positionGeometry;
      const size = live.z;
      const [yawCos, yawSin] = [cos(standing.w), sin(standing.w)];
      const offset = vec2(local.x.mul(yawCos).add(local.z.mul(yawSin)), local.z.mul(yawCos).sub(local.x.mul(yawSin))).mul(size).toVar();
      const spot = standing.xz.add(offset).toVar();
      const ground = groundOnMeshAt(spot).toVar();
      const profile = local.y.div(tallsOf.element(int(round(live.w))) as unknown as Node<"float">);
      const reaches = smoothstep(float(ROCK_EDGE[0]), float(ROCK_EDGE[1]), rockAt(spot, 0))
        .mul(float(1).sub(smoothstep(float(ROAD_SINKS[0]), float(ROAD_SINKS[1]), roadsAt(spot, 0))))
        .mul(float(1).sub(smoothstep(float(WATER_SINKS[0]), float(WATER_SINKS[1]), waterAt(spot, 0))));
      const lift = select(profile.lessThan(0), float(-SINK_M), mix(float(-SINK_M), profile.mul(shape.x), reaches)).toVar();
      // The ground's own slope under each corner, so the outcrop is lit only for how its facets differ from it.
      const east = groundOnMeshAt(spot.add(vec2(1, 0)));
      const south = groundOnMeshAt(spot.add(vec2(0, 1)));
      const groundNormal = varying(normalize(vec3(ground.sub(east), 1, ground.sub(south))));
      const foot = varying(lift.max(0).mul(MOSS_FOOT));
      // The crystals are laid in the outcrop's own metres: the world's are too coarse for them out here.
      const metres = varying(vec3(offset.x, ground.add(lift).sub(standing.y), offset.y).add(standing.w.mul(37)));

      const material = new MeshBasicNodeMaterial();
      material.positionNode = vec3(spot.x, ground.add(lift), spot.y);

      const facing = flatNormal();
      const upward = select(facing.y.lessThan(0), facing.negate(), facing);
      const relit = lightOn(upward).div(lightOn(groundNormal));
      const close = closeLandAt(positionWorld.xz);
      const photo = close.photo.pow(vec3(2.2));
      const kinds = groundKinds(photo);
      // A spring photo shows thin turf on rock as grass: under an outcrop it's rock.
      const floor = rockFloor(groundFloor(photo, litterColour, kinds), granite, float(1), kinds.grassShare.mul(float(1).sub(TURF_GREYED)));
      const away = positionWorld.sub(cameraPosition).length();
      const crystals = mix(vec3(1), rapakivi({ colour }, granite, metres, away, abs(upward.y).mul(LICHEN_UPWARD), foot).div(granite), SURFACE);
      material.colorNode = hazed(floor.mul(crystals).mul(lightOf(close.shade)).mul(relit));

      const pixels = varying(vec2(live.x, live.y));
      material.maskNode = pattern.greaterThanEqual(pixels.x).and(pattern.lessThan(pixels.y)).and(outsideCar());
      material.side = DoubleSide;
      return material;
    },
  });

  const stoneShapes = [
    ...boulders.map(({ far }) => {
      if (far === null) throw new Error("The kit's boulder has no far version");
      return far;
    }),
    ...boulders.map(({ near }) => near),
  ];
  const stoneCapacity = Math.ceil((Math.min(placesWithin(reachOf(STONES), STONES.stepM), MOST_FIELD_M2 / STONES.stepM ** 2) * MOST_STONES * 1.5) / boulders.length);
  const stoneSwapM = Math.max(...boulders.map(({ swapM }) => swapM)) * STONE_SIZES[1];
  const nearStoneCapacity = Math.ceil((placesWithin(stoneSwapM * (1 + SWAP_BAND), STONES.stepM) * MOST_STONES * 1.5) / boulders.length);
  const stones = createPlanting(scene, renderer, {
    lattices: [STONES],
    widestM: STONE_SIZES[1],
    shapes: stoneShapes,
    capacities: [...boulders.map(() => stoneCapacity), ...boulders.map(() => nearStoneCapacity)],
    rows: 2,
    visit({ seed, place, distance, seenOn, write }) {
      const chance = roll(seed, 14).toVar();
      If(landAt(place).dry.greaterThan(LEAST_DRY).and(roadsAt(place, 0).lessThan(ROAD_CLEAR)), () => {
        const field = smoothstep(float(FIELD_HERE[0]), float(FIELD_HERE[1]), fieldsAt(place));
        If(chance.lessThan(field.mul(MOST_STONES)), () => {
          const size = mix(float(STONE_SIZES[0]), float(STONE_SIZES[1]), roll(seed, 15));
          const ground = groundOnMeshAt(place).sub(size.mul(STONE_SINK)).toVar();
          If(seenOn(ground), () => {
            const kind = roll(seed, 16).mul(boulders.length).floor().toVar();
            const part = roll(seed, 17).mul(STONE_PARTS.length).floor();
            const standing = vec4(place.x, ground, place.y, roll(seed, 11).mul(6.283)).toVar();
            const reach = size.mul(STONE_REACH_PER_SIZE).toVar();
            const remaining = float(1).sub(smoothstep(reach.mul(1 - STONE_DISSOLVING), reach, distance)).toVar();
            boulders.forEach((boulder, index) => {
              If(kind.equal(index), () => {
                const swap = smoothstep(size.mul(boulder.swapM * (1 - SWAP_BAND)), size.mul(boulder.swapM * (1 + SWAP_BAND)), distance).toVar();
                If(swap.greaterThan(0).and(remaining.greaterThan(0)), () => {
                  write(index, [standing, vec4(float(1).sub(swap), remaining, size, part)]);
                });
                If(swap.lessThan(1), () => {
                  write(boulders.length + index, [standing, vec4(0, float(1).sub(swap), size, part)]);
                });
              });
            });
          });
        });
      });
    },
    materialOf(_, [standing, live]) {
      const local = positionGeometry;
      const [yawCos, yawSin] = [cos(standing.w), sin(standing.w)];
      const turned = vec3(local.x.mul(yawCos).add(local.z.mul(yawSin)), local.y, local.z.mul(yawCos).sub(local.x.mul(yawSin))).mul(live.z);
      const material = new MeshBasicNodeMaterial();
      material.positionNode = standing.xyz.add(turned);

      const facing = flatNormal();
      const upward = select(facing.y.lessThan(0), facing.negate(), facing);
      const close = closeLandAt(positionWorld.xz);
      const base = stoneColours.element(varying(int(round(live.w)))) as unknown as Node<"vec3">;
      const away = positionWorld.sub(cameraPosition).length();
      const foot = varying(local.y.mul(live.z).add(0.05).max(0).mul(MOSS_FOOT));
      const painted = rapakivi({ colour }, base, varying(turned.add(standing.w.mul(37))), away, abs(upward.y), foot);
      material.colorNode = hazed(painted.mul(lightOf(close.shade)).mul(lightOn(upward)));

      const pixels = varying(vec2(live.x, live.y));
      material.maskNode = pattern.greaterThanEqual(pixels.x).and(pattern.lessThan(pixels.y)).and(outsideCar());
      return material;
    },
  });

  return {
    update: (spot: Vector3, camera: PerspectiveCamera) => {
      planting.update(spot, camera);
      stones.update(spot, camera);
    },
    compile: async () => {
      await Promise.all([planting.compile(), stones.compile()]);
    },
    show: (shown: boolean) => {
      planting.show(shown);
      stones.show(shown);
    },
    drawn(): GraniteDrawn {
      const counts = planting.counts();
      const stoneCounts = stones.counts();
      return {
        far: counts.slice(0, models.length).reduce((sum, count) => sum + count, 0),
        near: counts.slice(models.length).reduce((sum, count) => sum + count, 0),
        stones: stoneCounts.reduce((sum, count) => sum + count, 0),
        triangles: planting.triangles(counts) + stones.triangles(stoneCounts),
      };
    },
    dispose: () => {
      planting.dispose();
      stones.dispose();
    },
  };
}
