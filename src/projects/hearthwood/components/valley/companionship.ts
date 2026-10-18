import { generateCat, type Cat } from "../../cats/cat";
import type { Activity as CatActivity } from "../../cats/motion";
import { generateDog, type Dog } from "../../dogs/dog";
import type { DogActivity } from "../../dogs/motion";
import { straysInCell, straysNear, type Species, type Stray } from "../../engine/strays";
import { remembered, type World } from "../../engine/world";
import { motionSeed } from "../../animals/motion";
import { allowsPet, bePatient, firstBond, giveTreat, isWon, pet, tastesOf, treatInHand, type Bond, type Relish, type Tastes, type Temper, type Treat } from "../../gameplay/befriending";
import { bodyAt, doingFor, greeting, type Body, type Doing, type Nature } from "../../gameplay/behaviour";
import { comeAlong, firesideSpot, followers, followMind, join, rename, type Companion, type FollowMind } from "../../gameplay/companions";
import { loadFriends, saveFriends, type Friends } from "../../gameplay/friends";
import { suggestedNames } from "../../gameplay/names";
import type { Offerable } from "../../gameplay/offering";
import { isDish } from "../../gameplay/recipes";
import { strayMind, type StrayMind } from "../../gameplay/roaming";
import { catPortrait, dogPortrait, type Portrait } from "../../art/portrait";
import type { AnimalDrive } from "../animals/animal-body";
import { takeTreat, type Foraging } from "./foraging";
import { giveDish, type Hearth } from "./hearth";

/*
 * The cats and dogs of a walk, between the scene, the overlay over it and
 * the probe: the strays round Elliott (streamed in by area from the world's
 * seed, each with its body, its mind and how warm it is to Elliott), the
 * companions and what is kept of them, the animal on offer to pet or to
 * give a treat to, the naming card when one is won, and the little hearts
 * that rise as an animal warms. The scene steps the animals each frame; the
 * overlay reads what is shown as an external store.
 */

/** One animal of the walk, live: a stray or a companion. */
export interface Animal {
  /** Its stray's id, which a companion keeps. */
  key: string;
  species: Species;
  seed: string;
  /** The generated animal its body is drawn from, and where the drawing is driven from each frame. */
  look: { species: "cat"; cat: Cat; drive: { current: AnimalDrive<CatActivity> } } | { species: "dog"; dog: Dog; drive: { current: AnimalDrive<DogActivity> } };
  nature: Nature;
  temper: Temper;
  /** Its favourite dish and the few it likes. */
  tastes: Tastes;
  body: Body;
  /** As a stray: its home, how far it roams and its mind; null once a companion. */
  stray: { home: { x: number; z: number }; roam: number; mind: StrayMind } | null;
  /** As a companion: its mind as it follows. */
  follow: FollowMind | null;
  bond: Bond;
  /** Petted, it stops to be petted until then, facing Elliott. */
  pettedUntil: number;
  /** The ground under it, for drawing it there. */
  y: number;
  /** The motion clock's time its drawing last changed what it was doing, or its greeting: it has settled into its pose a while after. */
  changedAt: number;
}

/** What is offered for an animal: a pet, a treat, or both. */
export interface AnimalOffer {
  key: string;
  species: Species;
  /** The companion's name, or null for a stray. */
  name: string | null;
  canPet: boolean;
  /** The treat held out, a dish or something raw, or null when there is none to give. */
  treat: Treat | null;
  portrait: Portrait;
}

export interface CompanionRow {
  key: string;
  name: string;
  following: boolean;
  portrait: Portrait;
}

export interface Naming {
  key: string;
  species: Species;
  portrait: Portrait;
  suggestions: string[];
  /** Which suggestion is showing. */
  index: number;
}

/** A small mark rising over an animal: a heart as it warms, a burst of them when it is won or given what it loves, a paw as a companion answers a pet. */
export interface Mark {
  id: number;
  key: string;
  kind: "heart" | "hearts" | "paw";
  /** The motion clock's time it was made. */
  born: number;
}

export interface CompanionShown {
  offer: AnimalOffer | null;
  companions: CompanionRow[];
  naming: Naming | null;
  /** Whether the companions row is held open, and how many times one has joined, so the row can show it arriving. */
  open: boolean;
  joins: number;
  marks: Mark[];
}

export interface Companionship {
  world: World;
  foraging: Foraging;
  hearth: Hearth;
  friends: Friends;
  strayCell: (cellX: number, cellZ: number) => Stray[];
  animals: Map<string, Animal>;
  /** The animal that would be offered this frame and how strongly, before forage has had its say. */
  candidate: { key: string; score: number } | null;
  /** The treat given last that was only liked, so the next held out is another. */
  lastLiked: Treat | null;
  /** The motion clock's time, as the scene last stepped. */
  time: number;
  /** What a tap on the screen pets, given by the scene, which knows the camera. */
  tapAt: ((x: number, y: number) => string | null) | null;
  shown: CompanionShown;
  listeners: Set<() => void>;
  nextMark: number;
  /** The overlay's name labels and marks, by companion and by mark, which the scene moves over the animals each frame. */
  screen: { names: Map<string, HTMLElement>; marks: Map<number, HTMLElement> };
  /** Given by the scene: steps the animals' rules on the spot for some seconds (for screenshots), and whether every animal in view is drawn. */
  simulate: ((seconds: number) => void) | null;
  meshed: (() => boolean) | null;
  /** Strays the world's own strays don't hold (the people's lost animals) round a point, and the name any of them already has: given by whoever keeps them. */
  moreStrays: { near: (x: number, z: number, radius: number) => Stray[]; nameOf: (key: string) => string | null } | null;
  /** How strongly something offered before the animals, other than the fire (a person), is offered this frame: an animal must beat it. */
  rival: (() => number) | null;
}

/**
 * How much larger than life the animals are drawn in the world, as the small
 * forage is: a real cat is a small thing beside Elliott, and they are the
 * heart of the game, so they are drawn to read from a few steps off.
 */
export const DRAWN_LARGER = 1.3;

/** How long a mark rises, in seconds. */
export const MARK_LIFE = 1.6;
/** How long a petted animal stops and answers, in seconds. */
const PETTED = 2.6;

const catActivity: Record<Doing, CatActivity> = { stand: "stand", walk: "walk", trot: "walk", run: "run", sit: "sit", lie: "loaf" };
const dogActivity: Record<Doing, DogActivity> = { stand: "stand", walk: "walk", trot: "trot", run: "run", sit: "sit", lie: "lie" };

export function createCompanionship(world: World, foraging: Foraging, hearth: Hearth): Companionship {
  const friends = loadFriends();
  const strayCell = remembered(512, (key) => {
    const [cx, cz] = key.split(",").map(Number);
    return straysInCell(world, cx, cz);
  });
  const companionship: Companionship = {
    world,
    foraging,
    hearth,
    friends,
    strayCell: (cx, cz) => strayCell(`${cx},${cz}`),
    animals: new Map(),
    candidate: null,
    lastLiked: null,
    time: 0,
    tapAt: null,
    shown: { offer: null, companions: [], naming: null, open: false, joins: 0, marks: [] },
    listeners: new Set(),
    nextMark: 0,
    screen: { names: new Map(), marks: new Map() },
    simulate: null,
    meshed: null,
    moreStrays: null,
    rival: null,
  };
  companionship.shown.companions = rowsOf(companionship);
  return companionship;
}

/** An animal generated from its seed, with what behaviour and befriending know of it. */
function animalOf(key: string, species: Species, seed: string, body: Body, bond: Bond | null): Animal {
  const ms = motionSeed(seed);
  if (species === "cat") {
    const cat = generateCat(seed);
    const { boldness, energy, affection } = cat.personality;
    const temper: Temper = { species, boldness, affection };
    return {
      key,
      species,
      seed,
      look: { species, cat, drive: { current: { activity: catActivity[body.rest], speed: 0, travelled: 0, greeting: false } } },
      nature: { species, size: cat.build.size * DRAWN_LARGER, boldness, energy, affection, seed: ms },
      temper,
      tastes: tastesOf(seed),
      body,
      stray: null,
      follow: null,
      bond: bond ?? firstBond(temper),
      pettedUntil: -Infinity,
      changedAt: -Infinity,
      y: 0,
    };
  }
  const dog = generateDog(seed);
  const { boldness, playfulness, affection } = dog.personality;
  const temper: Temper = { species, boldness, affection };
  return {
    key,
    species,
    seed,
    look: { species, dog, drive: { current: { activity: dogActivity[body.rest], speed: 0, travelled: 0, greeting: false } } },
    nature: { species, size: dog.build.size * DRAWN_LARGER, boldness, energy: playfulness, affection, seed: ms },
    temper,
    tastes: tastesOf(seed),
    body,
    stray: null,
    follow: null,
    bond: bond ?? firstBond(temper),
    pettedUntil: -Infinity,
    changedAt: -Infinity,
    y: 0,
  };
}

export function portraitOf(animal: Animal): Portrait {
  return animal.look.species === "cat" ? catPortrait(animal.look.cat) : dogPortrait(animal.look.dog);
}

function portraitFor(companion: Companion): Portrait {
  return companion.species === "cat" ? catPortrait(generateCat(companion.seed)) : dogPortrait(generateDog(companion.seed));
}

const portraits = new Map<string, Portrait>();
function rowsOf(companionship: Companionship): CompanionRow[] {
  return companionship.friends.companions.map((c) => {
    let portrait = portraits.get(c.seed);
    if (!portrait) {
      portrait = portraitFor(c);
      portraits.set(c.seed, portrait);
    }
    return { key: c.id, name: c.name, following: c.following, portrait };
  });
}

function show(companionship: Companionship, change: Partial<CompanionShown>): void {
  companionship.shown = { ...companionship.shown, ...change };
  for (const listener of companionship.listeners) listener();
}

export function subscribeCompanionship(companionship: Companionship, listener: () => void): () => void {
  companionship.listeners.add(listener);
  return () => {
    companionship.listeners.delete(listener);
  };
}

export const companionOf = (companionship: Companionship, key: string) => companionship.friends.companions.find((c) => c.id === key) ?? null;

/** The strays to have live round a point, less those already won. */
export function straysAround(companionship: Companionship, x: number, z: number, radius: number): Stray[] {
  const won = new Set(companionship.friends.companions.map((c) => c.id));
  const more = companionship.moreStrays?.near(x, z, radius) ?? [];
  return [...straysNear(companionship.world, x, z, radius, companionship.strayCell), ...more].filter((s) => !won.has(s.id));
}

/** A stray brought to life at its home, as warm as Elliott left it. */
export function wakeStray(companionship: Companionship, stray: Stray): Animal {
  const warmth = companionship.friends.warmth[stray.id] as number | undefined;
  const rest = stray.species === "cat" ? "sit" : "stand";
  const heading = motionSeed(stray.seed) % 628 / 100;
  const animal = animalOf(stray.id, stray.species, stray.seed, bodyAt(stray.home.x, stray.home.z, heading, rest), null);
  if (warmth !== undefined) animal.bond = { warmth: Math.max(animal.bond.warmth, warmth), visit: 0 };
  animal.stray = { home: stray.home, roam: stray.roam, mind: strayMind() };
  companionship.animals.set(stray.id, animal);
  return animal;
}

/** A companion brought to life: beside Elliott if it follows, by the fire if it waits at camp. */
export function wakeCompanion(companionship: Companionship, companion: Companion, beside: { x: number; z: number; heading: number }, index: number): Animal {
  const { camp } = companionship.world;
  let body: Body;
  if (companion.following) {
    const angle = beside.heading + Math.PI + (index % 2 === 0 ? -0.7 : 0.7) * (1 + Math.floor(index / 2));
    body = bodyAt(beside.x + Math.sin(angle) * 2.4, beside.z + Math.cos(angle) * 2.4, beside.heading, "sit");
  } else {
    const spot = firesideSpot(camp, index, Math.max(3, companionship.friends.companions.length));
    body = bodyAt(spot.x, spot.z, spot.face, "lie");
  }
  const animal = animalOf(companion.id, companion.species, companion.seed, body, { warmth: 1, visit: 0 });
  animal.follow = followMind(companionship.time + (index + 1) * 5);
  companionship.animals.set(companion.id, animal);
  return animal;
}

/** Drives the animal's drawing from its body: its activity, pace, stride and greeting. `motion` is the motion clock's time, for when it last changed. */
export function driveOf(animal: Animal, time: number, motion: number): void {
  const doing = doingFor(animal.nature, animal.body);
  const { look, body } = animal;
  const drive: AnimalDrive<string> = look.drive.current;
  const was = { activity: drive.activity, greeting: drive.greeting };
  if (look.species === "cat") look.drive.current.activity = catActivity[doing];
  else look.drive.current.activity = dogActivity[doing];
  // The body is drawn larger than life, so its stride is its own: the ground it covers, scaled down to it.
  drive.speed = body.speed / DRAWN_LARGER;
  drive.travelled = body.travelled / DRAWN_LARGER;
  drive.greeting = greeting(body, time);
  if (drive.activity !== was.activity || drive.greeting !== was.greeting) animal.changedAt = motion;
}

/** Where on an animal the eye aims, and how wide it is, for offering it like anything else. */
export function offerableAnimal(animal: Animal): Offerable {
  const size = animal.nature.size;
  return { heart: { x: animal.body.x, y: animal.y + 0.2 * size, z: animal.body.z }, spread: 0.3 * size, reach: { first: 3.2, third: 2.6 } };
}

/** The treat Elliott holds out now: the next round the basket's dishes and its forage. */
export function inHand(companionship: Companionship): Treat | null {
  return treatInHand(companionship.foraging.foraged.basket, companionship.hearth.shown.larder, companionship.lastLiked);
}

/** Whether there is anything to offer for an animal: a companion always, a stray when it allows a pet or there is a treat to hold out. */
export function hasOffer(companionship: Companionship, animal: Animal): boolean {
  if (animal.stray === null) return true;
  return allowsPet(animal.bond, animal.temper) || inHand(companionship) !== null;
}

/** After forage has had its say: what is offered for an animal now, or nothing. */
export function settleOffer(companionship: Companionship, forageOffered: boolean): void {
  const candidate = forageOffered ? null : companionship.candidate;
  const animal = candidate ? (companionship.animals.get(candidate.key) ?? null) : null;
  const offer = animal ? offerFor(companionship, animal) : null;
  const was = companionship.shown.offer;
  if (offer?.key === was?.key && offer?.canPet === was?.canPet && offer?.treat === was?.treat && offer?.name === was?.name) return;
  show(companionship, { offer });
}

function offerFor(companionship: Companionship, animal: Animal): AnimalOffer {
  const companion = companionOf(companionship, animal.key);
  return {
    key: animal.key,
    species: animal.species,
    name: companion?.name ?? null,
    canPet: animal.stray === null || allowsPet(animal.bond, animal.temper),
    treat: inHand(companionship),
    portrait: portraitOf(animal),
  };
}

/** A mark over an animal, rising from now. */
export function mark(companionship: Companionship, key: string, kind: Mark["kind"]): void {
  const born = companionship.time;
  const marks = [...companionship.shown.marks.filter((m) => born - m.born < MARK_LIFE), { id: companionship.nextMark++, key, kind, born }];
  show(companionship, { marks });
}

/** The marks that have finished rising are let go. */
export function forgetMarks(companionship: Companionship): void {
  const time = companionship.time;
  if (companionship.shown.marks.some((m) => time - m.born >= MARK_LIFE)) show(companionship, { marks: companionship.shown.marks.filter((m) => time - m.born < MARK_LIFE) });
}

function keepWarmth(companionship: Companionship, animal: Animal): void {
  companionship.friends = { ...companionship.friends, warmth: { ...companionship.friends.warmth, [animal.key]: Math.min(1, animal.bond.warmth) } };
  saveFriends(companionship.friends);
}

/** Patience: Elliott near and calm warms a stray, a little heart rising each time it warms another step. */
export function warmByPatience(companionship: Companionship, animal: Animal, distance: number, calm: boolean, seconds: number): void {
  const before = animal.bond.warmth;
  animal.bond = bePatient(animal.bond, animal.temper, distance, calm, seconds);
  if (Math.floor(animal.bond.warmth * 4) > Math.floor(before * 4)) {
    keepWarmth(companionship, animal);
    mark(companionship, animal.key, "heart");
  }
}

/** The animal stops, faces Elliott and answers: a cat's tail up and a slow blink, a dog's wag and wiggle. */
function answer(animal: Animal, time: number): void {
  animal.pettedUntil = time + PETTED;
  animal.body.greetUntil = time + PETTED;
}

/** Elliott pets an animal: always answered, and a stray that allows it warms. */
export function petAnimal(companionship: Companionship, key: string): void {
  const animal = companionship.animals.get(key);
  if (!animal) throw new Error(`No animal ${key} to pet`);
  answer(animal, companionship.time);
  if (animal.stray === null) {
    const companion = companionOf(companionship, key);
    if (companion && !companion.following) {
      companionship.friends = { ...companionship.friends, companions: comeAlong(companionship.friends.companions, key) };
      saveFriends(companionship.friends);
      show(companionship, { companions: rowsOf(companionship), joins: companionship.shown.joins + 1 });
    }
    mark(companionship, key, "paw");
    return;
  }
  if (!allowsPet(animal.bond, animal.temper)) throw new Error(`Stray ${key} doesn't allow a pet yet`);
  animal.bond = pet(animal.bond, animal.temper);
  afterWarming(companionship, animal, "liked");
}

/** Elliott holds out the treat in hand: one from the basket, taken as the animal takes it. */
export function treatAnimal(companionship: Companionship, key: string): void {
  const animal = companionship.animals.get(key);
  if (!animal) throw new Error(`No animal ${key} to give a treat`);
  const kind = inHand(companionship);
  if (kind === null) throw new Error("No treat in the basket to give");
  if (isDish(kind)) giveDish(companionship.hearth, kind);
  else takeTreat(companionship.foraging, kind);
  answer(animal, companionship.time);
  if (animal.stray === null) {
    companionship.lastLiked = kind;
    mark(companionship, key, "heart");
    return;
  }
  const given = giveTreat(animal.bond, animal.temper, kind, animal.tastes);
  animal.bond = given.bond;
  companionship.lastLiked = given.relish === "liked" ? kind : null;
  afterWarming(companionship, animal, given.relish);
}

/** A tap on an animal: a pet where it allows one, or else the treat in hand. */
export function tapAnimal(companionship: Companionship, key: string): void {
  const animal = companionship.animals.get(key);
  if (!animal) throw new Error(`No animal ${key} to tap`);
  if (animal.stray === null || allowsPet(animal.bond, animal.temper)) petAnimal(companionship, key);
  else if (inHand(companionship) !== null) treatAnimal(companionship, key);
}

function afterWarming(companionship: Companionship, animal: Animal, relish: Relish): void {
  if (isWon(animal.bond)) {
    befriend(companionship, animal);
    return;
  }
  keepWarmth(companionship, animal);
  mark(companionship, animal.key, relish === "loved" ? "hearts" : "heart");
}

/** Wins a live stray over at once, as if a treat it loves had: for screenshots and tests. */
export function winStray(companionship: Companionship, key: string): void {
  const animal = companionship.animals.get(key);
  if (!animal?.stray) throw new Error(`No live stray ${key} to win`);
  animal.bond = { warmth: 1, visit: 0 };
  befriend(companionship, animal);
}

/** A stray won over: it becomes a companion with a suggested name, follows, and the naming card opens. */
function befriend(companionship: Companionship, animal: Animal): void {
  const taken = companionship.friends.companions.map((c) => c.name);
  // An animal someone lost already has a name: it is offered first.
  const known = companionship.moreStrays?.nameOf(animal.key) ?? null;
  const suggested = suggestedNames(animal.species, animal.seed, taken);
  const suggestions = known === null ? suggested : [known, ...suggested.filter((n) => n !== known)];
  const companions = join(companionship.friends.companions, { id: animal.key, species: animal.species, seed: animal.seed, name: suggestions[0] });
  const warmth = { ...companionship.friends.warmth };
  delete warmth[animal.key];
  companionship.friends = { companions, warmth };
  saveFriends(companionship.friends);
  animal.stray = null;
  animal.bond = { warmth: 1, visit: 0 };
  animal.follow = followMind(companionship.time + 6);
  // Anyone sent back to camp to make room walks there from where they are.
  mark(companionship, animal.key, "hearts");
  show(companionship, {
    companions: rowsOf(companionship),
    joins: companionship.shown.joins + 1,
    naming: { key: animal.key, species: animal.species, portrait: portraitOf(animal), suggestions, index: 0 },
  });
}

/** The naming card shows the next suggestion (or the one before, with −1). */
export function anotherName(companionship: Companionship, step: 1 | -1 = 1): void {
  const naming = companionship.shown.naming;
  if (!naming) return;
  const count = naming.suggestions.length;
  show(companionship, { naming: { ...naming, index: (naming.index + step + count) % count } });
}

/** The name is kept and the card closes. */
export function keepName(companionship: Companionship, name: string): void {
  const naming = companionship.shown.naming;
  if (!naming) throw new Error("No naming card to keep a name from");
  companionship.friends = { ...companionship.friends, companions: rename(companionship.friends.companions, naming.key, name) };
  saveFriends(companionship.friends);
  show(companionship, { naming: null, companions: rowsOf(companionship) });
}

/** A companion goes home to the person who lost it: it is no longer Elliott's, and leaves the walk. */
export function partWith(companionship: Companionship, key: string): void {
  if (!companionOf(companionship, key)) throw new Error(`No companion ${key} to part with`);
  companionship.friends = { ...companionship.friends, companions: companionship.friends.companions.filter((c) => c.id !== key) };
  saveFriends(companionship.friends);
  companionship.animals.delete(key);
  show(companionship, { companions: rowsOf(companionship), offer: companionship.shown.offer?.key === key ? null : companionship.shown.offer });
}

export function setCompanionsOpen(companionship: Companionship, open: boolean): void {
  show(companionship, { open });
}

/** The companions who follow, in their order, with their live animals. */
export function followingAnimals(companionship: Companionship): Animal[] {
  return followers(companionship.friends.companions)
    .map((c) => companionship.animals.get(c.id))
    .filter((a): a is Animal => a !== undefined);
}

/** Forgets every companion and every stray's warmth, here and on the device. */
export function forgetFriends(companionship: Companionship): void {
  companionship.friends = { companions: [], warmth: {} };
  saveFriends(companionship.friends);
  // The companions go back to being the strays they were, wherever their homes are; the strays round Elliott are strangers again.
  for (const [key, animal] of companionship.animals) {
    if (animal.stray) animal.bond = firstBond(animal.temper);
    else companionship.animals.delete(key);
  }
  show(companionship, { companions: [], naming: null, offer: null, marks: [] });
}

/** Whether the animal is drawn this frame as a companion who waits at camp. */
export function isResting(companionship: Companionship, animal: Animal): boolean {
  return animal.stray === null && companionOf(companionship, animal.key)?.following === false;
}
