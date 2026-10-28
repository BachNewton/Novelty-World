import { Group, Mesh, type MeshBasicNodeMaterial, type Vector3 } from "three/webgpu";
import { tileId, tileWidth, wantedTiles, type Eye, type TileKey } from "../engine/streaming";
import type { LandTile } from "../engine/tiles";
import type { World } from "../engine/world";
import type { Quality } from "../quality";
import { landWorkers } from "./land-workers";
import type { Palette } from "./palette";
import { terrainGeometry, terrainMaterial, type Morph } from "./terrain";
import { waterGeometry, waterMaterial } from "./water";

/*
 * The land round the camera out to the horizon, streamed: the tiles the
 * camera wants are worked out in workers, nearest and finest first, made
 * into meshes as they come back, and the drawn set changes over to them all
 * at once when every one is ready, so no hole ever opens. Tiles no longer
 * wanted are kept a while in case the camera comes back, then dropped.
 */

/** How far the camera moves before the wanted tiles are worked out again, in metres. */
const RECHECK = 4;
/** How many built tiles are kept beyond those drawn. */
const KEPT = 600;
/** How many tiles are asked of the workers at once. */
const IN_FLIGHT = 12;

interface Built {
  tile: LandTile;
  land: Mesh;
  water: Mesh | null;
}

export interface Land {
  object: Group;
  /** Streams the land round the eye; returns whether everything it wants is drawn. */
  update: (eye: Vector3) => boolean;
  /** A finest tile, by its place on the finest grid, if it is built. */
  finestTile: (i: number, j: number) => LandTile | undefined;
  dispose: () => void;
}

function priority(eye: Eye, key: TileKey): number {
  const size = tileWidth(key.level);
  return Math.hypot((key.i + 0.5) * size - eye.x, (key.j + 0.5) * size - eye.z) / size;
}

/** A tile is drawn until the camera is within `tileSplit` of its parent's widths of it: it eases into the parent's shape over the last stretch before that. */
function morphFor(level: number, quality: Quality): Morph {
  const swap = tileWidth(level + 1) * quality.tileSplit;
  return { start: swap * 0.62, end: swap * 0.92 };
}

export function makeLand(world: World, palette: Palette, quality: Quality): Land {
  const object = new Group();
  const landMaterial: MeshBasicNodeMaterial = terrainMaterial(palette, quality.trees.far);
  const wetMaterial: MeshBasicNodeMaterial = waterMaterial(palette);
  const built = new Map<string, Built>();
  const arrived: LandTile[] = [];
  const asked = new Set<string>();
  let shown = new Set<string>();
  let wanted: TileKey[] = [];
  let pending: TileKey[] = [];
  let from: Eye | null = null;
  const workers = landWorkers(world.seed, (tile) => arrived.push(tile));

  const build = (tile: LandTile): Built => {
    const land = new Mesh(terrainGeometry(tile, palette, morphFor(tile.key.level, quality)), landMaterial);
    const wet = waterGeometry(tile);
    return { tile, land, water: wet ? new Mesh(wet, wetMaterial) : null };
  };
  const free = (b: Built) => {
    b.land.geometry.dispose();
    b.water?.geometry.dispose();
  };

  return {
    object,
    update(camera) {
      const eye = { x: camera.x, y: camera.y - world.surfaceAt(camera.x, camera.z), z: camera.z };
      if (from === null || Math.hypot(eye.x - from.x, eye.y - from.y, eye.z - from.z) > RECHECK) {
        from = eye;
        wanted = wantedTiles(eye, quality);
        pending = wanted.filter((k) => !built.has(tileId(k)) && !asked.has(tileId(k))).sort((a, b) => priority(eye, a) - priority(eye, b));
      }
      while (pending.length > 0 && workers.waiting() < IN_FLIGHT) {
        const key = pending.shift() as TileKey;
        asked.add(tileId(key));
        workers.request(key);
      }
      for (const tile of arrived.splice(0)) {
        const id = tileId(tile.key);
        asked.delete(id);
        built.set(id, build(tile));
      }
      if (wanted.some((k) => !built.has(tileId(k)))) return false;
      const ids = new Set(wanted.map(tileId));
      if (ids.size !== shown.size || [...ids].some((id) => !shown.has(id))) {
        object.clear();
        for (const id of ids) {
          const b = built.get(id);
          if (!b) continue;
          object.add(b.land);
          if (b.water) object.add(b.water);
        }
        shown = ids;
        if (built.size > ids.size + KEPT) {
          for (const [id, b] of built) {
            if (built.size <= ids.size + KEPT) break;
            if (ids.has(id)) continue;
            free(b);
            built.delete(id);
          }
        }
      }
      return true;
    },
    finestTile: (i, j) => built.get(tileId({ level: 0, i, j }))?.tile,
    dispose() {
      workers.dispose();
      for (const b of built.values()) free(b);
      built.clear();
      object.clear();
      landMaterial.dispose();
      wetMaterial.dispose();
    },
  };
}
