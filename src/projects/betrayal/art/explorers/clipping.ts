import * as THREE from "three";
import { shapeOf, solidOf, type Solid } from "../forms";
import { jointsOf, type Joint } from "./figure";
import { handsOf, heldJoint } from "./hands";

/*
 * The figures' clipping check: where one of a figure's rigid parts passes
 * through another, as it is posed now. Every part is a solid kept with its
 * geometry (see `shaped` in forms.ts), so each part's surface points are
 * asked how deep they lie inside every other part, in that part's own frame.
 *
 * A part tucked wholly inside another (a leg under a skirt, a shin's end in
 * a shoe) never shows, so it is no finding. Two parts clip when their
 * surfaces cross: some of each one's surface lies inside the other. Joints
 * cross on purpose round their pivots, so a figure declares them (`joins`),
 * and crossings within a joint's reach of its pivot are allowed.
 */

/** How deep a surface point must lie inside another part to count: the meshes
 *  stand off their solids by about a millimetre. */
const DEPTH = 0.002;
/** Surface points are taken no closer together than this. */
const SPACING = 0.0045;
/** Two parts posed within this of how they were last checked against each other are not checked again. */
const SAME_POSE = 0.0015;

interface Part {
  mesh: THREE.Mesh;
  name: string;
  /** Which copy of an instanced mesh, or "". */
  copy: string;
  solid: Solid;
  points: Float32Array;
  /** The box the part's own points lie in, in its own frame. */
  local: THREE.Box3;
  /** The part's place in the figure. */
  matrix: THREE.Matrix4;
  box: THREE.Box3;
}

/** The thinning grid's cells along each axis, centred on a part's origin: enough for a part 18 m across. */
const CELLS = 4096;

const sampled = new WeakMap<THREE.BufferGeometry, { shape: string; points: Float32Array; box: THREE.Box3 }>();

/** A geometry's vertices, thinned to about one every `SPACING`, and the box they lie in. */
function pointsOf(geometry: THREE.BufferGeometry): { points: Float32Array; box: THREE.Box3 } {
  const known = sampled.get(geometry);
  if (known?.shape === shapeOf(geometry)) return known;
  const position = geometry.getAttribute("position");
  const taken = new Set<number>();
  const points: number[] = [];
  // A number for each cell of the thinning grid, rather than a string: cloth the legs push is thinned again every frame it moves.
  const cell = (v: number) => Math.round(v / SPACING) + CELLS / 2;
  for (let i = 0; i < position.count; i++) {
    const [x, y, z] = [position.getX(i), position.getY(i), position.getZ(i)];
    const key = (cell(x) * CELLS + cell(y)) * CELLS + cell(z);
    if (taken.has(key)) continue;
    taken.add(key);
    points.push(x, y, z);
  }
  const result = { shape: shapeOf(geometry), points: new Float32Array(points), box: new THREE.Box3().setFromArray(points) };
  sampled.set(geometry, result);
  return result;
}

function showing(object: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let at: THREE.Object3D | null = object; at && at !== root.parent; at = at.parent) if (!at.visible) return false;
  return true;
}

function nameOf(object: THREE.Object3D): string {
  const names: string[] = [];
  for (let at: THREE.Object3D | null = object; at; at = at.parent) if (at.name) names.push(at.name);
  return names.length > 0 ? names.reverse().join(" / ") : `unnamed ${object.type}`;
}

/** Every solid, showing part of a figure, each copy of an instanced mesh a part of its own. */
function readParts(figure: THREE.Object3D): Part[] {
  figure.updateMatrixWorld(true);
  const toFigure = figure.matrixWorld.clone().invert();
  const parts: Part[] = [];
  figure.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !showing(object, figure)) return;
    const materials = [object.material].flat() as THREE.Material[];
    if (!materials.every((material) => material.depthWrite)) return;
    const geometry = object.geometry as THREE.BufferGeometry;
    const solid = solidOf(geometry);
    if (!solid) throw new Error(`${nameOf(object)} has no solid to check clipping against: build it with \`shaped\``);
    const placements =
      object instanceof THREE.InstancedMesh
        ? Array.from({ length: object.count }, (_, n) => {
            const copy = new THREE.Matrix4();
            object.getMatrixAt(n, copy);
            return copy.premultiply(object.matrixWorld);
          })
        : [object.matrixWorld];
    const { points, box: local } = pointsOf(geometry);
    for (const [n, placement] of placements.entries()) {
      const matrix = placement.clone().premultiply(toFigure);
      const box = local.clone().applyMatrix4(matrix);
      const copy = placements.length > 1 ? ` #${n}` : "";
      parts.push({ mesh: object, name: `${nameOf(object)}${copy}`, copy, solid, points, local, matrix, box });
    }
  });
  return parts;
}

/** Every joint declared anywhere in a figure (a line-up holds several), and every held prop's. */
function readJoints(figure: THREE.Object3D): Joint[] {
  const joints: Joint[] = [];
  figure.traverse((object) => {
    joints.push(...jointsOf(object));
    const hands = handsOf(object);
    for (const hand of hands ? [hands.right, hands.left] : []) {
      const held = heldJoint(hand);
      if (held) joints.push(held);
    }
  });
  return joints;
}

function meshesIn(object: THREE.Object3D): Set<THREE.Mesh> {
  const meshes = new Set<THREE.Mesh>();
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) meshes.add(child);
  });
  return meshes;
}

interface Crossing {
  depth: number;
  at: THREE.Vector3;
}

/** The deepest of `a`'s surface points inside `b`, away from every allowed pivot, if any is deeper than `DEPTH`. */
function deepestInside(a: Part, b: Part, allowed: readonly { at: THREE.Vector3; radius: number }[]): Crossing | null {
  const into = b.matrix.clone().invert().multiply(a.matrix);
  const e = b.matrix.elements;
  const scale = Math.min(Math.hypot(e[0], e[1], e[2]), Math.hypot(e[4], e[5], e[6]), Math.hypot(e[8], e[9], e[10]));
  const { min, max } = b.local;
  const local = new THREE.Vector3();
  const placed = new THREE.Vector3();
  let deepest: Crossing | null = null;
  for (let i = 0; i < a.points.length; i += 3) {
    local.set(a.points[i], a.points[i + 1], a.points[i + 2]).applyMatrix4(into);
    if (local.x < min.x || local.y < min.y || local.z < min.z || local.x > max.x || local.y > max.y || local.z > max.z) continue;
    const depth = -b.solid.distance(local.x, local.y, local.z) * scale;
    if (depth < DEPTH || (deepest && depth <= deepest.depth)) continue;
    placed.set(a.points[i], a.points[i + 1], a.points[i + 2]).applyMatrix4(a.matrix);
    if (allowed.some((joint) => joint.at.distanceTo(placed) < joint.radius)) continue;
    deepest = { depth, at: placed.clone() };
  }
  return deepest;
}

/**
 * Every pair of parts checked so far, by their geometries (every copy of a
 * figure shares its parts' geometry), with how they sat against each other
 * and what the check found: a pose checked once, on any figure, is not
 * checked again.
 */
const checked = new Map<string, { relative: THREE.Matrix4; finding: string | null }[]>();

/** A part's place in the memory: its geometry, the shape it is in, and which copy of an instanced mesh. */
function keyOf(part: Part, copy: string): string {
  const geometry = part.mesh.geometry as THREE.BufferGeometry;
  return `${geometry.uuid}${shapeOf(geometry)}${copy}`;
}

const corner = new THREE.Vector3();
const other = new THREE.Vector3();

/** What was found when `a` last sat against `b` as it does now, if it ever did. */
function remembered(key: string, a: Part, relative: THREE.Matrix4): { finding: string | null } | undefined {
  const { min, max } = a.local;
  return checked.get(key)?.find(({ relative: pose }) =>
    [0, 1, 2, 3, 4, 5, 6, 7].every((i) => {
      corner.set(i & 1 ? max.x : min.x, i & 2 ? max.y : min.y, i & 4 ? max.z : min.z);
      other.copy(corner).applyMatrix4(pose);
      return corner.applyMatrix4(relative).distanceTo(other) < SAME_POSE;
    }),
  );
}

function remember(key: string, relative: THREE.Matrix4, finding: string | null) {
  const poses = checked.get(key);
  if (poses) poses.push({ relative, finding });
  else checked.set(key, [{ relative, finding }]);
}

/**
 * Every pair of a figure's parts whose surfaces cross, as it is posed now,
 * the deeper way, and where. Pairs posed against each other as they were at
 * an earlier check, on this figure or another built alike, give what that
 * check found.
 */
export function clipping(figure: THREE.Object3D): string[] {
  const parts = readParts(figure);
  const joints = readJoints(figure).map((joint) => ({
    meshes: [meshesIn(joint.parts[0]), meshesIn(joint.parts[1])] as const,
    at: joint.at.getWorldPosition(new THREE.Vector3()).applyMatrix4(figure.matrixWorld.clone().invert()),
    radius: joint.radius,
  }));
  const findings: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j < parts.length; j++) {
      const [a, b] = [parts[i], parts[j]];
      if (a.mesh === b.mesh || !a.box.intersectsBox(b.box)) continue;
      const key = `${keyOf(a, a.copy)}|${keyOf(b, b.copy)}`;
      const relative = b.matrix.clone().invert().multiply(a.matrix);
      const known = remembered(key, a, relative);
      if (known) {
        if (known.finding) findings.push(known.finding);
        continue;
      }
      const allowed = joints.filter(({ meshes: [x, y] }) => (x.has(a.mesh) && y.has(b.mesh)) || (x.has(b.mesh) && y.has(a.mesh)));
      const aInB = deepestInside(a, b, allowed);
      const bInA = aInB && deepestInside(b, a, allowed);
      const at = ({ x, y, z }: THREE.Vector3) => `(${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)})`;
      const mm = (crossing: Crossing) => `${(crossing.depth * 1000).toFixed(1)} mm`;
      const finding =
        aInB && bInA
          ? `${a.name} and ${b.name} pass through each other: the first ${mm(aInB)} inside the second at ${at(aInB.at)}, the second ${mm(bInA)} inside the first at ${at(bInA.at)}`
          : null;
      remember(key, relative, finding);
      if (finding) findings.push(finding);
    }
  }
  return findings;
}
