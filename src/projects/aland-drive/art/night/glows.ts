import { AdditiveBlending, BufferAttribute, DataTexture, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, MeshBasicNodeMaterial, NearestFilter, RedFormat, type Color } from "three/webgpu";
import { atan, attribute, cameraPosition, cameraProjectionMatrix, cameraViewMatrix, float, fract, int, ivec2, max, mix, positionGeometry, screenSize, select, sin, smoothstep, textureLoad, uv, varying, vec4 } from "three/tsl";
import { rhythmRow, type Rhythm } from "./characteristic";
import type { F, Night } from "./night";

/*
 * Every point of light in one draw: a street lamp's lantern, a harbour's lamps, a buoy's flash, a sectored lighthouse, a
 * car's lamps. Each is a quad facing the eye, added to what's behind it, with a depth test so a hill or a house hides
 * it, and no depth written. There are no lights: nothing here touches any other surface.
 *
 * A light's rhythm is a row of a small texture, read in the vertex shader, so a flash costs a load per corner and
 * nothing per pixel. A light out of its sector, past its reach or between flashes is a quad of no size.
 */

const RHYTHM_SAMPLES = 512;
/** Fades over the last of a light's reach. */
const REACH_FADE_FROM = 0.7;
/** Pulled towards the eye, so the lamp's own head doesn't cut its glow. */
const TOWARDS_EYE_M = 0.7;
const TAU = Math.PI * 2;
/** A streak on the water, in lengths of the light's size. */
const STREAK_LONG = 6;
const STREAK_WIDE = 0.3;
const ROUND = 0;
const STREAK = 2;
const FLOATS_A_VEC = 4;
const VECS = 4;
const AROUND_DEG = 400;

export interface GlowInstance {
  x: number;
  y: number;
  z: number;
  /** Across the halo near to, in metres. */
  sizeM: number;
  /** Never smaller on screen than this many pixels, so a far light is still a point. */
  minPixels: number;
  colour: Color;
  brightness: number;
  reachM: number;
  /** A row of the sheet of rhythms, or -1 for a steady light. */
  rhythm: number;
  periodS: number;
  /** Shifts it through its period, in shares of it. */
  phase: number;
  /** Grid bearings the eye may look along towards the light, clockwise from north, degrees; `toDeg` under `fromDeg` wraps. Leave out for all round. */
  fromDeg?: number;
  toDeg?: number;
  /** Takes its flash from the eye's bearing, as a turning beam shows it. */
  turning?: boolean;
  /** How late it strikes, as a share of `lampsOn`: lamps don't all come on at once. */
  strikes?: number;
  /** A reflection hanging down from here on the water, rather than a round glow. */
  streak?: boolean;
}

function writeGlow(columns: readonly Float32Array[], at: number, glow: GlowInstance) {
  const fromDeg = glow.fromDeg ?? 0;
  const span = glow.toDeg === undefined ? AROUND_DEG : (glow.toDeg - fromDeg + 360) % 360 || 360;
  const shape = glow.streak === true ? STREAK : ROUND;
  columns[0].set([glow.x, glow.y, glow.z, glow.sizeM], at * FLOATS_A_VEC);
  columns[1].set([glow.colour.r * glow.brightness, glow.colour.g * glow.brightness, glow.colour.b * glow.brightness, glow.reachM], at * FLOATS_A_VEC);
  columns[2].set([glow.rhythm, glow.periodS, glow.phase, glow.minPixels], at * FLOATS_A_VEC);
  columns[3].set([(fromDeg * Math.PI) / 180, (span * Math.PI) / 180, glow.turning === true ? 1 : 0, shape + (glow.strikes ?? 0)], at * FLOATS_A_VEC);
}

/** Each rhythm a row of one texture. */
function rhythmSheet(rhythms: readonly Rhythm[]) {
  const rows = Math.max(1, rhythms.length);
  const pixels = new Uint8Array(RHYTHM_SAMPLES * rows);
  rhythms.forEach((rhythm, row) => {
    pixels.set(rhythmRow(rhythm, RHYTHM_SAMPLES), row * RHYTHM_SAMPLES);
  });
  const map = new DataTexture(pixels, RHYTHM_SAMPLES, rows, RedFormat);
  map.minFilter = map.magFilter = NearestFilter;
  map.needsUpdate = true;
  return map;
}

export function quadGeometry() {
  const geometry = new InstancedBufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(Float32Array.from([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
  geometry.setAttribute("uv", new BufferAttribute(Float32Array.from([0, 0, 1, 0, 1, 1, 0, 1]), 2));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  return geometry;
}

export interface Glows {
  mesh: Mesh;
  /** Rewrites one instance. For what moves: a car's lamps. */
  set: (at: number, glow: GlowInstance) => void;
  /** After `set`, once a frame at most. */
  upload: (count: number) => void;
  dispose: () => void;
}

export function createGlows(night: Night, glows: readonly GlowInstance[], rhythms: readonly Rhythm[], capacity = glows.length): Glows {
  const columns = Array.from({ length: VECS }, () => new Float32Array(capacity * FLOATS_A_VEC));
  glows.forEach((glow, at) => {
    writeGlow(columns, at, glow);
  });
  const geometry = quadGeometry();
  geometry.instanceCount = glows.length;
  const attributes = columns.map((column) => new InstancedBufferAttribute(column, FLOATS_A_VEC));
  ["glowPlace", "glowColour", "glowBeat", "glowSector"].forEach((name, index) => {
    geometry.setAttribute(name, attributes[index]);
  });
  const sheet = rhythmSheet(rhythms);

  const place = attribute<"vec4">("glowPlace", "vec4");
  const colour = attribute<"vec4">("glowColour", "vec4");
  const beat = attribute<"vec4">("glowBeat", "vec4");
  const sector = attribute<"vec4">("glowSector", "vec4");

  const toLight = place.xyz.sub(cameraPosition);
  const distance = toLight.length();
  const eyeBearing = atan(toLight.x, toLight.z.negate());
  const period = max(beat.y, float(0.05));
  const turned = select(sector.z.greaterThan(0.5), eyeBearing.div(TAU).negate(), float(0));
  const share = fract(night.seconds.div(period).add(beat.z).add(turned));
  const beating: F = select(beat.x.lessThan(0), float(1), textureLoad(sheet, ivec2(int(share.mul(RHYTHM_SAMPLES - 1)), int(beat.x.max(0)))).r);

  const fromStart = fract(eyeBearing.sub(sector.x).div(TAU)).mul(TAU);
  const inSector = select(fromStart.lessThan(sector.y), float(1), float(0));
  const reachFade = float(1).sub(smoothstep(colour.w.mul(REACH_FADE_FROM), colour.w, distance));

  const isStreak = sector.w.greaterThanEqual(STREAK);
  const strikes = select(isStreak, sector.w.sub(STREAK), sector.w);
  const hour = smoothstep(strikes.mul(0.6), strikes.mul(0.6).add(0.4), night.lampsOn);
  const shown = beating.mul(inSector).mul(reachFade).mul(hour);

  const viewPlace = cameraViewMatrix.mul(vec4(place.xyz, 1));
  const depth = viewPlace.z.negate().max(0.01);
  const metresPerPixel = depth.mul(2).div(cameraProjectionMatrix.mul(vec4(0, 1, 0, 0)).y.mul(screenSize.y));
  const size = max(place.w, metresPerPixel.mul(beat.w)).mul(select(shown.greaterThan(0.001), float(1), float(0)));
  const wide = select(isStreak, size.mul(STREAK_WIDE), size);
  const tall = select(isStreak, size.mul(STREAK_LONG), size);
  // A streak hangs from its place towards the eye, the reflection of the light above it.
  const fall = select(isStreak, positionGeometry.y.sub(1), positionGeometry.y);
  const inView = vec4(viewPlace.x.add(positionGeometry.x.mul(wide)), viewPlace.y.add(fall.mul(tall)), viewPlace.z.add(TOWARDS_EYE_M), 1);

  const material = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending });
  material.vertexNode = cameraProjectionMatrix.mul(inView);

  const across = uv().mul(2).sub(1);
  const out = varying(shown);
  const tint = varying(colour.xyz);
  const streaked = varying(select(isStreak, float(1), float(0)));
  const round = across.length();
  const falloff = float(1).sub(round).max(0);
  const halo = falloff.mul(falloff).mul(falloff);
  const core = smoothstep(float(0.22), float(0.05), round);
  const ripple = sin(across.y.mul(34).add(night.seconds.mul(2.3))).mul(0.5).add(0.5);
  const streak = float(1).sub(across.x.mul(across.x)).max(0).mul(smoothstep(float(-1), float(0.3), across.y)).mul(ripple.mul(0.75).add(0.25)).mul(0.5);
  const brightness: F = mix(halo.mul(0.4).add(core), streak, streaked);
  material.colorNode = tint.mul(brightness).mul(out);

  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1010;

  return {
    mesh,
    set(at, glow) {
      writeGlow(columns, at, glow);
    },
    upload(count) {
      geometry.instanceCount = count;
      for (const attr of attributes) attr.needsUpdate = true;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      sheet.dispose();
    },
  };
}
