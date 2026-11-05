import { Sphere, Vector3, type Mesh, type Scene } from "three/webgpu";
import { placeModel, type Placement, type RoadsideMaterials, type RoadsideModel } from "../art/roadside/index";
import { buildStoneWall, STONE_WALL_M, STONE_WALL_OVERLAP_M as OVERLAP_M } from "../art/rural/index";
import { SECTION_FLOATS, type WallSections } from "./tile-walls";

/*
 * The dry-stone walls of every loaded tile (`tile-walls.ts`), drawn as the rural kit's
 * wall section laid end to end: each section stretched to its length and sheared to
 * its slope, so it runs from the drawn ground at one end to the drawn ground at the
 * other. Half the sections are laid the other way round, so the stones don't repeat
 * every few metres.
 *
 * A wall is long, and a tile holds kilometres of it, so its sections are kept in cells:
 * small ones for the near version, which only stands within its swap, and large ones
 * for the far version, which stands to the reach. A cell is drawn only while some of
 * it could be in its version's range and in view, so the near version's stones cost
 * nothing past the first hundred metres. Which version a section shows is still the
 * material's, by its own distance, so a cell can't make anything appear or vanish.
 */

const NEAR_CELL_M = 150;
const FAR_CELL_M = 600;
/** As far as a wall is drawn, where it's a pixel or two tall and grows up out of the ground over its last stretch. */
export const STONE_WALL_REACH_M = 700;
/** The most a cell's sections reach above or below the ground at its ends, for the cell's bounds. */
const HEIGHT_MARGIN_M = 1;

interface Cell {
  key: string;
  mesh: Mesh;
  /** The cell's square, x and z, for its distance from the camera. */
  west: number;
  north: number;
  size: number;
  count: number;
}

const roll = (x: number, z: number) => {
  const value = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return value - Math.floor(value);
};

/** Each section as a placement of the kit's wall: from one end, along to the other, stretched and sheared to fit. */
export function sectionPlacements(sections: WallSections, from = 0, to = sections.length / SECTION_FLOATS): Placement[] {
  const places: Placement[] = [];
  for (let section = from; section < to; section++) {
    let [x1, y1, z1, x2, y2, z2] = sections.subarray(section * SECTION_FLOATS, (section + 1) * SECTION_FLOATS);
    if (roll(x1 + x2, z1 + z2) < 0.5) [x1, y1, z1, x2, y2, z2] = [x2, y2, z2, x1, y1, z1];
    const length = Math.max(Math.hypot(x2 - x1, z2 - z1), 1e-6);
    const [alongX, alongZ] = [(x2 - x1) / length, (z2 - z1) / length];
    const shear = (y2 - y1) / length;
    // The model's +x turns to (cos yaw, -sin yaw) on the ground.
    places.push({ x: x1 - alongX * OVERLAP_M, y: y1 - shear * OVERLAP_M, z: z1 - alongZ * OVERLAP_M, yaw: Math.atan2(-alongZ, alongX), stretch: (length + 2 * OVERLAP_M) / STONE_WALL_M, shear });
  }
  return places;
}

/** The sections of a tile sorted into cells of a size, by their middles. */
function cellsOf(sections: WallSections, size: number): Map<string, number[]> {
  const cells = new Map<string, number[]>();
  for (let section = 0; section < sections.length / SECTION_FLOATS; section++) {
    const at = section * SECTION_FLOATS;
    const key = `${String(Math.floor((sections[at] + sections[at + 3]) / 2 / size))},${String(Math.floor((sections[at + 2] + sections[at + 5]) / 2 / size))}`;
    const list = cells.get(key) ?? [];
    list.push(section);
    cells.set(key, list);
  }
  return cells;
}

function boundsOf(sections: WallSections, picked: number[]): Sphere {
  const low = new Vector3(Infinity, Infinity, Infinity);
  const high = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const section of picked) {
    for (const end of [0, 3]) {
      const at = section * SECTION_FLOATS + end;
      low.min(new Vector3(sections[at], sections[at + 1], sections[at + 2]));
      high.max(new Vector3(sections[at], sections[at + 1], sections[at + 2]));
    }
  }
  low.y -= HEIGHT_MARGIN_M;
  high.y += HEIGHT_MARGIN_M;
  const centre = low.clone().add(high).multiplyScalar(0.5);
  return new Sphere(centre, centre.distanceTo(high) + OVERLAP_M);
}

/** The nearest and farthest a cell's square lies from a point on the ground. */
function reachOf(cell: Cell, x: number, z: number): [number, number] {
  const dx = Math.max(cell.west - x, 0, x - (cell.west + cell.size));
  const dz = Math.max(cell.north - z, 0, z - (cell.north + cell.size));
  const fx = Math.max(Math.abs(x - cell.west), Math.abs(x - (cell.west + cell.size)));
  const fz = Math.max(Math.abs(z - cell.north), Math.abs(z - (cell.north + cell.size)));
  return [Math.hypot(dx, dz), Math.hypot(fx, fz)];
}

export interface StoneWallsDrawn {
  /** Cells drawn this frame, near and far, before the view's own culling. */
  nearCells: number;
  farCells: number;
  sections: number;
}

export function createStoneWalls(scene: Scene, materials: RoadsideMaterials) {
  const model: RoadsideModel = { ...buildStoneWall(1), reachM: STONE_WALL_REACH_M };
  if (model.far === null) throw new Error("The kit's stone wall has no far version");
  const tiles = new Map<string, { near: Cell[]; far: Cell[]; sections: number }>();
  // One folded section of each version, always in the scene, so their pipelines are compiled before the drive.
  const standIns = placeModel(model, [{ x: 0, y: 0, z: 0, scale: 0 }], materials);
  for (const mesh of standIns) {
    mesh.visible = false;
    scene.add(mesh);
  }
  let shownAll = false;
  let drawn: StoneWallsDrawn = { nearCells: 0, farCells: 0, sections: 0 };

  const cells = (sections: WallSections, size: number, version: 0 | 1): Cell[] =>
    [...cellsOf(sections, size)].map(([key, picked]) => {
      const meshes = placeModel(model, picked.flatMap((section) => sectionPlacements(sections, section, section + 1)), materials);
      const mesh = meshes[version];
      meshes[1 - version].geometry.dispose();
      mesh.geometry.boundingSphere = boundsOf(sections, picked);
      mesh.frustumCulled = true;
      mesh.visible = false;
      scene.add(mesh);
      const [column, row] = key.split(",").map(Number);
      return { key, mesh, west: column * size, north: row * size, size, count: picked.length };
    });

  const drop = (list: Cell[]) => {
    for (const { mesh } of list) {
      scene.remove(mesh);
      mesh.geometry.dispose();
    }
  };

  return {
    add(tile: string, sections: WallSections) {
      if (tiles.has(tile)) throw new Error(`${tile}'s stone walls are already placed`);
      tiles.set(tile, { near: cells(sections, NEAR_CELL_M, 0), far: cells(sections, FAR_CELL_M, 1), sections: sections.length / SECTION_FLOATS });
    },
    remove(tile: string) {
      const placed = tiles.get(tile);
      if (!placed) throw new Error(`${tile} has no stone walls to remove`);
      drop(placed.near);
      drop(placed.far);
      tiles.delete(tile);
    },
    /** Shows each cell that could have a section in its version's range from where the camera stands. */
    update(camera: Vector3) {
      const next: StoneWallsDrawn = { nearCells: 0, farCells: 0, sections: 0 };
      for (const { near, far } of tiles.values()) {
        for (const cell of near) {
          cell.mesh.visible = shownAll || reachOf(cell, camera.x, camera.z)[0] < model.swapM + STONE_WALL_M;
          if (cell.mesh.visible) next.nearCells++;
        }
        for (const cell of far) {
          const [nearest, farthest] = reachOf(cell, camera.x, camera.z);
          cell.mesh.visible = shownAll || (nearest < STONE_WALL_REACH_M && farthest > model.swapM * 0.6);
          if (cell.mesh.visible) {
            next.farCells++;
            next.sections += cell.count;
          }
        }
      }
      drawn = next;
    },
    /** Every mesh shown, for compiling before the drive; `false` leaves the next update to choose. */
    showAll(all: boolean) {
      shownAll = all;
      for (const mesh of standIns) mesh.visible = all;
      for (const { near, far } of tiles.values()) for (const { mesh } of [...near, ...far]) mesh.visible = all;
    },
    drawn: () => drawn,
    dispose() {
      for (const { near, far } of tiles.values()) {
        drop(near);
        drop(far);
      }
      for (const mesh of standIns) mesh.geometry.dispose();
      model.near.dispose();
      model.far?.dispose();
    },
  };
}
