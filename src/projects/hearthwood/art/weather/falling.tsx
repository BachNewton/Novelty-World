"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { BufferAttribute, BufferGeometry, Color, ShaderMaterial, Vector3, type Mesh } from "three";
import type { AtmosphereUniforms } from "../atmosphere";
import type { WeatherNow } from "./now";

/*
 * What falls from the sky, round the camera: a box of drops or flakes
 * that follows the camera and wraps round it, so the camera is always in
 * the middle of the fall wherever it goes, and nothing is moved on the CPU.
 * Each is a small quad turned to the camera, drawn in the vertex shader from
 * its own seed: where in the box it falls, how fast, how it sways. Rain is
 * a streak along the way it falls, slanted by the wind; snow is a soft
 * round flake drifting and swaying down. Both are lit by the light of the
 * hour (the sky's and the sun's or moon's light on a surface), so rain is
 * bright by day and dim and blue at night, and a flash of lightning shows
 * every drop. How many fall is how hard it rains or snows: the rest of the
 * box is simply not drawn.
 */

export interface FallingKind {
  /** How many at the heaviest. */
  count: number;
  /** The box round the camera they fall in, in metres: across, and up and down. */
  box: { across: number; tall: number };
  /** Metres a second they fall, at the slowest and fastest. */
  fall: [number, number];
  /** How far a drop is drawn along its fall, against its width, and its width in metres. */
  streak: number;
  width: number;
  /** How much the wind carries them, against its own speed. */
  carried: number;
  /** How far a flake sways from side to side, in metres. */
  sway: number;
  /** How opaque one is, at most. */
  opacity: number;
  /** Which of the weather's falls it is: rain or snow. */
  share: (now: WeatherNow) => number;
}

const VERTEX = /* glsl */ `
uniform float uTime;
uniform vec3 uCentre;
uniform vec2 uBox;
uniform vec2 uFall;
uniform vec3 uWind;
uniform float uStreak;
uniform float uWidth;
uniform float uSway;
attribute vec4 seed;
attribute vec2 corner;
varying vec2 vCorner;
varying float vFade;

void main() {
  float speed = mix(uFall.x, uFall.y, seed.w);
  vec3 velocity = vec3(uWind.x, -speed, uWind.z);
  vec3 start = (seed.xyz - 0.5) * vec3(uBox.x, uBox.y, uBox.x);
  vec3 p = start + velocity * uTime;
  float phase = uTime * (0.6 + seed.w) + seed.x * 40.0;
  p.xz += vec2(sin(phase), cos(phase * 0.8)) * uSway;
  // Wrapped into the box round the camera, so the fall never runs out.
  vec3 box = vec3(uBox.x, uBox.y, uBox.x);
  p = mod(p - uCentre + box * 0.5, box) - box * 0.5 + uCentre;

  vec3 toEye = normalize(cameraPosition - p);
  vec3 along = normalize(velocity);
  vec3 side = normalize(cross(along, toEye));
  if (uStreak < 1.5) {
    // A flake faces the camera square.
    side = normalize(cross(vec3(0.0, 1.0, 0.0), toEye));
    along = normalize(cross(toEye, side));
  }
  vec3 world = p + side * corner.x * uWidth + along * corner.y * uWidth * uStreak;
  vCorner = corner;
  // Thinner at the edges of the box, so it has no edge; none right at the eye, where one would fill the view.
  float away = length(p - cameraPosition);
  vFade = (1.0 - smoothstep(0.35, 0.5, max(abs(p.x - uCentre.x), abs(p.z - uCentre.z)) / uBox.x)) * smoothstep(0.4, 1.4, away);
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
uniform vec3 uColour;
uniform vec3 uLight;
uniform float uOpacity;
uniform float uStreak;
varying vec2 vCorner;
varying float vFade;

void main() {
  float shape = uStreak < 1.5
    ? smoothstep(1.0, 0.2, length(vCorner))
    : smoothstep(1.0, 0.0, abs(vCorner.x)) * smoothstep(1.0, 0.3, abs(vCorner.y));
  float a = shape * vFade * uOpacity;
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColour * uLight, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

function fallingGeometry(kind: FallingKind): BufferGeometry {
  const seeds = new Float32Array(kind.count * 4 * 4);
  const corners = new Float32Array(kind.count * 4 * 2);
  const index = new Uint32Array(kind.count * 6);
  // A fixed sequence, so the fall is the same every visit: each drop's own spot in the box and its own pace.
  let state = 0x9e3779b9;
  const next = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
  for (let i = 0; i < kind.count; i++) {
    const seed = [next(), next(), next(), next()];
    [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ].forEach(([x, y], c) => {
      seeds.set(seed, (i * 4 + c) * 4);
      corners.set([x, y], (i * 4 + c) * 2);
    });
    index.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
  }
  const geometry = new BufferGeometry();
  // Three wants a position; the vertex shader places every corner from its seed.
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(kind.count * 4 * 3), 3));
  geometry.setAttribute("seed", new BufferAttribute(seeds, 4));
  geometry.setAttribute("corner", new BufferAttribute(corners, 2));
  geometry.setIndex(new BufferAttribute(index, 1));
  return geometry;
}

const flash = new Color();

export function Falling({ kind, colour, now, atmosphere, lightning }: { kind: FallingKind; colour: Color; now: WeatherNow; atmosphere: AtmosphereUniforms; lightning: Color }) {
  const mesh = useRef<Mesh>(null);
  const assets = useMemo(() => {
    const uniforms = {
      uTime: atmosphere.uHwTime,
      uCentre: { value: new Vector3() },
      uBox: { value: [kind.box.across, kind.box.tall] },
      uFall: { value: kind.fall },
      uWind: { value: new Vector3() },
      uStreak: { value: kind.streak },
      uWidth: { value: kind.width },
      uSway: { value: kind.sway },
      uColour: { value: colour },
      uLight: { value: new Color() },
      uOpacity: { value: kind.opacity },
    };
    return {
      uniforms,
      geometry: fallingGeometry(kind),
      material: new ShaderMaterial({ uniforms, vertexShader: VERTEX, fragmentShader: FRAGMENT, transparent: true, depthWrite: false }),
    };
  }, [kind, colour, atmosphere]);
  useEffect(
    () => () => {
      assets.geometry.dispose();
      assets.material.dispose();
    },
    [assets],
  );
  useFrame(({ camera }) => {
    const { uniforms, geometry } = assets;
    const share = kind.share(now);
    geometry.setDrawRange(0, Math.round(kind.count * share) * 6);
    if (mesh.current) mesh.current.visible = share > 0.002;
    uniforms.uCentre.value.copy(camera.position);
    const { wind } = now.weather;
    uniforms.uWind.value.set(wind.x * wind.speed * kind.carried, 0, wind.z * wind.speed * kind.carried);
    uniforms.uLight.value
      .copy(atmosphere.uHwSkyLight.value)
      .add(atmosphere.uHwSunLight.value)
      .add(flash.copy(lightning).multiplyScalar(now.flash * 2));
  });
  return <mesh ref={mesh} geometry={assets.geometry} material={assets.material} frustumCulled={false} renderOrder={4} />;
}
