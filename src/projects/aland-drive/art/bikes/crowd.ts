import { BufferAttribute, BufferGeometry, DynamicDrawUsage, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, StorageBufferAttribute, type Node } from "three/webgpu";
import { attribute, cameraPosition, cos, float, positionGeometry, sin, smoothstep, vec3 } from "three/tsl";
import { themeColor } from "@/shared/lib/three/theme-color";
import { buildBikeMesh, type BikeDetail } from "./build";
import { riderLook, type RiderLook } from "./look";
import { apply } from "./mat";
import { bikeGeometry, crowdBikeMaterial, DISSOLVE_SHARE, PLACE_ROW, riderTokens, ROWS_A_RIDER } from "./material";
import { bikeShadowMaterial, SHADOW, shadowLengthM, shadowQuad } from "./model";
import { poseBike, restMotion, stepMotion, stillInput, type RideInput, type RideMotion } from "./rig";
import { BIKES, type BikeSpec } from "./specs";
import "./tokens.css";
import { measuredSwapM } from "../lod-swaps";
import { type Sun } from "../sun";

/*
 * Cyclists on the roads, as many as the game has: every rider on one bike shares
 * that bike's two lists, near and far, so the draws don't grow with the riders.
 * Each rider is posed on the CPU as a single bike is (`poseBike`), and its
 * matrices, place and colours go to its list as rows the vertex shader reads by
 * instance, so a rider costs a few hundred numbers a frame and no draw call.
 */

/** Past this a cyclist isn't drawn: a rider 1.8 m tall is about five pixels on the floor's screen, and dissolves over the last of it. */
export const BIKE_REACH_M = 400;
/** Where a bike swaps to its far version when the LOD check hasn't measured it. */
const UNMEASURED_SWAP_M = 40;
/** How far the lists reach past where the shader shows a version, for an eye that isn't quite the camera. */
const LIST_SLACK_M = 1;
/** The rider the LOD check draws: the first with the most to lose, a helmet. */
const CHECKED_SEED = Array.from({ length: 100 }, (_, seed) => seed).find((seed) => riderLook(seed).helmet) ?? 0;

export interface CrowdRider {
  /** Stable while the rider lives: its pedalling is kept per id and dropped when the id stops appearing. */
  id: string;
  /** Scene metres: the bike's origin on the road, between the axles, `y` the road's height. */
  x: number;
  y: number;
  z: number;
  /** Radians anticlockwise from north, as the world cars: at 0 the nose faces -z. */
  yaw: number;
  input: RideInput;
  /** Which bike and which rider: the same seed is the same cyclist. */
  seed: number;
}

/** The bike a seed rides. Its rider's look is `riderLook(seed)`. */
export const bikeOf = (seed: number): BikeSpec => BIKES[(Math.imul(seed ^ 0x5bd1e995, 2654435761) >>> 16) % BIKES.length];

/** Which of a bike's lists a rider this far from the eye belongs on: both across the swap's dither, neither past the reach. */
export function listsAt(distanceM: number, swapM: number) {
  return {
    near: distanceM < swapM + LIST_SLACK_M,
    far: distanceM >= swapM * (1 - DISSOLVE_SHARE) - LIST_SLACK_M && distanceM < BIKE_REACH_M + LIST_SLACK_M,
  };
}

/** One version of a bike posed as the LOD check sees it, standing still on its wheels: what its swap is measured on. */
export function checkedGeometry(spec: BikeSpec, detail: BikeDetail): BufferGeometry {
  const look = riderLook(CHECKED_SEED);
  const { matrices } = poseBike(spec, stillInput(), restMotion(), { rider: true, helmet: look.helmet, hair: look.hairStyle });
  const mesh = buildBikeMesh(spec, detail);
  const positions = new Float32Array(mesh.positions.length);
  for (let vertex = 0; vertex < mesh.parts.length; vertex++) {
    const at = vertex * 3;
    positions.set(apply(matrices[mesh.parts[vertex]], [mesh.positions[at], mesh.positions[at + 1], mesh.positions[at + 2]]), at);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("surface", new BufferAttribute(mesh.surfaces, 1));
  return geometry;
}

/** Where a bike swaps to its far version, as the LOD check measured it. */
export const bikeSwapM = (spec: BikeSpec) => measuredSwapM(checkedGeometry(spec, "near"), checkedGeometry(spec, "far"), UNMEASURED_SWAP_M);

interface CrowdOptions {
  sun: Sun;
  hazed?: (color: Node<"vec3">) => Node<"vec3">;
}

/** One version of one bike, for up to `room` riders: one draw call. */
function crowdList(spec: BikeSpec, detail: BikeDetail, swapM: number, room: number, options: CrowdOptions) {
  const shape = bikeGeometry(buildBikeMesh(spec, detail));
  const data = new Float32Array(room * ROWS_A_RIDER * 4);
  const rows = new StorageBufferAttribute(data, 4);
  const geometry = new InstancedBufferGeometry();
  for (const name of ["position", "normal", "bikeTag"]) geometry.setAttribute(name, shape.getAttribute(name));
  geometry.instanceCount = 0;
  const material = crowdBikeMaterial({ ...options, spec, rows, tier: detail, swapM, reachM: BIKE_REACH_M });
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.visible = false;
  let count = 0;
  return {
    mesh,
    triangles: shape.getAttribute("position").count / 3,
    count: () => count,
    begin() {
      count = 0;
    },
    add(riderRows: Float32Array) {
      if (count === room) throw new Error(`more than ${room} riders on one ${spec.name} list`);
      data.set(riderRows, count * riderRows.length);
      count++;
    },
    end() {
      geometry.instanceCount = count;
      mesh.visible = count > 0;
      if (count === 0) return;
      rows.addUpdateRange(0, count * ROWS_A_RIDER * 4);
      rows.needsUpdate = true;
    },
    dispose() {
      shape.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
}

/** A rider's colours as `ROWS_A_RIDER`'s last rows: read from the stylesheet once, when the rider first appears. */
const coloursOf = (look: RiderLook) =>
  Float32Array.from(
    riderTokens(look).flatMap((name) => {
      const { r, g, b } = themeColor(`--color-aland-drive-${name}`);
      return [r, g, b, 0];
    }),
  );

/** A rider's rows: its pose's matrices, its place and its colours. */
function writeRider(into: Float32Array, matrices: readonly number[][], place: readonly [number, number, number, number], colours: Float32Array) {
  matrices.forEach((matrix, part) => {
    into.set(matrix, part * 16);
  });
  into.set(place, PLACE_ROW * 4);
  into.set(colours, (PLACE_ROW + 1) * 4);
  return into;
}

/** One cyclist alone at the origin, its near or far version, swapping at `swapM`: as the game draws it, for the LOD check. */
export function placeCrowdBike(spec: BikeSpec, version: BikeDetail, swapM: number, sun: Sun, hazed?: (color: Node<"vec3">) => Node<"vec3">): Mesh[] {
  const list = crowdList(spec, version, swapM, 1, { sun, hazed });
  const look = riderLook(CHECKED_SEED);
  const { matrices } = poseBike(spec, stillInput(), restMotion(), { rider: true, helmet: look.helmet, hair: look.hairStyle });
  list.begin();
  list.add(writeRider(new Float32Array(ROWS_A_RIDER * 4), matrices, [0, 0, 0, 0], coloursOf(look)));
  list.end();
  return [list.mesh];
}

interface Cyclist {
  seed: number;
  spec: BikeSpec;
  look: RiderLook;
  colours: Float32Array;
  motion: RideMotion;
}

/**
 * Cyclists by the crowd: two lists per bike and one of shadows, `room` riders at most. `draw` each frame with every
 * rider as it stands; the meshes go in the scene once.
 */
export function createBikeCrowd({ sun, hazed, room }: CrowdOptions & { room: number }) {
  const bikes = BIKES.map((spec) => {
    const swapM = bikeSwapM(spec);
    return { spec, swapM, near: crowdList(spec, "near", swapM, room, { sun, hazed }), far: crowdList(spec, "far", swapM, room, { sun, hazed }) };
  });
  const lists = bikes.flatMap(({ near, far }) => [near, far]);

  const shadowPlaces = new InstancedBufferAttribute(new Float32Array(room * 4), 4);
  const shadowSizes = new InstancedBufferAttribute(new Float32Array(room * 3), 3);
  shadowPlaces.setUsage(DynamicDrawUsage);
  shadowSizes.setUsage(DynamicDrawUsage);
  const quad = shadowQuad();
  const shadowGeometry = new InstancedBufferGeometry();
  shadowGeometry.setAttribute("position", quad.getAttribute("position"));
  shadowGeometry.setIndex(quad.getIndex());
  shadowGeometry.setAttribute("shadowPlace", shadowPlaces);
  shadowGeometry.setAttribute("shadowSize", shadowSizes);
  const place = attribute<"vec4">("shadowPlace", "vec4");
  const size = attribute<"vec3">("shadowSize", "vec3");
  const distance = place.xz.sub(cameraPosition.xz).length();
  const shadowMaterial = bikeShadowMaterial(float(1).sub(smoothstep(float(BIKE_REACH_M * (1 - DISSOLVE_SHARE)), float(BIKE_REACH_M), distance)));
  const [x, z] = [positionGeometry.x.mul(size.x).add(size.z), positionGeometry.z.mul(size.y)];
  const [yawCos, yawSin] = [cos(place.w), sin(place.w)];
  shadowMaterial.positionNode = place.xyz.add(vec3(x.mul(yawCos).add(z.mul(yawSin)), SHADOW.liftM, z.mul(yawCos).sub(x.mul(yawSin))));
  const shadows = new Mesh(shadowGeometry, shadowMaterial);
  shadows.frustumCulled = false;
  shadows.visible = false;
  shadowGeometry.instanceCount = 0;

  const cyclists = new Map<string, Cyclist>();
  const cyclistOf = ({ id, seed }: CrowdRider) => {
    const known = cyclists.get(id);
    if (known?.seed === seed) return known;
    const look = riderLook(seed);
    const made = { seed, spec: bikeOf(seed), look, colours: coloursOf(look), motion: restMotion() };
    cyclists.set(id, made);
    return made;
  };
  const rows = new Float32Array(ROWS_A_RIDER * 4);
  let [drawn, shadowCount] = [0, 0];

  return {
    meshes: [...lists.map(({ mesh }) => mesh), shadows],
    /** Each frame: every rider as it stands now, its pedals moved on by `seconds` of the game's clock (0 while paused); each version listed by its distance from `eye`, the camera. */
    draw(riders: readonly CrowdRider[], eye: { x: number; y: number; z: number }, seconds: number) {
      if (riders.length > room) throw new Error(`${riders.length} riders, in a crowd with room for ${room}`);
      for (const list of lists) list.begin();
      const seen = new Set<string>();
      [drawn, shadowCount] = [0, 0];
      for (const rider of riders) {
        seen.add(rider.id);
        const cyclist = cyclistOf(rider);
        stepMotion(cyclist.motion, rider.input, cyclist.spec, seconds);
        const bike = bikes[BIKES.indexOf(cyclist.spec)];
        const on = listsAt(Math.hypot(rider.x - eye.x, rider.z - eye.z), bike.swapM);
        if (!on.near && !on.far) continue;
        const { matrices } = poseBike(cyclist.spec, rider.input, cyclist.motion, { rider: true, helmet: cyclist.look.helmet, hair: cyclist.look.hairStyle });
        writeRider(rows, matrices, [rider.x, rider.y, rider.z, rider.yaw], cyclist.colours);
        if (on.near) bike.near.add(rows);
        if (on.far) bike.far.add(rows);
        shadowPlaces.setXYZW(shadowCount, rider.x, rider.y, rider.z, rider.yaw);
        shadowSizes.setXYZ(shadowCount, SHADOW.wideM, shadowLengthM(cyclist.spec), Math.sin(rider.input.lean) * SHADOW.leanM);
        shadowCount++;
        drawn++;
      }
      for (const id of cyclists.keys()) if (!seen.has(id)) cyclists.delete(id);
      for (const list of lists) list.end();
      shadowGeometry.instanceCount = shadowCount;
      shadows.visible = shadowCount > 0;
      shadowPlaces.needsUpdate = true;
      shadowSizes.needsUpdate = true;
    },
    /** What the last `draw` put on the lists: riders in reach, draw calls and the triangles their vertices run. */
    counts() {
      const visible = lists.filter((list) => list.count() > 0);
      return {
        riders: drawn,
        draws: visible.length + (shadowCount > 0 ? 1 : 0),
        triangles: visible.reduce((sum, list) => sum + list.count() * list.triangles, 0) + shadowCount * 2,
      };
    },
    dispose() {
      for (const list of lists) list.dispose();
      quad.dispose();
      shadowGeometry.dispose();
      shadowMaterial.dispose();
    },
  };
}

export type BikeCrowd = ReturnType<typeof createBikeCrowd>;
