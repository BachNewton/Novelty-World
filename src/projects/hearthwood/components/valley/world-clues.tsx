"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { type BufferGeometry, type Mesh, Vector3 } from "three";
import { bestOffered, type Viewer } from "../../gameplay/offering";
import type { WalkState } from "../../input/use-walk-input";
import type { AtmosphereUniforms } from "../../art/atmosphere";
import { CLUE_LARGER, clueShape, GLINT_HEIGHT, type CluePalette } from "../../art/clue-shapes";
import { cloud, glintMaterial } from "../../art/effects";
import { thingMaterial } from "../../art/things";
import { CLUE_MARKS, type ClueMark } from "../../stories/story";
import type { ValleyClock } from "./clock";
import type { Companionship } from "./companionship";
import { companionByClue, joinCompanionClues, type CompanionClues } from "./companion-clues";
import { AFTER_RENDER_PRIORITY } from "./feature-renderer";
import type { Foraging } from "./foraging";
import type { Hearth } from "./hearth";
import { answerClueTaps, examinable, joinMysteries, offerableClue, settleClues, streamClues, weighClue, type ClueLive, type Mysteries } from "./mysteries";
import type { People } from "./people";
import type { Walker } from "./walker";

/*
 * The mysteries' clues round Elliott: each drawn where the world placed it
 * while its person is about, and, while it is still to be examined in a
 * case Elliott has been told, a few soft glints twinkling over it, more
 * and brighter while a companion waits by it. It joins the companions'
 * noticing of the clues to the animals while it is up. Each
 * frame it weighs the clue on offer to examine (after the fire and the
 * people, before the animals and forage, which must beat it) and answers a
 * tap on a clue.
 */

/** Clues are drawn within this of the camera, in metres. */
const DRAW_REACH = 70;
/** A tap lands on a clue within this many CSS pixels of its middle, within this many metres of Elliott. */
const TAP_SLOP = 64;
const TAP_REACH = 4;
/** How the glints circle over each clue to examine, and over one a companion waits by; how many clues can glint at once. */
const GLINTS = { count: 3, radius: 0.18, size: 0.15, opacity: 0.65 } as const;
const BRIGHT = { count: 6, radius: 0.26, size: 0.24, opacity: 0.85 } as const;
const MOST_GLINTING = 12;

/** After the people have been weighed, before the animals weigh themselves against them. */
export const CLUES_PRIORITY = -1.5;

const scratch = { direction: new Vector3(), projected: new Vector3() };

/** A clue's glints: a few soft lights circling over it, as many and as bright as it is wanted. */
function glintCloud(palette: CluePalette, atmosphere: AtmosphereUniforms, phase: number): Mesh {
  const made = cloud(BRIGHT.count, glintMaterial(atmosphere));
  made.renderOrder = 6;
  made.visible = false;
  made.userData = { tint: palette.glint.clone(), phase, lift: GLINT_HEIGHT * CLUE_LARGER, glints: GLINTS.count, ...GLINTS };
  return made;
}

/** The glints this frame: over each clue to examine, brighter where a companion waits by it. */
function twinkle(drawn: readonly { live: ClueLive; glints: Mesh }[], examinableNow: (live: ClueLive) => boolean, waitedBy: (key: string) => boolean): void {
  let glinting = 0;
  for (const { live, glints: mesh } of drawn) {
    const on = examinableNow(live) && glinting < MOST_GLINTING;
    mesh.visible = on;
    if (!on) continue;
    glinting += 1;
    const look = waitedBy(live.key) ? BRIGHT : GLINTS;
    mesh.count = look.count;
    Object.assign(mesh.userData, look, { glints: look.count });
  }
}

export function WorldClues({
  mysteries,
  companionClues,
  people,
  walker,
  input,
  foraging,
  companionship,
  hearth,
  palette,
  atmosphere,
  outbid = () => false,
}: {
  mysteries: Mysteries;
  companionClues: CompanionClues;
  people: People;
  clock: ValleyClock;
  walker: Walker;
  input: RefObject<WalkState>;
  foraging: Foraging;
  companionship: Companionship;
  hearth: Hearth;
  palette: CluePalette;
  atmosphere: AtmosphereUniforms;
  /** Whether something weighed after the clues (a stick) beat them this frame. */
  outbid?: () => boolean;
}) {
  const material = useMemo(() => thingMaterial(atmosphere), [atmosphere]);
  const shapes = useMemo(() => Object.fromEntries(CLUE_MARKS.map((mark) => [mark, clueShape(mark, palette)])) as Record<ClueMark, BufferGeometry>, [palette]);
  useEffect(
    () => () => {
      for (const shape of Object.values(shapes)) shape.dispose();
    },
    [shapes],
  );
  const [drawn, setDrawn] = useState<ClueLive[]>([]);
  const glinted = useMemo(() => drawn.map((live, i) => ({ live, glints: glintCloud(palette, atmosphere, i) })), [drawn, palette, atmosphere]);
  const drawnRef = useRef<ClueLive[]>([]);
  const camera = useThree((s) => s.camera);
  const canvas = useThree((s) => s.gl.domElement);

  useEffect(() => joinMysteries(mysteries), [mysteries]);
  useEffect(() => joinCompanionClues(companionClues), [companionClues]);

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

    twinkle(glinted, (l) => examinable(mysteries, l), (key) => companionByClue(companionClues, key));
  }, CLUES_PRIORITY);

  // After the frame: an animal or forage offered beats a clue, as each had to beat it.
  useFrame(() => {
    settleClues(mysteries, foraging.target !== null || companionship.candidate !== null || outbid());
  }, AFTER_RENDER_PRIORITY);

  return (
    <>
      {glinted.map(({ live, glints }) => (
        <group key={live.key} position={[live.placed.x, live.y, live.placed.z]}>
          <mesh geometry={shapes[live.clue.mark]} material={material} rotation={[0, live.placed.turn, 0]} scale={CLUE_LARGER} castShadow receiveShadow />
          <primitive object={glints} />
        </group>
      ))}
    </>
  );
}
