import * as THREE from "three";
import { beforeAll, expect, it } from "vitest";
import { animationOf, type Animation } from "../animate";
import { solidOf } from "../forms";
import { stubCanvas } from "../headless";
import { banshee } from "../monsters/banshee";
import { COURSE_TIMES, onCourse } from "./cloth-trial";

/*
 * The Banshee's net shroud never lies along her robe: two surfaces touching
 * and facing alike fight in depth, frame to frame (the strobing the owner
 * saw). It hangs from well inside her robe and her robe's end pushes it off,
 * so it only ever crosses her robe at a clear angle.
 */

beforeAll(stubCanvas);

/** How near the shroud may come to her robe's surface, in metres, while facing as the robe does. */
const TOUCHING = 0.002;
/** How alike two surfaces must face to fight: within about 25°. */
const ALIKE = 0.9;

it("never lies along her robe", { timeout: 120_000 }, () => {
  const figure = onCourse((seed, gait) => banshee(seed, gait, { cloth: "net" }))("banshee");
  const animations: Animation[] = [];
  figure.traverse((object) => {
    const animation = animationOf(object);
    if (animation) animations.push(animation);
  });
  const veil = figure.getObjectByName("veil");
  const robe = figure.getObjectByName("robe");
  if (!(veil instanceof THREE.Mesh) || !(robe instanceof THREE.Mesh)) throw new Error("The Banshee has no veil or robe");
  const solid = solidOf(robe.geometry as THREE.BufferGeometry);
  if (!solid) throw new Error("Her robe keeps no solid");
  const [point, normal, gradient, turn] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Matrix3()];
  const step = 0.001;
  for (let t = COURSE_TIMES.walk.start - 0.3; t < COURSE_TIMES.run.end + 1; t += 1 / 60) {
    for (const animation of animations) animation(t);
    figure.updateMatrixWorld(true);
    const into = robe.matrixWorld.clone().invert().multiply(veil.matrixWorld);
    turn.setFromMatrix4(into);
    const geometry = veil.geometry as THREE.BufferGeometry;
    const positions = geometry.getAttribute("position") as THREE.BufferAttribute;
    const normals = geometry.getAttribute("normal") as THREE.BufferAttribute;
    let fighting = 0;
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions, i).applyMatrix4(into);
      if (Math.abs(solid.distance(point.x, point.y, point.z)) >= TOUCHING) continue;
      normal.fromBufferAttribute(normals, i).applyMatrix3(turn).normalize();
      const { x, y, z } = point;
      gradient
        .set(
          solid.distance(x + step, y, z) - solid.distance(x - step, y, z),
          solid.distance(x, y + step, z) - solid.distance(x, y - step, z),
          solid.distance(x, y, z + step) - solid.distance(x, y, z - step),
        )
        .normalize();
      if (Math.abs(normal.dot(gradient)) > ALIKE) fighting++;
    }
    expect(fighting, `shroud points lying along her robe at ${t.toFixed(3)} s`).toBe(0);
  }
});
