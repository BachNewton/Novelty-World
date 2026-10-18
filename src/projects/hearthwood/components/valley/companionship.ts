import { SPECIES, straysInCell, straysNear, type Species, type Stray } from "../../engine/strays";
import { coatSeason, deerAbroad, friendsInCell, friendsNear, type Friend, type FriendSpecies } from "../../engine/wildlife";
import { remembered, type World } from "../../engine/world";
import { motionSeed } from "../../animals/motion";
import { allowsPet, bePatient, fetched, firstBond, giveTreat, isWon, pet, tastesOf, treatInHand, type Bond, type Relish, type Tastes, type Temper, type Treat } from "../../gameplay/befriending";
import { bodyAt, doingFor, greeting, type Body, type Kind, type Nature, type Obstacle } from "../../gameplay/behaviour";
import type { FetchMind } from "../../gameplay/fetch";
import type { WalkGround } from "../../gameplay/walking";
import { beKnown, climbing, friendMind, knows, takesTreats, visitsOf, type FriendHome, type FriendMind } from "../../gameplay/forest-friends";
import { comeAlong, firesideSpot, followers, followMind, join, rename, type Companion, type FollowMind, type Leader } from "../../gameplay/companions";
import { loadFriends, saveFriends, type Friends } from "../../gameplay/friends";
import { suggestedNames } from "../../gameplay/names";
import type { Offerable } from "../../gameplay/offering";
import { isDish } from "../../gameplay/recipes";
import { strayMind, type StrayMind } from "../../gameplay/roaming";
import type { Portrait } from "../../art/portrait";
import type { AnimalDrive } from "../animals/animal-body";
import { ACTIVITY, bornOf, portraitOfLook, type AnimalLook } from "./animal-kinds";
import { offTheGround, walkingRide, type Ride } from "../../gameplay/riding";
import { takeTreat, type Foraging } from "./foraging";
import { restingSite } from "./camping";
import { giveDish, hushNow, type Hearth } from "./hearth";

/*
 * The animals of a walk, between the scene, the overlay over it and the
 * probe: the strays round Elliott (the cats, dogs, foxes and hedgehogs who
 * can be won over, streamed in by area from the world's seed, each with its
 * body, its mind and how warm it is to Elliott), the forest friends round
 * them (the squirrels, hares and deer, who stay home but come to know
 * Elliott), the companions and what is kept of them (and what they do of their own accord besides following), the animal on offer to pet or to
 * give a treat to, the naming card when one is won, and the little hearts
 * that rise as an animal warms. The scene steps the animals each frame; the
 * overlay reads what is shown as an external store.
 */

/** One animal of the walk, live: a stray, a companion or a forest friend. */
export interface Animal {
  /** Its stray's id, which a companion keeps, or its friend's. */
  key: string;
  species: Kind;
  seed: string;
  /** The generated animal its body is drawn from, and where the drawing is driven from each frame. */
  look: AnimalLook;
  nature: Nature;
  /** What befriending knows of a stray or a companion; a forest friend has none. */
  temper: Temper | null;
  /** Its favourite dish and the few it likes. */
  tastes: Tastes;
  body: Body;
  /** As a stray: its home, how far it roams and its mind; null once a companion. */
  stray: { home: { x: number; z: number }; roam: number; mind: StrayMind } | null;
  /** As a companion: its mind as it follows. */
  follow: FollowMind | null;
  /** A hedgehog companion's ride in Elliott's basket; null for every other animal. */
  ride: Ride | null;
  /** As a forest friend: its kind, its home and its mind; null for every other animal. */
  friend: { species: FriendSpecies; place: FriendHome; mind: FriendMind } | null;
  /** A dog's game of fetch, while it plays; null otherwise. */
  fetch: FetchMind | null;
  bond: Bond;
  /** Petted, it stops to be petted until then, facing Elliott. */
  pettedUntil: number;
  /** The ground under it, for drawing it there. */
  y: number;
  /** The motion clock's time its drawing last changed what it was doing, or its greeting: it has settled into its pose a while after. */
  changedAt: number;
}

/** What an animal at play is stepped with, one short step at a time. */
export interface PlayStep {
  elliott: { x: number; z: number };
  time: number;
  seconds: number;
  ground: WalkGround;
  obstacles: readonly Obstacle[];
}

/** A game the animals play with Elliott (fetch), given by whoever keeps it: stepped with the animals, and taking over an animal's step while it plays. */
export interface Play {
  /** One short step of the game itself, before the animals'. */
  step: (time: number, seconds: number) => void;
  /** Steps an animal at play, returning whether it was: if not, it goes about its own rules. */
  animal: (animal: Animal, step: PlayStep) => boolean;
}

/** What the companions do of their own accord besides following (noticing a clue), given by whoever keeps it: stepped with the animals, and taking over a following companion's step while it is at it. */
export interface Help {
  /** One short step of it, before the animals', with Elliott as they lead. */
  step: (time: number, seconds: number, leader: Leader) => void;
  /** Steps a following companion at it, returning whether it was: if not, it follows. */
  animal: (animal: Animal, step: PlayStep) => boolean;
}

/** What is offered for an animal: a pet, a treat, or both. */
export interface AnimalOffer {
  key: string;
  species: Kind;
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
  friendCell: (cellX: number, cellZ: number) => Friend[];
  /** How far into their waking hours the deer are, from the sun's height, as the scene last set it. */
  abroad: number;
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
  /** The game of fetch, while the scene keeps one. */
  play: Play | null;
  /** The companions helping with the mysteries, while the scene keeps them. */
  help: Help | null;
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


export function createCompanionship(world: World, foraging: Foraging, hearth: Hearth): Companionship {
  const friends = loadFriends();
  const strayCell = remembered(512, (key) => {
    const [cx, cz] = key.split(",").map(Number);
    return straysInCell(world, cx, cz);
  });
  const friendCell = remembered(512, (key) => {
    const [cx, cz] = key.split(",").map(Number);
    return friendsInCell(world, cx, cz);
  });
  const companionship: Companionship = {
    world,
    foraging,
    hearth,
    friends,
    strayCell: (cx, cz) => strayCell(`${cx},${cz}`),
    friendCell: (cx, cz) => friendCell(`${cx},${cz}`),
    abroad: 0,
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
    play: null,
    help: null,
  };
  companionship.shown.companions = rowsOf(companionship);
  return companionship;
}

/** An animal generated from its seed, with what behaviour and befriending know of it. */
function animalOf(key: string, species: Kind, seed: string, body: Body, bond: Bond | null): Animal {
  const born = bornOf(species, seed, body.rest);
  const { boldness, energy, affection } = born;
  const temper: Temper | null = isSpecies(species) ? { species, boldness, affection } : null;
  return {
    key,
    species,
    seed,
    look: born.look,
    nature: { species, size: born.size * DRAWN_LARGER, boldness, energy, affection, seed: motionSeed(seed) },
    temper,
    tastes: tastesOf(seed),
    body,
    stray: null,
    follow: null,
    ride: null,
    friend: null,
    fetch: null,
    bond: bond ?? (temper ? firstBond(temper) : { warmth: 0, visit: 0 }),
    pettedUntil: -Infinity,
    changedAt: -Infinity,
    y: 0,
  };
}

const isSpecies = (kind: Kind): kind is Species => (SPECIES as readonly Kind[]).includes(kind);

/** A stray's or a companion's temper; asking a forest friend's is a bug. */
function temperOf(animal: Animal): Temper {
  if (!animal.temper) throw new Error(`The ${animal.species} ${animal.key} is a forest friend, with no temper to befriend`);
  return animal.temper;
}

/** Whether an animal is one of Elliott's companions. */
export const isCompanion = (animal: Animal) => animal.stray === null && animal.friend === null;

export function portraitOf(animal: Animal): Portrait {
  return portraitOfLook(animal.look);
}

function portraitFor(companion: Companion): Portrait {
  return portraitOfLook(bornOf(companion.species, companion.seed, "stand").look);
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

/** The forest friends to have live round a point. */
export function friendsAround(companionship: Companionship, x: number, z: number, radius: number): Friend[] {
  return friendsNear(companionship.world, x, z, radius, companionship.friendCell);
}

/** A forest friend brought to life at home (a deer in its bed through the day), knowing Elliott as well as it did. */
export function wakeFriend(companionship: Companionship, friend: Friend): Animal {
  const heading = (motionSeed(friend.seed) % 628) / 100;
  const bed = friend.bed && companionship.abroad < 0.35 ? friend.bed : null;
  const at = bed ?? friend.home;
  const rest = friend.species === "deer" ? (bed ? "lie" : "sit") : friend.species === "squirrel" ? "sit" : "stand";
  const animal = animalOf(friend.id, friend.species, friend.seed, bodyAt(at.x, at.z, heading, rest), null);
  const known = companionship.friends.warmth[friend.id] as number | undefined;
  if (known !== undefined) animal.bond = { warmth: known, visit: 0 };
  animal.friend = { species: friend.species, place: { home: friend.home, roam: friend.roam, trunk: friend.trunk, bed: friend.bed }, mind: friendMind() };
  companionship.animals.set(friend.id, animal);
  return animal;
}

/** The season's coats and the deer's hours, from the date and the sun, for the scene to set each frame. */
export function wildDay(companionship: Companionship, realDayOfYear: number, sunElevation: number): { winter: number; white: number } {
  companionship.abroad = deerAbroad(sunElevation);
  return coatSeason(realDayOfYear);
}

/** A companion brought to life: beside Elliott if it follows, by the fire if it waits at camp. */
export function wakeCompanion(companionship: Companionship, companion: Companion, beside: { x: number; z: number; heading: number }, index: number): Animal {
  const camp = restingSite(companionship.hearth.camping);
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
  if (companion.species === "hedgehog") animal.ride = walkingRide(companionship.time);
  companionship.animals.set(companion.id, animal);
  return animal;
}

/** Drives the animal's drawing from its body: its activity, pace, stride and greeting. `motion` is the motion clock's time, for when it last changed. */
export function driveOf(animal: Animal, time: number, motion: number): void {
  const doing = doingFor(animal.nature, animal.body);
  const { look, body } = animal;
  const drive: AnimalDrive<string> = look.drive.current;
  const was = { activity: drive.activity, greeting: drive.greeting };
  // In the basket a hedgehog peeks out over the rim; on its way in or out it is a ball. Up its tree a squirrel climbs, or clings.
  const climb = animal.friend && climbing(animal.friend.mind) ? animal.friend.mind.climb : null;
  drive.activity = animal.ride && offTheGround(animal.ride) ? (animal.ride.phase === "riding" ? "peek" : "lie") : climb ? (Math.abs(climb.goal - climb.height) > 0.02 ? "climb" : "cling") : ACTIVITY[look.species][doing];
  // The body is drawn larger than life, so its stride is its own: the ground it covers, scaled down to it.
  drive.speed = (climb ? 1.4 : body.speed) / DRAWN_LARGER;
  drive.travelled = (climb ? climb.height * 2 : body.travelled) / DRAWN_LARGER;
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

/** Whether there is anything to offer for an animal: a companion always, a stray when it allows a pet or there is a treat to hold out, a forest friend once it knows Elliott (a pet) or, for a hare or a squirrel, while there is a treat to hold out. */
export function hasOffer(companionship: Companionship, animal: Animal): boolean {
  if (animal.friend) return knows(animal.bond) || (takesTreats(animal.friend.species) && !climbing(animal.friend.mind) && inHand(companionship) !== null);
  if (animal.stray === null) return true;
  return allowsPet(animal.bond, temperOf(animal)) || inHand(companionship) !== null;
}

/** Whether an animal lets Elliott pet it now. */
function canPet(animal: Animal): boolean {
  if (animal.friend) return knows(animal.bond);
  return animal.stray === null || allowsPet(animal.bond, temperOf(animal));
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
    canPet: canPet(animal),
    treat: animal.friend && (knows(animal.bond) || !takesTreats(animal.friend.species)) ? null : inHand(companionship),
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

/** Patience: Elliott near and calm warms a stray, a little heart rising each time it warms another step; a forest friend comes to know them a visit at a time, and with the last a burst of hearts. */
export function warmByPatience(companionship: Companionship, animal: Animal, distance: number, calm: boolean, seconds: number): void {
  const before = animal.bond.warmth;
  if (animal.friend) {
    const visits = visitsOf(animal.bond);
    animal.bond = beKnown(animal.bond, distance, calm, seconds);
    if (visitsOf(animal.bond) > visits) {
      keepWarmth(companionship, animal);
      mark(companionship, animal.key, knows(animal.bond) ? "hearts" : "heart");
    }
    return;
  }
  animal.bond = bePatient(animal.bond, temperOf(animal), distance, calm, seconds, hushNow(companionship.hearth));
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
  if (animal.friend) {
    if (!knows(animal.bond)) throw new Error(`The ${animal.species} ${key} doesn't know Elliott well enough for a pet`);
    mark(companionship, key, "heart");
    return;
  }
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
  if (!allowsPet(animal.bond, temperOf(animal))) throw new Error(`Stray ${key} doesn't allow a pet yet`);
  animal.bond = pet(animal.bond, temperOf(animal));
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
  if (animal.friend) {
    // A treat held out to a hare or a squirrel: it knows Elliott from now on.
    if (!takesTreats(animal.friend.species)) throw new Error(`A ${animal.species} takes no treats`);
    const known = knows(animal.bond);
    animal.bond = { warmth: 1, visit: 0 };
    companionship.lastLiked = kind;
    keepWarmth(companionship, animal);
    mark(companionship, key, known ? "heart" : "hearts");
    return;
  }
  if (animal.stray === null) {
    companionship.lastLiked = kind;
    mark(companionship, key, "heart");
    return;
  }
  const given = giveTreat(animal.bond, temperOf(animal), kind, animal.tastes);
  animal.bond = given.bond;
  companionship.lastLiked = given.relish === "liked" ? kind : null;
  afterWarming(companionship, animal, given.relish);
}

/** A tap on an animal: a pet where it allows one, or else the treat in hand. */
export function tapAnimal(companionship: Companionship, key: string): void {
  const animal = companionship.animals.get(key);
  if (!animal) throw new Error(`No animal ${key} to tap`);
  if (canPet(animal)) petAnimal(companionship, key);
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

/** A dog brings a stick back to Elliott's feet: a stray warms a good deal, the more for a playful one, and may be won; a companion is simply happy. */
export function broughtBack(companionship: Companionship, key: string): void {
  const animal = companionship.animals.get(key);
  if (!animal) throw new Error(`No animal ${key} to bring a stick back`);
  if (animal.stray === null) {
    mark(companionship, key, "hearts");
    return;
  }
  animal.bond = fetched(animal.bond, temperOf(animal), animal.nature.energy);
  afterWarming(companionship, animal, "loved");
}

/** Wins a live stray over at once, as if a treat it loves had: for screenshots and tests. */
export function winStray(companionship: Companionship, key: string): void {
  const animal = companionship.animals.get(key);
  if (!animal?.stray) throw new Error(`No live stray ${key} to win`);
  animal.bond = { warmth: 1, visit: 0 };
  befriend(companionship, animal);
}

/** A live forest friend comes to know Elliott at once, as three visits would: for screenshots and tests. */
export function knowFriend(companionship: Companionship, key: string): void {
  const animal = companionship.animals.get(key);
  if (!animal?.friend) throw new Error(`No live forest friend ${key} to know Elliott`);
  animal.bond = { warmth: 1, visit: 0 };
  keepWarmth(companionship, animal);
}

/** A stray won over: it becomes a companion with a suggested name, follows, and the naming card opens. */
function befriend(companionship: Companionship, animal: Animal): void {
  const species = temperOf(animal).species;
  const taken = companionship.friends.companions.map((c) => c.name);
  // An animal someone lost already has a name: it is offered first.
  const known = companionship.moreStrays?.nameOf(animal.key) ?? null;
  const suggested = suggestedNames(species, animal.seed, taken);
  const suggestions = known === null ? suggested : [known, ...suggested.filter((n) => n !== known)];
  const companions = join(companionship.friends.companions, { id: animal.key, species, seed: animal.seed, name: suggestions[0] });
  const warmth = { ...companionship.friends.warmth };
  delete warmth[animal.key];
  companionship.friends = { companions, warmth };
  saveFriends(companionship.friends);
  animal.stray = null;
  animal.bond = { warmth: 1, visit: 0 };
  animal.follow = followMind(companionship.time + 6);
  if (animal.species === "hedgehog") animal.ride = walkingRide(companionship.time);
  // Anyone sent back to camp to make room walks there from where they are.
  mark(companionship, animal.key, "hearts");
  show(companionship, {
    companions: rowsOf(companionship),
    joins: companionship.shown.joins + 1,
    naming: { key: animal.key, species, portrait: portraitOf(animal), suggestions, index: 0 },
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
  // The companions go back to being the strays they were, wherever their homes are; the strays and the forest friends round Elliott are strangers again.
  for (const [key, animal] of companionship.animals) {
    if (animal.stray) animal.bond = firstBond(temperOf(animal));
    else if (animal.friend) animal.bond = { warmth: 0, visit: 0 };
    else companionship.animals.delete(key);
  }
  show(companionship, { companions: [], naming: null, offer: null, marks: [] });
}

/** Whether the animal is drawn this frame as a companion who waits at camp. */
export function isResting(companionship: Companionship, animal: Animal): boolean {
  return isCompanion(animal) && companionOf(companionship, animal.key)?.following === false;
}
