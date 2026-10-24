"use client";

import { useEffect, useMemo } from "react";
import { BufferAttribute, BufferGeometry, DoubleSide } from "three";
import { abs, atan, attribute, cos, Discard, float, Fn, fract, If, length, min, mix, sign, sin, smoothstep, step, uniform, vec2, vec3 } from "three/tsl";
import type { Node, UniformNode } from "three/webgpu";
import { themeColor } from "@/shared/lib/three/theme-color";
import type { AtmosphereUniforms } from "./atmosphere";
import { diorama, type DioramaMaterial } from "./materials";
import { typed } from "./tsl";

/*
 * Butterflies dancing over the flowers, each two wing quads drawn on the
 * shared solid material: their flight (a wandering loop over their patch of
 * flowers, now and then settling on it to bask, wings slowly opening and
 * closing) and their wingbeat are placed in the vertex stage from
 * the clock, and the wings' shapes and patterns in their surface, by kind: the
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

const aSpot = typed<"vec3">(attribute("aSpot", "vec3"));
const aSeed = typed<"float">(attribute("aSeed", "float"));
const aKind = typed<"float">(attribute("aKind", "float"));
const aWing = typed<"vec2">(attribute("aWing", "vec2"));

/** Every butterfly's place from its seed and the clock: a slow loop over its flowers with a bob of its own, settling on them now and then. */
function flight(air: AtmosphereUniforms, about: Node<"float">): Node<"vec3"> {
  const time = air.uHwTime;
  const t = time.add(aSeed.mul(97));
  const cycle = fract(time.mul(0.045).add(aSeed.mul(3.7)));
  const landed = smoothstep(0.72, 0.78, cycle).mul(float(1).sub(smoothstep(0.94, 0.99, cycle)));
  const a = t.mul(0.43).add(aSeed.mul(6));
  const b = t.mul(0.31).add(aSeed.mul(3));
  const fly = vec3(
    sin(a).mul(1.6).add(sin(t.mul(1.1)).mul(0.3)),
    sin(t.mul(0.9).add(aSeed.mul(4))).mul(0.25).add(0.45).add(sin(t.mul(6.3)).mul(0.07)),
    cos(b).mul(1.6).add(cos(t.mul(0.97)).mul(0.3)),
  );
  const heading = atan(cos(a).mul(0.69).add(cos(t.mul(1.1)).mul(0.33)), sin(b).mul(-0.5).sub(sin(t.mul(0.97)).mul(0.29)));
  const centre = aSpot.add(mix(fly, vec3(0, 0.26, 0), landed));
  const beat = mix(sin(t.mul(17)).mul(0.85).add(0.1), sin(t.mul(1.4)).mul(0.55).add(0.55), landed);
  const reach = abs(aWing.x).mul(SPAN);
  const local = vec3(sign(aWing.x).mul(cos(beat)).mul(reach), sin(beat).mul(reach), aWing.y.mul(SPAN));
  const yaw = mix(heading, aSeed.mul(6.28), landed);
  const cy = cos(yaw);
  const sy = sin(yaw);
  const turned = vec3(cy.mul(local.x).add(sy.mul(local.z)), local.y, sy.negate().mul(local.x).add(cy.mul(local.z)));
  // Not on the wing now: folded away to nothing.
  return centre.add(turned.mul(step(aSeed, about)));
}

/** How far inside the wing a point lies: the forewing over the hindwing, both from the body. */
function wingInside(q: Node<"vec2">): Node<"float"> {
  const fore = length(q.sub(vec2(0.48, 0.2)).div(vec2(0.56, 0.38)));
  const hind = length(q.sub(vec2(0.36, -0.22)).div(vec2(0.4, 0.3)));
  return float(1).sub(min(fore, hind));
}

const constant = (token: string) => {
  const c = themeColor(token);
  return vec3(c.r, c.g, c.b);
};
const colourOf = (name: string) => constant(`--color-hearthwood-butterfly-${name}`);

/** The wings' shapes and patterns, by kind. */
function wings(): Node<"vec3"> {
  const brimstone = colourOf("brimstone");
  const tortoiseshell = colourOf("tortoiseshell");
  const peacock = colourOf("peacock");
  const blue = colourOf("blue");
  const dark = colourOf("dark");
  const eyespot = colourOf("eyespot");
  const pale = constant("--color-hearthwood-bird-pale");
  return Fn(() => {
    const q = vec2(abs(aWing.x), aWing.y);
    const inside = wingInside(q);
    Discard(inside.lessThan(0));
    const edge = smoothstep(0, 0.14, inside);
    const rim = float(1).sub(edge);
    const colour = vec3(0).toVar();
    If(aKind.lessThan(0.5), () => {
      // A brimstone: sulphur yellow, an orange dot on each wing.
      colour.assign(mix(brimstone, tortoiseshell, smoothstep(0.07, 0.05, length(q.sub(vec2(0.5, 0.12))))));
    })
      .ElseIf(aKind.lessThan(1.5), () => {
        // A small tortoiseshell: orange, black and yellow along the front edge, a dark border with blue spots.
        const front = smoothstep(0.42, 0.5, q.y).mul(step(0.2, q.x));
        const banded = mix(tortoiseshell, mix(dark, brimstone, step(0.5, fract(q.x.mul(3.2)))), front);
        const bordered = mix(banded, dark, rim);
        colour.assign(mix(bordered, eyespot, rim.mul(step(0.5, fract(q.x.mul(9).add(q.y.mul(9))))).mul(0.8)));
      })
      .ElseIf(aKind.lessThan(2.5), () => {
        // A peacock: deep red, an eyespot on each fore and hindwing, dark at the edges.
        const fore = length(q.sub(vec2(0.72, 0.3)));
        const hind = length(q.sub(vec2(0.48, -0.28)));
        const ringed = mix(peacock, dark, smoothstep(0.13, 0.11, fore).add(smoothstep(0.12, 0.1, hind)));
        const eyed = mix(ringed, eyespot, smoothstep(0.08, 0.06, fore).add(smoothstep(0.07, 0.05, hind)));
        colour.assign(mix(mix(eyed, pale, smoothstep(0.035, 0.02, fore)), dark.mul(1.3), rim));
      })
      .Else(() => {
        // A common blue: blue fading paler to a white fringe.
        colour.assign(mix(pale, blue, edge));
      });
    // The body down the middle.
    return mix(colour, dark, smoothstep(0.06, 0.03, q.x));
  })();
}

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

/** The share of butterflies on the wing (0 to 1), shared by every butterfly in an air, which the scene sets. */
export interface ButterflyDay {
  uAbout: UniformNode<"float", number>;
}

export function makeButterflyDay(share = 0): ButterflyDay {
  return { uAbout: uniform(share) };
}

const materials = new WeakMap<AtmosphereUniforms, WeakMap<ButterflyDay, DioramaMaterial>>();

/** The butterflies' one material in an air and a day, shared by every patch of them. */
function butterflyMaterial(air: AtmosphereUniforms, day: ButterflyDay): DioramaMaterial {
  let byDay = materials.get(air);
  if (!byDay) {
    byDay = new WeakMap();
    materials.set(air, byDay);
  }
  let material = byDay.get(day);
  if (!material) {
    material = diorama("solid", air, { side: DoubleSide }, { position: flight(air, day.uAbout), surface: wings() });
    byDay.set(day, material);
  }
  return material;
}

export function Butterflies({ spots, atmosphere, day }: { spots: readonly ButterflySpot[]; atmosphere: AtmosphereUniforms; day: ButterflyDay }) {
  const geometry = useMemo(() => butterflyGeometry(spots), [spots]);
  const material = useMemo(() => butterflyMaterial(atmosphere, day), [atmosphere, day]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} material={material} frustumCulled={false} castShadow />;
}
