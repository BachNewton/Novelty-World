"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, type Group, MeshLambertMaterial, NormalBlending, ShaderMaterial, Vector3 } from "three";
import { createRng, uniform } from "@/shared/lib/seeded-random";
import type { Cookware, DishId, Ingredient } from "../gameplay/recipes";
import type { AtmosphereUniforms } from "./atmosphere";
import { contentsShape, COOKWARE_AT, COOKWARE_LARGER, panShape, stickPlacing, stickShape, STICK_LINE } from "./cookware";
import type { DishPalette } from "./dish-looks";
import { dishShape } from "./dishes";
import { shadeLambert } from "./shading";

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
const RISE = 0.9;

const STEAM_VERTEX = /* glsl */ `
uniform float uHwTime;
uniform float uSpread;
attribute float seed;
varying float vLife;
void main() {
  float life = fract(uHwTime * (0.28 + 0.18 * seed) + seed * 5.0);
  vec3 p = position;
  p.x += sin(seed * 40.0) * uSpread + sin(uHwTime * 1.3 + seed * 20.0) * 0.12 * life;
  p.z += cos(seed * 40.0) * uSpread + cos(uHwTime * 1.1 + seed * 17.0) * 0.12 * life;
  p.y += life * (0.9 + 0.5 * seed);
  vLife = life;
  vec4 view = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = (0.4 + life * 1.3) * 220.0 / -view.z;
  gl_Position = projectionMatrix * view;
}
`;

const STEAM_FRAGMENT = /* glsl */ `
uniform vec3 uSteam;
uniform float uStrength;
varying float vLife;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.05, d) * smoothstep(0.0, 0.15, vLife) * (1.0 - vLife) * 0.55 * uStrength;
  gl_FragColor = vec4(uSteam, a);
}
`;

const SPARKLE_VERTEX = /* glsl */ `
uniform float uHwTime;
uniform float uSpread;
attribute float seed;
varying float vTwinkle;
void main() {
  vec3 p = position * uSpread;
  p.y += fract(uHwTime * 0.4 + seed) * 0.12;
  float twinkle = pow(max(0.0, sin(uHwTime * (5.0 + 4.0 * seed) + seed * 60.0)), 6.0);
  vTwinkle = twinkle;
  vec4 view = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = (0.3 + twinkle) * 26.0 / -view.z;
  gl_Position = projectionMatrix * view;
}
`;

const SPARKLE_FRAGMENT = /* glsl */ `
uniform vec3 uSparkle;
uniform float uStrength;
varying float vTwinkle;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float star = max(0.0, 1.0 - 9.0 * abs(c.x * c.y) - 1.6 * length(c));
  float a = star * vTwinkle * uStrength;
  gl_FragColor = vec4(uSparkle * a, a);
}
`;

const STEAM_PUFFS = 34;
const SPARKLES = 26;

/** Points scattered from a seed: steam rises from round its emitter; sparkles sit in a ball the shader spreads to its size. */
function scatter(count: number, seed: string, ball: boolean): BufferGeometry {
  const rng = createRng(seed);
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    if (ball) {
      const angle = rng.next() * Math.PI * 2;
      const up = uniform(rng, -0.5, 1);
      const r = Math.sqrt(rng.next());
      positions.set([Math.cos(angle) * r, up, Math.sin(angle) * r], i * 3);
    }
    seeds[i] = rng.next();
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(positions, 3));
  g.setAttribute("seed", new BufferAttribute(seeds, 1));
  return g;
}

export function HearthCooking({ at, side, cookware, ingredients, dish, palette, atmosphere, drive }: HearthCookingProps) {
  const contents = useRef<Group>(null);
  const stick = useRef<Group>(null);
  const pan = useRef<Group>(null);
  const dishGroup = useRef<Group>(null);
  const shared = useMemo(() => {
    const material = shadeLambert(new MeshLambertMaterial({ vertexColors: true }), "solid", atmosphere);
    const placing = stickPlacing();
    const points = (vertexShader: string, fragmentShader: string, colour: Color, additive: boolean) =>
      new ShaderMaterial({
        uniforms: { uHwTime: atmosphere.uHwTime, uSpread: { value: 0.08 }, uStrength: { value: 0 }, uSteam: { value: colour }, uSparkle: { value: colour } },
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        blending: additive ? AdditiveBlending : NormalBlending,
      });
    return {
      material,
      pan: panShape(palette),
      stick: stickShape(palette, placing.length),
      stickTurn: placing.turn,
      steam: scatter(STEAM_PUFFS, "hearthwood/steam", false),
      sizzle: scatter(SPARKLES, "hearthwood/sizzle", true),
      burst: scatter(SPARKLES, "hearthwood/burst", true),
      steamMaterial: points(STEAM_VERTEX, STEAM_FRAGMENT, new Color().copy(palette.steam), false),
      sizzleMaterial: points(SPARKLE_VERTEX, SPARKLE_FRAGMENT, new Color().copy(palette.sizzle), true),
      burstMaterial: points(SPARKLE_VERTEX, SPARKLE_FRAGMENT, new Color().copy(palette.sizzle), true),
    };
  }, [palette, atmosphere]);
  const inside = useMemo(() => (cookware ? contentsShape(ingredients, cookware, palette) : null), [ingredients, cookware, palette]);
  const served = useMemo(() => (dish ? dishShape(dish, palette) : null), [dish, palette]);

  useEffect(
    () => () => {
      shared.material.dispose();
      shared.pan.dispose();
      shared.stick.dispose();
      for (const g of [shared.steam, shared.sizzle, shared.burst]) g.dispose();
      for (const m of [shared.steamMaterial, shared.sizzleMaterial, shared.burstMaterial]) m.dispose();
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
          <points geometry={shared.steam} material={shared.steamMaterial} position={where.steam} renderOrder={5} frustumCulled={false} />
          <points geometry={shared.sizzle} material={shared.sizzleMaterial} position={where.contents} renderOrder={6} frustumCulled={false} />
        </>
      )}
      {served && (
        <>
          <group ref={dishGroup} visible={false}>
            <mesh geometry={served} material={shared.material} castShadow />
          </group>
          <points geometry={shared.burst} material={shared.burstMaterial} position={DISH_AT} renderOrder={6} frustumCulled={false} />
        </>
      )}
    </group>
  );
}

interface Moving {
  contents: Group | null;
  pan: Group | null;
  stick: Group | null;
  dish: Group | null;
}

/** This moment of the cooking: the steam and sizzle by the heat, what cooks bubbling, the pan shaking, the stick turning, and the dish rising. */
function animate(shared: { steamMaterial: ShaderMaterial; sizzleMaterial: ShaderMaterial; burstMaterial: ShaderMaterial }, parts: Moving, cookware: Cookware | null, { heat, served: since }: CookingDrive, t: number): void {
  const out = since === null ? 0 : Math.min(1, since / RISE);
  // Steam from what cooks, lingering a little after; sizzle only from the pan and the stick, over the flames.
  shared.steamMaterial.uniforms.uStrength.value = cookware === null ? 0 : 0.25 + 0.75 * heat * (1 - out * 0.6);
  shared.steamMaterial.uniforms.uSpread.value = cookware === "pot" ? 0.1 : 0.06;
  shared.sizzleMaterial.uniforms.uStrength.value = cookware === "pot" ? 0.25 * heat : heat * (1 - out);
  shared.sizzleMaterial.uniforms.uSpread.value = cookware === "stick" ? 0.09 : 0.16;
  const burst = since === null ? 0 : Math.max(0, 1 - Math.abs(since - RISE * 0.8) / 1.6);
  shared.burstMaterial.uniforms.uStrength.value = 1.6 * burst + (since === null ? 0 : 0.35);
  shared.burstMaterial.uniforms.uSpread.value = 0.28 + 0.25 * out;
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
