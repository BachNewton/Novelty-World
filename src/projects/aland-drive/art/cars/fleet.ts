import { BufferAttribute, BufferGeometry, DynamicDrawUsage, InstancedBufferAttribute, InstancedBufferGeometry, Matrix4, Mesh, type Node } from "three/webgpu";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { themeColor } from "@/shared/lib/three/theme-color";
import { buildDistant } from "./body";
import { AXLE_Y, buildCarParts, groundY, type CarSpec } from "./build";
import { SURFACES, type Soup } from "./mesh";
import { geometryOf, worldCarMaterial } from "./material";

/*
 * World cars, parked or in traffic: one draw call per model and tier however
 * many there are, with paint, a little height, a roof rack and the plate's band
 * per instance. Body and wheels are one geometry with its origin on the road, so
 * a world car's wheels don't turn: they have no spokes to see. Moving one writes
 * four numbers.
 */

/** Past this a car is its stand-in, and past `REACH_M` it's gone. */
const SWAP_M = 120;
const REACH_M = 900;
const SHADOW_LIFT_M = 0.02;
const SHADOW_INSET_M = 0.14;

/** What cars on a Nordic road are painted, by how many of them: greys, whites and blacks, then the rest. */
const NORDIC_PAINTS = [
  ["car-paint-silver", 22],
  ["car-paint-white", 20],
  ["car-paint-black", 15],
  ["car-paint-grey", 14],
  ["car-paint-graphite", 10],
  ["car-paint-navy", 9],
  ["car-body", 5],
  ["car-paint-forest", 2],
  ["car-paint-sky", 2],
  ["car-paint-oxblood", 1],
] as const;

const HEIGHT_SPREAD = 0.025;
const RACK_SHARE = 0.12;
const BAND_SHARE = 0.7;

/** The same seed gives the same car, whenever it comes back. */
const roll = (seed: number, salt: number) => {
  const raw = Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453;
  return raw - Math.floor(raw);
};

export interface CarLook {
  paint: string;
  height: number;
  rack: boolean;
  plateBand: boolean;
}

/** A seeded car's small differences. A spec with its own livery keeps its paint. */
export function lookOf(spec: CarSpec, seed: number): CarLook {
  let left = roll(seed, 1) * NORDIC_PAINTS.reduce((sum, [, share]) => sum + share, 0);
  const picked = NORDIC_PAINTS.find(([, share]) => (left -= share) < 0) ?? NORDIC_PAINTS[0];
  return {
    paint: spec.livery ? spec.paint : picked[0],
    height: 1 + (roll(seed, 2) - 0.5) * HEIGHT_SPREAD,
    rack: !spec.livery && roll(seed, 3) < RACK_SHARE,
    plateBand: roll(seed, 4) < BAND_SHARE,
  };
}

function withOptions(soup: Soup): BufferGeometry {
  const geometry = geometryOf(soup);
  const [rack, band] = [SURFACES.indexOf("rack"), SURFACES.indexOf("plateBand")];
  geometry.setAttribute("carOption", new BufferAttribute(Float32Array.from(soup.surfaces, (surface) => (surface === rack ? 1 : surface === band ? 2 : 0)), 1));
  return geometry;
}

/** A dark patch under a car, so it sits on the ground with no transparent draw. */
function patchUnder(spec: CarSpec, road: number): BufferGeometry {
  const [wide, long] = spec.shadowHalf;
  const [x, z, y] = [wide - SHADOW_INSET_M, long - SHADOW_INSET_M, road + SHADOW_LIFT_M];
  const { r, g, b } = themeColor("--color-aland-drive-car-under");
  const patch = new BufferGeometry();
  patch.setAttribute("position", new BufferAttribute(Float32Array.from([-x, y, -z, -x, y, z, x, y, z, -x, y, -z, x, y, z, x, y, -z]), 3));
  patch.setAttribute("normal", new BufferAttribute(Float32Array.from(Array.from({ length: 6 }, () => [0, 1, 0]).flat()), 3));
  patch.setAttribute("carColour", new BufferAttribute(Float32Array.from(Array.from({ length: 6 }, () => [r, g, b]).flat()), 3));
  patch.setAttribute("carFinish", new BufferAttribute(new Float32Array(24), 4));
  patch.setAttribute("carOption", new BufferAttribute(new Float32Array(6), 1));
  return patch;
}

/** One car's world model, its origin on the road under its middle. */
export function worldGeometry(spec: CarSpec): BufferGeometry {
  const parts = buildCarParts(spec, "far", true);
  const road = groundY(spec.wheel.radiusM);
  const pieces: BufferGeometry[] = [withOptions(parts.body)];
  const wheel = withOptions(parts.wheel);
  for (const z of spec.body.axleZ) {
    for (const side of [-1, 1]) {
      const placed = wheel.clone();
      placed.applyMatrix4(new Matrix4().makeTranslation((side * spec.body.trackM) / 2, AXLE_Y, z).multiply(new Matrix4().makeRotationY(side < 0 ? Math.PI : 0)));
      pieces.push(placed);
    }
  }
  pieces.push(patchUnder(spec, road));
  const joined = mergeGeometries(pieces);
  joined.translate(0, -road, 0);
  return joined;
}

/** One car's stand-in, about thirty triangles of its outline. */
export function distantGeometry(spec: CarSpec): BufferGeometry {
  const road = groundY(spec.wheel.radiusM);
  const geometry = withOptions(buildDistant(spec.body, road));
  geometry.translate(0, -road, 0);
  return geometry;
}

export const triangleCounts = (spec: CarSpec) => ({
  world: worldGeometry(spec).getAttribute("position").count / 3,
  distant: distantGeometry(spec).getAttribute("position").count / 3,
});

export interface FleetCar {
  spec: CarSpec;
  x: number;
  /** The road's height under the car. */
  y: number;
  z: number;
  /** Radians anticlockwise, the same as `headingOf`. */
  yaw: number;
  seed: number;
}

interface Batch {
  places: InstancedBufferAttribute;
  meshes: Mesh[];
}

/** Every car given, on a few draw calls: two per model. `meshes` go in the scene; `move` shifts one car. */
export function createCarFleet(cars: readonly FleetCar[], sun: { azimuthDeg: number; elevationDeg: number }, hazed?: (color: Node<"vec3">) => Node<"vec3">) {
  const tier = (name: "world" | "distant") => worldCarMaterial({ sun, hazed, tier: name, swapM: SWAP_M, reachM: REACH_M });
  const materials = { world: tier("world"), distant: tier("distant") };
  const bySpec = new Map<CarSpec, FleetCar[]>();
  for (const car of cars) bySpec.set(car.spec, [...(bySpec.get(car.spec) ?? []), car]);

  const geometries: BufferGeometry[] = [];
  const batches = new Map<FleetCar, { batch: Batch; index: number }>();
  const meshes: Mesh[] = [];
  for (const [spec, own] of bySpec) {
    const places = new InstancedBufferAttribute(new Float32Array(own.length * 4), 4);
    places.setUsage(DynamicDrawUsage);
    const paints = new InstancedBufferAttribute(new Float32Array(own.length * 3), 3);
    const looks = new InstancedBufferAttribute(new Float32Array(own.length * 3), 3);
    const batch: Batch = { places, meshes: [] };
    own.forEach((car, index) => {
      const look = lookOf(spec, car.seed);
      const { r, g, b } = themeColor(`--color-aland-drive-${look.paint}`);
      places.setXYZW(index, car.x, car.y, car.z, car.yaw);
      paints.setXYZ(index, r, g, b);
      looks.setXYZ(index, look.height, look.rack ? 1 : 0, look.plateBand ? 1 : 0);
      batches.set(car, { batch, index });
    });
    const parts = [
      [worldGeometry(spec), materials.world],
      [distantGeometry(spec), materials.distant],
    ] as const;
    for (const [shape, material] of parts) {
      const geometry = new InstancedBufferGeometry();
      geometry.setAttribute("position", shape.getAttribute("position"));
      geometry.setAttribute("normal", shape.getAttribute("normal"));
      geometry.setAttribute("carColour", shape.getAttribute("carColour"));
      geometry.setAttribute("carFinish", shape.getAttribute("carFinish"));
      geometry.setAttribute("carOption", shape.getAttribute("carOption"));
      geometry.setAttribute("place", places);
      geometry.setAttribute("paint", paints);
      geometry.setAttribute("look", looks);
      geometry.instanceCount = own.length;
      geometries.push(geometry);
      const mesh = new Mesh(geometry, material);
      mesh.frustumCulled = false;
      meshes.push(mesh);
      batch.meshes.push(mesh);
    }
  }

  return {
    meshes,
    move(car: FleetCar, x: number, y: number, z: number, yaw: number) {
      const known = batches.get(car);
      if (!known) throw new Error(`${car.spec.name} is not in this fleet`);
      known.batch.places.setXYZW(known.index, x, y, z, yaw);
      known.batch.places.needsUpdate = true;
    },
    dispose() {
      geometries.forEach((geometry) => {
        geometry.dispose();
      });
      materials.world.dispose();
      materials.distant.dispose();
    },
  };
}
