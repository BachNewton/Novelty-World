import type { Node, Scene } from "three/webgpu";
import { createBikeCrowd, type CrowdRider } from "../art/bikes";
import type { Sun } from "../art/sun";
import { BIKE_WHEELBASE_M, type LaneTraffic } from "../traffic/lane-driver";

/*
 * The lane map's cyclists drawn as `art/bikes`' crowd: each rider where its lane
 * driver has it between its last two steps, its bars at its front wheel's angle,
 * leaning into its turn as far as its speed round it asks, and pedalling while it
 * rides, coasting to a stop.
 */

const GRAVITY = 9.81;
/** Slower than this a rider stops pedalling and puts a foot down. */
const PEDALLING_MS = 0.5;
const EFFORT = 0.5;

export function createCyclistsView(scene: Scene, sun: Sun, hazed: (color: Node<"vec3">) => Node<"vec3">, room: number) {
  const crowd = createBikeCrowd({ sun, hazed, room });
  scene.add(...crowd.meshes);

  return {
    /** Each frame: every cyclist `share` of the way from its last step to this one, its pedals moved on by `seconds`. */
    draw(traffic: LaneTraffic, share: number, eye: { x: number; y: number; z: number }, seconds: number) {
      const riders: CrowdRider[] = [];
      for (const vehicle of traffic.all()) {
        if (vehicle.kind !== "bike" || riders.length === room) continue;
        const { x, y, z, yaw } = traffic.poseBetween(vehicle, share);
        const { speedMS } = vehicle;
        const steer = vehicle.body.wheels;
        // A turn's pull is speed squared over its radius; a bike leans until gravity balances it.
        const lean = Math.atan((speedMS * speedMS * Math.tan(steer)) / (BIKE_WHEELBASE_M * GRAVITY));
        riders.push({ id: vehicle.id, x, y, z, yaw, seed: vehicle.seed, input: { speedMS, steer, lean, effort: speedMS > PEDALLING_MS ? EFFORT : 0, headYaw: 0, headPitch: 0 } });
      }
      crowd.draw(riders, eye, seconds);
    },
    counts: crowd.counts,
    dispose() {
      for (const mesh of crowd.meshes) scene.remove(mesh);
      crowd.dispose();
    },
  };
}
