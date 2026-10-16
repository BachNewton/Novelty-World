import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { PALETTE } from "./palette";
import { pieceOf } from "./stage";

/*
 * The bench's casters overlay (`&casters`): every bake-only shadow caster a
 * room's props hold (a figure no one can see, whose shadow the bake casts),
 * drawn so it can be seen. Debug only, as the paths overlay is: unlit, see
 * through, over everything without depth, and never part of the bake. The
 * stage's own bake-only pieces (the unseen ceiling, the doorway plugs) are
 * left out: they are the shell, and the ceiling would hide the room.
 */

/** Higher than everything the room draws, so the overlay is drawn last. */
const OVER_ROOM = 1000;
/** Edges sharper than this many degrees are outlined, so the caster's shape reads through its fill. */
const EDGE_ANGLE = 30;

/** Whether the object lies inside one of the room's props. */
function inProp(object: THREE.Object3D): boolean {
  for (let at: THREE.Object3D | null = object; at; at = at.parent) {
    const piece = pieceOf(at);
    if (piece) return "prop" in piece;
  }
  return false;
}

/** The overlay for a room as built, read before freezing it frees the casters' geometry. */
export function createCasterOverlay(roomRoot: THREE.Object3D) {
  roomRoot.updateMatrixWorld(true);
  const shapes: THREE.BufferGeometry[] = [];
  roomRoot.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || (object.userData as { bakeOnly?: boolean }).bakeOnly !== true || !inProp(object)) return;
    const geometry = (object.geometry as THREE.BufferGeometry).clone().applyMatrix4(object.matrixWorld);
    // Only where the corners lie: the clones merge whatever attributes each mesh carried.
    for (const name of Object.keys(geometry.attributes)) if (name !== "position") geometry.deleteAttribute(name);
    shapes.push(geometry.index ? geometry.toNonIndexed() : geometry);
  });
  const root = new THREE.Group();
  root.name = "casters overlay";
  root.visible = false;
  if (shapes.length === 0) return { root, dispose: () => undefined };

  const shape = mergeGeometries(shapes);
  for (const geometry of shapes) geometry.dispose();
  const edges = new THREE.EdgesGeometry(shape, EDGE_ANGLE);
  const overlay = { color: PALETTE.violet, depthTest: false, depthWrite: false, fog: false, toneMapped: false };
  const fill = new THREE.Mesh(shape, new THREE.MeshBasicMaterial({ ...overlay, transparent: true, opacity: 0.35, side: THREE.DoubleSide, forceSinglePass: true }));
  const outline = new THREE.LineSegments(edges, new THREE.LineBasicMaterial(overlay));
  fill.renderOrder = OVER_ROOM;
  outline.renderOrder = OVER_ROOM + 1;
  root.add(fill, outline);
  return {
    root,
    dispose: () => {
      shape.dispose();
      edges.dispose();
      fill.material.dispose();
      outline.material.dispose();
    },
  };
}
