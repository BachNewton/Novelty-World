import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { animated } from "../animate";
import type { AnchoredLight } from "../light-anchor";
import { flickerOf, flickerSignal, MAX_FLICKER } from "../lighting";
import { paletteHex, type PaletteKey } from "../palette";
import type { FlickerSignal, LampKind } from "../room";

/*
 * A flame drawn by a shader of our own on a small card that turns to face the
 * camera, added onto what lies behind it so it glows. Drifting noise shapes a
 * teardrop (or a few, for a fire) whose tip licks upward and sways, shaded
 * from a white-gold core through an orange body to a dim red tip. Its light's
 * flicker signal drives its brightness and height, so the flame dips with the
 * light it throws on the walls; everything else moves on the stage's clock, so
 * a frozen clock freezes it.
 *
 * Every preset draws with the same shader, so the house compiles it once; each
 * preset has one material, shared by every flame of it.
 */

/** The most tongues one flame card draws: a hearth's fire. */
export const MAX_TONGUES = 5;

export interface FlamePreset {
  label: string;
  /** The flame's height and its widest width at rest, in metres. Its foot is at the card's origin. */
  height: number;
  width: number;
  /** The hot heart, the body round it, the dim tip it fades out at, and the cup at its foot. */
  colours: { core: PaletteKey; body: PaletteKey; tip: PaletteKey; base: PaletteKey };
  /** How much of the foot burns in the base colour: a candle's faint blue; above 1 the blue climbs higher, a gas jet's cup. */
  base: number;
  /** How many tongues of flame, side by side: one for a wick, a few for a fire. */
  tongues: number;
  /** How hard the noise tears at its edges and licks its tip: 0 a still flame. */
  turbulence: number;
  /** How fast its licks rise and its sway wanders. */
  pace: number;
  /** How far its tip sways, in half-widths. */
  sway: number;
  /** How bright it glows: above 1 it saturates towards its core colour. */
  brightness: number;
  /** How much of it burns at its core colour: 1 for a wick's small flame, less for a fire's mass of orange. */
  hot: number;
  /** How much deeper than its light the flame itself dips with the signal, in brightness and in height. */
  dip: { brightness: number; height: number };
  /** The light it throws; its `flicker` is the depth the flame dips by too. */
  light: { colour: PaletteKey; intensity: number; range: number; flicker: number; kind: LampKind };
}

export const FLAME_PRESETS = {
  candle: {
    label: "Candle",
    height: 0.075,
    width: 0.026,
    colours: { core: "boneLight", body: "amber", tip: "ember", base: "moon" },
    base: 0.35,
    tongues: 1,
    turbulence: 0.35,
    pace: 1,
    sway: 0.35,
    brightness: 1.35,
    hot: 1,
    dip: { brightness: 2, height: 1.8 },
    light: { colour: "amber", intensity: 2.5, range: 5, flicker: 0.15, kind: "candle" },
  },
  oilLamp: {
    label: "Oil lamp",
    height: 0.09,
    width: 0.04,
    colours: { core: "goldLight", body: "amber", tip: "ember", base: "ember" },
    base: 0.1,
    tongues: 1,
    turbulence: 0.25,
    pace: 0.8,
    sway: 0.2,
    brightness: 1.4,
    hot: 1,
    dip: { brightness: 2, height: 1.5 },
    light: { colour: "amber", intensity: 5, range: 8, flicker: 0.1, kind: "lamp" },
  },
  gasJet: {
    label: "Gas jet",
    height: 0.07,
    width: 0.05,
    colours: { core: "flame", body: "amber", tip: "ember", base: "moon" },
    base: 2.2,
    tongues: 1,
    turbulence: 0.12,
    pace: 1.6,
    sway: 0.08,
    brightness: 1.3,
    hot: 0.9,
    dip: { brightness: 2, height: 1.5 },
    light: { colour: "amber", intensity: 3, range: 7, flicker: 0.04, kind: "lamp" },
  },
  torch: {
    label: "Torch",
    height: 0.28,
    width: 0.13,
    colours: { core: "flame", body: "amber", tip: "scarlet", base: "ember" },
    base: 0.2,
    tongues: 3,
    turbulence: 0.7,
    pace: 1.3,
    sway: 0.3,
    brightness: 1.05,
    hot: 0.55,
    dip: { brightness: 1.4, height: 1.2 },
    light: { colour: "amber", intensity: 8, range: 8, flicker: 0.3, kind: "fire" },
  },
  hearth: {
    label: "Hearth fire",
    height: 0.3,
    width: 0.16,
    colours: { core: "flame", body: "amber", tip: "scarlet", base: "ember" },
    base: 0.3,
    tongues: 1,
    turbulence: 0.8,
    pace: 1.2,
    sway: 0.3,
    brightness: 0.85,
    hot: 0.55,
    dip: { brightness: 1.2, height: 1 },
    light: { colour: "amber", intensity: 14, range: 9, flicker: 0.35, kind: "fire" },
  },
} as const satisfies Record<string, FlamePreset>;

export type FlamePresetName = keyof typeof FLAME_PRESETS;

/** Flames that burn a colour with a meaning (see the colour table) instead of a preset's own warm one. */
export const FLAME_TINTS = {
  /** Magic and omens. */
  violet: { core: "boneLight", body: "violet", tip: "bruise", base: "bruiseDark" },
  /** The corrupt: rot, poison, the ghoulish. */
  wraith: { core: "goldLight", body: "wraithLight", tip: "wraith", base: "wraithDark" },
} as const satisfies Record<string, FlamePreset["colours"]>;

export type FlameTint = keyof typeof FLAME_TINTS;

/** The light a flame throws, on the signal its flame dips with: give both the same signal. */
export function flameLight(name: FlamePresetName, signal: Exclude<FlickerSignal, "water">): AnchoredLight {
  return { ...FLAME_PRESETS[name].light, signal };
}

/** How a flame stands at a signal's value (between −1 and 1): its brightness and height, each 1 at rest. */
export function flameSway(preset: FlamePreset, signal: number): { brightness: number; height: number } {
  const depth = preset.light.flicker;
  if (depth > MAX_FLICKER) throw new Error(`A ${preset.label} flame flickers by ${depth}; the most is ${MAX_FLICKER}`);
  return {
    brightness: Math.max(0, 1 + preset.dip.brightness * depth * signal),
    height: Math.max(0.2, 1 + preset.dip.height * depth * signal),
  };
}

/** The first moment, to a hundredth of a second within a minute, at which a flame signal stands nearest `target`
 *  (between −1 and 1): where to hold the clock that drives a flame and its light to show one flicker. */
export function momentAtSignal(target: number, signal: Exclude<FlickerSignal, "water">): number {
  let best = 0;
  for (let step = 0; step <= 6000; step++) {
    const seconds = step / 100;
    if (Math.abs(flickerOf(seconds, signal) - target) < Math.abs(flickerOf(best, signal) - target)) best = seconds;
  }
  return best;
}

/** The least height a flame shows at on screen, in pixels: smaller, it grows into a dimmer glow. */
const MIN_PIXELS = 7;

/** How far the card reaches past the flame: sideways in half-widths, and below its foot and above its tip in heights, for sway and glow. */
const REACH = { across: 1.7, below: 0.12, above: 0.3 };

const VERTEX = /* glsl */ `
attribute vec4 signalMask;
uniform vec4 brightnessBy;
uniform vec4 heightBy;
// Where the flame's foot stands in the mesh's frame, and its width and height there: one flame card, or many batched in one mesh.
attribute vec3 foot;
attribute vec2 extent;
uniform float pixels;
varying vec2 vPlace;
varying float vSeed;
varying float vBright;

void main() {
  vec4 centre = modelMatrix * vec4( foot, 1.0 );
  float across = length( modelMatrix[ 0 ].xyz ) * extent.x * 0.5;
  float tall = length( modelMatrix[ 1 ].xyz ) * extent.y * dot( heightBy, signalMask );
  vSeed = fract( sin( dot( centre.xyz, vec3( 12.9898, 78.233, 37.719 ) ) ) * 43758.5453 ) * 61.0;
  vBright = dot( brightnessBy, signalMask );

  // Upright on screen as the world's up is, and foreshortened as a real flame is seen from above, though never
  // flatter than a round glow.
  vec4 eyeCentre = viewMatrix * centre;
  vec2 up = ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xy;
  float fore = length( up );
  vec2 axisUp = fore > 1e-3 ? up / fore : vec2( 0.0, 1.0 );
  vec2 axisAcross = vec2( axisUp.y, -axisUp.x );
  vPlace = vec2( ( uv.x * 2.0 - 1.0 ) * ${REACH.across.toFixed(3)}, mix( -${REACH.below.toFixed(3)}, 1.0 + ${REACH.above.toFixed(3)}, uv.y ) );
  // Too small on screen to show its shape, it grows into a dimmer glow of the least height that still reads, rather
  // than thinning to a flickering pixel.
  float shown = tall * max( fore, 0.55 ) * projectionMatrix[ 1 ][ 1 ] / max( -eyeCentre.z, 1e-3 ) * pixels * 0.5;
  float grow = max( 1.0, ${MIN_PIXELS.toFixed(1)} / max( shown, 1e-3 ) );
  vBright /= grow;
  eyeCentre.xy += ( axisAcross * vPlace.x * across + axisUp * vPlace.y * tall * max( fore, 0.55 ) ) * grow;
  // A little towards the eye, so the wick or the wood it burns on never cuts into it.
  eyeCentre.z += across;
  gl_Position = projectionMatrix * eyeCentre;
}
`;

const FRAGMENT = /* glsl */ `
#define MAX_TONGUES ${MAX_TONGUES}
uniform float time;
uniform float pace;
uniform float turbulence;
uniform float sway;
uniform float tongues;
uniform float base;
uniform float brightness;
uniform float hot;
uniform vec3 core;
uniform vec3 body;
uniform vec3 tip;
uniform vec3 baseColour;
varying vec2 vPlace;
varying float vSeed;
varying float vBright;

float hash( vec2 p ) {
  return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
}

float noise( vec2 p ) {
  vec2 i = floor( p );
  vec2 f = fract( p );
  vec2 u = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( hash( i ), hash( i + vec2( 1.0, 0.0 ) ), u.x ), mix( hash( i + vec2( 0.0, 1.0 ) ), hash( i + vec2( 1.0, 1.0 ) ), u.x ), u.y );
}

float fbm( vec2 p ) {
  float sum = 0.0;
  float weight = 0.5;
  for ( int i = 0; i < 3; i++ ) {
    sum += weight * noise( p );
    p = p * 2.03 + 17.1;
    weight *= 0.5;
  }
  return sum;
}

// One tongue's heat at p (x in its half-widths, y in its heights, its foot at 0): 1 at its heart, 0 at its edge, below 0 outside.
float tongue( vec2 p, float seed ) {
  float t = time * pace;
  // The whole tongue bends from its foot, more the higher up.
  float bend = ( fbm( vec2( t * 0.9, seed ) ) - 0.5 ) * 2.4 * sway;
  float x = p.x - bend * p.y * p.y;
  // Licks rise through it, stretching and shortening the tip.
  float lick = fbm( vec2( x * 1.3 + seed, p.y * 2.2 - t * 2.6 ) ) - 0.5;
  float y = p.y / ( 1.0 + lick * turbulence * 0.9 );
  const float bulb = 0.24;
  float width = y < bulb
    ? sqrt( max( 0.0, 1.0 - pow( ( bulb - y ) / bulb, 2.0 ) ) )
    : pow( max( 0.0, 1.0 - ( y - bulb ) / ( 1.0 - bulb ) ), 1.25 ) * ( 1.0 + 0.3 * sin( 3.14159 * clamp( ( y - bulb ) / ( 1.0 - bulb ), 0.0, 1.0 ) ) );
  float heat = 1.0 - abs( x ) / max( width, 1e-3 );
  // Its edges tear, more towards the tip.
  heat -= ( fbm( vec2( x * 2.6 + seed * 3.0, p.y * 3.4 - t * 3.4 ) ) - 0.5 ) * turbulence * 1.6 * clamp( y, 0.0, 1.0 );
  return width <= 0.0 ? -1.0 : heat;
}

void main() {
  float heat = -1.0;
  float count = max( tongues, 1.0 );
  float half_ = count > 1.0 ? 0.32 + 0.4 / count : 1.0;
  float y = vPlace.y;
  for ( int i = 0; i < MAX_TONGUES; i++ ) {
    if ( float( i ) >= count ) break;
    float side = count > 1.0 ? float( i ) / ( count - 1.0 ) * 2.0 - 1.0 : 0.0;
    float at = side * ( 1.0 - half_ );
    float seed = vSeed + float( i ) * 7.31;
    // Outer tongues stand lower, each wavering in height on its own.
    float tall = 1.0 - 0.35 * abs( side ) + ( noise( vec2( time * pace * 1.7, seed ) ) - 0.5 ) * 0.3 * min( turbulence * 2.0, 1.0 );
    heat = max( heat, tongue( vec2( ( vPlace.x - at ) / half_, y / tall ), seed ) );
  }

  // Nothing reaches the card's edges, where it would show as a box.
  float card = ( 1.0 - smoothstep( ${(REACH.across * 0.7).toFixed(3)}, ${(REACH.across * 0.97).toFixed(3)}, abs( vPlace.x ) ) )
    * ( 1.0 - smoothstep( 1.0 + ${(REACH.above * 0.5).toFixed(3)}, 1.0 + ${(REACH.above * 0.95).toFixed(3)}, y ) )
    * smoothstep( -${(REACH.below * 0.95).toFixed(3)}, -${(REACH.below * 0.3).toFixed(3)}, y );
  float inside = smoothstep( 0.0, 0.22, heat );
  float warmth = clamp( heat, 0.0, 1.0 ) * ( 1.0 - 0.7 * clamp( y, 0.0, 1.0 ) ) * hot;
  vec3 colour = mix( tip, body, smoothstep( 0.04, 0.34, warmth ) );
  colour = mix( colour, core, smoothstep( 0.38, 0.8, warmth ) );
  // The foot burns blue where air feeds it, dimmer than the flame above.
  float cup = min( base, 1.0 ) * ( 1.0 - smoothstep( 0.0, 0.2 * max( base, 1.0 ), y ) );
  colour = mix( colour, baseColour, cup );
  float foot = mix( mix( 0.5, 1.0, smoothstep( 0.0, 0.28, y ) ), 0.9, cup );
  // A soft glow round it, dimmer towards the tip.
  float halo = exp( min( heat, 0.0 ) * 3.0 ) * 0.2 * ( 1.0 - smoothstep( 0.0, 1.1, y ) );
  vec3 light = ( colour * inside * brightness * foot + body * halo * ( 1.0 - inside ) ) * vBright * card;
  // Light adds onto what lies behind it, but the blue foot also hides some of it: blue added onto a lamplit wall
  // would wash out to white.
  gl_FragColor = vec4( light, inside * cup * 0.7 * card );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/** The clock every flame shares: the noise's time, and each flame signal's value. */
const clock = { time: { value: 0 }, pixels: { value: 1 }, signals: new THREE.Vector4() };

interface PresetMaterial {
  preset: FlamePreset;
  material: THREE.ShaderMaterial;
  /** The uniforms that change each frame, re-pointed into any copy of the material a ghost draws with. */
  live: { time: { value: number }; pixels: { value: number }; brightnessBy: { value: THREE.Vector4 }; heightBy: { value: THREE.Vector4 } };
}

const materials = new Map<string, PresetMaterial>();

function colour(key: PaletteKey): THREE.Color {
  return new THREE.Color(paletteHex(key));
}

function materialFor(name: FlamePresetName, tint: FlameTint | undefined): PresetMaterial {
  const key = tint ? `${name}:${tint}` : name;
  const found = materials.get(key);
  if (found) return found;
  const preset: FlamePreset = tint ? { ...FLAME_PRESETS[name], colours: FLAME_TINTS[tint] } : FLAME_PRESETS[name];
  if (preset.tongues < 1 || preset.tongues > MAX_TONGUES) throw new Error(`A ${preset.label} flame has ${preset.tongues} tongues; it takes 1 to ${MAX_TONGUES}`);
  const live = { time: clock.time, pixels: clock.pixels, brightnessBy: { value: new THREE.Vector4(1, 1, 1, 1) }, heightBy: { value: new THREE.Vector4(1, 1, 1, 1) } };
  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    depthWrite: false,
    fog: false,
    uniforms: {
      pace: { value: preset.pace },
      turbulence: { value: preset.turbulence },
      sway: { value: preset.sway },
      tongues: { value: preset.tongues },
      base: { value: preset.base },
      brightness: { value: preset.brightness },
      hot: { value: preset.hot },
      core: { value: colour(preset.colours.core) },
      body: { value: colour(preset.colours.body) },
      tip: { value: colour(preset.colours.tip) },
      baseColour: { value: colour(preset.colours.base) },
      ...live,
    },
  });
  const made = { preset, material, live };
  materials.set(key, made);
  madeOf.set(material, made);
  drive(made);
  return made;
}

function drive({ preset, live }: PresetMaterial) {
  for (let channel = 0; channel < 4; channel++) {
    const { brightness, height } = flameSway(preset, clock.signals.getComponent(channel));
    live.brightnessBy.value.setComponent(channel, brightness);
    live.heightBy.value.setComponent(channel, height);
  }
}

/**
 * Sets every flame to a moment: its noise to `seconds`, and its brightness and
 * height to the flame signals at `signalSeconds` (the same moment, unless a
 * bench holds the flicker). Each flame calls it as it animates, so the stage
 * needs nothing more; it is cheap and the same however often it is called.
 */
export function driveFlames(seconds: number, signalSeconds = seconds) {
  clock.time.value = seconds;
  flickerSignal(signalSeconds, clock.signals);
  for (const made of materials.values()) drive(made);
}

const drawingBuffer = new THREE.Vector2();

export interface FlameOptions {
  /** The flame signal it dips with: its light's (`flameLight`). Unnamed, the room gives it the signal of the
   *  light it burns with (`signalFlames`). */
  signal?: Exclude<FlickerSignal, "water">;
  /** Burns a colour with a meaning instead of the preset's warm one. */
  tint?: FlameTint;
}

interface FlameData {
  flame: { named: boolean };
}

/** Which preset's material each one draws with, to batch flames that share one. */
const madeOf = new WeakMap<THREE.Material, PresetMaterial>();

function maskOf(signal: Exclude<FlickerSignal, "water">): number[] {
  const mask = [0, 0, 0, 0];
  mask[signal] = 1;
  return Array.from({ length: 4 }, () => mask).flat();
}

/**
 * A flame of a preset, its foot at the origin (set it on the wick), one draw
 * call on its preset's shared material. It moves on the stage's clock, so a
 * room keeps it as built rather than merging and baking it; it casts no
 * shadow and is not baked. Scale it to make it bigger or smaller.
 */
export function flame(name: FlamePresetName, { signal, tint }: FlameOptions = {}): THREE.Mesh {
  const made = materialFor(name, tint);
  // The shader places the card from its uvs alone; its corners are the flame's own extent at rest, for its bounds.
  const { width, height } = made.preset;
  const geometry = new THREE.PlaneGeometry(width, height).translate(0, height / 2, 0);
  geometry.setAttribute("signalMask", new THREE.Float32BufferAttribute(maskOf(signal ?? 0), 4));
  geometry.setAttribute("foot", new THREE.Float32BufferAttribute(Array.from({ length: 4 }, () => [0, 0, 0]).flat(), 3));
  geometry.setAttribute("extent", new THREE.Float32BufferAttribute(Array.from({ length: 4 }, () => [width, height]).flat(), 2));
  return flameMesh(geometry, made, signal !== undefined);
}

function flameMesh(geometry: THREE.BufferGeometry, made: PresetMaterial, named: boolean): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, made.material);
  // The card is moved into place in the shader, so its bounds can't be culled by.
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  mesh.userData.noShadow = true;
  (mesh.userData as FlameData).flame = { named };
  mesh.onBeforeRender = (renderer, _scene, _camera, _geometry, drawn) => {
    clock.pixels.value = renderer.getDrawingBufferSize(drawingBuffer).y;
    Object.assign((drawn as THREE.ShaderMaterial).uniforms, made.live);
  };
  return animated(mesh, (seconds) => {
    driveFlames(seconds);
  });
}

/** Whether an object is one of the kit's flames (or a batch of them). */
export function isFlame(object: THREE.Object3D): boolean {
  return (object.userData as Partial<FlameData>).flame !== undefined;
}

/** The kit's flames under `root` that name no signal of their own. */
export function unsignalledFlames(root: THREE.Object3D): THREE.Mesh[] {
  const found: THREE.Mesh[] = [];
  root.traverse((object) => {
    const data = (object.userData as Partial<FlameData>).flame;
    if (object instanceof THREE.Mesh && data && !data.named) found.push(object);
  });
  return found;
}

/** Gives a flame that named no signal the one its light wavers with. */
export function signalFlame(mesh: THREE.Mesh, signal: Exclude<FlickerSignal, "water">) {
  mesh.geometry.setAttribute("signalMask", new THREE.Float32BufferAttribute(maskOf(signal), 4));
  (mesh.userData as FlameData).flame.named = true;
}

export interface FireOptions {
  /** How wide and how deep the bed of the fire is, in metres. */
  width: number;
  depth?: number;
  /** How tall its tallest tongue stands, in metres. */
  height?: number;
  signal?: Exclude<FlickerSignal, "water">;
  tint?: FlameTint;
}

/** A repeatable spread in [0, 1) for the `i`th tongue, so a fire is the same each time it is built. */
function spread(i: number, salt: number): number {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * A fire on a bed `width` by `depth` metres, its foot at the origin: several
 * narrow hearth flames, each its own card facing the camera, staggered across
 * the bed and back into it, tallest in the middle, so it holds its shape from
 * every side. Each wavers on its own (its noise is seeded by where it stands)
 * and all dip together on the fire's signal.
 */
export function fire({ width, depth = width * 0.4, height = 0.45, signal, tint }: FireOptions): THREE.Group {
  const result = new THREE.Group();
  const count = Math.max(3, Math.round(width / 0.08));
  const tongue = FLAME_PRESETS.hearth;
  for (let i = 0; i < count; i++) {
    const across = count === 1 ? 0 : (i / (count - 1)) * 2 - 1;
    const x = across * width * 0.42 + (spread(i, 1) - 0.5) * (width / count) * 0.6;
    const z = (spread(i, 2) - 0.5) * depth * 0.7;
    const tall = (height / tongue.height) * (1 - 0.45 * across * across) * (0.75 + 0.35 * spread(i, 3));
    const card = flame("hearth", { signal, tint });
    card.position.set(x, 0, z);
    card.scale.set(0.8 + 0.5 * spread(i, 4), tall, 1);
    result.add(card);
  }
  return result;
}

/**
 * Draws all the flames under `root` that share a material as one mesh, in
 * `root`'s frame, so a room's candles cost a draw call per preset, not one
 * each. Flames under one of `apart` (a piece hung on a wall, which hides when
 * its wall is cut) are batched within that piece instead, so they hide with
 * it. Call it once the flames have their signals and stand where they stay.
 */
export function batchFlames(root: THREE.Object3D, apart: readonly THREE.Object3D[] = []) {
  root.updateMatrixWorld(true);
  const homes = new Map<THREE.Object3D, Map<PresetMaterial, THREE.Mesh[]>>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !(object.userData as Partial<FlameData>).flame) return;
    const made = madeOf.get(object.material as THREE.Material);
    if (!made) throw new Error("A flame draws with a material the kit did not make");
    let home: THREE.Object3D = root;
    for (let o: THREE.Object3D | null = object.parent; o && o !== root; o = o.parent) if (apart.includes(o)) home = o;
    const byMaterial = homes.get(home) ?? new Map<PresetMaterial, THREE.Mesh[]>();
    homes.set(home, byMaterial);
    byMaterial.set(made, [...(byMaterial.get(made) ?? []), object]);
  });
  const toHome = new THREE.Matrix4();
  const within = new THREE.Matrix4();
  const scale = new THREE.Vector3();
  for (const [home, byMaterial] of homes) {
    toHome.copy(home.matrixWorld).invert();
    for (const [made, meshes] of byMaterial) {
      const parts = meshes.map((mesh) => {
        within.multiplyMatrices(toHome, mesh.matrixWorld);
        scale.setFromMatrixScale(within);
        const part = mesh.geometry.clone().applyMatrix4(within);
        const foot = part.getAttribute("foot");
        const extent = part.getAttribute("extent");
        const at = new THREE.Vector3().setFromMatrixPosition(within);
        for (let i = 0; i < foot.count; i++) {
          foot.setXYZ(i, at.x, at.y, at.z);
          extent.setXY(i, extent.getX(i) * scale.x, extent.getY(i) * scale.y);
        }
        part.deleteAttribute("normal");
        mesh.removeFromParent();
        mesh.geometry.dispose();
        return part;
      });
      const merged = mergeGeometries(parts);
      for (const part of parts) part.dispose();
      home.add(flameMesh(merged, made, true));
    }
  }
}
