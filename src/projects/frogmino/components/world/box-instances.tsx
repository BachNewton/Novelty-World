"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { BoxGeometry, Object3D, type InstancedMesh, type Material } from "three";
import type { WorldBox } from "../../world/geometry";
import type { WorldPalette } from "./world-assets";

const MIN_CAPACITY = 64;

// A list of world boxes drawn as one instanced mesh, in one draw call. The
// mesh only grows, in powers of two, so rebuilding the list as the camera
// moves along the road reuses it.
export function BoxInstances({
  boxes,
  palette,
  material,
}: {
  boxes: readonly WorldBox[];
  palette: WorldPalette;
  material: Material;
}) {
  const geometry = useMemo(() => new BoxGeometry(1, 1, 1), []);
  useEffect(
    () => () => {
      geometry.dispose();
    },
    [geometry],
  );
  const capacity = Math.max(MIN_CAPACITY, 2 ** Math.ceil(Math.log2(Math.max(1, boxes.length))));
  const meshRef = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (mesh === null) return;
    const placer = new Object3D();
    boxes.forEach((b, i) => {
      placer.position.set(...b.center);
      placer.rotation.set(0, b.yaw, b.roll);
      placer.scale.set(...b.size);
      placer.updateMatrix();
      mesh.setMatrixAt(i, placer.matrix);
      mesh.setColorAt(i, palette[b.paint]);
    });
    mesh.count = boxes.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor !== null) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [boxes, palette, capacity]);
  return <instancedMesh key={capacity} ref={meshRef} args={[geometry, material, capacity]} />;
}
