"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Group, Mesh, type Material } from "three";
import type { LandTile } from "../../engine/tiles";
import { tileId, tileWidth, wantedTiles, type Eye, type TileKey } from "../../engine/streaming";
import type { World } from "../../engine/world";
import type { AtmosphereUniforms } from "../../art/atmosphere";
import type { Palette } from "../../art/palette";
import type { SkyUniforms } from "../../art/sky/sky";
import { followViewer, moveTerrainFire, terrainGeometry, terrainMaterial, type Morph } from "../../art/terrain";
import { farWaterMaterial } from "../../art/water/far-water";
import { waterGeometry, waterMaterial, waterMesh } from "../../art/water/water";
import type { Quality } from "../../quality";
import { pitchedSite, subscribeCamping, type Camping } from "./camping";
import { useFeature } from "./feature-renderer";
import { landWorkers, type LandWorkers } from "./land-workers";

/*
 * The land round the camera out to the horizon, streamed: the tiles the
 * camera wants are worked out in workers, nearest and finest first, made
 * into meshes as they come back, and the drawn set changes over to them all
 * at once when every one is ready, so no hole ever opens. Each tile eases
 * into its parent's shape towards the distance where it is swapped for it,
 * so the swap shows no step. Tiles no longer wanted are kept a while in case
 * the camera comes back, then dropped. Tiles too coarse for the water in
 * full carry far water while that feature is on; switching it rebuilds
 * them, the old ones drawn until the new set is ready.
 */

/** How far the camera moves before the wanted tiles are worked out again, in metres. */
const RECHECK = 4;
/** How many built tiles are kept beyond those drawn. */
const KEPT = 600;
/** How many tiles are asked of the workers at once. */
const IN_FLIGHT = 12;

interface Built {
  level: number;
  land: Mesh;
  water: Mesh | null;
}

/** Whether each streamed part has built and drawn everything the camera wants. */
export interface Streaming {
  land: boolean;
  plants: boolean;
  places: boolean;
}

/** A streamed part says whether it has everything the camera wants. */
export function report(streaming: Streaming, part: keyof Streaming, settled: boolean): void {
  streaming[part] = settled;
}

interface State {
  built: Map<string, Built>;
  arrived: LandTile[];
  asked: Set<string>;
  shown: Set<string>;
  /** Built tiles replaced while still drawn, freed once the drawn set changes over. */
  retired: Built[];
  /** Whether the built tiles carry far water. */
  farWater: boolean;
  wanted: TileKey[];
  pending: TileKey[];
  from: Eye | null;
}

function priority(eye: Eye, key: TileKey): number {
  const size = tileWidth(key.level);
  return Math.hypot((key.i + 0.5) * size - eye.x, (key.j + 0.5) * size - eye.z) / size;
}

/** A tile is drawn until the camera is within `tileSplit` of its parent's widths of it: it eases into the parent's shape over the last stretch before that. */
function morphFor(level: number, quality: Quality): Morph {
  const swap = tileWidth(level + 1) * quality.tileSplit;
  return { start: swap * 0.62, end: swap * 0.92 };
}

export function WorldLand({ world, camping, palette, atmosphere, sky, quality, streaming }: { world: World; camping: Camping; palette: Palette; atmosphere: AtmosphereUniforms; sky: SkyUniforms; quality: Quality; streaming: Streaming }) {
  const group = useMemo(() => new Group(), []);
  const materials = useMemo(
    () => ({
      land: terrainMaterial(atmosphere, palette, quality.trees.far),
      water: waterMaterial(palette, atmosphere, sky),
      farWater: farWaterMaterial(palette, atmosphere, sky),
    }),
    [palette, atmosphere, sky, quality],
  );
  // The worn ground round the fire goes where camp is pitched.
  useEffect(() => {
    const move = () => {
      moveTerrainFire(pitchedSite(camping));
    };
    move();
    return subscribeCamping(camping, move);
  }, [camping, materials]);
  const farWater = useFeature("farWater");
  const state = useRef<State>({ built: new Map(), arrived: [], asked: new Set(), shown: new Set(), retired: [], farWater, wanted: [], pending: [], from: null });
  const workers = useRef<LandWorkers | null>(null);

  useEffect(() => {
    const s = state.current;
    const pool = landWorkers(world.seed, (tile) => s.arrived.push(tile));
    workers.current = pool;
    return () => {
      pool.dispose();
      workers.current = null;
      for (const tile of [...s.built.values(), ...s.retired]) dispose(tile);
      s.built.clear();
      s.retired.length = 0;
      s.asked.clear();
      s.shown.clear();
      s.arrived.length = 0;
      s.from = null;
      group.clear();
      materials.land.dispose();
      materials.water.dispose();
      materials.farWater.dispose();
    };
  }, [world, materials, group]);

  useFrame(({ camera }) => {
    const s = state.current;
    const pool = workers.current;
    if (!pool) return;
    if (s.farWater !== farWater) {
      s.farWater = farWater;
      for (const [id, tile] of s.built) {
        if (tile.level < quality.waterLevels) continue;
        s.built.delete(id);
        s.retired.push(tile);
      }
      s.shown = new Set();
      s.from = null;
    }
    const { x, y, z } = camera.position;
    followViewer(camera.position);
    const eye = { x, y: y - world.surfaceAt(x, z), z };
    if (s.from === null || Math.hypot(eye.x - s.from.x, eye.y - s.from.y, eye.z - s.from.z) > RECHECK) {
      s.from = eye;
      s.wanted = wantedTiles(eye, quality);
      s.pending = s.wanted.filter((k) => !s.built.has(tileId(k)) && !s.asked.has(tileId(k))).sort((a, b) => priority(eye, a) - priority(eye, b));
    }
    while (s.pending.length > 0 && pool.waiting() < IN_FLIGHT) {
      const key = s.pending.shift() as TileKey;
      s.asked.add(tileId(key));
      pool.request(key);
    }
    for (const tile of s.arrived.splice(0)) {
      const id = tileId(tile.key);
      s.asked.delete(id);
      s.built.set(id, buildTile(tile, materials, quality, s.farWater));
    }
    if (s.wanted.some((k) => !s.built.has(tileId(k)))) {
      report(streaming, "land", false);
      return;
    }
    const ids = new Set(s.wanted.map(tileId));
    if (ids.size !== s.shown.size || [...ids].some((id) => !s.shown.has(id))) {
      group.clear();
      for (const id of ids) {
        const tile = s.built.get(id);
        if (!tile) continue;
        group.add(tile.land);
        if (tile.water) group.add(tile.water);
      }
      s.shown = ids;
      for (const tile of s.retired.splice(0)) dispose(tile);
      if (s.built.size > ids.size + KEPT) {
        for (const [id, tile] of s.built) {
          if (s.built.size <= ids.size + KEPT) break;
          if (ids.has(id)) continue;
          dispose(tile);
          s.built.delete(id);
        }
      }
    }
    report(streaming, "land", true);
  });

  return <primitive object={group} />;
}

/** Tiles this fine and finer cast shadows: the land near the camera, where its own shadow (a bank, a boulder field's rise) reads; further off the wrap light gives every slope its lit and shaded side. */
const CASTING_LEVELS = 1;

function buildTile(tile: LandTile, materials: { land: Material; water: Material; farWater: Material }, quality: Quality, farWater: boolean): Built {
  const { level } = tile.key;
  const land = new Mesh(terrainGeometry(tile, morphFor(level, quality)), materials.land);
  land.receiveShadow = true;
  land.castShadow = level <= CASTING_LEVELS;
  const near = level < quality.waterLevels;
  const wet = near || farWater ? waterGeometry(tile) : null;
  return { level, land, water: wet ? waterMesh(wet, near ? materials.water : materials.farWater) : null };
}

function dispose(tile: Built): void {
  tile.land.geometry.dispose();
  tile.water?.geometry.dispose();
}
