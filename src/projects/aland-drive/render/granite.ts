import { DoubleSide, MeshBasicNodeMaterial, Vector3, type BufferGeometry, type Node, type PerspectiveCamera, type Scene, type WebGPURenderer } from "three/webgpu";
import { abs, cameraPosition, cos, cross, dFdx, dFdy, dot, float, fract, If, int, mix, normalize, positionGeometry, positionWorld, screenCoordinate, select, sin, smoothstep, uniform, uniformArray, varying, vec2, vec3, vec4 } from "three/tsl";
import { buildOutcrop, rapakivi, RURAL_PARTS, ruralColours } from "../art/rural";
import type { RoadsideInputs } from "../art/roadside";
import { groundFloor, groundKinds } from "../art/surfaces";
import { createPlanting, placesWithin, reachOf, roll, type Lattice } from "./planting";
import type { LandAt } from "./tile-reads";

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
 * has them, with the kit's crystals and cracks over it, a little of the kit's pink
 * near, and the grass a spring photo shows on thin turf turned rock-grey. Its light
 * is the ground's, times how much more or less its own facets face the sun than the
 * ground under them. So from afar an outcrop is the photo, and it ends by
 * dissolving one place at a time where it is a few pixels high and the photo
 * already carries the rock. It ends inside the innermost ring of terrain, which is
 * exactly the mesh it lies on.
 *
 * Outcrops don't stop the car: they lift the drivable ground by a few decimetres at
 * most, where the rock under them is already the ground the car drives on.
 */

const LATTICE: Lattice = { stepM: 7, ends: [180, 230, 30], salt: 517.3 };
/** The widest an outcrop reaches from its place: the kit's longest dome at its largest size. */
const WIDEST_M = 9;
const SWAP_M = 90;
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

/** The kit's pink on an outcrop, near, and how much of the photo's thin turf on rock turns grey. */
const PINK = 0.15;
const PINK_GONE = [40, 140] as const;
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
const LUMINANCE = vec3(0.2126, 0.7152, 0.0722);

function tallest(shape: BufferGeometry): number {
  const position = shape.getAttribute("position");
  let top = 0;
  for (let at = 0; at < position.count; at++) top = Math.max(top, position.getY(at));
  return top;
}

export interface GraniteInputs {
  rockAt: (place: Node<"vec2">, mip: number) => Node<"float">;
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
  triangles: number;
}

export function createGranite(scene: Scene, renderer: WebGPURenderer, inputs: GraniteInputs) {
  const { rockAt, canopyAt, waterAt, roadsAt, landAt, closeLandAt, groundAt, groundOnMeshAt, lightOf, linear, colour, hazed, litterColour, sun } = inputs;
  const models = SEEDS.map((seed) => buildOutcrop(seed));
  const fars = models.map(({ far }) => {
    if (far === null) throw new Error("The kit's outcrop has no far version");
    return far;
  });
  const tallsOf = uniformArray(models.map(({ near }) => tallest(near)), "float");

  const azimuth = (sun.azimuthDeg * Math.PI) / 180;
  const elevation = (sun.elevationDeg * Math.PI) / 180;
  const toSun = uniform(new Vector3(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), -Math.cos(azimuth) * Math.cos(elevation)));
  const lightOn = (normal: Node<"vec3">) => float(AMBIENT).add(normal.dot(toSun).max(0).mul(SUN_SHARE));
  const pattern = fract(fract(dot(screenCoordinate.xy, vec2(0.06711056, 0.00583715))).mul(52.9829189));
  const graniteColour = ruralColours(linear)[RURAL_PARTS.indexOf("rapakivi")];
  const granite = vec3(graniteColour.x, graniteColour.y, graniteColour.z);

  const capacity = Math.ceil(placesWithin(reachOf(LATTICE), LATTICE.stepM) * MOST_OUTCROPS);
  const nearCapacity = placesWithin(SWAP_M * (1 + SWAP_BAND) + WIDEST_M, LATTICE.stepM);

  const planting = createPlanting(scene, renderer, {
    lattices: [LATTICE],
    widestM: WIDEST_M,
    shapes: [...fars, ...models.map(({ near }) => near)],
    capacities: [...models.map(() => capacity), ...models.map(() => nearCapacity)],
    rows: 3,
    visit({ seed, place, distance, seenOn, left, write }) {
      const chance = roll(seed, 41.3, 17.9).toVar();
      If(landAt(place).dry.greaterThan(LEAST_DRY).and(roadsAt(place, 0).lessThan(ROAD_CLEAR)), () => {
        const rock = smoothstep(float(ROCK_HERE[0]), float(ROCK_HERE[1]), rockAt(place, 0));
        const open = float(1).sub(smoothstep(float(TREES_M[0]), float(TREES_M[1]), canopyAt(place, 0)));
        If(chance.lessThan(rock.mul(mix(float(UNDER_TREES), float(1), open)).mul(PLACED)), () => {
          const ground = groundAt(place).toVar();
          If(seenOn(ground), () => {
            const kind = select(roll(seed, 54.1, 18.7).lessThan(0.5), float(0), float(1)).toVar();
            const size = mix(float(SIZES[0]), float(SIZES[1]), roll(seed, 73.31, 29.47));
            const lift = mix(float(LIFTS_M[0]), float(LIFTS_M[1]), roll(seed, 11.7, 83.1));
            const swap = smoothstep(float(SWAP_M * (1 - SWAP_BAND)), float(SWAP_M * (1 + SWAP_BAND)), distance).toVar();
            const remaining = left().toVar();
            const standing = vec4(place.x, ground, place.y, roll(seed, 29.3, 61.7).mul(6.283)).toVar();
            const shape = vec4(lift, 0, 0, 0);
            models.forEach((_, index) => {
              If(kind.equal(index), () => {
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
      const spot = standing.xz.add(vec2(local.x.mul(yawCos).add(local.z.mul(yawSin)), local.z.mul(yawCos).sub(local.x.mul(yawSin))).mul(size)).toVar();
      const ground = groundOnMeshAt(spot).toVar();
      const profile = local.y.div(tallsOf.element(int(live.w)) as unknown as Node<"float">);
      const reaches = smoothstep(float(ROCK_EDGE[0]), float(ROCK_EDGE[1]), rockAt(spot, 0))
        .mul(float(1).sub(smoothstep(float(ROAD_SINKS[0]), float(ROAD_SINKS[1]), roadsAt(spot, 0))))
        .mul(float(1).sub(smoothstep(float(WATER_SINKS[0]), float(WATER_SINKS[1]), waterAt(spot, 0))));
      const lift = select(profile.lessThan(0), float(-SINK_M), mix(float(-SINK_M), profile.mul(shape.x), reaches)).toVar();
      // The ground's own slope under each corner, so the outcrop is lit only for how its facets differ from it.
      const east = groundOnMeshAt(spot.add(vec2(1, 0)));
      const south = groundOnMeshAt(spot.add(vec2(0, 1)));
      const groundNormal = varying(normalize(vec3(ground.sub(east), 1, ground.sub(south))));
      const foot = varying(lift.max(0).mul(MOSS_FOOT));

      const material = new MeshBasicNodeMaterial();
      material.positionNode = vec3(spot.x, ground.add(lift), spot.y);

      const facing = normalize(cross(dFdx(positionWorld), dFdy(positionWorld)));
      const upward = select(facing.y.lessThan(0), facing.negate(), facing);
      const relit = lightOn(upward).div(lightOn(groundNormal));
      const close = closeLandAt(positionWorld.xz);
      const photo = close.photo.pow(vec3(2.2));
      const kinds = groundKinds(photo);
      const floor = groundFloor(photo, litterColour, kinds);
      const brightness = dot(floor, LUMINANCE).max(1e-4);
      // A spring photo shows thin turf on rock as grass; the rock itself is as bright, and grey.
      const rocky = mix(floor, vec3(brightness), kinds.grassShare.mul(TURF_GREYED));
      const away = positionWorld.sub(cameraPosition).length();
      const pink = granite.mul(brightness.div(dot(granite, LUMINANCE)));
      const tinted = mix(rocky, pink, float(1).sub(smoothstep(float(PINK_GONE[0]), float(PINK_GONE[1]), away)).mul(PINK));
      const crystals = mix(vec3(1), rapakivi({ colour }, granite, positionWorld, away, abs(upward.y).mul(LICHEN_UPWARD), foot).div(granite), SURFACE);
      material.colorNode = hazed(tinted.mul(crystals).mul(lightOf(close.shade)).mul(relit));

      const pixels = varying(vec2(live.x, live.y));
      material.maskNode = pattern.greaterThanEqual(pixels.x).and(pattern.lessThan(pixels.y));
      material.side = DoubleSide;
      return material;
    },
  });

  return {
    update: (spot: Vector3, camera: PerspectiveCamera) => {
      planting.update(spot, camera);
    },
    compile: planting.compile,
    show: planting.show,
    drawn(): GraniteDrawn {
      const counts = planting.counts();
      return { far: counts.slice(0, models.length).reduce((sum, count) => sum + count, 0), near: counts.slice(models.length).reduce((sum, count) => sum + count, 0), triangles: planting.triangles(counts) };
    },
    dispose: planting.dispose,
  };
}
