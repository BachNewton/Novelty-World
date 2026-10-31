import { BufferAttribute, BufferGeometry, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshBasicNodeMaterial, Quaternion, Vector3 } from "three/webgpu";
import { attribute, cameraPosition, dot, float, positionLocal, smoothstep } from "three/tsl";
import type { SolidsCell } from "../../render/solids";
import { createBuilder, type LandmarkMesh } from "../landmarks/kit";
import IDS from "./facade-ids.json";
import type { Painter } from "./paint";

/*
 * What a shader can't do for a villa: things that stand off the wall. Each is a small model, its +x along the wall, +z out
 * of it and its origin at the foot of the wall, instanced. They need nothing from the pipeline: a villa's door facade is
 * read from the vertices themselves, and its seed picks what stands there. Past a few hundred metres each folds flat
 * against its wall, in the vertex shader, so none of them pops.
 */

export type AddOnKind = "veranda" | "porch" | "bay" | "fronton";

const FOLD_M = [260, 380] as const;
const STYLE_VILLA = IDS.styles.villa;
const NARROWEST_FACADE_M = 6;
const VERANDA_WIDE_M = 6.4;

function post(mesh: ReturnType<typeof createBuilder>, x: number, z: number, height: number, paint: readonly [number, number, number, number]) {
  const half = 0.07;
  mesh.extrude(
    [
      [x - half, z - half],
      [x + half, z - half],
      [x + half, z + half],
      [x - half, z + half],
    ],
    0,
    height,
    paint,
  );
}

/** A one-storey glazed veranda along the wall, 6.4 m wide before scaling, with steps at the front. */
function veranda(paint: Painter): LandmarkMesh {
  const mesh = createBuilder();
  const trim = paint("wall-trim");
  const roof = paint("wall-grey", 0.82);
  const [halfWide, deep, floor, eaves, wallTop] = [3.2, 2.4, 0.5, 3.0, 3.5];
  mesh.extrude(
    [
      [-halfWide, 0],
      [halfWide, 0],
      [halfWide, deep],
      [-halfWide, deep],
    ],
    -0.6,
    floor,
    paint("wall-plinth"),
    paint("road-minor", 0.8),
  );
  for (const x of [-halfWide, -halfWide / 3, halfWide / 3, halfWide]) post(mesh, x, deep, eaves, trim);
  post(mesh, -halfWide, 0.1, eaves, trim);
  post(mesh, halfWide, 0.1, eaves, trim);
  // Panels below the rail, glass above it, a lattice band under the eaves.
  mesh.wall([-halfWide, deep], [-0.75, deep], floor, floor + 0.85, trim);
  mesh.wall([0.75, deep], [halfWide, deep], floor, floor + 0.85, trim);
  mesh.wall([-halfWide, deep], [-halfWide, 0], floor, floor + 0.85, trim);
  mesh.wall([halfWide, deep], [halfWide, 0], floor, floor + 0.85, trim);
  const glass = paint("wall-glass", 1.5);
  mesh.wall([-halfWide, deep - 0.02], [-0.75, deep - 0.02], floor + 0.85, eaves - 0.42, glass);
  mesh.wall([0.75, deep - 0.02], [halfWide, deep - 0.02], floor + 0.85, eaves - 0.42, glass);
  mesh.wall([-halfWide, deep], [-halfWide, 0], floor + 0.85, eaves - 0.42, glass);
  mesh.wall([halfWide, deep], [halfWide, 0], floor + 0.85, eaves - 0.42, glass);
  mesh.wall([-halfWide, deep], [halfWide, deep], eaves - 0.42, eaves, trim);
  mesh.wall([-halfWide, deep], [-halfWide, 0], eaves - 0.42, eaves, trim);
  mesh.wall([halfWide, deep], [halfWide, 0], eaves - 0.42, eaves, trim);
  mesh.quad([-halfWide - 0.25, eaves, deep + 0.25], [halfWide + 0.25, eaves, deep + 0.25], [halfWide + 0.25, wallTop, 0], [-halfWide - 0.25, wallTop, 0], roof);
  mesh.tri([-halfWide - 0.25, eaves, deep + 0.25], [-halfWide - 0.25, wallTop, 0], [-halfWide - 0.25, eaves, 0], roof);
  mesh.tri([halfWide + 0.25, eaves, deep + 0.25], [halfWide + 0.25, wallTop, 0], [halfWide + 0.25, eaves, 0], roof);
  mesh.box([0, 0.14, deep + 0.75], [1.5, 0.28, 0.75], paint("wall-plinth", 1.15));
  mesh.box([0, 0.34, deep + 0.3], [1.5, 0.3, 0.45], paint("wall-plinth", 1.15));
  return mesh.done();
}

/** A gabled porch over the door, on two posts, with its own steps and pediment. */
function porch(paint: Painter): LandmarkMesh {
  const mesh = createBuilder();
  const trim = paint("wall-trim");
  const roof = paint("wall-grey", 0.82);
  const [halfWide, deep, floor, eaves, ridge] = [1.25, 1.7, 0.42, 2.75, 3.65];
  mesh.extrude(
    [
      [-halfWide, 0],
      [halfWide, 0],
      [halfWide, deep],
      [-halfWide, deep],
    ],
    -0.6,
    floor,
    paint("wall-plinth"),
    paint("road-minor", 0.8),
  );
  post(mesh, -halfWide + 0.1, deep - 0.1, eaves, trim);
  post(mesh, halfWide - 0.1, deep - 0.1, eaves, trim);
  mesh.wall([-halfWide, deep], [-halfWide, 0], floor, floor + 0.8, trim);
  mesh.wall([halfWide, deep], [halfWide, 0], floor, floor + 0.8, trim);
  mesh.tri([-halfWide - 0.15, eaves, deep + 0.15], [halfWide + 0.15, eaves, deep + 0.15], [0, ridge, deep + 0.15], trim);
  mesh.quad([-halfWide - 0.25, eaves - 0.05, deep + 0.2], [0, ridge, deep + 0.2], [0, ridge, 0], [-halfWide - 0.25, eaves - 0.05, 0], roof);
  mesh.quad([halfWide + 0.25, eaves - 0.05, deep + 0.2], [0, ridge, deep + 0.2], [0, ridge, 0], [halfWide + 0.25, eaves - 0.05, 0], roof);
  mesh.wall([-halfWide - 0.15, deep + 0.15], [halfWide + 0.15, deep + 0.15], eaves - 0.3, eaves, trim);
  mesh.box([0, 0.12, deep + 0.45], [1.4, 0.24, 0.5], paint("wall-plinth", 1.15));
  return mesh.done();
}

/** A bay window of three faces rising through both floors, 5.6 m tall before scaling, under its own little roof. */
function bay(paint: Painter): LandmarkMesh {
  const mesh = createBuilder();
  const trim = paint("wall-trim");
  const glass = paint("wall-glass", 2.4);
  const outline: readonly (readonly [number, number])[] = [
    [-1.3, 0],
    [-0.8, 0.8],
    [0.8, 0.8],
    [1.3, 0],
  ];
  const [sill, lintel, upperSill, upperLintel, top] = [0.95, 2.35, 3.6, 4.95, 5.35];
  for (let face = 0; face < 3; face++) {
    const [a, b] = [outline[face], outline[face + 1]];
    const inset = (share: number): [number, number] => [a[0] + (b[0] - a[0]) * share, a[1] + (b[1] - a[1]) * share];
    mesh.wall(a, b, -0.3, sill, paint("wall-trim", 0.92));
    mesh.wall(a, b, lintel, upperSill, trim);
    mesh.wall(a, b, upperLintel, top, trim);
    const [left, right] = [inset(0.1), inset(0.9)];
    mesh.wall(a, left, sill, lintel, trim);
    mesh.wall(right, b, sill, lintel, trim);
    mesh.wall(a, left, upperSill, upperLintel, trim);
    mesh.wall(right, b, upperSill, upperLintel, trim);
    mesh.wall(left, right, sill, lintel, glass);
    mesh.wall(left, right, upperSill, upperLintel, glass);
  }
  mesh.tri([-1.5, top, 0], [-0.9, top, 0.95], [0, top + 0.75, 0], paint("wall-grey", 0.82));
  mesh.tri([-0.9, top, 0.95], [0.9, top, 0.95], [0, top + 0.75, 0], paint("wall-grey", 0.82));
  mesh.tri([0.9, top, 0.95], [1.5, top, 0], [0, top + 0.75, 0], paint("wall-grey", 0.82));
  return mesh.done();
}

/** The fronton on a villa's middle axis: a small gable standing on the eaves, with a round window. */
function fronton(paint: Painter): LandmarkMesh {
  const mesh = createBuilder();
  const trim = paint("wall-trim");
  const roof = paint("wall-grey", 0.75);
  const [half, rise, back] = [2.3, 1.75, 2.6];
  mesh.tri([-half, 0, 0.12], [half, 0, 0.12], [0, rise, 0.12], paint("wall-trim", 0.96));
  mesh.quad([-half - 0.25, -0.12, 0.3], [0, rise + 0.12, 0.3], [0, rise + 0.12, -back], [-half - 0.25, -0.12, -back], roof);
  mesh.quad([half + 0.25, -0.12, 0.3], [0, rise + 0.12, 0.3], [0, rise + 0.12, -back], [half + 0.25, -0.12, -back], roof);
  mesh.wall([-half, 0.14], [half, 0.14], -0.1, 0.1, trim);
  const glass = paint("wall-glass", 1.5);
  const sides = 8;
  for (let side = 0; side < sides; side++) {
    const [a, b] = [(side / sides) * Math.PI * 2, ((side + 1) / sides) * Math.PI * 2];
    mesh.tri([0, 0.72, 0.16], [Math.cos(a) * 0.36, 0.72 + Math.sin(a) * 0.36, 0.16], [Math.cos(b) * 0.36, 0.72 + Math.sin(b) * 0.36, 0.16], glass);
  }
  return mesh.done();
}

export const ADD_ON_MODELS: Record<AddOnKind, (paint: Painter) => LandmarkMesh> = { veranda, porch, bay, fronton };

export interface AddOn {
  kind: AddOnKind;
  /** The foot of the wall, scene space. */
  x: number;
  y: number;
  z: number;
  /** The way out of the wall. */
  outX: number;
  outZ: number;
  /** Across the wall. */
  scale: number;
}

export interface DoorFacade {
  style: number;
  front: number;
  word: number;
  seed: number;
  /** The wall's foot, in the middle of the facade, scene space. */
  x: number;
  y: number;
  z: number;
  outX: number;
  outZ: number;
  alongX: number;
  alongZ: number;
  width: number;
  eaves: number;
}

/** Each building's facade with the door, read from the vertices. */
export function doorFacades(cells: SolidsCell[]): DoorFacade[] {
  const found: DoorFacade[] = [];
  for (const { positions, facades, tints } of cells) {
    const vertices = positions.length / 3;
    let first = 0;
    for (let at = 1; at <= vertices; at++) {
      const buildingEnds = at === vertices || (tints[at * 4 + 3] !== 0 && tints[(at - 1) * 4 + 3] === 0);
      if (!buildingEnds) continue;
      let [sumX, sumZ, count] = [0, 0, 0];
      let door = -1;
      let other = -1;
      for (let vertex = first; vertex < at; vertex++) {
        sumX += positions[vertex * 3];
        sumZ += positions[vertex * 3 + 2];
        count++;
        if (tints[vertex * 4 + 3] >= STYLE_VILLA && tints[vertex * 4 + 1] >= 128) {
          if (door < 0) door = vertex;
          else if (other < 0 && Math.abs(facades[vertex * 4] - facades[door * 4]) > 1) other = vertex;
        }
      }
      if (door >= 0 && other >= 0) {
        const span = facades[other * 4] - facades[door * 4];
        const [alongX, alongZ] = [(positions[other * 3] - positions[door * 3]) / span, (positions[other * 3 + 2] - positions[door * 3 + 2]) / span];
        const width = facades[door * 4 + 2];
        const toMiddle = width / 2 - facades[door * 4];
        const [x, z] = [positions[door * 3] + alongX * toMiddle, positions[door * 3 + 2] + alongZ * toMiddle];
        const [middleX, middleZ] = [sumX / count, sumZ / count];
        const facing = -alongZ * (x - middleX) + alongX * (z - middleZ) > 0 ? 1 : -1;
        found.push({
          style: tints[door * 4 + 3],
          front: tints[door * 4] >> 5,
          word: tints[door * 4 + 1] & 127,
          seed: tints[door * 4 + 2],
          x,
          y: positions[door * 3 + 1] - facades[door * 4 + 1],
          z,
          outX: -alongZ * facing,
          outZ: alongX * facing,
          alongX,
          alongZ,
          width,
          eaves: facades[door * 4 + 3],
        });
      }
      first = at;
    }
  }
  return found;
}

/** What stands on each villa, chosen by its seed: one thing at the door, and on a broad front sometimes more. */
export function villaAddOns(cells: SolidsCell[]): AddOn[] {
  const addOns: AddOn[] = [];
  for (const door of doorFacades(cells)) {
    if (door.style !== STYLE_VILLA || door.width < NARROWEST_FACADE_M) continue;
    const { seed, width, eaves, x, y, z, outX, outZ, alongX, alongZ } = door;
    const place = (kind: AddOnKind, offset: number, up: number, scale: number) => addOns.push({ kind, x: x + alongX * offset, y: y + up, z: z + alongZ * offset, outX, outZ, scale });
    const roll = (seed * 37) % 100;
    if (roll < 48 && width > 9) place("veranda", 0, 0, Math.min(1, (width * 0.56) / VERANDA_WIDE_M));
    else place("porch", 0, 0, 1);
    if (eaves > 4.6 && width > 11 && roll % 3 !== 2) {
      const side = roll % 2 === 0 ? 1 : -1;
      place("bay", side * width * 0.32, 0, 1);
    }
    if (eaves > 4 && width > 8 && (roll + 11) % 5 < 3) place("fronton", 0, eaves, Math.min(1.15, width / 13));
  }
  return addOns;
}

function geometryOf(mesh: LandmarkMesh): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(mesh.positions, 3));
  geometry.setAttribute("facade", new BufferAttribute(mesh.facades, 4));
  geometry.setAttribute("tint", new BufferAttribute(mesh.tints, 4, true));
  geometry.setIndex(new BufferAttribute(mesh.indices, 1));
  return geometry;
}

/** The wall material, with the fold: everything of an instance slides into the plane of its wall as the camera leaves. */
export function addOnMaterial(wallMaterial: MeshBasicNodeMaterial): MeshBasicNodeMaterial {
  const material = new MeshBasicNodeMaterial();
  material.colorNode = wallMaterial.colorNode;
  material.side = wallMaterial.side;
  const anchor = attribute<"vec3">("anchor", "vec3");
  const outward = attribute<"vec3">("outward", "vec3");
  const folded = smoothstep(float(FOLD_M[0]), float(FOLD_M[1]), cameraPosition.sub(anchor).length());
  material.positionNode = positionLocal.sub(outward.mul(dot(positionLocal.sub(anchor), outward).mul(folded)));
  return material;
}

/** One instanced mesh per kind in use, for one tile's add-ons. */
export function addOnMeshes(addOns: AddOn[], paint: Painter, material: MeshBasicNodeMaterial): InstancedMesh[] {
  const meshes: InstancedMesh[] = [];
  const matrix = new Matrix4();
  const up = new Vector3(0, 1, 0);
  const turn = new Quaternion();
  for (const [kind, build] of Object.entries(ADD_ON_MODELS) as [AddOnKind, (paint: Painter) => LandmarkMesh][]) {
    const own = addOns.filter((addOn) => addOn.kind === kind);
    if (own.length === 0) continue;
    const geometry = geometryOf(build(paint));
    const anchors = new Float32Array(own.length * 3);
    const outwards = new Float32Array(own.length * 3);
    const instanced = new InstancedMesh(geometry, material, own.length);
    own.forEach(({ x, y, z, outX, outZ, scale }, at) => {
      turn.setFromAxisAngle(up, Math.atan2(outX, outZ));
      matrix.compose(new Vector3(x, y, z), turn, new Vector3(scale, 1, 1));
      instanced.setMatrixAt(at, matrix);
      anchors.set([x, y, z], at * 3);
      outwards.set([outX, 0, outZ], at * 3);
    });
    geometry.setAttribute("anchor", new InstancedBufferAttribute(anchors, 3));
    geometry.setAttribute("outward", new InstancedBufferAttribute(outwards, 3));
    instanced.frustumCulled = false;
    meshes.push(instanced);
  }
  return meshes;
}
