"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { AdditiveBlending, BufferAttribute, BufferGeometry, MeshLambertMaterial, Points, PointsMaterial, Vector3 } from "three";
import { bestOffered, type Viewer } from "../../gameplay/offering";
import type { WalkState } from "../../input/use-walk-input";
import type { AtmosphereUniforms } from "../../art/atmosphere";
import { CLUE_LARGER, clueShape, GLINT_HEIGHT, glintTexture, type CluePalette } from "../../art/clue-shapes";
import { shadeLambert } from "../../art/shading";
import { CLUE_MARKS, type ClueMark } from "../../stories/story";
import type { ValleyClock } from "./clock";
import type { Companionship } from "./companionship";
import { AFTER_RENDER_PRIORITY } from "./feature-renderer";
import type { Foraging } from "./foraging";
import type { Hearth } from "./hearth";
import { answerClueTaps, examinable, joinMysteries, offerableClue, settleClues, streamClues, weighClue, type ClueLive, type Mysteries } from "./mysteries";
import type { People } from "./people";
import type { Walker } from "./walker";

/*
 * The mysteries' clues round Elliott: each drawn where the world placed it
 * while its person is about, and, while it is still to be examined in a
 * case Elliott has been told, a few soft glints twinkling over it. Each
 * frame it weighs the clue on offer to examine (after the fire and the
 * people, before the animals and forage, which must beat it) and answers a
 * tap on a clue.
 */

/** Clues are drawn within this of the camera, in metres. */
const DRAW_REACH = 70;
/** A tap lands on a clue within this many CSS pixels of its middle, within this many metres of Elliott. */
const TAP_SLOP = 64;
const TAP_REACH = 4;
/** Glints over each clue to examine, and how many clues can glint at once. */
const GLINTS_EACH = 3;
const MOST_GLINTING = 12;

/** After the people have been weighed, before the animals weigh themselves against them. */
export const CLUES_PRIORITY = -1.5;

const scratch = { direction: new Vector3(), projected: new Vector3() };

/** A few glints circling softly over each clue still to examine. */
function twinkle(glints: Points<BufferGeometry, PointsMaterial>, clues: readonly ClueLive[], t: number): void {
  const position = glints.geometry.getAttribute("position") as BufferAttribute;
  const glinting = clues.slice(0, MOST_GLINTING);
  glinting.forEach((live, i) => {
    for (let g = 0; g < GLINTS_EACH; g++) {
      const angle = t * 0.9 + (g / GLINTS_EACH) * Math.PI * 2 + i;
      const lift = GLINT_HEIGHT + 0.08 * Math.sin(t * 1.7 + g * 2.1 + i);
      position.setXYZ(i * GLINTS_EACH + g, live.placed.x + Math.cos(angle) * 0.18, live.y + lift * CLUE_LARGER, live.placed.z + Math.sin(angle) * 0.18);
    }
  });
  position.needsUpdate = true;
  glints.geometry.setDrawRange(0, glinting.length * GLINTS_EACH);
  glints.material.size = 0.15 + 0.05 * Math.sin(t * 3.1);
  glints.material.opacity = 0.65 + 0.35 * Math.sin(t * 2.3);
}

export function WorldClues({
  mysteries,
  people,
  clock,
  walker,
  input,
  foraging,
  companionship,
  hearth,
  palette,
  atmosphere,
}: {
  mysteries: Mysteries;
  people: People;
  clock: ValleyClock;
  walker: Walker;
  input: RefObject<WalkState>;
  foraging: Foraging;
  companionship: Companionship;
  hearth: Hearth;
  palette: CluePalette;
  atmosphere: AtmosphereUniforms;
}) {
  const material = useMemo(() => shadeLambert(new MeshLambertMaterial({ vertexColors: true }), "solid", atmosphere), [atmosphere]);
  const shapes = useMemo(() => Object.fromEntries(CLUE_MARKS.map((mark) => [mark, clueShape(mark, palette)])) as Record<ClueMark, BufferGeometry>, [palette]);
  const glints = useMemo(() => {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(MOST_GLINTING * GLINTS_EACH * 3), 3));
    const points = new Points(geometry, new PointsMaterial({ color: palette.glint, map: glintTexture(), size: 0.16, transparent: true, depthWrite: false, blending: AdditiveBlending }));
    points.frustumCulled = false;
    return points;
  }, [palette]);
  useEffect(
    () => () => {
      material.dispose();
      for (const shape of Object.values(shapes)) shape.dispose();
      glints.geometry.dispose();
      glints.material.map?.dispose();
      glints.material.dispose();
    },
    [material, shapes, glints],
  );
  const [drawn, setDrawn] = useState<ClueLive[]>([]);
  const drawnRef = useRef<ClueLive[]>([]);
  const camera = useThree((s) => s.camera);
  const canvas = useThree((s) => s.gl.domElement);

  useEffect(() => joinMysteries(mysteries), [mysteries]);

  useEffect(() => {
    answerClueTaps(mysteries, (x, y) => {
      const rect = canvas.getBoundingClientRect();
      let best: { key: string; d: number } | null = null;
      for (const live of mysteries.live.values()) {
        if (!examinable(mysteries, live) || Math.hypot(live.placed.x - walker.x, live.placed.z - walker.z) > TAP_REACH) continue;
        const { heart } = offerableClue(live);
        const at = scratch.projected.set(heart.x, heart.y, heart.z).project(camera);
        if (at.z > 1) continue;
        const d = Math.hypot(rect.left + ((at.x + 1) / 2) * rect.width - x, rect.top + ((1 - at.y) / 2) * rect.height - y);
        if (d < TAP_SLOP && (best === null || d < best.d)) best = { key: live.key, d };
      }
      return best?.key ?? null;
    });
    return () => {
      answerClueTaps(mysteries, null);
    };
  }, [mysteries, walker, camera, canvas]);

  useFrame(({ camera: eye }) => {
    streamClues(mysteries);
    const near = [...mysteries.live.values()].filter((l) => Math.hypot(l.placed.x - eye.position.x, l.placed.z - eye.position.z) < DRAW_REACH);
    const before = drawnRef.current;
    if (near.length !== before.length || near.some((l, i) => l !== before[i])) {
      drawnRef.current = near;
      setDrawn(near);
    }

    // The clue on offer to examine, if it beats the fire and the people.
    const busy = walker.view !== "walk" || people.shown.talking !== null || companionship.shown.naming !== null || hearth.shown.session !== null || mysteries.shown.examining !== null;
    const viewer: Viewer | null = busy
      ? null
      : input.current.pointOfView === "first"
        ? { pointOfView: "first", eye: eye.position, look: eye.getWorldDirection(scratch.direction) }
        : { pointOfView: "third", x: walker.x, z: walker.z, heading: walker.heading };
    const candidates = near.filter((l) => examinable(mysteries, l) && Math.abs(l.placed.x - walker.x) < 5 && Math.abs(l.placed.z - walker.z) < 5);
    const beat = Math.min(hearth.candidate ?? Infinity, people.candidate?.score ?? Infinity);
    const best = viewer ? bestOffered(candidates, viewer, offerableClue, beat) : null;
    weighClue(mysteries, best && { key: best.offered.key, score: best.score });

    twinkle(glints, near.filter((l) => examinable(mysteries, l)), clock.motion);
  }, CLUES_PRIORITY);

  // After the frame: an animal or forage offered beats a clue, as each had to beat it.
  useFrame(() => {
    settleClues(mysteries, foraging.target !== null || companionship.candidate !== null);
  }, AFTER_RENDER_PRIORITY);

  return (
    <>
      <primitive object={glints} />
      {drawn.map((live) => (
        <mesh key={live.key} geometry={shapes[live.clue.mark]} material={material} position={[live.placed.x, live.y, live.placed.z]} rotation={[0, live.placed.turn, 0]} scale={CLUE_LARGER} castShadow receiveShadow />
      ))}
    </>
  );
}
