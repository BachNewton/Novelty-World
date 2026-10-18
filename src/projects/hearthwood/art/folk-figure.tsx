"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import type { Group, Material } from "three";
import { armRest, folkParts, type FolkLook, type FolkPalette, type FolkPose } from "./folk";

/*
 * A person drawn and idling: their figure in its four parts, breathing, the
 * body swaying a little, the head turning to look (and nodding along while
 * they talk), and the left hand raised in a wave when they greet Elliott.
 * The scene works out the pose each frame and hands it over; nothing here
 * decides anything.
 */

export interface FolkHandle {
  group: Group | null;
  pose: (pose: FolkPose) => void;
}

export const STILL_FOLK: FolkPose = { seconds: 0, look: 0, nod: 0, wave: 0, talking: false };

export const FolkFigure = forwardRef<FolkHandle, { look: FolkLook; seat: number | null; palette: FolkPalette; material: Material; still?: Partial<FolkPose> }>(function FolkFigure({ look, seat, palette, material, still }, ref) {
  const group = useRef<Group>(null);
  const body = useRef<Group>(null);
  const head = useRef<Group>(null);
  const left = useRef<Group>(null);
  const right = useRef<Group>(null);
  const parts = useMemo(() => folkParts(look, palette, seat), [look, palette, seat]);
  useEffect(
    () => () => {
      for (const geometry of [parts.body, parts.head, parts.armLeft, parts.armRight]) geometry.dispose();
    },
    [parts],
  );
  const pose = useCallback(
    (p: FolkPose) => {
      if (!body.current || !head.current || !left.current || !right.current) return;
      const t = p.seconds;
      body.current.scale.y = 1 + Math.sin(t * 1.7) * 0.012;
      body.current.rotation.z = Math.sin(t * 0.6) * 0.015;
      head.current.rotation.y = p.look;
      head.current.rotation.x = p.nod + (p.talking ? Math.max(0, Math.sin(t * 7.5)) * 0.06 : 0);
      head.current.rotation.z = Math.sin(t * 0.43 + 1.3) * 0.04;
      const leftRest = armRest(look.tool, false);
      const rightRest = armRest(look.tool, true);
      // A wave: the hand comes up beside the head, waves, and goes down again.
      const up = Math.sin(Math.min(1, Math.max(0, p.wave)) * Math.PI);
      const lift = Math.min(1, up * 1.6);
      left.current.rotation.x = leftRest.x * (1 - lift) - 0.25 * lift;
      left.current.rotation.z = leftRest.z + lift * (2.55 + Math.sin(t * 11) * 0.28);
      right.current.rotation.x = rightRest.x + Math.sin(t * 1.7) * 0.015;
      right.current.rotation.z = rightRest.z;
    },
    [look.tool],
  );
  useImperativeHandle(ref, () => ({
    get group() {
      return group.current;
    },
    pose,
  }));
  useEffect(() => {
    pose({ ...STILL_FOLK, ...still });
  }, [pose, still]);
  const { frame } = parts;
  return (
    <group ref={group}>
      <group ref={body}>
        <mesh geometry={parts.body} material={material} castShadow receiveShadow />
        <group ref={head} position={[0, frame.neck, 0]}>
          <mesh geometry={parts.head} material={material} castShadow receiveShadow />
        </group>
        {/* Facing +z, their left hand is at +x. */}
        <group ref={left} position={[frame.shoulder.x, frame.shoulder.y, 0]}>
          <mesh geometry={parts.armLeft} material={material} castShadow receiveShadow />
        </group>
        <group ref={right} position={[-frame.shoulder.x, frame.shoulder.y, 0]}>
          <mesh geometry={parts.armRight} material={material} castShadow receiveShadow />
        </group>
      </group>
    </group>
  );
});
