import IDS from "./facade-ids.json";
import type { Frame, LandmarkMesh, Paint, Vec2 } from "../landmarks/kit";

/*
 * Colours and walls for the models. A model is drawn with the wall material (`render/buildings.ts`), so a flat colour is
 * that material's roof style, as the landmark kit's `flat`, here for this folder's tokens. Letters on a model are the
 * facade shader's: a wall quad given a facade and the "plate" front.
 */

/** A model's +x to a compass bearing, its +z to the right of that, as seen from above. */
export function onBearing(bearingDeg: number, at: Vec2 = [0, 0]): Frame {
  const bearing = (bearingDeg * Math.PI) / 180;
  const sin = Math.sin(bearing);
  const cos = Math.cos(bearing);
  return ([x, y, z]) => [at[0] + x * sin + z * cos, y, at[1] - x * cos + z * sin];
}

export type Inks = (name: string) => string;

const ROOF_GAIN = 1.15;
const ROOF_GAMMA = 2.2;

export function painter(inks: Inks) {
  return (name: string, shade = 1): Paint => {
    const hex = inks(name);
    const byte = (at: number) => {
      const linear = Math.pow(parseInt(hex.slice(at, at + 2), 16) / 255, 2.2);
      return Math.min(255, Math.round(255 * Math.pow((linear * shade) / ROOF_GAIN, 1 / ROOF_GAMMA)));
    };
    return [byte(1), byte(3), byte(5), 0];
  };
}

export type Painter = ReturnType<typeof painter>;

/** The tint of a sign plate saying a word, on a fascia of the seed's choosing. */
export function plateTint(word: string, seed: number): Paint {
  const at = IDS.words.indexOf(word);
  if (at < 0) throw new Error(`no sign word ${word}`);
  return [IDS.fronts.plate << 5, 128 | at, seed, IDS.styles.hall];
}

/** Turns a quad already in a mesh, its four vertices from `first`, into a wall of this size with this tint. */
export function makePlate(mesh: LandmarkMesh, first: number, width: number, height: number, tint: Paint): void {
  const corners = [
    [0, 0],
    [width, 0],
    [width, height],
    [0, height],
  ];
  corners.forEach(([along, up], at) => {
    mesh.facades.set([along, up, width, height], (first + at) * 4);
    mesh.tints.set(tint, (first + at) * 4);
  });
}

export function merged(...meshes: LandmarkMesh[]): LandmarkMesh {
  const vertices = meshes.reduce((sum, mesh) => sum + mesh.positions.length / 3, 0);
  const positions = new Float32Array(vertices * 3);
  const facades = new Float32Array(vertices * 4);
  const tints = new Uint8Array(vertices * 4);
  const indices = new Uint16Array(meshes.reduce((sum, mesh) => sum + mesh.indices.length, 0));
  let [vertexAt, indexAt] = [0, 0];
  for (const mesh of meshes) {
    positions.set(mesh.positions, vertexAt * 3);
    facades.set(mesh.facades, vertexAt * 4);
    tints.set(mesh.tints, vertexAt * 4);
    indices.set(mesh.indices.map((index) => index + vertexAt), indexAt);
    vertexAt += mesh.positions.length / 3;
    indexAt += mesh.indices.length;
  }
  return { positions, facades, tints, indices };
}

export const triangles = (mesh: LandmarkMesh) => mesh.indices.length / 3;
