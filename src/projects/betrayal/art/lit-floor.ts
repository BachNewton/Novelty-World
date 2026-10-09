import * as THREE from "three";
import type { Edge } from "../types";
import { bakeScene, PROBE_FLOATS, PROBE_SPREAD, roomLight, roomSamples, type Baker, type RoomLight } from "./bake";
import type { Bucket, FrozenRoom } from "./freeze";
import { flickerSignal, LIGHTMAP, MAX_FLICKER } from "./lighting";
import { TILE } from "./room";
import { EDGES } from "./stage";

/*
 * A floor of frozen rooms, drawn with their baked light: the house has one
 * per floor, and the bench one with a single room, so a room is judged under
 * the light the house gives it. Placing rooms is the only way in, and it is
 * diffed: a room that is new, moved or rebuilt is re-baked with the rooms
 * next to it, whose light it can now block or let through. Nothing re-bakes
 * on a clock.
 */

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
  /** The rooms baked, and how long it took. */
  rooms: string[];
  ms: number;
}

export interface LitFloor {
  root: THREE.Group;
  rooms: Map<string, LitRoom>;
  /** Lays the floor's rooms, and resolves once what the change affects is
   *  re-baked. Calls run one after another, in the order made. */
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

function inject(source: string, anchor: string, replacement: string): string {
  if (!source.includes(anchor)) throw new Error(`three.js's shader has no "${anchor}" to patch; check the lighting patches against this three version`);
  return source.replace(anchor, replacement);
}

const FLICKERING_LIGHTMAP = inject(
  THREE.ShaderChunk.lights_fragment_maps,
  "irradiance += lightMapIrradiance;",
  `irradiance += lightMapIrradiance * ( 1.0 + dot( texture2D( flickerMap, vLightMapUv ) * ${MAX_FLICKER.toFixed(3)}, flickerSignal ) );`,
);

const PROBE_FRAGMENT = /* glsl */ `
{
  vec3 probeNormal = inverseTransformDirection( normal, viewMatrix );
  vec3 probeSquared = probeNormal * probeNormal;
  irradiance += probeSquared.x * ( probeNormal.x > 0.0 ? probeCube[ 0 ] : probeCube[ 1 ] )
    + probeSquared.y * ( probeNormal.y > 0.0 ? probeCube[ 2 ] : probeCube[ 3 ] )
    + probeSquared.z * ( probeNormal.z > 0.0 ? probeCube[ 4 ] : probeCube[ 5 ] );
}`;

function patchCut(shader: THREE.WebGLProgramParametersWithUniforms, cut: { value: THREE.Vector4 }) {
  shader.uniforms.cutEdges = cut;
  shader.vertexShader = inject(shader.vertexShader, "void main() {", "attribute vec4 cutRole;\nuniform vec4 cutEdges;\nvoid main() {");
  shader.vertexShader = inject(shader.vertexShader, "#include <project_vertex>", `#include <project_vertex>\n${CUT_VERTEX}`);
}

function lightmapTexture(data: Uint16Array | Uint8Array, width: number, height: number, type: THREE.TextureDataType): THREE.DataTexture {
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, type);
  const filter = LIGHTMAP.filter === "linear" ? THREE.LinearFilter : THREE.NearestFilter;
  texture.magFilter = filter;
  texture.minFilter = filter;
  texture.generateMipmaps = false;
  texture.channel = 1;
  texture.needsUpdate = true;
  return texture;
}

/** Lights a moving piece's lit materials by an ambient cube instead of the baked lights it can't read. */
export function patchProbe(object: THREE.Object3D): ProbeUniform {
  const uniform: ProbeUniform = { value: Array.from({ length: 6 }, () => new THREE.Vector3()) };
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    for (const material of [child.material].flat() as THREE.Material[]) {
      if (!(material instanceof THREE.MeshLambertMaterial)) continue;
      material.onBeforeCompile = (shader) => {
        shader.uniforms.probeCube = uniform;
        shader.fragmentShader = inject(shader.fragmentShader, "void main() {", "uniform vec3 probeCube[ 6 ];\nvoid main() {");
        shader.fragmentShader = inject(shader.fragmentShader, "#include <lights_fragment_maps>", `#include <lights_fragment_maps>\n${PROBE_FRAGMENT}`);
      };
      material.customProgramCacheKey = () => "betrayal-probe";
    }
  });
  return uniform;
}

/** The probe light at a point in a room's frame: the room's 3 × 3 grid, read bilinearly. */
function readProbes(probes: Float32Array, x: number, z: number, out: THREE.Vector3[]): THREE.Vector3[] {
  const gx = THREE.MathUtils.clamp(x / PROBE_SPREAD + 1, 0, 2);
  const gz = THREE.MathUtils.clamp(z / PROBE_SPREAD + 1, 0, 2);
  const i = Math.min(Math.floor(gx), 1);
  const j = Math.min(Math.floor(gz), 1);
  const fx = gx - i;
  const fz = gz - j;
  const corners: [number, number, number][] = [
    [i, j, (1 - fx) * (1 - fz)],
    [i + 1, j, fx * (1 - fz)],
    [i, j + 1, (1 - fx) * fz],
    [i + 1, j + 1, fx * fz],
  ];
  out.forEach((face, f) => {
    face.set(0, 0, 0);
    for (const [ci, cj, weight] of corners) {
      const at = (cj * 3 + ci) * PROBE_FLOATS + f * 3;
      face.x += probes[at] * weight;
      face.y += probes[at + 1] * weight;
      face.z += probes[at + 2] * weight;
    }
  });
  return out;
}

function litRoom(id: string, room: FrozenRoom, matrix: THREE.Matrix4, flicker: { value: THREE.Vector4 }): LitRoom & { lightmap: THREE.DataTexture; flickerMap: THREE.DataTexture; probes: { uniform: ProbeUniform; at: THREE.Vector3 }[] } {
  const { width, height } = room.texels;
  const lightmap = lightmapTexture(new Uint16Array(width * height * 4), width, height, THREE.HalfFloatType);
  const flickerMap = lightmapTexture(new Uint8Array(width * height * 4), width, height, THREE.UnsignedByteType);
  const cut = { value: new THREE.Vector4() };
  const root = new THREE.Group();
  root.matrixAutoUpdate = false;
  root.matrix.copy(matrix);

  const material = ({ params }: Bucket): THREE.Material => {
    const common = { vertexColors: true, map: params.map, alphaTest: params.alphaTest, side: params.side, transparent: params.transparent, opacity: params.opacity, toneMapped: params.toneMapped };
    if (params.lit) {
      const lit = new THREE.MeshLambertMaterial({ ...common, lightMap: lightmap });
      lit.onBeforeCompile = (shader) => {
        patchCut(shader, cut);
        shader.uniforms.flickerMap = { value: flickerMap };
        shader.uniforms.flickerSignal = flicker;
        shader.fragmentShader = inject(shader.fragmentShader, "void main() {", "uniform sampler2D flickerMap;\nuniform vec4 flickerSignal;\nvoid main() {");
        shader.fragmentShader = inject(shader.fragmentShader, "#include <lights_fragment_maps>", FLICKERING_LIGHTMAP);
      };
      lit.customProgramCacheKey = () => "betrayal-baked";
      return lit;
    }
    const unlit = new THREE.MeshBasicMaterial({ ...common, blending: params.blending, depthWrite: params.depthWrite, fog: params.fog });
    unlit.onBeforeCompile = (shader) => patchCut(shader, cut);
    unlit.customProgramCacheKey = () => "betrayal-cut";
    return unlit;
  };
  for (const bucket of room.buckets) root.add(new THREE.Mesh(bucket.geometry, material(bucket)));
  const probes = room.dynamics.map(({ holder, at }) => {
    root.add(holder);
    return { uniform: patchProbe(holder), at };
  });

  return {
    id,
    room,
    matrix,
    root,
    light: null,
    lightmap,
    flickerMap,
    probes,
    setCut: (isCut) => {
      cut.value.fromArray(EDGES.map((edge) => (isCut(edge) ? 1 : 0)));
    },
  };
}

type Built = ReturnType<typeof litRoom>;

/** Every bake scene gets its own id, so workers shared between floors never confuse two. */
let scenes = 0;

export function createLitFloor(baker: Baker): LitFloor {
  const root = new THREE.Group();
  const flicker = { value: new THREE.Vector4() };
  const rooms = new Map<string, Built>();
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
    return readProbes(nearest.light.probes, local.x, local.z, out);
  };

  let queue: Promise<void> = Promise.resolve();
  const place = async (placements: FloorPlacement[]): Promise<Rebake> => {
    const started = performance.now();
    const changed = new Set<string>();
    const centres: THREE.Vector3[] = [];
    const centre = (matrix: THREE.Matrix4) => new THREE.Vector3().setFromMatrixPosition(matrix);
    for (const [id, built] of rooms) {
      const next = placements.find((placement) => placement.id === id);
      if (next && next.room === built.room && next.matrix.equals(built.matrix)) continue;
      changed.add(id);
      centres.push(centre(built.matrix));
      remove(built);
      rooms.delete(id);
    }
    for (const { id, room, matrix } of placements) {
      if (rooms.has(id)) continue;
      changed.add(id);
      centres.push(centre(matrix));
      rooms.set(id, litRoom(id, room, matrix, flicker));
    }
    // A change re-bakes the rooms next to it too: their light now meets new walls and doorways.
    const affected = new Set([...rooms.values()].filter((built) => changed.has(built.id) || centres.some((at) => at.distanceTo(centre(built.matrix)) < TILE * 1.01)).map((built) => built.id));
    if (affected.size === 0) return { rooms: [], ms: performance.now() - started };
    const all = [...rooms.values()].map((built) => ({ room: built.room, matrix: built.matrix }));
    const scene = bakeScene(all);
    const sceneId = ++scenes;
    const targets = [...rooms.values()].filter((built) => affected.has(built.id));
    const gathered = await Promise.all(targets.map((built) => baker(scene, sceneId, roomSamples(built))));
    for (const [i, built] of targets.entries()) {
      const light = roomLight(built.room, gathered[i]);
      built.light = light;
      built.lightmap.image.data = light.irradiance;
      built.lightmap.needsUpdate = true;
      built.flickerMap.image.data = light.flicker;
      built.flickerMap.needsUpdate = true;
      for (const probe of built.probes) {
        readProbes(light.probes, probe.at.x, probe.at.z, probe.uniform.value);
      }
      // A new room shows once it has its light, never black while it bakes.
      if (built.root.parent !== root) root.add(built.root);
    }
    return { rooms: [...affected], ms: performance.now() - started };
  };

  return {
    root,
    rooms,
    place: (placements) => {
      const run = queue.then(() => place(placements));
      queue = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },

    probeAt,
    update: (seconds) => {
      flickerSignal(seconds, flicker.value);
      for (const built of rooms.values()) for (const animation of built.room.animations) animation(seconds);
    },
    dispose: () => {
      for (const built of rooms.values()) {
        remove(built);
        for (const { holder } of built.room.dynamics) {
          holder.traverse((object) => {
            if (object instanceof THREE.Mesh) {
              object.geometry.dispose();
              for (const material of [object.material].flat() as THREE.Material[]) material.dispose();
            }
          });
        }
      }
      rooms.clear();
    },
  };
}
