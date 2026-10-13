import * as THREE from "three";
import type { Edge } from "../types";
import { bakeScene, bounceSampleSet, PROBE_FLOATS, probeSamples, roomSampleSet, type Gathered, type RoomLight } from "./bake";
import { lightLayout } from "./bake-finish";
import type { BakeScheduler, PassPlan } from "./bake-schedule";
import { PROBE_GRID, type Bucket, type FrozenRoom } from "./freeze";
import { BOUNCE, bounceOn, flickerOf, flickerSignal, LIGHTMAP, MAX_FLICKER, shadowMode, SOFT_SHADOWS } from "./lighting";
import { TILE } from "./room";
import { batchParts, type PartBatch } from "./part-batch";
import { disposeTree, EDGES } from "./stage";
import { pageSearch } from "./page-search";
import { paletteHex, type PaletteKey } from "./palette";
import { patchGlassShine, patchShine, setShineLights, shineLights, type ShineLights } from "./shine";

/*
 * A floor of frozen rooms, drawn with their baked light: the house has one
 * per floor, and the bench one with a single room, so a room is judged under
 * the light the house gives it. Placing rooms is the only way in, and it is
 * diffed: a room that is new, moved or rebuilt is re-baked with the rooms
 * next to it, whose light it can now block or let through. Nothing re-bakes
 * on a clock. The bake runs in the background, in passes (`bake-schedule.ts`):
 * each room shows its direct light as soon as that lands, and its bounce
 * when that does. A newer change to a room supersedes its bake in progress.
 */

/** Readies a room's shaders before it first shows, resolving once it can be
 *  drawn without stalling the frame. The house compiles them on the GPU's
 *  own threads while the room bakes; with none given, a room's shaders
 *  compile when it is first drawn. */
export type Prepare = (object: THREE.Object3D) => Promise<void>;

/** The ambient cube a moving piece is lit by, shared by all its materials. */
export type ProbeUniform = { value: THREE.Vector3[] };

export interface FloorPlacement {
  id: string;
  room: FrozenRoom;
  /** From the room's own frame to the floor's. */
  matrix: THREE.Matrix4;
}

export interface LitRoom {
  id: string;
  room: FrozenRoom;
  matrix: THREE.Matrix4;
  root: THREE.Group;
  /** Shows the cut-down wall on the edges the test names, and hides what hangs above the cut on them. */
  setCut: (isCut: (edge: Edge) => boolean) => void;
  /** The last bake: its probes, in floor axes. */
  light: RoomLight | null;
}

export interface Rebake {
  /** The rooms baked, and how long until their direct light showed. */
  rooms: string[];
  ms: number;
  /** Resolves, with how long it took from the start, once their bounce shows too; null when the page bakes none (`?bounce=off`). */
  bounce: Promise<number> | null;
}

export interface LitFloor {
  root: THREE.Group;
  rooms: Map<string, LitRoom>;
  /** Lays the floor's rooms, and resolves once what the change affects shows
   *  its direct light (its `bounce` once that shows too). A later call that
   *  re-bakes the same rooms supersedes this one's bake of them, and this
   *  one's promises then follow the later bake. */
  place: (placements: FloorPlacement[]) => Promise<Rebake>;
  /** The probe light at a point of the floor (floor frame), into `out`. */
  probeAt: (point: THREE.Vector3, out: THREE.Vector3[]) => THREE.Vector3[];
  update: (seconds: number) => void;
  dispose: () => void;
}

const CUT_VERTEX = /* glsl */ `
{
  vec4 hidden = vec4( equal( cutRole, vec4( 1.0 ) ) ) * cutEdges + vec4( equal( cutRole, vec4( 2.0 ) ) ) * ( 1.0 - cutEdges );
  if ( dot( hidden, vec4( 1.0 ) ) > 0.5 ) gl_Position = vec4( 0.0, 0.0, 2.0, 1.0 );
}`;

/** Each patch made so far, by its anchor and replacement, then by the source it was made to: every material of a
 *  kind patches the same three.js source the same way, once per material, hundreds of times as a house loads. */
const injected = new Map<string, Map<string, string>>();

function inject(source: string, anchor: string, replacement: string): string {
  const patch = `${anchor}\u0000${replacement}`;
  const made = injected.get(patch) ?? new Map<string, string>();
  injected.set(patch, made);
  const known = made.get(source);
  if (known !== undefined) return known;
  if (!source.includes(anchor)) throw new Error(`three.js's shader has no "${anchor}" to patch; check the lighting patches against this three version`);
  const result = source.replace(anchor, replacement);
  made.set(source, result);
  return result;
}

const FLICKERING_LIGHTMAP = inject(
  THREE.ShaderChunk.lights_fragment_maps,
  "irradiance += lightMapIrradiance;",
  `irradiance += lightMapIrradiance * ( 1.0 + dot( texture2D( flickerMap, vLightMapUv ) * ${MAX_FLICKER.toFixed(3)}, flickerSignal ) + lightMapTexel.a * ${MAX_FLICKER.toFixed(3)} * waterSignal );`,
);

/**
 * Soft shadows read the lightmap through a cubic B-spline, so a shadow's edge
 * curves smoothly instead of stepping with the texel grid. It is four
 * bilinear reads, each placed between two texels a way so that their blend
 * is the spline's weights for both (the usual 4×4 B-spline in 4 taps). Each
 * read is kept within the texel's own chart (`lightmapChart`, its first and
 * last texels' centres), so the filter never reaches across a seam: past a
 * chart's edge it reads the edge, as clamping a texture would.
 */
const BSPLINE_LIGHTMAP_VERTEX = /* glsl */ `
attribute vec4 lightmapChart;
varying vec4 vLightmapChart;
void main() {
  vLightmapChart = lightmapChart;`;

const BSPLINE_LIGHTMAP_FRAGMENT = /* glsl */ `
varying vec4 vLightmapChart;
vec4 lightmapBSpline( sampler2D map, vec2 uv ) {
  vec2 size = vec2( textureSize( map, 0 ) );
  vec2 st = uv * size - 0.5;
  vec2 i = floor( st );
  vec2 f = st - i;
  vec2 f2 = f * f;
  vec2 f3 = f2 * f;
  vec2 w0 = ( 1.0 - 3.0 * f + 3.0 * f2 - f3 ) / 6.0;
  vec2 w1 = ( 4.0 - 6.0 * f2 + 3.0 * f3 ) / 6.0;
  vec2 w2 = ( 1.0 + 3.0 * f + 3.0 * f2 - 3.0 * f3 ) / 6.0;
  vec2 w3 = f3 / 6.0;
  vec2 g0 = w0 + w1;
  vec2 g1 = w2 + w3;
  vec2 low = clamp( i - 0.5 + w1 / g0, vLightmapChart.xy, vLightmapChart.zw ) / size;
  vec2 high = clamp( i + 1.5 + w3 / g1, vLightmapChart.xy, vLightmapChart.zw ) / size;
  return g0.y * ( g0.x * texture2D( map, low ) + g1.x * texture2D( map, vec2( high.x, low.y ) ) )
    + g1.y * ( g0.x * texture2D( map, vec2( low.x, high.y ) ) + g1.x * texture2D( map, high ) );
}
void main() {`;

const SOFT_LIGHTMAP = inject(FLICKERING_LIGHTMAP, "vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );", "vec4 lightMapTexel = lightmapBSpline( lightMap, vLightMapUv );");

/** The ambient cube's light on a surface facing `n` (world axes), blended by the squared normal. */
const PROBE_LIGHT = /* glsl */ `
uniform vec3 probeCube[ 6 ];
vec3 probeLight( vec3 n ) {
  vec3 s = n * n;
  return s.x * ( n.x > 0.0 ? probeCube[ 0 ] : probeCube[ 1 ] )
    + s.y * ( n.y > 0.0 ? probeCube[ 2 ] : probeCube[ 3 ] )
    + s.z * ( n.z > 0.0 ? probeCube[ 4 ] : probeCube[ 5 ] );
}`;

const PROBE_FRAGMENT = /* glsl */ `
irradiance += probeLight( inverseTransformDirection( normal, viewMatrix ) );`;

/**
 * A figure lit from behind, as the camera sees it, takes a rim of that light
 * (`?backlight=off` turns it off, for comparison). The probe says which way across the floor its light
 * mostly comes from; the more that way lies beyond the figure, as the camera
 * sees it, the more of that light's surplus over the far side wraps round:
 * as a rim on the edges turned towards it, and a little onto the front. It is
 * the probe's own light and colour, added to irradiance (so shaded by the
 * surface's colour, never a glow), and nothing when the figure is lit from
 * the front or evenly. Across the floor only, so the floor's bounce from below
 * and the house's light above never count as "behind".
 */
const BACKLIGHT = { rim: 10, edge: 3, wrap: 0.5 };
const BACKLIGHT_FRAGMENT = /* glsl */ `
{
  const vec3 luma = vec3( 0.299, 0.587, 0.114 );
  vec3 across = vec3( dot( probeCube[ 0 ] - probeCube[ 1 ], luma ), 0.0, dot( probeCube[ 4 ] - probeCube[ 5 ], luma ) );
  float spread = length( across );
  if ( spread > 1e-4 ) {
    vec3 towardsLight = across / spread;
    vec3 towardsViewer = inverseTransformDirection( geometryViewDir, viewMatrix );
    vec2 viewerAcross = towardsViewer.xz;
    float behind = saturate( -dot( towardsLight.xz, viewerAcross ) / max( length( viewerAcross ), 1e-4 ) );
    vec3 surplus = max( probeLight( towardsLight ) - probeLight( -towardsLight ), vec3( 0.0 ) ) * behind;
    vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );
    // Light from behind reaches a little past the silhouette, so an edge turned square to it still catches it.
    float facing = saturate( ( dot( worldNormal, towardsLight ) + 0.6 ) / 1.6 );
    float upright = 1.0 - abs( worldNormal.y );
    float edge = pow( 1.0 - saturate( dot( normal, geometryViewDir ) ), ${BACKLIGHT.edge.toFixed(2)} );
    irradiance += surplus * upright * ( edge * facing * ${BACKLIGHT.rim.toFixed(2)} + ${BACKLIGHT.wrap.toFixed(2)} );
  }
}`;

/** Whether figures take the backlight: on unless `?backlight=off`, for comparison. */
function backlightOn(): boolean {
  const value = new URLSearchParams(pageSearch()).get("backlight") ?? "rim";
  if (value !== "rim" && value !== "off") throw new Error(`backlight=${value}: it is rim or off`);
  return value === "rim";
}

function patchCut(shader: THREE.WebGLProgramParametersWithUniforms, cut: { value: THREE.Vector4 }) {
  shader.uniforms.cutEdges = cut;
  shader.vertexShader = inject(shader.vertexShader, "void main() {", "attribute vec4 cutRole;\nuniform vec4 cutEdges;\nvoid main() {");
  shader.vertexShader = inject(shader.vertexShader, "#include <project_vertex>", `#include <project_vertex>\n${CUT_VERTEX}`);
}

function lightmapTexture(data: Uint16Array | Uint8Array, width: number, height: number, type: THREE.TextureDataType): THREE.DataTexture {
  if (shadowMode() === "soft" && LIGHTMAP.filter !== "linear") throw new Error("Soft shadows build their cubic filter from linear reads; the lightmap's filter must be linear");
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, type);
  const filter = LIGHTMAP.filter === "linear" ? THREE.LinearFilter : THREE.NearestFilter;
  texture.magFilter = filter;
  texture.minFilter = filter;
  texture.generateMipmaps = false;
  texture.channel = 1;
  texture.needsUpdate = true;
  return texture;
}

/** Lights a moving piece's lit materials by an ambient cube instead of the baked lights it can't read.
 *  A figure (unlike a swaying chandelier) also takes the backlight. */
export function patchProbe(object: THREE.Object3D, figure = true): ProbeUniform {
  const uniform: ProbeUniform = { value: Array.from({ length: 6 }, () => new THREE.Vector3()) };
  const backlight = figure && backlightOn();
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    for (const material of [child.material].flat() as THREE.Material[]) {
      if (!(material instanceof THREE.MeshLambertMaterial)) continue;
      material.onBeforeCompile = (shader) => {
        shader.uniforms.probeCube = uniform;
        shader.fragmentShader = inject(shader.fragmentShader, "void main() {", `${PROBE_LIGHT}
void main() {`);
        shader.fragmentShader = inject(shader.fragmentShader, "#include <lights_fragment_maps>", `#include <lights_fragment_maps>
${PROBE_FRAGMENT}${backlight ? BACKLIGHT_FRAGMENT : ""}`);
      };
      material.customProgramCacheKey = () => (backlight ? "betrayal-probe-backlight" : "betrayal-probe");
    }
  });
  return uniform;
}

/** How near an explorer's spot a walker takes that spot's own probe, fading from the grid's. */
const SPOT_REACH = 0.6;

function addProbe(probes: Float32Array, probe: number, weight: number, out: THREE.Vector3[]) {
  out.forEach((face, f) => {
    const at = probe * PROBE_FLOATS + f * 3;
    face.x += probes[at] * weight;
    face.y += probes[at + 1] * weight;
    face.z += probes[at + 2] * weight;
  });
}

/** One probe's light, into `out`. */
function readProbe(probes: Float32Array, probe: number, out: THREE.Vector3[]): THREE.Vector3[] {
  for (const face of out) face.set(0, 0, 0);
  addProbe(probes, probe, 1, out);
  return out;
}

/**
 * The probe light at a point in a room's frame, for a walker: the floor grid
 * read bilinearly, leaving out probes buried in a piece, and near an
 * explorer's spot, that spot's own probe.
 */
function readProbes(room: FrozenRoom, probes: Float32Array, x: number, z: number, out: THREE.Vector3[]): THREE.Vector3[] {
  const { count, spread } = PROBE_GRID;
  const cell = (v: number) => THREE.MathUtils.clamp(((v / spread + 1) / 2) * (count - 1), 0, count - 1);
  const gx = cell(x);
  const gz = cell(z);
  const i = Math.min(Math.floor(gx), count - 2);
  const j = Math.min(Math.floor(gz), count - 2);
  const fx = gx - i;
  const fz = gz - j;
  const corners: [number, number, number][] = [
    [i, j, (1 - fx) * (1 - fz)],
    [i + 1, j, fx * (1 - fz)],
    [i, j + 1, (1 - fx) * fz],
    [i + 1, j + 1, fx * fz],
  ];
  for (const face of out) face.set(0, 0, 0);
  let total = 0;
  for (const [ci, cj, weight] of corners) {
    const probe = room.probes.grid[cj * count + ci];
    if (probe === null || weight === 0) continue;
    addProbe(probes, probe, weight, out);
    total += weight;
  }
  if (total > 0) for (const face of out) face.divideScalar(total);
  else {
    // Every probe round it is buried: the nearest open one stands in.
    const open = room.probes.grid.flatMap((probe, k) => (probe === null ? [] : [{ probe, d: ((k % count) - gx) ** 2 + (Math.floor(k / count) - gz) ** 2 }]));
    const nearest = open.sort((a, b) => a.d - b.d).at(0);
    if (!nearest) throw new Error(`${room.id} has no open probe on its floor`);
    readProbe(probes, nearest.probe, out);
  }
  const spot = room.probes.spots.map((candidate) => ({ ...candidate, d: Math.hypot(candidate.x - x, candidate.z - z) })).sort((a, b) => a.d - b.d)[0] as { probe: number; d: number } | undefined;
  if (spot && spot.d < SPOT_REACH) {
    const t = 1 - spot.d / SPOT_REACH;
    for (const face of out) face.multiplyScalar(1 - t);
    addProbe(probes, spot.probe, t, out);
  }
  return out;
}

function litRoom(
  id: string,
  room: FrozenRoom,
  matrix: THREE.Matrix4,
  flicker: { value: THREE.Vector4 },
  water: { value: number },
  prepare: Prepare,
): LitRoom & {
  lightmap: THREE.DataTexture;
  flickerMap: THREE.DataTexture;
  probes: { uniform: ProbeUniform; probe: number; batch: PartBatch }[];
  /** The lights its shiny surfaces take highlights from. */
  shine: ShineLights;
  /** Resolves once its shaders are ready; `compiled` is then true. */
  prepared: Promise<void>;
  compiled: boolean;
} {
  const { width, height } = room.texels;
  const lightmap = lightmapTexture(new Uint16Array(width * height * 4), width, height, THREE.HalfFloatType);
  const flickerMap = lightmapTexture(new Uint8Array(width * height * 4), width, height, THREE.UnsignedByteType);
  const cut = { value: new THREE.Vector4() };
  const root = new THREE.Group();
  root.matrixAutoUpdate = false;
  root.matrix.copy(matrix);
  const shine = shineLights();
  const soft = shadowMode() === "soft";

  const material = ({ params }: Bucket): THREE.Material => {
    const common = { vertexColors: true, map: params.map, alphaTest: params.alphaTest, side: params.side, forceSinglePass: params.forceSinglePass, transparent: params.transparent, opacity: params.opacity, toneMapped: params.toneMapped };
    if (params.lit) {
      const lit = new THREE.MeshLambertMaterial({ ...common, lightMap: lightmap });
      lit.onBeforeCompile = (shader) => {
        patchCut(shader, cut);
        shader.uniforms.flickerMap = { value: flickerMap };
        shader.uniforms.flickerSignal = flicker;
        shader.uniforms.waterSignal = water;
        shader.fragmentShader = inject(shader.fragmentShader, "void main() {", "uniform sampler2D flickerMap;\nuniform vec4 flickerSignal;\nuniform float waterSignal;\nvoid main() {");
        shader.fragmentShader = inject(shader.fragmentShader, "#include <lights_fragment_maps>", soft ? SOFT_LIGHTMAP : FLICKERING_LIGHTMAP);
        if (soft) {
          shader.vertexShader = inject(shader.vertexShader, "void main() {", BSPLINE_LIGHTMAP_VERTEX);
          shader.fragmentShader = inject(shader.fragmentShader, "void main() {", BSPLINE_LIGHTMAP_FRAGMENT);
        }
        if (params.shine) patchShine(shader, params.shine, shine, inject);
      };
      lit.customProgramCacheKey = () => `${params.shine ? "betrayal-baked-shine" : "betrayal-baked"}${soft ? "-soft" : ""}`;
      return lit;
    }
    const unlit = new THREE.MeshBasicMaterial({ ...common, blending: params.blending, depthWrite: params.depthWrite, fog: params.fog });
    unlit.onBeforeCompile = (shader) => {
      patchCut(shader, cut);
      if (params.shine) patchGlassShine(shader, params.shine, shine, flicker, water, inject);
    };
    unlit.customProgramCacheKey = () => (params.shine ? "betrayal-cut-shine" : "betrayal-cut");
    return unlit;
  };
  for (const bucket of room.buckets) root.add(new THREE.Mesh(bucket.geometry, material(bucket)));
  const probes = room.dynamics.map(({ holder, probe, explorer }) => {
    root.add(holder);
    return { uniform: patchProbe(holder, explorer), probe, batch: batchParts(holder) };
  });

  const built = {
    id,
    room,
    matrix,
    root,
    light: null,
    lightmap,
    flickerMap,
    probes,
    shine,
    prepared: prepare(root).then(() => {
      built.compiled = true;
    }),
    compiled: false,
    setCut: (isCut: (edge: Edge) => boolean) => {
      cut.value.fromArray(EDGES.map((edge) => (isCut(edge) ? 1 : 0)));
      for (const { holder, hidesWith } of room.dynamics) holder.visible = !hidesWith.some(isCut);
    },
  };
  return built;
}

type Built = ReturnType<typeof litRoom>;

/** A room drawn without its bake, standing in for it: a ghost of a room not
 *  yet placed, or a room just placed, in flat light until its bake lands. */
export interface StandInRoom {
  root: THREE.Group;
  setCut: (isCut: (edge: Edge) => boolean) => void;
  update: (seconds: number) => void;
  dispose: () => void;
}

/** How a ghost room looks: how see-through, the colour its own colours are
 *  lit by, and how much of that it shows now (from 0 to 1), for a slow pulse. */
export interface GhostLook {
  opacity: number;
  glow: { value: THREE.Color };
  fade: { value: number };
}

// Its colours, mostly drained towards grey and lit cold: still the room, but plainly not yet a real one.
const GHOST_FRAGMENT = /* glsl */ `#include <emissivemap_fragment>
totalEmissiveRadiance += mix( diffuseColor.rgb, vec3( dot( diffuseColor.rgb, vec3( 0.299, 0.587, 0.114 ) ) ), 0.65 ) * ghostGlow;
diffuseColor.a *= ghostFade;`;

/** A ghost's lit surfaces: Lambert, lit by the scene's live light plus its own colours times the glow. */
function patchGhost(shader: THREE.WebGLProgramParametersWithUniforms, look: GhostLook) {
  shader.uniforms.ghostGlow = look.glow;
  shader.uniforms.ghostFade = look.fade;
  shader.fragmentShader = inject(shader.fragmentShader, "void main() {", "uniform vec3 ghostGlow;\nuniform float ghostFade;\nvoid main() {");
  shader.fragmentShader = inject(shader.fragmentShader, "#include <emissivemap_fragment>", GHOST_FRAGMENT);
}

/** A material of a ghost's moving piece: see-through, and its lit surfaces glowing as a ghost's do. */
function ghostPieceMaterial(material: THREE.Material, look: GhostLook): THREE.Material {
  const ghost = material.clone();
  ghost.transparent = true;
  ghost.opacity = material.opacity * look.opacity;
  if (ghost instanceof THREE.MeshLambertMaterial) {
    ghost.onBeforeCompile = (shader) => patchGhost(shader, look);
    ghost.customProgramCacheKey = () => "betrayal-ghost-piece";
  }
  return ghost;
}

/**
 * A frozen room drawn as a ghost: see-through, lit by its own colours and the
 * scene's live light instead of a bake, so it shows at once, costs about what
 * the placed room will, and reads as not yet real. Its walls cut as a placed
 * room's do.
 */
export function ghostRoom(room: FrozenRoom, look: GhostLook): StandInRoom {
  const cut = { value: new THREE.Vector4() };
  const root = new THREE.Group();
  const material = ({ params }: Bucket): THREE.Material => {
    const common = { vertexColors: true, map: params.map, alphaTest: params.alphaTest, side: params.side, forceSinglePass: params.forceSinglePass, transparent: true, opacity: params.opacity * look.opacity, toneMapped: params.toneMapped };
    if (params.lit) {
      const lit = new THREE.MeshLambertMaterial(common);
      lit.onBeforeCompile = (shader) => {
        patchCut(shader, cut);
        patchGhost(shader, look);
      };
      lit.customProgramCacheKey = () => "betrayal-ghost";
      return lit;
    }
    const unlit = new THREE.MeshBasicMaterial({ ...common, blending: params.blending, depthWrite: params.depthWrite, fog: params.fog });
    unlit.onBeforeCompile = (shader) => patchCut(shader, cut);
    unlit.customProgramCacheKey = () => "betrayal-cut";
    return unlit;
  };
  for (const bucket of room.buckets) root.add(new THREE.Mesh(bucket.geometry, material(bucket)));
  for (const { holder } of room.dynamics) {
    holder.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = false;
      const swap = (old: THREE.Material) => {
        const ghost = ghostPieceMaterial(old, look);
        old.dispose();
        return ghost;
      };
      object.material = Array.isArray(object.material) ? (object.material as THREE.Material[]).map(swap) : swap(object.material as THREE.Material);
    });
    root.add(holder);
  }
  return {
    root,
    setCut: (isCut) => {
      cut.value.fromArray(EDGES.map((edge) => (isCut(edge) ? 1 : 0)));
      for (const { holder, hidesWith } of room.dynamics) holder.visible = !hidesWith.some(isCut);
    },
    update: (seconds) => {
      for (const animation of room.animations) animation(seconds);
    },
    dispose: () => {
      root.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        for (const each of [object.material].flat() as THREE.Material[]) each.dispose();
      });
    },
  };
}

/** The light a room just placed shows in until its bake lands: the house's moon fill, even over the whole room. */
const FLAT_LIGHT = { colour: "moonLight" as PaletteKey, strength: 0.25 };

/**
 * A frozen room drawn solid in flat light: the room as placed, before its
 * bake lands. It is drawn by the baked room's own materials with an even
 * lightmap, so it needs no shaders the house hasn't already compiled for its
 * rooms, and shows the frame it is made. Its walls cut as a placed room's do.
 */
export function flatRoom(room: FrozenRoom): StandInRoom {
  const built = litRoom(room.id, room, new THREE.Matrix4(), { value: new THREE.Vector4() }, { value: 0 }, () => Promise.resolve());
  const flat = new THREE.Color(paletteHex(FLAT_LIGHT.colour)).multiplyScalar(FLAT_LIGHT.strength);
  const texel = [flat.r, flat.g, flat.b, 0].map((value) => THREE.DataUtils.toHalfFloat(value));
  const data = built.lightmap.image.data as Uint16Array;
  for (let i = 0; i < data.length; i++) data[i] = texel[i % 4];
  built.lightmap.needsUpdate = true;
  for (const { uniform } of built.probes) for (const face of uniform.value) face.set(flat.r, flat.g, flat.b);
  return {
    root: built.root,
    setCut: built.setCut,
    update: (seconds) => {
      for (const animation of room.animations) animation(seconds);
      for (const { batch } of built.probes) batch.sync();
    },
    dispose: () => {
      built.root.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        for (const each of [object.material].flat() as THREE.Material[]) each.dispose();
      });
      built.lightmap.dispose();
      built.flickerMap.dispose();
    },
  };
}

/** Every bake scene gets its own id, so workers shared between floors never confuse two. */
let scenes = 0;

/**
 * Which kinds of bake show how far they have got: those that usually take
 * more than a couple of seconds, judged from their times in the bake's debug
 * view (`?bake-debug`). The rest show only that the light is refining.
 * Measured on a 16-thread laptop (11 workers) with the fixture house, by
 * `tools/startup-perf.mjs`: the direct light of the whole house took 1.3 to
 * 1.4 s once the house was built, and the bounce 1.7 to 1.9 s more; a
 * re-bake of one room and its four neighbours took 0.6 to 0.9 s for the
 * direct light and 1 to 1.2 s more for the bounce. A device with fewer
 * cores takes several times as long: one with 4 threads has 2 workers.
 */
const SHOWS_PROGRESS = {
  /** A floor's first bake: every room on it at once. */
  firstDirect: true,
  /** A re-bake on discovering or moving a room: the room and its neighbours. */
  direct: false,
  bounce: true,
};

/** Every floor gets its own id, so its rooms' bakes never supersede another floor's. */
let floors = 0;

/** `floor` names the floor to the scheduler, which runs the bakes of the floor's rooms
 *  the player is looking at first. `joined` hears of each room as it first shows, lit. */
export function createLitFloor(bakes: BakeScheduler, floor: string, prepare: Prepare = () => Promise.resolve(), joined: (room: string) => void = () => undefined): LitFloor {
  const floorKey = `${floor}#${++floors}`;
  const keyOf = (id: string) => `${floorKey}:${id}`;
  const root = new THREE.Group();
  const flicker = { value: new THREE.Vector4() };
  const water = { value: 0 };
  const rooms = new Map<string, Built>();
  /** Rooms rebuilt where they stand (a door now shut or open), still showing as they were until the new build shows lit. */
  const outgoing = new Map<string, Built>();
  const inverse = new THREE.Matrix4();
  const local = new THREE.Vector3();

  const remove = (built: Built) => {
    root.remove(built.root);
    for (const child of built.root.children) {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    }
    built.lightmap.dispose();
    built.flickerMap.dispose();
  };

  const probeAt = (point: THREE.Vector3, out: THREE.Vector3[]) => {
    let nearest: Built | null = null;
    let best = Infinity;
    for (const built of rooms.values()) {
      if (!built.light) continue;
      local.copy(point).applyMatrix4(inverse.copy(built.matrix).invert());
      const outside = Math.max(Math.abs(local.x), Math.abs(local.z)) - TILE / 2;
      if (outside < best) {
        best = outside;
        nearest = built;
      }
    }
    if (!nearest?.light) return out.map((face) => face.set(0, 0, 0));
    local.copy(point).applyMatrix4(inverse.copy(nearest.matrix).invert());
    return readProbes(nearest.room, nearest.light.probes, local.x, local.z, out);
  };

  const show = (built: Built, light: RoomLight) => {
    built.light = light;
    built.lightmap.image.data = light.irradiance;
    built.lightmap.needsUpdate = true;
    built.flickerMap.image.data = light.flicker;
    built.flickerMap.needsUpdate = true;
    for (const { uniform, probe } of built.probes) readProbe(light.probes, probe, uniform.value);
    // A new room shows once it has its light, never black while it bakes, and its shaders, so it never stalls a frame.
    const appear = () => {
      if (rooms.get(built.id) !== built || built.root.parent === root) return;
      root.add(built.root);
      const old = outgoing.get(built.id);
      if (old) remove(old);
      outgoing.delete(built.id);
      joined(built.id);
    };
    if (built.compiled) appear();
    else void built.prepared.then(appear);
  };

  /** A room's passes: its direct light, then (unless the page asks for none) its bounce, added to it.
   *  A worker lays each into the room's lightmap; here it is only shown. */
  const passesOf = (built: Built, first: boolean): PassPlan[] => {
    const layout = lightLayout(built.room);
    // Only the probes are laid out here: the lanes lay out the texels, chunk by chunk.
    const probes = probeSamples(built);
    let direct: Gathered | null = null;
    const passes: PassPlan[] = [
      {
        pass: "direct",
        samples: roomSampleSet(built, probes),
        // A lamp with a size costs a shadow ray for each point of it a sample aims at.
        cost: shadowMode() === "soft" ? SOFT_SHADOWS.rays : 1,
        progress: first ? SHOWS_PROGRESS.firstDirect : SHOWS_PROGRESS.direct,
        finish: (light) => {
          direct = light;
          return { kind: "direct", layout, light };
        },
        show: (light) => {
          show(built, light);
        },
      },
    ];
    if (bounceOn()) {
      passes.push({
        pass: "bounce",
        samples: bounceSampleSet(built, BOUNCE.step, probes),
        // Each ray reads the direct light where it lands: about a direct sample's work.
        cost: BOUNCE.rays,
        progress: SHOWS_PROGRESS.bounce,
        finish: (coarse) => {
          if (!direct) throw new Error(`${built.id}'s bounce was in before its direct light`);
          return { kind: "bounce", layout, direct, coarse };
        },
        show: (light) => {
          show(built, light);
        },
      });
    }
    return passes;
  };

  const place = (placements: FloorPlacement[]): Promise<Rebake> => {
    const started = performance.now();
    const first = rooms.size === 0;
    const changed = new Set<string>();
    const centres: THREE.Vector3[] = [];
    const centre = (matrix: THREE.Matrix4) => new THREE.Vector3().setFromMatrixPosition(matrix);
    for (const [id, built] of rooms) {
      const next = placements.find((placement) => placement.id === id);
      if (next && next.room === built.room && next.matrix.equals(built.matrix)) continue;
      changed.add(id);
      centres.push(centre(built.matrix));
      bakes.cancel(keyOf(id));
      rooms.delete(id);
      if (next?.matrix.equals(built.matrix) && built.root.parent === root && !outgoing.has(id)) outgoing.set(id, built);
      else remove(built);
    }
    for (const [id, old] of outgoing) {
      if (placements.some((placement) => placement.id === id && placement.matrix.equals(old.matrix))) continue;
      remove(old);
      outgoing.delete(id);
    }
    for (const { id, room, matrix } of placements) {
      if (rooms.has(id)) continue;
      changed.add(id);
      centres.push(centre(matrix));
      rooms.set(id, litRoom(id, room, matrix, flicker, water, prepare));
    }
    // A change re-bakes the rooms next to it too: their light now meets new walls and doorways.
    const affected = new Set([...rooms.values()].filter((built) => changed.has(built.id) || centres.some((at) => at.distanceTo(centre(built.matrix)) < TILE * 1.01)).map((built) => built.id));
    if (affected.size === 0) return Promise.resolve({ rooms: [], ms: performance.now() - started, bounce: null });
    const all = [...rooms.values()].map((built) => ({ room: built.room, matrix: built.matrix }));
    const scene = bakeScene(all);
    const sceneId = ++scenes;
    const baking = [...rooms.values()].filter((built) => affected.has(built.id));
    for (const built of baking) setShineLights(built.shine, scene.lamps, scene.moon, scene.moonRgb, built.matrix);
    const submitted = baking.map((built) => bakes.submit({ key: keyOf(built.id), floor, room: built.id, scene, sceneId, passes: passesOf(built, first) }));
    // Shown once each room has its direct light and its shaders; a room dropped meanwhile by a later change no longer counts.
    const shown = Promise.all(submitted.map(({ passes }) => passes[0])).then(() => Promise.all(baking.filter((built) => rooms.get(built.id) === built).map((built) => built.prepared)));
    const bounce = bounceOn() ? Promise.all(submitted.map(({ done }) => done)).then(() => performance.now() - started) : null;
    return shown.then(() => ({ rooms: [...affected], ms: performance.now() - started, bounce }));
  };

  return {
    root,
    rooms,
    place,

    probeAt,
    update: (seconds) => {
      flickerSignal(seconds, flicker.value);
      water.value = flickerOf(seconds, "water");
      for (const built of rooms.values()) {
        for (const animation of built.room.animations) animation(seconds);
        for (const { batch } of built.probes) batch.sync();
      }
    },
    dispose: () => {
      for (const built of [...rooms.values(), ...outgoing.values()]) {
        bakes.cancel(keyOf(built.id));
        remove(built);
        for (const { holder } of built.room.dynamics) disposeTree(holder);
      }
      rooms.clear();
      outgoing.clear();
    },
  };
}
