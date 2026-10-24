"use client";

import { useEffect, useMemo } from "react";
import { InstancedBufferAttribute } from "three";
import type { AtmosphereUniforms } from "./atmosphere";
import { cloud, fireflyMaterial, quadWith } from "./effects";
import type { Palette } from "./palette";
import type { SkyUniforms } from "./sky/sky";

/*
 * Fireflies drifting and blinking where they are put (x, y, z each), out
 * only as the light goes: one draw of soft quads, each drifting and blinking
 * on its own in the vertex stage.
 */

export function Fireflies({ spots, palette, atmosphere, sky }: { spots: Float32Array; palette: Palette; atmosphere: AtmosphereUniforms; sky: SkyUniforms }) {
  const mesh = useMemo(() => {
    const made = cloud(spots.length / 3, fireflyMaterial(sky)(atmosphere), quadWith({ spot: new InstancedBufferAttribute(spots, 3) }));
    made.renderOrder = 3;
    made.userData = { tint: palette.things.firefly.clone() };
    return made;
  }, [spots, palette, atmosphere, sky]);
  useEffect(() => () => mesh.geometry.dispose(), [mesh]);
  return <primitive object={mesh} />;
}
