"use client";

import { useMemo, type ReactNode } from "react";
import { themeColor } from "@/shared/lib/three/theme-color";
import type { AtmosphereUniforms } from "../../art/atmosphere";
import { generateCat } from "../../cats/cat";
import { coatName } from "../../cats/genetics";
import type { Activity as CatActivity } from "../../cats/motion";
import { generateDog, kindOf } from "../../dogs/dog";
import { coatName as dogCoatName } from "../../dogs/genetics";
import type { DogActivity } from "../../dogs/motion";
import { foxCoatName, generateFox, type FoxPhase } from "../../foxes/fox";
import { FOX_ACTIVITIES, type FoxActivity } from "../../foxes/motion";
import { CatBody } from "../cats/cat-body";
import { DogBody } from "../dogs/dog-body";
import { FoxBody } from "../foxes/fox-body";
import { generateHedgehog, hedgehogCoatName } from "../../hedgehogs/hedgehog";
import { HEDGEHOG_ACTIVITIES, type HedgehogActivity } from "../../hedgehogs/motion";
import { HedgehogBody } from "../hedgehogs/hedgehog-body";
import { generateSquirrel, squirrelCoatName } from "../../squirrels/squirrel";
import { SQUIRREL_ACTIVITIES, type SquirrelActivity } from "../../squirrels/motion";
import { SquirrelBody } from "../squirrels/squirrel-body";
import { generateHare, hareCoatName } from "../../hares/hare";
import { HARE_ACTIVITIES, type HareActivity } from "../../hares/motion";
import { HareBody } from "../hares/hare-body";
import { deerName, generateDeer } from "../../deer/deer";
import { DEER_ACTIVITIES, type DeerActivity } from "../../deer/motion";
import { DeerBody } from "../deer/deer-body";

/*
 * Every species the `?cats` preview shows, each as one entry: how to make an
 * animal of it from a seed, the activities it has, how it is drawn, and what
 * the preview says of it. An animal is placed in the preview as a `Shown`,
 * closures over the animal itself, so the preview never needs to know which
 * species it holds.
 */

/** How the preview asks for one animal to be drawn. */
export interface BodyAsk {
  activity: string;
  atmosphere: AtmosphereUniforms;
  greeting: boolean;
  clock: () => number;
  speed?: number;
  position?: [number, number, number];
  rotation?: number;
}

/** One animal as the preview shows it. */
export interface Shown {
  species: string;
  /** Its coat or kind in a few words. */
  name: string;
  /** A line about it for the control surface's list. */
  describe: string;
  activities: readonly string[];
  /** What it does when shown in the field. */
  idle: string;
  /** Its size in the world, for the camera. */
  size: number;
  /** Where its face is, in its own size: height and how far forward. */
  face: readonly [number, number];
  /** Its pace at each moving activity, in metres a second. */
  speed: (activity: string) => number;
  moving: (activity: string) => boolean;
  /** Its pace going round in the field, in metres a second. */
  fieldSpeed: number;
  greets: boolean;
  body: (ask: BodyAsk) => ReactNode;
  details: () => ReactNode;
}

/** A plain trunk for a climbing squirrel to cling to, its near face at z = 0. */
function PreviewTrunk({ radius }: { radius: number }) {
  const bark = useMemo(() => themeColor("--color-hearthwood-valley-pine-bark"), []);
  return (
    <mesh position={[0, 0.7, radius]}>
      <cylinderGeometry args={[radius * 0.85, radius, 1.4, 14]} />
      <meshStandardMaterial color={bark} roughness={0.95} />
    </mesh>
  );
}

function Trait({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-1" title={label}>
      <span className="sr-only">{label}</span>
      <div className="relative h-1.5 w-12 rounded-sm bg-surface-elevated">
        <div className="absolute top-0 h-1.5 w-1.5 rounded-sm bg-brand-orange" style={{ left: `${((value + 1) / 2) * 100}%`, transform: "translateX(-50%)" }} />
      </div>
    </div>
  );
}

function Details({ name, sex, kind, traits }: { name: string; sex: "male" | "female" | null; kind?: string; traits: readonly (readonly [string, number])[] }) {
  return (
    <>
      <span className="text-sm">
        {name} {sex === null ? "" : sex === "female" ? "♀" : "♂"}
      </span>
      {kind && <span className="text-xs text-text-secondary">{kind}</span>}
      <div className="flex gap-2">
        {traits.map(([label, value]) => (
          <Trait key={label} label={label} value={value} />
        ))}
      </div>
    </>
  );
}

const CAT_ACTIVITIES: readonly CatActivity[] = ["stand", "walk", "run", "sit", "loaf"];
const DOG_ACTIVITIES: readonly DogActivity[] = ["stand", "walk", "trot", "run", "sit", "lie"];

export function shownCat(seed: string): Shown {
  const cat = generateCat(seed);
  const { energy, boldness, affection } = cat.personality;
  const idle: CatActivity = energy > 0.35 ? "walk" : energy < -0.4 ? "loaf" : boldness < -0.2 ? "sit" : "stand";
  return {
    species: "cat",
    name: coatName(cat.coat),
    describe: `cat: ${coatName(cat.coat)} (${cat.sex}, ${idle})`,
    activities: CAT_ACTIVITIES,
    idle,
    size: cat.build.size,
    face: [0.33, 0.22],
    speed: (a) => (a === "run" ? 3 : 0.45),
    moving: (a) => a === "walk" || a === "run",
    fieldSpeed: 0.28 + (energy + 1) * 0.12,
    greets: affection > 0.4 && idle !== "loaf",
    body: (ask) => <CatBody cat={cat} {...ask} activity={ask.activity as CatActivity} />,
    details: () => <Details name={coatName(cat.coat)} sex={cat.sex} traits={[["Shy to bold", boldness], ["Lazy to busy", energy], ["Aloof to cuddly", affection]]} />,
  };
}

export function shownDog(seed: string): Shown {
  const dog = generateDog(seed);
  const { playfulness, boldness, affection } = dog.personality;
  const idle: DogActivity = playfulness > 0.8 ? "trot" : playfulness > 0.4 ? "walk" : playfulness < -0.45 ? "lie" : boldness < -0.25 ? "sit" : "stand";
  const pace = 0.6 + dog.build.size * 0.25;
  return {
    species: "dog",
    name: dogCoatName(dog.coat),
    describe: `dog: ${dogCoatName(dog.coat)}, ${kindOf(dog)}, ${dog.ears} ears, ${dog.tail} tail, ${dog.coat.length} coat, size ${dog.build.size.toFixed(2)} (${dog.sex}, ${idle})`,
    activities: DOG_ACTIVITIES,
    idle,
    size: dog.build.size,
    face: [0.36, 0.25],
    speed: (a) => (({ walk: 0.75, trot: 1.5, run: 3 })[a] ?? 0.75) * pace,
    moving: (a) => a === "walk" || a === "trot" || a === "run",
    fieldSpeed: (idle === "trot" ? 1.5 : 0.75) * pace,
    greets: affection > 0.35 && idle !== "lie",
    body: (ask) => <DogBody dog={dog} {...ask} activity={ask.activity as DogActivity} />,
    details: () => <Details name={dogCoatName(dog.coat)} sex={dog.sex} kind={kindOf(dog)} traits={[["Shy to bold", boldness], ["Calm to playful", playfulness], ["Independent to cuddly", affection]]} />,
  };
}

/** A fox, in its own colour phase or in the one asked for. */
export function shownFox(seed: string, phase?: FoxPhase): Shown {
  const born = generateFox(seed);
  const fox = phase ? { ...born, coat: { ...born.coat, phase } } : born;
  const { playfulness, boldness, affection } = fox.personality;
  const idle: FoxActivity = playfulness > 0.5 ? "trot" : playfulness < -0.5 ? "lie" : boldness < -0.5 ? "sit" : "stand";
  return {
    species: "fox",
    name: foxCoatName(fox.coat),
    describe: `fox: ${foxCoatName(fox.coat)}, size ${fox.build.size.toFixed(2)} (${fox.sex}, ${idle})`,
    activities: FOX_ACTIVITIES,
    idle,
    size: fox.build.size,
    face: [0.35, 0.26],
    speed: (a) => ({ walk: 0.8, trot: 1.9, run: 4 })[a] ?? 0.8,
    moving: (a) => a === "walk" || a === "trot" || a === "run",
    fieldSpeed: idle === "trot" ? 1.6 : 0.7,
    greets: false,
    body: (ask) => <FoxBody fox={fox} {...ask} activity={ask.activity as FoxActivity} />,
    details: () => <Details name={foxCoatName(fox.coat)} sex={fox.sex} traits={[["Shy to bold", boldness], ["Calm to playful", playfulness], ["Independent to cuddly", affection]]} />,
  };
}

export function shownHedgehog(seed: string): Shown {
  const hedgehog = generateHedgehog(seed);
  const { energy, boldness, affection } = hedgehog.personality;
  const name = hedgehogCoatName(hedgehog.coat);
  return {
    species: "hedgehog",
    name,
    describe: `hedgehog: ${name}, size ${hedgehog.build.size.toFixed(2)}`,
    activities: HEDGEHOG_ACTIVITIES,
    idle: "stand",
    size: hedgehog.build.size * 0.45,
    face: [0.13, 0.25],
    speed: (a) => (a === "run" ? 0.6 : 0.25),
    moving: (a) => a === "walk" || a === "run",
    fieldSpeed: 0.25,
    greets: false,
    body: (ask) => <HedgehogBody hedgehog={hedgehog} {...ask} activity={ask.activity as HedgehogActivity} />,
    details: () => <Details name={name} sex={null} traits={[["Shy to bold", boldness], ["Sleepy to busy", energy], ["Aloof to cuddly", affection]]} />,
  };
}

/** A squirrel, in its summer coat or held in its winter one. */
export function shownSquirrel(seed: string, winter = 0): Shown {
  const squirrel = generateSquirrel(seed);
  const { energy, boldness, affection } = squirrel.personality;
  const name = `${squirrelCoatName(squirrel.coat)}${winter > 0.5 ? ", winter coat" : ""}`;
  return {
    species: "squirrel",
    name,
    describe: `squirrel: ${name}`,
    activities: SQUIRREL_ACTIVITIES,
    idle: "sit",
    size: squirrel.build.size * 0.5,
    face: [0.17, 0.18],
    speed: (a) => (a === "run" ? 1.6 : 0.7),
    moving: (a) => a === "walk" || a === "run" || a === "climb",
    fieldSpeed: 0.6,
    greets: false,
    body: (ask) =>
      ask.activity === "climb" || ask.activity === "cling" ? (
        // Turned so the trunk stands behind it, as the camera looks.
        <group position={ask.position} rotation={[0, (ask.rotation ?? 0) + Math.PI, 0]}>
          <PreviewTrunk radius={0.09} />
          {/* Stood on the bark: its front turned up the trunk, its belly to it. */}
          <group position={[0, 0.14, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <SquirrelBody squirrel={squirrel} coatSeason={{ winter, white: 0 }} activity={ask.activity} greeting={ask.greeting} clock={ask.clock} speed={ask.speed} atmosphere={ask.atmosphere} />
          </group>
        </group>
      ) : (
        <SquirrelBody squirrel={squirrel} coatSeason={{ winter, white: 0 }} {...ask} activity={ask.activity as SquirrelActivity} />
      ),
    details: () => <Details name={name} sex={null} traits={[["Shy to bold", boldness], ["Calm to busy", energy], ["Aloof to friendly", affection]]} />,
  };
}

/** A mountain hare, in its summer coat or white for winter. */
export function shownHare(seed: string, white = 0): Shown {
  const hare = generateHare(seed);
  const { energy, boldness, affection } = hare.personality;
  const name = hareCoatName(white);
  return {
    species: "hare",
    name,
    describe: `hare: ${name}`,
    activities: HARE_ACTIVITIES,
    idle: "stand",
    size: hare.build.size * 0.9,
    face: [0.17, 0.19],
    speed: (a) => (a === "run" ? 4 : 0.6),
    moving: (a) => a === "walk" || a === "run",
    fieldSpeed: 0.6,
    greets: false,
    body: (ask) => <HareBody hare={hare} coatSeason={{ winter: 0, white }} {...ask} activity={ask.activity as HareActivity} />,
    details: () => <Details name={name} sex={null} traits={[["Shy to bold", boldness], ["Calm to busy", energy], ["Aloof to friendly", affection]]} />,
  };
}

/** A roe deer, a buck or a doe as asked, in its summer coat or its winter one. */
export function shownDeer(seed: string, sex: "male" | "female", winter = 0): Shown {
  const born = generateDeer(seed);
  const deer = { ...born, sex, build: { ...born.build, antlers: sex === "male" ? Math.max(0.85, born.build.antlers) : 0 } };
  const { energy, boldness, affection } = deer.personality;
  const name = `${deerName(deer)}${winter > 0.5 ? ", winter coat" : ""}`;
  return {
    species: "deer",
    name,
    describe: `deer: ${name}, size ${deer.build.size.toFixed(2)}`,
    activities: DEER_ACTIVITIES,
    idle: "stand",
    size: deer.build.size,
    face: [0.45, 0.25],
    speed: (a) => ({ walk: 1, trot: 2.6, run: 7 })[a] ?? 1,
    moving: (a) => a === "walk" || a === "trot" || a === "run",
    fieldSpeed: 1,
    greets: false,
    body: (ask) => <DeerBody deer={deer} coatSeason={{ winter, white: 0 }} {...ask} activity={ask.activity as DeerActivity} />,
    details: () => <Details name={name} sex={deer.sex} traits={[["Shy to bold", boldness], ["Calm to busy", energy], ["Aloof to friendly", affection]]} />,
  };
}

/** One of every species, side by side, for the line-up of them all: its seed's name and how to make it. */
export const EVERY_SPECIES: readonly ((seed: string) => Shown)[] = [shownCat, shownDog, (seed) => shownFox(seed), (seed) => shownFox(seed, "cross"), (seed) => shownFox(seed, "silver"), shownHedgehog, (seed) => shownHedgehog(`${seed}-dark`), (seed) => shownSquirrel(seed), (seed) => shownSquirrel(seed, 1), (seed) => shownHare(seed), (seed) => shownHare(seed, 1), (seed) => shownDeer(seed, "male"), (seed) => shownDeer(`${seed}-doe`, "female", 1)];
