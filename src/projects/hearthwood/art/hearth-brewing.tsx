"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, type Group, type Mesh, MeshLambertMaterial, NormalBlending, ShaderMaterial, Vector3 } from "three";
import type { BrewId, BrewIngredient } from "../gameplay/brews";
import type { AtmosphereUniforms } from "./atmosphere";
import { brewLook, type BrewPalette, type Glow } from "./brew-looks";
import { brewContentsShape, brewShape, brewSurfaceShape, CAULDRON, cauldronShape } from "./brews";
import { RISE, scatter, SPARKLE_FRAGMENT, SPARKLE_VERTEX, STEAM_FRAGMENT, STEAM_VERTEX } from "./hearth-cooking";
import { shadeLambert } from "./shading";

/*
 * Brewing at the camp's fire, drawn: the iron cauldron on its three legs at
 * the front of the fire, what floats in it, and while it brews the surface
 * turning the brew's own colour, the steam rising in that glow with a soft
 * light over the mouth and a few sparkles; then the brew made, rising out of
 * the steam in a burst of sparkles and turning slowly there, as a dish
 * does. Laid out in the fire's frame, turned so +z faces Elliott. The scene
 * says each frame how far it has brewed and how long since the brew came
 * out (`drive`); the motion is the motion clock's, so a held clock holds it.
 */

export interface BrewingDrive {
  /** How far it has brewed, 0 while only chosen to 1 when made. */
  brewed: number;
  /** Seconds since the brew was made, or null before it is. */
  made: number | null;
}

export interface HearthBrewingProps {
  /** The fire's middle on the ground. */
  at: { x: number; y: number; z: number };
  /** The way from the fire to Elliott, as a heading. */
  side: number;
  ingredients: readonly BrewIngredient[];
  /** The brew brewing or made, or null while choosing. */
  brew: BrewId | null;
  /** Whether the brew made rises out of the steam yet. */
  made: boolean;
  palette: BrewPalette;
  atmosphere: AtmosphereUniforms;
  drive: { current: BrewingDrive };
}

/** Where the cauldron stands in the fire's frame: in the embers at the front of the fire, towards Elliott, a little to their left of the flames. */
export const CAULDRON_AT = new Vector3(-0.12, 0, 0.5);
/** How much larger than life the cauldron is drawn. */
export const CAULDRON_LARGER = 1.25;
/** How much larger than life a brew made is drawn, to read before the fire. */
export const BREW_SHOWN_LARGER = 2.2;
/** Where the brew made rises to, in the fire's frame: between the flames and Elliott. */
const BREW_AT = new Vector3(0.8, 0.9, 1.05);

const GLOW_VERTEX = /* glsl */ `
uniform float uSize;
void main() {
  vec4 view = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = uSize * 300.0 / -view.z;
  gl_Position = projectionMatrix * view;
}
`;

const GLOW_FRAGMENT = /* glsl */ `
uniform vec3 uGlow;
uniform float uStrength;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = pow(max(1.0 - d, 0.0), 2.4) * uStrength;
  gl_FragColor = vec4(uGlow * a, a);
}
`;

function onePoint(): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(3), 3));
  return g;
}

export function HearthBrewing({ at, side, ingredients, brew, made, palette, atmosphere, drive }: HearthBrewingProps) {
  const contents = useRef<Group>(null);
  const surface = useRef<Mesh>(null);
  const brewGroup = useRef<Group>(null);
  const shared = useMemo(() => {
    const material = shadeLambert(new MeshLambertMaterial({ vertexColors: true }), "solid", atmosphere);
    // The surface is coloured by the brew as it comes on, so it has a material of its own.
    const surfaceMaterial = shadeLambert(new MeshLambertMaterial({ vertexColors: true, color: new Color(1, 1, 1) }), "solid", atmosphere);
    const points = (vertexShader: string, fragmentShader: string, additive: boolean) =>
      new ShaderMaterial({
        uniforms: { uHwTime: atmosphere.uHwTime, uSpread: { value: 0.1 }, uStrength: { value: 0 }, uSteam: { value: new Color() }, uSparkle: { value: new Color() }, uGlow: { value: new Color() }, uSize: { value: 0.9 } },
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        blending: additive ? AdditiveBlending : NormalBlending,
      });
    return {
      material,
      surfaceMaterial,
      cauldron: cauldronShape(palette),
      surface: brewSurfaceShape(),
      steam: scatter(34, "hearthwood/brew-steam", false),
      sparkles: scatter(22, "hearthwood/brew-sparkles", true),
      burst: scatter(26, "hearthwood/brew-burst", true),
      glow: onePoint(),
      steamMaterial: points(STEAM_VERTEX, STEAM_FRAGMENT, false),
      sparkleMaterial: points(SPARKLE_VERTEX, SPARKLE_FRAGMENT, true),
      burstMaterial: points(SPARKLE_VERTEX, SPARKLE_FRAGMENT, true),
      glowMaterial: points(GLOW_VERTEX, GLOW_FRAGMENT, true),
    };
  }, [palette, atmosphere]);
  const floating = useMemo(() => brewContentsShape(ingredients, palette), [ingredients, palette]);
  const madeShape = useMemo(() => (brew && made ? brewShape(brew, palette) : null), [brew, made, palette]);
  const look = brew ? brewLook(brew) : null;
  const colours = useMemo(() => {
    const water = palette.glass.clone().multiplyScalar(0.55);
    if (look === null) return { water, brew: water, glow: palette["glow-gold"], steam: palette.steam };
    const glow: Glow = look.glow;
    // A charm's linen isn't what it steeps in: the cauldron takes its glow's colour.
    const brewTone = (look.vessel === "pouch" ? palette[glow] : palette[look.tone]).clone().multiplyScalar(0.8);
    return { water, brew: brewTone, glow: palette[glow], steam: palette.steam.clone().lerp(palette[glow], 0.8) };
  }, [look, palette]);

  useEffect(
    () => () => {
      shared.material.dispose();
      shared.surfaceMaterial.dispose();
      shared.cauldron.dispose();
      shared.surface.dispose();
      for (const g of [shared.steam, shared.sparkles, shared.burst, shared.glow]) g.dispose();
      for (const m of [shared.steamMaterial, shared.sparkleMaterial, shared.burstMaterial, shared.glowMaterial]) m.dispose();
    },
    [shared],
  );
  useEffect(() => () => floating?.dispose(), [floating]);
  useEffect(() => () => madeShape?.dispose(), [madeShape]);

  useFrame(() => {
    animate(shared, colours, { contents: contents.current, surface: surface.current, brew: brewGroup.current }, drive.current, atmosphere.uHwTime.value);
  });

  const mouth = new Vector3(CAULDRON_AT.x, CAULDRON.surface * CAULDRON_LARGER, CAULDRON_AT.z);
  return (
    <group position={[at.x, at.y, at.z]} rotation={[0, side, 0]}>
      <group position={CAULDRON_AT}>
        <mesh geometry={shared.cauldron} material={shared.material} scale={CAULDRON_LARGER} castShadow />
        <mesh ref={surface} geometry={shared.surface} material={shared.surfaceMaterial} position={[0, CAULDRON.surface * CAULDRON_LARGER, 0]} scale={CAULDRON_LARGER} />
        {floating && (
          <group position={[0, CAULDRON.surface * CAULDRON_LARGER, 0]}>
            <group ref={contents}>
              <mesh geometry={floating} material={shared.material} scale={CAULDRON_LARGER} />
            </group>
          </group>
        )}
      </group>
      <points geometry={shared.steam} material={shared.steamMaterial} position={mouth} renderOrder={5} frustumCulled={false} />
      <points geometry={shared.sparkles} material={shared.sparkleMaterial} position={mouth.clone().add(new Vector3(0, 0.05, 0))} renderOrder={6} frustumCulled={false} />
      <points geometry={shared.glow} material={shared.glowMaterial} position={mouth.clone().add(new Vector3(0, 0.12, 0))} renderOrder={6} frustumCulled={false} />
      {madeShape && (
        <>
          <group ref={brewGroup} visible={false}>
            <mesh geometry={madeShape} material={shared.material} castShadow />
          </group>
          <points geometry={shared.burst} material={shared.burstMaterial} position={BREW_AT} renderOrder={6} frustumCulled={false} />
        </>
      )}
    </group>
  );
}

interface Shared {
  surfaceMaterial: MeshLambertMaterial;
  steamMaterial: ShaderMaterial;
  sparkleMaterial: ShaderMaterial;
  burstMaterial: ShaderMaterial;
  glowMaterial: ShaderMaterial;
}

interface Moving {
  contents: Group | null;
  surface: Mesh | null;
  brew: Group | null;
}

/** This moment of the brewing: the surface turning the brew's colour, the steam and glow coming on, what floats bobbing round, and the brew rising. */
function animate(shared: Shared, colours: { water: Color; brew: Color; glow: Color; steam: Color }, parts: Moving, { brewed, made: since }: BrewingDrive, t: number): void {
  const out = since === null ? 0 : Math.min(1, since / RISE);
  const on = Math.min(1, brewed * 1.6);
  // Lit from within as it comes on, so the brew's colour reads even beside the flames.
  shared.surfaceMaterial.color.copy(colours.water).lerp(colours.brew, on);
  shared.surfaceMaterial.emissive.copy(colours.brew).multiplyScalar(0.2 * on);
  (shared.steamMaterial.uniforms.uSteam.value as Color).copy(colours.steam);
  shared.steamMaterial.uniforms.uStrength.value = 0.3 + 0.7 * on * (1 - out * 0.5);
  shared.steamMaterial.uniforms.uSpread.value = 0.09;
  (shared.sparkleMaterial.uniforms.uSparkle.value as Color).copy(colours.glow);
  shared.sparkleMaterial.uniforms.uStrength.value = on * (1 - out) * 0.9;
  shared.sparkleMaterial.uniforms.uSpread.value = 0.14;
  (shared.glowMaterial.uniforms.uGlow.value as Color).copy(colours.glow);
  shared.glowMaterial.uniforms.uStrength.value = (0.15 + 0.85 * on) * (0.85 + 0.15 * Math.sin(t * 3.1)) * (1 - out * 0.6);
  shared.glowMaterial.uniforms.uSize.value = 0.8 + 0.9 * on;
  (shared.burstMaterial.uniforms.uSparkle.value as Color).copy(colours.glow);
  const burst = since === null ? 0 : Math.max(0, 1 - Math.abs(since - RISE * 0.8) / 1.6);
  shared.burstMaterial.uniforms.uStrength.value = 1.6 * burst + (since === null ? 0 : 0.35);
  shared.burstMaterial.uniforms.uSpread.value = 0.26 + 0.24 * out;
  if (parts.contents) {
    // What floats turns slowly round the cauldron as it simmers, and is gone into the brew once made.
    parts.contents.visible = since === null || since < RISE * 0.35;
    parts.contents.rotation.y = t * (0.3 + 0.9 * on);
    parts.contents.position.y = Math.sin(t * 5) * 0.006 * on;
  }
  if (parts.brew) {
    parts.brew.visible = since !== null;
    const ease = 1 - (1 - out) ** 3;
    parts.brew.scale.setScalar(BREW_SHOWN_LARGER * (0.3 + 0.7 * ease));
    parts.brew.position.set(CAULDRON_AT.x + (BREW_AT.x - CAULDRON_AT.x) * ease, 0.45 + (BREW_AT.y - 0.45) * ease + Math.sin(t * 1.4) * 0.02 * ease, CAULDRON_AT.z + (BREW_AT.z - CAULDRON_AT.z) * ease);
    parts.brew.rotation.y = t * 0.45;
  }
}
