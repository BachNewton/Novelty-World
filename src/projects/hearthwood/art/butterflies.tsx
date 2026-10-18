"use client";

import { useEffect, useMemo } from "react";
import { BufferAttribute, BufferGeometry, Color, DoubleSide, MeshLambertMaterial } from "three";
import { themeColor } from "@/shared/lib/three/theme-color";
import type { AtmosphereUniforms } from "./atmosphere";
import { shadeLambert } from "./shading";

/*
 * Butterflies dancing over the flowers, each two wing quads drawn on the
 * shared solid material: their flight (a wandering loop over their patch of
 * flowers, now and then settling on it to bask, wings slowly opening and
 * closing) and their wingbeat are worked out in the vertex shader from the
 * clock, and the wings' shapes and patterns in the fragment's, by kind: the
 * brimstone's sulphur yellow, the small tortoiseshell's orange with its
 * black and yellow front edge and blue-spotted border, the peacock's red
 * with its eyespots, and the common blue's blue edged with white. How many
 * are on the wing is a share (0 to 1) the scene sets from the season, the
 * hour and the weather; each butterfly flies while its own seed is under it.
 */

export const BUTTERFLY_KINDS = ["brimstone", "tortoiseshell", "peacock", "blue"] as const;

/** One butterfly: the flowers it dances over, its seed (0 to 1) and its kind (an index into `BUTTERFLY_KINDS`). */
export interface ButterflySpot {
  x: number;
  y: number;
  z: number;
  seed: number;
  kind: number;
}

/** Half the wingspan, in metres: a little larger than life, as the small forage is. */
const SPAN = 0.07;

const VERTEX_HEAD = /* glsl */ `
attribute vec3 aSpot;
attribute float aSeed;
attribute float aKind;
attribute vec2 aWing;
uniform float uAbout;
varying vec2 vWing;
varying float vKind;
`;

// Every butterfly's path from its seed: a slow loop over its flowers with a bob of its own, settling on them now and then.
const VERTEX = /* glsl */ `
  vWing = aWing;
  vKind = aKind;
  float t = uHwTime + aSeed * 97.0;
  float cycle = fract(uHwTime * 0.045 + aSeed * 3.7);
  float landed = smoothstep(0.72, 0.78, cycle) * (1.0 - smoothstep(0.94, 0.99, cycle));
  vec3 fly = vec3(sin(t * 0.43 + aSeed * 6.0) * 1.6 + sin(t * 1.1) * 0.3, 0.45 + 0.25 * sin(t * 0.9 + aSeed * 4.0) + 0.07 * sin(t * 6.3), cos(t * 0.31 + aSeed * 3.0) * 1.6 + cos(t * 0.97) * 0.3);
  vec3 velocity = vec3(cos(t * 0.43 + aSeed * 6.0) * 0.69 + cos(t * 1.1) * 0.33, 0.0, -sin(t * 0.31 + aSeed * 3.0) * 0.5 - sin(t * 0.97) * 0.29);
  vec3 rest = vec3(0.0, 0.26, 0.0);
  vec3 centre = aSpot + mix(fly, rest, landed);
  float beat = mix(sin(t * 17.0) * 0.85 + 0.1, 0.55 + 0.55 * sin(t * 1.4), landed);
  float side = sign(aWing.x);
  float reach = abs(aWing.x) * ${SPAN.toFixed(4)};
  vec3 local = vec3(side * cos(beat) * reach, sin(beat) * reach, aWing.y * ${SPAN.toFixed(4)});
  float yaw = mix(atan(velocity.x, velocity.z), aSeed * 6.28, landed);
  float cy = cos(yaw), sy = sin(yaw);
  local = vec3(cy * local.x + sy * local.z, local.y, -sy * local.x + cy * local.z);
  // Not on the wing now: folded away to nothing.
  float flying = step(aSeed, uAbout);
  transformed = centre + local * flying;
`;

const FRAGMENT_HEAD = /* glsl */ `
uniform vec3 uBrimstone;
uniform vec3 uTortoiseshell;
uniform vec3 uPeacock;
uniform vec3 uBlue;
uniform vec3 uDark;
uniform vec3 uEyespot;
uniform vec3 uPale;
varying vec2 vWing;
varying float vKind;

// How far inside the wing a point lies: the forewing over the hindwing, both from the body.
float wing(vec2 q) {
  float fore = length((q - vec2(0.48, 0.2)) / vec2(0.56, 0.38));
  float hind = length((q - vec2(0.36, -0.22)) / vec2(0.4, 0.3));
  return 1.0 - min(fore, hind);
}
`;

const SURFACE = /* glsl */ `
  vec2 q = vec2(abs(vWing.x), vWing.y);
  float inside = wing(q);
  if (inside < 0.0) discard;
  float edge = smoothstep(0.0, 0.14, inside);
  vec3 colour = uBrimstone;
  if (vKind < 0.5) {
    // A brimstone: sulphur yellow, an orange dot on each wing.
    colour = mix(uBrimstone, uTortoiseshell, smoothstep(0.07, 0.05, length(q - vec2(0.5, 0.12))));
  } else if (vKind < 1.5) {
    // A small tortoiseshell: orange, black and yellow along the front edge, a dark border with blue spots.
    colour = uTortoiseshell;
    float front = smoothstep(0.42, 0.5, q.y) * step(0.2, q.x);
    colour = mix(colour, mix(uDark, uBrimstone, step(0.5, fract(q.x * 3.2))), front);
    colour = mix(colour, uDark, 1.0 - edge);
    colour = mix(colour, uEyespot, (1.0 - edge) * step(0.5, fract(q.x * 9.0 + q.y * 9.0)) * 0.8);
  } else if (vKind < 2.5) {
    // A peacock: deep red, an eyespot on each fore and hindwing, dark at the edges.
    colour = uPeacock;
    float fore = length(q - vec2(0.72, 0.3));
    float hind = length(q - vec2(0.48, -0.28));
    colour = mix(colour, uDark, smoothstep(0.13, 0.11, fore) + smoothstep(0.12, 0.1, hind));
    colour = mix(colour, uEyespot, smoothstep(0.08, 0.06, fore) + smoothstep(0.07, 0.05, hind));
    colour = mix(colour, uPale, smoothstep(0.035, 0.02, fore));
    colour = mix(colour, uDark * 1.3, 1.0 - edge);
  } else {
    // A common blue: blue fading paler to a white fringe.
    colour = mix(uPale, uBlue, edge);
  }
  // The body down the middle.
  colour = mix(colour, uDark, smoothstep(0.06, 0.03, q.x));
  diffuseColor.rgb = colour;
`;

function butterflyGeometry(spots: readonly ButterflySpot[]): BufferGeometry {
  const corners = [
    [0, -0.6],
    [1.15, -0.6],
    [1.15, 0.65],
    [0, 0.65],
  ];
  const n = spots.length * 8;
  const wing = new Float32Array(n * 2);
  const spot = new Float32Array(n * 3);
  const seed = new Float32Array(n);
  const kind = new Float32Array(n);
  const index: number[] = [];
  spots.forEach((s, b) => {
    for (let w = 0; w < 2; w++) {
      const side = w === 0 ? 1 : -1;
      const base = b * 8 + w * 4;
      corners.forEach(([x, z], c) => {
        wing.set([x * side, z], (base + c) * 2);
        spot.set([s.x, s.y, s.z], (base + c) * 3);
        seed[base + c] = s.seed;
        kind[base + c] = s.kind;
      });
      index.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  });
  const geometry = new BufferGeometry();
  // Three needs a position to draw; the shader places every vertex itself.
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(n * 3), 3));
  geometry.setAttribute("normal", new BufferAttribute(new Float32Array(n * 3).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  geometry.setAttribute("aWing", new BufferAttribute(wing, 2));
  geometry.setAttribute("aSpot", new BufferAttribute(spot, 3));
  geometry.setAttribute("aSeed", new BufferAttribute(seed, 1));
  geometry.setAttribute("aKind", new BufferAttribute(kind, 1));
  geometry.setIndex(index);
  return geometry;
}

/** The share of butterflies on the wing, shared by every butterfly material, which the scene sets. */
export interface ButterflyDay {
  uAbout: { value: number };
}

export function makeButterflyDay(): ButterflyDay {
  return { uAbout: { value: 0 } };
}

export function Butterflies({ spots, atmosphere, day }: { spots: readonly ButterflySpot[]; atmosphere: AtmosphereUniforms; day: ButterflyDay }) {
  const geometry = useMemo(() => butterflyGeometry(spots), [spots]);
  const material = useMemo(() => {
    const colour = (name: string) => ({ value: new Color().copy(themeColor(`--color-hearthwood-butterfly-${name}`)) });
    return shadeLambert(new MeshLambertMaterial({ side: DoubleSide }), "solid", atmosphere, {
      key: "hearthwood-butterflies",
      uniforms: {
        uAbout: day.uAbout,
        uBrimstone: colour("brimstone"),
        uTortoiseshell: colour("tortoiseshell"),
        uPeacock: colour("peacock"),
        uBlue: colour("blue"),
        uDark: colour("dark"),
        uEyespot: colour("eyespot"),
        uPale: { value: new Color().copy(themeColor("--color-hearthwood-bird-pale")) },
      },
      vertexHead: VERTEX_HEAD,
      vertex: VERTEX,
      fragmentHead: FRAGMENT_HEAD,
      surface: SURFACE,
    });
  }, [atmosphere, day]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);
  return <mesh geometry={geometry} material={material} frustumCulled={false} />;
}
