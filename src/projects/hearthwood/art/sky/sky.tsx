"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { BackSide, Color, Matrix3, SphereGeometry, Vector3, type Mesh } from "three";
import { dot, float, length, max, mix, modelViewProjection, pow, smoothstep, uniform, vec2, vec4 } from "three/tsl";
import { NodeMaterial, type Node, type UniformNode } from "three/webgpu";
import { liveFeatures, type FeatureSwitches } from "../../features";
import { hazeColour, type AtmosphereUniforms } from "../atmosphere";
import type { FeatureArt, StageContext, Stages } from "../feature-art";
import { FEATURE_ART } from "../features";
import type { Palette } from "../palette";
import { colourUniform, typed } from "../tsl";
import { skyDirection } from "./sky-nodes";

/*
 * The sky's dome round the camera: a designed sky, not a physical one. The
 * palette's gradient for the moment, from the haze at the horizon (so the
 * land melts into it) up to the moment's own sky overhead, warmed in a
 * broad glow towards the sun while it is low and just after it has set,
 * and a soft sun disc with a glow round it. Below the horizon, and in a
 * thin band over it, it is the land's own haze (`hazeColour`), so the far
 * land and the sky's foot meet in one air.
 *
 * Everything else drawn in it is a `colour` stage of a feature on, for the
 * "sky" kind (see `feature-art.ts`): the stars, the Milky Way, the aurora,
 * the moon, the rainbow, and the weather's clouds, each composed over the
 * gradient in the features' order.
 *
 * It is drawn last among the opaque things, on the far plane and tested
 * against what was drawn, so it costs only the pixels nothing covers.
 */

const DOME_RADIUS = 1200;

export interface SkyUniforms {
  /** The sky overhead: what the water mirrors. */
  uSky: UniformNode<"vec3", Color>;
  /** Where the sun is, day or night (the key light, `uHwSunDir`, is the moon's by night). */
  uSunDir: UniformNode<"vec3", Vector3>;
  uMoonDir: UniformNode<"vec3", Vector3>;
  /** How much of the night sky shows: fireflies over the meadow. */
  uNight: UniformNode<"float", number>;
  /** The sun's disc, coloured and dimmed by the air it shines through; black once it has set. */
  uSunDisc: UniformNode<"vec3", Color>;
  /** The warm glow round the sun, its colour times its strength: strongest low in the sky and through the first of the twilight. */
  uSunGlow: UniformNode<"vec3", Color>;
  /** The sphere of the stars: its columns are the celestial axes (the March equinox's point, right ascension 90°, the pole) in the world's. */
  uCelestial: UniformNode<"mat3", Matrix3>;
  /** How wide a pixel is, in radians: what the sky draws round to, so nothing in it is finer than a pixel. */
  uSkyPixel: UniformNode<"float", number>;
}

/** The sky's uniforms; `palette` gives the sun disc's own colour, which the day's light dims and colours. */
export function makeSkyUniforms(palette: Palette): SkyUniforms {
  return {
    uSky: colourUniform(),
    uSunDir: uniform(new Vector3(0, 1, 0)),
    uMoonDir: uniform(new Vector3(0, 1, 0)),
    uNight: uniform(0),
    uSunDisc: colourUniform(palette.things["sun-disc"].clone()),
    uSunGlow: colourUniform(),
    uCelestial: uniform(new Matrix3()),
    uSkyPixel: uniform(0.001),
  };
}

/** The sun's disc, as the cosine of its angular radius (drawn about three times life) and the soft edge round it. */
const DISC_COS = 0.99965;
const DISC_EDGE = 0.00012;

/**
 * The sky's colour along a direction, sun disc aside: the gradient, the
 * glow towards the sun and the haze at its foot. The dome draws it, and
 * anything that shows the sky (the water's mirror) takes the same.
 */
export function skyAlong(air: AtmosphereUniforms, sky: SkyUniforms, dir: Node<"vec3">): Node<"vec3"> {
  const up = max(dir.y, 0);
  const gradient = mix(air.uHwHaze, sky.uSky, pow(smoothstep(0, 0.7, up), 0.65));
  const toSun = max(dot(dir, sky.uSunDir), 0);
  // A broad warm band along the horizon on the sun's side, and a tighter glow round the sun itself.
  const flat = vec2(dir.x, dir.z).div(max(length(vec2(dir.x, dir.z)), 1e-4));
  const sunFlat = vec2(sky.uSunDir.x, sky.uSunDir.z).div(max(length(vec2(sky.uSunDir.x, sky.uSunDir.z)), 1e-4));
  const sideways = max(dot(flat, sunFlat), 0);
  const band = pow(sideways, 3)
    .mul(pow(float(1).sub(up), 4))
    .mul(0.55);
  const glow = pow(toSun, 6).mul(0.45).add(pow(toSun, 48).mul(0.6));
  const warm = gradient.add(sky.uSunGlow.mul(band.add(glow)));
  // The land's haze lies over the sky's foot, so the far land and the sky meet in one air.
  const foot = float(1).sub(smoothstep(-0.01, 0.09, dir.y));
  return mix(warm, hazeColour(air, dir), foot.mul(0.85));
}

type ColourStep = NonNullable<Stages["colour"]>;

/** The dome's material: the sky's colour with the colour stages of every feature on for the sky, unlit. */
class SkyMaterial extends NodeMaterial {
  private stages: ColourStep[] = [];
  private built = false;

  constructor(
    private readonly air: AtmosphereUniforms,
    private readonly sky: SkyUniforms,
    private readonly switches: FeatureSwitches = liveFeatures(),
    private readonly art: readonly FeatureArt[] = FEATURE_ART,
  ) {
    super();
    this.lights = false;
    this.fog = false;
    this.side = BackSide;
    this.depthWrite = false;
    // On the far plane (0 in the reversed depth buffer), so the depth test leaves it only the pixels nothing covers.
    const clip = typed<"vec4">(modelViewProjection);
    this.vertexNode = vec4(clip.x, clip.y, 0, clip.w);
    this.rebuild();
    const off = switches.subscribe(() => this.rebuild());
    this.addEventListener("dispose", off);
  }

  private rebuild(): void {
    const stages = this.art.filter((a) => this.switches.isOn(a.feature)).flatMap((a) => (a.stages ?? []).flatMap((s) => (s.kinds.includes("sky") && s.colour ? [s.colour] : [])));
    const unchanged = stages.length === this.stages.length && stages.every((s, i) => s === this.stages[i]);
    if (this.built && unchanged) return;
    this.built = true;
    this.stages = stages;
    const dir = skyDirection();
    const sky = this.sky;
    const toSun = dot(dir, sky.uSunDir);
    const disc = smoothstep(DISC_COS - DISC_EDGE, DISC_COS + DISC_EDGE, toSun);
    // Darker towards its rim, as the sun is.
    const limb = smoothstep(DISC_COS - DISC_EDGE, 1, toSun)
      .mul(0.35)
      .add(0.65);
    const base: Node<"vec3"> = mix(skyAlong(this.air, sky, dir), sky.uSunDisc.mul(limb), disc.mul(smoothstep(-0.03, 0.01, dir.y)));
    const context: StageContext = { kind: "sky", air: this.air };
    const colour = stages.reduce((c, step) => step(c, context), base);
    this.colorNode = vec4(colour, 1);
    this.needsUpdate = true;
  }
}

export function Sky({ atmosphere, sky }: { atmosphere: AtmosphereUniforms; sky: SkyUniforms }) {
  const dome = useRef<Mesh>(null);
  const assets = useMemo(
    () => ({
      geometry: new SphereGeometry(DOME_RADIUS, 48, 24),
      material: new SkyMaterial(atmosphere, sky),
    }),
    [atmosphere, sky],
  );
  useEffect(
    () => () => {
      assets.geometry.dispose();
      assets.material.dispose();
    },
    [assets],
  );
  useFrame(({ camera }) => {
    dome.current?.position.copy(camera.position);
  });
  return <mesh ref={dome} geometry={assets.geometry} material={assets.material} renderOrder={100} frustumCulled={false} />;
}
