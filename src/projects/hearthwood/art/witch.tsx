"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { BoxGeometry, type BufferGeometry, ConeGeometry, CylinderGeometry, LatheGeometry, type Mesh, MeshLambertMaterial, SphereGeometry, TorusGeometry, Vector2, type Group } from "three";
import type { AtmosphereUniforms } from "./atmosphere";
import { broomGeometry } from "./broom";
import { shadeLambert } from "./shading";
import { paint } from "./painted";
import type { Palette } from "./palette";

/*
 * Elliott the witch, for now a placeholder silhouette: a long cloak, a
 * scarf, a pointed hat whose tip bends back, a pack with a bedroll on top
 * (and camp's own, rolled fat and strapped across it, while camp is carried),
 * a walking staff, and a wicker basket at their right hip (where a hedgehog
 * companion rides). They face +z. Their walk is a bob and a sway that
 * follow their stride, and their hat lags a little behind. On the broom they
 * sit astride it, leaning into the wind, their cloak's back and a scarf end
 * streaming out behind them and their boots showing under the hem; through
 * their own eyes only the broom is drawn.
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

/** Where the basket's opening is, on their right hip, and how wide it is. */
export const BASKET_AT = { x: -0.37, y: 0.7, z: 0.04, radius: 0.12 } as const;

/** The basket: a wicker bowl open at the top, a rim, and a handle arching over it from front to back. */
function basketPieces(palette: Palette) {
  const { x, y, z, radius } = BASKET_AT;
  const profile = [
    [0.0, -0.13],
    [radius * 0.78, -0.13],
    [radius * 0.92, -0.08],
    [radius, 0],
  ].map(([r, h]) => new Vector2(r, h));
  const bowl = new LatheGeometry(profile, 14);
  bowl.translate(x, y, z);
  const rim = new TorusGeometry(radius, 0.014, 5, 16);
  rim.rotateX(Math.PI / 2);
  rim.translate(x, y, z);
  const handle = new TorusGeometry(radius * 0.95, 0.011, 4, 12, Math.PI);
  handle.rotateY(Math.PI / 2);
  handle.translate(x, y, z);
  return [
    { geometry: bowl, colour: palette.things["broom-bristle"], shading: 0.5 },
    { geometry: rim, colour: palette.things["broom-handle"] },
    { geometry: handle, colour: palette.things["broom-handle"] },
  ];
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
    ...basketPieces(palette),
  ]);
}

/** Camp packed up on their pack: its bedroll rolled fat across the top, strapped on, and the pot hung at the side. */
function campRollGeometry(palette: Palette): BufferGeometry {
  const t = palette.things;
  const roll = new CylinderGeometry(0.115, 0.115, 0.58, 12);
  roll.rotateZ(Math.PI / 2);
  roll.translate(0, 1.31, -0.27);
  const ends = [-1, 1].map((side) => {
    const end = new CylinderGeometry(0.085, 0.085, 0.012, 12);
    end.rotateZ(Math.PI / 2);
    end.translate(side * 0.293, 1.31, -0.27);
    return { geometry: end, colour: t["witch-scarf"] };
  });
  const straps = [-1, 1].map((side) => {
    const strap = new TorusGeometry(0.12, 0.013, 4, 14);
    strap.rotateY(Math.PI / 2);
    strap.translate(side * 0.17, 1.31, -0.27);
    return { geometry: strap, colour: t["witch-strap"] };
  });
  const pot = new SphereGeometry(0.085, 9, 6, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.65);
  pot.translate(0.2, 0.98, -0.3);
  return paint([{ geometry: roll, colour: t["witch-bedroll"], shading: 0.35 }, ...ends, ...straps, { geometry: pot, colour: t["witch-hat"], shading: 0.5 }]);
}

/** The back of the cloak, a curved sheet from below the pack to the hem, which lifts and streams out behind on the broom. */
function cloakBackGeometry(palette: Palette): BufferGeometry {
  const sheet = new BoxGeometry(0.5, 0.66, 0.025, 6, 6, 1);
  sheet.translate(0, -0.33, 0);
  const p = sheet.getAttribute("position");
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const down = -p.getY(i) / 0.66;
    // Round the back, flare towards the hem as the cloak does, and curl back further down, as cloth in the wind.
    const r = 0.27 + down * 0.1;
    p.setX(i, x * (1 + down * 0.35));
    p.setZ(i, p.getZ(i) + (r - Math.sqrt(Math.max(0, r * r - x * x))) - down * down * 0.18 + Math.sin(x * 22) * 0.012 * down);
  }
  sheet.computeVertexNormals();
  return paint([{ geometry: sheet, colour: palette.things["witch-cloak"], shading: 0.5 }]);
}

/** A scarf's end, hanging from the neck, which streams back in the wind. */
function scarfEndGeometry(palette: Palette): BufferGeometry {
  const end = new BoxGeometry(0.075, 0.46, 0.014, 1, 5, 1);
  end.translate(0, -0.23, 0);
  const p = end.getAttribute("position");
  for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) + Math.sin(-p.getY(i) * 9) * 0.02);
  end.computeVertexNormals();
  return paint([{ geometry: end, colour: palette.things["witch-scarf"] }]);
}

/** Boots under the hem, seen only when seated on the broom. */
function bootsGeometry(palette: Palette): BufferGeometry {
  const boots = [-1, 1].map((side) => {
    const boot = new SphereGeometry(0.065, 8, 6);
    boot.scale(0.85, 0.7, 1.5);
    boot.translate(side * 0.13, 0, 0.05);
    return boot;
  });
  return paint(boots.map((geometry) => ({ geometry, colour: palette.things["witch-hat"] })));
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

/** A moment of Elliott's motion, which the scene works out and the art only draws. */
export interface WitchPose {
  /** Radians along their stride. */
  stride: number;
  /** 0 still to 1 running. */
  pace: number;
  /** How far their hat lags behind their pace. */
  hatLag: number;
  /** 0 on foot to 1 seated on the broom. */
  ride: number;
  /** The broom's wind, 0 still to 1 at its full speed. */
  wind: number;
  /** Their lean into a turn on the broom, in radians, left side down positive. */
  bank: number;
  /** How fast they rise in a hop, in metres a second (falling below 0), which lifts the hat's brim. */
  rise: number;
  /** Seconds of motion, for the flutter in the wind. */
  seconds: number;
  /** Seen through their own eyes: only the broom is drawn. */
  throughTheirEyes: boolean;
}

export const STANDING: WitchPose = { stride: 0, pace: 0, hatLag: 0, ride: 0, wind: 0, bank: 0, rise: 0, seconds: 0, throughTheirEyes: false };

/** Where the broom's seat is, above their feet, in metres. */
export const BROOM_SEAT = 0.55;
/** How far their body rises when seated, and how far the cloak gathers up. */
const SEATED = { lift: 0.3, gather: 0.3 } as const;
/** Where the cloak's back and the scarf's end hang from, standing. */
const BACK_AT = { y: 0.82, z: -0.25 } as const;
const SCARF_AT = { x: 0.11, y: 1.2, z: -0.06 } as const;
const HAT_HEIGHT = 1.46;

export interface WitchHandle {
  pose: (pose: WitchPose) => void;
  group: Group | null;
  /** A point at the basket's opening that moves with them, for whatever rides in it. */
  basket: Group | null;
}

export const Witch = forwardRef<WitchHandle, { palette: Palette; atmosphere: AtmosphereUniforms; still?: Partial<WitchPose>; carryingCamp?: boolean }>(function Witch({ palette, atmosphere, still, carryingCamp = false }, ref) {
  const group = useRef<Group>(null);
  const body = useRef<Group>(null);
  const cloak = useRef<Mesh>(null);
  const hat = useRef<Group>(null);
  const back = useRef<Group>(null);
  const scarf = useRef<Group>(null);
  const boots = useRef<Mesh>(null);
  const broom = useRef<Group>(null);
  const basket = useRef<Group>(null);
  const assets = useMemo(
    () => ({
      body: bodyGeometry(palette),
      hat: hatGeometry(palette),
      back: cloakBackGeometry(palette),
      scarf: scarfEndGeometry(palette),
      boots: bootsGeometry(palette),
      broom: broomGeometry(palette),
      campRoll: campRollGeometry(palette),
      material: shadeLambert(new MeshLambertMaterial({ vertexColors: true }), "solid", atmosphere),
    }),
    [palette, atmosphere],
  );
  useEffect(
    () => () => {
      for (const geometry of [assets.body, assets.hat, assets.back, assets.scarf, assets.boots, assets.broom, assets.campRoll]) geometry.dispose();
      assets.material.dispose();
    },
    [assets],
  );
  const pose = useCallback((p: WitchPose) => {
    if (!body.current || !cloak.current || !hat.current || !back.current || !scarf.current || !boots.current || !broom.current) return;
    const { stride, pace, ride, wind } = p;
    const walking = pace * (1 - ride);
    const flutter = Math.sin(p.seconds * 7.3) * 0.5 + Math.sin(p.seconds * 11.9 + 1.7) * 0.5;
    body.current.visible = !p.throughTheirEyes;
    body.current.position.y = Math.abs(Math.sin(stride)) * 0.05 * walking + SEATED.lift * ride + Math.sin(p.seconds * 1.7) * 0.02 * wind;
    body.current.rotation.z = Math.sin(stride) * 0.035 * walking + p.bank * 0.8;
    body.current.rotation.x = 0.06 * walking + ride * (0.1 + 0.08 * wind);
    const gather = 1 - SEATED.gather * ride;
    cloak.current.scale.y = gather;
    hat.current.position.y = HAT_HEIGHT * gather;
    hat.current.rotation.x = -p.hatLag * 0.5 + Math.sin(stride * 2) * 0.03 * walking - Math.max(-0.3, Math.min(0.3, p.rise * 0.06)) - wind * ride * 0.35 + flutter * 0.03 * wind;
    hat.current.rotation.z = Math.sin(stride + 0.6) * 0.04 * walking;
    back.current.visible = ride > 0.02;
    back.current.position.y = BACK_AT.y * gather;
    back.current.rotation.x = ride * (0.12 + 0.3 * wind) + flutter * 0.05 * wind;
    scarf.current.visible = ride > 0.02;
    scarf.current.position.y = SCARF_AT.y * gather;
    scarf.current.rotation.x = ride * (0.3 + 1.0 * wind) + flutter * 0.12 * wind;
    scarf.current.rotation.z = flutter * 0.08 * wind;
    boots.current.visible = ride > 0.5;
    broom.current.visible = ride > 0.02;
    broom.current.position.y = BROOM_SEAT + Math.sin(p.seconds * 1.7) * 0.02 * wind;
    broom.current.rotation.z = p.bank;
    broom.current.rotation.x = Math.sin(p.seconds * 1.3) * 0.015 * wind;
    broom.current.scale.setScalar(Math.min(1, ride * 1.4));
  }, []);
  useImperativeHandle(ref, () => ({
    get group() {
      return group.current;
    },
    get basket() {
      return basket.current;
    },
    pose,
  }));
  useEffect(() => {
    if (still) pose({ ...STANDING, ...still });
  }, [pose, still]);
  return (
    <group ref={group}>
      <group ref={body}>
        <mesh ref={cloak} geometry={assets.body} material={assets.material} castShadow />
        {carryingCamp && <mesh geometry={assets.campRoll} material={assets.material} castShadow />}
        <group ref={hat} position={[0, HAT_HEIGHT, 0.0]}>
          <mesh geometry={assets.hat} material={assets.material} castShadow rotation={[-0.08, 0, 0]} />
        </group>
        <group ref={back} position={[0, BACK_AT.y, BACK_AT.z]} visible={false}>
          <mesh geometry={assets.back} material={assets.material} castShadow />
        </group>
        <group ref={scarf} position={[SCARF_AT.x, SCARF_AT.y, SCARF_AT.z]} visible={false}>
          <mesh geometry={assets.scarf} material={assets.material} castShadow />
        </group>
        <group ref={basket} position={[BASKET_AT.x, BASKET_AT.y, BASKET_AT.z]} />
        <mesh ref={boots} geometry={assets.boots} material={assets.material} position={[0, 0.03, 0.33]} visible={false} castShadow />
      </group>
      <group ref={broom} position={[0, BROOM_SEAT, 0]} visible={false}>
        <mesh geometry={assets.broom} material={assets.material} castShadow />
      </group>
    </group>
  );
});
