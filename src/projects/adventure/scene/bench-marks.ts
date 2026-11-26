import * as THREE from "three/webgpu";
import { themeColor } from "@/shared/lib/three/theme-color";
import type { Placement } from "../town";
import { nameLabel } from "./name-label";

/** How far above a piece's top its name floats. */
const LABEL_GAP = 0.25;

/**
 * Each bench piece's marks: its name floating above it, and two arrows on the
 * ground from its origin, along its own +x (where a wall stands) and +z.
 */
export function benchMarks(placements: readonly Placement[], town: THREE.Group): THREE.Group {
  const marks = new THREE.Group();
  const plusX = new THREE.MeshBasicMaterial({ color: themeColor("--color-brand-pink") });
  const plusZ = new THREE.MeshBasicMaterial({ color: themeColor("--color-brand-blue") });
  const arrowX = new THREE.BoxGeometry(0.5, 0.01, 0.04).translate(0.25, 0.006, 0);
  const arrowZ = new THREE.BoxGeometry(0.04, 0.01, 0.5).translate(0, 0.006, 0.25);
  placements.forEach((placement, i) => {
    const centre = new THREE.Vector3(placement.x + 0.5, 0, placement.z + 0.5);
    marks.add(new THREE.Mesh(arrowX, plusX).translateX(centre.x).translateZ(centre.z));
    marks.add(new THREE.Mesh(arrowZ, plusZ).translateX(centre.x).translateZ(centre.z));
    const top = new THREE.Box3().setFromObject(town.children[i]).max.y;
    const label = nameLabel(placement.piece);
    label.position.set(centre.x, top + LABEL_GAP, centre.z);
    marks.add(label);
  });
  return marks;
}
