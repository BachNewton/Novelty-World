import * as THREE from "three";

/**
 * Real-time planar reflection of the scene across the water plane (world y = 0).
 *
 * Each frame it builds a mirror-image camera, renders the whole scene (minus the
 * water surface itself) into a texture, and hands back that texture plus a
 * `textureMatrix` that projects a world position into it. The ocean shader
 * samples it — distorted by the wave normal, blended by Fresnel — so the cube,
 * clouds and sky reflect on the water.
 *
 * The mirror-camera + oblique near-clip math is ported from three.js's `Water` /
 * `Reflector` addons (Lengyel's oblique projection, terathon.com/code/oblique).
 * Assumes the reflective plane is world y = 0 with an up (+Y) normal, which is
 * where our ocean sits.
 */

const PLANE_POINT = new THREE.Vector3(0, 0, 0);
const PLANE_NORMAL = new THREE.Vector3(0, 1, 0);

export interface PlanarReflection {
  texture: THREE.Texture;
  /** World-space → reflection-texture projection. Updated each `update()`. */
  textureMatrix: THREE.Matrix4;
  /** Render the reflection. Call once per frame, before the main render. */
  update: (scene: THREE.Scene, camera: THREE.PerspectiveCamera, surface: THREE.Object3D) => void;
  setSize: (width: number, height: number) => void;
  dispose: () => void;
}

export interface PlanarReflectionOptions {
  width: number;
  height: number;
  /** Render the reflection at a fraction of screen size (cheaper, softer). */
  resolutionScale?: number;
}

export function createPlanarReflection(
  renderer: THREE.WebGLRenderer,
  options: PlanarReflectionOptions,
): PlanarReflection {
  const scale = options.resolutionScale ?? 0.5;

  const renderTarget = new THREE.WebGLRenderTarget(
    Math.max(1, Math.floor(options.width * scale)),
    Math.max(1, Math.floor(options.height * scale)),
    { type: THREE.HalfFloatType },
  );

  const textureMatrix = new THREE.Matrix4();
  const mirrorCamera = new THREE.PerspectiveCamera();

  // Scratch objects reused every frame (no per-frame allocation).
  const cameraWorldPosition = new THREE.Vector3();
  const rotationMatrix = new THREE.Matrix4();
  const view = new THREE.Vector3();
  const lookAtPosition = new THREE.Vector3();
  const target = new THREE.Vector3();
  const reflectorPlane = new THREE.Plane();
  const clipPlane = new THREE.Vector4();
  const q = new THREE.Vector4();

  const update = (
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    surface: THREE.Object3D,
  ) => {
    cameraWorldPosition.setFromMatrixPosition(camera.matrixWorld);

    // Skip if the camera is below the surface (nothing to reflect toward it).
    view.subVectors(PLANE_POINT, cameraWorldPosition);
    if (view.dot(PLANE_NORMAL) > 0) return;

    // Mirror the camera position across the plane.
    view.reflect(PLANE_NORMAL).negate().add(PLANE_POINT);

    rotationMatrix.extractRotation(camera.matrixWorld);
    lookAtPosition.set(0, 0, -1).applyMatrix4(rotationMatrix).add(cameraWorldPosition);
    target.subVectors(PLANE_POINT, lookAtPosition);
    target.reflect(PLANE_NORMAL).negate().add(PLANE_POINT);

    mirrorCamera.position.copy(view);
    mirrorCamera.up.set(0, 1, 0).applyMatrix4(rotationMatrix).reflect(PLANE_NORMAL);
    mirrorCamera.lookAt(target);
    mirrorCamera.far = camera.far;
    mirrorCamera.updateMatrixWorld();
    mirrorCamera.projectionMatrix.copy(camera.projectionMatrix);

    // World → reflection-texture projection, with the 0.5 bias to map clip
    // space [-1,1] into texture space [0,1].
    textureMatrix.set(
      0.5, 0.0, 0.0, 0.5,
      0.0, 0.5, 0.0, 0.5,
      0.0, 0.0, 0.5, 0.5,
      0.0, 0.0, 0.0, 1.0,
    );
    textureMatrix.multiply(mirrorCamera.projectionMatrix);
    textureMatrix.multiply(mirrorCamera.matrixWorldInverse);

    // Oblique near-clip at the water plane so nothing below water leaks in.
    reflectorPlane.setFromNormalAndCoplanarPoint(PLANE_NORMAL, PLANE_POINT);
    reflectorPlane.applyMatrix4(mirrorCamera.matrixWorldInverse);
    clipPlane.set(
      reflectorPlane.normal.x,
      reflectorPlane.normal.y,
      reflectorPlane.normal.z,
      reflectorPlane.constant,
    );

    const projection = mirrorCamera.projectionMatrix;
    q.x = (Math.sign(clipPlane.x) + projection.elements[8]) / projection.elements[0];
    q.y = (Math.sign(clipPlane.y) + projection.elements[9]) / projection.elements[5];
    q.z = -1.0;
    q.w = (1.0 + projection.elements[10]) / projection.elements[14];
    clipPlane.multiplyScalar(2.0 / clipPlane.dot(q));
    projection.elements[2] = clipPlane.x;
    projection.elements[6] = clipPlane.y;
    projection.elements[10] = clipPlane.z + 1.0;
    projection.elements[14] = clipPlane.w;

    const currentRenderTarget = renderer.getRenderTarget();
    const currentShadowAutoUpdate = renderer.shadowMap.autoUpdate;
    surface.visible = false; // don't reflect the water in its own reflection
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(renderTarget);
    renderer.render(scene, mirrorCamera);
    renderer.setRenderTarget(currentRenderTarget);
    renderer.shadowMap.autoUpdate = currentShadowAutoUpdate;
    surface.visible = true;
  };

  return {
    texture: renderTarget.texture,
    textureMatrix,
    update,
    setSize: (width, height) => {
      renderTarget.setSize(
        Math.max(1, Math.floor(width * scale)),
        Math.max(1, Math.floor(height * scale)),
      );
    },
    dispose: () => {
      renderTarget.dispose();
    },
  };
}
