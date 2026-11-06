import type { InstancedBufferGeometry, Mesh, Node, Scene } from "three/webgpu";
import { themeColor } from "@/shared/lib/three/theme-color";
import { distantGeometry, lookOf, modelSwapM, REACH_M, tierMaterials, worldGeometry } from "../art/cars/fleet";
import { type Sun } from "../art/sun";
import { WORLD_CARS } from "../art/cars/specs";
import type { HitCarView } from "../traffic/contact";
import type { LaneCar, LaneTraffic } from "../traffic/lane-driver";
import type { Sighted } from "../traffic/sight";
import { BIKE_REACH_M } from "../art/bikes";
import { instanced, write, type Car } from "./parked-cars";
import { PARKED_CARS } from "./parked-places";

/*
 * The lane map's cars, not its cyclists (`cyclists.ts`), drawn as `art/cars`' world cars, the parked cars' fleet:
 * a near and a stand-in list per model, each with room for every car, written
 * whole each frame from where the cars are between their last two steps.
 */

/** Half the width and length of each kind of car traffic drives, in the order `LaneCar.model` counts them. */
export const TRAFFIC_KINDS = PARKED_CARS.map(({ half }) => half);

/** A world car's height, and a cyclist's, near enough for whether one can be seen. */
const CAR_HEIGHT_M = 1.6;
const RIDER_HEIGHT_M = 1.9;

/** A car or cyclist as the camera judges whether it's in sight: drawn to the fleet's reach, or the bikes'. */
export const sightOf = ({ kind, pose, half }: Pick<LaneCar, "kind" | "pose" | "half">): Sighted => ({
  x: pose.x,
  y: pose.y,
  z: pose.z,
  radiusM: Math.hypot(...half),
  heightM: kind === "bike" ? RIDER_HEIGHT_M : CAR_HEIGHT_M,
  reachM: kind === "bike" ? BIKE_REACH_M : REACH_M,
});

export function createLaneTrafficView(scene: Scene, sun: Sun, hazed: (color: Node<"vec3">) => Node<"vec3">, room: number) {
  const specs = PARKED_CARS.map(({ name }) => {
    const spec = WORLD_CARS.find((car) => car.name === name);
    if (!spec) throw new Error(`${name} drives, but there's no world car of that name`);
    return spec;
  });
  const models = specs.map((spec) => {
    const shapes = { world: worldGeometry(spec), distant: distantGeometry(spec) };
    const materials = tierMaterials(modelSwapM(shapes.world, shapes.distant), sun, hazed);
    const lists: Mesh<InstancedBufferGeometry>[] = [instanced(shapes.world, [], materials.world, room), instanced(shapes.distant, [], materials.distant, room)];
    scene.add(...lists);
    return { shapes, materials, lists };
  });
  const looks = new Map<string, Pick<Car, "paint" | "look">>();

  const lookFor = (id: string, model: number, seed: number) => {
    const known = looks.get(id);
    if (known) return known;
    const look = lookOf(specs[model], seed);
    const { r, g, b } = themeColor(`--color-aland-drive-${look.paint}`);
    const made = { paint: [r, g, b] as Car["paint"], look: [look.height, look.rack ? 1 : 0, look.plateBand ? 1 : 0] as Car["look"] };
    looks.set(id, made);
    return made;
  };

  return {
    /** Each frame: every car where it is `share` of the way from its last step to this one, and the cars hit out of traffic where they are. */
    draw(traffic: LaneTraffic, share: number, hit: readonly HitCarView[]) {
      const byModel: Car[][] = models.map(() => []);
      const seen = new Set<string>();
      for (const car of traffic.all()) {
        if (car.kind !== "car") continue;
        seen.add(car.id);
        byModel[car.model].push({ ...traffic.poseBetween(car, share), ...lookFor(car.id, car.model, car.seed), signal: car.signal });
      }
      for (const car of hit) {
        seen.add(car.id);
        byModel[car.model].push({ ...car.pose, ...lookFor(car.id, car.model, car.seed), signal: car.signal });
      }
      for (const id of looks.keys()) if (!seen.has(id)) looks.delete(id);
      models.forEach(({ lists }, model) => {
        const cars = byModel[model].slice(0, room);
        for (const mesh of lists) {
          write(mesh, cars);
          mesh.visible = cars.length > 0;
        }
      });
    },
    dispose() {
      for (const { shapes, materials, lists } of models) {
        for (const mesh of lists) {
          scene.remove(mesh);
          mesh.geometry.dispose();
        }
        shapes.world.dispose();
        shapes.distant.dispose();
        materials.world.dispose();
        materials.distant.dispose();
      }
    },
  };
}
