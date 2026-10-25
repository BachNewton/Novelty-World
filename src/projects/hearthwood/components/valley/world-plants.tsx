"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Group, Mesh, Object3D, Vector3, type BufferGeometry } from "three";
import { PLANT_CHUNK, PLANT_VARIANTS, type PlantChunk } from "../../engine/life";
import { PLANT_KINDS, type PlantKind } from "../../engine/regions";
import { distanceToSquare, PLANT_CLASS, wantedChunks, type ChunkKey, type Detail } from "../../engine/streaming";
import type { World } from "../../engine/world";
import type { AtmosphereUniforms } from "../../art/atmosphere";
import { drawPlacings, placedNodes } from "../../art/foliage/placing";
import { diorama, type DioramaMaterial } from "../../art/materials";
import type { Palette } from "../../art/palette";
import { layoutRegions, packPlant, PLACING_FLOATS, type Regions } from "../../art/plant-instances";
import { plantShape } from "../../art/plant-shapes";
import type { Quality } from "../../quality";
import { CAMP_REACH, partedBy, type CampSite } from "../../gameplay/camp";
import { pitchedSite, type Camping } from "./camping";
import { useFeature, useRenderer } from "./feature-renderer";
import { PlantCulling, PLANTS_PER_CHUNK, type DesignReach } from "./plant-culling";
import { report, type Streaming } from "./world-land";

/*
 * The plants round the camera, driven from the GPU. Each chunk's plants are
 * written once, as it streams in, into a slot of one store on the GPU; each
 * frame a compute pass culls every plant there (its kind's reach, the view
 * and the key light's way within the shadows' reach, so the wood behind the
 * camera still casts into view) and picks its detail, appending it to its
 * design and detail's list, whose count is that draw's instance count (see
 * `plant-culling.ts`). Every design and detail is one mesh drawn indirectly
 * from its list, so the CPU never copies a matrix after a chunk arrives.
 *
 * The fireflies of the nearest chunks are handed to the scene, and the
 * ground plants within a pitched camp are left out of their chunks, as its
 * pieces stand there.
 */

const DETAILS: readonly Detail[] = ["near", "far"];
const DESIGNS = PLANT_KINDS.length * PLANT_VARIANTS;
/** How far the camera moves before the chunks wanted are worked out again, in metres. */
const RECHECK = 4;
/** Fireflies are gathered from the chunks within this many metres. */
const FIREFLY_REACH = 140;
/** Room for chunks beyond those wanted, so a chunk left behind lingers a while before its slot is taken. */
const SPARE_SLOTS = 1.25;

const chunkId = (k: ChunkKey) => `${String(k.chunkX)},${String(k.chunkZ)}`;
const designOf = (kind: PlantKind, variant: number) => PLANT_KINDS.indexOf(kind) * PLANT_VARIANTS + variant;

interface Resident {
  slot: number;
  /** How many plants of each design it holds, for the drawn lists' room. */
  perDesign: Uint16Array;
  fireflies: Float32Array;
}

interface State {
  resident: Map<string, Resident>;
  free: number[];
  wanted: ChunkKey[];
  pending: ChunkKey[];
  from: Vector3 | null;
  firefliesFrom: string;
  /** The pitched camp the chunks were written round, its ground plants left out. */
  camp: CampSite | null;
  regions: Regions | null;
  /** The store and the meshes the rest was made for: a new store starts afresh, new meshes are given their lists' places. */
  culling: PlantCulling | null;
  meshes: readonly PlantMesh[];
}

function freshState(culling: PlantCulling | null): State {
  const free = culling ? Array.from({ length: culling.slots }, (_, i) => culling.slots - 1 - i) : [];
  return { resident: new Map(), free, wanted: [], pending: [], from: null, firefliesFrom: "", camp: null, regions: null, culling, meshes: [] };
}

/** The chunks a camp's parted plants could lie in. */
function chunksRound(camp: CampSite): string[] {
  const out: string[] = [];
  const r = CAMP_REACH + 1;
  for (let cz = Math.floor((camp.z - r) / PLANT_CHUNK); cz <= Math.floor((camp.z + r) / PLANT_CHUNK); cz++) {
    for (let cx = Math.floor((camp.x - r) / PLANT_CHUNK); cx <= Math.floor((camp.x + r) / PLANT_CHUNK); cx++) out.push(`${String(cx)},${String(cz)}`);
  }
  return out;
}

/** Each design's reach, from its kind's class in the quality profile. */
function reachesOf(quality: Quality): DesignReach[] {
  return PLANT_KINDS.flatMap((kind) => Array.from({ length: PLANT_VARIANTS }, () => quality[PLANT_CLASS[kind]]));
}

/** How many slots the store needs: every chunk within the plants' reach, and some to spare. */
function slotsFor(quality: Quality): number {
  const reach = Math.max(quality.trees.far, quality.shrubs.far, quality.small.far);
  return Math.ceil(wantedChunks(0, 0, reach).length * SPARE_SLOTS);
}

/** Writes a chunk's plants into its slot of the store, and counts them by design. */
function writeChunk(chunk: PlantChunk, slot: number, placings: Float32Array, dummy: Object3D, camp: CampSite | null): Uint16Array {
  const perDesign = new Uint16Array(DESIGNS);
  let n = 0;
  for (const p of chunk.plants) {
    if (camp && partedBy(camp, p)) continue;
    const design = designOf(p.kind, p.variant);
    packPlant(p, design, dummy, placings, (slot * PLANTS_PER_CHUNK + n) * PLACING_FLOATS);
    perDesign[design]++;
    n++;
  }
  return perDesign;
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
  const renderer = useRenderer();
  const group = useMemo(() => new Group(), []);
  const culling = useMemo(() => new PlantCulling(slotsFor(quality), DESIGNS * DETAILS.length, reachesOf(quality)), [quality]);
  useEffect(() => () => culling.dispose(), [culling]);
  const materials = useMemo(() => {
    const own = placedNodes();
    return {
      foliage: diorama("foliage", atmosphere, { vertexColors: true }, own),
      stone: diorama("solid", atmosphere, { vertexColors: true }, own),
    };
  }, [atmosphere]);
  useEffect(
    () => () => {
      materials.foliage.dispose();
      materials.stone.dispose();
    },
    [materials],
  );
  // The seasons build their plants with what each piece is and a bare tree's branches, so switching them rebuilds the designs.
  const seasonal = useFeature("seasonalFoliage");
  const meshes = useMemo(() => makeMeshes(palette, seasonal, culling, materials), [palette, seasonal, culling, materials]);
  useEffect(() => {
    for (const mesh of meshes) group.add(mesh);
    return () => {
      for (const mesh of meshes) {
        group.remove(mesh);
        mesh.geometry.dispose();
      }
    };
  }, [meshes, group]);

  const state = useRef<State>(freshState(null));
  const dummy = useMemo(() => new Object3D(), []);
  const reach = Math.max(quality.trees.far, quality.shrubs.far, quality.small.far);
  // How far from the camera the key light's shadows reach, so how far a plant out of view may still cast into it.
  const shadowed = useFeature("sunShadows");
  const cascades = useFeature("shadowCascades");
  const shadowReach = shadowed ? (cascades ? quality.shadowReach : quality.shadowReachNear) : 0;

  useFrame(({ camera }) => {
    if (state.current.culling !== culling) state.current = freshState(culling);
    const s = state.current;
    const eye = camera.position;
    const camp = pitchedSite(camping);
    if (camp !== s.camp) {
      // Camp moved: the chunks round where it was and where it is are written again, leaving out the plants round it now.
      for (const id of new Set([...(s.camp ? chunksRound(s.camp) : []), ...(camp ? chunksRound(camp) : [])])) evict(s, id, culling);
      s.camp = camp;
      s.from = null;
    }
    if (s.from === null || s.from.distanceTo(eye) > RECHECK) {
      s.from = eye.clone();
      s.wanted = wantedChunks(eye.x, eye.z, reach);
      s.pending = s.wanted.filter((k) => !s.resident.has(chunkId(k)));
      // A chunk no longer wanted keeps its slot until one is needed.
      const keep = new Set(s.wanted.map(chunkId));
      const leaving = [...s.resident.keys()].filter((id) => !keep.has(id));
      for (const id of leaving.slice(0, Math.max(0, s.pending.length - s.free.length))) evict(s, id, culling);
    }
    let wrote = false;
    for (let n = 0; n < quality.buildsPerFrame && s.pending.length > 0; n++) {
      const key = s.pending.shift() as ChunkKey;
      const slot = s.free.pop();
      if (slot === undefined) throw new Error("The plants' store has no slot left for a wanted chunk");
      const chunk = world.plantsIn(key.chunkX, key.chunkZ);
      const perDesign = writeChunk(chunk, slot, culling.placings, dummy, s.camp);
      culling.fillSlot(slot, perDesign.reduce((a, b) => a + b, 0));
      s.resident.set(chunkId(key), { slot, perDesign, fireflies: chunk.fireflies });
      wrote = true;
    }
    if (s.meshes !== meshes) {
      s.meshes = meshes;
      s.regions = null;
      wrote = true;
    }
    if (wrote) layOut(s, culling, meshes);
    report(streaming, "plants", s.pending.length === 0);
    culling.run(renderer, camera, atmosphere.uHwSunDir.value, shadowReach);

    const near = s.wanted.filter((k) => distanceToSquare(eye.x, eye.z, k.chunkX * PLANT_CHUNK, k.chunkZ * PLANT_CHUNK, PLANT_CHUNK) < FIREFLY_REACH && s.resident.has(chunkId(k)));
    const nearIds = near.map(chunkId).join(";");
    if (nearIds !== s.firefliesFrom) {
      s.firefliesFrom = nearIds;
      const spots = near.flatMap((k) => Array.from(s.resident.get(chunkId(k))?.fireflies ?? []));
      onFireflies(new Float32Array(spots));
    }
  });

  return <primitive object={group} />;
}

/** Frees a chunk's slot, so its plants are no longer drawn. */
function evict(s: State, id: string, culling: PlantCulling): void {
  const resident = s.resident.get(id);
  if (!resident) return;
  culling.emptySlot(resident.slot);
  s.free.push(resident.slot);
  s.resident.delete(id);
}

/** Gives each design and detail's list room for every resident plant of its design, laid out again only when one has outgrown its room. */
function layOut(s: State, culling: PlantCulling, meshes: readonly PlantMesh[]): void {
  const needed = new Uint32Array(culling.draws);
  for (const resident of s.resident.values()) {
    for (let d = 0; d < DESIGNS; d++) {
      for (let detail = 0; detail < DETAILS.length; detail++) if (meshes[d * DETAILS.length + detail].userData.drawn) needed[d * DETAILS.length + detail] += resident.perDesign[d];
    }
  }
  const regions = layoutRegions(needed, s.regions, culling.buffers.drawn.count);
  if (!regions) return;
  s.regions = regions;
  culling.setRegions(regions.start, regions.capacity);
  regions.start.forEach((start, i) => (meshes[i].userData.hwFirst = start));
}

type PlantMesh = Mesh<BufferGeometry, DioramaMaterial> & { userData: { hwFirst: number; drawn: boolean } };

/**
 * A mesh for every design and detail, drawn indirectly from its list: its
 * instance count is the culling's count of the copies kept for it. A detail
 * a design isn't drawn in (flowers far off) has an empty shape and no room.
 */
function makeMeshes(palette: Palette, seasonal: boolean, culling: PlantCulling, materials: { foliage: DioramaMaterial; stone: DioramaMaterial }): PlantMesh[] {
  const vertices = new Uint32Array(culling.draws);
  const meshes = PLANT_KINDS.flatMap((kind) =>
    Array.from({ length: PLANT_VARIANTS }, (_, variant) =>
      DETAILS.map((detail, d) => {
        const shape = plantShape(kind, variant, detail, palette, seasonal);
        const draw = designOf(kind, variant) * DETAILS.length + d;
        const geometry = shape ?? new Mesh().geometry;
        if (geometry.index) throw new Error(`The plant shapes are drawn without an index, but ${kind}'s has one`);
        vertices[draw] = shape ? geometry.getAttribute("position").count : 0;
        geometry.setIndirect(culling.args, culling.argsOffset(draw));
        const mesh = new Mesh(geometry, kind === "rock" ? materials.stone : materials.foliage) as PlantMesh;
        mesh.userData = { hwFirst: 0, drawn: shape !== null };
        drawPlacings(mesh, culling.buffers);
        // The culling decides what is drawn; three's own test would only see the mesh's shape at the origin.
        mesh.frustumCulled = false;
        mesh.visible = shape !== null;
        // Flowers are too small and many for their shadows to be worth their draws.
        mesh.castShadow = kind !== "flowers";
        mesh.receiveShadow = true;
        mesh.name = `plants:${kind}:${String(variant)}:${detail}`;
        return mesh;
      }),
    ),
  ).flat();
  culling.setVertexCounts(vertices);
  return meshes;
}
