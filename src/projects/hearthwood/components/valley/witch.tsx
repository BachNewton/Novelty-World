"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { BoxGeometry, type BufferGeometry, ConeGeometry, CylinderGeometry, LatheGeometry, MeshLambertMaterial, SphereGeometry, TorusGeometry, Vector2, type Group } from "three";
import { breatheAtmosphere, type AtmosphereUniforms } from "./atmosphere";
import { paint } from "./painted";
import type { Palette } from "./palette";

/*
 * The witch, for now a placeholder silhouette: a long cloak, a scarf, a
 * pointed hat whose tip bends back, a pack with a bedroll on top, and a
 * walking staff. She faces +z. Her walk is a bob and a sway that follow her
 * stride, and her hat lags a little behind.
 */

function bentHat(): BufferGeometry {
  const cone = new ConeGeometry(0.17, 0.5, 12, 6, true);
  cone.translate(0, 0.25, 0);
  const p = cone.getAttribute("position");
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const bend = (y / 0.5) ** 2;
    p.setZ(i, p.getZ(i) - bend * 0.16);
    p.setY(i, y - bend * 0.04);
  }
  cone.computeVertexNormals();
  return cone;
}

function bodyGeometry(palette: Palette): BufferGeometry {
  const t = palette.things;
  const profile = [
    [0.0, 0.03],
    [0.37, 0.03],
    [0.39, 0.12],
    [0.33, 0.45],
    [0.26, 0.8],
    [0.2, 1.05],
    [0.17, 1.18],
    [0.08, 1.25],
    [0.0, 1.26],
  ].map(([r, y]) => new Vector2(r, y));
  const cloak = new LatheGeometry(profile, 16);
  const head = new SphereGeometry(0.13, 12, 9);
  head.translate(0, 1.37, 0.01);
  const scarf = new TorusGeometry(0.14, 0.055, 6, 14);
  scarf.rotateX(Math.PI / 2);
  scarf.translate(0, 1.23, 0);
  const tail = new BoxGeometry(0.1, 0.32, 0.04);
  tail.translate(0.08, 1.06, 0.16);
  const pack = new BoxGeometry(0.32, 0.36, 0.18, 2, 2, 2);
  pack.translate(0, 1.0, -0.23);
  const flap = new BoxGeometry(0.34, 0.05, 0.21);
  flap.translate(0, 1.18, -0.23);
  const bedroll = new CylinderGeometry(0.09, 0.09, 0.44, 10);
  bedroll.rotateZ(Math.PI / 2);
  bedroll.translate(0, 1.27, -0.25);
  const staff = new CylinderGeometry(0.022, 0.026, 1.6, 6);
  staff.rotateX(0.12);
  staff.translate(0.33, 0.8, 0.14);
  const knob = new SphereGeometry(0.05, 8, 6);
  knob.translate(0.33, 1.6, 0.24);
  return paint([
    { geometry: cloak, colour: t["witch-cloak"], shading: 0.5 },
    { geometry: head, colour: t["witch-skin"] },
    { geometry: scarf, colour: t["witch-scarf"] },
    { geometry: tail, colour: t["witch-scarf"] },
    { geometry: pack, colour: t["witch-pack"], shading: 0.3 },
    { geometry: flap, colour: t["witch-pack"] },
    { geometry: bedroll, colour: t["witch-bedroll"], shading: 0.3 },
    { geometry: staff, colour: t.bark },
    { geometry: knob, colour: t.bark },
  ]);
}

function hatGeometry(palette: Palette): BufferGeometry {
  const brim = new CylinderGeometry(0.33, 0.34, 0.025, 18);
  const band = new CylinderGeometry(0.172, 0.175, 0.05, 14, 1, true);
  band.translate(0, 0.04, 0);
  return paint([
    { geometry: brim, colour: palette.things["witch-hat"] },
    { geometry: band, colour: palette.things["witch-scarf"] },
    { geometry: bentHat(), colour: palette.things["witch-hat"], shading: 0.4 },
  ]);
}

export interface WitchHandle {
  /** Poses her for a moment of her stride: `stride` in radians along it, `pace` 0 (still) to 1 (running). */
  pose: (stride: number, pace: number, hatLag: number) => void;
  group: Group | null;
}

export const Witch = forwardRef<WitchHandle, { palette: Palette; atmosphere: AtmosphereUniforms }>(function Witch({ palette, atmosphere }, ref) {
  const group = useRef<Group>(null);
  const body = useRef<Group>(null);
  const hat = useRef<Group>(null);
  const assets = useMemo(
    () => ({
      body: bodyGeometry(palette),
      hat: hatGeometry(palette),
      material: breatheAtmosphere(new MeshLambertMaterial({ vertexColors: true }), atmosphere),
    }),
    [palette, atmosphere],
  );
  useEffect(
    () => () => {
      assets.body.dispose();
      assets.hat.dispose();
      assets.material.dispose();
    },
    [assets],
  );
  useImperativeHandle(ref, () => ({
    get group() {
      return group.current;
    },
    pose(stride, pace, hatLag) {
      if (!body.current || !hat.current) return;
      body.current.position.y = Math.abs(Math.sin(stride)) * 0.05 * pace;
      body.current.rotation.z = Math.sin(stride) * 0.035 * pace;
      body.current.rotation.x = 0.06 * pace;
      hat.current.rotation.x = -hatLag * 0.5 + Math.sin(stride * 2) * 0.03 * pace;
      hat.current.rotation.z = Math.sin(stride + 0.6) * 0.04 * pace;
    },
  }));
  return (
    <group ref={group}>
      <group ref={body}>
        <mesh geometry={assets.body} material={assets.material} castShadow />
        <group ref={hat} position={[0, 1.46, 0.0]}>
          <mesh geometry={assets.hat} material={assets.material} castShadow rotation={[-0.08, 0, 0]} />
        </group>
      </group>
    </group>
  );
});
