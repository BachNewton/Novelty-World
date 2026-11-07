import type { Mesh, Scene } from "three/webgpu";
import { buildTurbineRotor, buildTurbineTower, rotorAt } from "../art/lighthouses/index";
import { placeModel, type Placement, type RoadsideMaterials } from "../art/roadside/index";

/*
 * Båtskär's six wind turbines by Nyhamn, south of Lemland, at OpenStreetMap's `power=generator` nodes (ODbL), in the
 * scene's metres: Leovind's Enercon E-70s of 2007, the island's mark from Mariehamn's shore 10 km north. They stand from
 * the start of a drive, one list for all six as the windmills are, and reach 30 km, past where they're a pixel. Each
 * stands on the ground as the world has it, read again whenever more of the world lands, and faces the south-westerly
 * that blows over Åland most of the year.
 */
export const WIND_TURBINES: readonly { osm: number; x: number; z: number }[] = [
  { osm: 4990429694, x: -2880.6, z: 21276.5 },
  { osm: 4990429387, x: -3173.1, z: 21550.4 },
  { osm: 4990429635, x: -2700.5, z: 21565.9 },
  { osm: 4990429647, x: -2124.6, z: 21624.3 },
  { osm: 4990429675, x: -2200.5, z: 21928.7 },
  { osm: 5303244301, x: -2991.2, z: 22219.3 },
];

/** Turns a rotor's face, its +z, into the south-westerly. */
const INTO_WIND_YAW = -Math.PI / 4;

export function createWindTurbines(scene: Scene, materials: RoadsideMaterials, ground: { height: (x: number, z: number) => number; revision: () => number }) {
  const [tower, rotor] = [buildTurbineTower(), buildTurbineRotor()];
  let meshes: Mesh[] = [];
  let revision = -1;
  let shown = true;

  const place = (towers: readonly Placement[]) => {
    for (const mesh of meshes) {
      scene.remove(mesh);
      mesh.geometry.dispose();
    }
    meshes = [...placeModel(tower, towers, materials), ...placeModel(rotor, towers.map(rotorAt), materials)];
    for (const mesh of meshes) {
      mesh.visible = shown;
      scene.add(mesh);
    }
  };

  return {
    /** Stands them on the ground again once the world has more of it. */
    update() {
      if (ground.revision() === revision) return;
      revision = ground.revision();
      place(WIND_TURBINES.map(({ x, z }) => ({ x, y: ground.height(x, z), z, yaw: INTO_WIND_YAW })));
    },
    /** One of each model out of sight, so its pipelines are built before the drive. */
    showAll(all: boolean) {
      if (!all) {
        revision = -1;
        return;
      }
      place([{ x: 0, y: -1000, z: 0, scale: 0 }]);
    },
    show(visible: boolean) {
      shown = visible;
      for (const mesh of meshes) mesh.visible = visible;
    },
    dispose() {
      for (const mesh of meshes) mesh.geometry.dispose();
      for (const model of [tower, rotor]) {
        model.near.dispose();
        model.far?.dispose();
      }
    },
  };
}
