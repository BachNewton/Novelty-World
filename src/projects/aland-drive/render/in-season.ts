import type { MeshBasicNodeMaterial, Node } from "three/webgpu";
import { attribute, select } from "three/tsl";
import { placeSeed, seedOf, unitOf } from "../art/hash";
import { changeOf, seasonNodes, type SeasonLook } from "../art/season";
import { TERRACE_SQUARE_M, type InSeason } from "../climate/placed-season";

/*
 * A placed thing out of its season (`climate/placed-season.ts`) folds to its place in its vertex shader, as a place
 * past its reach does, so no list is rebuilt for the season: its kit's own material, copied, with the fold over the
 * kit's own placing. Its threshold is rolled here as the CPU rolls it.
 */

/** A thing's threshold, from 0 to 1, from where it stands: `thresholdOf` on the GPU. */
function thresholdAt(place: Node<"vec2">, { salt, byTerrace = false }: InSeason): Node<"float"> {
  const seed = byTerrace ? seedOf(place.x.div(TERRACE_SQUARE_M), place.y.div(TERRACE_SQUARE_M)) : placeSeed(place);
  return unitOf(seed, salt);
}

/** Whether a thing at a place is out, in a shader. */
export function outAt(season: SeasonLook, place: Node<"vec2">, kind: InSeason): Node<"bool"> {
  return changeOf(seasonNodes(season)[kind.dial], thresholdAt(place, kind)).greaterThan(0.5);
}

/** A copy of a placed kit's material whose places fold to their foot out of season: the kit reads its places from `place` (x, y, z, yaw). */
export function inSeasonMaterial<Material extends MeshBasicNodeMaterial>(material: Material, season: SeasonLook, kind: InSeason): Material {
  const placed = material.positionNode;
  if (placed === null) throw new Error(`a ${material.type} with no positionNode can't fold its places out of season`);
  const place = attribute<"vec4">("place", "vec4");
  const copy = material.clone() as Material;
  copy.positionNode = select(outAt(season, place.xz, kind), placed, place.xyz);
  return copy;
}

/** A kit's near and far materials, each folding its places out of season. */
export function inSeasonMaterials<Materials extends { near: MeshBasicNodeMaterial; far: MeshBasicNodeMaterial }>(materials: Materials, season: SeasonLook, kind: InSeason): Materials {
  return { ...materials, near: inSeasonMaterial(materials.near, season, kind), far: inSeasonMaterial(materials.far, season, kind) };
}
