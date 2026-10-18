import { createRng } from "@/shared/lib/seeded-random";
import type { Species } from "../engine/strays";
import type { Basket } from "./basket";
import { dishesIn, type Larder } from "./cooking";
import { DISHES, FOODS, isDish, isFood, RECIPE_IDS, type DishId, type Food, type RecipeId } from "./recipes";

/*
 * Befriending a stray, as rules: how warm it is to Elliott, 0 (a stranger)
 * to 1 (won over), and what warms it. The two species differ as cats and
 * dogs do.
 *
 * A cat is won by patience. Elliott being near and calm (walking, never
 * running) warms it slowly, so it lets them come closer; within a visit the
 * warming slows once it has come a good way, so a shy cat takes a few
 * visits or a long, quiet one. Once it is near and warm enough it allows a
 * pet, which warms it more, and a treat from the basket warms it too: a
 * dish cooked at the fire warms it more than anything raw from the forest,
 * a dish it likes more again, and its favourite dish wins it at once. Each
 * animal has a favourite dish and a few it likes, from its seed. The fly
 * agaric is the witch's and never given.
 *
 * A dog comes readily if it is friendly: it starts a little warm, and a pet
 * or any treat wins most dogs at once. A shy dog needs patience first, as a
 * cat does, before it allows a pet, and is won by its favourite dish as a
 * cat is. Once it is warm enough for a pet it will play fetch, and every
 * stick it brings back warms it a good deal, a playful dog more: a game of
 * fetch wins most dogs.
 *
 * A fox is won as a cat is, but slower: it takes a few visits before it lets
 * Elliott near enough for a pet, a pet warms it only a little, and treats
 * help most (its favourite dish most of all, though even that doesn't win
 * it at once). A hedgehog is won quickly once it has uncurled: it allows a
 * pet soon, and its favourite wins it.
 *
 * Warmth is only ever gained: nothing Elliott does cools an animal.
 */

/** What befriending knows of an animal's nature, from its personality. */
export interface Temper {
  species: Species;
  /** Shy (−1) to bold (1). */
  boldness: number;
  /** Aloof or independent (−1) to cuddly (1). */
  affection: number;
}

export interface Bond {
  /** How warm it is to Elliott, 0 to 1; won at 1. */
  warmth: number;
  /** How much of that warmth patience has brought this visit. */
  visit: number;
}

/** What can be given as a treat: a dish from the basket, or anything foraged but the fly agaric. */
export type Treat = DishId | Food;
/** Every treat, in the order they are held out: the dishes first, then what is raw. */
export const TREATS: readonly Treat[] = [...DISHES, ...FOODS];
export const isTreat = (thing: string): thing is Treat => isDish(thing) || isFood(thing);

/** An animal's tastes: the dish it loves above all, and a few more it likes. */
export interface Tastes {
  favourite: RecipeId;
  likes: RecipeId[];
}

/** How near Elliott must be, in metres, for their being there to count as a visit, and how far they go for it to end. */
export const VISIT = { near: 12, gone: 30 } as const;

/** A dog bolder than this is friendly. */
const FRIENDLY = -0.25;
/** Patience's warmth a second, at its slowest (a shy cat) and quickest; past `slowAfter` in a visit it comes at a quarter of that. */
const PATIENCE = { cat: { shy: 0.008, bold: 0.02 }, dog: { shy: 0.016, bold: 0.03 }, fox: { shy: 0.0045, bold: 0.011 }, hedgehog: { shy: 0.01, bold: 0.024 }, slowAfter: 0.4 } as const;

/** The wild ones' own numbers: the warmth a pet needs and gives, how far off a stranger keeps (in metres), and what its favourite dish gives. */
const WILD = {
  fox: { petNeeds: 0.5, petGives: 0.1, keeps: 5.5, loved: 0.45 },
  hedgehog: { petNeeds: 0.3, petGives: 0.22, keeps: 2, loved: 1 },
} as const;
const wild = (temper: Temper) => (temper.species === "fox" || temper.species === "hedgehog" ? WILD[temper.species] : null);

const shyness = (temper: Temper) => Math.max(0, -temper.boldness);
const friendlyDog = (temper: Temper) => temper.species === "dog" && temper.boldness > FRIENDLY;

/** A stray's bond the first time Elliott meets it: a friendly dog is a little warm already. */
export function firstBond(temper: Temper): Bond {
  return { warmth: friendlyDog(temper) ? 0.15 + 0.15 * temper.boldness : 0, visit: 0 };
}

export const isWon = (bond: Bond) => bond.warmth >= 1;

/** How many dishes an animal likes, besides its favourite. */
const LIKES = 3;

/** An animal's tastes, from its seed. */
export function tastesOf(seed: string): Tastes {
  const rng = createRng(`${seed}:tastes`);
  const left = [...RECIPE_IDS];
  const draw = () => left.splice(Math.floor(rng.next() * left.length), 1)[0];
  const favourite = draw();
  return { favourite, likes: Array.from({ length: LIKES }, draw) };
}

/** How warm an animal must be to allow a pet: a friendly dog at once, a bold cat soon, a shy one late. */
export function petWarmth(temper: Temper): number {
  if (friendlyDog(temper)) return 0;
  const base = wild(temper)?.petNeeds ?? (temper.species === "cat" ? 0.35 : 0.3);
  return Math.min(0.75, base + 0.3 * shyness(temper) - 0.08 * temper.affection);
}

export const allowsPet = (bond: Bond, temper: Temper) => bond.warmth >= petWarmth(temper);

/** How far off a stray keeps from Elliott, in metres: a shy or aloof one well back, closing as it warms. A friendly dog keeps none. */
export function keepsOff(temper: Temper, bond: Bond): number {
  if (isWon(bond) || friendlyDog(temper)) return 0;
  const base = (wild(temper)?.keeps ?? (temper.species === "cat" ? 3.5 : 2.5)) + 6 * shyness(temper) + 1.5 * Math.max(0, -temper.affection);
  // Warm enough for a pet, it lets Elliott come right up to it.
  const warmed = Math.min(1, bond.warmth / Math.max(0.05, petWarmth(temper)));
  return base * (1 - warmed) + 0.6 * warmed;
}

/** Whether a stray comes over to see Elliott of its own accord: a bold one, a friendly dog, or any once it is warm enough for a pet. */
export function comesToSee(temper: Temper, bond: Bond): boolean {
  return friendlyDog(temper) || temper.boldness > 0.3 || allowsPet(bond, temper);
}

/** Elliott near, or not, for some seconds: calm and near warms a stray; going away ends the visit. */
export function bePatient(bond: Bond, temper: Temper, distance: number, calm: boolean, seconds: number): Bond {
  if (isWon(bond)) return bond;
  if (distance > VISIT.gone) return bond.visit === 0 ? bond : { ...bond, visit: 0 };
  if (distance > VISIT.near || !calm || seconds <= 0) return bond;
  const rates = PATIENCE[temper.species];
  const bold = (temper.boldness + 1) / 2;
  const rate = (rates.shy + (rates.bold - rates.shy) * bold) * (bond.visit > PATIENCE.slowAfter ? 0.25 : 1);
  // Patience alone never wins an animal: it brings it to where a pet or a treat can.
  const ceiling = Math.max(bond.warmth, Math.min(0.95, petWarmth(temper) + 0.25));
  const warmth = Math.min(ceiling, bond.warmth + rate * seconds);
  return { warmth, visit: bond.visit + (warmth - bond.warmth) };
}

/** A pet, which must be allowed: how much warmer it leaves the animal. */
export function pet(bond: Bond, temper: Temper): Bond {
  if (!allowsPet(bond, temper)) throw new Error(`A ${temper.species} at warmth ${bond.warmth.toFixed(2)} doesn't allow a pet yet`);
  const own = wild(temper);
  const gain = friendlyDog(temper) ? 0.85 + 0.3 * temper.affection : own ? own.petGives + 0.1 * temper.affection : temper.species === "dog" ? 0.45 : 0.16 + 0.1 * temper.affection;
  return { ...bond, warmth: Math.min(1, bond.warmth + gain) };
}

/** How much warmer a stray dog is for each stick it brings back: a calm dog's share, and a playful one's more on top. */
const FETCH_WARMTH = { calm: 0.4, playful: 0.32 } as const;

/** Whether an animal will play fetch now: a dog warm enough for a pet. */
export const playsFetch = (bond: Bond, temper: Temper) => temper.species === "dog" && allowsPet(bond, temper);

/** A stick brought back in a game of fetch, which the dog must be playing: how much warmer it leaves the dog. `playfulness` is calm (−1) to playful (1). */
export function fetched(bond: Bond, temper: Temper, playfulness: number): Bond {
  if (!playsFetch(bond, temper)) throw new Error(`A ${temper.species} at warmth ${bond.warmth.toFixed(2)} doesn't play fetch`);
  const gain = FETCH_WARMTH.calm + FETCH_WARMTH.playful * ((playfulness + 1) / 2);
  return { ...bond, warmth: Math.min(1, bond.warmth + gain) };
}

/** How a treat is taken: loved (its favourite dish, or any treat to a friendly dog) or liked. */
export type Relish = "loved" | "liked";

/** How much warmer a treat leaves an animal that doesn't love it: something raw, any dish, or a dish it likes. */
const TREAT_WARMTH = {
  cat: { raw: 0.22, dish: 0.4, liked: 0.65 },
  dog: { raw: 0.5, dish: 0.7, liked: 0.85 },
  fox: { raw: 0.12, dish: 0.2, liked: 0.3 },
  hedgehog: { raw: 0.3, dish: 0.45, liked: 0.6 },
} as const;

/** A treat given: its favourite dish wins an animal at once, as any treat wins a friendly dog; anything else warms it, a dish more than something raw. */
export function giveTreat(bond: Bond, temper: Temper, treat: string, tastes: Tastes): { bond: Bond; relish: Relish } {
  if (!isTreat(treat)) throw new Error(`${treat} is never given as a treat`);
  const loved = treat === tastes.favourite || friendlyDog(temper);
  const warmth = TREAT_WARMTH[temper.species];
  const gain = loved ? (wild(temper)?.loved ?? 1) : !isDish(treat) ? warmth.raw : (tastes.likes as readonly string[]).includes(treat) ? warmth.liked : warmth.dish;
  return { bond: { ...bond, warmth: Math.min(1, bond.warmth + gain) }, relish: loved ? "loved" : "liked" };
}

/** The treats in the basket, in the order they are held out: its dishes, then what is raw. */
export function treatsIn(basket: Basket, larder: Larder): Treat[] {
  return [...dishesIn(larder), ...FOODS.filter((kind) => basket[kind] > 0)];
}

/** The treat held out next: the one after the last given, round the basket, or null when there are none. */
export function treatInHand(basket: Basket, larder: Larder, last: Treat | null): Treat | null {
  const treats = treatsIn(basket, larder);
  if (treats.length === 0) return null;
  if (last === null) return treats[0];
  const after = TREATS.indexOf(last);
  return treats.find((kind) => TREATS.indexOf(kind) > after) ?? treats[0];
}
