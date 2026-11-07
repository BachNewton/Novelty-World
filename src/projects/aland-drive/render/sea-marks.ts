import { Vector3, type Mesh, type Scene } from "three/webgpu";
import { uniform } from "three/tsl";
import { buildKummel, buildLighthouse, identityMaterials } from "../art/identity/index";
import { buildFixedMark, buildLeadingMark, buildPillarBuoy, buildRadarMark, buildSkerryLight, buildSpar, LEADING_PATTERNS, marinaMaterials, RADAR_BANDS, radarMarkScale, SEA_MARKS } from "../art/marina/index";
import { IDENTITY_PARTS } from "../art/identity/mesh";
import { MARINA_PARTS } from "../art/marina/paint";
import { partBounds } from "../art/night";
import { placeModel, type Placement, type RoadsideInputs, type RoadsideMaterials, type RoadsideModel } from "../art/roadside/index";
import data from "../sea/marks.json";
import { showVersionsInReach } from "./versions-in-reach";

/*
 * The sea marks round Åland at the official aids to navigation (`pipeline/sea_marks.py`, `sea/marks.json`): spars,
 * buoys and fixed marks by their IALA side or cardinal, leading marks in their real stripes, cairns, lights and radar
 * marks. The file is the whole island, but a model's list holds only the marks within its reach of the camera's
 * kilometre cell, rebuilt when the camera crosses into another: at most two draw calls a model in view, none for a
 * version no mark is in range of, and the vertices three runs are those of the marks round the camera, not of the
 * island's two thousand. A mark that floats stands
 * on the drawn sea; one on a skerry or the shore on the ground as the world has it then.
 */

const WATER_Y = -0.05;
const CELL_M = 1000;

type Kit = "marina" | "identity";
type Kind = { kit: Kit; build: () => RoadsideModel; scaleFor?: (heightM: number) => number };

/** Every model a mark in `sea/marks.json` may name, and how each is built. */
export function seaMarkKinds(): Record<string, Kind> {
  const found: Record<string, Kind> = {
    cairn: { kit: "identity", build: buildKummel },
    lighthouse: { kit: "identity", build: buildLighthouse },
    "skerry-light": { kit: "marina", build: buildSkerryLight },
  };
  for (const side of SEA_MARKS) {
    found[`spar-${side}`] = { kit: "marina", build: () => buildSpar(side) };
    found[`pillar-${side}`] = { kit: "marina", build: () => buildPillarBuoy(side) };
    found[`fixed-${side}`] = { kit: "marina", build: () => buildFixedMark(side) };
  }
  for (const pattern of LEADING_PATTERNS) {
    for (const role of ["front", "rear"] as const) found[`leading-${role}-${pattern}`] = { kit: "marina", build: () => buildLeadingMark(role, pattern) };
  }
  // A radar mark stands as tall as the register says, the one model scaled to it.
  for (const bands of RADAR_BANDS) found[`radar-${bands}`] = { kit: "marina", build: () => buildRadarMark(bands), scaleFor: (heightM) => (heightM > 0 ? radarMarkScale(heightM) : 1) };
  return found;
}

/** The level a mark stands at: on the drawn sea if it floats, else on the ground as the world has it now. */
export const markFoot = (x: number, z: number, floats: boolean, groundAt: (x: number, z: number) => number) => (floats ? WATER_Y : groundAt(x, z));

/** The part a kit's lit marks shine from: a buoy's or skerry light's lens, a lighthouse's lamp in its lantern. */
const LAMP_PARTS: Record<Kit, number> = { marina: MARINA_PARTS.indexOf("mark-lens"), identity: IDENTITY_PARTS.indexOf("lamp") };
const lamps = new Map<string, number>();

/**
 * Where a mark's light shines from, up from its foot, from the very model drawn there: its lamp where the model has one,
 * and where it has none (a spar, a cairn, a leading board), the top of the mark, where a lit one carries its lantern.
 */
export function markLampM(model: string, heightM: number): number {
  const kinds = seaMarkKinds();
  if (!(model in kinds)) throw new Error(`a light on a ${model}, which there isn't`);
  const { kit, build, scaleFor } = kinds[model];
  let lamp = lamps.get(model);
  if (lamp === undefined) {
    const geometry = build().near;
    const glass = partBounds(geometry, LAMP_PARTS[kit]);
    geometry.computeBoundingBox();
    if (geometry.boundingBox === null) throw new Error(`the ${model} has no bounds`);
    lamp = glass.isEmpty() ? geometry.boundingBox.max.y : glass.getCenter(new Vector3()).y;
    lamps.set(model, lamp);
  }
  return lamp * (scaleFor?.(heightM) ?? 1);
}

export function createSeaMarks(scene: Scene, inputs: RoadsideInputs, groundAt: (x: number, z: number) => number) {
  const materials: Record<Kit, RoadsideMaterials> = {
    marina: marinaMaterials({ ...inputs, time: uniform(0) }),
    identity: identityMaterials({ ...inputs, time: uniform(0) }),
  };
  const known = seaMarkKinds();
  const byModel = new Map<string, { x: number; z: number; yaw: number; floats: boolean; scale: number }[]>();
  for (const [model, x, z, yaw, floats, heightM] of data.marks as [string, number, number, number, number, number][]) {
    if (!(model in known)) throw new Error(`sea/marks.json places a ${model}, which there isn't`);
    const scale = known[model].scaleFor?.(heightM) ?? 1;
    byModel.set(model, [...(byModel.get(model) ?? []), { x, z, yaw, floats: floats === 1, scale }]);
  }
  const lists = [...byModel].map(([name, marks]) => {
    const { kit, build } = known[name];
    return { name, marks, near: [] as typeof marks, model: build(), kit, meshes: [] as Mesh[], shown: 0 };
  });
  let cell: string | null = null;
  let shownAtAll = true;

  const rebuild = (cx: number, cz: number) => {
    for (const list of lists) {
      for (const mesh of list.meshes) {
        scene.remove(mesh);
        mesh.geometry.dispose();
      }
      const reach = list.model.reachM + CELL_M;
      const near = list.marks.filter(({ x, z }) => Math.abs(x - cx) < reach && Math.abs(z - cz) < reach);
      list.near = near;
      const places: Placement[] = near.map(({ x, z, yaw, floats, scale }) => ({ x, y: markFoot(x, z, floats, groundAt), z, yaw, scale }));
      list.shown = places.length;
      list.meshes = places.length > 0 ? placeModel(list.model, places, materials[list.kit]) : [];
      for (const mesh of list.meshes) scene.add(mesh);
    }
  };

  return {
    /** Keeps the lists to the marks round `x`, `z`, rebuilding them when it moves into another kilometre cell; the camera says which versions draw. */
    update(x: number, z: number, camera: { x: number; z: number }) {
      const [cx, cz] = [Math.floor(x / CELL_M), Math.floor(z / CELL_M)];
      const key = `${cx},${cz}`;
      if (key !== cell) {
        cell = key;
        rebuild((cx + 0.5) * CELL_M, (cz + 0.5) * CELL_M);
      }
      for (const { meshes, near, model } of lists) {
        if (meshes.length === 0) continue;
        let [nearest, farthest] = [Infinity, 0];
        for (const mark of near) {
          const away = Math.hypot(mark.x - camera.x, mark.z - camera.z);
          [nearest, farthest] = [Math.min(nearest, away), Math.max(farthest, away)];
        }
        showVersionsInReach(model, meshes, nearest, farthest);
        if (!shownAtAll) for (const mesh of meshes) mesh.visible = false;
      }
    },
    /** One of every model, at a place out of sight, so each pipeline is built before the drive. */
    showAll(all: boolean) {
      if (!all) {
        cell = null;
        return;
      }
      for (const list of lists) {
        for (const mesh of list.meshes) {
          scene.remove(mesh);
          mesh.geometry.dispose();
        }
        list.meshes = placeModel(list.model, [{ x: 0, y: -1000, z: 0, scale: 0 }], materials[list.kit]);
        for (const mesh of list.meshes) scene.add(mesh);
      }
    },
    show(shown: boolean) {
      shownAtAll = shown;
      for (const { meshes } of lists) for (const mesh of meshes) mesh.visible = shown;
    },
    /** How many of each model are drawn round the camera. */
    counts(): Record<string, number> {
      return Object.fromEntries(lists.map(({ name, shown }) => [name, shown]));
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
