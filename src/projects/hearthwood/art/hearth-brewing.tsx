"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, type Group, type Mesh, Vector3 } from "three";
import type { UniformNode } from "three/webgpu";
import type { BrewId, BrewIngredient } from "../gameplay/brews";
import type { AtmosphereUniforms } from "./atmosphere";
import { brewLook, type BrewPalette, type Glow } from "./brew-looks";
import { brewContentsShape, brewShape, brewSurfaceShape, CAULDRON, cauldronShape } from "./brews";
import { cloud, type Cloud, glowMaterial } from "./effects";
import { burstStrength, hearthClouds, RISE, STEAM_FIRELIT } from "./hearth-cooking";
import { diorama, type DioramaMaterial } from "./materials";
import { thingMaterial } from "./things";
import { colourUniform } from "./tsl";

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

const surfaces = new WeakMap<AtmosphereUniforms, { material: DioramaMaterial; glow: UniformNode<"vec3", Color> }>();

/** The cauldron's surface, coloured and lit from within by the brew as it comes on: the one material of its kind, as there is one cauldron at the fire. */
function brewSurfaceMaterial(atmosphere: AtmosphereUniforms): { material: DioramaMaterial; glow: UniformNode<"vec3", Color> } {
  let made = surfaces.get(atmosphere);
  if (!made) {
    const glow = colourUniform();
    made = { material: diorama("solid", atmosphere, { vertexColors: true }, { emissive: glow }), glow };
    surfaces.set(atmosphere, made);
  }
  return made;
}

export function HearthBrewing({ at, side, ingredients, brew, made, palette, atmosphere, drive }: HearthBrewingProps) {
  const contents = useRef<Group>(null);
  const surface = useRef<Mesh>(null);
  const brewGroup = useRef<Group>(null);
  const shared = useMemo(() => {
    const surfaceMaterial = brewSurfaceMaterial(atmosphere);
    const clouds = hearthClouds(atmosphere, { steam: 34, sparkles: 22, burst: 26 });
    const glow = cloud(1, glowMaterial(atmosphere));
    glow.renderOrder = 6;
    glow.userData = { glow: new Color(), strength: 0, pulse: 0.15, phase: 0 };
    return { material: thingMaterial(atmosphere), surfaceMaterial, cauldron: cauldronShape(palette), surface: brewSurfaceShape(), glow, ...clouds };
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
      shared.cauldron.dispose();
      shared.surface.dispose();
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
        <mesh ref={surface} geometry={shared.surface} material={shared.surfaceMaterial.material} position={[0, CAULDRON.surface * CAULDRON_LARGER, 0]} scale={CAULDRON_LARGER} />
        {floating && (
          <group position={[0, CAULDRON.surface * CAULDRON_LARGER, 0]}>
            <group ref={contents}>
              <mesh geometry={floating} material={shared.material} scale={CAULDRON_LARGER} />
            </group>
          </group>
        )}
      </group>
      <primitive object={shared.steam} position={mouth} />
      <primitive object={shared.sparkles} position={[mouth.x, mouth.y + 0.05, mouth.z]} />
      <primitive object={shared.glow} position={[mouth.x, mouth.y + 0.12, mouth.z]} />
      {madeShape && (
        <>
          <group ref={brewGroup} visible={false}>
            <mesh geometry={madeShape} material={shared.material} castShadow />
          </group>
          <primitive object={shared.burst} position={BREW_AT} />
        </>
      )}
    </group>
  );
}

interface Shared {
  surfaceMaterial: { material: DioramaMaterial; glow: UniformNode<"vec3", Color> };
  steam: Cloud;
  sparkles: Cloud;
  burst: Cloud;
  glow: Cloud;
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
  shared.surfaceMaterial.material.color.copy(colours.water).lerp(colours.brew, on);
  // Lit from within as it comes on, so the brew's colour reads even beside the flames.
  shared.surfaceMaterial.glow.value.copy(colours.brew).multiplyScalar(0.2 * on);
  shared.steam.userData.tint.copy(colours.steam);
  // A brew's vapour glows its own colour as it comes on, over the fire's warmth.
  shared.steam.userData.warm.copy(colours.glow).multiplyScalar(STEAM_FIRELIT + 0.25 * on);
  shared.steam.userData.strength = 0.3 + 0.7 * on * (1 - out * 0.5);
  shared.steam.userData.spread = 0.09;
  shared.sparkles.userData.tint.copy(colours.glow);
  shared.sparkles.userData.strength = on * (1 - out) * 0.9;
  shared.sparkles.userData.spread = 0.14;
  shared.glow.userData.glow.copy(colours.glow);
  shared.glow.userData.strength = (0.15 + 0.85 * on) * (1 - out * 0.6);
  shared.glow.scale.setScalar((0.8 + 0.9 * on) * 0.46);
  shared.burst.userData.tint.copy(colours.glow);
  shared.burst.userData.strength = burstStrength(since);
  shared.burst.userData.spread = 0.26 + 0.24 * out;
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
