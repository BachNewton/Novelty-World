import { BufferAttribute, BufferGeometry, DynamicDrawUsage, InstancedBufferAttribute, InstancedBufferGeometry, InterleavedBuffer, InterleavedBufferAttribute, Matrix4, Mesh, type Node } from "three/webgpu";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { themeColor } from "@/shared/lib/three/theme-color";
import { buildDistant } from "./body";
import { axleY, buildCarParts, groundY, type CarSpec } from "./build";
import { distantLamps, lampOptions, lampSpots, worldLamps } from "./indicators";
import { SURFACES, type Soup } from "./mesh";
import { geometryOf, worldCarMaterial } from "./material";

/*
 * World cars, parked or in traffic: one draw call per model and tier however
 * many there are, with paint, a little height, a roof rack and the plate's band
 * per instance. Body and wheels are one geometry with its origin on the road, so
 * a world car's wheels don't turn: they have no spokes to see. Moving one writes
 * four numbers, and its indicators one more (`signal`, see `worldCarMaterial`).
 */

/** Past this a car is its stand-in, and past `REACH_M` it's gone. */
export const SWAP_M = 120;
export const REACH_M = 900;

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

function withLamps(soup: Soup): BufferGeometry {
  const geometry = geometryOf(soup);
  geometry.setAttribute("carOption", new BufferAttribute(lampOptions(soup), 1));
  return geometry;
}

function withOptions(soup: Soup): BufferGeometry {
  const geometry = geometryOf(soup);
  const [rack, band] = [SURFACES.indexOf("rack"), SURFACES.indexOf("plateBand")];
  geometry.setAttribute("carOption", new BufferAttribute(Float32Array.from(soup.surfaces, (surface) => (surface === rack ? 1 : surface === band ? 2 : 0)), 1));
  return geometry;
}

const PER_VERTEX = ["position", "normal", "carColour", "carFinish", "carOption"] as const;

/**
 * A shape's per-vertex attributes in one buffer. A WebGPU pipeline may read at most eight vertex buffers, and an
 * instanced world car reads four more of its own (place, paint, look and signal).
 */
function packed(geometry: BufferGeometry): BufferGeometry {
  const sources = PER_VERTEX.map((name) => geometry.getAttribute(name));
  const stride = sources.reduce((sum, source) => sum + source.itemSize, 0);
  const count = sources[0].count;
  const data = new Float32Array(count * stride);
  for (let vertex = 0; vertex < count; vertex++) {
    let at = vertex * stride;
    for (const source of sources) for (let component = 0; component < source.itemSize; component++) data[at++] = source.getComponent(vertex, component);
  }
  const buffer = new InterleavedBuffer(data, stride);
  const out = new BufferGeometry();
  let offset = 0;
  PER_VERTEX.forEach((name, index) => {
    out.setAttribute(name, new InterleavedBufferAttribute(buffer, sources[index].itemSize, offset));
    offset += sources[index].itemSize;
  });
  return out;
}

/** One car's world model, its origin on the road under its middle. */
export function worldGeometry(spec: CarSpec): BufferGeometry {
  const parts = buildCarParts(spec, "far", true);
  const road = groundY(spec);
  const pieces: BufferGeometry[] = [withOptions(parts.body), withLamps(worldLamps(lampSpots(parts.body)))];
  const wheel = withOptions(parts.wheel);
  for (const z of spec.body.axleZ) {
    for (const side of [-1, 1]) {
      const placed = wheel.clone();
      placed.applyMatrix4(new Matrix4().makeTranslation((side * spec.body.trackM) / 2, axleY(spec), z).multiply(new Matrix4().makeRotationY(side < 0 ? Math.PI : 0)));
      pieces.push(placed);
    }
  }
  const joined = mergeGeometries(pieces);
  joined.translate(0, -road, 0);
  return packed(joined);
}

/** One car's stand-in, about thirty triangles of its outline, and its indicators' lenses. */
export function distantGeometry(spec: CarSpec): BufferGeometry {
  const road = groundY(spec);
  const stand = buildDistant(spec.body, road);
  const spots = lampSpots(buildCarParts(spec, "far", true).body);
  const geometry = mergeGeometries([withOptions(stand), withLamps(distantLamps(stand, spots))]);
  geometry.translate(0, -road, 0);
  return packed(geometry);
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
  /** Its indicators, as `worldCarMaterial` reads them: off when left out. */
  signal?: number;
}

const placedMaterials = new Map<string, ReturnType<typeof worldCarMaterial>>();

/**
 * One world car alone at the origin, its world model or its stand-in, drawn by the parked cars' own material with its
 * swap at `swapM`: as the game shows it, for a check that compares the two.
 */
export function placeWorldCar(spec: CarSpec, seed: number, version: "near" | "far", swapM: number, sun: { azimuthDeg: number; elevationDeg: number }, hazed?: (color: Node<"vec3">) => Node<"vec3">): Mesh[] {
  const tier = version === "near" ? "world" : "distant";
  const key = `${tier} ${swapM}`;
  let material = placedMaterials.get(key);
  if (material === undefined) placedMaterials.set(key, (material = worldCarMaterial({ sun, hazed, tier, swapM, reachM: REACH_M })));
  const shape = version === "near" ? worldGeometry(spec) : distantGeometry(spec);
  const look = lookOf(spec, seed);
  const { r, g, b } = themeColor(`--color-aland-drive-${look.paint}`);
  const geometry = new InstancedBufferGeometry();
  for (const name of PER_VERTEX) geometry.setAttribute(name, shape.getAttribute(name));
  geometry.setAttribute("place", new InstancedBufferAttribute(new Float32Array([0, 0, 0, 0]), 4));
  geometry.setAttribute("paint", new InstancedBufferAttribute(new Float32Array([r, g, b]), 3));
  geometry.setAttribute("look", new InstancedBufferAttribute(new Float32Array([look.height, look.rack ? 1 : 0, look.plateBand ? 1 : 0]), 3));
  geometry.setAttribute("signal", new InstancedBufferAttribute(new Float32Array([0]), 1));
  geometry.instanceCount = 1;
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  return [mesh];
}

/** The first seed whose car carries everything it can: a rack, where it may have one, and the plate's band. */
export function fullestSeed(spec: CarSpec): number {
  for (let seed = 0; seed < 1000; seed++) {
    const look = lookOf(spec, seed);
    if ((look.rack || spec.livery === true) && look.plateBand) return seed;
  }
  throw new Error(`no seed gives ${spec.name} a rack and a band`);
}

interface Batch {
  places: InstancedBufferAttribute;
  signals: InstancedBufferAttribute;
  meshes: Mesh[];
}

/** Every car given, on a few draw calls: two per model. `meshes` go in the scene; `move` shifts one car and `signal` sets its indicators. */
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
    const signals = new InstancedBufferAttribute(Float32Array.from(own, (car) => car.signal ?? 0), 1);
    signals.setUsage(DynamicDrawUsage);
    const batch: Batch = { places, signals, meshes: [] };
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
      for (const name of PER_VERTEX) geometry.setAttribute(name, shape.getAttribute(name));
      geometry.setAttribute("place", places);
      geometry.setAttribute("paint", paints);
      geometry.setAttribute("look", looks);
      geometry.setAttribute("signal", signals);
      geometry.instanceCount = own.length;
      geometries.push(geometry);
      const mesh = new Mesh(geometry, material);
      mesh.frustumCulled = false;
      meshes.push(mesh);
      batch.meshes.push(mesh);
    }
  }

  const known = (car: FleetCar) => {
    const found = batches.get(car);
    if (!found) throw new Error(`${car.spec.name} is not in this fleet`);
    return found;
  };

  return {
    meshes,
    move(car: FleetCar, x: number, y: number, z: number, yaw: number) {
      const { batch, index } = known(car);
      batch.places.setXYZW(index, x, y, z, yaw);
      batch.places.needsUpdate = true;
    },
    signal(car: FleetCar, signal: number) {
      const { batch, index } = known(car);
      batch.signals.setX(index, signal);
      batch.signals.needsUpdate = true;
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
