"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Group, Mesh } from "three";
import type { Place } from "../../engine/places";
import type { World } from "../../engine/world";
import type { AtmosphereUniforms } from "../../art/atmosphere";
import type { Palette } from "../../art/palette";
import { placeGeometry, placeMaterial, placeWater } from "../../art/place-shapes";
import type { SkyUniforms } from "../../art/sky";
import { waterMaterial, waterMesh } from "../../art/water/water";
import { report, type Streaming } from "./world-land";

/*
 * The places round the camera, streamed: each built from its own seed and
 * set on the land as it is found within reach (with a cascade's falling
 * water beside it), and dropped once far behind.
 */

const REACH = 900;
const RECHECK = 16;
const BUILDS_PER_FRAME = 3;

const placeId = (p: Place) => `${p.cellX},${p.cellZ}`;

export function WorldPlaces({ world, palette, atmosphere, sky, streaming }: { world: World; palette: Palette; atmosphere: AtmosphereUniforms; sky: SkyUniforms; streaming: Streaming }) {
  const group = useMemo(() => new Group(), []);
  const materials = useMemo(() => ({ place: placeMaterial(atmosphere), water: waterMaterial(palette, atmosphere, sky) }), [palette, atmosphere, sky]);
  const state = useRef<{ built: Map<string, Group>; pending: Place[]; from: { x: number; z: number } | null }>({ built: new Map(), pending: [], from: null });

  useEffect(() => {
    const { built: builtPlaces } = state.current;
    return () => {
      for (const built of builtPlaces.values()) disposePlace(built);
      builtPlaces.clear();
      materials.place.dispose();
      materials.water.dispose();
    };
  }, [materials]);

  useFrame(({ camera }) => {
    const s = state.current;
    const { x, z } = camera.position;
    if (s.from === null || Math.hypot(x - s.from.x, z - s.from.z) > RECHECK) {
      s.from = { x, z };
      const wanted = world.placesNear(x, z, REACH);
      const ids = new Set(wanted.map(placeId));
      for (const [id, built] of s.built) {
        if (ids.has(id)) continue;
        group.remove(built);
        disposePlace(built);
        s.built.delete(id);
      }
      s.pending = wanted.filter((p) => !s.built.has(placeId(p))).sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
    }
    for (let n = 0; n < BUILDS_PER_FRAME && s.pending.length > 0; n++) {
      const place = s.pending.shift() as Place;
      const built = new Group();
      const mesh = new Mesh(placeGeometry(place, world.heightAt, palette), materials.place);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      built.add(mesh);
      const water = placeWater(place);
      if (water) built.add(waterMesh(water, materials.water));
      s.built.set(placeId(place), built);
      group.add(built);
    }
    report(streaming, "places", s.pending.length === 0);
  });

  return <primitive object={group} />;
}

function disposePlace(built: Group): void {
  for (const child of built.children) if (child instanceof Mesh) child.geometry.dispose();
}
