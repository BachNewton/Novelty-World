import { BufferAttribute, BufferGeometry, DoubleSide, InstancedBufferAttribute, Matrix4, MeshBasicNodeMaterial, Vector3, type Mesh } from "three/webgpu";
import { attribute, cameraPosition, cos, float, mix, normalGeometry, normalize, positionGeometry, positionWorld, reflect, select, sin, smoothstep, uniform, vec3 } from "three/tsl";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { themeColor } from "@/shared/lib/three/theme-color";
import { AXLE_Y, groundY, type CarSpec } from "../cars/build";
import { buildCarArt } from "../cars/model";
import { CARS } from "../cars/specs";
import { seeded } from "../roadside/mesh";
import { placeModel, type Placement, type RoadsideInputs } from "../roadside/material";
import { yawAlong, type LinePoint } from "./place";

/*
 * Parked cars: `art/cars`' own far models, body and wheels joined, one draw call a
 * model however many stand there. The cars' material holds its paint as one uniform
 * per material, which would mean a draw call per paint per model, so these share a
 * material that reads a paint per instance and keeps only that material's sky and
 * road in the paint. Nothing here is a car of its own.
 */

/** The paints a parked car comes in: tokens, weighted towards the greys a real car park is. */
const PARKED_PAINTS = ["car-paint-white", "car-paint-silver", "car-paint-graphite", "car-paint-white", "car-paint-silver", "car-paint-graphite", "car-paint-navy", "car-paint-teal", "car-paint-forest", "car-paint-mustard", "car-body"];

const REACH_M = 300;
const GROW_SHARE = 0.14;
const AMBIENT = 0.6;
const SUN_SHARE = 0.62;
const LOW_SHADE = 0.62;
const SHADOW_LIFT_M = 0.02;
/** The dark patch stops short of the car's outline: it's opaque, so past the bodywork it would read as a black mat. */
const SHADOW_INSET_M = 0.14;

/** One car's far model as a single geometry, its origin on the road under the car's middle, with a dark patch beneath so it sits on the ground. */
function parkedGeometry(spec: CarSpec): BufferGeometry {
  const { body, wheel } = buildCarArt(spec, "far");
  const road = groundY(spec.wheel.radiusM);
  const pieces = [body.clone()];
  const [frontZ, rearZ] = spec.body.axleZ;
  for (const z of [frontZ, rearZ]) {
    for (const side of [-1, 1]) {
      const placed = wheel.clone();
      const turn = new Matrix4().makeRotationY(side < 0 ? Math.PI : 0);
      placed.applyMatrix4(new Matrix4().makeTranslation((side * spec.body.trackM) / 2, AXLE_Y, z).multiply(turn));
      pieces.push(placed);
    }
  }
  const [wide, long] = spec.shadowHalf;
  const [x, z, y] = [wide - SHADOW_INSET_M, long - SHADOW_INSET_M, road + SHADOW_LIFT_M];
  const under = themeColor("--color-aland-drive-car-under");
  const patch = new BufferGeometry();
  patch.setAttribute("position", new BufferAttribute(Float32Array.from([-x, y, -z, x, y, -z, x, y, z, -x, y, -z, x, y, z, -x, y, z]), 3));
  patch.setAttribute("normal", new BufferAttribute(Float32Array.from(Array.from({ length: 6 }, () => [0, 1, 0]).flat()), 3));
  patch.setAttribute("carColour", new BufferAttribute(Float32Array.from(Array.from({ length: 6 }, () => [under.r, under.g, under.b]).flat()), 3));
  patch.setAttribute("carFinish", new BufferAttribute(new Float32Array(24), 4));
  pieces.push(patch);
  const joined = mergeGeometries(pieces);
  joined.translate(0, -road, 0);
  return joined;
}

/** A parked car's look, one for all of them. */
export function parkedCarMaterial({ hazed, sun }: Pick<RoadsideInputs, "hazed" | "sun">): MeshBasicNodeMaterial {
  const azimuth = (sun.azimuthDeg * Math.PI) / 180;
  const elevation = (sun.elevationDeg * Math.PI) / 180;
  const toSun = uniform(new Vector3(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), -Math.cos(azimuth) * Math.cos(elevation)));
  const colour = (name: string) => uniform(themeColor(`--color-aland-drive-${name}`));
  const [sky, zenith, ground] = [colour("sky"), colour("water"), colour("car-reflect-ground")];

  const place = attribute<"vec4">("place", "vec4");
  const reach = attribute<"vec2">("reach", "vec2");
  const paint = attribute<"vec3">("paint", "vec3");
  const finish = attribute<"vec4">("carFinish", "vec4");
  const [yawCos, yawSin] = [cos(place.w), sin(place.w)];
  const distance = place.xz.sub(cameraPosition.xz).length();
  const grown = float(1).sub(smoothstep(reach.y.mul(1 - GROW_SHARE), reach.y, distance));
  const size = select(distance.lessThan(reach.y), grown, float(0));
  const { x, y, z } = positionGeometry;
  const normal = normalize(vec3(normalGeometry.x.mul(yawCos).add(normalGeometry.z.mul(yawSin)), normalGeometry.y, normalGeometry.z.mul(yawCos).sub(normalGeometry.x.mul(yawSin))));

  const isPaint = finish.x.greaterThan(0.999);
  const mirror = select(isPaint, finish.x.sub(1), finish.x);
  const base = select(isPaint, paint, attribute<"vec3">("carColour", "vec3"));
  const toCamera = normalize(cameraPosition.sub(positionWorld));
  const ray = reflect(toCamera.negate(), normal);
  const reflected = mix(ground, mix(sky, zenith, smoothstep(float(0.05), float(0.7), ray.y)), smoothstep(float(-0.1), float(-0.01), ray.y));
  const lowShade = mix(float(LOW_SHADE), float(1), smoothstep(float(0.25), float(0.85), positionGeometry.y));
  const lit = float(AMBIENT).mul(lowShade).add(normal.dot(toSun).max(0).mul(SUN_SHARE));
  const fresnel = mirror.add(float(1).sub(mirror).mul(float(1).sub(normal.dot(toCamera).max(0)).pow(5)).mul(finish.y));

  const material = new MeshBasicNodeMaterial();
  material.positionNode = vec3(place.x.add(x.mul(yawCos).add(z.mul(yawSin)).mul(size)), place.y.add(y.mul(size)), place.z.add(z.mul(yawCos).sub(x.mul(yawSin)).mul(size)));
  material.colorNode = hazed(mix(base.mul(lit), reflected.mul(lowShade), fresnel));
  material.side = DoubleSide;
  return material;
}

export interface ParkedCar extends Placement {
  /** Which of `CARS`, and a paint's colour token without the `--color-aland-drive-` prefix. */
  car: number;
  paint: string;
}

/** Bays along a line: `amenity=parking`'s bays, or a street's kerb. A seeded share of them hold a car, of a seeded model and paint. */
export function parkingBays(from: LinePoint, to: LinePoint, { bayM, fill, seed, nose }: { bayM: number; fill: number; seed: number; nose: "kerbside" | "in" }): ParkedCar[] {
  const random = seeded(seed);
  const length = Math.hypot(to.x - from.x, to.z - from.z);
  const [dx, dz] = [(to.x - from.x) / length, (to.z - from.z) / length];
  const along = yawAlong(dx, dz);
  const bays = Math.floor(length / bayM);
  const cars: ParkedCar[] = [];
  for (let bay = 0; bay < bays; bay++) {
    const [taken, car, paint, turned, jitter] = [random(), random(), random(), random(), random()];
    if (taken > fill) continue;
    const share = (bay + 0.5) / bays;
    // A car's nose is its -z: in a bay it faces in or out, at a kerb the way the line runs, so give a kerb's line the way its traffic goes.
    const yaw = nose === "in" ? along + (turned < 0.8 ? 0 : Math.PI) : along - Math.PI / 2;
    cars.push({ x: from.x + (to.x - from.x) * share, y: from.y + (to.y - from.y) * share, z: from.z + (to.z - from.z) * share, yaw: yaw + (jitter - 0.5) * 0.03, car: Math.floor(car * CARS.length), paint: PARKED_PAINTS[Math.floor(paint * PARKED_PAINTS.length)] });
  }
  return cars;
}

/** Every parked car, a mesh for each model that's parked: add them to the scene once. */
export function placeParkedCars(cars: readonly ParkedCar[], material: MeshBasicNodeMaterial): Mesh[] {
  return CARS.flatMap((spec, index) => {
    const places = cars.filter(({ car }) => car === index);
    if (places.length === 0) return [];
    const mesh = placeModel({ near: parkedGeometry(spec), far: null, swapM: REACH_M, reachM: REACH_M }, places, { near: material, far: material })[0];
    const paints = new Float32Array(places.length * 3);
    places.forEach(({ paint }, at) => {
      const { r, g, b } = themeColor(`--color-aland-drive-${paint}`);
      paints.set([r, g, b], at * 3);
    });
    mesh.geometry.setAttribute("paint", new InstancedBufferAttribute(paints, 3));
    return [mesh];
  });
}
