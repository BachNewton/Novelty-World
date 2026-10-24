"use client";

import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { type BufferGeometry, type Camera, Euler, type Group, InstancedMesh, type Material, type Mesh, Object3D, Quaternion, Vector3 } from "three";
import type { AtmosphereUniforms } from "../../art/atmosphere";
import { fetchStickGeometry } from "../../art/fetch-stick";
import type { Palette } from "../../art/palette";
import { thingMaterial } from "../../art/things";
import { bestOffered, type Viewer } from "../../gameplay/offering";
import { stickPlace } from "../../gameplay/fetch";
import type { WalkState } from "../../input/use-walk-input";
import { AFTER_RENDER_PRIORITY } from "./feature-renderer";
import { answerStickTaps, carries, holdHand, joinPlay, offerableStick, pickupAt, settleStick, sticksAround, thrownToPickUp, weighStick, type Fetching, type Pickup } from "./fetching";
import type { Foraging } from "./foraging";
import { ANIMALS_PRIORITY } from "./world-animals";
import type { Walker } from "./walker";

/*
 * Fetch in the world: the fallen sticks round Elliott, drawn instanced; the
 * sticks thrown, along their arc, floating or lying where they came down;
 * the stick in Elliott's hand (low in the view through their eyes, in their
 * right hand from behind); and the stick a dog carries, held in its jaws.
 * Each frame it says where Elliott's hand is and which way they would
 * throw, finds the stick on offer to pick up, weighed against everything
 * else offered by the one rule, and answers a tap on a stick.
 */

/** Runs after the animals, before forage weighs its offer. */
const FETCH_PRIORITY = ANIMALS_PRIORITY + 0.5;
/** The world's sticks are drawn within this of Elliott, in metres, looked at again each time they move this far. */
const DRAW_REACH = 50;
const RESTREAM = 4;
/** Sticks within this of Elliott are weighed for offering, in metres. */
const OFFER_REACH = 4;
/** A tap lands on a stick within this many CSS pixels of where it is drawn, within this many metres of Elliott. */
const TAP_SLOP = 60;
const TAP_REACH = 4.5;
/** How many thrown sticks are drawn at once. */
const THROWN_DRAWN = 10;
/** A stick lies this far up off the ground, to its middle, in metres. */
const LIES_UP = 0.018;

/** Where the stick sits in Elliott's view through their eyes: to the right, low, and ahead, in the camera's own frame; and how it is turned, pointing ahead and a little up and in. */
const IN_VIEW = { at: new Vector3(0.3, -0.4, -0.75), turn: new Quaternion().setFromEuler(new Euler(0.2, Math.PI + 0.24, 0.35, "YXZ")) } as const;
/** Where it sits in their right hand from behind, in their own frame (facing +z, their left +x), and how it is turned, pointing ahead and down. */
const IN_HAND = { at: new Vector3(-0.31, 0.9, 0.2), turn: new Euler(0.75, -0.25, 0, "YXZ") } as const;
/** Where a dog holds a stick, in its jaw's own frame: just behind the front of its lower jaw, across its mouth. */
const IN_JAWS = { at: [0, -0.004, 0.036] as const, turn: [0, Math.PI / 2, 0] as const };

export interface StickArt {
  geometry: BufferGeometry;
  material: Material;
}

/** The stick's model and material, shared by every stick drawn. */
export function useStickArt(palette: Palette, atmosphere: AtmosphereUniforms): StickArt {
  const art = useMemo(() => ({ geometry: fetchStickGeometry(palette), material: thingMaterial(atmosphere) }), [palette, atmosphere]);
  useEffect(
    () => () => {
      art.geometry.dispose();
    },
    [art],
  );
  return art;
}

const scratch = { v: new Vector3(), e: new Euler(0, 0, 0, "YXZ"), dir: new Vector3() };

/** A stick held in a dog's jaws, hung from its jaw, while `shown` says: the same size in the world whatever the dog's size. */
export function StickInJaws({ art, shown }: { art: StickArt; shown: () => boolean }) {
  const mesh = useRef<Mesh>(null);
  useFrame(() => {
    const stick = mesh.current;
    if (!stick) return;
    stick.visible = shown();
    if (!stick.visible || !stick.parent) return;
    stick.parent.getWorldScale(scratch.v);
    // Turned across the mouth, its own length runs along the jaw's x.
    stick.scale.set(1 / scratch.v.z, 1 / scratch.v.y, 1 / scratch.v.x);
  });
  return <mesh ref={mesh} geometry={art.geometry} material={art.material} position={IN_JAWS.at} rotation={IN_JAWS.turn} visible={false} castShadow />;
}

/** A dog's stick, in its jaws while it carries one. */
export function JawStick({ fetching, dogKey, art }: { fetching: Fetching; dogKey: string; art: StickArt }) {
  return <StickInJaws art={art} shown={() => carries(fetching, dogKey)} />;
}

/** Where Elliott's hand is and which way they throw: through their eyes from low in the view along the way they look, or from their right hand the way they face. */
function handOf(walker: Walker, input: WalkState, camera: Camera, feet: number): Fetching["hand"] {
  if (input.pointOfView === "first" && walker.view === "walk") {
    const from = scratch.v.copy(IN_VIEW.at).applyQuaternion(camera.quaternion).add(camera.position);
    const way = camera.getWorldDirection(scratch.dir);
    return { from: { x: from.x, y: from.y, z: from.z }, way: { x: way.x, y: way.y, z: way.z } };
  }
  const s = Math.sin(walker.heading);
  const c = Math.cos(walker.heading);
  const { x, y, z } = IN_HAND.at;
  return { from: { x: walker.x + x * c + z * s, y: feet + y, z: walker.z - x * s + z * c }, way: { x: s, y: 0, z: c } };
}

/** The stick in Elliott's hand, placed for the view. */
function placeHeld(held: Object3D, walker: Walker, input: WalkState, camera: Camera, feet: number, holding: boolean): void {
  const throughTheirEyes = input.pointOfView === "first" && walker.view === "walk";
  held.visible = holding && (throughTheirEyes || walker.view === "walk" || walker.view === "hearth" || walker.view === "talk");
  if (!held.visible) return;
  if (throughTheirEyes) {
    held.position.copy(IN_VIEW.at).applyQuaternion(camera.quaternion).add(camera.position);
    held.quaternion.copy(camera.quaternion).multiply(IN_VIEW.turn);
    return;
  }
  const s = Math.sin(walker.heading);
  const c = Math.cos(walker.heading);
  const { x, y, z } = IN_HAND.at;
  held.position.set(walker.x + x * c + z * s, feet + y, walker.z - x * s + z * c);
  scratch.e.set(IN_HAND.turn.x, walker.heading + IN_HAND.turn.y, IN_HAND.turn.z, "YXZ");
  held.quaternion.setFromEuler(scratch.e);
}

/** The world's sticks round Elliott into the instanced mesh. */
function fillLying(mesh: InstancedMesh, fetching: Fetching, x: number, z: number, dummy: Object3D): void {
  const sticks = sticksAround(fetching, x, z, DRAW_REACH);
  const count = Math.min(sticks.length, mesh.instanceMatrix.count);
  for (let i = 0; i < count; i++) {
    const stick = sticks[i];
    dummy.position.set(stick.x, stick.y + LIES_UP, stick.z);
    dummy.rotation.set(0, stick.turn, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.count = count;
  mesh.instanceMatrix.needsUpdate = true;
}

export function WorldFetch({
  fetching,
  foraging,
  walker,
  input,
  art,
  rival,
}: {
  fetching: Fetching;
  foraging: Foraging;
  walker: Walker;
  input: RefObject<WalkState>;
  art: StickArt;
  /** How strongly anything else is offered this frame, by the same rule: a stick is offered only if more strongly. */
  rival: () => number;
}) {
  const camera = useThree((s) => s.camera);
  const canvas = useThree((s) => s.gl.domElement);
  const { world } = fetching;
  const lying = useMemo(() => {
    const mesh = new InstancedMesh(art.geometry, art.material, 128);
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    mesh.count = 0;
    return mesh;
  }, [art]);
  useEffect(() => () => lying.dispose(), [lying]);
  const thrownGroup = useRef<Group>(null);
  const held = useRef<Mesh>(null);
  const filled = useRef<{ x: number; z: number; taken: number } | null>(null);
  const dummy = useMemo(() => new Object3D(), []);

  useEffect(() => joinPlay(fetching), [fetching]);

  useEffect(() => {
    const projected = new Vector3();
    answerStickTaps(fetching, (x, y) => {
      if (fetching.holding) return null;
      const rect = canvas.getBoundingClientRect();
      const near: Pickup[] = [...sticksAround(fetching, walker.x, walker.z, TAP_REACH).map((spot) => ({ spot })), ...thrownToPickUp(fetching).map((t) => ({ thrown: t.id }))];
      let best: Pickup | null = null;
      let nearest = TAP_SLOP;
      for (const pickup of near) {
        const at = pickupAt(fetching, pickup);
        if (Math.hypot(at.x - walker.x, at.z - walker.z) > TAP_REACH) continue;
        projected.set(at.x, at.y + LIES_UP, at.z).project(camera);
        if (projected.z > 1) continue;
        const off = Math.hypot(rect.left + ((projected.x + 1) / 2) * rect.width - x, rect.top + ((1 - projected.y) / 2) * rect.height - y);
        if (off < nearest) {
          nearest = off;
          best = pickup;
        }
      }
      return best;
    });
    return () => {
      answerStickTaps(fetching, null);
    };
  }, [fetching, walker, camera, canvas]);

  useFrame(({ camera: eye }) => {
    const state = input.current;
    const feet = walker.air?.y ?? world.heightAt(walker.x, walker.z);
    holdHand(fetching, handOf(walker, state, eye, feet));

    const last = filled.current;
    if (last === null || Math.hypot(walker.x - last.x, walker.z - last.z) > RESTREAM || last.taken !== fetching.taken.size) {
      filled.current = { x: walker.x, z: walker.z, taken: fetching.taken.size };
      fillLying(lying, fetching, walker.x, walker.z, dummy);
    }

    // The thrown sticks, each where it is: in the air, on the water, or on the ground; one in a dog's jaws is the dog's to draw.
    const group = thrownGroup.current;
    if (group) {
      const shownNow = fetching.thrown.filter((t) => t.carriedBy === null);
      group.children.forEach((child, i) => {
        const thrown = shownNow.at(i);
        child.visible = thrown !== undefined;
        if (!thrown) return;
        const at = stickPlace(thrown.stick, world, thrown.turn);
        const bob = thrown.stick.phase === "floating" ? Math.sin(thrown.stick.age * 2.3) * 0.01 : 0;
        child.position.set(at.x, at.y + LIES_UP + bob, at.z);
        child.rotation.set(at.tumble, at.heading, 0, "YXZ");
      });
    }

    if (held.current) placeHeld(held.current, walker, state, eye, feet, fetching.holding);

    const viewer: Viewer | null =
      walker.view !== "walk" || fetching.holding || walker.air?.mode === "broom" || fetching.companionship.shown.naming !== null
        ? null
        : state.pointOfView === "first"
          ? { pointOfView: "first", eye: eye.position, look: eye.getWorldDirection(new Vector3()) }
          : { pointOfView: "third", x: walker.x, z: walker.z, heading: walker.heading };
    if (viewer === null) {
      weighStick(fetching, null);
      return;
    }
    const near: Pickup[] = [...sticksAround(fetching, walker.x, walker.z, OFFER_REACH).map((spot) => ({ spot })), ...thrownToPickUp(fetching).map((t) => ({ thrown: t.id }))];
    const best = bestOffered(near, viewer, (pickup) => offerableStick(pickupAt(fetching, pickup)), rival());
    weighStick(fetching, best && { pickup: best.offered, score: best.score });
  }, FETCH_PRIORITY);

  useFrame(() => {
    settleStick(fetching, foraging.target !== null);
  }, AFTER_RENDER_PRIORITY);

  return (
    <>
      <primitive object={lying} />
      <group ref={thrownGroup}>
        {Array.from({ length: THROWN_DRAWN }, (_, i) => (
          <mesh key={i} geometry={art.geometry} material={art.material} visible={false} castShadow />
        ))}
      </group>
      <mesh ref={held} geometry={art.geometry} material={art.material} visible={false} castShadow />
    </>
  );
}
