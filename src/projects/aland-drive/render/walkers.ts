import type { Scene } from "three/webgpu";
import { sharedUniform } from "../art/shared-uniform";
import { rollFigure } from "../art/people/figure";
import type { CrowdArrays } from "../art/people/crowd";
import { createWalkingCrowd, type Walker } from "../art/people/walking";
import type { RoadsideInputs } from "../art/roadside/index";
import { seedShare, type LaneTraffic } from "../traffic/lane-driver";

/*
 * The lane map's walkers drawn as `art/people`' walking crowd: each where its
 * lane driver has it between its last two steps, facing the way it walks, its
 * stride run on by the ground it covered.
 */

/** A walker's pace by who the seed is: an older person's slower, and each their own within their age's range. */
export function walkerPace(seed: number): number {
  const share = seedShare(seed, 1);
  return rollFigure(seed).age === "older" ? 0.85 + 0.3 * share : 1.15 + 0.35 * share;
}

/** Where each person a tile's crowd places stands, as (x, z) pairs: walkers go round them. */
export function standingPlaces({ shadow }: CrowdArrays): Float32Array {
  const place = shadow.attributes.place.array;
  // Four corners of shade a person, each carrying where the person stands.
  const places = new Float32Array((place.length / 16) * 2);
  for (let person = 0; person < places.length / 2; person++) places.set([place[person * 16], place[person * 16 + 2]], person * 2);
  return places;
}

export function createWalkersView(scene: Scene, inputs: RoadsideInputs, room: number) {
  const time = sharedUniform(0);
  const crowd = createWalkingCrowd({ ...inputs, time }, room);
  scene.add(...crowd.meshes);

  return {
    /** Each frame: every walker `share` of the way from its last step to this one, the head's look round moved on by `seconds`. */
    draw(traffic: LaneTraffic, share: number, eye: { x: number; z: number }, seconds: number) {
      time.value += seconds;
      const walkers: Walker[] = [];
      for (const vehicle of traffic.all()) {
        if (vehicle.kind !== "walker") continue;
        const { x, y, z, yaw } = traffic.poseBetween(vehicle, share);
        // A lane pose turns a model's tail, its +z, against the way it goes; a figure faces its +z.
        walkers.push({ id: vehicle.id, seed: vehicle.seed, x, y, z, yaw: yaw + Math.PI, speedMS: vehicle.speedMS });
      }
      crowd.draw(walkers, eye);
    },
    counts: crowd.counts,
    dispose() {
      for (const mesh of crowd.meshes) scene.remove(mesh);
      crowd.dispose();
    },
  };
}
