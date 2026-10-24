"use client";

import { useEffect, useMemo } from "react";
import { Color, CylinderGeometry, Quaternion, Vector3 } from "three";
import { themeColor } from "@/shared/lib/three/theme-color";
import type { AtmosphereUniforms } from "../../art/atmosphere";
import { paint } from "../../art/painted";
import { diorama } from "../../art/materials";
import type { Perch } from "../../engine/wildlife";

/*
 * The twigs the songbirds sit on out from the trees' crowns: each a thin,
 * tapering stick from inside the crown out past its leaves to the perch,
 * a little beyond it, in the bark's colour, all merged into one draw.
 */

const UP = new Vector3(0, 1, 0);

export function PerchTwigs({ perches, atmosphere }: { perches: readonly Perch[]; atmosphere: AtmosphereUniforms }) {
  const geometry = useMemo(() => {
    const bark = new Color().copy(themeColor("--color-hearthwood-valley-bark"));
    const pieces = perches.flatMap((perch) => {
      if (!perch.twig) return [];
      const from = new Vector3(perch.twig.x, perch.twig.y, perch.twig.z);
      const to = new Vector3(perch.x, perch.y - 0.012, perch.z);
      const way = to.clone().sub(from);
      const length = way.length() + 0.18;
      const stick = new CylinderGeometry(0.008, 0.022, length, 5);
      stick.translate(0, length / 2, 0);
      stick.applyQuaternion(new Quaternion().setFromUnitVectors(UP, way.normalize()));
      stick.translate(from.x, from.y, from.z);
      return [{ geometry: stick, colour: bark, shading: 0.2 }];
    });
    return pieces.length > 0 ? paint(pieces) : null;
  }, [perches]);
  const material = useMemo(() => diorama("solid", atmosphere, { vertexColors: true }), [atmosphere]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);
  return geometry ? <mesh geometry={geometry} material={material} castShadow receiveShadow /> : null;
}
