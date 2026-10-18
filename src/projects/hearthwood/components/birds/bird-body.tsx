"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { BoxGeometry, type BufferGeometry, Color, ConeGeometry, CylinderGeometry, type Group, MeshLambertMaterial, SphereGeometry } from "three";
import { themeColor } from "@/shared/lib/three/theme-color";
import type { AtmosphereUniforms } from "../../art/atmosphere";
import { paint, type Piece } from "../../art/painted";
import { shadeLambert } from "../../art/shading";
import { BIRD_SIZE, PLUMAGE, type Plumage, type Songbird } from "../../birds/bird";
import type { BirdPose } from "../../birds/motion";

/*
 * The songbirds' one winged body: a rounded body with its back, breast and
 * belly in their colours, a head with its cap, cheeks, a little beak and
 * bright eyes, two wings on pivots at the shoulders that fold back along the
 * body and spread and beat in flight, a tail that cocks and fans, and thin
 * legs that tuck up. Each species is only its colours on it. It faces +z
 * with its feet at the origin, at life size; whoever places it scales it.
 */

/** A part of a shape: a sphere squashed to its radii at a point, in a colour. */
function ball(radii: readonly [number, number, number], at: readonly [number, number, number], colour: Color, shading = 0.25): Piece {
  const geometry = new SphereGeometry(1, 10, 8);
  geometry.scale(...radii);
  geometry.translate(...at);
  return { geometry, colour, shading };
}

interface BirdShapes {
  body: BufferGeometry;
  head: BufferGeometry;
  wing: BufferGeometry;
  tail: BufferGeometry;
  legs: BufferGeometry;
}

const colourOf = (token: string) => new Color().copy(themeColor(token));

function shapesOf(plumage: Plumage): BirdShapes {
  const c = {
    back: colourOf(plumage.back),
    breast: colourOf(plumage.breast),
    belly: colourOf(plumage.belly),
    cap: colourOf(plumage.cap),
    cheek: colourOf(plumage.cheek),
    wing: colourOf(plumage.wing),
    bar: colourOf(plumage.bar),
    tail: colourOf(plumage.tail),
    beak: colourOf(plumage.beak),
    eye: colourOf("--color-hearthwood-bird-black"),
  };
  const bodyPieces = [ball([0.027, 0.025, 0.042], [0, 0.047, -0.004], c.back, 0.35), ball([0.025, 0.026, 0.03], [0, 0.037, 0.012], c.breast), ball([0.021, 0.019, 0.026], [0, 0.029, -0.006], c.belly)];
  if (plumage.tie) bodyPieces.push(ball([0.0045, 0.02, 0.012], [0, 0.034, 0.03], colourOf(plumage.tie)));
  const beak = new ConeGeometry(0.0042, 0.013, 6);
  beak.rotateX(Math.PI / 2);
  beak.translate(0, -0.003, 0.025);
  const head: Piece[] = [
    ball([0.0185, 0.018, 0.019], [0, 0, 0], c.cap, 0.3),
    ball([0.016, 0.0125, 0.013], [0, -0.005, 0.009], c.cheek),
    ball([0.0028, 0.0028, 0.0028], [0.0118, 0.003, 0.012], c.eye),
    ball([0.0028, 0.0028, 0.0028], [-0.0118, 0.003, 0.012], c.eye),
    { geometry: beak, colour: c.beak },
  ];
  // The left wing, spread out along +x from its shoulder; folded, the scene turns it back along the body.
  const wing: Piece[] = [ball([0.036, 0.0035, 0.02], [0.031, 0, -0.004], c.wing, 0.2), ball([0.026, 0.0036, 0.006], [0.026, 0.0004, 0.004], c.bar, 0)];
  const tailShape = new BoxGeometry(0.024, 0.003, 0.042);
  tailShape.translate(0, 0, -0.021);
  const legs = [-1, 1].map((side) => {
    const leg = new CylinderGeometry(0.0016, 0.0016, 0.026, 4);
    leg.translate(side * 0.008, 0.013, 0.004);
    return { geometry: leg, colour: colourOf("--color-hearthwood-bird-legs") };
  });
  return { body: paint(bodyPieces), head: paint(head), wing: paint(wing), tail: paint([{ geometry: tailShape, colour: c.tail, shading: 0.2 }]), legs: paint(legs) };
}

const shapes = new Map<Songbird, BirdShapes>();
function birdShapes(species: Songbird): BirdShapes {
  let known = shapes.get(species);
  if (!known) {
    known = shapesOf(PLUMAGE[species]);
    shapes.set(species, known);
  }
  return known;
}

const materials = new WeakMap<AtmosphereUniforms, MeshLambertMaterial>();
/** The birds' one material, in the world's air: their colours are in their vertices. */
function birdMaterial(atmosphere: AtmosphereUniforms): MeshLambertMaterial {
  let known = materials.get(atmosphere);
  if (!known) {
    known = shadeLambert(new MeshLambertMaterial({ vertexColors: true }), "solid", atmosphere);
    materials.set(atmosphere, known);
  }
  return known;
}

/** Where the parts hang from on the body. */
const HEAD_AT = [0, 0.066, 0.026] as const;
const SHOULDER = [0.021, 0.055, 0.012] as const;
const TAIL_AT = [0, 0.046, -0.038] as const;
/** How far a folded wing is swept back along the body. */
const FOLDED = 1.42;

export interface BirdHandle {
  /** The bird as a whole, for whoever places it. */
  group: Group | null;
  pose: (pose: BirdPose) => void;
}

export const BirdBody = forwardRef<BirdHandle, { species: Songbird; atmosphere: AtmosphereUniforms; still?: BirdPose }>(function BirdBody({ species, atmosphere, still }, ref) {
  const parts = useMemo(() => birdShapes(species), [species]);
  const material = useMemo(() => birdMaterial(atmosphere), [atmosphere]);
  const group = useRef<Group>(null);
  const body = useRef<Group>(null);
  const head = useRef<Group>(null);
  const wingL = useRef<Group>(null);
  const wingR = useRef<Group>(null);
  const tail = useRef<Group>(null);
  const legs = useRef<Group>(null);
  const handle = useMemo<BirdHandle>(
    () => ({
      get group() {
        return group.current;
      },
      pose: (p) => {
        if (!body.current || !head.current || !wingL.current || !wingR.current || !tail.current || !legs.current) return;
        const size = BIRD_SIZE[species];
        body.current.scale.set(size * (1 + p.fluff * 0.18), size * (1 + p.fluff * 0.12), size * (1 + p.fluff * 0.05));
        body.current.position.y = p.bob;
        body.current.rotation.x = p.pitch;
        head.current.rotation.set(p.headPitch, p.headYaw, 0);
        const sweep = FOLDED * (1 - p.wingOpen);
        wingL.current.rotation.set(0, sweep, p.wingBeat + (1 - p.wingOpen) * -0.25);
        wingR.current.rotation.set(0, -sweep, -p.wingBeat - (1 - p.wingOpen) * -0.25);
        tail.current.rotation.x = -p.tailPitch + 0.15;
        tail.current.scale.x = 1 + p.tailFan * 0.8;
        legs.current.scale.y = 1 - p.tuck * 0.8;
      },
    }),
    [species],
  );
  useImperativeHandle(ref, () => handle, [handle]);
  useEffect(() => {
    if (still) handle.pose(still);
  }, [handle, still]);
  return (
    <group ref={group}>
      <group ref={body}>
        <mesh geometry={parts.body} material={material} castShadow />
        <group ref={head} position={[...HEAD_AT]}>
          <mesh geometry={parts.head} material={material} />
        </group>
        <group ref={wingL} position={[...SHOULDER]}>
          <mesh geometry={parts.wing} material={material} />
        </group>
        <group ref={wingR} position={[-SHOULDER[0], SHOULDER[1], SHOULDER[2]]} scale={[-1, 1, 1]}>
          <mesh geometry={parts.wing} material={material} />
        </group>
        <group ref={tail} position={[...TAIL_AT]}>
          <mesh geometry={parts.tail} material={material} />
        </group>
        <group ref={legs}>
          <mesh geometry={parts.legs} material={material} />
        </group>
      </group>
    </group>
  );
});
