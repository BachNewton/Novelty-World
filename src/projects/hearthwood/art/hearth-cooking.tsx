"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, type Group, type Mesh, Vector3 } from "three";
import type { Cookware, DishId, Ingredient } from "../gameplay/recipes";
import type { AtmosphereUniforms } from "./atmosphere";
import { contentsShape, COOKWARE_AT, COOKWARE_LARGER, panShape, stickPlacing, stickShape, STICK_LINE } from "./cookware";
import type { DishPalette } from "./dish-looks";
import { dishShape } from "./dishes";
import { cloud, sparkleMaterial, steamMaterial } from "./effects";
import { thingMaterial } from "./things";

/*
 * Cooking at the camp's fire, drawn: the cookware in use (the pan on the
 * logs, the stick propped over the flames; the pot is camp's own) with the
 * ingredients in it, steam rising and little sparkles of sizzle while it
 * cooks, the ingredients bubbling, the pan shaking and the stick turning;
 * and the dish served, rising out of the steam before the fire in a burst
 * of sparkles and turning slowly there. Laid out in the fire's frame,
 * turned so +z faces Elliott. The scene says each frame how hard it is
 * cooking and how long since the dish came out (`drive`); the motion is
 * the motion clock's, so a held clock holds it.
 */

export interface CookingDrive {
  /** How hard it is cooking: 0 while only chosen, 1 over the flames. */
  heat: number;
  /** Seconds since the dish was served, or null before it is. */
  served: number | null;
}

export interface HearthCookingProps {
  /** The fire's middle on the ground. */
  at: { x: number; y: number; z: number };
  /** The way from the fire to Elliott, as a heading. */
  side: number;
  cookware: Cookware | null;
  ingredients: readonly Ingredient[];
  dish: DishId | null;
  palette: DishPalette;
  atmosphere: AtmosphereUniforms;
  drive: { current: CookingDrive };
}

/** How much larger than life the dish served is drawn, to read before the fire. */
export const DISH_SHOWN_LARGER = 1.9;
/** Where the dish rises to, in the fire's frame: between the flames and Elliott, over the ring of stones. */
const DISH_AT = new Vector3(0.45, 1.05, 1.1);
/** How long the dish takes to rise out of the steam, in seconds. */
export const RISE = 0.9;

const STEAM_PUFFS = 34;
const SPARKLES = 26;

/** The clouds a hearth's cooking or brewing rises in: steam and sparkles, placed and moved on the GPU, each its own values set by the scene each frame. */
export function hearthClouds(atmosphere: AtmosphereUniforms, sizes: { steam: number; sparkles: number; burst: number }) {
  const make = (count: number, steam: boolean) => {
    const made = cloud(count, steam ? steamMaterial(atmosphere) : sparkleMaterial(atmosphere));
    made.renderOrder = steam ? 5 : 6;
    made.userData = { tint: new Color(), strength: 0, spread: 0.1 };
    return made;
  };
  return { steam: make(sizes.steam, true), sparkles: make(sizes.sparkles, false), burst: make(sizes.burst, false) };
}

export function HearthCooking({ at, side, cookware, ingredients, dish, palette, atmosphere, drive }: HearthCookingProps) {
  const contents = useRef<Group>(null);
  const stick = useRef<Group>(null);
  const pan = useRef<Group>(null);
  const dishGroup = useRef<Group>(null);
  const shared = useMemo(() => {
    const placing = stickPlacing();
    const clouds = hearthClouds(atmosphere, { steam: STEAM_PUFFS, sparkles: SPARKLES, burst: SPARKLES });
    clouds.steam.userData.tint.copy(palette.steam);
    clouds.sparkles.userData.tint.copy(palette.sizzle);
    clouds.burst.userData.tint.copy(palette.sizzle);
    return { material: thingMaterial(atmosphere), pan: panShape(palette), stick: stickShape(palette, placing.length), stickTurn: placing.turn, ...clouds };
  }, [palette, atmosphere]);
  const inside = useMemo(() => (cookware ? contentsShape(ingredients, cookware, palette) : null), [ingredients, cookware, palette]);
  const served = useMemo(() => (dish ? dishShape(dish, palette) : null), [dish, palette]);

  useEffect(
    () => () => {
      shared.pan.dispose();
      shared.stick.dispose();
    },
    [shared],
  );
  useEffect(() => () => inside?.dispose(), [inside]);
  useEffect(() => () => served?.dispose(), [served]);

  useFrame(() => {
    animate(shared, { contents: contents.current, pan: pan.current, stick: stick.current, dish: dishGroup.current }, cookware, drive.current, atmosphere.uHwTime.value);
  });

  const where = cookware ? COOKWARE_AT[cookware] : null;
  return (
    <group position={[at.x, at.y, at.z]} rotation={[0, side, 0]}>
      {cookware === "pan" && (
        <group position={[0, 0.64, 0.08]}>
          <group ref={pan} rotation={[0, -0.7, 0]}>
            <mesh geometry={shared.pan} material={shared.material} scale={COOKWARE_LARGER} castShadow />
          </group>
        </group>
      )}
      {cookware === "stick" && (
        <group position={STICK_LINE.butt} quaternion={shared.stickTurn}>
          <group ref={stick}>
            <mesh geometry={shared.stick} material={shared.material} castShadow />
          </group>
        </group>
      )}
      {where && inside && (
        <group position={where.contents}>
          <group ref={contents}>
            <mesh geometry={inside} material={shared.material} scale={COOKWARE_LARGER} castShadow />
          </group>
        </group>
      )}
      {where && (
        <>
          <primitive object={shared.steam} position={where.steam} />
          <primitive object={shared.sparkles} position={where.contents} />
        </>
      )}
      {served && (
        <>
          <group ref={dishGroup} visible={false}>
            <mesh geometry={served} material={shared.material} castShadow />
          </group>
          <primitive object={shared.burst} position={DISH_AT} />
        </>
      )}
    </group>
  );
}

/** How brightly the burst a dish or brew rises in sparkles, `since` seconds after it was made. */
export function burstStrength(since: number | null): number {
  if (since === null) return 0;
  return 1.6 * Math.max(0, 1 - Math.abs(since - RISE * 0.8) / 1.6) + 0.35;
}

interface Moving {
  contents: Group | null;
  pan: Group | null;
  stick: Group | null;
  dish: Group | null;
}

/** This moment of the cooking: the steam and sizzle by the heat, what cooks bubbling, the pan shaking, the stick turning, and the dish rising. */
function animate(shared: { steam: Mesh; sparkles: Mesh; burst: Mesh }, parts: Moving, cookware: Cookware | null, { heat, served: since }: CookingDrive, t: number): void {
  const out = since === null ? 0 : Math.min(1, since / RISE);
  // Steam from what cooks, lingering a little after; sizzle only from the pan and the stick, over the flames.
  shared.steam.userData.strength = cookware === null ? 0 : 0.25 + 0.75 * heat * (1 - out * 0.6);
  shared.steam.userData.spread = cookware === "pot" ? 0.1 : 0.06;
  shared.sparkles.userData.strength = cookware === "pot" ? 0.25 * heat : heat * (1 - out);
  shared.sparkles.userData.spread = cookware === "stick" ? 0.09 : 0.16;
  shared.burst.userData.strength = burstStrength(since);
  shared.burst.userData.spread = 0.28 + 0.25 * out;
  if (parts.contents) {
    // What cooks bubbles and jumps in the pan; it is gone into the dish once served.
    parts.contents.visible = since === null || since < RISE * 0.35;
    parts.contents.position.y = Math.abs(Math.sin(t * 11)) * 0.012 * heat;
    parts.contents.rotation.y = Math.sin(t * 3.1) * 0.15 * heat;
  }
  if (parts.pan) {
    parts.pan.position.x = Math.sin(t * 9) * 0.012 * heat * (1 - out);
    parts.pan.rotation.y = -0.7 + Math.sin(t * 4.7) * 0.05 * heat * (1 - out);
  }
  if (parts.stick) parts.stick.rotation.y = t * 1.6 * heat;
  if (parts.dish) {
    parts.dish.visible = since !== null;
    const ease = 1 - (1 - out) ** 3;
    parts.dish.scale.setScalar(DISH_SHOWN_LARGER * (0.3 + 0.7 * ease));
    parts.dish.position.set(DISH_AT.x * ease, DISH_AT.y - 0.45 * (1 - ease) + Math.sin(t * 1.4) * 0.02 * ease, DISH_AT.z * ease + 0.1 * (1 - ease));
    parts.dish.rotation.y = t * 0.45;
  }
}
