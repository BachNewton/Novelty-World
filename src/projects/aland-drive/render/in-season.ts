import type { MeshBasicNodeMaterial, Node, Object3D } from "three/webgpu";
import { attribute, select, uint, uniform } from "three/tsl";
import { placeSeed, saltedOn, seedOf, unitOfSalted } from "../art/hash";
import { changeOf, dialsNow, type SeasonLook } from "../art/season";
import { TERRACE_SQUARE_M, type InSeason } from "../climate/placed-season";

/*
 * A placed thing out of its season (`climate/placed-season.ts`) folds to its place in its vertex shader, as a place
 * past its reach does, so no list is rebuilt for the season: its kit's own material, copied once, with the fold over
 * the kit's own placing. Which kind a mesh draws, and so which of the season's shares it reads and with what salt, is
 * read per mesh (`markInSeason`), so every kind of a kit draws through the one copy, and a kind out all year reads a
 * share of 1, which never folds: one pipeline a kit rather than one a kind, each compiling the kit's whole shader.
 * Its threshold is rolled here as the CPU rolls it.
 */

const kindOf = (object: Object3D | null | undefined) => object?.userData.inSeason as InSeason | undefined;

/** Says which kind a kit's meshes draw, for the copy's fold to read: none for a kind out all year. */
export function markInSeason<Meshes extends Object3D[]>(meshes: Meshes, kind: InSeason | undefined): Meshes {
  for (const mesh of meshes) mesh.userData.inSeason = kind;
  return meshes;
}

/** Whether a thing at a place is out, in a shader: the share its mesh's kind reads, against the thing's own threshold. */
function outHere(season: SeasonLook, place: Node<"vec2">): Node<"bool"> {
  const share = uniform(1).onObjectUpdate(({ object }) => {
    const kind = kindOf(object);
    return kind === undefined ? 1 : dialsNow(season)[kind.dial];
  });
  const salt = uniform(0).onObjectUpdate(({ object }) => kindOf(object)?.salt ?? 0);
  const byTerrace = uniform(0).onObjectUpdate(({ object }) => (kindOf(object)?.byTerrace === true ? 1 : 0));
  const seed = select(byTerrace.greaterThan(0.5), seedOf(place.x.div(TERRACE_SQUARE_M), place.y.div(TERRACE_SQUARE_M)), placeSeed(place));
  return changeOf(share, unitOfSalted(seed, saltedOn(uint(salt)))).greaterThan(0.5);
}

/** A copy of a placed kit's material whose places fold to their foot out of season: the kit reads its places from `place` (x, y, z, yaw). */
export function inSeasonMaterial<Material extends MeshBasicNodeMaterial>(material: Material, season: SeasonLook): Material {
  const placed = material.positionNode;
  if (placed === null) throw new Error(`a ${material.type} with no positionNode can't fold its places out of season`);
  const place = attribute<"vec4">("place", "vec4");
  const copy = material.clone() as Material;
  copy.positionNode = select(outHere(season, place.xz), placed, place.xyz);
  return copy;
}

/** A kit's near and far materials, each folding its places out of season by the kind each mesh is marked with. */
export function inSeasonMaterials<Materials extends { near: MeshBasicNodeMaterial; far: MeshBasicNodeMaterial }>(materials: Materials, season: SeasonLook): Materials {
  return { ...materials, near: inSeasonMaterial(materials.near, season), far: inSeasonMaterial(materials.far, season) };
}
