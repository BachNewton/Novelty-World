"use client";

import { useEffect, useMemo } from "react";
import { BoxGeometry, type BufferGeometry, CylinderGeometry, LatheGeometry, MeshLambertMaterial, SphereGeometry, TorusGeometry, Vector2 } from "three";
import { breatheAtmosphere, type AtmosphereUniforms } from "./atmosphere";
import { paint } from "./painted";
import type { Palette } from "./palette";

/*
 * Elliott's broom: a pale handle that bends up a little at its tip, a
 * bundle of straw bound twice in their scarf's orange, and a ribbon in their
 * cloak's purple. It lies along +z, its tip ahead, with its origin where
 * the rider sits.
 */

/** Where the handle reaches ahead of the seat, and the bristles behind it, in metres. */
export const BROOM_REACH = { tip: 1.2, bristles: -0.42 } as const;

const BRISTLE_LENGTH = 0.62;

function handle(): BufferGeometry {
  const length = BROOM_REACH.tip - BROOM_REACH.bristles + 0.08;
  const shaft = new CylinderGeometry(0.021, 0.027, length, 7, 14);
  shaft.translate(0, BROOM_REACH.bristles - 0.08 + length / 2, 0);
  shaft.rotateX(Math.PI / 2);
  // The tip bends up, as an old branch does.
  const p = shaft.getAttribute("position");
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i);
    const bend = Math.max(0, z - 0.55);
    p.setY(i, p.getY(i) + bend * bend * 0.16 + Math.sin(z * 9) * 0.004);
  }
  shaft.computeVertexNormals();
  return shaft;
}

function bristles(): BufferGeometry {
  const profile = [
    [0.0, 0.02],
    [0.034, 0.02],
    [0.05, -0.06],
    [0.09, -0.2],
    [0.13, -0.38],
    [0.16, -0.54],
    [0.15, -BRISTLE_LENGTH],
    [0.07, -BRISTLE_LENGTH + 0.015],
    [0.0, -BRISTLE_LENGTH + 0.02],
  ].map(([r, y]) => new Vector2(r, y));
  const bundle = new LatheGeometry(profile, 14);
  // Tufts round the end, so it reads as straw rather than a cone.
  const p = bundle.getAttribute("position");
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const along = Math.min(1, Math.max(0, -y / BRISTLE_LENGTH));
    const angle = Math.atan2(p.getZ(i), p.getX(i));
    const tuft = 1 + along * along * 0.12 * Math.sin(angle * 7 + 1.3);
    p.setX(i, p.getX(i) * tuft);
    p.setZ(i, p.getZ(i) * tuft);
    p.setY(i, y - along ** 3 * 0.03 * (1 + Math.sin(angle * 5)));
  }
  bundle.rotateX(Math.PI / 2);
  bundle.translate(0, 0.01, BROOM_REACH.bristles);
  bundle.computeVertexNormals();
  return bundle;
}

export function broomGeometry(palette: Palette): BufferGeometry {
  const t = palette.things;
  const bindings = [0.0, -0.075].map((dz, i) => {
    const band = new TorusGeometry(0.043 + i * 0.012, 0.012, 6, 14);
    band.translate(0, 0.01, BROOM_REACH.bristles + dz - 0.01);
    return band;
  });
  const knot = new SphereGeometry(0.03, 8, 6);
  knot.translate(0, 0.012 + (BROOM_REACH.tip - 0.55) ** 2 * 0.16, BROOM_REACH.tip);
  const ribbons = [-0.4, 0.35].map((tilt, i) => {
    const tail = new BoxGeometry(0.028, 0.16, 0.008);
    tail.translate(0, -0.08, 0);
    tail.rotateZ(tilt);
    tail.translate(0.02 * (i ? 1 : -1), -0.02, BROOM_REACH.bristles + 0.08);
    return tail;
  });
  const bow = new SphereGeometry(0.028, 8, 6);
  bow.translate(0, 0.0, BROOM_REACH.bristles + 0.08);
  return paint([
    { geometry: handle(), colour: t["broom-handle"], shading: 0.4 },
    { geometry: knot, colour: t["broom-handle"] },
    { geometry: bristles(), colour: t["broom-bristle"], shading: 0.6 },
    ...bindings.map((geometry) => ({ geometry, colour: t["witch-scarf"] })),
    ...ribbons.map((geometry) => ({ geometry, colour: t["witch-cloak"] })),
    { geometry: bow, colour: t["witch-cloak"] },
  ]);
}

/** The broom on its own, lying level at its seat's height above the ground. */
export function Broom({ palette, atmosphere }: { palette: Palette; atmosphere: AtmosphereUniforms }) {
  const assets = useMemo(() => ({ geometry: broomGeometry(palette), material: breatheAtmosphere(new MeshLambertMaterial({ vertexColors: true }), atmosphere) }), [palette, atmosphere]);
  useEffect(
    () => () => {
      assets.geometry.dispose();
      assets.material.dispose();
    },
    [assets],
  );
  return <mesh geometry={assets.geometry} material={assets.material} position={[0, 0.2, 0]} castShadow />;
}
