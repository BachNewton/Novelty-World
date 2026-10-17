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
  type Mesh,
  type PointLight,
} from "three";
import { createRng, uniform } from "@/shared/lib/seeded-random";
import { sample } from "../../world/grid";
import type { Valley } from "../../world/valley";
import { breatheAtmosphere, type AtmosphereUniforms } from "./atmosphere";
import type { ValleyClock } from "./clock";
import { paint, type Piece } from "./painted";
import type { Palette } from "./palette";

/*
 * Camp: a ring of stones round a fire of crossed logs, two logs to sit on, a
 * bedroll and a pot. The fire is a few soft flame shells that lick upwards,
 * embers rising and fading, a glow round it that matters most at night, and
 * a flickering light on everything near.
 */

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

function campGeometry(palette: Palette, rng: ReturnType<typeof createRng>): BufferGeometry {
  const t = palette.things;
  const pieces: Piece[] = [];
  for (let s = 0; s < 10; s++) {
    const angle = (s / 10) * Math.PI * 2;
    const stone = new IcosahedronGeometry(uniform(rng, 0.15, 0.21), 0);
    stone.scale(1.2, 0.7, 1);
    stone.rotateY(angle);
    stone.translate(Math.cos(angle) * 0.72, 0.07, Math.sin(angle) * 0.72);
    pieces.push({ geometry: stone, colour: t.rock, shading: 0.4 });
  }
  for (let l = 0; l < 5; l++) {
    const angle = (l / 5) * Math.PI * 2 + 0.3;
    const log = new CylinderGeometry(0.06, 0.075, 0.95, 6);
    log.translate(0, 0.47, 0);
    log.rotateZ(1.05);
    log.rotateY(angle);
    log.translate(Math.cos(angle) * 0.46, 0, -Math.sin(angle) * 0.46);
    pieces.push({ geometry: log, colour: t.log, shading: 0.3 });
  }
  for (const [angle, length] of [
    [0.4, 1.9],
    [2.6, 1.6],
  ] as const) {
    const seat = new CylinderGeometry(0.2, 0.22, length, 9);
    seat.rotateZ(Math.PI / 2);
    seat.rotateY(angle + Math.PI / 2);
    seat.translate(Math.cos(angle) * 2.4, 0.18, Math.sin(angle) * 2.4);
    pieces.push({ geometry: seat, colour: t.log, shading: 0.4 });
  }
  const bedroll = new CylinderGeometry(0.2, 0.2, 1.1, 10);
  bedroll.rotateZ(Math.PI / 2);
  bedroll.rotateY(-1.1);
  bedroll.translate(Math.cos(4.3) * 3.2, 0.18, Math.sin(4.3) * 3.2);
  pieces.push({ geometry: bedroll, colour: t["witch-bedroll"], shading: 0.3 });
  const blanket = new BoxGeometry(1.0, 0.08, 1.8);
  blanket.rotateY(-1.1);
  blanket.translate(Math.cos(4.0) * 3.6, 0.04, Math.sin(4.0) * 3.6);
  pieces.push({ geometry: blanket, colour: t["witch-scarf"] });
  for (let leg = 0; leg < 3; leg++) {
    const angle = (leg / 3) * Math.PI * 2;
    const rod = new CylinderGeometry(0.018, 0.018, 1.5, 4);
    rod.translate(0, 0.75, 0);
    rod.rotateZ(0.32);
    rod.rotateY(angle);
    rod.translate(Math.cos(angle) * 0.62, 0, -Math.sin(angle) * 0.62);
    pieces.push({ geometry: rod, colour: t.bark });
  }
  const pot = new SphereGeometry(0.2, 10, 6, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.65);
  pot.translate(0, 1.05, 0);
  pieces.push({ geometry: pot, colour: t["witch-hat"], shading: 0.5 });
  const rim = new TorusGeometry(0.16, 0.02, 4, 12);
  rim.rotateX(Math.PI / 2);
  rim.translate(0, 1.15, 0);
  pieces.push({ geometry: rim, colour: t["witch-hat"] });
  return paint(pieces);
}

/** The fire this frame: its light's flicker, the flames' strength, and the glow, wider at night. */
function burn(fire: { flames: ShaderMaterial[]; glowMaterial: ShaderMaterial }, clock: ValleyClock, light: PointLight | null, glow: Mesh | null): void {
  if (light) light.intensity = FIRE_LIGHT * clock.light.fire * clock.flicker;
  for (const m of fire.flames) m.uniforms.uStrength.value = 0.75 + 0.25 * clock.flicker;
  fire.glowMaterial.uniforms.uStrength.value = 0.55 * clock.light.fire * clock.flicker;
  glow?.scale.setScalar(2.6 + 2.4 * clock.light.night);
}

export function Campfire({ valley, palette, atmosphere, clock }: { valley: Valley; palette: Palette; atmosphere: AtmosphereUniforms; clock: ValleyClock }) {
  const light = useRef<PointLight>(null);
  const glow = useRef<Mesh>(null);
  const { x, z } = valley.camp;
  const y = sample(valley.heights, x, z);
  const assets = useMemo(() => {
    const rng = createRng(`${valley.seed}/camp-things`);
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
      camp: campGeometry(palette, rng),
      campMaterial: breatheAtmosphere(new MeshLambertMaterial({ vertexColors: true }), atmosphere),
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
  }, [valley.seed, palette, atmosphere]);

  useEffect(
    () => () => {
      assets.camp.dispose();
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
    burn(assets, clock, light.current, glow.current);
  });

  return (
    <group position={[x, y, z]}>
      <mesh geometry={assets.camp} material={assets.campMaterial} castShadow receiveShadow />
      <mesh geometry={assets.flame} material={assets.flames[0]} position={[0, 0.55, 0]} renderOrder={2} />
      <mesh geometry={assets.flameSmall} material={assets.flames[1]} position={[0.12, 0.4, 0.05]} renderOrder={2} />
      <mesh geometry={assets.flameSmall} material={assets.flames[2]} position={[-0.1, 0.38, -0.08]} renderOrder={2} />
      <points geometry={assets.embers} material={assets.emberMaterial} renderOrder={3} frustumCulled={false} />
      <mesh ref={glow} geometry={assets.glow} material={assets.glowMaterial} position={[0, 0.7, 0]} renderOrder={4} frustumCulled={false} />
      <pointLight ref={light} color={assets.firelight} position={[0, 0.9, 0]} distance={26} decay={2} />
    </group>
  );
}
