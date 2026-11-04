import { Box3, BufferAttribute, BufferGeometry, Matrix4 } from "three";
import type { ArtModel } from "./catalogue";
import { coplanarOverlaps } from "./coplanar";

/** Flat ground or water under a model, a metre past it all round: a face lying in it fights it wherever the land is level. */
function groundUnder(geometries: readonly BufferGeometry[], groundY: number): BufferGeometry {
  const box = new Box3();
  for (const geometry of geometries) box.union(new Box3().setFromBufferAttribute(geometry.getAttribute("position") as BufferAttribute));
  const [x0, x1, z0, z1] = [box.min.x - 1, box.max.x + 1, box.min.z - 1, box.max.z + 1];
  const plane = new BufferGeometry();
  plane.setAttribute("position", new BufferAttribute(new Float32Array([x0, groundY, z0, x1, groundY, z0, x1, groundY, z1, x0, groundY, z1]), 3));
  plane.setIndex([0, 1, 2, 0, 2, 3]);
  return plane;
}

/** The next one along a row of a model laid end to end, as laid and, where every other one flips, turned end for end. */
function nextAlong(geometries: readonly BufferGeometry[], { alongM, flips = false }: NonNullable<ArtModel["laid"]>) {
  const box = new Box3();
  for (const geometry of geometries) box.union(new Box3().setFromBufferAttribute(geometry.getAttribute("position") as BufferAttribute));
  const step = alongM ?? box.max.x - box.min.x;
  const moved = (matrix: Matrix4) => geometries.map((geometry) => geometry.clone().applyMatrix4(matrix));
  const turned = new Matrix4().makeTranslation(box.min.x + box.max.x, 0, 0).multiply(new Matrix4().makeRotationY(Math.PI));
  const along = new Matrix4().makeTranslation(step, 0, 0);
  const neighbours: [readonly BufferGeometry[], readonly BufferGeometry[]][] = [[geometries, moved(along)]];
  if (flips) neighbours.push([geometries, moved(along.clone().multiply(turned))], [moved(turned), moved(along)]);
  return neighbours;
}

const across = (count: number) => ({ sources }: { sources: [number, number] }) => sources[0] < count !== sources[1] < count;

/**
 * A version's overlaps: its own faces', with the ground it stands on, and with the next one along a row. The ground
 * is a plane of its own under the model, so it's only counted against the model, which it would hide from a camera
 * below it if it were in with the model's own.
 */
export function overlapsOf(geometry: BufferGeometry | readonly BufferGeometry[], { groundY = 0, onGround = true, laid }: Pick<ArtModel, "groundY" | "onGround" | "laid">) {
  const own = Array.isArray(geometry) ? geometry : [geometry as BufferGeometry];
  const viewpoint = { groundY };
  return {
    own: coplanarOverlaps(own, viewpoint).length,
    onGround: groundY === null || !onGround ? 0 : coplanarOverlaps([...own, groundUnder(own, groundY)], viewpoint).filter(across(own.length)).length,
    beside: laid === undefined ? 0 : nextAlong(own, laid).reduce((sum, [one, next]) => sum + coplanarOverlaps([...one, ...next], viewpoint).filter(across(one.length)).length, 0),
  };
}
