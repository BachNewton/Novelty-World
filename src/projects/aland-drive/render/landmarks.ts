import { BufferAttribute, BufferGeometry, Mesh, MeshBasicNodeMaterial, type Scene, type Vector3 } from "three/webgpu";
import { abs, attribute, float, int, positionLocal, uniformArray } from "three/tsl";
import type { Inks } from "../art/facades/paint";
import type { LandmarkMesh } from "../art/landmarks/kit";
import { buildSite } from "../art/landmarks/sites";
import type { LandmarkPlace, WorldTileEntry } from "./tile";

/*
 * The stone churches and landmarks at their real sites (`pipeline/landmarks.py`), drawn with the buildings' own
 * material. Every site's far version is in one mesh from the start, so a church on the skyline costs one draw call
 * however many there are, and stands there from any distance, as the land under it does. A tile's near versions are one
 * mesh, built when the tile's detail lands, since a church's yard wall follows the ground. Which version a site shows is
 * one flag per site, read by both meshes' vertices: the version not shown folds to a point, so a site is never both or
 * neither.
 */

/** The near version shows inside this, where its detail is still more than a pixel or so on the floor's screen. */
export const LANDMARK_NEAR_M = 1400;

interface Site {
  index: number;
  tile: string;
  place: LandmarkPlace;
}

type HeightAt = (x: number, z: number) => number;

/** The models, turned and moved to their places in the scene, as one geometry; `far` marks the version. */
function geometryOf(parts: { site: Site; mesh: LandmarkMesh }[], far: boolean): BufferGeometry {
  const vertices = parts.reduce((sum, { mesh }) => sum + mesh.positions.length / 3, 0);
  const positions = new Float32Array(vertices * 3);
  const facades = new Float32Array(vertices * 4);
  const tints = new Uint8Array(vertices * 4);
  const tags = new Float32Array(vertices * 2);
  const indices = new Uint32Array(parts.reduce((sum, { mesh }) => sum + mesh.indices.length, 0));
  let vertex = 0;
  let index = 0;
  for (const { site, mesh } of parts) {
    const { x, y, z, yaw } = site.place;
    const [sin, cos] = [Math.sin(yaw), Math.cos(yaw)];
    const count = mesh.positions.length / 3;
    for (let at = 0; at < count; at++) {
      const [px, py, pz] = mesh.positions.subarray(at * 3, at * 3 + 3);
      positions.set([x + px * cos + pz * sin, y + py, z - px * sin + pz * cos], (vertex + at) * 3);
      tags.set([site.index, far ? 1 : 0], (vertex + at) * 2);
    }
    facades.set(mesh.facades, vertex * 4);
    tints.set(mesh.tints, vertex * 4);
    for (let at = 0; at < mesh.indices.length; at++) indices[index + at] = mesh.indices[at] + vertex;
    vertex += count;
    index += mesh.indices.length;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("facade", new BufferAttribute(facades, 4));
  geometry.setAttribute("tint", new BufferAttribute(tints, 4, true));
  geometry.setAttribute("landmark", new BufferAttribute(tags, 2));
  geometry.setIndex(new BufferAttribute(indices, 1));
  return geometry;
}

export function createLandmarks(scene: Scene, wallMaterial: MeshBasicNodeMaterial, tiles: WorldTileEntry[], inks: Inks, heightAt: HeightAt, origin: { east: number; north: number }) {
  const sites: Site[] = tiles.flatMap((tile) => (tile.landmarks ?? []).map((place) => ({ tile: tile.name, place }))).map((site, index) => ({ ...site, index }));
  // 1 where a site shows its near version. A world with no sites still has one, so the array is never empty.
  const nearShown = sites.map(() => 0);
  const flags = uniformArray<"float">(nearShown.length > 0 ? nearShown : [0], "float");

  const material = new MeshBasicNodeMaterial();
  material.colorNode = wallMaterial.colorNode;
  material.side = wallMaterial.side;
  const tag = attribute<"vec2">("landmark", "vec2");
  // The far version shows where its flag is 0, the near where it's 1; the other folds to a point.
  const hidden = abs(flags.element(int(tag.x)).add(tag.y).sub(1));
  material.positionNode = positionLocal.mul(float(1).sub(hidden));

  const meshOf = (geometry: BufferGeometry) => {
    const mesh = new Mesh(geometry, material);
    mesh.frustumCulled = false;
    scene.add(mesh);
    return mesh;
  };

  const ground = (east: number, north: number) => heightAt(east - origin.east, origin.north - north);
  const modelOf = (site: Site) => buildSite(site.place.model, inks, ground);
  const far = meshOf(geometryOf(sites.map((site) => ({ site, mesh: modelOf(site).far })), true));
  far.visible = sites.length > 0;
  const near = new Map<string, { mesh: Mesh; sites: Site[] }>();

  return {
    /** A tile's detail has landed, and with it the ground its near versions stand on. */
    add(tile: string) {
      const own = sites.filter((site) => site.tile === tile);
      if (own.length === 0) return;
      if (near.has(tile)) throw new Error(`${tile}'s landmarks are already near`);
      const mesh = meshOf(geometryOf(own.map((site) => ({ site, mesh: modelOf(site).near })), false));
      mesh.visible = false;
      near.set(tile, { mesh, sites: own });
    },
    remove(tile: string) {
      const built = near.get(tile);
      if (!built) return;
      scene.remove(built.mesh);
      built.mesh.geometry.dispose();
      for (const site of built.sites) nearShown[site.index] = 0;
      near.delete(tile);
    },
    /** Picks each site's version for this frame, from where it's seen. */
    update(eye: Vector3) {
      for (const { mesh, sites: own } of near.values()) {
        let any = false;
        for (const { index, place } of own) {
          const close = Math.hypot(place.x - eye.x, place.z - eye.z) < LANDMARK_NEAR_M;
          nearShown[index] = close ? 1 : 0;
          any ||= close;
        }
        mesh.visible = any;
      }
      far.visible = nearShown.some((shown) => shown === 0);
    },
    dispose() {
      for (const { mesh } of near.values()) mesh.geometry.dispose();
      far.geometry.dispose();
      material.dispose();
    },
  };
}
