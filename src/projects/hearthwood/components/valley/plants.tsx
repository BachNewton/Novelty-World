"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Box3, type Camera, Frustum, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshLambertMaterial, Object3D, Vector3 } from "three";
import { createRng } from "@/shared/lib/seeded-random";
import { PLANT_KINDS, PLANT_VARIANTS, type Plant, type PlantKind } from "../../world/life";
import type { Valley } from "../../world/valley";
import { breatheAtmosphere, type AtmosphereUniforms } from "./atmosphere";
import type { Palette } from "./palette";
import { CHUNK_SIZE, chunkDetail, distanceToChunk } from "./plant-detail";
import { plantShape, type Detail } from "./plant-shapes";

/*
 * Every plant and stone in the valley, instanced: one draw per design and
 * level of detail. Each design's copies are sorted by chunk, shuffled within
 * it so any first share of a chunk is an even thinning of it, and each frame
 * the chunks in view are copied into the meshes at the detail their distance
 * asks for. The copying only happens when that choice changes.
 */

const DETAILS: readonly Detail[] = ["near", "far"];

interface Design {
  kind: PlantKind;
  /** Every copy's matrix and colour, chunk by chunk. */
  matrices: Float32Array;
  colours: Float32Array;
  /** Where each chunk's copies start in the lists, and end (one past the chunk's last). */
  starts: Int32Array;
  ends: Int32Array;
  meshes: Partial<Record<Detail, InstancedMesh>>;
}

interface Chunks {
  across: number;
  boxes: Box3[];
}

function plantMatrix(p: Plant, dummy: Object3D): Matrix4 {
  const sink = p.kind === "rock" ? p.size * 0.12 : p.kind === "flowers" ? 0 : 0.12;
  dummy.position.set(p.x, p.y - sink, p.z);
  dummy.rotation.set(Math.cos(p.leanToward) * p.lean, p.turn, Math.sin(p.leanToward) * p.lean);
  if (p.kind === "rock") dummy.scale.set(p.size, p.size * (0.6 + 0.5 * (p.stretch - 0.85)) * 1.4, p.size * p.stretch);
  else dummy.scale.set(p.size / Math.sqrt(p.stretch), p.size * p.stretch, p.size / Math.sqrt(p.stretch));
  dummy.updateMatrix();
  return dummy.matrix;
}

function plantColour(p: Plant, out: Float32Array, at: number): void {
  const t = p.tint * (p.kind === "rock" ? 0.4 : 1);
  const bright = 0.92 + 0.08 * Math.sin(p.x * 0.37 + p.z * 0.23);
  out[at] = (1 + 0.12 * t) * bright;
  out[at + 1] = (1 + 0.03 * t) * bright;
  out[at + 2] = (1 - 0.12 * t) * bright;
}

function buildDesigns(valley: Valley, palette: Palette, materials: { foliage: MeshLambertMaterial; stone: MeshLambertMaterial }) {
  const half = -valley.heights.origin;
  const across = Math.ceil((2 * half) / CHUNK_SIZE);
  const chunkOf = (p: Plant) => Math.min(across - 1, Math.floor((p.z + half) / CHUNK_SIZE)) * across + Math.min(across - 1, Math.floor((p.x + half) / CHUNK_SIZE));
  const boxes = Array.from({ length: across * across }, (_, c) => {
    const minX = -half + (c % across) * CHUNK_SIZE;
    const minZ = -half + Math.floor(c / across) * CHUNK_SIZE;
    return new Box3(new Vector3(minX, Infinity, minZ), new Vector3(minX + CHUNK_SIZE, -Infinity, minZ + CHUNK_SIZE));
  });
  const dummy = new Object3D();
  const designs: Design[] = [];
  for (const kind of PLANT_KINDS) {
    for (let variant = 0; variant < PLANT_VARIANTS; variant++) {
      const rng = createRng(`${valley.seed}/draw/${kind}/${variant}`);
      const plants = valley.plants
        .filter((p) => p.kind === kind && p.variant === variant)
        .map((p) => ({ p, chunk: chunkOf(p), order: rng.next() }))
        .sort((a, b) => a.chunk - b.chunk || a.order - b.order);
      if (plants.length === 0) continue;
      const matrices = new Float32Array(plants.length * 16);
      const colours = new Float32Array(plants.length * 3);
      const starts = new Int32Array(across * across);
      const ends = new Int32Array(across * across);
      plants.forEach(({ p, chunk }, i) => {
        plantMatrix(p, dummy).toArray(matrices, i * 16);
        plantColour(p, colours, i * 3);
        if (i === 0 || plants[i - 1].chunk !== chunk) starts[chunk] = i;
        ends[chunk] = i + 1;
        const box = boxes[chunk];
        box.min.y = Math.min(box.min.y, p.y - 1);
        box.max.y = Math.max(box.max.y, p.y + p.size * 1.3);
      });
      const meshes: Design["meshes"] = {};
      for (const detail of DETAILS) {
        const geometry = plantShape(kind, variant, detail, palette);
        if (geometry === null) continue;
        const mesh = new InstancedMesh(geometry, kind === "rock" ? materials.stone : materials.foliage, plants.length);
        mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(plants.length * 3), 3);
        mesh.count = 0;
        mesh.frustumCulled = false;
        mesh.castShadow = detail === "near" && kind !== "flowers";
        mesh.receiveShadow = false;
        meshes[detail] = mesh;
      }
      designs.push({ kind, matrices, colours, starts, ends, meshes });
    }
  }
  return { designs, chunks: { across, boxes } satisfies Chunks, half };
}

interface Shown {
  plan: Int16Array | null;
  frustum: Frustum;
  matrix: Matrix4;
}

/** Copies the chunks in view into the meshes at the detail their distance asks for, when that has changed since last time. */
function showChunks(built: ReturnType<typeof buildDesigns>, camera: Camera, shown: Shown): void {
  const { frustum, matrix } = shown;
  const { designs, chunks, half } = built;
  const count = chunks.across * chunks.across;
  matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  frustum.setFromProjectionMatrix(matrix);
  const plan = new Int16Array(count * PLANT_KINDS.length);
  PLANT_KINDS.forEach((kind, k) => {
    for (let c = 0; c < count; c++) {
      const minX = -half + (c % chunks.across) * CHUNK_SIZE;
      const minZ = -half + Math.floor(c / chunks.across) * CHUNK_SIZE;
      const distance = distanceToChunk(camera.position.x, camera.position.z, minX, minZ);
      const detail = chunkDetail(kind, distance);
      const box = chunks.boxes[c];
      const visible = box.min.y <= box.max.y && (detail?.detail === "near" || frustum.intersectsBox(box));
      plan[k * count + c] = detail === null || !visible ? 0 : (detail.detail === "near" ? 1 : 2) + (detail.keep < 1 ? Math.round(detail.keep * 100) * 4 : 0);
    }
  });
  const previous = shown.plan;
  if (previous !== null && previous.every((v, i) => v === plan[i])) return;
  shown.plan = plan;

  for (const design of designs) {
    const k = PLANT_KINDS.indexOf(design.kind);
    const filled: Record<Detail, number> = { near: 0, far: 0 };
    for (let c = 0; c < count; c++) {
      const code = plan[k * count + c];
      const start = design.starts[c];
      const end = design.ends[c];
      if (code === 0 || end <= start) continue;
      const detail: Detail = code % 4 === 1 ? "near" : "far";
      const mesh = design.meshes[detail];
      if (!mesh) continue;
      const keep = code >= 4 ? Math.floor(code / 4) / 100 : 1;
      const n = Math.max(1, Math.round((end - start) * keep));
      const at = filled[detail];
      mesh.instanceMatrix.array.set(design.matrices.subarray(start * 16, (start + n) * 16), at * 16);
      mesh.instanceColor?.array.set(design.colours.subarray(start * 3, (start + n) * 3), at * 3);
      filled[detail] = at + n;
    }
    for (const detail of DETAILS) {
      const mesh = design.meshes[detail];
      if (!mesh) continue;
      mesh.count = filled[detail];
      mesh.instanceMatrix.clearUpdateRanges();
      mesh.instanceMatrix.addUpdateRange(0, filled[detail] * 16);
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) {
        mesh.instanceColor.clearUpdateRanges();
        mesh.instanceColor.addUpdateRange(0, filled[detail] * 3);
        mesh.instanceColor.needsUpdate = true;
      }
    }
  }
}

export function Plants({ valley, palette, atmosphere }: { valley: Valley; palette: Palette; atmosphere: AtmosphereUniforms }) {
  const materials = useMemo(
    () => ({
      foliage: breatheAtmosphere(new MeshLambertMaterial({ vertexColors: true }), atmosphere, { sway: true }),
      stone: breatheAtmosphere(new MeshLambertMaterial({ vertexColors: true }), atmosphere),
    }),
    [atmosphere],
  );
  const built = useMemo(() => buildDesigns(valley, palette, materials), [valley, palette, materials]);
  const shown = useRef<Shown>({ plan: null, frustum: new Frustum(), matrix: new Matrix4() });

  useEffect(
    () => () => {
      for (const design of built.designs) {
        for (const mesh of Object.values(design.meshes)) {
          mesh.geometry.dispose();
          mesh.dispose();
        }
      }
      materials.foliage.dispose();
      materials.stone.dispose();
    },
    [built, materials],
  );

  useFrame(({ camera }) => {
    showChunks(built, camera, shown.current);
  });

  return (
    <>
      {built.designs.flatMap((design) =>
        DETAILS.flatMap((detail) => {
          const mesh = design.meshes[detail];
          return mesh ? [<primitive key={mesh.uuid} object={mesh} />] : [];
        }),
      )}
    </>
  );
}
