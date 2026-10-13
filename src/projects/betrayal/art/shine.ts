/*
 * Presets (SHINES): silver, brass, tarnishedBrass, gilt, pewter, copper, iron,
 * glass, glazedChina, wax, marble, honedMarble, polishedWood, lacquer, wetStone.
 *
 * The rule: light makes shine; textures never paint it. A room has one set of
 * textures, with no painted glints, speckles, pale bevels or "reflection"
 * tones, and marks its shiny surfaces with a preset. `?shine=off` only turns
 * the real highlights off, for comparison: it never brings painted shine
 * back, so no code reads `shineOn` to pick a texture or a tone.
 *
 * Shine is for things that clearly shine: metal, mirrors, glass, glaze, wax
 * and polished furniture on a room's props. A room's shell never shines:
 * floors, walls, wainscot and trim are matte, marble and panelling included,
 * since this is an old, dusty house, not a showroom, and a lamp's gleam on a
 * floor draws the eye from the figures. The one exception is the windows'
 * glass, which the stage marks itself.
 *
 * A faint gleam can't be made with `reflectance` alone: it sets only the
 * reflection head on (F0), and the shader's Fresnel takes every surface
 * towards reflecting all the light at a grazing angle whatever its F0, so a
 * lamp low beside a surface, or a low camera, still leaves a bright gleam
 * (the halls' marble floor showed as much at reflectance 0.002 as at 0). A
 * preset that must be faint needs its grazing reflection (F90) scaled too, as
 * three's `specularIntensity` scales both.
 */
import * as THREE from "three";
import type { Lamp } from "./bake";
import { FLICKER_CHANNELS, MAX_FLICKER } from "./lighting";
import { pageSearch } from "./page-search";
import { TILE } from "./room";
import type { Batch } from "./shapes";

/*
 * Highlights on shiny surfaces, from the room's own lights, worked out live
 * in the shader, on everywhere (`?shine=off` draws none, for comparison).
 * A surface is marked shiny in three.js's own terms,
 * `roughness` and `metalness`, and keeps the house's Lambert-plus-bake look,
 * with a GGX highlight added for each baked lamp near it, the moon, and the
 * live lights three already gives the shader. No reflections: from the
 * house's high camera only light reads.
 *
 * A metal's highlight takes its colour, and its diffuse light is dimmed by
 * its metalness; what is left of the room's light on it comes back as the
 * even sheen a metal shows in a room lit all round (the baked irradiance,
 * reflected by the same Fresnel as its highlights), so silver reads as
 * silver, not black.
 *
 * Shadowing: the bake keeps no light per lamp, but it keeps, per texel, how
 * much of the light came from each flicker signal. Each lamp's highlight is
 * shown as far as the bake's light from its signal matches what the lamp
 * would give unshadowed there: a lamp the bake says is blocked shows none.
 * Steady lights (the moon, a lamp that doesn't flicker) share what the bake
 * has left over once the flickering light is taken out.
 */

/** How a surface takes highlights, in three.js's terms: `roughness` 0 is a
 *  mirror's sharp highlight, 1 none to speak of; `metalness` 1 is bare metal,
 *  whose highlight takes its colour and whose diffuse light it loses;
 *  `reflectance` is how much a non-metal reflects head on (its F0), 0.04 for
 *  most stone, wood and paint unless set (it doesn't dim the grazing gleam:
 *  see the header). */
export interface Shine {
  roughness: number;
  metalness: number;
  reflectance?: number;
}

/** A non-metal's reflectance head on, unless its shine sets one. */
const REFLECTANCE = 0.04;

/** Common shines, so a room marks a surface by what it is, never by numbers. */
export const SHINES = {
  /** Polished silver plate, cutlery. */
  silver: { roughness: 0.32, metalness: 1 },
  /** Kept brass: candlesticks, handles, lamp fittings. */
  brass: { roughness: 0.4, metalness: 1 },
  /** Old brass, gone dull: a trunk's fittings, a neglected lantern. */
  tarnishedBrass: { roughness: 0.62, metalness: 1 },
  /** Gilt mouldings: a frame's gold leaf. */
  gilt: { roughness: 0.5, metalness: 1 },
  pewter: { roughness: 0.62, metalness: 1 },
  /** Copper pans and kettles. */
  copper: { roughness: 0.45, metalness: 1 },
  /** Blackened or wrought iron. Its black coat, not bare metal, takes the light: a broad, pale sheen. */
  iron: { roughness: 0.55, metalness: 0 },
  /** Panes, bottles, a decanter: a faint, sharp glint. */
  glass: { roughness: 0.1, metalness: 0 },
  /** Glazed china and earthenware, tiles. */
  glazedChina: { roughness: 0.22, metalness: 0 },
  /** Candle wax: a soft sheen. */
  wax: { roughness: 0.6, metalness: 0 },
  /** Polished marble. */
  marble: { roughness: 0.35, metalness: 0 },
  /** Honed or worn marble and polished stone. */
  honedMarble: { roughness: 0.6, metalness: 0 },
  /** Waxed or varnished wood: panelling, good furniture. */
  polishedWood: { roughness: 0.42, metalness: 0 },
  /** Lacquer and enamel paint: a piano, a japanned box. */
  lacquer: { roughness: 0.26, metalness: 0 },
  /** Wet stone and slick earth: a puddle, a wet footprint, the stones at a lake's edge. A prop, never a floor. */
  wetStone: { roughness: 0.3, metalness: 0 },
} as const satisfies Record<string, Shine>;

/** Whether this page draws highlights: `lights` (the default), or `?shine=off` to compare the house without them. */
export function shineOn(): boolean {
  const value = new URLSearchParams(pageSearch()).get("shine") ?? "lights";
  if (value !== "lights" && value !== "off") throw new Error(`shine=${value}: it is lights or off`);
  return value === "lights";
}

/** Marks a material shiny. A room's surfaces are merged by how they draw, so shiny ones merge only with the same shine. */
export function shiny<M extends THREE.Material>(material: M, shine: Shine): M {
  for (const [key, value] of Object.entries(shine)) if (!(value >= 0 && value <= 1)) throw new Error(`A shine's ${key} is ${value}; it runs from 0 to 1`);
  material.userData.shine = shine;
  return material;
}

/** Marks every material under an object shiny that the test picks (by default all of them). */
export function shinyAll(object: THREE.Object3D, shine: Shine, pick: (material: THREE.Material) => boolean = () => true): void {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    for (const material of [child.material].flat() as THREE.Material[]) if (pick(material)) shiny(material, shine);
  });
}

/** A batch's boxes as one mesh that takes highlights: a room's fittings, batched apart from what doesn't shine. */
export function shinyBatch(b: Batch, shine: Shine): THREE.Mesh {
  const mesh = b.mesh();
  shiny(mesh.material, shine);
  return mesh;
}

/** A material's shine, when this page draws highlights. */
export function shineOf(material: THREE.Material): Shine | null {
  return shineOn() ? ((material.userData as { shine?: Shine }).shine ?? null) : null;
}

/** The most lamps one room's highlights read: the nearest, when more reach it. */
export const SHINE_LAMPS = 8;
/** A lamp's channel when it doesn't flicker: after the four flame signals and water's. */
const STEADY = FLICKER_CHANNELS + 1;

/** The lights a room's highlights come from, in the room's own frame, as uniforms all its shiny materials share. */
export interface ShineLights {
  /** Position, and range in w. */
  shineLampAt: { value: THREE.Vector4[] };
  /** Linear colour times intensity, and flicker depth in w. */
  shineLampColour: { value: THREE.Vector4[] };
  /** The flicker signal: 0–3 the flames, 4 water, 5 steady. */
  shineLampChannel: { value: number[] };
  shineLampCount: { value: number };
  /** Towards the moon, and its light. */
  shineMoon: { value: THREE.Vector3 };
  shineMoonColour: { value: THREE.Vector3 };
}

export function shineLights(): ShineLights {
  return {
    shineLampAt: { value: Array.from({ length: SHINE_LAMPS }, () => new THREE.Vector4()) },
    shineLampColour: { value: Array.from({ length: SHINE_LAMPS }, () => new THREE.Vector4()) },
    shineLampChannel: { value: Array.from({ length: SHINE_LAMPS }, () => 0) },
    shineLampCount: { value: 0 },
    shineMoon: { value: new THREE.Vector3(0, 1, 0) },
    shineMoonColour: { value: new THREE.Vector3() },
  };
}

/**
 * Sets a room's lights from its floor's bake: the lamps whose range reaches
 * its tile, nearest first, and the moon, all turned into the room's frame
 * (`matrix` takes the room's frame to the floor's).
 */
export function setShineLights(lights: ShineLights, lamps: readonly Lamp[], moon: readonly number[], moonRgb: readonly number[], matrix: THREE.Matrix4): void {
  const toRoom = matrix.clone().invert();
  const half = TILE / 2;
  const reaching = lamps
    .map((lamp) => {
      const at = new THREE.Vector3(...lamp.at).applyMatrix4(toRoom);
      const outside = Math.hypot(Math.max(0, Math.abs(at.x) - half), Math.max(0, Math.abs(at.z) - half));
      return { lamp, at, outside };
    })
    .filter(({ lamp, outside }) => outside < lamp.range)
    .sort((a, b) => a.outside - b.outside)
    .slice(0, SHINE_LAMPS);
  reaching.forEach(({ lamp, at }, i) => {
    lights.shineLampAt.value[i].set(at.x, at.y, at.z, lamp.range);
    lights.shineLampColour.value[i].set(...lamp.rgb, lamp.flicker);
    lights.shineLampChannel.value[i] = lamp.flicker > 0 ? lamp.channel : STEADY;
  });
  lights.shineLampCount.value = reaching.length;
  lights.shineMoon.value.set(moon[0], moon[1], moon[2]).transformDirection(toRoom);
  lights.shineMoonColour.value.set(moonRgb[0], moonRgb[1], moonRgb[2]);
}

/**
 * How far the bake's light from a signal, over what its lamps would give
 * unshadowed, counts as lit: below `from` none of their highlight shows, from
 * `to` all of it. Not 0 and 1, because the bounce adds light from the same
 * signals in shadow, and the lightmap's texels blur a shadow's edge.
 */
const VISIBLE = { from: 0.3, to: 0.8 };

const SHINE_VERTEX_PARS = /* glsl */ `
varying vec3 vShinePosition;
varying vec3 vShineNormal;
varying vec3 vShineEye;`;

/** In the room's own frame, where the lamps are: the point, its face's way, and the camera. */
const SHINE_VERTEX = /* glsl */ `
{
  mat4 toRoom = inverse( modelMatrix );
  vShinePosition = transformed;
  vShineNormal = objectNormal;
  vShineEye = ( toRoom * vec4( cameraPosition, 1.0 ) ).xyz;
}`;

const SHINE_PARS = /* glsl */ `
uniform vec4 shineLampAt[ ${SHINE_LAMPS} ];
uniform vec4 shineLampColour[ ${SHINE_LAMPS} ];
uniform float shineLampChannel[ ${SHINE_LAMPS} ];
uniform int shineLampCount;
uniform vec3 shineMoon;
uniform vec3 shineMoonColour;
uniform float shineRoughness;
uniform float shineMetalness;
uniform float shineReflectance;
varying vec3 vShinePosition;
varying vec3 vShineNormal;
varying vec3 vShineEye;

const vec3 SHINE_LUMA = vec3( 0.2126, 0.7152, 0.0722 );

/** The bake's falloff for a point light (three's, decay 2). */
float shineFalloff( float distance, float range ) {
  float ratio = distance / range;
  float cut = saturate( 1.0 - ratio * ratio * ratio * ratio );
  return cut * cut / max( distance * distance, 0.01 );
}

/** GGX with Smith's height-correlated visibility and Schlick's Fresnel, times the cosine: three's own BRDF_GGX. */
vec3 shineGGX( vec3 n, vec3 v, vec3 l, vec3 f0, float roughness ) {
  vec3 h = normalize( l + v );
  float nl = saturate( dot( n, l ) );
  float nv = max( dot( n, v ), 1e-3 );
  float nh = saturate( dot( n, h ) );
  float vh = saturate( dot( v, h ) );
  float a2 = pow4( roughness );
  float d = nh * nh * ( a2 - 1.0 ) + 1.0;
  float distribution = a2 / ( PI * d * d );
  float visibility = 0.5 / max( nl * sqrt( nv * nv * ( 1.0 - a2 ) + a2 ) + nv * sqrt( nl * nl * ( 1.0 - a2 ) + a2 ), 1e-6 );
  vec3 fresnel = f0 + ( 1.0 - f0 ) * pow( 1.0 - vh, 5.0 );
  return fresnel * ( distribution * visibility * nl );
}

/** The share of light a rough surface reflects from all round (Karis's fit to the split sum). */
vec3 shineAllRound( vec3 f0, float roughness, float nv ) {
  vec4 r = roughness * vec4( -1.0, -0.0275, -0.572, 0.022 ) + vec4( 1.0, 0.0425, 1.04, -0.04 );
  float a004 = min( r.x * r.x, exp2( -9.28 * nv ) ) * r.x + r.y;
  vec2 ab = vec2( -1.04, 1.04 ) * a004 + r.zw;
  return f0 * ab.x + ab.y;
}

vec3 shineSpecular = vec3( 0.0 );
vec3 shineF0 = vec3( 0.04 );

/** Each lamp's highlight, by signal (0–3 the flames, 4 water, 5 steady), with what the lamps of each would light unshadowed. */
void shineLamps( vec3 n, vec3 v, vec4 flames, float water, out vec3 highlight[ 6 ], out float weighted[ 6 ], out float plain[ 6 ] ) {
  for ( int c = 0; c < 6; c ++ ) {
    highlight[ c ] = vec3( 0.0 );
    weighted[ c ] = 0.0;
    plain[ c ] = 0.0;
  }
  for ( int i = 0; i < ${SHINE_LAMPS}; i ++ ) {
    if ( i >= shineLampCount ) break;
    vec3 toLamp = shineLampAt[ i ].xyz - vShinePosition;
    float distance = length( toLamp );
    vec3 l = toLamp / max( distance, 1e-4 );
    float nl = dot( n, l );
    if ( nl <= 0.0 || distance >= shineLampAt[ i ].w ) continue;
    int c = int( shineLampChannel[ i ] + 0.5 );
    vec3 colour = shineLampColour[ i ].rgb * shineFalloff( distance, shineLampAt[ i ].w );
    float flicker = shineLampColour[ i ].w;
    float signal = c < 4 ? flames[ c ] : c == 4 ? water : 0.0;
    highlight[ c ] += shineGGX( n, v, l, shineF0, shineRoughness ) * colour * ( 1.0 + flicker * signal );
    float lit = dot( colour, SHINE_LUMA ) * nl;
    weighted[ c ] += flicker * lit;
    plain[ c ] += lit;
  }
}`;

/** The baked lamps' and the moon's highlights, each shown as far as the bake says its light reaches here. */
const SHINE_BAKED = /* glsl */ `
{
  vec3 n = normalize( vShineNormal ) * ( gl_FrontFacing ? 1.0 : -1.0 );
  vec3 v = normalize( vShineEye - vShinePosition );
  vec3 highlight[ 6 ];
  float weighted[ 6 ];
  float plain[ 6 ];
  shineLamps( n, v, flickerSignal, waterSignal, highlight, weighted, plain );
  float baked = dot( lightMapIrradiance, SHINE_LUMA );
  vec4 shares = texture2D( flickerMap, vLightMapUv ) * ${MAX_FLICKER.toFixed(3)};
  float waterShare = lightMapTexel.a * ${MAX_FLICKER.toFixed(3)};
  float leftOver = baked;
  for ( int c = 0; c < 5; c ++ ) {
    if ( weighted[ c ] <= 0.0 ) continue;
    float share = c < 4 ? shares[ c ] : waterShare;
    float shown = smoothstep( ${VISIBLE.from.toFixed(3)}, ${VISIBLE.to.toFixed(3)}, share * baked / weighted[ c ] );
    shineSpecular += highlight[ c ] * shown;
    leftOver -= plain[ c ] * shown;
  }
  float moonCos = dot( n, shineMoon );
  vec3 moonHighlight = moonCos > 0.0 ? shineGGX( n, v, shineMoon, shineF0, shineRoughness ) * shineMoonColour : vec3( 0.0 );
  float steady = plain[ 5 ] + max( moonCos, 0.0 ) * dot( shineMoonColour, SHINE_LUMA );
  if ( steady > 0.0 ) shineSpecular += ( highlight[ 5 ] + moonHighlight ) * smoothstep( ${VISIBLE.from.toFixed(3)}, ${VISIBLE.to.toFixed(3)}, leftOver / steady );
  // A metal's light from all round, the bake's and the fill's, comes back as an even sheen by the same Fresnel, in place of
  // the diffuse light it lost. Not a stone's or a wood's: theirs would be a uniform glaze, as if the dark room were evenly bright.
  shineSpecular += shineAllRound( shineF0, shineRoughness, max( dot( n, v ), 1e-3 ) ) * irradiance * RECIPROCAL_PI * shineMetalness;
}`;

/** The live lights three gives the shader (the explorer's light, a carried flame), shadows and all: a highlight each. */
const SHINE_LIVE = /* glsl */ `
void RE_Direct_Shine( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
  RE_Direct_Lambert( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
  shineSpecular += shineGGX( geometryNormal, geometryViewDir, directLight.direction, shineF0, shineRoughness ) * directLight.color;
}
#undef RE_Direct
#define RE_Direct RE_Direct_Shine`;

/** The way a lit material's anchors are patched. */
type Inject = (source: string, anchor: string, replacement: string) => string;

/** Uniforms one shiny material reads. */
function shineUniforms(shader: THREE.WebGLProgramParametersWithUniforms, shine: Shine, lights: ShineLights) {
  Object.assign(shader.uniforms, lights, { shineRoughness: { value: Math.max(shine.roughness, 0.045) }, shineMetalness: { value: shine.metalness }, shineReflectance: { value: shine.reflectance ?? REFLECTANCE } });
}

function patchVertex(shader: THREE.WebGLProgramParametersWithUniforms, inject: Inject) {
  shader.vertexShader = inject(shader.vertexShader, "void main() {", `${SHINE_VERTEX_PARS}\nvoid main() {`);
  shader.vertexShader = inject(shader.vertexShader, "#include <project_vertex>", `#include <project_vertex>\n${SHINE_VERTEX}`);
}

/**
 * Patches a lightmapped room material with highlights. It runs after the
 * flickering lightmap's patch, whose uniforms (`flickerMap`, `flickerSignal`,
 * `waterSignal`) it reads.
 */
export function patchShine(shader: THREE.WebGLProgramParametersWithUniforms, shine: Shine, lights: ShineLights, inject: Inject): void {
  shineUniforms(shader, shine, lights);
  patchVertex(shader, inject);
  shader.fragmentShader = inject(shader.fragmentShader, "#include <lights_lambert_pars_fragment>", `#include <lights_lambert_pars_fragment>\n${SHINE_PARS}\n${SHINE_LIVE}`);
  shader.fragmentShader = inject(
    shader.fragmentShader,
    "#include <lights_lambert_fragment>",
    "shineF0 = mix( vec3( shineReflectance ), diffuseColor.rgb, shineMetalness );\n#include <lights_lambert_fragment>\nmaterial.diffuseColor *= 1.0 - shineMetalness;",
  );
  shader.fragmentShader = inject(shader.fragmentShader, "#include <lights_fragment_end>", `${SHINE_BAKED}\n#include <lights_fragment_end>`);
  shader.fragmentShader = inject(shader.fragmentShader, "vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;", "vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance + shineSpecular;");
}

/**
 * Patches an unlit surface that is its own light, glass lit from behind, with
 * the room's lamps' highlights over it. It reads no lightmap, so nothing
 * shadows them: glass is in the walls, facing the lamps of its room.
 */
export function patchGlassShine(shader: THREE.WebGLProgramParametersWithUniforms, shine: Shine, lights: ShineLights, flicker: { value: THREE.Vector4 }, water: { value: number }, inject: Inject): void {
  shineUniforms(shader, shine, lights);
  Object.assign(shader.uniforms, { flickerSignal: flicker, waterSignal: water });
  shader.vertexShader = inject(shader.vertexShader, "#include <project_vertex>", "vec3 objectNormal = vec3( normal );\n#include <project_vertex>");
  patchVertex(shader, inject);
  shader.fragmentShader = inject(shader.fragmentShader, "void main() {", `uniform vec4 flickerSignal;\nuniform float waterSignal;\n${SHINE_PARS}\nvoid main() {`);
  shader.fragmentShader = inject(
    shader.fragmentShader,
    "#include <opaque_fragment>",
    `{
  vec3 n = normalize( vShineNormal ) * ( gl_FrontFacing ? 1.0 : -1.0 );
  vec3 v = normalize( vShineEye - vShinePosition );
  vec3 highlight[ 6 ];
  float weighted[ 6 ];
  float plain[ 6 ];
  shineLamps( n, v, flickerSignal, waterSignal, highlight, weighted, plain );
  for ( int c = 0; c < 6; c ++ ) outgoingLight += highlight[ c ];
}
#include <opaque_fragment>`,
  );
}
