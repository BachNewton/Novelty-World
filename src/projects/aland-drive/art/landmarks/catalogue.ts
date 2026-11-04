import { BufferAttribute, BufferGeometry } from "three";
import type { ArtModel } from "../catalogue";
import { LANDMARKS } from "./index";
import type { LandmarkMesh } from "./kit";

/** A landmark's mesh as the buildings' material reads it. */
export function landmarkGeometry({ positions, facades, tints, indices }: LandmarkMesh): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("facade", new BufferAttribute(facades, 4));
  geometry.setAttribute("tint", new BufferAttribute(tints, 4, true));
  geometry.setIndex(new BufferAttribute(indices, 1));
  return geometry;
}

/** Every landmark the gallery shows, near and far. */
export const artModels = (): ArtModel[] => LANDMARKS().map(({ name, near, far }) => ({ name, geometries: { near: landmarkGeometry(near), far: landmarkGeometry(far) } }));
