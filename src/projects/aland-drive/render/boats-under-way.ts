import type { InstancedBufferAttribute, Scene } from "three/webgpu";
import { uniform } from "three/tsl";
import { boatMaterials, buildAllmogebat, buildCruiser, buildDoubleEnder, buildFishingBoat, buildFolkboat, buildLargeCruiser, buildLaunch, buildPassengerBoat, buildRib } from "../art/boats/index";
import { placeModel, type Placement, type RoadsideInputs, type RoadsideMaterials, type RoadsideModel } from "../art/roadside/index";
import { buildCableFerry, identityMaterials } from "../art/identity/index";
import { buildBalticFerry, buildRoadFerry, townMaterials } from "../art/town-kit/index";
import { LANES } from "../sea/lanes";
import type { BoatPose } from "../sea/motion";
import { sailings, type BoatModel } from "../sea/timetable";
import { showVersionsInReach } from "./versions-in-reach";

/*
 * Ferries on their timetables and small boats on their trips (`sea/`), each where the sea's clock puts it. A model
 * is one list of every vessel drawn with it, at most two draw calls however many sail, and none for a version no
 * vessel on it is in range of; each frame writes only the list's places: a few floats a vessel, worked out on the
 * CPU from the pure function of the time. A vessel out of sight beyond the islands folds to nothing.
 *
 * Each keeps its kit's own levels of detail and a reach far beyond the shore, so a ship stands on the horizon and
 * a sail is seen across a fjärd: past the buildings' reach the far versions are a few dozen triangles, and the
 * last of each dissolves away by the screen pattern.
 */

/** The drawn sea's surface, as the docks' boats float on it. */
const WATER_Y = -0.05;
/** How far each is seen: a ship to the horizon's haze, a sail across open water, an engine boat's low hull less far. */
const SHIP_REACH_M = 20000;
const SAIL_REACH_M = 4000;
const MOTOR_REACH_M = 2500;

const SHIP_SMALL_SCALE = 124 / 176;

type Kit = "town" | "boats" | "identity";

/** A pose's yaw points a model's +x where it sails; the town and identity kits build their ferries bow along +x, the boats kit its boats bow along +z. */
export const BOW_TURN: Record<Kit, number> = { town: 0, identity: 0, boats: Math.PI / 2 };

export const MODELS: Record<BoatModel, { kit: Kit; build: () => RoadsideModel; reachM?: number; drawnAs?: BoatModel; scale?: number }> = {
  ship: { kit: "town", build: buildBalticFerry, reachM: SHIP_REACH_M },
  // The same ship, smaller: one list and its two draws.
  "ship-small": { kit: "town", build: buildBalticFerry, drawnAs: "ship", scale: SHIP_SMALL_SCALE },
  archipelago: { kit: "town", build: buildRoadFerry },
  cable: { kit: "identity", build: buildCableFerry },
  passenger: { kit: "boats", build: () => buildPassengerBoat(), reachM: 6000 },
  "cruiser-sailing": { kit: "boats", build: () => buildCruiser({ state: "sailing" }), reachM: SAIL_REACH_M },
  "folkboat-sailing": { kit: "boats", build: () => buildFolkboat({ state: "sailing", lee: -1 }), reachM: SAIL_REACH_M },
  "large-sailing": { kit: "boats", build: () => buildLargeCruiser({ state: "sailing", trim: "reach", sails: "laminate", lee: -1 }), reachM: SAIL_REACH_M },
  "double-ender-sailing": { kit: "boats", build: () => buildDoubleEnder({ state: "sailing" }), reachM: SAIL_REACH_M },
  "allmogebat-sailing": { kit: "boats", build: () => buildAllmogebat({ state: "sailing" }), reachM: SAIL_REACH_M },
  launch: { kit: "boats", build: () => buildLaunch(), reachM: MOTOR_REACH_M },
  rib: { kit: "boats", build: () => buildRib(), reachM: MOTOR_REACH_M },
  fishing: { kit: "boats", build: () => buildFishingBoat(), reachM: MOTOR_REACH_M },
};

export interface UnderWay {
  model: BoatModel;
  name: string;
  pose: BoatPose;
}

export function createBoatsUnderWay(scene: Scene, inputs: RoadsideInputs) {
  const time = uniform(0);
  const materials: Record<Kit, RoadsideMaterials> = {
    town: townMaterials({ ...inputs, time: uniform(0) }),
    boats: boatMaterials({ ...inputs, time }, { underWay: true }),
    identity: identityMaterials({ ...inputs, time: uniform(0) }),
  };
  const fleet = sailings(LANES);
  const groups = new Map<BoatModel, { index: number; scale: number }[]>();
  fleet.forEach(({ model }, index) => {
    const { drawnAs = model, scale = 1 } = MODELS[model];
    groups.set(drawnAs, [...(groups.get(drawnAs) ?? []), { index, scale }]);
  });
  const lists = [...groups].map(([name, members]) => {
    const { kit, build, reachM } = MODELS[name];
    const built = build();
    const model = reachM === undefined ? built : { ...built, reachM };
    // Each boat's own roll for its rocking, in the fit's shear and depth, which only the boats' material reads.
    const places: Placement[] = members.map(({ index }) => ({ x: 0, y: WATER_Y, z: 0, scale: 0, ...(kit === "boats" ? { shear: (index * 0.618) % 1, depth: (index * 0.377) % 1 } : {}) }));
    const meshes = placeModel(model, places, materials[kit]);
    for (const mesh of meshes) scene.add(mesh);
    return { members, meshes, model, turn: BOW_TURN[kit] };
  });
  const poses: BoatPose[] = fleet.map(() => ({ x: 0, z: 0, yaw: 0, speedMs: 0, shown: false }));
  let shownAtAll = true;

  return {
    /** Moves every vessel to where it is at `seaSeconds` (the sea's clock), and its rocking on by `seconds`; the camera says which versions draw. */
    update(seaSeconds: number, seconds: number, camera: { x: number; z: number }) {
      time.value += seconds;
      fleet.forEach(({ voyage }, index) => (poses[index] = voyage.poseAt(seaSeconds)));
      for (const { members, meshes, model, turn } of lists) {
        let [nearest, farthest] = [Infinity, 0];
        for (const { index } of members) {
          const { x, z, shown } = poses[index];
          if (!shown) continue;
          const away = Math.hypot(x - camera.x, z - camera.z);
          [nearest, farthest] = [Math.min(nearest, away), Math.max(farthest, away)];
        }
        showVersionsInReach(model, meshes, nearest, farthest);
        if (!shownAtAll) for (const mesh of meshes) mesh.visible = false;
        const geometry = meshes[0].geometry;
        const place = geometry.getAttribute("place") as InstancedBufferAttribute;
        const fit = geometry.getAttribute("fit") as InstancedBufferAttribute;
        members.forEach(({ index, scale }, at) => {
          const { x, z, yaw, shown } = poses[index];
          place.setXYZW(at, x, WATER_Y, z, yaw + turn);
          fit.setX(at, shown ? scale : 0);
        });
        place.needsUpdate = true;
        fit.needsUpdate = true;
      }
    },
    /** Shows the boats under way or leaves them out, to see what they do. */
    show(shown: boolean) {
      shownAtAll = shown;
      for (const { meshes } of lists) for (const mesh of meshes) mesh.visible = shown;
    },
    /** Every vessel, where the last update put it. */
    fleet(): UnderWay[] {
      return fleet.map(({ model, voyage }, index) => ({ model, name: voyage.name, pose: poses[index] }));
    },
    dispose() {
      for (const { meshes, model } of lists) {
        for (const mesh of meshes) mesh.geometry.dispose();
        model.near.dispose();
        model.far?.dispose();
      }
      for (const { near, far } of Object.values(materials)) {
        near.dispose();
        far.dispose();
      }
    },
  };
}
