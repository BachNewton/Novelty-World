import { Frustum, Matrix4, Vector4, type PerspectiveCamera } from "three/webgpu";
import { sharedUniform } from "../art/shared-uniform";

/*
 * The four sides of the camera's view as a compute pass reads them, for what's picked
 * from a lattice of the world each frame. `rough` is a side's plane with the world's
 * tallest and lowest ground allowed for, so a place can be ruled out before it has
 * read any image.
 */

export function viewSides(worldHeightsM: readonly [low: number, high: number], marginM: number) {
  const sides = [0, 1, 2, 3].map(() => ({ plane: sharedUniform(new Vector4()), rough: sharedUniform(0) }));
  const frustum = new Frustum();
  const viewProjection = new Matrix4();
  return {
    sides,
    update(camera: PerspectiveCamera) {
      camera.updateMatrixWorld();
      frustum.setFromProjectionMatrix(viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      sides.forEach(({ plane, rough }, side) => {
        const { normal, constant } = frustum.planes[side];
        plane.value.set(normal.x, normal.y, normal.z, constant);
        rough.value = constant + Math.max(normal.y * worldHeightsM[0], normal.y * worldHeightsM[1]) + marginM;
      });
    },
  };
}
