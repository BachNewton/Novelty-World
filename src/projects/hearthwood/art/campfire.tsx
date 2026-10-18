"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
  MeshLambertMaterial,
  PlaneGeometry,
  ShaderMaterial,
  SphereGeometry,
  TorusGeometry,
  type Group,
  type Mesh,
  MeshBasicMaterial,
  type PointLight,
  type Points,
} from "three";
import { createRng, uniform } from "@/shared/lib/seeded-random";
import type { MomentLight } from "../engine/day";
import type { AtmosphereUniforms } from "./atmosphere";
import { shadeLambert } from "./shading";
import { paint, type Piece } from "./painted";
import type { Palette } from "./palette";

/*
 * Camp: a ring of stones round a fire of crossed logs, two logs to sit on, a
 * bedroll and a pot. The fire is a few soft flame shells that lick upwards,
 * embers rising and fading, a glow round it that matters most at night, and
 * a flickering light on everything near. It stands at `at`, its things
 * turned round the fire by `turn` and each set down on its own ground
 * (`lifts`); as camp goes up its pieces settle into place one by one and
 * then the fire catches. Its ghost shows where a camp would go.
 */

/** How the fire burns this moment: the day's light and the flicker, which the scene keeps. */
export interface FireState {
  light: MomentLight;
  /** About 1. */
  flicker: number;
}

const FLAME_VERTEX = /* glsl */ `
uniform float uHwTime;
uniform float uSeed;
varying float vHeight;
varying float vEdge;
void main() {
  vec3 p = position;
  float h = clamp(p.y / 0.9 + 0.5, 0.0, 1.0);
  float t = uHwTime * 7.0 + uSeed * 10.0;
  p.x += sin(t + p.y * 5.0) * 0.06 * h;
  p.z += cos(t * 0.8 + p.y * 4.0) * 0.05 * h;
  p.y *= 1.0 + 0.12 * sin(t * 1.3);
  vHeight = h;
  vec4 view = modelViewMatrix * vec4(p, 1.0);
  vec3 n = normalize(normalMatrix * normal);
  vEdge = abs(dot(n, normalize(-view.xyz)));
  gl_Position = projectionMatrix * view;
}
`;

const FLAME_FRAGMENT = /* glsl */ `
uniform vec3 uCore;
uniform vec3 uFlame;
uniform vec3 uTip;
uniform float uStrength;
varying float vHeight;
varying float vEdge;
void main() {
  vec3 colour = mix(uCore, uFlame, smoothstep(0.05, 0.5, vHeight));
  colour = mix(colour, uTip, smoothstep(0.5, 1.0, vHeight));
  float alpha = (1.0 - smoothstep(0.55, 1.0, vHeight)) * smoothstep(0.0, 0.6, vEdge) * uStrength;
  gl_FragColor = vec4(colour * alpha, alpha);
}
`;

const EMBER_VERTEX = /* glsl */ `
uniform float uHwTime;
attribute float seed;
varying float vLife;
void main() {
  float life = fract(uHwTime * (0.35 + 0.25 * seed) + seed * 7.0);
  vec3 p = position;
  p.y += life * (1.6 + seed);
  p.x += sin(uHwTime * 2.0 + seed * 30.0) * 0.25 * life;
  p.z += cos(uHwTime * 1.7 + seed * 20.0) * 0.25 * life;
  vLife = life;
  vec4 view = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = (1.0 - life) * 70.0 / -view.z;
  gl_Position = projectionMatrix * view;
}
`;

const EMBER_FRAGMENT = /* glsl */ `
uniform vec3 uEmber;
varying float vLife;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.1, d) * (1.0 - vLife);
  gl_FragColor = vec4(uEmber * a, a);
}
`;

const GLOW_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 centre = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vec4 view = centre + vec4(position.xy, 0.0, 0.0);
  gl_Position = projectionMatrix * view;
}
`;

const GLOW_FRAGMENT = /* glsl */ `
uniform vec3 uGlow;
uniform float uStrength;
varying vec2 vUv;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float a = pow(max(1.0 - d, 0.0), 2.2) * uStrength;
  gl_FragColor = vec4(uGlow * a, a);
}
`;

const EMBERS = 36;
/** The fire light's strength at its brightest, in candela. */
const FIRE_LIGHT = 26;

/** The pieces of a camp, each set down on its own ground and settling into place on its own as camp is pitched. */
export const CAMP_PARTS = ["ring", "bed", "seat-0", "seat-1", "tripod"] as const;
export type CampPart = (typeof CAMP_PARTS)[number];

/** Where each part stands round the fire, before the camp's turn: round from it (cos to x, sin to z) and how far, in metres. */
export const CAMP_LAYOUT: Record<CampPart, { angle: number; out: number }> = {
  ring: { angle: 0, out: 0 },
  bed: { angle: 4.0, out: 3.6 },
  "seat-0": { angle: 0.4, out: 2.4 },
  "seat-1": { angle: 2.6, out: 2.4 },
  tripod: { angle: 0, out: 0 },
};

/** How far above the fire's ground each part's own ground lies, in metres: where camp is pitched on ground not quite level. */
export type CampLifts = Partial<Record<CampPart, number>>;

/** When each part starts to settle as camp goes up, in seconds, and how long it takes; when the fire catches, and how long it takes to burn up. */
const SETTLE: Record<CampPart, number> = { ring: 0, bed: 0.35, "seat-0": 0.65, "seat-1": 0.85, tripod: 1.1 };
const SETTLING = 0.6;
const CATCH = { from: 1.6, over: 1.0 } as const;
/** How far above its ground a part starts as it settles, in metres. */
const DROP = 0.7;

/** A part's place round the fire, in the camp's own frame. */
export const anchorOf = (part: CampPart) => ({ x: Math.cos(CAMP_LAYOUT[part].angle) * CAMP_LAYOUT[part].out, z: Math.sin(CAMP_LAYOUT[part].angle) * CAMP_LAYOUT[part].out });

function campPieces(palette: Palette, rng: ReturnType<typeof createRng>): Record<CampPart, Piece[]> {
  const t = palette.things;
  const parts: Record<CampPart, Piece[]> = { ring: [], bed: [], "seat-0": [], "seat-1": [], tripod: [] };
  for (let s = 0; s < 10; s++) {
    const angle = (s / 10) * Math.PI * 2;
    const stone = new IcosahedronGeometry(uniform(rng, 0.15, 0.21), 0);
    stone.scale(1.2, 0.7, 1);
    stone.rotateY(angle);
    stone.translate(Math.cos(angle) * 0.72, 0.07, Math.sin(angle) * 0.72);
    parts.ring.push({ geometry: stone, colour: t.rock, shading: 0.4 });
  }
  for (let l = 0; l < 5; l++) {
    const angle = (l / 5) * Math.PI * 2 + 0.3;
    const log = new CylinderGeometry(0.06, 0.075, 0.95, 6);
    log.translate(0, 0.47, 0);
    log.rotateZ(1.05);
    log.rotateY(angle);
    log.translate(Math.cos(angle) * 0.46, 0, -Math.sin(angle) * 0.46);
    parts.ring.push({ geometry: log, colour: t.log, shading: 0.3 });
  }
  for (const [part, length] of [
    ["seat-0", 1.9],
    ["seat-1", 1.6],
  ] as const) {
    const { angle, out } = CAMP_LAYOUT[part];
    const seat = new CylinderGeometry(0.2, 0.22, length, 9);
    seat.rotateZ(Math.PI / 2);
    seat.rotateY(angle + Math.PI / 2);
    seat.translate(Math.cos(angle) * out, 0.18, Math.sin(angle) * out);
    parts[part].push({ geometry: seat, colour: t.log, shading: 0.4 });
  }
  const bedroll = new CylinderGeometry(0.2, 0.2, 1.1, 10);
  bedroll.rotateZ(Math.PI / 2);
  bedroll.rotateY(-1.1);
  bedroll.translate(Math.cos(4.3) * 3.2, 0.18, Math.sin(4.3) * 3.2);
  parts.bed.push({ geometry: bedroll, colour: t["witch-bedroll"], shading: 0.3 });
  const blanket = new BoxGeometry(1.0, 0.08, 1.8);
  blanket.rotateY(-1.1);
  blanket.translate(Math.cos(4.0) * 3.6, 0.04, Math.sin(4.0) * 3.6);
  parts.bed.push({ geometry: blanket, colour: t["witch-scarf"] });
  for (let leg = 0; leg < 3; leg++) {
    const angle = (leg / 3) * Math.PI * 2;
    const rod = new CylinderGeometry(0.018, 0.018, 1.5, 4);
    rod.translate(0, 0.75, 0);
    rod.rotateZ(0.32);
    rod.rotateY(angle);
    rod.translate(Math.cos(angle) * 0.62, 0, -Math.sin(angle) * 0.62);
    parts.tripod.push({ geometry: rod, colour: t.bark });
  }
  const pot = new SphereGeometry(0.2, 10, 6, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.65);
  pot.translate(0, 1.05, 0);
  parts.tripod.push({ geometry: pot, colour: t["witch-hat"], shading: 0.5 });
  const rim = new TorusGeometry(0.16, 0.02, 4, 12);
  rim.rotateX(Math.PI / 2);
  rim.translate(0, 1.15, 0);
  parts.tripod.push({ geometry: rim, colour: t["witch-hat"] });
  return parts;
}

/** Each part as one geometry about its own place round the fire. */
function campGeometries(palette: Palette, rng: ReturnType<typeof createRng>): Record<CampPart, BufferGeometry> {
  const pieces = campPieces(palette, rng);
  return Object.fromEntries(
    CAMP_PARTS.map((part) => {
      const { x, z } = anchorOf(part);
      return [part, paint(pieces[part]).translate(-x, 0, -z)];
    }),
  ) as Record<CampPart, BufferGeometry>;
}

/** How far a part has settled, 0 to 1, `seconds` into camp going up. */
const settledPart = (part: CampPart, seconds: number) => Math.min(1, Math.max(0, (seconds - SETTLE[part]) / SETTLING));
/** How far the fire has caught, 0 to 1, `seconds` into camp going up. */
const caught = (seconds: number) => Math.min(1, Math.max(0, (seconds - CATCH.from) / CATCH.over));

/** Sets each part down on its ground, settling from above as camp goes up: it eases down, rounding out from a little smaller. */
function setParts(meshes: Partial<Record<CampPart, Mesh | null>>, lifts: CampLifts | undefined, seconds: number): void {
  for (const part of CAMP_PARTS) {
    const mesh = meshes[part];
    if (!mesh) continue;
    const p = settledPart(part, seconds);
    const { x, z } = anchorOf(part);
    mesh.visible = p > 0;
    mesh.position.set(x, (lifts?.[part] ?? 0) + DROP * (1 - p) ** 3, z);
    mesh.scale.setScalar(0.8 + 0.2 * (1 - (1 - p) ** 2));
  }
}

/** The fire this frame: its light's flicker, the flames' strength, and the glow, wider at night. */
function burn(fire: { flames: ShaderMaterial[]; glowMaterial: ShaderMaterial }, clock: FireState, lit: number, light: PointLight | null, glow: Mesh | null): void {
  if (light) light.intensity = FIRE_LIGHT * clock.light.fire * clock.flicker * lit;
  for (const m of fire.flames) m.uniforms.uStrength.value = (0.75 + 0.25 * clock.flicker) * lit;
  fire.glowMaterial.uniforms.uStrength.value = 0.55 * clock.light.fire * clock.flicker * lit;
  glow?.scale.setScalar((2.6 + 2.4 * clock.light.night) * (0.4 + 0.6 * lit));
}

export interface CampfireProps {
  /** The fire's middle, on its ground. */
  at: { x: number; y: number; z: number };
  /** How the camp's things are turned round the fire (0 is the home camp's layout), round from +x towards +z. */
  turn?: number;
  lifts?: CampLifts;
  /** Seconds into camp going up (its pieces settling, then the fire catching); a camp standing is any time after. */
  appear?: () => number;
  seed: string;
  palette: Palette;
  atmosphere: AtmosphereUniforms;
  fire: FireState;
}

const STANDING = () => Infinity;

export function Campfire({ at, turn = 0, lifts, appear = STANDING, seed, palette, atmosphere, fire }: CampfireProps) {
  const light = useRef<PointLight>(null);
  const glow = useRef<Mesh>(null);
  const flames = useRef<Group>(null);
  const embers = useRef<Points>(null);
  const parts = useRef<Partial<Record<CampPart, Mesh | null>>>({});
  const assets = useMemo(() => {
    const rng = createRng(`${seed}/camp-things`);
    const t = palette.things;
    const flameUniforms = (seed: number) => ({
      uHwTime: atmosphere.uHwTime,
      uSeed: { value: seed },
      uCore: { value: new Color().copy(t["fire-core"]) },
      uFlame: { value: new Color().copy(t["fire-flame"]) },
      uTip: { value: new Color().copy(t["fire-tip"]) },
      uStrength: { value: 1 },
    });
    const flameMaterial = (seed: number) =>
      new ShaderMaterial({ uniforms: flameUniforms(seed), vertexShader: FLAME_VERTEX, fragmentShader: FLAME_FRAGMENT, transparent: true, depthWrite: false, blending: AdditiveBlending });
    const embers = new BufferGeometry();
    const positions = new Float32Array(EMBERS * 3);
    const seeds = new Float32Array(EMBERS);
    for (let e = 0; e < EMBERS; e++) {
      positions.set([uniform(rng, -0.25, 0.25), 0.3, uniform(rng, -0.25, 0.25)], e * 3);
      seeds[e] = rng.next();
    }
    embers.setAttribute("position", new BufferAttribute(positions, 3));
    embers.setAttribute("seed", new BufferAttribute(seeds, 1));
    return {
      parts: campGeometries(palette, rng),
      campMaterial: shadeLambert(new MeshLambertMaterial({ vertexColors: true }), "solid", atmosphere),
      flame: new ConeGeometry(0.34, 0.9, 10, 3, true),
      flameSmall: new ConeGeometry(0.2, 0.6, 8, 2, true),
      flames: [flameMaterial(0.1), flameMaterial(0.6), flameMaterial(0.9)],
      embers,
      emberMaterial: new ShaderMaterial({
        uniforms: { uHwTime: atmosphere.uHwTime, uEmber: { value: new Color().copy(t.ember) } },
        vertexShader: EMBER_VERTEX,
        fragmentShader: EMBER_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
      glow: new PlaneGeometry(1, 1),
      glowMaterial: new ShaderMaterial({
        uniforms: { uGlow: { value: new Color().copy(t.firelight) }, uStrength: { value: 0 } },
        vertexShader: GLOW_VERTEX,
        fragmentShader: GLOW_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
      firelight: new Color().copy(t.firelight),
    };
  }, [seed, palette, atmosphere]);

  useEffect(
    () => () => {
      for (const g of Object.values(assets.parts)) g.dispose();
      assets.campMaterial.dispose();
      assets.flame.dispose();
      assets.flameSmall.dispose();
      for (const m of assets.flames) m.dispose();
      assets.embers.dispose();
      assets.emberMaterial.dispose();
      assets.glow.dispose();
      assets.glowMaterial.dispose();
    },
    [assets],
  );

  useFrame(() => {
    const seconds = appear();
    const lit = caught(seconds);
    setParts(parts.current, lifts, seconds);
    burn(assets, fire, lit, light.current, glow.current);
    if (flames.current) {
      flames.current.visible = lit > 0;
      flames.current.scale.set(0.5 + 0.5 * lit, 0.25 + 0.75 * lit, 0.5 + 0.5 * lit);
    }
    if (embers.current) embers.current.visible = lit > 0.5;
  });

  return (
    <group position={[at.x, at.y, at.z]} rotation={[0, -turn, 0]}>
      {CAMP_PARTS.map((part) => (
        <mesh
          key={part}
          ref={(mesh) => {
            parts.current[part] = mesh;
          }}
          geometry={assets.parts[part]}
          material={assets.campMaterial}
          position={[anchorOf(part).x, lifts?.[part] ?? 0, anchorOf(part).z]}
          castShadow
          receiveShadow
        />
      ))}
      <group ref={flames}>
        <mesh geometry={assets.flame} material={assets.flames[0]} position={[0, 0.55, 0]} renderOrder={2} />
        <mesh geometry={assets.flameSmall} material={assets.flames[1]} position={[0.12, 0.4, 0.05]} renderOrder={2} />
        <mesh geometry={assets.flameSmall} material={assets.flames[2]} position={[-0.1, 0.38, -0.08]} renderOrder={2} />
      </group>
      <points ref={embers} geometry={assets.embers} material={assets.emberMaterial} renderOrder={3} frustumCulled={false} />
      <mesh ref={glow} geometry={assets.glow} material={assets.glowMaterial} position={[0, 0.7, 0]} renderOrder={4} frustumCulled={false} />
      <pointLight ref={light} color={assets.firelight} position={[0, 0.9, 0]} distance={26} decay={2} />
    </group>
  );
}

/** Where a camp's ghost stands this frame and whether the ground there is good, or null to hide it. */
export interface GhostDrive {
  x: number;
  y: number;
  z: number;
  turn: number;
  lifts: CampLifts;
  good: boolean;
}

/** How solid the ghost shows on good ground and on ground that won't do. */
const GHOST_OPACITY = { good: 0.4, poor: 0.14 } as const;

/** The ghost this frame: where it stands, each part on its ground, and its colour for the ground under it. */
function showGhost(assets: { material: MeshBasicMaterial; good: Color; poor: Color }, group: Group | null, meshes: Partial<Record<CampPart, Mesh | null>>, at: GhostDrive | null): void {
  if (!group) return;
  group.visible = at !== null;
  if (!at) return;
  group.position.set(at.x, at.y, at.z);
  group.rotation.y = -at.turn;
  assets.material.color.copy(at.good ? assets.good : assets.poor);
  assets.material.opacity = at.good ? GHOST_OPACITY.good : GHOST_OPACITY.poor;
  for (const part of CAMP_PARTS) {
    const mesh = meshes[part];
    if (mesh) mesh.position.y = at.lifts[part] ?? 0;
  }
}

/** The ghost of a camp: its pieces in one soft colour, warm where the ground is good to pitch on and faint where it isn't. */
export function CampGhost({ palette, drive }: { palette: Palette; drive: () => GhostDrive | null }) {
  const group = useRef<Group>(null);
  const meshes = useRef<Partial<Record<CampPart, Mesh | null>>>({});
  const assets = useMemo(() => {
    const t = palette.things;
    return {
      parts: campGeometries(palette, createRng("hearthwood/camp-ghost")),
      material: new MeshBasicMaterial({ color: t["camp-ghost"].clone(), transparent: true, opacity: GHOST_OPACITY.good, depthWrite: false }),
      good: t["camp-ghost"].clone(),
      poor: t["camp-ghost-poor"].clone(),
    };
  }, [palette]);
  useEffect(
    () => () => {
      for (const g of Object.values(assets.parts)) g.dispose();
      assets.material.dispose();
    },
    [assets],
  );
  useFrame(() => {
    showGhost(assets, group.current, meshes.current, drive());
  });
  return (
    <group ref={group} visible={false}>
      {CAMP_PARTS.map((part) => (
        <mesh
          key={part}
          ref={(mesh) => {
            meshes.current[part] = mesh;
          }}
          geometry={assets.parts[part]}
          material={assets.material}
          position={[anchorOf(part).x, 0, anchorOf(part).z]}
          renderOrder={5}
        />
      ))}
    </group>
  );
}
