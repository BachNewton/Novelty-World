import { sticksInChunk, sticksNear, type StickSpot } from "../../engine/sticks";
import { remembered, type World } from "../../engine/world";
import { playsFetch } from "../../gameplay/befriending";
import { batStick, carrying, catAtStick, easePlay, fetchMind, mouthAt, playOf, stepFetcher, stepStick, stickDownAt, stickPlace, throwStick, within, type Stick } from "../../gameplay/fetch";
import type { Offerable, Point3 } from "../../gameplay/offering";
import { offTheGround } from "../../gameplay/riding";
import { broughtBack, isCompanion, isResting, type Animal, type Companionship, type PlayStep } from "./companionship";

/*
 * A walk's game of fetch, between the scene, the overlay over it and the
 * probe: the sticks lying about (the world's fallen ones, less those Elliott
 * has taken up this walk), the stick in Elliott's hand, the sticks thrown
 * (flying, floating, lying where they came down, or carried back in a
 * dog's jaws), the stick on offer to pick up, and the dogs at play. It
 * steps with the animals, one short step at a time, so a dog and its stick
 * keep together. A stick out of reach is simply left: there is always
 * another.
 */

/** A stick out of Elliott's hand. */
export interface Thrown {
  id: number;
  stick: Stick;
  /** Its own turn as it lies. */
  turn: number;
  /** The dog with it in its jaws, or null. */
  carriedBy: string | null;
  /** The cats who have batted at it. */
  batted: Set<string>;
}

/** Something to pick up: one of the world's sticks, or one thrown. */
export type Pickup = { spot: StickSpot } | { thrown: number };

export interface FetchShown {
  /** Whether a stick is offered to pick up. */
  offered: boolean;
  /** Whether Elliott holds a stick, ready to throw. */
  holding: boolean;
  throws: number;
}

export interface Fetching {
  world: World;
  companionship: Companionship;
  stickChunk: (chunkX: number, chunkZ: number) => StickSpot[];
  /** The world's sticks Elliott has taken up this walk. */
  taken: Set<string>;
  holding: boolean;
  thrown: Thrown[];
  nextThrown: number;
  /** Which stick each dog at play is after. */
  games: Map<string, number>;
  /** The stick that would be offered this frame and how strongly, if more strongly than anything weighed before it. */
  candidate: { pickup: Pickup; score: number } | null;
  /** Where Elliott throws from and which way, given by the scene each frame: their hand and the way they look or face. */
  hand: { from: Point3; way: Point3 } | null;
  /** What a tap on the screen picks up, given by the scene, which knows the camera. */
  tapAt: ((x: number, y: number) => Pickup | null) | null;
  shown: FetchShown;
  listeners: Set<() => void>;
}

/** The fewest sticks kept lying about once thrown; the oldest of any more, out of every dog's mouth, are let go. */
const KEPT_THROWN = 6;
/** How far a dog notices a throw from, in metres. */
const NOTICES_THROW = 30;

export function createFetching(world: World, companionship: Companionship): Fetching {
  const chunk = remembered(512, (key) => {
    const [cx, cz] = key.split(",").map(Number);
    return sticksInChunk(world, cx, cz);
  });
  const fetching: Fetching = {
    world,
    companionship,
    stickChunk: (cx, cz) => chunk(`${cx},${cz}`),
    taken: new Set(),
    holding: false,
    thrown: [],
    nextThrown: 0,
    games: new Map(),
    candidate: null,
    hand: null,
    tapAt: null,
    shown: { offered: false, holding: false, throws: 0 },
    listeners: new Set(),
  };
  return fetching;
}

/** The game joins the animals' steps, until the returned function takes it out again: the scene's to call once it is drawn. */
export function joinPlay(fetching: Fetching): () => void {
  const { companionship } = fetching;
  const play = {
    step: (_time: number, seconds: number) => {
      stepThrown(fetching, seconds);
    },
    animal: (animal: Animal, step: PlayStep) => playAnimal(fetching, animal, step),
  };
  companionship.play = play;
  return () => {
    if (companionship.play === play) companionship.play = null;
  };
}

function show(fetching: Fetching, change: Partial<FetchShown>): void {
  fetching.shown = { ...fetching.shown, ...change };
  for (const listener of fetching.listeners) listener();
}

export function subscribeFetching(fetching: Fetching, listener: () => void): () => void {
  fetching.listeners.add(listener);
  return () => {
    fetching.listeners.delete(listener);
  };
}

/** The world's sticks lying within `radius` of a point, less those taken up. */
export function sticksAround(fetching: Fetching, x: number, z: number, radius: number): StickSpot[] {
  return sticksNear(fetching.world, x, z, radius, fetching.stickChunk).filter((s) => !fetching.taken.has(s.id));
}

/** The thrown sticks lying where Elliott could pick them up: down, and in no dog's jaws. */
export function thrownToPickUp(fetching: Fetching): Thrown[] {
  return fetching.thrown.filter((t) => t.carriedBy === null && within(t.stick, fetching.world));
}

/** Where something to pick up is. */
export function pickupAt(fetching: Fetching, pickup: Pickup): Point3 {
  if ("spot" in pickup) return { x: pickup.spot.x, y: pickup.spot.y, z: pickup.spot.z };
  const thrown = fetching.thrown.find((t) => t.id === pickup.thrown);
  if (!thrown) throw new Error(`No thrown stick ${pickup.thrown}`);
  const at = stickPlace(thrown.stick, fetching.world, thrown.turn);
  return { x: at.x, y: at.y, z: at.z };
}

/** Where the eye aims at a stick on the ground, for offering it like anything else. */
export function offerableStick(at: Point3): Offerable {
  return { heart: { x: at.x, y: at.y + 0.05, z: at.z }, spread: 0.32, reach: { first: 3, third: 2.2 } };
}

/** The scene says where Elliott's hand is and which way they would throw. */
export function holdHand(fetching: Fetching, hand: Fetching["hand"]): void {
  fetching.hand = hand;
}

/** The stick that would be offered this frame, if any, before forage has its say. */
export function weighStick(fetching: Fetching, candidate: Fetching["candidate"]): void {
  fetching.candidate = candidate;
}

/** The scene says what a tap on the screen picks up, or that nothing can be tapped. */
export function answerStickTaps(fetching: Fetching, tapAt: Fetching["tapAt"]): void {
  fetching.tapAt = tapAt;
}

/** After the rest have had their say: whether the stick weighed is offered now. */
export function settleStick(fetching: Fetching, othersOffered: boolean): void {
  const offered = !othersOffered && !fetching.holding && fetching.candidate !== null;
  if (offered !== fetching.shown.offered) show(fetching, { offered });
}

/** Elliott takes a stick up into their hand. */
export function pickUpStick(fetching: Fetching, pickup: Pickup): void {
  if (fetching.holding) throw new Error("Elliott already holds a stick");
  if ("spot" in pickup) fetching.taken.add(pickup.spot.id);
  else {
    const thrown = fetching.thrown.find((t) => t.id === pickup.thrown);
    if (!thrown || thrown.carriedBy !== null) throw new Error(`No thrown stick ${pickup.thrown} to pick up`);
    fetching.thrown = fetching.thrown.filter((t) => t !== thrown);
  }
  fetching.holding = true;
  fetching.candidate = null;
  show(fetching, { holding: true, offered: false });
}

/** Elliott picks up whatever stick is offered. */
export function pickUpOffered(fetching: Fetching): void {
  if (!fetching.shown.offered || !fetching.candidate) throw new Error("No stick is offered to pick up");
  pickUpStick(fetching, fetching.candidate.pickup);
}

/** Puts a stick in Elliott's hand, as if picked up: for screenshots and tests. */
export function giveStick(fetching: Fetching): void {
  if (fetching.holding) return;
  fetching.holding = true;
  show(fetching, { holding: true });
}

/** The dogs who could fetch now: friendly enough, on the ground and near, those already at play first, then the nearest (a playful one sooner). */
function fetchers(fetching: Fetching, from: { x: number; z: number }): Animal[] {
  const { companionship } = fetching;
  const free = [...companionship.animals.values()].filter((a) => {
    if (a.species !== "dog" || isResting(companionship, a) || (a.ride && offTheGround(a.ride))) return false;
    if (Math.hypot(a.body.x - from.x, a.body.z - from.z) > NOTICES_THROW) return false;
    if (a.fetch && carrying(a.fetch)) return false;
    return isCompanion(a) || (a.stray !== null && a.temper !== null && playsFetch(a.bond, a.temper));
  });
  const playing = (a: Animal) => a.fetch !== null && a.fetch.phase !== "chase" && a.fetch.phase !== "back";
  const score = (a: Animal) => Math.hypot(a.body.x - from.x, a.body.z - from.z) - 4 * a.nature.energy - (playing(a) ? 100 : 0);
  return free.sort((a, b) => score(a) - score(b));
}

/** Elliott throws the stick in their hand where they look, and the dog most ready for it bounds after it. */
export function throwHeld(fetching: Fetching): void {
  if (!fetching.holding) throw new Error("Elliott holds no stick to throw");
  const hand = fetching.hand;
  if (!hand) throw new Error("The scene hasn't said where Elliott's hand is");
  const id = fetching.nextThrown++;
  fetching.thrown.push({ id, stick: throwStick(hand.from, hand.way), turn: (id * 2.39996) % (Math.PI * 2), carriedBy: null, batted: new Set() });
  fetching.holding = false;
  const dog = fetchers(fetching, hand.from)[0] as Animal | undefined;
  if (dog) {
    dog.fetch = fetchMind(fetching.companionship.time, isCompanion(dog));
    fetching.games.set(dog.key, id);
  }
  forgetOldest(fetching);
  show(fetching, { holding: false, throws: fetching.shown.throws + 1 });
}

function forgetOldest(fetching: Fetching): void {
  const loose = fetching.thrown.filter((t) => t.carriedBy === null && ![...fetching.games.values()].includes(t.id));
  const extra = loose.length - KEPT_THROWN;
  if (extra > 0) {
    const gone = new Set(loose.slice(0, extra));
    fetching.thrown = fetching.thrown.filter((t) => !gone.has(t));
  }
}

/** The thrown sticks some seconds on; one washed off with no shore is gone. */
function stepThrown(fetching: Fetching, seconds: number): void {
  fetching.thrown = fetching.thrown.flatMap((t) => {
    if (t.carriedBy !== null) return [t];
    const stick = stepStick(t.stick, fetching.world, seconds);
    return stick === null ? [] : [{ ...t, stick }];
  });
}

/** Steps an animal at play: a dog fetching, or a cat watching a stick. Returns whether it was at play. */
function playAnimal(fetching: Fetching, animal: Animal, step: PlayStep): boolean {
  if (animal.look.species === "dog") {
    const play = animal.look.play;
    const mind = animal.fetch;
    play.current = easePlay(play.current, playOf(mind, step.time), step.seconds);
    if (mind === null) return false;
    return fetchStep(fetching, animal, mind, step);
  }
  if (animal.species === "cat" && !isResting(fetching.companionship, animal)) return catStep(fetching, animal, step);
  return false;
}

function fetchStep(fetching: Fetching, animal: Animal, mind: NonNullable<Animal["fetch"]>, step: PlayStep): boolean {
  const id = fetching.games.get(animal.key);
  const thrown = fetching.thrown.find((t) => t.id === id) ?? null;
  const at = thrown && stickPlace(thrown.stick, fetching.world, thrown.turn);
  const after = thrown && at ? { x: at.x, z: at.z, within: within(thrown.stick, fetching.world) } : null;
  const event = stepFetcher(animal.body, mind, animal.nature, after, { ...step.elliott, holding: fetching.holding }, step.time, step.ground, step.obstacles, step.seconds);
  switch (event) {
    case "picked":
      if (thrown) thrown.carriedBy = animal.key;
      break;
    case "dropped": {
      const mouth = mouthAt(animal.body, animal.nature);
      if (thrown) {
        thrown.carriedBy = null;
        thrown.turn = animal.body.heading + Math.PI / 2;
        thrown.stick = stickDownAt(fetching.world, mouth.x, mouth.z) ?? { phase: "lying", x: mouth.x, z: mouth.z, age: 0 };
      }
      fetching.games.delete(animal.key);
      broughtBack(fetching.companionship, animal.key);
      break;
    }
    case "done":
      animal.fetch = null;
      fetching.games.delete(animal.key);
      if (thrown?.carriedBy === animal.key) thrown.carriedBy = null;
      break;
    case null:
      break;
  }
  // A dog given up on its stick (gone, or out of reach) lets it lie.
  if (mind.phase === "back" && fetching.games.has(animal.key)) fetching.games.delete(animal.key);
  return true;
}

function catStep(fetching: Fetching, animal: Animal, step: PlayStep): boolean {
  for (const thrown of fetching.thrown) {
    if (thrown.carriedBy !== null) continue;
    const at = stickPlace(thrown.stick, fetching.world, thrown.turn);
    const doing = catAtStick(animal.body, animal.nature, thrown.stick, at, thrown.batted.has(animal.key), step.ground, step.obstacles, step.seconds);
    if (doing === "bat") {
      thrown.batted.add(animal.key);
      thrown.stick = batStick(thrown.stick, animal.body, fetching.world);
      animal.body.greetUntil = step.time + 1.2;
    }
    if (doing !== null) return true;
  }
  return false;
}

/** Whether a dog has a stick in its jaws now, for drawing it there. */
export const carries = (fetching: Fetching, key: string) => fetching.thrown.some((t) => t.carriedBy === key);

/** Lets every stick go and ends every game: for screenshots and tests. */
export function forgetSticks(fetching: Fetching): void {
  fetching.thrown = [];
  fetching.games.clear();
  fetching.taken.clear();
  fetching.holding = false;
  for (const animal of fetching.companionship.animals.values()) animal.fetch = null;
  show(fetching, { holding: false, offered: false });
}
