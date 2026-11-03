import { InstancedBufferAttribute, InstancedBufferGeometry, Mesh, type BufferGeometry, type MeshBasicNodeMaterial, type Node, type Scene, type Vector3 } from "three/webgpu";
import { themeColor } from "@/shared/lib/three/theme-color";
import { distantGeometry, lookOf, REACH_M, SWAP_M, worldGeometry } from "../art/cars/fleet";
import { worldCarMaterial } from "../art/cars/material";
import { WORLD_CARS } from "../art/cars/specs";
import { PARKED_CARS, PARKED_FLOATS, parkedAt, type TileParked } from "./parked-places";

/*
 * The parked cars (`pipeline/parking.py`), drawn as `art/cars`' world cars: each
 * model is a near list and a stand-in list across every loaded tile, so two draw
 * calls a model however many tiles are near. Each list holds only the cars within
 * its version's reach of the camera and a margin, written again whenever the
 * camera has moved that margin: the material still chooses each car's version by
 * its own distance, so a list never decides what is seen, and the thousands of
 * cars further off cost no vertices.
 */

const LISTS = { world: { reachM: SWAP_M, marginM: 40 }, distant: { reachM: REACH_M, marginM: 150 } } as const;
type List = keyof typeof LISTS;

interface Car {
  x: number;
  y: number;
  z: number;
  yaw: number;
  paint: [number, number, number];
  look: [number, number, number];
}

interface Model {
  shapes: { world: BufferGeometry; distant: BufferGeometry };
  cars: Car[];
  world: Mesh<InstancedBufferGeometry> | null;
  distant: Mesh<InstancedBufferGeometry> | null;
}

function instanced(shape: BufferGeometry, cars: readonly Car[], material: MeshBasicNodeMaterial): Mesh<InstancedBufferGeometry> {
  const geometry = new InstancedBufferGeometry();
  for (const name of ["position", "normal", "carColour", "carFinish", "carOption"]) geometry.setAttribute(name, shape.getAttribute(name));
  const size = Math.max(cars.length, 1);
  geometry.setAttribute("place", new InstancedBufferAttribute(new Float32Array(size * 4), 4));
  geometry.setAttribute("paint", new InstancedBufferAttribute(new Float32Array(size * 3), 3));
  geometry.setAttribute("look", new InstancedBufferAttribute(new Float32Array(size * 3), 3));
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  write(mesh, cars);
  return mesh;
}

/** Writes cars into a list from its start; the list draws only those. */
function write(mesh: Mesh<InstancedBufferGeometry>, cars: readonly Car[]) {
  const { geometry } = mesh;
  const [place, paint, look] = (["place", "paint", "look"] as const).map((name) => geometry.getAttribute(name) as InstancedBufferAttribute);
  cars.forEach((car, index) => {
    place.setXYZW(index, car.x, car.y, car.z, car.yaw);
    paint.setXYZ(index, ...car.paint);
    look.setXYZ(index, ...car.look);
  });
  for (const attribute of [place, paint, look]) attribute.needsUpdate = true;
  geometry.instanceCount = cars.length;
}

export function createParkedCars(scene: Scene, sun: { azimuthDeg: number; elevationDeg: number }, hazed: (color: Node<"vec3">) => Node<"vec3">) {
  const materials = {
    world: worldCarMaterial({ sun, hazed, tier: "world", swapM: SWAP_M, reachM: REACH_M }),
    distant: worldCarMaterial({ sun, hazed, tier: "distant", swapM: SWAP_M, reachM: REACH_M }),
  };
  const specs = PARKED_CARS.map(({ name }) => {
    const spec = WORLD_CARS.find((car) => car.name === name);
    if (!spec) throw new Error(`${name} parks, but there's no world car of that name`);
    return spec;
  });
  const models: Model[] = specs.map((spec) => ({ shapes: { world: worldGeometry(spec), distant: distantGeometry(spec) }, cars: [], world: null, distant: null }));
  const tiles = new Map<string, TileParked>();
  let compiling = false;
  let hidden = false;
  const centres: Record<List, { x: number; z: number } | null> = { world: null, distant: null };

  const visibility = () => {
    // A near list with no car near is left out, so it costs no draw call.
    for (const { world, distant } of models) {
      for (const mesh of [world, distant]) if (mesh) mesh.visible = compiling || (mesh.geometry.instanceCount > 0 && !hidden);
    }
  };

  const refill = (list: List, x: number, z: number) => {
    centres[list] = { x, z };
    const within = LISTS[list].reachM + LISTS[list].marginM;
    for (const model of models) {
      const mesh = model[list];
      if (mesh) write(mesh, model.cars.filter((car) => Math.hypot(car.x - x, car.z - z) < within));
    }
    visibility();
  };

  const rebuild = () => {
    for (const model of models) model.cars = [];
    for (const placed of tiles.values()) {
      for (let at = 0; at < placed.length; at += PARKED_FLOATS) {
        const [x, y, z, yaw] = placed.subarray(at, at + PARKED_FLOATS);
        const { car, seed } = parkedAt(x, z);
        const look = lookOf(specs[car], seed);
        const { r, g, b } = themeColor(`--color-aland-drive-${look.paint}`);
        models[car].cars.push({ x, y, z, yaw, paint: [r, g, b], look: [look.height, look.rack ? 1 : 0, look.plateBand ? 1 : 0] });
      }
    }
    for (const model of models) {
      for (const mesh of [model.world, model.distant]) {
        if (!mesh) continue;
        scene.remove(mesh);
        mesh.geometry.dispose();
      }
      model.world = instanced(model.shapes.world, model.cars, materials.world);
      model.distant = instanced(model.shapes.distant, model.cars, materials.distant);
      scene.add(model.world, model.distant);
    }
    for (const list of ["world", "distant"] as const) {
      const centre = centres[list];
      if (centre) refill(list, centre.x, centre.z);
      else for (const model of models) if (model[list]) write(model[list], []);
    }
    visibility();
  };

  rebuild();

  return {
    add(tile: string, placed: TileParked) {
      tiles.set(tile, placed);
      rebuild();
    },
    remove(tile: string) {
      if (!tiles.delete(tile)) throw new Error(`${tile} has no parked cars to remove`);
      rebuild();
    },
    /** Each frame, before drawing: the lists follow the camera. */
    update(camera: Vector3) {
      for (const list of ["world", "distant"] as const) {
        const centre = centres[list];
        if (!centre || Math.hypot(camera.x - centre.x, camera.z - centre.z) > LISTS[list].marginM) refill(list, camera.x, camera.z);
      }
    },
    /** Every mesh shown, for compiling before the drive; `false` puts back what has places. */
    showAll(all: boolean) {
      compiling = all;
      visibility();
    },
    /** Shows the parked cars or leaves them out, to see what they do. */
    show(shown: boolean) {
      hidden = !shown;
      visibility();
    },
    /** How many cars stand across the loaded tiles, and how many are on the near and the stand-in lists. */
    counts: () => ({
      parked: models.reduce((sum, { cars }) => sum + cars.length, 0),
      near: models.reduce((sum, { world }) => sum + (world?.geometry.instanceCount ?? 0), 0),
      distant: models.reduce((sum, { distant }) => sum + (distant?.geometry.instanceCount ?? 0), 0),
    }),
    dispose() {
      for (const model of models) {
        for (const mesh of [model.world, model.distant]) mesh?.geometry.dispose();
        model.shapes.world.dispose();
        model.shapes.distant.dispose();
      }
      materials.world.dispose();
      materials.distant.dispose();
    },
  };
}
