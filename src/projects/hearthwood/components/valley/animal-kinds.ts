import { generateCat, type Cat } from "../../cats/cat";
import type { Activity as CatActivity } from "../../cats/motion";
import { generateDog, type Dog } from "../../dogs/dog";
import type { DogActivity } from "../../dogs/motion";
import { generateFox, type Fox } from "../../foxes/fox";
import type { FoxActivity } from "../../foxes/motion";
import { generateHedgehog, type Hedgehog } from "../../hedgehogs/hedgehog";
import type { HedgehogActivity } from "../../hedgehogs/motion";
import { generateSquirrel, type Squirrel } from "../../squirrels/squirrel";
import type { SquirrelActivity } from "../../squirrels/motion";
import { generateHare, type Hare } from "../../hares/hare";
import type { HareActivity } from "../../hares/motion";
import { generateDeer, type Deer } from "../../deer/deer";
import type { DeerActivity } from "../../deer/motion";
import type { Doing, Kind } from "../../gameplay/behaviour";
import { catPortrait, deerPortrait, dogPortrait, foxPortrait, harePortrait, hedgehogPortrait, squirrelPortrait, type Portrait } from "../../art/portrait";
import type { AnimalDrive } from "../animals/animal-body";

/*
 * Each kind of animal the walk holds, as the scene needs it: the generated
 * animal its body is drawn from, its nature as behaviour reads it, what its
 * body shows for each thing behaviour says it is doing, and its portrait.
 * Adding a kind of animal to the walk is adding it here.
 */

type Drive<A extends string> = { current: AnimalDrive<A> };

/** The generated animal an animal's body is drawn from, and where its drawing is driven from each frame. */
export type AnimalLook =
  | { species: "cat"; cat: Cat; drive: Drive<CatActivity> }
  | { species: "dog"; dog: Dog; drive: Drive<DogActivity> }
  | { species: "fox"; fox: Fox; drive: Drive<FoxActivity> }
  | { species: "hedgehog"; hedgehog: Hedgehog; drive: Drive<HedgehogActivity> }
  | { species: "squirrel"; squirrel: Squirrel; drive: Drive<SquirrelActivity> }
  | { species: "hare"; hare: Hare; drive: Drive<HareActivity> }
  | { species: "deer"; deer: Deer; drive: Drive<DeerActivity> };

/** What each kind's body shows for what behaviour says it is doing. A cat trots as a quick walk and lies as a loaf; a hedgehog lying is curled up. */
export const ACTIVITY: { [S in Kind]: Record<Doing, Extract<AnimalLook, { species: S }>["drive"]["current"]["activity"]> } = {
  cat: { stand: "stand", walk: "walk", trot: "walk", run: "run", sit: "sit", lie: "loaf" },
  dog: { stand: "stand", walk: "walk", trot: "trot", run: "run", sit: "sit", lie: "lie" },
  fox: { stand: "stand", walk: "walk", trot: "trot", run: "run", sit: "sit", lie: "lie" },
  hedgehog: { stand: "stand", walk: "walk", trot: "walk", run: "run", sit: "sit", lie: "lie" },
  squirrel: { stand: "stand", walk: "walk", trot: "run", run: "run", sit: "sit", lie: "lie" },
  hare: { stand: "stand", walk: "walk", trot: "run", run: "run", sit: "sit", lie: "lie" },
  // A deer sitting is grazing, its head down to the grass.
  deer: { stand: "stand", walk: "walk", trot: "trot", run: "run", sit: "graze", lie: "lie" },
};

/** An animal of a kind from its seed: its look, its size in the world before it is drawn larger, and its three traits. */
export interface Born {
  look: AnimalLook;
  size: number;
  boldness: number;
  energy: number;
  affection: number;
}

const drive = <A extends string>(activity: A): Drive<A> => ({ current: { activity, speed: 0, travelled: 0, greeting: false } });

export function bornOf(species: Kind, seed: string, rest: Doing): Born {
  switch (species) {
    case "cat": {
      const cat = generateCat(seed);
      return { look: { species, cat, drive: drive(ACTIVITY.cat[rest]) }, size: cat.build.size, ...cat.personality };
    }
    case "dog": {
      const dog = generateDog(seed);
      const { boldness, playfulness, affection } = dog.personality;
      return { look: { species, dog, drive: drive(ACTIVITY.dog[rest]) }, size: dog.build.size, boldness, energy: playfulness, affection };
    }
    case "fox": {
      const fox = generateFox(seed);
      const { boldness, playfulness, affection } = fox.personality;
      return { look: { species, fox, drive: drive(ACTIVITY.fox[rest]) }, size: fox.build.size, boldness, energy: playfulness, affection };
    }
    case "hedgehog": {
      const hedgehog = generateHedgehog(seed);
      return { look: { species, hedgehog, drive: drive(ACTIVITY.hedgehog[rest]) }, size: hedgehog.build.size, ...hedgehog.personality };
    }
    case "squirrel": {
      const squirrel = generateSquirrel(seed);
      return { look: { species, squirrel, drive: drive(ACTIVITY.squirrel[rest]) }, size: squirrel.build.size, ...squirrel.personality };
    }
    case "hare": {
      const hare = generateHare(seed);
      return { look: { species, hare, drive: drive(ACTIVITY.hare[rest]) }, size: hare.build.size, ...hare.personality };
    }
    case "deer": {
      const deer = generateDeer(seed);
      return { look: { species, deer, drive: drive(ACTIVITY.deer[rest]) }, size: deer.build.size, ...deer.personality };
    }
  }
}

export function portraitOfLook(look: AnimalLook): Portrait {
  switch (look.species) {
    case "cat":
      return catPortrait(look.cat);
    case "dog":
      return dogPortrait(look.dog);
    case "fox":
      return foxPortrait(look.fox);
    case "hedgehog":
      return hedgehogPortrait(look.hedgehog);
    case "squirrel":
      return squirrelPortrait();
    case "hare":
      return harePortrait();
    case "deer":
      return deerPortrait(look.deer);
  }
}
