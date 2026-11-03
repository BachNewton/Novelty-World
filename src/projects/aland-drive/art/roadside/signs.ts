import type { BufferGeometry, Mesh, MeshBasicNodeMaterial } from "three/webgpu";
import { signMaterial, signOutlineKey, signPlate, signPost, signPostMaterial, signShift, type SignLook, type SignSheet, type Sun } from "../surfaces";
import { placeModel, placeSignPlates, signPlacing, type Placement } from "./material";
import { SIGN_PLATE_Y_M, SIGN_PLATE_Z_M, type RoadsideModel } from "./models";

/*
 * Road signs on posts, standing as the kit's other objects do. The plates, posts
 * and their look are `art/surfaces`' own, from Traficom's drawings, so a sign
 * beside the road is the one the sheet draws. Each post carries one plate, with its
 * middle at the kit's plate height, facing the post's +z.
 *
 * Plates cut to one outline (every speed limit, say) share a mesh and a draw, each
 * shifted on the sheet to its own sign, so the draws follow the outlines in use,
 * not the signs.
 */

/** Far enough that a plate is a few pixels when it dissolves. */
export const SIGN_REACH_M = 320;
/** Tall enough to carry the tallest plate at the kit's height. */
const POST_TOP_M = SIGN_PLATE_Y_M + 0.5;
const CLAMPS_M = [SIGN_PLATE_Y_M - 0.25, SIGN_PLATE_Y_M + 0.25];

const reaching = (geometry: BufferGeometry): RoadsideModel => ({ near: geometry, far: null, swapM: SIGN_REACH_M, reachM: SIGN_REACH_M });

export function createSignKit(sheet: SignSheet, look: SignLook, sun: Sun) {
  const plateMaterial = signMaterial(sheet, look, sun, signPlacing());
  const postMaterial: MeshBasicNodeMaterial = signPostMaterial(look, sun, signPlacing());
  const post = reaching(signPost(POST_TOP_M, CLAMPS_M));
  // Each outline's mesh is cut for the first sign that needed it.
  const outlines = new Map<string, { first: string; model: RoadsideModel }>();
  const outlineOf = (name: string) => {
    const key = signOutlineKey(sheet, name);
    const known = outlines.get(key);
    if (known) return known;
    const geometry = signPlate(sheet, name);
    geometry.translate(0, SIGN_PLATE_Y_M, SIGN_PLATE_Z_M);
    const made = { first: name, model: reaching(geometry) };
    outlines.set(key, made);
    return made;
  };

  return {
    /** Meshes for posts carrying these signs, by name: a post's mesh, then one a plate outline. */
    place(signs: ReadonlyMap<string, readonly Placement[]>): Mesh[] {
      const byOutline = new Map<RoadsideModel, { places: Placement[]; shifts: [number, number][] }>();
      for (const [name, places] of signs) {
        const { first, model } = outlineOf(name);
        const group = byOutline.get(model) ?? { places: [], shifts: [] };
        const shift = signShift(sheet, first, name);
        for (const place of places) {
          group.places.push(place);
          group.shifts.push(shift);
        }
        byOutline.set(model, group);
      }
      const allPlaces = [...byOutline.values()].flatMap(({ places }) => places);
      return [...placeModel(post, allPlaces, { near: postMaterial, far: postMaterial }), ...[...byOutline].map(([model, { places, shifts }]) => placeSignPlates(model, places, shifts, plateMaterial))];
    },
    dispose() {
      post.near.dispose();
      for (const { model } of outlines.values()) model.near.dispose();
      plateMaterial.dispose();
      postMaterial.dispose();
    },
  };
}

export type SignKit = ReturnType<typeof createSignKit>;
