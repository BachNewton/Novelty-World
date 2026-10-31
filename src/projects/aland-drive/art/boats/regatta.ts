import { BufferAttribute, DoubleSide, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, MeshBasicNodeMaterial, type Node, type Vector3 } from "three/webgpu";
import { attribute, cameraPosition, clamp, cos, float, max, mix, normalize, positionGeometry, sin, smoothstep, vec3 } from "three/tsl";
import { seeded } from "../roadside/mesh";
import { lerp } from "./hull";

/*
 * A distant regatta: sails on the horizon, one instanced mesh of three triangles a
 * boat, drawn in one call. A boat is a place on a line, moved by the shader: it sails
 * up the line and back on a slow sine, and at each end it stands edge-on and comes
 * round, so a turn is a tack rather than a jump. Each one always shows the camera its
 * side, which nobody can tell from turning at this range, and keeps a few pixels'
 * height past that. Nothing runs on the CPU.
 */

export interface RegattaCourse {
  /** The water the fleet sails over, end to end, in scene metres, with its height. */
  from: { x: number; z: number };
  to: { x: number; z: number };
  y: number;
  /** How far the fleet spreads across the line. */
  wideM: number;
  count: number;
  seed: number;
  /** Speed along the line. About 2.5 m/s is a fleet going to windward in a breeze. */
  speedMs?: number;
}

export interface RegattaInputs {
  linear: (name: string) => Vector3;
  colour: (name: string) => Node<"vec3">;
  hazed: (color: Node<"vec3">) => Node<"vec3">;
  time: Node<"float">;
}

/** A main, a jib and a hull, about the size of a 33 ft yacht, in the plane x-y. */
const OUTLINE = new Float32Array([
  0, 13, 0, 0.1, 1.9, 0, -4.1, 1.8, 0,
  0.25, 11.6, 0, 3.6, 1.4, 0, 0.2, 1.3, 0,
  -5, 1.1, 0, 5, 1.2, 0, 3.6, 0, 0,
]);
const IS_HULL = new Float32Array([0, 0, 0, 0, 0, 0, 1, 1, 1]);
const INDEX = [0, 1, 2, 3, 4, 5, 6, 7, 8];

/** Mostly white, as a real fleet is. */
const SAILS = ["boat-sail-white", "boat-sail-white", "boat-sail-white", "boat-sail-white", "boat-sail-cream", "boat-sail-cream", "boat-sail-laminate", "boat-sail-red", "boat-sail-blue", "boat-sail-tan"];
const REACH_M = 22000;
const NEAR_M = 1500;
/** Metres a pixel covers, per metre away, at the game's lens and size. */
const PIXEL_M_PER_M = (2 * Math.tan((60 * Math.PI) / 360)) / 1007;
const SMALLEST_PIXELS = 7;
const TALL_M = 13;
const TACK_SHARPNESS = 10;

/** The fleet: one mesh, ready to add to the scene. */
export function buildRegatta({ linear, hazed, colour, time }: RegattaInputs, { from, to, y, wideM, count, seed, speedMs = 2.5 }: RegattaCourse): Mesh {
  const random = seeded(seed);
  const length = Math.hypot(to.x - from.x, to.z - from.z);
  const [dx, dz] = [(to.x - from.x) / length, (to.z - from.z) / length];
  // An instance: how far off the line, its phase and its pace.
  const lane = new Float32Array(count * 3);
  const sailColours = new Float32Array(count * 3);
  for (let boat = 0; boat < count; boat++) {
    // Most of a fleet keeps together; a few straggle.
    lane.set([(random() - 0.5) * wideM, lerp(random(), 0.5, 0.55) * 2 * Math.PI, 0.9 + random() * 0.2], boat * 3);
    const { x, y: g, z } = linear(SAILS[Math.floor(random() * SAILS.length)]);
    sailColours.set([x, g, z], boat * 3);
  }
  const geometry = new InstancedBufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(OUTLINE, 3));
  geometry.setAttribute("isHull", new BufferAttribute(IS_HULL, 1));
  geometry.setIndex(INDEX);
  geometry.setAttribute("lane", new InstancedBufferAttribute(lane, 3));
  geometry.setAttribute("sailColour", new InstancedBufferAttribute(sailColours, 3));
  geometry.instanceCount = count;

  const boat = attribute<"vec3">("lane", "vec3");
  const middle = vec3((from.x + to.x) / 2, y, (from.z + to.z) / 2);
  const swing = time.mul((2 * speedMs) / length).mul(boat.z).add(boat.y);
  const place = middle.add(vec3(dx, 0, dz).mul(sin(swing).mul(length / 2))).add(vec3(-dz, 0, dx).mul(boat.x));
  const toCamera = cameraPosition.sub(place).mul(vec3(1, 0, 1));
  const distance = toCamera.length();
  const side = normalize(vec3(toCamera.z.negate(), 0, toCamera.x));
  const tack = clamp(cos(swing).mul(TACK_SHARPNESS), -1, 1);
  const shown = float(1).sub(smoothstep(float(REACH_M * 0.9), float(REACH_M), distance)).mul(smoothstep(float(NEAR_M * 0.8), float(NEAR_M), distance));
  const size = max(float(1), distance.mul((PIXEL_M_PER_M * SMALLEST_PIXELS) / TALL_M)).mul(shown);

  const material = new MeshBasicNodeMaterial();
  material.positionNode = place.add(side.mul(positionGeometry.x.mul(tack).mul(size))).add(vec3(0, positionGeometry.y.mul(size), 0));
  material.colorNode = hazed(mix(attribute<"vec3">("sailColour", "vec3"), colour("boat-boot"), attribute<"float">("isHull", "float")));
  material.side = DoubleSide;
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  return mesh;
}
