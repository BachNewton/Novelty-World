import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  bedrockField,
  generateChunk,
  SAMPLE_SPACING,
  windowChunkRequest,
  type ArchipelagoProfile,
  type ChunkPayload,
} from "./terrain-gen";

// Procedural archipelago terrain — the three.js HALF: meshes, materials, and the `Terrain`
// wrapper. The generator itself (the seeded bedrock field, the colour math, the tree scatter)
// lives in `terrain-gen.ts`, deliberately import-free so the identical code runs on the main
// thread, in the terrain Web Worker (`terrain.worker.ts`), and headless in Node (tools/map.ts,
// vitest). This module turns a generated `ChunkPayload` of plain buffers into scene objects.
//
// THE THESIS (see docs/ISLANDS.md and terrain-gen.ts). A Finnish island is a DROWNED landform,
// not an eroded one: there is NO island primitive — one continuous bedrock field is cut by sea
// level, and islands, sounds, chains and skerries fall out for free. Why a heightfield and not
// voxels: ships are voxels because you build them; islands are terrain you sail past, run
// aground on, and gather from — and a heightfield hands the ocean the `height(x, z)` it needs
// for wave shoaling and shallow-water colour.

// Re-export the pure field API so existing consumers (terrain.test.ts, tools/map.ts) keep one
// import path; the implementation lives in terrain-gen.ts.
export { bedrockField, bedrockHeight, fbm2, noise2 } from "./terrain-gen";
export type { ArchipelagoProfile, FieldSample } from "./terrain-gen";

/** One spruce: a short trunk under three stacked cones, narrow rather than fat (Picea abies is a
 *  spire, not a Christmas-card triangle). Merged into a single geometry so the whole forest is one
 *  instanced draw, and vertex-coloured (trunk / canopy) to avoid a second material and a second node. */
const buildSpruceGeometry = (): THREE.BufferGeometry => {
  const trunk = new THREE.CylinderGeometry(0.06, 0.12, 1.4, 5);
  trunk.translate(0, 0.7, 0);
  const tiers = [
    { r: 1.15, h: 3.4, y: 2.3 },
    { r: 0.85, h: 2.7, y: 4.0 },
    { r: 0.5, h: 2.1, y: 5.6 },
  ].map(({ r, h, y }) => {
    const cone = new THREE.ConeGeometry(r, h, 9);
    cone.translate(0, y, 0);
    return cone;
  });

  const merged = mergeGeometries([trunk, ...tiers]);
  trunk.dispose();
  for (const t of tiers) t.dispose();

  const position = merged.attributes.position;
  const colors = new Float32Array(position.count * 3);
  const bark = new THREE.Color(0x2f2820);
  const needle = new THREE.Color(0x24331f); // deep, cool: warm greens read as larch, not spruce
  for (let i = 0; i < position.count; i++) {
    // Everything below the lowest cone's base is trunk.
    (position.getY(i) < 1.4 ? bark : needle).toArray(colors, i * 3);
  }
  merged.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return merged;
};

export interface Terrain {
  /** Add to the scene once. Holds the bedrock mesh + the instanced spruce — three scene-graph nodes
   *  total, regardless of tree count (see docs/PERFORMANCE.md). */
  object: THREE.Object3D;
  /** Show/hide the instanced spruce alone (the bedrock stays). A cost probe: the forest is one
   *  `InstancedMesh` (1 draw, 1 node) but ~1,000 instances of a multi-cone tree, so its cost is
   *  TRIANGLES, not draw calls. */
  setTreesVisible: (on: boolean) => void;
  /** Stop the terrain (bedrock AND spruce) CASTING into the sun's shadow map; it still receives.
   *  Isolates what the archipelago costs as a shadow caster from what it costs as visible geometry —
   *  they are separate draws, and only one of them is on screen. */
  setCastShadow: (on: boolean) => void;
  /**
   * Swap the bedrock to an UNLIT material (same geometry, same vertex colours, trivial fragment).
   * `full − flat` is therefore the archipelago's PBR shading + shadow-receiving cost, and `flat` alone
   * is its raw fill — the same subtraction `ocean.setShading` makes for the water.
   *
   * It exists because decimating the bedrock mesh barely moved the frame, which says the terrain is NOT
   * vertex-bound (unlike the ocean) and its cost is in shading the pixels it covers. This proves that
   * rather than inferring it — and it decides whether island LOD should attack triangles or the shader.
   */
  setShading: (mode: "full" | "flat") => void;
  /** Triangles in the bedrock mesh + the spruce (one tree × instance count). The LOD conversation is
   *  about these two numbers, so they have to be reportable. */
  triangleCounts: () => { bedrock: number; trees: number };
  /**
   * Wall-clock ms the window took to GENERATE — the noise field, the displace/normal/colour passes,
   * and the forest scatter — on whichever thread ran `generateChunk` (the Web Worker in the shipped
   * game; this thread on the `?terrainWorker=off` sync path and in the benchmark rebuild).
   *
   * It is deliberately absent from the per-frame cost model: generation runs off the frame loop. But
   * it is NOT free — it is the per-chunk cost that streaming (docs/ISLANDS.md) pays every time the
   * player sails into new water, and this number is how you know how long a chunk takes to arrive.
   */
  generationMs: number;
  /** Bedrock height at a world (x, z). The same function the mesh was built from — anything that
   *  needs to ask the terrain a question (wave shoaling, a collider, prop scatter) reads this,
   *  never the triangles. */
  heightAt: (x: number, z: number) => number;
  /** How many spruce were planted. Reported so the tree count can be watched as the window grows. */
  treeCount: number;
  dispose: () => void;
}

/**
 * An archipelago that isn't there — same interface, no generation.
 *
 * Meshing the window is ~3 M noise evaluations and costs real time even in a worker. A benchmark or
 * probe that switches the islands OFF was paying every one of those seconds to build geometry it then
 * immediately hid, on every page load, and the sweep does hundreds of them. Hiding a thing is not the
 * same as not making it, and the difference here is the slowest step in the harness.
 *
 * `heightAt` answers "deep water", which is what "no islands" means to anything that asks.
 */
export const createEmptyTerrain = (): Terrain => ({
  object: new THREE.Group(),
  setTreesVisible: () => {},
  setCastShadow: () => {},
  setShading: () => {},
  triangleCounts: () => ({ bedrock: 0, trees: 0 }),
  generationMs: 0,
  heightAt: () => -100,
  treeCount: 0,
  dispose: () => {},
});

/**
 * Wrap a generated `ChunkPayload` into scene objects + the `Terrain` interface. This is the ONE
 * place buffers become meshes, shared by the sync path (`createTerrain`) and the async worker path
 * (scene.ts) — so the two are identical by construction, not by discipline. Cheap on purpose:
 * attribute wrapping, ~1k instance matrices, and the GPU upload; all the field math already
 * happened in `generateChunk`, wherever that ran.
 */
export function terrainFromPayload(payload: ChunkPayload, profile: ArchipelagoProfile): Terrain {
  const [cx, cz] = profile.center;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(payload.positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(payload.normals, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(payload.colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(payload.index, 1));

  // No per-material lighting exception. The land is lit by the same sun and the same sky as the
  // buoys, the raft and the sea — which is the entire point of the lighting overhaul (docs/LIGHTING.md).
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.92,
    metalness: 0,
  });

  // Unlit twin of the bedrock material: same vertex colours, no BRDF, no shadow lookup. Built lazily —
  // it is a cost probe, and an unused material should not cost a compile.
  let flatMaterial: THREE.MeshBasicMaterial | undefined;

  // Typed loosely on the material: the flat probe swaps a MeshBasicMaterial in (see setShading).
  const bedrock: THREE.Mesh<THREE.BufferGeometry, THREE.Material> = new THREE.Mesh(geometry, material);
  bedrock.position.set(cx, 0, cz); // payload positions are chunk-local; the mesh carries the origin
  bedrock.name = "bedrock";
  bedrock.castShadow = true;
  bedrock.receiveShadow = true;

  const spruceGeometry = buildSpruceGeometry();
  const spruceMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.95,
    metalness: 0,
  });
  const forest = new THREE.InstancedMesh(spruceGeometry, spruceMaterial, Math.max(1, payload.treeCount));
  forest.name = "spruce";
  forest.count = payload.treeCount;
  forest.position.set(cx, 0, cz); // tree positions are chunk-local too
  forest.castShadow = true;
  forest.receiveShadow = true;
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  for (let i = 0; i < payload.treeCount; i++) {
    const t = i * 7; // x, y, z, scaleXZ, scaleY, spin, shade — see ChunkPayload
    dummy.position.set(payload.trees[t], payload.trees[t + 1], payload.trees[t + 2]);
    dummy.scale.set(payload.trees[t + 3], payload.trees[t + 4], payload.trees[t + 3]);
    dummy.rotation.y = payload.trees[t + 5];
    dummy.updateMatrix();
    forest.setMatrixAt(i, dummy.matrix);
    forest.setColorAt(i, tint.setScalar(payload.trees[t + 6]));
  }
  forest.instanceMatrix.needsUpdate = true;
  if (forest.instanceColor) forest.instanceColor.needsUpdate = true;

  const group = new THREE.Group();
  group.name = "archipelago";
  group.add(bedrock, forest);

  const triangleCount = (g: THREE.BufferGeometry) =>
    g.index ? g.index.count / 3 : g.attributes.position.count / 3;

  return {
    object: group,
    heightAt: bedrockField(profile).height,
    treeCount: payload.treeCount,
    generationMs: payload.generationMs,
    setTreesVisible: (on) => {
      forest.visible = on;
    },
    setCastShadow: (on) => {
      bedrock.castShadow = on;
      forest.castShadow = on;
    },
    setShading: (mode) => {
      if (mode === "flat") {
        flatMaterial ??= new THREE.MeshBasicMaterial({ vertexColors: true });
        bedrock.material = flatMaterial;
        bedrock.receiveShadow = false; // an unlit material cannot receive one anyway; be explicit
      } else {
        bedrock.material = material;
        bedrock.receiveShadow = true;
      }
    },
    triangleCounts: () => ({
      bedrock: triangleCount(geometry),
      trees: triangleCount(spruceGeometry) * payload.treeCount,
    }),
    dispose: () => {
      geometry.dispose();
      material.dispose();
      flatMaterial?.dispose();
      spruceGeometry.dispose();
      spruceMaterial.dispose();
    },
  };
}

/**
 * Mesh an archipelago window from its profile, SYNCHRONOUSLY on this thread — `generateChunk` +
 * `terrainFromPayload` in one call. The shipped game streams tiles instead (scene.ts +
 * terrain-stream.ts); this path remains for the `?terrainWorker=off` escape hatch and tests.
 * Both paths produce byte-identical payloads by construction.
 */
export function createTerrain(profile: ArchipelagoProfile): Terrain {
  return terrainFromPayload(generateChunk(windowChunkRequest(profile)), profile);
}

// --- Streamed tiles ----------------------------------------------------------
// The chunk-streaming world builds MANY tiles, so unlike the one-window path above the
// materials and the spruce geometry are SHARED across every tile the factory makes —
// ~70 tiles must not mean ~140 material compiles. Per-tile dispose frees geometry only;
// the factory owns the shared resources for its lifetime.

/** One streamed terrain tile: 1–2 scene-graph nodes, geometry owned, materials shared. */
export interface TerrainTile {
  object: THREE.Object3D;
  triangles: { bedrock: number; trees: number };
  treeCount: number;
  generationMs: number;
  dispose: () => void;
}

export interface TerrainTileFactory {
  buildTile: (payload: ChunkPayload, originX: number, originZ: number, tier: number) => TerrainTile;
  /** Debug view: paint every tile's bedrock a flat per-TIER colour, so tier boundaries,
   *  promotions and hysteresis are visible live (`Debug → tint by LOD`). */
  setTintByTier: (on: boolean) => void;
  /** The cost probe `Terrain.setShading` makes, across all live tiles. */
  setShading: (mode: "full" | "flat") => void;
  setTreesVisible: (on: boolean) => void;
  dispose: () => void;
}

/** Unlit, deliberately loud tier colours (finest → coarsest) for the tint debug view. */
const TIER_TINTS = [0xe63946, 0xf4a261, 0xe9c46a, 0x2a9d8f, 0x457b9d, 0x8d5bb9];

/** The far-tier CANOPY CLUMP: one open cone, needle-coloured — a stand at distance is a
 *  green cone, and trunks are sub-pixel. ~14 tris vs the near spruce's 74, because far
 *  tiles carry thousands of clumps across kilometres. Base sits slightly below ground so
 *  a cell-wide clump doesn't float where its widened rim overhangs a slope. */
const buildClumpGeometry = (): THREE.BufferGeometry => {
  const cone = new THREE.ConeGeometry(1.15, 6.2, 7, 1, true);
  cone.translate(0, 6.2 / 2 - 0.6, 0);
  const position = cone.attributes.position;
  const colors = new Float32Array(position.count * 3);
  const needle = new THREE.Color(0x24331f); // the near spruce's canopy colour
  for (let i = 0; i < position.count; i++) needle.toArray(colors, i * 3);
  cone.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return cone;
};

export function createTerrainTileFactory(): TerrainTileFactory {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.92,
    metalness: 0,
  });
  const flatMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });
  const tintMaterials = TIER_TINTS.map((c) => new THREE.MeshBasicMaterial({ color: c }));
  const spruceGeometry = buildSpruceGeometry();
  const clumpGeometry = buildClumpGeometry();
  const spruceMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.95,
    metalness: 0,
  });

  let tint = false;
  let shading: "full" | "flat" = "full";
  let treesVisible = true;
  interface LiveTile {
    bedrock: THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
    forest: THREE.InstancedMesh | null;
    tier: number;
  }
  const live = new Set<LiveTile>();
  const applyMaterial = (tile: LiveTile) => {
    tile.bedrock.material = tint
      ? tintMaterials[Math.min(tile.tier, tintMaterials.length - 1)]
      : shading === "flat"
        ? flatMaterial
        : material;
    // An unlit material cannot receive a shadow; keep the flag honest either way.
    tile.bedrock.receiveShadow = !tint && shading === "full";
  };

  const dummy = new THREE.Object3D();
  const tintColor = new THREE.Color();

  return {
    buildTile: (payload, originX, originZ, tier) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(payload.positions, 3));
      geometry.setAttribute("normal", new THREE.BufferAttribute(payload.normals, 3));
      geometry.setAttribute("color", new THREE.BufferAttribute(payload.colors, 3));
      geometry.setIndex(new THREE.BufferAttribute(payload.index, 1));

      const bedrock: THREE.Mesh<THREE.BufferGeometry, THREE.Material> = new THREE.Mesh(
        geometry,
        material,
      );
      bedrock.position.set(originX, 0, originZ);
      bedrock.name = `tile-${tier}`;
      bedrock.castShadow = true;
      bedrock.receiveShadow = true;

      let forest: THREE.InstancedMesh | null = null;
      // Near tiers instance the detailed spruce; far tiers the cheap canopy clump —
      // the tier's scatter (terrain-gen.ts) already decided which the records describe.
      const treeGeometry = tier <= 1 ? spruceGeometry : clumpGeometry;
      if (payload.treeCount > 0) {
        forest = new THREE.InstancedMesh(treeGeometry, spruceMaterial, payload.treeCount);
        forest.name = "spruce";
        forest.position.set(originX, 0, originZ);
        forest.castShadow = true;
        forest.receiveShadow = true;
        forest.visible = treesVisible;
        for (let i = 0; i < payload.treeCount; i++) {
          const t = i * 7; // x, y, z, scaleXZ, scaleY, spin, shade — see ChunkPayload
          dummy.position.set(payload.trees[t], payload.trees[t + 1], payload.trees[t + 2]);
          dummy.scale.set(payload.trees[t + 3], payload.trees[t + 4], payload.trees[t + 3]);
          dummy.rotation.y = payload.trees[t + 5];
          dummy.updateMatrix();
          forest.setMatrixAt(i, dummy.matrix);
          forest.setColorAt(i, tintColor.setScalar(payload.trees[t + 6]));
        }
        forest.instanceMatrix.needsUpdate = true;
        if (forest.instanceColor) forest.instanceColor.needsUpdate = true;
      }

      const object = new THREE.Group();
      object.add(bedrock);
      if (forest) object.add(forest);
      const tile: LiveTile = { bedrock, forest, tier };
      live.add(tile);
      applyMaterial(tile);

      const spruceTris = treeGeometry.index
        ? treeGeometry.index.count / 3
        : treeGeometry.attributes.position.count / 3;
      return {
        object,
        triangles: { bedrock: payload.index.length / 3, trees: spruceTris * payload.treeCount },
        treeCount: payload.treeCount,
        generationMs: payload.generationMs,
        dispose: () => {
          live.delete(tile);
          geometry.dispose();
          forest?.dispose(); // frees the instance buffers; the spruce geometry/material are shared
        },
      };
    },
    setTintByTier: (on) => {
      tint = on;
      for (const tile of live) applyMaterial(tile);
    },
    setShading: (mode) => {
      shading = mode;
      for (const tile of live) applyMaterial(tile);
    },
    setTreesVisible: (on) => {
      treesVisible = on;
      for (const tile of live) {
        if (tile.forest) tile.forest.visible = on;
      }
    },
    dispose: () => {
      material.dispose();
      flatMaterial.dispose();
      for (const m of tintMaterials) m.dispose();
      spruceGeometry.dispose();
      clumpGeometry.dispose();
      spruceMaterial.dispose();
      live.clear();
    },
  };
}

export { SAMPLE_SPACING, windowChunkRequest };
