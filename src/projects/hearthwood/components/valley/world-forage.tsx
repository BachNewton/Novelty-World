"use client";

import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { type BufferGeometry, Group, InstancedBufferAttribute, InstancedMesh, type Material, Object3D, Vector3 } from "three";
import { FORAGE_FORM, FORAGE_VARIANTS, type ForageChunk, type ForageForm, type ForageSpot } from "../../engine/forage";
import { FORAGE_KINDS, type ForageKind } from "../../engine/regions";
import { wantedChunks, type ChunkKey } from "../../engine/streaming";
import type { Foraged } from "../../gameplay/basket";
import { canPick, heartOf, REACH, spotLook, targetSpot, withinTapReach, type ForageTime, type Viewer } from "../../gameplay/picking";
import type { WalkState } from "../../input/use-walk-input";
import { type AtmosphereUniforms } from "../../art/atmosphere";
import { bushMaterial, thingMaterial } from "../../art/things";
import { forageColour, forageMatrix, forageShape, partsOf, type ForagePalette, type ForagePart } from "../../art/forage-shapes";
import { agePop, makePop, type PickPop } from "../../art/pick-pop";
import type { ValleyClock } from "./clock";
import { answerTaps, forageTime, offer, reportSettled, takePopping, type Foraging } from "./foraging";
import type { Walker } from "./walker";

/*
 * The berries and mushrooms round the walker, streamed by chunk and drawn
 * instanced, one draw per design and part, each spot drawn as it is today
 * (ripe, bare, cut or not up at all). Each frame it finds what Elliott is
 * looking at to offer for picking (unless something else, an animal, is
 * offered more strongly), answers a tap on the screen with what was tapped,
 * and plays each pick's pop into the basket.
 */

/** How far round the camera forage is drawn, in metres. */
const DRAW_REACH = 110;
/** The camera moves this far before the chunks it wants are worked out again. */
const RECHECK = 4;
/** How many chunks are placed in one frame while they stream in. */
const BUILDS_PER_FRAME = 2;
/** A tap lands on a spot within this many CSS pixels of where its middle is drawn. */
const TAP_SLOP = 56;
/** How finely through the day what is ripe and what has grown back is looked at again: every hour. */
const LOOKS_PER_DAY = 24;

interface Design {
  kind: ForageKind;
  variant: number;
  part: ForagePart;
  geometry: BufferGeometry;
  mesh: InstancedMesh | null;
}

type Materials = Record<ForageForm, Material>;

const designId = (kind: ForageKind, variant: number, part: ForagePart) => `${kind}/${variant}/${part}`;
const chunkId = (k: ChunkKey) => `${k.chunkX},${k.chunkZ}`;

interface State {
  chunks: Map<string, ForageChunk>;
  wanted: ChunkKey[];
  pending: ChunkKey[];
  from: Vector3 | null;
  /** What the meshes were last filled from: the chunks, the picks and the hour. */
  filled: { chunks: string; foraged: Foraged | null; hour: number };
  pops: PickPop[];
}

export function WorldForage({
  foraging,
  palette,
  atmosphere,
  clock,
  walker,
  input,
  rival,
}: {
  foraging: Foraging;
  palette: ForagePalette;
  atmosphere: AtmosphereUniforms;
  clock: ValleyClock;
  walker: Walker;
  input: RefObject<WalkState>;
  /** How strongly something else (an animal) is on offer this frame, by the same rule; a spot is offered only if it is offered more strongly. */
  rival?: () => number;
}) {
  const group = useMemo(() => new Group(), []);
  // A berry bush's leaves and its fruit sway and take the light together, as foliage; a mushroom stands still.
  const materials = useMemo<Materials>(
    () => ({
      berry: bushMaterial(atmosphere),
      mushroom: thingMaterial(atmosphere),
    }),
    [atmosphere],
  );
  const designs = useMemo(() => {
    const out = new Map<string, Design>();
    for (const kind of FORAGE_KINDS) {
      for (let variant = 0; variant < FORAGE_VARIANTS; variant++) {
        for (const part of partsOf(kind)) out.set(designId(kind, variant, part), { kind, variant, part, geometry: forageShape(kind, variant, part, palette), mesh: null });
      }
    }
    return out;
  }, [palette]);
  const state = useRef<State>({ chunks: new Map(), wanted: [], pending: [], from: null, filled: { chunks: "", foraged: null, hour: NaN }, pops: [] });
  const dummy = useMemo(() => new Object3D(), []);
  const camera = useThree((s) => s.camera);
  const canvas = useThree((s) => s.gl.domElement);

  useEffect(
    () => () => {
      for (const design of designs.values()) {
        design.geometry.dispose();
        design.mesh?.dispose();
      }
    },
    [designs],
  );

  useEffect(() => {
    const projected = new Vector3();
    answerTaps(foraging, (x, y) => {
      const rect = canvas.getBoundingClientRect();
      const time = forageTime(clock);
      let best: ForageSpot | null = null;
      let nearest = TAP_SLOP;
      for (const spot of foraging.forage.spotsNear(walker.x, walker.z, REACH.tap)) {
        if (!withinTapReach(spot, walker.x, walker.z) || !canPick(spot, foraging.foraged, time)) continue;
        const heart = heartOf(spot);
        projected.set(heart.x, heart.y, heart.z).project(camera);
        if (projected.z > 1) continue;
        const sx = rect.left + ((projected.x + 1) / 2) * rect.width;
        const sy = rect.top + ((1 - projected.y) / 2) * rect.height;
        const off = Math.hypot(sx - x, sy - y);
        if (off < nearest) {
          nearest = off;
          best = spot;
        }
      }
      return best;
    });
    return () => {
      answerTaps(foraging, null);
    };
  }, [foraging, camera, canvas, clock, walker]);

  useFrame(({ camera: eye }, delta) => {
    const s = state.current;
    const at = eye.position;
    if (s.from === null || s.from.distanceTo(at) > RECHECK) {
      s.from = at.clone();
      s.wanted = wantedChunks(at.x, at.z, DRAW_REACH);
      s.pending = s.wanted.filter((k) => !s.chunks.has(chunkId(k)));
      const keep = new Set(s.wanted.map(chunkId));
      for (const id of s.chunks.keys()) if (!keep.has(id)) s.chunks.delete(id);
    }
    for (let n = 0; n < BUILDS_PER_FRAME && s.pending.length > 0; n++) {
      const key = s.pending.shift() as ChunkKey;
      s.chunks.set(chunkId(key), foraging.forage.spotsIn(key.chunkX, key.chunkZ));
    }
    reportSettled(foraging, s.pending.length === 0);

    const time = forageTime(clock);
    const hour = Math.floor(time.day * LOOKS_PER_DAY);
    const chunks = [...s.chunks.keys()].join(";");
    if (chunks !== s.filled.chunks || foraging.foraged !== s.filled.foraged || hour !== s.filled.hour) {
      s.filled = { chunks, foraged: foraging.foraged, hour };
      fill([...s.chunks.values()], foraging.foraged, time, designs, group, materials, dummy);
    }

    const viewer: Viewer | null =
      walker.view !== "walk" ? null : input.current.pointOfView === "first" ? { pointOfView: "first", eye: at, look: eye.getWorldDirection(new Vector3()) } : { pointOfView: "third", x: walker.x, z: walker.z, heading: walker.heading };
    offer(foraging, viewer ? targetSpot(foraging.forage.spotsNear(walker.x, walker.z, REACH.first + 1), viewer, foraging.foraged, time, rival?.() ?? Infinity) : null);

    for (const spot of takePopping(foraging)) {
      const design = designs.get(designId(spot.kind, spot.variant, FORAGE_FORM[spot.kind] === "berry" ? "fruit" : "plant"));
      if (!design) throw new Error(`No design to pop for ${spot.kind}`);
      const pop = makePop(design.geometry, materials[FORAGE_FORM[spot.kind]], spot, palette, atmosphere);
      s.pops.push(pop);
      group.add(pop.group);
    }
    s.pops = s.pops.filter((pop) => {
      if (agePop(pop, Math.min(delta, 0.1))) return true;
      group.remove(pop.group);
      return false;
    });
  });

  return <primitive object={group} />;
}

/** Copies every spot into its design's mesh as it shows today. */
function fill(chunks: readonly ForageChunk[], foraged: Foraged, time: ForageTime, designs: Map<string, Design>, group: Group, materials: Materials, dummy: Object3D): void {
  const placed = new Map<string, ForageSpot[]>();
  const add = (spot: ForageSpot, part: ForagePart) => {
    const id = designId(spot.kind, spot.variant, part);
    const list = placed.get(id);
    if (list) list.push(spot);
    else placed.set(id, [spot]);
  };
  for (const chunk of chunks) {
    for (const spot of chunk.spots) {
      const look = spotLook(spot, foraged, time);
      if (FORAGE_FORM[spot.kind] === "berry") {
        add(spot, "plant");
        if (look === "ripe") add(spot, "fruit");
      } else if (look === "ripe") add(spot, "plant");
      else if (look === "cut") add(spot, "cut");
    }
  }
  const colour = new Float32Array(3);
  for (const [id, design] of designs) {
    const spots = placed.get(id) ?? [];
    let mesh = design.mesh;
    if (spots.length > 0 && (!mesh || mesh.instanceMatrix.count < spots.length)) {
      if (mesh) {
        group.remove(mesh);
        mesh.dispose();
      }
      mesh = new InstancedMesh(design.geometry, materials[FORAGE_FORM[design.kind]], Math.max(64, 2 ** Math.ceil(Math.log2(spots.length * 1.25))));
      mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(mesh.instanceMatrix.count * 3), 3);
      mesh.frustumCulled = false;
      mesh.castShadow = design.part !== "cut";
      design.mesh = mesh;
      group.add(mesh);
    }
    if (!mesh) continue;
    spots.forEach((spot, i) => {
      mesh.setMatrixAt(i, forageMatrix(spot, dummy));
      forageColour(spot, colour, 0);
      mesh.instanceColor?.array.set(colour, i * 3);
    });
    mesh.count = spots.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
}
