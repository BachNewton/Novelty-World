import { Group, Mesh, type Material, type Node, type Scene, type Vector3 } from "three/webgpu";
import { buildExterior, DEALER_SITES, dealerMaterial, geometryOf, onSite, type DealerSite, type Outdoors, type Rectangle } from "../art/dealers/index";
import { standingCar } from "../art/dealers/standing-car";
import { measuredSwapM } from "../art/lod-swaps";
import type { Sun } from "../art/sun";

/*
 * The dealerships on their plots (`art/dealers/sites.ts`): five models and the cars on their forecourts, built at the
 * start, each standing on the highest ground under its plot, read again whenever more of the world lands, its slab
 * running down to meet the ground's low side as a plinth. A dealership shows
 * its near version inside the swap the LOD check measured and its far version past it, out to where it is a pixel or
 * two. A forecourt car is the drivable car standing still (`art/dealers/standing-car.ts`), swapping where its two
 * details were measured and leaving where the parked cars do. The tiles take away the map's buildings under each plot
 * and stop the car at the dealership's own walls (`landmarks.dealer_sites`).
 */

/** The height the sea is drawn at in the harbour, which an afloat site stands on. */
const WATER_Y = -0.05;
/** How far apart the ground is read under a plot, for the highest of it: finer than the ground's own 4 m. */
const FOOTING_STEP_M = 2;
/** Where the check hasn't measured a model's swap yet. */
const UNMEASURED_SWAP_M = 300;
const UNMEASURED_CAR_SWAP_M = 100;
/** A far version stands to here, where a showroom's long side is a few pixels on the floor's screen. */
const REACH_M = 6000;
/** A forecourt car leaves here, as a parked car does. */
const CAR_REACH_M = 900;

interface Shown {
  site: DealerSite;
  place: Group;
  near: Mesh;
  far: Mesh;
  swapM: number;
  plot: Rectangle;
  cars: { near: Mesh[]; far: Mesh[]; swapM: number; x: number; z: number }[];
}

export function createDealers(scene: Scene, inputs: { sun: Sun; hazed: (color: Node<"vec3">) => Node<"vec3"> } & Outdoors, ground: { height: (x: number, z: number) => number; revision: () => number }, origin: { east: number; north: number }) {
  const material = dealerMaterial({ kind: "sun", ...inputs }, inputs.hazed);
  let revision = -1;
  let all = false;
  let shownAtAll = true;

  const shown: Shown[] = DEALER_SITES.map((site) => {
    const [near, far] = (["near", "far"] as const).map((version) => buildExterior(site.id, version));
    const [nearGeometry, farGeometry] = [geometryOf(near.soup), geometryOf(far.soup)];
    const place = new Group();
    const versions = { near: new Mesh(nearGeometry, material), far: new Mesh(farGeometry, material) };
    place.add(versions.near, versions.far);
    const cars = near.slots.map(({ car, paint, at, yaw }) => {
      const [nearCar, farCar] = (["hero", "far"] as const).map((detail) => standingCar(car, detail, inputs.sun, inputs.hazed, paint));
      for (const mesh of [...nearCar, ...farCar]) {
        mesh.position.set(...at);
        mesh.rotation.y = yaw;
        place.add(mesh);
      }
      return { near: nearCar, far: farCar, swapM: measuredSwapM(nearCar[0].geometry, farCar[0].geometry, UNMEASURED_CAR_SWAP_M), x: at[0], z: at[2] };
    });
    scene.add(place);
    return { site, place, ...versions, swapM: measuredSwapM(nearGeometry, farGeometry, UNMEASURED_SWAP_M), plot: near.plot, cars };
  });
  const meshesOf = ({ near, far, cars }: Shown) => [near, far, ...cars.flatMap((car) => [...car.near, ...car.far])];
  for (const each of shown) for (const mesh of meshesOf(each)) mesh.visible = false;

  /** The highest ground under a plot, which its model's y 0 stands on. */
  const footing = (site: DealerSite, [x0, z0, x1, z1]: Rectangle) => {
    let highest = -Infinity;
    for (let x = x0; x <= x1; x += FOOTING_STEP_M) {
      for (let z = z0; z <= z1; z += FOOTING_STEP_M) {
        const [east, north] = onSite(site, x, z);
        highest = Math.max(highest, ground.height(east - origin.east, origin.north - north));
      }
    }
    return highest;
  };

  /** Stands each on its ground. */
  const stand = () => {
    for (const { site, place, plot } of shown) {
      place.position.set(site.east - origin.east, site.afloat === true ? WATER_Y : footing(site, plot), origin.north - site.north);
      place.rotation.set(0, site.yaw, 0);
      place.updateMatrix();
      place.traverse((child) => child.updateMatrix());
      place.updateMatrixWorld(true);
    }
  };

  return {
    /** Picks each dealership's and each car's version for this frame from where the camera is. */
    update(eye: Vector3) {
      if (ground.revision() !== revision) {
        revision = ground.revision();
        stand();
      }
      for (const { place, near, far, swapM, cars, site } of shown) {
        const { x, z } = place.position;
        const away = Math.hypot(x - eye.x, z - eye.z);
        near.visible = shownAtAll && (all || away < swapM);
        far.visible = shownAtAll && (all || (away >= swapM && away < REACH_M));
        const [cos, sin] = [Math.cos(site.yaw), Math.sin(site.yaw)];
        for (const car of cars) {
          const carAway = Math.hypot(x + car.x * cos + car.z * sin - eye.x, z - car.x * sin + car.z * cos - eye.z);
          for (const mesh of car.near) mesh.visible = shownAtAll && (all || carAway < car.swapM);
          for (const mesh of car.far) mesh.visible = shownAtAll && (all || (carAway >= car.swapM && carAway < CAR_REACH_M));
        }
      }
    },
    /** Every version at once, so their pipelines are built before the drive. */
    showAll(every: boolean) {
      all = every;
      if (every) for (const each of shown) for (const mesh of meshesOf(each)) mesh.visible = shownAtAll;
    },
    show(visible: boolean) {
      shownAtAll = visible;
      if (!visible) for (const each of shown) for (const mesh of meshesOf(each)) mesh.visible = false;
    },
    dispose() {
      for (const each of shown) {
        scene.remove(each.place);
        for (const mesh of meshesOf(each)) {
          mesh.geometry.dispose();
          if (mesh.material !== material) (mesh.material as Material).dispose();
        }
      }
      material.dispose();
    },
  };
}
