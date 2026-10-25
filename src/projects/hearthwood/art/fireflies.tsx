"use client";

import { useEffect, useMemo } from "react";
import { InstancedBufferAttribute } from "three";
import type { AtmosphereUniforms } from "./atmosphere";
import { cloud, type Cloud, fireflyMaterial, quadWith } from "./effects";
import type { Palette } from "./palette";
import type { SkyUniforms } from "./sky/sky";

/*
 * Fireflies drifting and blinking where they are put (x, y, z each), out
 * only as the light goes: one draw of soft quads, each drifting and blinking
 * on its own in the vertex stage. The draw is kept as the spots change (the
 * nearest chunks' as the camera goes): they are written into its room, and
 * only outgrowing the room gives it a bigger one.
 */

/** Room for this many fireflies at first, doubled whenever they outgrow it. */
const FIRST_ROOM = 256;

const roomOf = (c: Cloud) => (c.geometry.getAttribute("spot") as InstancedBufferAttribute).count;

function place(c: Cloud, spots: Float32Array): void {
  const n = spots.length / 3;
  if (n > roomOf(c)) {
    let room = roomOf(c);
    while (room < n) room *= 2;
    c.geometry.dispose();
    c.geometry = quadWith({ spot: new InstancedBufferAttribute(new Float32Array(room * 3), 3) });
  }
  const spot = c.geometry.getAttribute("spot") as InstancedBufferAttribute;
  spot.array.set(spots);
  spot.clearUpdateRanges();
  spot.addUpdateRange(0, spots.length);
  spot.needsUpdate = true;
  c.geometry.instanceCount = n;
}

export function Fireflies({ spots, palette, atmosphere, sky }: { spots: Float32Array; palette: Palette; atmosphere: AtmosphereUniforms; sky: SkyUniforms }) {
  const mesh = useMemo(() => {
    const made = cloud(0, fireflyMaterial(sky)(atmosphere), quadWith({ spot: new InstancedBufferAttribute(new Float32Array(FIRST_ROOM * 3), 3) }));
    made.renderOrder = 3;
    made.userData = { tint: palette.things.firefly.clone() };
    return made;
  }, [palette, atmosphere, sky]);
  useEffect(() => () => mesh.geometry.dispose(), [mesh]);
  useEffect(() => place(mesh, spots), [mesh, spots]);
  return <primitive object={mesh} />;
}
