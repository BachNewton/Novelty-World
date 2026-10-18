"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { BoxGeometry, type BufferGeometry, type Camera, Matrix4, type Material, MeshLambertMaterial, Quaternion, Vector3 } from "three";
import { generateCat } from "../../cats/cat";
import { generateDog } from "../../dogs/dog";
import type { World } from "../../engine/world";
import { angleBetween, bestOffered, type Viewer } from "../../gameplay/offering";
import type { WalkState } from "../../input/use-walk-input";
import type { AtmosphereUniforms } from "../../art/atmosphere";
import { FolkFigure, type FolkHandle } from "../../art/folk-figure";
import { homeShape, keepsakeShape, SINKS } from "../../art/folk-homes";
import type { FolkPalette } from "../../art/folk";
import { paint } from "../../art/painted";
import { shadeLambert } from "../../art/shading";
import type { Keepsake } from "../../stories/story";
import { CatBody } from "../cats/cat-body";
import { DogBody } from "../dogs/dog-body";
import { cameraPose, ease, easeBack, place, takeOver, type CameraPose } from "./camera-ease";
import type { ValleyClock } from "./clock";
import { DRAWN_LARGER, type Companionship } from "./companionship";
import { AFTER_RENDER_PRIORITY } from "./feature-renderer";
import { EYE_HEIGHT } from "./first-person-camera";
import { catchUp, turnBetween } from "./follow-camera";
import type { Foraging } from "./foraging";
import type { Hearth } from "./hearth";
import { answerPeopleTaps, joinPeople, liveOf, offerablePerson, peopleAround, settlePeople, subscribePeople, weighPerson, type People, type PersonLive } from "./people";
import { headingTo, TALK_FOV, talkView } from "./talk-camera";
import type { Walker } from "./walker";

/*
 * The people round Elliott: streamed in by area as they walk and drawn with
 * what they keep by them (sheep, hives, a boat, a sauna, a cottage, a tent),
 * each idling at their spot, turning to Elliott as they come near and
 * waving hello, and an animal that went home sat beside its person. Each
 * frame it weighs the person on offer to talk with (after the fire, before
 * the animals and forage, which must beat them), answers a tap on a person,
 * and while a conversation is on holds Elliott facing them and eases the
 * camera to frame them, and back again after.
 */

/** People are brought to life within this of Elliott and let go beyond the second, and drawn within the third of the camera, in metres. */
const LIVE_REACH = 240;
const LIVE_GONE = 300;
const DRAW_REACH = 180;
/** Elliott moves this far before the people round them are looked at again. */
const RESTREAM = 8;
/** A person turns to Elliott within this, and waves as Elliott first comes within the second (again once they've gone past the third), in metres. */
const NOTICE = { turn: 6, wave: 9, rearm: 15 } as const;
/** How long a wave lasts, in seconds. */
const WAVE_SECONDS = 2.2;
/** A tap lands on a person within this many CSS pixels of their middle, within this many metres of Elliott. */
const TAP_SLOP = 80;
const TAP_REACH = 5;
/** How quickly the camera eases to the conversation and back, and Elliott and the person turn to each other, per second. */
const EASE = 2.4;
const TURN = 3.2;

/** After the hearth has weighed the fire, before the animals weigh themselves against the people. */
export const PEOPLE_PRIORITY = -2;

/** What the scene keeps of each person between frames. */
interface Idle {
  heading: number;
  look: number;
  /** The motion clock's time a wave began, or null. */
  waveFrom: number | null;
  /** Elliott has come near since they last waved. */
  greeted: boolean;
}

function HomeMeshes({ live, palette, material, world }: { live: PersonLive; palette: FolkPalette; material: Material; world: World }) {
  const geometries = useMemo(() => {
    return live.person.homes.map((home, i): BufferGeometry => {
      const g = homeShape(home.kind, `${live.person.seed}/${i}`, palette);
      g.rotateY(home.turn);
      g.translate(home.x, world.heightAt(home.x, home.z) - SINKS[home.kind], home.z);
      return g;
    });
  }, [live, palette, world]);
  useEffect(
    () => () => {
      for (const g of geometries) g.dispose();
    },
    [geometries],
  );
  return (
    <>
      {geometries.map((g, i) => (
        <mesh key={i} geometry={g} material={material} castShadow receiveShadow />
      ))}
    </>
  );
}

/** An animal gone home, sat by its person's side. */
function HomePet({ live, clock, atmosphere }: { live: PersonLive; clock: ValleyClock; atmosphere: AtmosphereUniforms }) {
  const pet = live.person.pet;
  const animal = useMemo(() => (pet ? (pet.species === "cat" ? { species: "cat" as const, cat: generateCat(pet.seed) } : { species: "dog" as const, dog: generateDog(pet.seed) }) : null), [pet]);
  const time = useCallback(() => clock.motion, [clock]);
  if (!pet || !animal) return null;
  const h = live.person.heading;
  // By their side, a little in front: their right, facing the way they face.
  const x = live.person.x - Math.cos(h) * 0.85 + Math.sin(h) * 0.5;
  const z = live.person.z + Math.sin(h) * 0.85 + Math.cos(h) * 0.5;
  return (
    <group position={[x, live.y, z]} rotation={[0, h, 0]} scale={DRAWN_LARGER}>
      {animal.species === "cat" ? <CatBody cat={animal.cat} activity="sit" clock={time} atmosphere={atmosphere} /> : <DogBody dog={animal.dog} activity="sit" clock={time} atmosphere={atmosphere} />}
    </group>
  );
}

/** Where the keepsakes are set out at camp: round from the fire, how far, and how long the stone they stand on is. */
const KEEPSAKE_STONE = { angle: 5.45, out: 3.0, length: 1.7 } as const;

/** The keepsakes Elliott has been given, set out on a flat stone by the fire. */
function CampKeepsakes({ keepsakes, world, palette, material }: { keepsakes: readonly Keepsake[]; world: World; palette: FolkPalette; material: Material }) {
  const { camp } = world;
  const along = KEEPSAKE_STONE.angle + Math.PI / 2;
  const x = camp.x + Math.cos(KEEPSAKE_STONE.angle) * KEEPSAKE_STONE.out;
  const z = camp.z + Math.sin(KEEPSAKE_STONE.angle) * KEEPSAKE_STONE.out;
  const y = world.heightAt(x, z);
  const stone = useMemo(() => {
    const slab = new BoxGeometry(KEEPSAKE_STONE.length, 0.14, 0.5, 3, 1, 2);
    return paint([{ geometry: slab.translate(0, 0.02, 0), colour: palette.charcoal.clone().lerp(palette.oat, 0.5), shading: 0.4 }]);
  }, [palette]);
  const shapes = useMemo(() => keepsakes.map((k) => keepsakeShape(k, palette)), [keepsakes, palette]);
  useEffect(
    () => () => {
      stone.dispose();
      for (const s of shapes) s.dispose();
    },
    [stone, shapes],
  );
  if (keepsakes.length === 0) return null;
  // The stone's length runs round the fire; the keepsakes stand along it, a little larger than life, as the dishes are.
  return (
    <group position={[x, y, z]} rotation={[0, -along, 0]}>
      <mesh geometry={stone} material={material} castShadow receiveShadow />
      {shapes.map((shape, i) => (
        <mesh key={keepsakes[i]} geometry={shape} material={material} position={[(i - (shapes.length - 1) / 2) * (KEEPSAKE_STONE.length / 6), 0.09, 0]} scale={1.5} castShadow receiveShadow />
      ))}
    </group>
  );
}

const scratch = { matrix: new Matrix4(), quaternion: new Quaternion(), eye: new Vector3(), look: new Vector3(), up: new Vector3(0, 1, 0), direction: new Vector3() };

export function WorldPeople({
  people,
  world,
  clock,
  walker,
  input,
  foraging,
  companionship,
  hearth,
  palette,
  atmosphere,
  outbid = () => false,
}: {
  people: People;
  world: World;
  clock: ValleyClock;
  walker: Walker;
  input: RefObject<WalkState>;
  foraging: Foraging;
  companionship: Companionship;
  hearth: Hearth;
  palette: FolkPalette;
  atmosphere: AtmosphereUniforms;
  /** Whether something weighed after the people (a clue) beat them this frame. */
  outbid?: () => boolean;
}) {
  const subscribe = useCallback((listener: () => void) => subscribePeople(people, listener), [people]);
  const shown = useSyncExternalStore(subscribe, () => people.shown);
  const camera = useThree((s) => s.camera);
  const canvas = useThree((s) => s.gl.domElement);
  const material = useMemo(() => shadeLambert(new MeshLambertMaterial({ vertexColors: true }), "solid", atmosphere), [atmosphere]);
  useEffect(() => () => material.dispose(), [material]);
  const [drawn, setDrawn] = useState<PersonLive[]>([]);
  const figures = useRef(new Map<string, FolkHandle>());
  const idles = useRef(new Map<string, Idle>());
  const streamedAt = useRef<{ x: number; z: number } | null>(null);
  const pose = useRef<CameraPose>(cameraPose(TALK_FOV.first));
  const talkingWith = useRef<string | null>(null);

  useEffect(() => joinPeople(people, companionship), [people, companionship]);

  useEffect(() => {
    const tapAt = (x: number, y: number) => {
      const rect = canvas.getBoundingClientRect();
      let best: { id: string; d: number } | null = null;
      for (const live of people.live.values()) {
        if (Math.hypot(live.person.x - walker.x, live.person.z - walker.z) > TAP_REACH) continue;
        const { heart } = offerablePerson(live);
        const at = new Vector3(heart.x, heart.y, heart.z).project(camera);
        if (at.z > 1) continue;
        const sx = rect.left + ((at.x + 1) / 2) * rect.width;
        const sy = rect.top + ((1 - at.y) / 2) * rect.height;
        const d = Math.hypot(sx - x, sy - y);
        if (d < TAP_SLOP && (best === null || d < best.d)) best = { id: live.person.id, d };
      }
      return best?.id ?? null;
    };
    const handles = figures.current;
    answerPeopleTaps(people, tapAt, (id) => handles.get(id)?.group?.parent != null);
    return () => {
      answerPeopleTaps(people, null, null);
    };
  }, [people, walker, camera, canvas]);

  useFrame(({ camera: eye }, delta) => {
    const near = framePeople({ people, walker, clock, input: input.current, companionship, hearth, figures: figures.current, idles: idles.current, streamedAt, pose: pose.current, talkingWith }, eye, delta);
    if (near.length !== drawn.length || near.some((l, i) => l !== drawn[i])) setDrawn(near);
  }, PEOPLE_PRIORITY);

  // After the frame: an animal or forage offered beats a person, as each had to beat them.
  useFrame(() => {
    settlePeople(people, foraging.target !== null || companionship.candidate !== null || outbid());
  }, AFTER_RENDER_PRIORITY);

  const homes = new Set(shown.memory.home);
  return (
    <>
      <CampKeepsakes keepsakes={shown.memory.keepsakes} world={world} palette={palette} material={material} />
      {drawn.map((live) => (
        <group key={live.person.id}>
          <FolkFigure
            ref={(handle) => {
              if (handle) figures.current.set(live.person.id, handle);
              else figures.current.delete(live.person.id);
            }}
            look={live.look}
            seat={live.person.seat}
            palette={palette}
            material={material}
          />
          <HomeMeshes live={live} palette={palette} material={material} world={world} />
          {live.person.pet && homes.has(live.person.pet.id) && <HomePet live={live} clock={clock} atmosphere={atmosphere} />}
        </group>
      ))}
    </>
  );
}

const shownTalkingId = (people: People) => people.shown.talking?.id ?? null;

interface PeopleFrame {
  people: People;
  walker: Walker;
  clock: ValleyClock;
  input: WalkState;
  companionship: Companionship;
  hearth: Hearth;
  figures: Map<string, FolkHandle>;
  idles: Map<string, Idle>;
  streamedAt: { current: { x: number; z: number } | null };
  pose: CameraPose;
  talkingWith: { current: string | null };
}

/** One frame of the people: who is live round Elliott, who is offered, each idling, and the conversation's framing. Returns who is near enough to draw. */
function framePeople({ people, walker, clock, input, companionship, hearth, figures, idles, streamedAt, pose, talkingWith }: PeopleFrame, eye: Camera, delta: number): PersonLive[] {
  const seconds = Math.min(delta, 0.1);
  const motion = clock.motion;

  // Who is round Elliott, and who of them is drawn.
  const from = streamedAt.current;
  if (from === null || Math.hypot(walker.x - from.x, walker.z - from.z) > RESTREAM) {
    streamedAt.current = { x: walker.x, z: walker.z };
    for (const person of peopleAround(people, walker.x, walker.z, LIVE_REACH)) liveOf(people, person);
    for (const [id, live] of people.live) if (Math.hypot(live.person.x - walker.x, live.person.z - walker.z) > LIVE_GONE && shownTalkingId(people) !== id) people.live.delete(id);
  }
  const near = [...people.live.values()].filter((l) => Math.hypot(l.person.x - eye.position.x, l.person.z - eye.position.z) < DRAW_REACH);

  // The person on offer to talk with, if they beat the fire.
  const talking = people.shown.talking;
  const viewer: Viewer | null =
    walker.view !== "walk" || talking || companionship.shown.naming || hearth.shown.session
      ? null
      : input.pointOfView === "first"
        ? { pointOfView: "first", eye: eye.position, look: eye.getWorldDirection(scratch.direction) }
        : { pointOfView: "third", x: walker.x, z: walker.z, heading: walker.heading };
  const candidates = [...people.live.values()].filter((l) => Math.abs(l.person.x - walker.x) < 6 && Math.abs(l.person.z - walker.z) < 6);
  const best = viewer ? bestOffered(candidates, viewer, offerablePerson, hearth.candidate ?? Infinity) : null;
  weighPerson(people, best && { id: best.offered.person.id, score: best.score });

  // Each person idling: turning to Elliott as they come near, looking at them, waving hello.
  for (const live of people.live.values()) {
    const { person } = live;
    let idle = idles.get(person.id);
    if (!idle) {
      idle = { heading: person.heading, look: 0, waveFrom: null, greeted: false };
      idles.set(person.id, idle);
    }
    const d = Math.hypot(walker.x - person.x, walker.z - person.z);
    const isTalking = talking?.id === person.id;
    const toElliott = headingTo(person, walker);
    const turnTo = person.seat === null && (isTalking || d < NOTICE.turn) ? toElliott : person.heading;
    idle.heading += turnBetween(idle.heading, turnTo) * catchUp(isTalking ? TURN : 1.4, seconds);
    const lookTo = d < 12 || isTalking ? Math.max(-1.1, Math.min(1.1, angleBetween(idle.heading, toElliott))) : 0;
    idle.look += (lookTo - idle.look) * catchUp(3, seconds);
    if (d < NOTICE.wave && !idle.greeted) {
      idle.greeted = true;
      idle.waveFrom = motion;
    }
    if (d > NOTICE.rearm) idle.greeted = false;
    const figure = figures.get(person.id);
    if (!figure?.group) continue;
    figure.group.position.set(person.x, live.y, person.z);
    figure.group.rotation.y = idle.heading;
    const wave = idle.waveFrom === null ? 0 : (motion - idle.waveFrom) / WAVE_SECONDS;
    figure.pose({ seconds: motion + (person.x % 17), look: idle.look, nod: isTalking ? 0.08 : 0, wave: wave > 1 ? 0 : wave, talking: isTalking });
  }

  frameTalk(people, walker, input.pointOfView, eye, pose, talkingWith, idles, motion, seconds);
  return near;
}

/** While Elliott talks with someone: held facing them, the camera eased to frame them; and back to walking after. */
function frameTalk(people: People, walker: Walker, pointOfView: "first" | "third", eye: Camera, pose: CameraPose, talkingWith: { current: string | null }, idles: Map<string, Idle>, motion: number, seconds: number): void {
  const talking = people.shown.talking;
  const live = talking ? people.live.get(talking.id) : undefined;
  if (talking && live && walker.view === "walk") {
    walker.view = "talk";
    takeOver(pose, eye, TALK_FOV[pointOfView]);
  }
  if (talking && live && talkingWith.current !== talking.id) {
    talkingWith.current = talking.id;
    const idle = idles.get(talking.id);
    if (idle) idle.waveFrom = motion;
  }
  if (!talking) talkingWith.current = null;
  if (!talking && walker.view === "talk") walker.view = "walk";

  const k = catchUp(EASE, seconds);
  if (walker.view === "talk" && live) {
    const { person } = live;
    const facing = headingTo(walker, person);
    const turn = catchUp(TURN, seconds);
    walker.heading += turnBetween(walker.heading, facing) * turn;
    walker.orbit = { ...walker.orbit, yaw: walker.orbit.yaw + turnBetween(walker.orbit.yaw, facing) * turn };
    const ground = walker.air?.y ?? live.y;
    const face = { x: person.x, y: live.y + live.face, z: person.z };
    const pitch = Math.atan2(face.y - (ground + EYE_HEIGHT), Math.max(0.5, Math.hypot(person.x - walker.x, person.z - walker.z)));
    walker.lookPitch += (pitch - walker.lookPitch) * turn;
    const view = talkView(pointOfView, { x: walker.x, y: ground, z: walker.z }, face, EYE_HEIGHT);
    scratch.eye.set(view.eye.x, view.eye.y, view.eye.z);
    scratch.look.set(view.look.x, view.look.y, view.look.z);
    scratch.matrix.lookAt(scratch.eye, scratch.look, scratch.up);
    scratch.quaternion.setFromRotationMatrix(scratch.matrix);
    ease(pose, scratch.eye, scratch.quaternion, TALK_FOV[pointOfView], k);
    place(eye, pose);
  } else if (pose.easing) {
    easeBack(pose, eye, TALK_FOV[pointOfView], k);
  }
}
