"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Box3, type Camera, Frustum, Group, InstancedBufferAttribute, Matrix4, Object3D, Vector3, type BufferGeometry } from "three";
import { InstancedMesh } from "three/webgpu";
import { PLANT_CHUNK, PLANT_VARIANTS, type PlantChunk } from "../../engine/life";
import { PLANT_KINDS, type PlantKind } from "../../engine/regions";
import { castsIntoView, chunkDetail, distanceToSquare, PLANT_CLASS, wantedChunks, type ChunkKey, type Detail } from "../../engine/streaming";
import type { World } from "../../engine/world";
import type { AtmosphereUniforms } from "../../art/atmosphere";
import { diorama, type DioramaMaterial } from "../../art/materials";
import type { Palette } from "../../art/palette";
import { plantColour, plantMatrix } from "../../art/plant-instances";
import { plantShape } from "../../art/plant-shapes";
import type { Quality } from "../../quality";
import { CAMP_REACH, partedBy, type CampSite } from "../../gameplay/camp";
import { pitchedSite, type Camping } from "./camping";
import { useFeature } from "./feature-renderer";
import { report, type Streaming } from "./world-land";

/*
 * The plants round the camera, streamed by chunk and instanced: one draw per
 * design and level of detail. Each chunk's plants are sorted by design once,
 * shuffled within it so any first share of them is an even thinning, and
 * each frame the chunks in view, or casting their shadows into it, are
 * copied into the meshes at the detail their distance asks for; the copying
 * only happens when that choice changes. The fireflies of the nearest
 * chunks are handed to the scene. The ground plants within a pitched
 * camp are parted, as its pieces stand there.
 */

const DETAILS: readonly Detail[] = ["near", "far"];
const DESIGNS = PLANT_KINDS.length * PLANT_VARIANTS;
const RECHECK = 4;
/** Fireflies are gathered from the chunks within this many metres. */
const FIREFLY_REACH = 140;

interface ChunkDraw {
  key: ChunkKey;
  /** Each design's copies: matrices and colours, how far the bands sit where each grows (only for the seasons' foliage), and how many. */
  matrices: Float32Array[];
  colours: Float32Array[];
  bands: Float32Array[] | null;
  counts: Int32Array;
  box: Box3;
  fireflies: Float32Array;
}

interface DesignMeshes {
  kind: PlantKind;
  geometry: Partial<Record<Detail, BufferGeometry>>;
  meshes: Partial<Record<Detail, InstancedMesh>>;
  /** Each mesh's copies' band shifts, for the seasons' foliage only. */
  bands: Partial<Record<Detail, InstancedBufferAttribute>>;
}

function drawChunk(chunk: PlantChunk, dummy: Object3D, camp: CampSite | null, seasonal: boolean): ChunkDraw {
  const byDesign: PlantChunk["plants"][] = Array.from({ length: DESIGNS }, () => []);
  for (const p of chunk.plants) if (!camp || !partedBy(camp, p)) byDesign[PLANT_KINDS.indexOf(p.kind) * PLANT_VARIANTS + p.variant].push(p);
  const box = new Box3(new Vector3(chunk.chunkX * PLANT_CHUNK, Infinity, chunk.chunkZ * PLANT_CHUNK), new Vector3((chunk.chunkX + 1) * PLANT_CHUNK, -Infinity, (chunk.chunkZ + 1) * PLANT_CHUNK));
  const counts = new Int32Array(DESIGNS);
  const matrices = byDesign.map((plants, d) => {
    // Shuffled by a fixed hash of position, so a thinned share is spread across the chunk.
    plants.sort((a, b) => fract(a.x * 12.9898 + a.z * 78.233) - fract(b.x * 12.9898 + b.z * 78.233));
    counts[d] = plants.length;
    const out = new Float32Array(plants.length * 16);
    plants.forEach((p, i) => {
      plantMatrix(p, dummy).toArray(out, i * 16);
      box.min.y = Math.min(box.min.y, p.y - 1);
      box.max.y = Math.max(box.max.y, p.y + p.size * 1.3);
    });
    return out;
  });
  const colours = byDesign.map((plants) => {
    const out = new Float32Array(plants.length * 3);
    plants.forEach((p, i) => plantColour(p, out, i * 3));
    return out;
  });
  const bands = seasonal ? byDesign.map((plants) => Float32Array.from(plants, (p) => p.bands)) : null;
  return { key: { chunkX: chunk.chunkX, chunkZ: chunk.chunkZ }, matrices, colours, bands, counts, box, fireflies: chunk.fireflies };
}

function fract(x: number): number {
  const s = Math.sin(x) * 43758.5453;
  return s - Math.floor(s);
}

interface State {
  draws: Map<string, ChunkDraw>;
  wanted: ChunkKey[];
  pending: ChunkKey[];
  from: Vector3 | null;
  plan: string;
  firefliesFrom: string;
  /** The pitched camp the chunks were drawn round, parting the ground plants within it. */
  camp: CampSite | null;
}

const chunkId = (k: ChunkKey) => `${k.chunkX},${k.chunkZ}`;

/** The chunks a camp's parted plants could lie in. */
function chunksRound(camp: CampSite): string[] {
  const out: string[] = [];
  const r = CAMP_REACH + 1;
  for (let cz = Math.floor((camp.z - r) / PLANT_CHUNK); cz <= Math.floor((camp.z + r) / PLANT_CHUNK); cz++) {
    for (let cx = Math.floor((camp.x - r) / PLANT_CHUNK); cx <= Math.floor((camp.x + r) / PLANT_CHUNK); cx++) out.push(`${cx},${cz}`);
  }
  return out;
}

export function WorldPlants({
  world,
  camping,
  palette,
  atmosphere,
  quality,
  streaming,
  onFireflies,
}: {
  world: World;
  camping: Camping;
  palette: Palette;
  atmosphere: AtmosphereUniforms;
  quality: Quality;
  streaming: Streaming;
  onFireflies: (spots: Float32Array) => void;
}) {
  const group = useMemo(() => new Group(), []);
  const materials = useMemo(
    () => ({
      foliage: diorama("foliage", atmosphere, { vertexColors: true }),
      stone: diorama("solid", atmosphere, { vertexColors: true }),
    }),
    [atmosphere],
  );
  // The seasons build their plants with what each piece is and a bare tree's branches, so switching them rebuilds the designs.
  const seasonal = useFeature("seasonalFoliage");
  const designs = useMemo<DesignMeshes[]>(
    () =>
      PLANT_KINDS.flatMap((kind) =>
        Array.from({ length: PLANT_VARIANTS }, (_, variant) => ({
          kind,
          geometry: Object.fromEntries(DETAILS.flatMap((d) => {
            const g = plantShape(kind, variant, d, palette, seasonal);
            return g ? [[d, g]] : [];
          })) as DesignMeshes["geometry"],
          meshes: {},
          bands: {},
        })),
      ),
    [palette, seasonal],
  );
  const state = useRef<State>({ draws: new Map(), wanted: [], pending: [], from: null, plan: "", firefliesFrom: "", camp: null });
  const tools = useMemo(() => ({ dummy: new Object3D(), frustum: new Frustum(), matrix: new Matrix4() }), []);
  const reach = Math.max(quality.trees.far, quality.shrubs.far, quality.small.far);
  // How far from the camera the key light's shadow maps reach, so how far a chunk out of view may still cast into it.
  const shadowed = useFeature("sunShadows");
  const cascades = useFeature("shadowCascades");
  const shadowReach = shadowed ? (cascades ? quality.shadowReach : quality.shadowReachNear) : 0;

  useEffect(() => {
    // New designs start with no meshes, so the chunks are copied into them afresh, and drawn afresh for whether they carry the seasons' bands.
    state.current.plan = "";
    state.current.draws.clear();
    state.current.from = null;
    return () => {
      for (const design of designs) {
        for (const g of Object.values(design.geometry)) g.dispose();
        for (const m of Object.values(design.meshes)) {
          group.remove(m);
          m.dispose();
        }
      }
    };
  }, [designs, group]);
  useEffect(
    () => () => {
      materials.foliage.dispose();
      materials.stone.dispose();
    },
    [materials],
  );

  useFrame(({ camera }) => {
    const s = state.current;
    const eye = camera.position;
    const camp = pitchedSite(camping);
    if (camp !== s.camp) {
      // Camp moved: the chunks round where it was and where it is are drawn again, parting the plants round it now.
      const redraw = new Set([...(s.camp ? chunksRound(s.camp) : []), ...(camp ? chunksRound(camp) : [])]);
      for (const id of redraw) s.draws.delete(id);
      s.camp = camp;
      s.from = null;
      s.plan = "";
    }
    if (s.from === null || s.from.distanceTo(eye) > RECHECK) {
      s.from = eye.clone();
      s.wanted = wantedChunks(eye.x, eye.z, reach);
      s.pending = s.wanted.filter((k) => !s.draws.has(chunkId(k)));
      const keep = new Set(s.wanted.map(chunkId));
      for (const id of s.draws.keys()) if (!keep.has(id) && s.draws.size > s.wanted.length * 1.5) s.draws.delete(id);
    }
    for (let n = 0; n < quality.buildsPerFrame && s.pending.length > 0; n++) {
      const key = s.pending.shift() as ChunkKey;
      s.draws.set(chunkId(key), drawChunk(world.plantsIn(key.chunkX, key.chunkZ), tools.dummy, s.camp, seasonal));
    }
    if (s.pending.length > 0) {
      report(streaming, "plants", false);
      return;
    }
    report(streaming, "plants", true);
    showChunks(s, designs, seasonal, camera, quality, shadowReach, atmosphere.uHwSunDir.value, group, materials, tools);
    const near = s.wanted.filter((k) => distanceToSquare(eye.x, eye.z, k.chunkX * PLANT_CHUNK, k.chunkZ * PLANT_CHUNK, PLANT_CHUNK) < FIREFLY_REACH);
    const nearIds = near.map(chunkId).join(";");
    if (nearIds !== s.firefliesFrom) {
      s.firefliesFrom = nearIds;
      const spots = near.flatMap((k) => Array.from(s.draws.get(chunkId(k))?.fireflies ?? []));
      onFireflies(new Float32Array(spots));
    }
  });

  return <primitive object={group} />;
}

/** Copies the chunks in view, or casting their shadows into it, into the meshes at the detail their distance asks for, when that has changed since last time. */
function showChunks(
  s: State,
  designs: DesignMeshes[],
  seasonal: boolean,
  camera: Camera,
  quality: Quality,
  shadowReach: number,
  toLight: Vector3,
  group: Group,
  materials: { foliage: DioramaMaterial; stone: DioramaMaterial },
  tools: { frustum: Frustum; matrix: Matrix4 },
): void {
  // Whatever moved the camera this frame may have left its world matrix a step behind (lookAt refreshes it before turning), so it is refreshed first.
  camera.updateMatrixWorld();
  tools.matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  tools.frustum.setFromProjectionMatrix(tools.matrix);
  const { x, z } = camera.position;
  const classes = ["trees", "shrubs", "small"] as const;
  const plans = s.wanted.map((key) => {
    const draw = s.draws.get(chunkId(key));
    if (!draw || draw.box.min.y > draw.box.max.y) return null;
    const distance = distanceToSquare(x, z, key.chunkX * PLANT_CHUNK, key.chunkZ * PLANT_CHUNK, PLANT_CHUNK);
    const inView = distance < 40 || tools.frustum.intersectsBox(draw.box) || (shadowReach > 0 && castsIntoView(draw.box, camera.position, tools.frustum.planes, toLight, shadowReach));
    if (!inView) return null;
    return { draw, details: classes.map((c) => chunkDetail(quality[c], distance)) };
  });
  const code = plans.map((p, i) => (p ? `${i}:${p.details.map((d) => (d ? `${d.detail[0]}${d.keep}` : "-")).join("")}` : "")).join(",");
  if (code === s.plan) return;
  s.plan = code;

  designs.forEach((design, d) => {
    const cls = classes.indexOf(PLANT_CLASS[design.kind]);
    for (const detail of DETAILS) {
      const geometry = design.geometry[detail];
      if (!geometry) continue;
      let needed = 0;
      for (const p of plans) {
        const choice = p?.details[cls];
        if (p && choice?.detail === detail && p.draw.counts[d] > 0) needed += Math.max(1, Math.round(p.draw.counts[d] * choice.keep));
      }
      let mesh = design.meshes[detail];
      if (needed > 0 && (!mesh || mesh.instanceMatrix.count < needed)) {
        if (mesh) {
          group.remove(mesh);
          mesh.dispose();
        }
        mesh = new InstancedMesh(geometry, design.kind === "rock" ? materials.stone : materials.foliage, Math.max(256, 2 ** Math.ceil(Math.log2(needed * 1.25))));
        mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(mesh.instanceMatrix.count * 3), 3);
        if (seasonal) {
          const bands = new InstancedBufferAttribute(new Float32Array(mesh.instanceMatrix.count), 1);
          geometry.setAttribute("hwSeasonBands", bands);
          design.bands[detail] = bands;
        }
        mesh.frustumCulled = false;
        mesh.castShadow = design.kind !== "flowers";
        mesh.receiveShadow = true;
        design.meshes[detail] = mesh;
        group.add(mesh);
      }
      if (!mesh) continue;
      const bands = design.bands[detail];
      let filled = 0;
      for (const p of plans) {
        const choice = p?.details[cls];
        if (!p || choice?.detail !== detail || p.draw.counts[d] === 0) continue;
        const n = Math.max(1, Math.round(p.draw.counts[d] * choice.keep));
        mesh.instanceMatrix.array.set(p.draw.matrices[d].subarray(0, n * 16), filled * 16);
        mesh.instanceColor?.array.set(p.draw.colours[d].subarray(0, n * 3), filled * 3);
        if (bands) {
          if (!p.draw.bands) throw new Error("A chunk drawn without its plants' band shifts was copied into a seasonal design");
          bands.array.set(p.draw.bands[d].subarray(0, n), filled);
        }
        filled += n;
      }
      mesh.count = filled;
      mesh.instanceMatrix.clearUpdateRanges();
      mesh.instanceMatrix.addUpdateRange(0, filled * 16);
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) {
        mesh.instanceColor.clearUpdateRanges();
        mesh.instanceColor.addUpdateRange(0, filled * 3);
        mesh.instanceColor.needsUpdate = true;
      }
      if (bands) {
        bands.clearUpdateRanges();
        bands.addUpdateRange(0, filled);
        bands.needsUpdate = true;
      }
    }
  });
}
