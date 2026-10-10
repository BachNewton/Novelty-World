import * as THREE from "three";
import { animated } from "../animate";
import { flickerOf, moonDirection, HOUSE_LIGHT } from "../lighting";
import { paletteHex, type PaletteKey } from "../palette";
import type { FlickerSignal } from "../room";
import { TEXELS_PER_METRE } from "../textures";

/*
 * Water drawn by a shader of our own, in one pass, with no second render of
 * the scene: its surface moves under layered noise drifting on the stage's
 * clock, and it shows light only as reflections of lamps whose places are
 * known (and of the moon, where the room has a window), never by glowing
 * itself, and never by realtime shadows. It shades from murky at a shore to
 * black out in the deep, by a distance to the shore worked out once from its
 * outline, and rings spread from whatever stands in it.
 *
 * Everything is shaded in the surface's own frame (the room's, for a room's
 * water), so the lamps, contacts and outline are given in it.
 */

/** The most lamps one surface reflects: the room picks which. */
export const MAX_WATER_LAMPS = 4;
/** The most things touching one surface at once. */
export const MAX_WATER_CONTACTS = 16;
/** The most palette colours the palette-snapped look picks from. */
export const MAX_WATER_PALETTE = 16;

/** A lamp the water reflects, in the surface's frame: usually one of the room's own lights. */
export interface WaterLamp {
  at: [x: number, y: number, z: number];
  colour: PaletteKey;
  /** How bright its reflection is; a room's lamp candela is a good start. */
  intensity: number;
  /** How much it wavers (as a baked light's `flicker`), and with which signal. */
  flicker?: number;
  signal?: FlickerSignal;
}

/** Something standing in the water, a circle of `radius` metres round (x, z), rings spreading from its edge. */
export interface WaterContact {
  x: number;
  z: number;
  radius: number;
  /** How strong its rings are, 1 by default; 0 is still. */
  strength?: number;
}

export interface WaterOptions {
  /** The surface's outline in x and z, in order round it. */
  outline: [x: number, z: number][];
  /** The surface's height. */
  height: number;
  /** Which of the outline's edges (edge i runs from point i to the next) is a
   *  shore the water shallows to and laps at; a wall or a basin's side is not.
   *  Every edge, by default. With none, the whole surface is deep. */
  shores?: boolean[];
  /** Metres from a shore to the deepest colour. */
  shelf?: number;
  /** The water's own colour at a shore and in the deep, and the cold light
   *  its surface reflects from the room round it at a glancing view. */
  colours?: { shallow: PaletteKey; deep: PaletteKey; sheen: PaletteKey };
  /** Lamps it reflects, at most `MAX_WATER_LAMPS`. */
  lamps?: WaterLamp[];
  /** Reflects the house's moon: only for water a real window lights. */
  moon?: boolean;
  /** How rough the surface is: 1 a still lake, more for a fountain's churn. */
  roughness?: number;
  /** What stands in the water: fixed, or where it is at a moment, for things that move. */
  contacts?: WaterContact[] | ((seconds: number) => WaterContact[]);
  /** Draws the water a texel at a time in these colours, as the art's textures are, instead of smoothly. */
  palette?: readonly PaletteKey[];
  /** The light its lamps throw off the moving surface onto the faces near it: see `Caustics`. */
  caustics?: Caustics;
}

/** The faces the water's caustics light, and how high above the water the light reaches. */
export interface Caustics {
  faces: CausticFace[];
  /** Metres above the water the light has faded out by, so a face's top never ends it in a line: two by
   *  default. Well before that, it dims as a real reflection does, the higher the steeper and weaker. */
  reach?: number;
}

/**
 * An upright face over the water that its caustics light: the wall it laps
 * at, a post standing in it. It runs from `from` to `to` in x and z, from
 * `bottom` (the water, by default) up to `top`, its lit side turned towards
 * `facing`. The light is laid a little off the face, on the lit side, so
 * give the face's own place.
 */
export interface CausticFace {
  from: [x: number, z: number];
  to: [x: number, z: number];
  bottom?: number;
  top: number;
  facing: [x: number, z: number];
}

/** The four sides of an upright post, x and z its extent, as faces the caustics light. */
export function causticSides(x: [number, number], z: [number, number], top: number): CausticFace[] {
  return [
    { from: [x[0], z[0]], to: [x[1], z[0]], top, facing: [0, -1] },
    { from: [x[1], z[0]], to: [x[1], z[1]], top, facing: [1, 0] },
    { from: [x[0], z[1]], to: [x[1], z[1]], top, facing: [0, 1] },
    { from: [x[0], z[0]], to: [x[0], z[1]], top, facing: [-1, 0] },
  ];
}

/** An outline for a rectangle of water, its edges in order: −z, +x, +z, −x. */
export function waterRectangle(x: [number, number], z: [number, number]): [number, number][] {
  return [
    [x[0], z[0]],
    [x[1], z[0]],
    [x[1], z[1]],
    [x[0], z[1]],
  ];
}

/** How finely the distance to the shore is worked out: it only shades colour and laps, so coarse is plenty. */
const SHORE_TEXELS_PER_METRE = 16;

/**
 * The distance to the nearest shore at each texel over the outline's bounds,
 * as a fraction of the shelf (red), the way away from it (green, blue), and
 * whether the texel is water at all (alpha), for the caustics.
 */
function shoreMap(outline: [number, number][], shores: boolean[], shelf: number, bounds: THREE.Box2): THREE.DataTexture {
  const size = bounds.getSize(new THREE.Vector2());
  const width = Math.max(2, Math.ceil(size.x * SHORE_TEXELS_PER_METRE));
  const height = Math.max(2, Math.ceil(size.y * SHORE_TEXELS_PER_METRE));
  const edges = outline.flatMap((from, i) => (shores[i] ? [[new THREE.Vector2(...from), new THREE.Vector2(...outline[(i + 1) % outline.length])]] : []));
  const data = new Uint8Array(width * height * 4);
  const point = new THREE.Vector2();
  const nearest = new THREE.Vector2();
  const along = new THREE.Vector2();
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      point.set(bounds.min.x + ((i + 0.5) / width) * size.x, bounds.min.y + ((j + 0.5) / height) * size.y);
      let best = Infinity;
      let away = new THREE.Vector2();
      for (const [a, b] of edges) {
        along.subVectors(b, a);
        const t = THREE.MathUtils.clamp(point.clone().sub(a).dot(along) / along.lengthSq(), 0, 1);
        nearest.copy(a).addScaledVector(along, t);
        const distance = point.distanceTo(nearest);
        if (distance < best) {
          best = distance;
          away = point.clone().sub(nearest).normalize();
        }
      }
      const at = (j * width + i) * 4;
      data[at] = Math.round(Math.min(1, best / shelf) * 255);
      data[at + 1] = Math.round((away.x * 0.5 + 0.5) * 255);
      data[at + 2] = Math.round((away.y * 0.5 + 0.5) * 255);
      data[at + 3] = inside(point, outline) ? 255 : 0;
    }
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/** Whether a point lies inside an outline, by the even-odd rule. */
function inside(point: THREE.Vector2, outline: [number, number][]): boolean {
  let within = false;
  outline.forEach(([x0, z0], i) => {
    const [x1, z1] = outline[(i + 1) % outline.length];
    if (z0 > point.y !== z1 > point.y && point.x < x0 + ((point.y - z0) / (z1 - z0)) * (x1 - x0)) within = !within;
  });
  return within;
}

/** The water's waves, shared by its surface and its caustics so the two move together. */
const WAVES = /* glsl */ `
uniform float time;
uniform float roughness;

vec2 gradientAt( vec2 cell ) {
  float angle = fract( sin( dot( cell, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ) * 6.2831853;
  return vec2( cos( angle ), sin( angle ) );
}

// Gradient noise, with its slope: the value in x, the slope in yz.
vec3 noised( vec2 p ) {
  vec2 i = floor( p );
  vec2 f = fract( p );
  vec2 u = f * f * f * ( f * ( f * 6.0 - 15.0 ) + 10.0 );
  vec2 du = 30.0 * f * f * ( f * ( f - 2.0 ) + 1.0 );
  vec2 ga = gradientAt( i );
  vec2 gb = gradientAt( i + vec2( 1.0, 0.0 ) );
  vec2 gc = gradientAt( i + vec2( 0.0, 1.0 ) );
  vec2 gd = gradientAt( i + vec2( 1.0, 1.0 ) );
  float va = dot( ga, f );
  float vb = dot( gb, f - vec2( 1.0, 0.0 ) );
  float vc = dot( gc, f - vec2( 0.0, 1.0 ) );
  float vd = dot( gd, f - vec2( 1.0, 1.0 ) );
  float k = va - vb - vc + vd;
  return vec3(
    va + u.x * ( vb - va ) + u.y * ( vc - va ) + u.x * u.y * k,
    ga + u.x * ( gb - ga ) + u.y * ( gc - ga ) + u.x * u.y * ( ga - gb - gc + gd ) + du * ( u.yx * k + vec2( vb, vc ) - va )
  );
}

// How much of a wave of this many cycles a metre survives at this pixel: none once a pixel spans half of it.
float kept( float cycles, float footprint ) {
  return 1.0 - smoothstep( 0.2, 0.5, footprint * cycles );
}

// The surface's slope at a place: four octaves of noise drifting their own
// ways, each fading out as a pixel grows too big to show it (its footprint,
// in metres), the slope so lost added to lost.
vec2 waveSlope( vec2 place, float footprint, inout float lost ) {
  vec2 slope = vec2( 0.0 );
  const mat2 turn = mat2( 0.8, 0.6, -0.6, 0.8 );
  vec2 p = place;
  float cycles = 2.2;
  float amplitude = 0.018 * roughness;
  vec2 drift = vec2( 0.11, 0.04 );
  for ( int octave = 0; octave < 4; octave++ ) {
    float keep = kept( cycles, footprint );
    vec3 n = noised( p * cycles + drift * time );
    slope += n.yz * cycles * amplitude * keep;
    lost += ( 1.0 - keep ) * cycles * amplitude;
    p = turn * p;
    cycles *= 2.2;
    amplitude *= 0.55;
    drift = turn * drift * vec2( -1.4, 1.3 );
  }
  return slope;
}`;

const VERTEX = /* glsl */ `
varying vec2 vPlace;
#include <fog_pars_vertex>
void main() {
  vPlace = position.xz;
  vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAGMENT = /* glsl */ `
#define LAMPS ${MAX_WATER_LAMPS}
#define CONTACTS ${MAX_WATER_CONTACTS}
#define PALETTE ${MAX_WATER_PALETTE}
uniform float height;
uniform float shelf;
uniform float opacity;
uniform vec3 eye;
uniform sampler2D shoreMap;
uniform vec4 shoreBounds;
uniform vec3 shallow;
uniform vec3 deep;
uniform vec3 sheen;
uniform vec3 lampAt[ LAMPS ];
uniform vec3 lampColour[ LAMPS ];
uniform vec3 moonWay;
uniform vec3 moonColour;
uniform vec4 contacts[ CONTACTS ];
uniform float texels;
uniform vec3 palette[ PALETTE ];
uniform int paletteSize;
varying vec2 vPlace;
#include <fog_pars_fragment>

${WAVES}

// How bright a reflected lamp is against the water's own colour.
#define GLARE 3.0

// A highlight: how near the surface's tilt is to the one that mirrors the
// light into the eye. It forgives a miss along the line to the eye three
// times more than across it, so a lamp draws a broken streak running towards
// the viewer, as it does on real water at night.
float glint( vec3 normal, vec3 toLight, vec3 toEye, vec2 along, float width ) {
  vec3 mirror = normalize( toLight + toEye );
  vec2 miss = normal.xz / normal.y - mirror.xz / max( mirror.y, 0.05 );
  float onLine = dot( miss, along );
  float across = miss.x * along.y - miss.y * along.x;
  return exp( -( across * across + onLine * onLine / 9.0 ) / ( width * width ) );
}

vec3 bayer( vec2 cell ) {
  vec2 c = mod( cell, 4.0 );
  int i = int( c.y ) * 4 + int( c.x );
  float m[ 16 ] = float[]( 0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0 );
  return vec3( ( m[ i ] + 0.5 ) / 16.0 - 0.5 );
}

void main() {
  vec2 place = vPlace;
  float footprint = length( fwidth( vPlace ) );
  if ( texels > 0.0 ) {
    place = ( floor( vPlace * texels ) + 0.5 ) / texels;
    // A texel is one sample of the waves, not an average of them: filter as for half a texel, so they still glint pixel by pixel.
    footprint = max( footprint, 0.5 / texels );
  }
  vec3 shore = texture2D( shoreMap, ( place - shoreBounds.xy ) * shoreBounds.zw ).rgb;
  float depth = shore.r;
  vec2 away = shore.gb * 2.0 - 1.0;

  // The surface's slope, its lost slope roughening the highlights instead so they never sparkle at a distance.
  float lost = 0.0;
  vec2 slope = waveSlope( place, footprint, lost );

  // Lapping at the shore: waves running in to it, broken along it by the slowest noise.
  float crest = 0.0;
  if ( dot( away, away ) > 0.01 ) {
    float k = 6.2831853 / 0.14;
    float out_ = depth * shelf;
    float fade = exp( -out_ / 0.18 ) * kept( 1.0 / 0.14, footprint );
    float broken = clamp( 0.55 + noised( place * 2.1 - vec2( 0.0, time * 0.07 ) ).x * 1.2, 0.0, 1.0 );
    float phase = k * out_ + time * 2.4;
    slope += away * cos( phase ) * k * 0.0035 * fade * broken;
    crest += max( sin( phase ), 0.0 ) * fade * broken;
  }

  // Rings spreading from everything standing in the water.
  for ( int i = 0; i < CONTACTS; i++ ) {
    vec4 c = contacts[ i ];
    if ( c.w <= 0.0 ) continue;
    vec2 out_ = place - c.xy;
    float r = length( out_ );
    float gap = r - c.z;
    if ( gap < 0.0 || gap > 0.6 ) continue;
    float k = 6.2831853 / 0.09;
    float phase = k * gap - time * 3.2 + float( i ) * 2.17;
    float fade = exp( -gap / 0.16 ) * c.w * kept( 1.0 / 0.09, footprint );
    slope += ( out_ / r ) * cos( phase ) * k * 0.003 * fade;
    crest += max( sin( phase ), 0.0 ) * fade;
  }

  vec3 normal = normalize( vec3( -slope.x, 1.0, -slope.y ) );
  vec3 at = vec3( place.x, height, place.y );
  vec3 toEye = normalize( eye - at );
  float facing = max( dot( normal, toEye ), 0.0 );
  float fresnel = 0.02 + 0.98 * pow( 1.0 - facing, 5.0 );
  // The slope too fine to draw widens the highlights (as Toksvig's filter does) rather than flickering in them.
  float width = sqrt( 0.0009 + lost * lost );
  vec2 along = length( toEye.xz ) > 1e-4 ? normalize( toEye.xz ) : vec2( 0.0, 1.0 );

  vec3 reflected = vec3( 0.0 );
  for ( int i = 0; i < LAMPS; i++ ) {
    vec3 toLamp = lampAt[ i ] - at;
    float distance = length( toLamp );
    reflected += lampColour[ i ] * glint( normal, toLamp / distance, toEye, along, width ) / ( 1.0 + distance * distance );
  }
  reflected += moonColour * glint( normal, moonWay, toEye, along, width );

  vec3 body = mix( shallow, deep, smoothstep( 0.0, 1.0, depth ) );
  vec3 colour = body * ( 1.0 - fresnel ) + ( reflected * GLARE + sheen * ( 1.0 + crest * 1.5 ) ) * mix( 0.12, 1.0, fresnel ) + sheen * crest * 0.6;

  if ( paletteSize > 0 ) {
    // The nearest palette colour, compared by perceived brightness, with an ordered dither between neighbours.
    vec3 wanted = sqrt( max( colour, 0.0 ) ) + bayer( floor( vPlace * texels ) ) * 0.05;
    float best = 1e9;
    vec3 pick = colour;
    for ( int i = 0; i < PALETTE; i++ ) {
      if ( i >= paletteSize ) break;
      vec3 d = sqrt( palette[ i ] ) - wanted;
      float score = dot( d, d );
      if ( score < best ) {
        best = score;
        pick = palette[ i ];
      }
    }
    colour = pick;
  }

  gl_FragColor = vec4( colour, opacity );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

/** How far the caustics' light lies off the face it plays on: clear of it, so the two never fight for depth. */
export const CAUSTIC_STANDOFF = 0.012;

const CAUSTIC_VERTEX = /* glsl */ `
uniform mat4 toWater;
varying vec3 vAt;
varying vec3 vFacing;
#include <fog_pars_vertex>
void main() {
  vAt = ( toWater * vec4( position, 1.0 ) ).xyz;
  vFacing = normalize( mat3( toWater ) * normal );
  vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const CAUSTIC_FRAGMENT = /* glsl */ `
#define LAMPS ${MAX_WATER_LAMPS}
uniform float height;
uniform float opacity;
uniform sampler2D shoreMap;
uniform vec4 shoreBounds;
uniform vec3 lampAt[ LAMPS ];
uniform vec3 lampColour[ LAMPS ];
uniform float texels;
uniform float reach;
varying vec3 vAt;
varying vec3 vFacing;
#include <fog_pars_fragment>

${WAVES}

// The waves finer than this (in metres) blur out of the caustics, and more
// the further the light is thrown. Close to the water the light has not yet
// gathered into lines: there it is broad and soft, blurred by up to NEAR_BLUR
// more over the first NEAR metres, its lines broader and dimmer.
#define BLUR 0.05
#define BLUR_PER_METRE 0.06
#define NEAR 0.35
#define NEAR_BLUR 0.12
// The curvature that focuses the light into a line on the face: hollows
// gentler than it fall short and spread their light, sharper ones focus it in
// front of the face. A real caustic's lines lie where the focus meets the
// face; here it is where the curvature crosses this, so the lines keep their
// look however far the light is thrown.
#define FOCUSING 0.28
// How sharp the lines are, as a share of the curvature.
#define LINE 0.4
// How bright the thrown light is, and how much of it falls between the lines.
#define GAIN 1.0
#define SPREAD 0.1
// The steps the palette-snapped look draws the light in.
#define STEP 0.035

// Whether a place on the surface is water, and not the floor round it.
float wet( vec2 place ) {
  vec2 uv = ( place - shoreBounds.xy ) * shoreBounds.zw;
  if ( any( lessThan( uv, vec2( 0.0 ) ) ) || any( greaterThan( uv, vec2( 1.0 ) ) ) ) return 0.0;
  return texture2D( shoreMap, uv ).a;
}

// How the waves gather the light they reflect from a place on the surface
// onto a face this far away: a hollow (where the divergence of the surface's
// slope is positive) focuses it as a concave mirror does. Bright in lines,
// and a little between them.
float gathered( vec2 place, float thrown, float footprint ) {
  const float e = 0.01;
  float near = 1.0 - smoothstep( 0.0, NEAR, thrown );
  // Never finer than a pixel of the face shows, so it doesn't sparkle from afar.
  float blur = max( BLUR + near * NEAR_BLUR + thrown * BLUR_PER_METRE, footprint );
  float lost = 0.0;
  float curve = ( waveSlope( place + vec2( e, 0.0 ), blur, lost ).x - waveSlope( place - vec2( e, 0.0 ), blur, lost ).x
    + waveSlope( place + vec2( 0.0, e ), blur, lost ).y - waveSlope( place - vec2( 0.0, e ), blur, lost ).y ) / ( 2.0 * e );
  // Drawn a texel at a time, a line as fine as the smooth look's breaks into specks: they are drawn broader.
  float off = ( curve - FOCUSING ) / ( FOCUSING * LINE * ( texels > 0.0 ? 1.5 : 1.0 ) * ( 1.0 + near * 1.5 ) );
  // Drawn in steps, the faint light between the lines would be a flat wash with a hard edge: it is left out.
  return ( texels > 0.0 ? 0.0 : SPREAD ) + exp( -off * off ) * ( 1.0 - near * 0.5 );
}

void main() {
  vec3 at = vAt;
  float footprint = 2.0 * length( fwidth( vAt ) );
  if ( texels > 0.0 ) {
    at = ( floor( vAt * texels ) + 0.5 ) / texels;
    footprint = max( footprint, 1.0 / texels );
  }
  float above = max( at.y - height, 0.001 );
  vec3 light = vec3( 0.0 );
  for ( int i = 0; i < LAMPS; i++ ) {
    // Where on the surface this lamp is mirrored into this point: the lamp's
    // light reaches the point from there, and from nowhere else.
    vec3 lamp = lampAt[ i ];
    float lampAbove = lamp.y - height;
    if ( lampAbove <= 0.0 ) continue;
    vec2 place = mix( lamp.xz, at.xz, lampAbove / ( lampAbove + above ) );
    float water = wet( place );
    if ( water <= 0.0 ) continue;
    vec3 from = vec3( place.x, height, place.y );
    float toLamp = length( lamp - from );
    vec3 out_ = at - from;
    float thrown = length( out_ );
    float facing = max( dot( vFacing, -out_ / thrown ), 0.0 );
    // Water reflects most of a lamp low over it and less of one above it; but
    // the moving surface always tilts some of it towards the lamp, so up a
    // wall, lit by the water under the lamp, the light dims rather than dies.
    float fresnel = 0.12 + 0.48 * pow( 1.0 - lampAbove / toLamp, 5.0 );
    float path = toLamp + thrown;
    vec3 reflected = lampColour[ i ] * water * fresnel * facing / ( 1.0 + path * path );
    if ( max( reflected.r, max( reflected.g, reflected.b ) ) < 1e-4 ) continue;
    light += reflected * gathered( place, thrown, footprint );
  }
  // It fades out going up, so it never ends in a line.
  light *= GAIN * opacity * ( 1.0 - smoothstep( 0.5 * reach, reach, above ) );
  if ( texels > 0.0 ) {
    // In whole steps of brightness, as the palette's ramps are.
    float bright = max( light.r, max( light.g, light.b ) );
    light *= bright > 0.0 ? floor( bright / STEP ) * STEP / bright : 0.0;
  }
  gl_FragColor = vec4( light, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  // Fog hides added light rather than tinting it: the fog's own colour is already behind it.
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
    #else
      float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
    #endif
    gl_FragColor.rgb *= 1.0 - fogFactor;
  #endif
}`;

/** The faces as one mesh's geometry, each a quad laid `CAUSTIC_STANDOFF` off its face and turned to its lit side. */
function causticGeometry(faces: CausticFace[], height: number): THREE.BufferGeometry {
  const position: number[] = [];
  const normal: number[] = [];
  for (const { from, to, bottom = height, top, facing } of faces) {
    if (top <= bottom || bottom < height) throw new Error(`A caustic face runs from ${bottom} to ${top}: upwards, from the water (${height}) or above`);
    const out = new THREE.Vector3(facing[0], 0, facing[1]).normalize();
    const shift = out.clone().multiplyScalar(CAUSTIC_STANDOFF);
    const a = new THREE.Vector3(from[0], bottom, from[1]).add(shift);
    const b = new THREE.Vector3(to[0], bottom, to[1]).add(shift);
    const c = new THREE.Vector3(to[0], top, to[1]).add(shift);
    const d = new THREE.Vector3(from[0], top, from[1]).add(shift);
    const turned = b.clone().sub(a).cross(c.clone().sub(a)).dot(out) > 0;
    for (const p of turned ? [a, b, c, a, c, d] : [a, c, b, a, d, c]) {
      position.push(p.x, p.y, p.z);
      normal.push(out.x, out.y, out.z);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normal, 3));
  return geometry;
}

/** What a caustic layer reads from the surface it belongs to. */
interface CausticSource {
  height: number;
  /** Uniforms fixed when the surface was built. */
  fixed: Record<string, THREE.IUniform>;
  /** Uniforms the surface changes as it moves, shared rather than copied. */
  live: Record<string, THREE.IUniform>;
}

const causticSources = new WeakMap<THREE.Mesh, CausticSource>();

/**
 * The light the water's lamps throw off its moving surface onto the faces
 * near it, as a net of bright lines playing over them: light added, never
 * paint, so a face no lamp's reflection reaches stays as it was. Each point
 * takes the light of every lamp mirrored into it from the surface, in the
 * lamp's colour, gathered or spread by the same waves the surface draws, so
 * the net moves with the water. One draw call; it samples the surface's own
 * shore map, to know where the water is.
 */
function causticLight(water: THREE.Mesh, source: CausticSource, caustics: Caustics): THREE.Mesh {
  const toWater = new THREE.Matrix4();
  const live = { ...source.live, toWater: { value: toWater } };
  const material = new THREE.ShaderMaterial({
    vertexShader: CAUSTIC_VERTEX,
    fragmentShader: CAUSTIC_FRAGMENT,
    fog: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    uniforms: { ...THREE.UniformsUtils.merge([THREE.UniformsLib.fog, source.fixed, { reach: { value: caustics.reach ?? 2 } }]), ...live },
  });
  const mesh = new THREE.Mesh(causticGeometry(caustics.faces, source.height), material);
  mesh.userData.noShadow = true;
  // As the surface's: a ghost's copy of the material is pointed back at the live uniforms.
  mesh.onBeforeRender = (_renderer, _scene, _camera, _geometry, drawn) => {
    toWater.copy(water.matrixWorld).invert().multiply(mesh.matrixWorld);
    const drawnUniforms = (drawn as THREE.ShaderMaterial).uniforms;
    Object.assign(drawnUniforms, live);
    drawnUniforms.opacity.value = drawn.opacity;
  };
  return mesh;
}

/**
 * A layer of a surface's caustics (see `causticLight`) to place on its own,
 * its faces given in the surface's frame: for faces that must come and go
 * apart from the water, such as those up a wall the camera cuts down, hung
 * on that wall as a piece of their own. Place it where it lies in the same
 * frame as the surface (in a room, the water's own placement), so its faces
 * land where they are given. It is drawn on the surface's clock by its own
 * shader, so it is marked as moving: a room keeps it as built.
 */
export function waterCaustics(water: THREE.Mesh, caustics: Caustics): THREE.Mesh {
  const source = causticSources.get(water);
  if (!source) throw new Error("Caustics are cast by a surface waterSurface built");
  return animated(causticLight(water, source, caustics), () => undefined);
}

function colour(key: PaletteKey): THREE.Color {
  return new THREE.Color(paletteHex(key));
}

/**
 * A water surface lying flat at `height` inside its outline, drawn in one
 * pass by its own shader and moved by the stage's clock. One draw call and
 * one texture (the distance to the shore), and one more draw call for its
 * caustics, when it has them, built as its child. It is a moving piece, so a
 * room keeps it as built rather than merging and baking it.
 */
export function waterSurface(options: WaterOptions): THREE.Mesh {
  const { outline, height, shelf = 1.5, roughness = 1, moon = false } = options;
  const shores = options.shores ?? outline.map(() => true);
  if (shores.length !== outline.length) throw new Error(`Water has ${outline.length} edges but ${shores.length} shore flags`);
  const lamps = options.lamps ?? [];
  if (lamps.length > MAX_WATER_LAMPS) throw new Error(`Water reflects at most ${MAX_WATER_LAMPS} lamps; ${lamps.length} given`);
  const palette = options.palette ?? [];
  if (palette.length > MAX_WATER_PALETTE) throw new Error(`Water's palette holds at most ${MAX_WATER_PALETTE} colours; ${palette.length} given`);
  const { shallow, deep, sheen } = options.colours ?? { shallow: "tideDark", deep: "void", sheen: "moonDark" };

  const shape = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, -z)));
  const geometry = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2).translate(0, height, 0);
  const bounds = new THREE.Box2().setFromPoints(outline.map(([x, z]) => new THREE.Vector2(x, z)));
  const size = bounds.getSize(new THREE.Vector2());
  const shoreTexture = shoreMap(outline, shores, shelf, bounds);

  const lampAt = Array.from({ length: MAX_WATER_LAMPS }, (_, i) => new THREE.Vector3(...(lamps.at(i)?.at ?? [0, 0, 0])));
  const lampColour = Array.from({ length: MAX_WATER_LAMPS }, () => new THREE.Color(0, 0, 0));
  const contacts = Array.from({ length: MAX_WATER_CONTACTS }, () => new THREE.Vector4());
  const paletteColours = Array.from({ length: MAX_WATER_PALETTE }, (_, i) => (palette.at(i) === undefined ? new THREE.Color() : colour(palette[i])));
  const moonColour = moon ? colour(HOUSE_LIGHT.moon.colour).multiplyScalar(HOUSE_LIGHT.moon.intensity * 0.25) : new THREE.Color(0, 0, 0);
  const state = {
    time: { value: 0 },
    eye: { value: new THREE.Vector3() },
    moonWay: { value: new THREE.Vector3(0, 1, 0) },
  };
  // Shared, not copied as `merge` would: these change every frame, or are too big to copy.
  const live = { ...state, shoreMap: { value: shoreTexture }, lampAt: { value: lampAt }, lampColour: { value: lampColour }, contacts: { value: contacts }, palette: { value: paletteColours } };
  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    fog: true,
    uniforms: {
      ...THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        height: { value: height },
        shelf: { value: shelf },
        roughness: { value: roughness },
        opacity: { value: 1 },
        shoreBounds: { value: new THREE.Vector4(bounds.min.x, bounds.min.y, 1 / size.x, 1 / size.y) },
        shallow: { value: colour(shallow) },
        deep: { value: colour(deep) },
        sheen: { value: colour(sheen) },
        moonColour: { value: moonColour },
        texels: { value: palette.length > 0 ? TEXELS_PER_METRE : 0 },
        paletteSize: { value: palette.length },
      },
      ]),
      ...live,
    },
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData.noShadow = true;
  const { shoreBounds, texels } = material.uniforms;
  const source: CausticSource = {
    height,
    fixed: { height: { value: height }, roughness: { value: roughness }, opacity: { value: 1 }, shoreBounds, texels },
    live: { time: live.time, shoreMap: live.shoreMap, lampAt: live.lampAt, lampColour: live.lampColour },
  };
  causticSources.set(mesh, source);
  if (options.caustics) mesh.add(causticLight(mesh, source, options.caustics));

  const inverse = new THREE.Matrix4();
  const moonWorld = moonDirection();
  // The material is read each time rather than kept: a ghost of the room draws this mesh with a copy of
  // it, whose cloned uniforms are pointed back at the live ones.
  mesh.onBeforeRender = (_renderer, _scene, camera, _geometry, drawn) => {
    const uniforms = (drawn as THREE.ShaderMaterial).uniforms;
    inverse.copy(mesh.matrixWorld).invert();
    state.eye.value.setFromMatrixPosition(camera.matrixWorld).applyMatrix4(inverse);
    state.moonWay.value.copy(moonWorld).transformDirection(inverse);
    Object.assign(uniforms, live);
    uniforms.opacity.value = drawn.opacity;
  };

  const touching = options.contacts ?? [];
  return animated(mesh, (seconds) => {
    state.time.value = seconds;
    lamps.forEach((lamp, i) => {
      const waver = 1 + (lamp.flicker ?? 0) * flickerOf(seconds, lamp.signal ?? 0);
      lampColour[i].set(paletteHex(lamp.colour)).multiplyScalar(lamp.intensity * waver);
    });
    const now = typeof touching === "function" ? touching(seconds) : touching;
    if (now.length > MAX_WATER_CONTACTS) throw new Error(`Water takes at most ${MAX_WATER_CONTACTS} contacts; ${now.length} given`);
    contacts.forEach((contact, i) => {
      const c = now.at(i);
      contact.set(c?.x ?? 0, c?.z ?? 0, c?.radius ?? 0, c ? (c.strength ?? 1) : 0);
    });
  });
}
