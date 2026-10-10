import * as THREE from "three";
import { PALETTE } from "../palette";

/*
 * The figures' overlap check: where two of a figure's rigid parts lay
 * surfaces of different colour in one place, facing the same way, which
 * z-fight on screen. A figure's parts pass into each other at its joints on
 * purpose, so passing into is never a finding, only a fight that shows.
 *
 * A smooth figure is tens of thousands of small triangles, so rather than
 * judging each part as a convex solid (as the rooms' check does, which scales
 * with the square of its points), each triangle's middle is looked up in a
 * grid of the other parts' triangles near it: the cost grows with the
 * triangles, not their square.
 */

/** Surfaces nearer than this fight for the same depth. */
const SAME_PLANE = 0.001;
/** Two surfaces facing within this (the cosine between their normals) face the same way. */
const SAME_WAY = 0.97;
/** A surface turned further down than this (the y of its normal) faces away from every camera. */
const FACING_DOWN = 0.5;
/** How far in front of a shared surface a covering solid is looked for. */
const BURIED = 0.003;
/** The least shared area that counts, in m². */
const FIGHT_AREA = 1e-4;
/** The grid's cell, in metres: about a smooth figure's largest triangle. */
const CELL = 0.02;

interface Face {
  part: number;
  triangle: THREE.Triangle;
  normal: THREE.Vector3;
  middle: THREE.Vector3;
  area: number;
  colour: string;
}

interface Part {
  faces: Face[];
  box: THREE.Box3;
}

/** A colour as its hue and strength, without its brightness: a palette
 *  colour shaded darker (as a glowing figure's is) keeps it. */
function tint(colour: THREE.Color): THREE.Vector3 {
  const most = Math.max(colour.r, colour.g, colour.b, 1e-6);
  return new THREE.Vector3(colour.r / most, colour.g / most, colour.b / most);
}

const TINTS = Object.entries(PALETTE).map(([key, hex]) => {
  const colour = new THREE.Color(hex);
  return { key, hex: colour.getHexString(), tint: tint(colour) };
});

/** A colour by its palette name, or the palette colour it is a shade of:
 *  shades of one colour look alike as far as z-fighting goes. */
function colourName(colour: THREE.Color): string {
  const hex = colour.getHexString();
  const exact = TINTS.find((entry) => entry.hex === hex);
  if (exact) return exact.key;
  const shade = TINTS.find((entry) => entry.tint.distanceTo(tint(colour)) < 0.03);
  return shade ? shade.key : `#${hex}`;
}

function showing(object: THREE.Object3D): boolean {
  for (let at: THREE.Object3D | null = object; at; at = at.parent) if (!at.visible) return false;
  return true;
}

/** How a material draws as far as z-fighting goes: a texture, or one colour. */
function materialColour(material: THREE.Material): string {
  if ("map" in material && material.map instanceof THREE.Texture) return `a texture ${material.map.uuid}`;
  if ("color" in material && material.color instanceof THREE.Color) return colourName(material.color);
  return material.type;
}

/** Every showing mesh that writes depth, as its triangles in the figure's frame. */
function readParts(figure: THREE.Object3D): Part[] {
  figure.updateMatrixWorld(true);
  const parts: Part[] = [];
  figure.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !showing(object)) return;
    const materials = [object.material].flat() as THREE.Material[];
    if (!materials.every((material) => material.depthWrite)) return;
    const geometry = object.geometry as THREE.BufferGeometry;
    const position = geometry.getAttribute("position");
    const colours = geometry.getAttribute("color") as THREE.BufferAttribute | undefined;
    const index = geometry.getIndex();
    const count = index ? index.count : position.count;
    const vertex = (i: number) => (index ? index.getX(i) : i);
    const materialAt = (i: number) => {
      // A single material draws every group, whatever index the group names.
      if (!Array.isArray(object.material)) return object.material as THREE.Material;
      const found = geometry.groups.find((g) => i >= g.start && i < g.start + g.count);
      return materials[found?.materialIndex ?? 0];
    };
    // Each copy of an instanced mesh is a part of its own.
    const placements = object instanceof THREE.InstancedMesh
      ? Array.from({ length: object.count }, (_, n) => {
          const copy = new THREE.Matrix4();
          object.getMatrixAt(n, copy);
          return copy.premultiply(object.matrixWorld);
        })
      : [object.matrixWorld];
    for (const placement of placements) {
      const corner = (i: number) => new THREE.Vector3().fromBufferAttribute(position, vertex(i)).applyMatrix4(placement);
      const part: Part = { faces: [], box: new THREE.Box3() };
      for (let i = 0; i < count; i += 3) {
        const triangle = new THREE.Triangle(corner(i), corner(i + 1), corner(i + 2));
        const area = triangle.getArea();
        if (area < 1e-12) continue;
        const material = materialAt(i);
        const vertexColoured = colours && "vertexColors" in material && material.vertexColors;
        const colour = vertexColoured ? colourName(new THREE.Color().fromBufferAttribute(colours, vertex(i))) : materialColour(material);
        part.faces.push({ part: parts.length, triangle, normal: triangle.getNormal(new THREE.Vector3()), middle: triangle.getMidpoint(new THREE.Vector3()), area, colour });
        part.box.expandByPoint(triangle.a).expandByPoint(triangle.b).expandByPoint(triangle.c);
      }
      parts.push(part);
    }
  });
  return parts;
}

/** The faces filed by the grid cells their bounds touch. */
function grid(parts: Part[]) {
  const cells = new Map<string, Face[]>();
  const key = (i: number, j: number, k: number) => `${i},${j},${k}`;
  const cellOf = (v: number) => Math.floor(v / CELL);
  const bounds = new THREE.Box3();
  for (const face of parts.flatMap((part) => part.faces)) {
    bounds.setFromPoints([face.triangle.a, face.triangle.b, face.triangle.c]).expandByScalar(SAME_PLANE);
    for (let i = cellOf(bounds.min.x); i <= cellOf(bounds.max.x); i++) {
      for (let j = cellOf(bounds.min.y); j <= cellOf(bounds.max.y); j++) {
        for (let k = cellOf(bounds.min.z); k <= cellOf(bounds.max.z); k++) {
          const file = cells.get(key(i, j, k));
          if (file) file.push(face);
          else cells.set(key(i, j, k), [face]);
        }
      }
    }
  }
  return (point: THREE.Vector3): Face[] => cells.get(key(cellOf(point.x), cellOf(point.y), cellOf(point.z))) ?? [];
}

/** Whether a point lies inside a part, judged by the side of the part's nearest surface it is on. */
function inside(part: Part, point: THREE.Vector3): boolean {
  if (!part.box.containsPoint(point)) return false;
  const closest = new THREE.Vector3();
  const nearest = new THREE.Vector3();
  let best = Infinity;
  let normal: THREE.Vector3 | null = null;
  for (const face of part.faces) {
    face.triangle.closestPointToPoint(point, closest);
    const d = closest.distanceToSquared(point);
    if (d < best) {
      best = d;
      nearest.copy(closest);
      normal = face.normal;
    }
  }
  return normal !== null && point.clone().sub(nearest).dot(normal) < 0;
}

/**
 * Every pair of a figure's parts whose surfaces fight, as it is posed now,
 * with the area they share: a face only counts where it faces up or
 * sideways (every camera looks down on the house) and where no part covers
 * the place they share.
 */
export function fightingFaces(figure: THREE.Object3D): string[] {
  const parts = readParts(figure);
  const near = grid(parts);
  const shared = new Map<string, { area: number; near: THREE.Vector3 }>();
  const front = new THREE.Vector3();
  for (const face of parts.flatMap((part) => part.faces)) {
    if (face.normal.y < -FACING_DOWN) continue;
    const rival = near(face.middle).find(
      (other) =>
        other.part !== face.part &&
        other.colour !== face.colour &&
        other.normal.dot(face.normal) > SAME_WAY &&
        other.triangle.closestPointToPoint(face.middle, front).distanceTo(face.middle) < SAME_PLANE,
    );
    if (!rival) continue;
    front.copy(face.middle).addScaledVector(face.normal, BURIED);
    if (parts.some((part) => inside(part, front))) continue;
    const [a, b] = [face, rival].sort((x, y) => x.part - y.part || (x.colour < y.colour ? -1 : 1));
    const key = `part ${a.part} (${a.colour}) z-fights with part ${b.part} (${b.colour})`;
    const seen = shared.get(key) ?? { area: 0, near: face.middle };
    // Each side of a fight finds the other, so each counts half the area.
    seen.area += face.area / 2;
    shared.set(key, seen);
  }
  const at = ({ x, y, z }: THREE.Vector3) => `(${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)})`;
  return [...shared].filter(([, { area }]) => area >= FIGHT_AREA).map(([key, { area, near }]) => `${key}, over ${(area * 1e4).toFixed(1)} cm², near ${at(near)}`);
}
