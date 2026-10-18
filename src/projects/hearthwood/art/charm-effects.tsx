"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, CylinderGeometry, type Group, InstancedMesh, MeshLambertMaterial, Object3D, ShaderMaterial, SphereGeometry, Vector3 } from "three";
import { createRng, uniform, type Rng } from "@/shared/lib/seeded-random";
import { brewOfCharm, type Charm } from "../gameplay/brews";
import type { AtmosphereUniforms } from "./atmosphere";
import { CHARM_GLOW, type BrewPalette } from "./brew-looks";
import { brewShape } from "./brews";
import { paint, type Piece } from "./painted";
import { shadeLambert } from "./shading";

/*
 * What the charms bring about, drawn, deciding nothing: the flowers a
 * garland charm sets blooming round camp, opening one after another from
 * the fire outwards and closing again as it fades; the charm post by the
 * fire, a forked stick the charms at work hang from in their linen pouches,
 * each with a soft glow of its own colour; and the hush round Elliott, a
 * few pale motes drifting about their feet. The lantern charm's fireflies
 * are the fireflies' own. How strongly each works comes from the scene,
 * read each frame.
 */

/** The flowers that bloom: storybook blossoms in four colours, and the green of their leaves. */
export const BLOOM_KINDS = ["bloom-pink", "bloom-white", "bloom-violet", "bloom-yellow"] as const;
export type BloomKind = (typeof BLOOM_KINDS)[number];

export interface BloomSpot {
  x: number;
  y: number;
  z: number;
  turn: number;
  size: number;
  kind: BloomKind;
  /** How late it opens, 0 (first, near the fire) to 1 (last, furthest out). */
  late: number;
}

/** One flower at life size on the origin: a stem, two leaves, five petals round a golden heart, drawn a little larger than life. */
export function bloomShape(kind: BloomKind, p: BrewPalette, rng: Rng): BufferGeometry {
  const height = uniform(rng, 0.16, 0.24);
  const stem = new CylinderGeometry(0.004, 0.006, height, 5);
  stem.translate(0, height / 2, 0);
  const pieces: Piece[] = [{ geometry: stem, colour: p["bloom-leaf"] }];
  for (const side of [-1, 1]) {
    const leaf = new SphereGeometry(0.03, 7, 4);
    leaf.scale(1.5, 0.22, 0.6);
    leaf.translate(side * 0.04, height * 0.3, 0);
    leaf.rotateZ(side * -0.4);
    pieces.push({ geometry: leaf, colour: p["bloom-leaf"].clone().multiplyScalar(uniform(rng, 0.9, 1.08)), shading: 0.3 });
  }
  for (let k = 0; k < 5; k++) {
    const petal = new SphereGeometry(0.032, 7, 4);
    petal.scale(1, 0.3, 0.62);
    petal.translate(0.03, 0, 0);
    petal.rotateZ(0.35);
    petal.rotateY((k / 5) * Math.PI * 2);
    petal.translate(0, height, 0);
    pieces.push({ geometry: petal, colour: p[kind].clone().multiplyScalar(uniform(rng, 0.94, 1.04)), shading: 0.2 });
  }
  const heart = new SphereGeometry(0.015, 8, 5);
  heart.translate(0, height + 0.006, 0);
  pieces.push({ geometry: heart, colour: kind === "bloom-yellow" ? p.honey : p["bloom-yellow"] });
  return paint(pieces).scale(1.7, 1.7, 1.7);
}

const BLOOM_DESIGNS = 3;

/** The flowers a garland charm opens round camp, each opening in turn as `strength` (0 to 1) rises. */
export function CampBlooms({ spots, strength, palette, atmosphere }: { spots: readonly BloomSpot[]; strength: () => number; palette: BrewPalette; atmosphere: AtmosphereUniforms }) {
  const meshes = useMemo(() => {
    const material = shadeLambert(new MeshLambertMaterial({ vertexColors: true }), "solid", atmosphere);
    const rng = createRng("hearthwood/blooms");
    const out = BLOOM_KINDS.flatMap((kind) =>
      Array.from({ length: BLOOM_DESIGNS }, (_, design) => {
        const mine = spots.filter((s, i) => s.kind === kind && i % BLOOM_DESIGNS === design);
        const mesh = new InstancedMesh(bloomShape(kind, palette, rng), material, Math.max(1, mine.length));
        mesh.count = mine.length;
        mesh.castShadow = true;
        mesh.frustumCulled = false;
        return { mesh, spots: mine };
      }),
    );
    return { material, out };
  }, [spots, palette, atmosphere]);
  useEffect(
    () => () => {
      meshes.material.dispose();
      for (const { mesh } of meshes.out) mesh.geometry.dispose();
    },
    [meshes],
  );
  const dummy = useMemo(() => new Object3D(), []);
  useFrame(() => {
    openBlooms(meshes.out, strength(), dummy);
  });
  return (
    <>
      {meshes.out.map(({ mesh }) => (
        <primitive key={mesh.uuid} object={mesh} />
      ))}
    </>
  );
}

/** The flowers this frame: each open as far as its turn has come. */
function openBlooms(designs: readonly { mesh: InstancedMesh; spots: readonly BloomSpot[] }[], strength: number, dummy: Object3D): void {
  for (const { mesh, spots } of designs) {
    spots.forEach((spot, i) => {
      // Each opens in its turn, from the fire outwards, and closes in the same order.
      const open = Math.min(1, Math.max(0, (strength - spot.late * 0.6) / 0.4));
      const grown = Math.max(0.001, open * open * (3 - 2 * open)) * spot.size;
      dummy.position.set(spot.x, spot.y - 0.01, spot.z);
      dummy.rotation.set(0, spot.turn, 0);
      dummy.scale.setScalar(grown);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.visible = strength > 0;
  }
}

const GLOW_VERTEX = /* glsl */ `
uniform float uHwTime;
uniform float uSize;
attribute float seed;
varying float vSeed;
void main() {
  vSeed = seed;
  vec4 view = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = uSize * (0.85 + 0.15 * sin(uHwTime * 2.3 + seed * 20.0)) * 300.0 / -view.z;
  gl_Position = projectionMatrix * view;
}
`;

const GLOW_FRAGMENT = /* glsl */ `
uniform vec3 uGlow;
uniform float uStrength;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = pow(max(1.0 - d, 0.0), 2.6) * uStrength;
  gl_FragColor = vec4(uGlow * a, a);
}
`;

function glowMaterial(atmosphere: AtmosphereUniforms, colour: Color, size: number): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uHwTime: atmosphere.uHwTime, uGlow: { value: colour }, uStrength: { value: 0 }, uSize: { value: size } },
    vertexShader: GLOW_VERTEX,
    fragmentShader: GLOW_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
}

function onePoint(seed: number): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(3), 3));
  g.setAttribute("seed", new BufferAttribute(new Float32Array([seed]), 1));
  return g;
}

/** Where the charms hang along the post's crossbar, in the post's own frame. */
const HOOKS: Record<Charm, number> = { bloom: -0.21, fireflies: -0.07, hush: 0.07, clearing: 0.21 };
const POST = { height: 1.15, bar: 0.56 } as const;
/** How much larger than life a hanging charm is drawn, and how far below the bar it hangs. */
const HANGING_LARGER = 1.8;
const DROP = 0.32;

/** A forked hazel stick pushed into the ground, with a crossbar: what the charms at work hang from. */
export function charmPostShape(p: BrewPalette): BufferGeometry {
  const post = new CylinderGeometry(0.018, 0.026, POST.height, 6);
  post.translate(0, POST.height / 2, 0);
  const bar = new CylinderGeometry(0.012, 0.012, POST.bar, 5);
  bar.rotateZ(Math.PI / 2);
  bar.translate(0, POST.height - 0.06, 0);
  const fork = new CylinderGeometry(0.008, 0.012, 0.16, 5);
  fork.rotateZ(-0.5);
  fork.translate(0.04, POST.height + 0.05, 0);
  return paint([
    { geometry: post, colour: p.stick, shading: 0.3 },
    { geometry: bar, colour: p.stick, shading: 0.2 },
    { geometry: fork, colour: p.stick, shading: 0.2 },
  ]);
}

/** The charms on the post this frame: those at work shown, swaying a little, glowing as strongly as they work. */
function hangCharms(charms: readonly { charm: Charm; glowMaterial: ShaderMaterial }[], groups: Partial<Record<Charm, Group | null>>, strengths: Record<Charm, number>, t: number): void {
  for (const c of charms) {
    const group = groups[c.charm];
    const strength = strengths[c.charm];
    if (group) {
      group.visible = strength > 0;
      group.rotation.z = Math.sin(t * 1.3 + HOOKS[c.charm] * 9) * 0.08;
    }
    c.glowMaterial.uniforms.uStrength.value = 0.5 * strength;
  }
}

/** The charm post by the fire, with every charm at work hanging from it in its pouch, glowing its own colour as strongly as it works. */
export function CharmPost({ at, turn, strengths, palette, atmosphere }: { at: { x: number; y: number; z: number }; turn: number; strengths: () => Record<Charm, number>; palette: BrewPalette; atmosphere: AtmosphereUniforms }) {
  const swing = useRef<Partial<Record<Charm, Group | null>>>({});
  const assets = useMemo(() => {
    const material = shadeLambert(new MeshLambertMaterial({ vertexColors: true }), "solid", atmosphere);
    const charms = (Object.keys(HOOKS) as Charm[]).map((charm, i) => ({
      charm,
      pouch: brewShape(brewOfCharm(charm), palette),
      glow: onePoint(i * 0.27),
      glowMaterial: glowMaterial(atmosphere, palette[CHARM_GLOW[charm]].clone(), 0.32),
    }));
    // The red thread each pouch hangs by, from the bar down to its tie.
    const thread = new CylinderGeometry(0.003, 0.003, DROP - 0.09 * HANGING_LARGER, 4);
    thread.translate(0, -(DROP - 0.09 * HANGING_LARGER) / 2, 0);
    return { material, post: charmPostShape(palette), thread: paint([{ geometry: thread, colour: palette.thread }]), charms };
  }, [palette, atmosphere]);
  useEffect(
    () => () => {
      assets.material.dispose();
      assets.post.dispose();
      assets.thread.dispose();
      for (const c of assets.charms) {
        c.pouch.dispose();
        c.glow.dispose();
        c.glowMaterial.dispose();
      }
    },
    [assets],
  );
  useFrame(() => {
    hangCharms(assets.charms, swing.current, strengths(), atmosphere.uHwTime.value);
  });
  return (
    <group position={[at.x, at.y, at.z]} rotation={[0, turn, 0]}>
      <mesh geometry={assets.post} material={assets.material} castShadow />
      {assets.charms.map((c) => (
        <group
          key={c.charm}
          ref={(g) => {
            swing.current[c.charm] = g;
          }}
          position={[HOOKS[c.charm], POST.height - 0.06, 0]}
          visible={false}
        >
          <mesh geometry={assets.thread} material={assets.material} />
          <mesh geometry={c.pouch} material={assets.material} position={[0, -DROP, 0]} scale={HANGING_LARGER} castShadow />
          <points geometry={c.glow} material={c.glowMaterial} position={[0, -0.22, 0]} renderOrder={6} frustumCulled={false} />
        </group>
      ))}
    </group>
  );
}

const MOTE_VERTEX = /* glsl */ `
uniform float uHwTime;
attribute float seed;
varying float vTwinkle;
void main() {
  float t = uHwTime * (0.2 + 0.15 * seed) + seed * 40.0;
  vec3 p = position + vec3(sin(t) * 0.5, 0.25 * sin(t * 1.3 + seed * 7.0) + fract(uHwTime * 0.06 + seed) * 0.8, cos(t * 0.9) * 0.5);
  vTwinkle = 0.55 + 0.45 * sin(uHwTime * (1.5 + seed) + seed * 30.0);
  vec4 view = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = clamp(70.0 / -view.z, 2.5, 22.0);
  gl_Position = projectionMatrix * view;
}
`;

const MOTE_FRAGMENT = /* glsl */ `
uniform vec3 uGlow;
uniform float uStrength;
varying float vTwinkle;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d) * vTwinkle * uStrength;
  gl_FragColor = vec4(uGlow * a * 1.4, a);
}
`;

const MOTES = 64;

/** The hush this frame: as bright as the charm works, about Elliott's feet. */
function driftHush(material: ShaderMaterial, group: Group | null, strength: number, at: Vector3): void {
  material.uniforms.uStrength.value = strength;
  if (group) {
    group.visible = strength > 0;
    group.position.copy(at);
  }
}

/** The hush round Elliott: pale motes drifting about their feet as strongly as the charm works. Its group is moved to Elliott by the scene. */
export function HushMotes({ follow, strength, palette, atmosphere }: { follow: () => Vector3; strength: () => number; palette: BrewPalette; atmosphere: AtmosphereUniforms }) {
  const group = useRef<Group>(null);
  const assets = useMemo(() => {
    const rng = createRng("hearthwood/hush");
    const positions = new Float32Array(MOTES * 3);
    const seeds = new Float32Array(MOTES);
    for (let i = 0; i < MOTES; i++) {
      const angle = rng.next() * Math.PI * 2;
      const r = uniform(rng, 0.4, 1.6);
      positions.set([Math.cos(angle) * r, uniform(rng, 0.1, 1.2), Math.sin(angle) * r], i * 3);
      seeds[i] = rng.next();
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(positions, 3));
    geometry.setAttribute("seed", new BufferAttribute(seeds, 1));
    const material = new ShaderMaterial({
      uniforms: { uHwTime: atmosphere.uHwTime, uGlow: { value: new Color().copy(palette.hush) }, uStrength: { value: 0 } },
      vertexShader: MOTE_VERTEX,
      fragmentShader: MOTE_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    return { geometry, material };
  }, [palette, atmosphere]);
  useEffect(
    () => () => {
      assets.geometry.dispose();
      assets.material.dispose();
    },
    [assets],
  );
  useFrame(() => {
    driftHush(assets.material, group.current, strength(), follow());
  });
  return (
    <group ref={group} visible={false}>
      <points geometry={assets.geometry} material={assets.material} renderOrder={4} frustumCulled={false} />
    </group>
  );
}
