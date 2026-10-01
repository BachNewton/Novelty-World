"use client";

import { useImperativeHandle, useMemo, useRef, type Ref } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group, Material, Mesh } from "three";
import { cellKey } from "../../logic";
import type { Rotation, TetrominoKind } from "../../types";
import type { Vec3 } from "../../vehicles/parts";
import { FROG_LOOKS, type FrogVariant } from "../../frog/look";
import { GROUND_CLEARANCE } from "../../clearance";
import { frogModel, type FrogPart } from "../../frog/model";
import { frogMotion, type FrogAction } from "../../frog/motion";
import type { FrogDrawing } from "./frog-assets";

// Starts one of the frog's reactions; "idle" cuts one short. The frog times
// it from the next frame, on the render clock.
export interface FrogHandle {
  play: (action: FrogAction) => void;
}

const minus = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const middleOf = (part: FrogPart): Vec3 => [
  (part.min[0] + part.max[0]) / 2,
  (part.min[1] + part.max[1]) / 2,
  (part.min[2] + part.max[2]) / 2,
];

// One part as a unit shape scaled to its box, placed relative to `origin`,
// the point its group scales about.
function PartMesh({
  part,
  origin,
  assets,
  material,
  renderOrder,
  ref,
}: {
  part: FrogPart;
  origin: Vec3;
  assets: FrogDrawing;
  material: Material;
  renderOrder: number;
  ref?: Ref<Mesh>;
}) {
  const [x0, y0, z0] = part.min;
  const [x1, y1, z1] = part.max;
  return (
    <mesh
      ref={ref}
      geometry={assets.shapes[part.shape]}
      material={material}
      renderOrder={renderOrder}
      position={minus(middleOf(part), origin)}
      scale={[x1 - x0, y1 - y0, z1 - z0]}
    />
  );
}

// The player's frog, or a sleepy unclaimed one, as any piece in any
// rotation, in its own frame (see `frog/model.ts`): cells from x = 0 across
// and from the clearance up, its front face at z = 0 and its back toward the
// camera at z = 1. It breathes, blinks and puffs its throat by itself, and
// plays a hop, a landing or a bonk when told to through `ref`. Its meshes
// draw in `renderOrder` among the scene's opaque objects.
export function FrogBody({
  kind,
  rotation,
  variant,
  clearance = GROUND_CLEARANCE,
  seed = 0,
  renderOrder = 0,
  assets,
  ref,
}: {
  kind: TetrominoKind;
  rotation: Rotation;
  variant: FrogVariant;
  clearance?: number;
  // Tells frogs apart, so two frogs never blink in step.
  seed?: number;
  renderOrder?: number;
  assets: FrogDrawing;
  ref?: Ref<FrogHandle>;
}) {
  const look = FROG_LOOKS[variant];
  const model = useMemo(
    () => frogModel(kind, rotation, { markings: look.markings, pupil: look.pupil, clearance }),
    [kind, rotation, look.markings, look.pupil, clearance],
  );
  // Each cell's first eye in the list of all the frog's eyes, and where each
  // pupil rests in its eye.
  const eyeStart = useMemo(
    () => model.cells.map((_, c) => model.cells.slice(0, c).reduce((n, cell) => n + cell.eyes.length, 0)),
    [model],
  );
  const pupilRest = useMemo(
    () => model.cells.flatMap((cell) => cell.eyes.map((eye) => minus(middleOf(eye.pupil), eye.centre))),
    [model],
  );
  const paints = assets.paints[variant];

  const playing = useRef<{ action: FrogAction; at: number | null }>({ action: "idle", at: null });
  useImperativeHandle(ref, () => ({
    play(action) {
      playing.current = { action, at: null };
    },
  }));

  const cells = useRef<(Group | null)[]>([]);
  const eyeballs = useRef<(Group | null)[]>([]);
  const pupils = useRef<(Mesh | null)[]>([]);
  const throat = useRef<Group | null>(null);
  const legs = useRef<(Group | null)[]>([]);

  useFrame(({ clock }) => {
    const now = clock.elapsedTime;
    const current = playing.current;
    current.at ??= now;
    const motion = frogMotion({
      time: now,
      action: current.action,
      since: now - current.at,
      seed,
      sleepy: look.sleepy,
    });
    cells.current.forEach((group) => group?.scale.set(...motion.cell));
    eyeballs.current.forEach((group) => group?.scale.setScalar(motion.eyeball));
    throat.current?.scale.setScalar(motion.throat);
    legs.current.forEach((group) => {
      if (group === null) return;
      group.visible = motion.tuck < 1;
      group.scale.setScalar(1 - motion.tuck);
    });
    const orbit = motion.pupilOrbit;
    const [dx, dz] =
      orbit === null ? [0, 0] : [Math.cos(orbit.angle) * orbit.radius, Math.sin(orbit.angle) * orbit.radius];
    pupils.current.forEach((pupil, i) => {
      const [x, y, z] = pupilRest[i];
      pupil?.position.set(x + dx, y, z + dz);
    });
  });

  return (
    <group>
      {model.cells.map((cell, c) => (
        <group
          key={cellKey(cell.cell)}
          ref={(group) => {
            cells.current[c] = group;
          }}
          position={cell.anchor}
        >
          {cell.body.map((part, i) => (
            <PartMesh renderOrder={renderOrder} key={`body${String(i)}`} part={part} origin={cell.anchor} assets={assets} material={paints.body} />
          ))}
          {cell.details.map((part, i) => (
            <PartMesh renderOrder={renderOrder}
              key={`detail${String(i)}`}
              part={part}
              origin={cell.anchor}
              assets={assets}
              material={paints.roles[part.role]}
            />
          ))}
          {cell.eyes.map((eye, i) => {
            const e = eyeStart[c] + i;
            return (
              <group key={e} position={minus(eye.centre, cell.anchor)}>
                <PartMesh renderOrder={renderOrder} part={eye.bump} origin={eye.centre} assets={assets} material={paints.roles.skin} />
                <group
                  ref={(group) => {
                    eyeballs.current[e] = group;
                  }}
                >
                  <PartMesh renderOrder={renderOrder} part={eye.white} origin={eye.centre} assets={assets} material={paints.roles.eye} />
                  <PartMesh renderOrder={renderOrder}
                    ref={(mesh) => {
                      pupils.current[e] = mesh;
                    }}
                    part={eye.pupil}
                    origin={eye.centre}
                    assets={assets}
                    material={paints.roles.pupil}
                  />
                </group>
              </group>
            );
          })}
          {cell.throat && (
            // The throat puffs about its own middle.
            <group ref={throat} position={minus(middleOf(cell.throat), cell.anchor)}>
              <PartMesh renderOrder={renderOrder}
                part={cell.throat}
                origin={middleOf(cell.throat)}
                assets={assets}
                material={paints.roles.belly}
              />
            </group>
          )}
        </group>
      ))}
      {model.legs.map((leg, l) => (
        <group
          key={l}
          ref={(group) => {
            legs.current[l] = group;
          }}
          position={leg.hip}
        >
          {leg.parts.map((part, i) => (
            <PartMesh renderOrder={renderOrder} key={i} part={part} origin={leg.hip} assets={assets} material={paints.roles[part.role]} />
          ))}
        </group>
      ))}
    </group>
  );
}
