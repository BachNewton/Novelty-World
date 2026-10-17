"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type RefObject,
} from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { type Camera, type Group, Vector3 } from "three";
import type { AtmosphereUniforms } from "../../art/atmosphere";
import type { World } from "../../engine/world";
import {
  animalGround,
  stepBody,
  type Obstacle,
} from "../../gameplay/behaviour";
import { stepCompanion, type Leader } from "../../gameplay/companions";
import { bestOffered, type Viewer } from "../../gameplay/offering";
import { stepStray, type Elliott } from "../../gameplay/roaming";
import { WALK_SPEED } from "../../input/walk-controls";
import type { WalkState } from "../../input/use-walk-input";
import { CatBody } from "../cats/cat-body";
import { DogBody } from "../dogs/dog-body";
import type { ValleyClock } from "./clock";
import {
  driveOf,
  followingAnimals,
  forgetMarks,
  hasOffer,
  inHand,
  isResting,
  MARK_LIFE,
  offerableAnimal,
  settleOffer,
  straysAround,
  wakeCompanion,
  wakeStray,
  warmByPatience,
  companionOf,
  DRAWN_LARGER,
  type Animal,
  type Companionship,
} from "./companionship";
import { AFTER_RENDER_PRIORITY } from "./feature-renderer";
import type { Foraging } from "./foraging";
import type { Walker } from "./walker";

/*
 * The cats and dogs round Elliott: the strays streamed in by area as they
 * walk, and the companions, each stepped every frame by its rules (a
 * stray's day and its warming to Elliott, a companion's following) and
 * drawn on its own body, driven from the rules without re-rendering. It
 * finds the animal on offer to pet or treat, to weigh against forage's
 * offer; answers a tap on the screen with the animal tapped; and moves the
 * overlay's names and hearts over the animals they belong to.
 */

/** Strays are brought to life within this of Elliott and let go beyond the second, in metres. */
const STRAY_REACH = 150;
const STRAY_GONE = 190;
/** Elliott moves this far before the strays round them are looked at again. */
const RESTREAM = 6;
/** Animals are drawn within this of the camera, in metres. */
const DRAW_REACH = 90;
/** A companion's name shows within this of the camera, fading out towards it. */
const NAME_REACH = 9;
/** A tap lands on an animal within this many CSS pixels of where it is drawn, within this many metres of Elliott. */
const TAP_SLOP = 70;
const TAP_REACH = 4.5;
/** How Elliott keeps animals clear of them, and animals each other, in metres. */
const CLEAR = { elliott: 0.95, animal: 0.55 } as const;
/** Steps the rules are cut into, at most, in seconds. */
const STEP = 1 / 20;

/** Runs after the walker and the free camera, before forage weighs its offer against the animals'. */
export const ANIMALS_PRIORITY = -1;

/** What the animals keep of Elliott between frames: where they were, how fast and which way they are going. */
export interface Leading {
  x: number;
  z: number;
  heading: number;
  speed: number;
  /** Where the strays round Elliott were last looked at. */
  streamedAt: { x: number; z: number } | null;
}

export function leadingFrom(walker: Walker): Leading {
  return {
    x: walker.x,
    z: walker.z,
    heading: walker.heading,
    speed: 0,
    streamedAt: null,
  };
}

const projected = new Vector3();

/** Whether a point is in the camera's view and near enough to be drawn: what an animal must not be moved in or out of. */
export function inView(
  camera: Camera,
  world: World,
  x: number,
  z: number,
): boolean {
  const dx = x - camera.position.x;
  const dz = z - camera.position.z;
  if (Math.hypot(dx, dz) > DRAW_REACH) return false;
  projected.set(x, world.heightAt(x, z) + 0.3, z).project(camera);
  return (
    projected.z < 1 &&
    Math.abs(projected.x) < 1.15 &&
    Math.abs(projected.y) < 1.15
  );
}

/** Brings strays to life round Elliott and lets the far ones go, and wakes any companion not yet live. */
function stream(
  companionship: Companionship,
  leading: Leading,
  walker: Walker,
): void {
  const { animals } = companionship;
  if (
    leading.streamedAt === null ||
    Math.hypot(
      walker.x - leading.streamedAt.x,
      walker.z - leading.streamedAt.z,
    ) > RESTREAM
  ) {
    leading.streamedAt = { x: walker.x, z: walker.z };
    for (const stray of straysAround(
      companionship,
      walker.x,
      walker.z,
      STRAY_REACH,
    ))
      if (!animals.has(stray.id)) wakeStray(companionship, stray);
    for (const [key, animal] of animals)
      if (
        animal.stray &&
        Math.hypot(
          animal.stray.home.x - walker.x,
          animal.stray.home.z - walker.z,
        ) > STRAY_GONE
      )
        animals.delete(key);
  }
  const kept = new Set(companionship.friends.companions.map((c) => c.id));
  for (const [key, animal] of animals)
    if (animal.stray === null && !kept.has(key)) animals.delete(key);
  let following = 0;
  let resting = 0;
  for (const companion of companionship.friends.companions) {
    const index = companion.following ? following++ : resting++;
    if (!animals.has(companion.id))
      wakeCompanion(companionship, companion, walker, index);
  }
}

/**
 * The animals' rules for some seconds: Elliott's pace and way read from the
 * walker, every stray and companion stepped (cut into short steps, so a
 * long frame comes out as several short ones), each animal's drawing driven
 * from its body. `seen` is whether a point is in Elliott's view.
 */
export function stepAnimals(
  companionship: Companionship,
  world: World,
  walker: Walker,
  leading: Leading,
  seen: (x: number, z: number) => boolean,
  seconds: number,
  motion: number,
): void {
  const moved = Math.hypot(walker.x - leading.x, walker.z - leading.z);
  // A walker put somewhere from outside (a screenshot) has jumped, not run there.
  const pace = seconds > 0 && moved < 15 ? moved / seconds : 0;
  leading.speed += (pace - leading.speed) * Math.min(1, seconds * 8);
  if (moved > 0.01 && moved < 15)
    leading.heading = Math.atan2(walker.x - leading.x, walker.z - leading.z);
  else if (leading.speed < 0.2) leading.heading = walker.heading;
  leading.x = walker.x;
  leading.z = walker.z;
  stream(companionship, leading, walker);

  const aloft = walker.air !== undefined && walker.air.mode !== "ground";
  const leader: Leader = {
    x: walker.x,
    z: walker.z,
    heading: leading.heading,
    speed: leading.speed,
    aloft,
  };
  const elliott: Elliott = {
    x: walker.x,
    z: walker.z,
    speed: leading.speed,
    calm: leading.speed <= WALK_SPEED * 1.08,
    aloft,
  };
  const hand = inHand(companionship);
  const camp = world.camp;
  const following = followingAnimals(companionship);
  const resting = [...companionship.animals.values()].filter((a) =>
    isResting(companionship, a),
  );
  const all = [...companionship.animals.values()];

  let left = Math.max(0, seconds);
  while (left > 1e-6) {
    const dt = Math.min(STEP, left);
    left -= dt;
    companionship.time += dt;
    const time = companionship.time;
    for (const animal of all) {
      const ground = animalGround(world, animal.species);
      const obstacles: Obstacle[] = [
        {
          x: walker.x,
          z: walker.z,
          clear: CLEAR.elliott + 0.15 * animal.nature.size,
        },
      ];
      for (const other of all) {
        if (
          other !== animal &&
          Math.abs(other.body.x - animal.body.x) < 2 &&
          Math.abs(other.body.z - animal.body.z) < 2
        ) {
          obstacles.push({
            x: other.body.x,
            z: other.body.z,
            clear:
              CLEAR.animal * (animal.nature.size + other.nature.size) * 0.5 +
              0.2,
          });
        }
      }
      const d = Math.hypot(animal.body.x - walker.x, animal.body.z - walker.z);
      if (time < animal.pettedUntil) {
        // Petted, it stops and turns to Elliott: a cat sits or stands for it, a dog stands to wag.
        const rest =
          animal.species === "dog"
            ? "stand"
            : animal.body.rest === "lie"
              ? "sit"
              : animal.body.rest;
        stepBody(
          animal.body,
          animal.nature,
          {
            stay: rest,
            face: Math.atan2(
              walker.x - animal.body.x,
              walker.z - animal.body.z,
            ),
          },
          ground,
          obstacles,
          dt,
        );
      } else if (animal.stray) {
        warmByPatience(companionship, animal, d, elliott.calm && !aloft, dt);
        const tempted = hand !== null && hand === animal.tastes.favourite;
        stepStray(
          animal.body,
          animal.stray.mind,
          animal.nature,
          animal.temper,
          animal.bond,
          animal.stray.home,
          animal.stray.roam,
          elliott,
          tempted,
          time,
          ground,
          obstacles,
          dt,
        );
      } else if (animal.follow) {
        const restingIndex = resting.indexOf(animal);
        if (restingIndex >= 0) {
          const atCamp: Leader = {
            x: camp.x,
            z: camp.z,
            heading: 0,
            speed: 0,
            aloft: false,
          };
          const context = {
            leader: atCamp,
            hearth: camp,
            index: following.length + restingIndex,
            count: following.length + resting.length,
            time,
            ground,
            obstacles,
            seen,
          };
          // Waiting at camp, they lie by the fire from the first.
          animal.follow.still = Math.max(animal.follow.still, 30);
          stepCompanion(animal.body, animal.follow, animal.nature, context, dt);
        } else {
          const index = following.indexOf(animal);
          stepCompanion(
            animal.body,
            animal.follow,
            animal.nature,
            {
              leader,
              hearth: camp,
              index,
              count: following.length + resting.length,
              time,
              ground,
              obstacles,
              seen,
            },
            dt,
          );
        }
      }
    }
  }
  for (const animal of companionship.animals.values()) {
    animal.y = world.heightAt(animal.body.x, animal.body.z);
    driveOf(animal, companionship.time, motion);
  }
}

/** The animal Elliott could pet or treat now, and how strongly it is offered, if more strongly than the fire, before forage has its say. */
function findCandidate(
  companionship: Companionship,
  viewer: Viewer | null,
  walker: Walker,
): void {
  if (viewer === null || companionship.shown.naming) {
    companionship.candidate = null;
    return;
  }
  const near = [...companionship.animals.values()].filter(
    (a) =>
      Math.abs(a.body.x - walker.x) < 5 &&
      Math.abs(a.body.z - walker.z) < 5 &&
      hasOffer(companionship, a),
  );
  // The fire, offered first, is the animals' rival as forage is.
  const best = bestOffered(
    near,
    viewer,
    offerableAnimal,
    companionship.hearth.candidate ?? Infinity,
  );
  companionship.candidate = best && {
    key: best.offered.key,
    score: best.score,
  };
}

function AnimalView({
  animal,
  clock,
  atmosphere,
  register,
}: {
  animal: Animal;
  clock: ValleyClock;
  atmosphere: AtmosphereUniforms;
  register: (key: string, group: Group | null) => void;
}) {
  const offset = useMemo(
    () => (animal.nature.seed % 1000) / 37,
    [animal.nature.seed],
  );
  const time = useMemo(() => () => clock.motion + offset, [clock, offset]);
  const { look } = animal;
  return (
    <group
      ref={(group) => {
        register(animal.key, group);
      }}
    >
      <group scale={DRAWN_LARGER}>
        {look.species === "cat" ? (
          <CatBody
            cat={look.cat}
            activity={look.drive.current.activity}
            drive={look.drive}
            clock={time}
            atmosphere={atmosphere}
          />
        ) : (
          <DogBody
            dog={look.dog}
            activity={look.drive.current.activity}
            drive={look.drive}
            clock={time}
            atmosphere={atmosphere}
          />
        )}
      </group>
    </group>
  );
}

/** What the scene keeps between frames: each animal's drawn group, what it knows of Elliott, and the motion clock it last stepped at. */
interface AnimalScene {
  groups: Map<string, Group>;
  leading: Leading;
  lastMotion: number | null;
  /** The live animals' keys as last drawn, to know when the drawn set must change. */
  drawnKeys: string;
}

function registerGroup(
  scene: AnimalScene,
  key: string,
  group: Group | null,
): void {
  if (group) scene.groups.set(key, group);
  else scene.groups.delete(key);
}

/** The scene's hooks into the store: what a tap pets, stepping the rules on the spot, and whether every animal in view is drawn. */
function hookScene(
  companionship: Companionship,
  scene: AnimalScene,
  world: World,
  walker: Walker,
  clock: ValleyClock,
  camera: Camera,
  canvas: HTMLCanvasElement,
): () => void {
  const at = new Vector3();
  companionship.tapAt = (x, y) => {
    const rect = canvas.getBoundingClientRect();
    let best: string | null = null;
    let nearest = TAP_SLOP;
    for (const animal of companionship.animals.values()) {
      if (
        Math.hypot(animal.body.x - walker.x, animal.body.z - walker.z) >
          TAP_REACH ||
        !hasOffer(companionship, animal)
      )
        continue;
      const heart = offerableAnimal(animal).heart;
      at.set(heart.x, heart.y, heart.z).project(camera);
      if (at.z > 1) continue;
      const off = Math.hypot(
        rect.left + ((at.x + 1) / 2) * rect.width - x,
        rect.top + ((1 - at.y) / 2) * rect.height - y,
      );
      if (off < nearest) {
        nearest = off;
        best = animal.key;
      }
    }
    return best;
  };
  companionship.simulate = (seconds) => {
    // In steps, as frames would be; Elliott stands where they are throughout.
    for (let left = seconds; left > 1e-6; left -= 1 / 30)
      stepAnimals(
        companionship,
        world,
        walker,
        scene.leading,
        (x, z) => inView(camera, world, x, z),
        Math.min(1 / 30, left),
        clock.motion,
      );
  };
  companionship.meshed = () =>
    scene.groups.size === companionship.animals.size &&
    [...scene.groups.values()].every(
      (group) => !group.visible || group.children.length > 0,
    );
  return () => {
    companionship.tapAt = null;
    companionship.simulate = null;
    companionship.meshed = null;
  };
}

/** One frame of the animals: their rules stepped by the motion clock, their groups moved, and the animal on offer found. Returns the live animals when the drawn set must change. */
function frameAnimals(
  companionship: Companionship,
  scene: AnimalScene,
  world: World,
  walker: Walker,
  clock: ValleyClock,
  input: WalkState,
  eye: Camera,
): Animal[] | null {
  const last = scene.lastMotion;
  scene.lastMotion = clock.motion;
  const seconds =
    last === null ? 0 : Math.min(0.1, Math.max(0, clock.motion - last));
  stepAnimals(
    companionship,
    world,
    walker,
    scene.leading,
    (x, z) => inView(eye, world, x, z),
    seconds,
    clock.motion,
  );
  forgetMarks(companionship);

  for (const [key, group] of scene.groups) {
    const animal = companionship.animals.get(key);
    if (!animal) continue;
    group.position.set(animal.body.x, animal.y, animal.body.z);
    group.rotation.y = animal.body.heading;
    group.visible =
      Math.hypot(
        animal.body.x - eye.position.x,
        animal.body.z - eye.position.z,
      ) < DRAW_REACH;
  }

  const viewer: Viewer | null =
    walker.view !== "walk"
      ? null
      : input.pointOfView === "first"
        ? {
            pointOfView: "first",
            eye: eye.position,
            look: eye.getWorldDirection(new Vector3()),
          }
        : {
            pointOfView: "third",
            x: walker.x,
            z: walker.z,
            heading: walker.heading,
          };
  findCandidate(companionship, viewer, walker);

  const keys = [...companionship.animals.keys()].sort().join(";");
  if (keys === scene.drawnKeys) return null;
  scene.drawnKeys = keys;
  return [...companionship.animals.values()];
}

/** Where a point is on the overlay, in CSS pixels, or null behind the camera. */
function onScreen(
  at: Vector3,
  eye: Camera,
  size: { width: number; height: number },
): { x: number; y: number } | null {
  at.project(eye);
  if (at.z > 1) return null;
  return {
    x: ((at.x + 1) / 2) * size.width,
    y: ((1 - at.y) / 2) * size.height,
  };
}

/** The names over the companions near the camera, fading with distance, and the marks rising over their animals. */
function placeOverlay(
  companionship: Companionship,
  eye: Camera,
  size: { width: number; height: number },
): void {
  const at = new Vector3();
  for (const [key, element] of companionship.screen.names) {
    const animal = companionship.animals.get(key);
    const distance = animal
      ? eye.position.distanceTo(at.set(animal.body.x, animal.y, animal.body.z))
      : Infinity;
    const shown =
      animal &&
      companionOf(companionship, key) &&
      distance <= NAME_REACH &&
      distance > 0.8
        ? onScreen(
            at.set(
              animal.body.x,
              animal.y + 0.36 * animal.nature.size + 0.1,
              animal.body.z,
            ),
            eye,
            size,
          )
        : null;
    if (!shown) {
      element.style.opacity = "0";
      continue;
    }
    element.style.opacity = String(
      Math.min(1, (NAME_REACH - distance) / 3) * 0.85,
    );
    element.style.transform = `translate(${shown.x}px, ${shown.y}px) translate(-50%, -100%)`;
  }
  for (const shownMark of companionship.shown.marks) {
    const element = companionship.screen.marks.get(shownMark.id);
    if (!element) continue;
    const animal = companionship.animals.get(shownMark.key);
    const age = (companionship.time - shownMark.born) / MARK_LIFE;
    const shown =
      animal && age < 1
        ? onScreen(
            at.set(
              animal.body.x,
              animal.y + 0.34 * animal.nature.size + 0.12 + age * 0.5,
              animal.body.z,
            ),
            eye,
            size,
          )
        : null;
    if (!shown) {
      element.style.opacity = "0";
      continue;
    }
    element.style.opacity = String(Math.min(1, (1 - age) * 2.2));
    element.style.transform = `translate(${shown.x}px, ${shown.y}px) translate(-50%, -100%) scale(${0.6 + 0.6 * Math.min(1, age * 4)})`;
  }
}

export function WorldAnimals({
  companionship,
  world,
  clock,
  walker,
  input,
  foraging,
  atmosphere,
}: {
  companionship: Companionship;
  world: World;
  clock: ValleyClock;
  walker: Walker;
  input: RefObject<WalkState>;
  foraging: Foraging;
  atmosphere: AtmosphereUniforms;
}) {
  const camera = useThree((s) => s.camera);
  const canvas = useThree((s) => s.gl.domElement);
  const scene = useMemo<AnimalScene>(
    () => ({
      groups: new Map(),
      leading: leadingFrom(walker),
      lastMotion: null,
      drawnKeys: "",
    }),
    [walker],
  );
  const [live, setLive] = useState<Animal[]>([]);

  useEffect(
    () => hookScene(companionship, scene, world, walker, clock, camera, canvas),
    [companionship, scene, world, walker, clock, camera, canvas],
  );

  useFrame(({ camera: eye }) => {
    const changed = frameAnimals(
      companionship,
      scene,
      world,
      walker,
      clock,
      input.current,
      eye,
    );
    if (changed) setLive(changed);
  }, ANIMALS_PRIORITY);

  // After the frame: forage has offered or not, so the animal's offer is settled; the names and hearts move over their animals.
  useFrame(({ camera: eye, size }) => {
    settleOffer(companionship, foraging.target !== null);
    placeOverlay(companionship, eye, size);
  }, AFTER_RENDER_PRIORITY);

  const register = useCallback(
    (key: string, group: Group | null) => {
      registerGroup(scene, key, group);
    },
    [scene],
  );

  return (
    <>
      {live.map((animal) => (
        <AnimalView
          key={animal.key}
          animal={animal}
          clock={clock}
          atmosphere={atmosphere}
          register={register}
        />
      ))}
    </>
  );
}
