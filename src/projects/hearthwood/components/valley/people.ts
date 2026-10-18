import { generateCat } from "../../cats/cat";
import { generateDog } from "../../dogs/dog";
import { peopleInCell, peopleNear, wayTo, type Person } from "../../engine/people";
import type { Stray } from "../../engine/strays";
import { remembered, type World } from "../../engine/world";
import {
  awaitsChoice,
  beginConversation,
  choose,
  fill,
  followsOn,
  giftsOf,
  loadFolk,
  nextPage,
  noAcquaintances,
  openTalk,
  pagesOf,
  rememberTone,
  saveFolk,
  talkFor,
  type CaseView,
  type Conversation,
  type FolkMemory,
  type Having,
  type Speaker,
  type TalkName,
} from "../../gameplay/conversation";
import { folkName, petName } from "../../gameplay/folk";
import type { Taking } from "../../gameplay/help";
import type { Offerable } from "../../gameplay/offering";
import { isDish, recipeOf, type Food } from "../../gameplay/recipes";
import { isBrew, type BrewId } from "../../gameplay/brews";
import { storyOf } from "../../stories/library";
import type { Gift, Keepsake, Page, Request, Tone } from "../../stories/story";
import { folkFrame, folkLook, type FolkLook } from "../../art/folk";
import { catPortrait, dogPortrait, type Portrait } from "../../art/portrait";
import { dishName } from "./cooking-icons";
import { brewName } from "./brewing-icons";
import { FORAGE_NAMES } from "./forage-icons";
import { companionOf, partWith, type Companionship } from "./companionship";
import { takeIngredients, type Foraging } from "./foraging";
import { giveBrew, giveDish, type Hearth } from "./hearth";

/*
 * The people of a walk, between the scene, the overlay over it and the
 * probe: who stands round Elliott (streamed in by area from the world's
 * seed, each with their look and name), the person on offer to talk with,
 * a conversation under way (the line showing, Elliott's choices of tone,
 * what was given and received), the journal, and what Elliott's
 * acquaintance with everyone is, kept on the device. The people's lost
 * animals are strays of the companions' own, handed to them to wake like
 * any other; one that goes home sits by its person after. The scene draws
 * and frames; the overlay reads what is shown as an external store.
 */

/** Someone round Elliott, live: who they are as the world placed them, how they look and are called. */
export interface PersonLive {
  person: Person;
  look: FolkLook;
  name: string;
  /** The ground under them. */
  y: number;
  /** How high their face is above the ground. */
  face: number;
}

/** What Elliott gave as a talk opened, for the panel to show. */
export type Given = { kind: "dish"; dish: string } | { kind: "brew"; brew: BrewId } | { kind: "forage"; foods: readonly (readonly [Food, number])[] } | { kind: "pet"; portrait: Portrait; name: string; home: boolean } | { kind: "note" };

/** A conversation under way, as the panel shows it. */
export interface Talking {
  id: string;
  name: string;
  look: FolkLook;
  talk: TalkName;
  /** The tone Elliott had taken with them last as the talk opened, which a friend's greeting answers. */
  greeted: Tone | null;
  conversation: Conversation;
  /** The person's line showing: the page's, or their answer to Elliott's choice. */
  line: string;
  /** What Elliott says first on this page, laying out a mystery's reasoning, or null. */
  lead: string | null;
  /** What Elliott said on this page, once a choice was made. */
  said: { tone: Tone; text: string } | null;
  /** The choices waiting to be made, or null. */
  choices: { tone: Tone; text: string }[] | null;
  /** The last page: going on ends the talk. */
  last: boolean;
  given: Given | null;
  /** What they asked Elliott for, while it is still to do: shown on the last page of their asking, and of their waiting. The lost animal's seed draws a lost animal. */
  asking: { request: Request; lostSeed: string | null } | null;
  /** What this talk gave Elliott, shown on its last page. */
  gifts: readonly Gift[];
  /** How many clues this talk told Elliott for the casebook. */
  noted: number;
  /** How many talks have opened, so the panel can show each arriving. */
  opened: number;
}

export interface PersonOffer {
  id: string;
  name: string;
  look: FolkLook;
}

export interface PeopleShown {
  offer: PersonOffer | null;
  talking: Talking | null;
  journal: boolean;
  memory: FolkMemory;
}

export interface People {
  world: World;
  foraging: Foraging;
  hearth: Hearth;
  companionship: Companionship;
  cell: (cellX: number, cellZ: number) => Person[];
  live: Map<string, PersonLive>;
  /** The person that would be offered this frame and how strongly, before the animals and forage have their say. */
  candidate: { id: string; score: number } | null;
  /** What a tap on the screen says of the people, given by the scene, which knows the camera. */
  tapAt: ((x: number, y: number) => string | null) | null;
  /** Whether a person is drawn in the scene now, given by the scene: for screenshots to wait on. */
  isDrawn: ((id: string) => boolean) | null;
  shown: PeopleShown;
  listeners: Set<() => void>;
  opened: number;
  /** How Elliott's cases stand, given by the mysteries: a person's case for their talk to be chosen by, and hearing the clues a talk tells. */
  cases: { view: (id: string) => CaseView | undefined; heard: (id: string, story: string, clues: readonly string[]) => void } | null;
}

/** A lost animal wanders this far from its person at most, in metres: how far round a point to look for them. */
const LOST_REACH = 110;
/** A lost animal brought back is close enough to its person within this, in metres. */
const BROUGHT_BACK = 14;

export function createPeople(world: World, foraging: Foraging, hearth: Hearth, companionship: Companionship): People {
  const cell = remembered(1024, (key) => {
    const [cx, cz] = key.split(",").map(Number);
    return peopleInCell(world, cx, cz);
  });
  const people: People = {
    world,
    foraging,
    hearth,
    companionship,
    cell: (cx, cz) => cell(`${cx},${cz}`),
    live: new Map(),
    candidate: null,
    tapAt: null,
    isDrawn: null,
    shown: { offer: null, talking: null, journal: false, memory: loadFolk() },
    listeners: new Set(),
    opened: 0,
    cases: null,
  };
  return people;
}

/**
 * Joins the people to the animals while the scene is up (their lost animals
 * are strays among the rest, and the naming card offers the name their person
 * gave them); undone after. Joined in an effect rather than when made, so the
 * hook is always the people the scene keeps.
 */
export function joinPeople(people: People, companionship: Companionship): () => void {
  companionship.moreStrays = {
    near: (x, z, radius) => lostAnimalsNear(people, x, z, radius),
    nameOf: (key) => lostAnimalName(people, key),
  };
  return () => {
    companionship.moreStrays = null;
  };
}

function show(people: People, change: Partial<PeopleShown>): void {
  people.shown = { ...people.shown, ...change };
  for (const listener of people.listeners) listener();
}

export function subscribePeople(people: People, listener: () => void): () => void {
  people.listeners.add(listener);
  return () => {
    people.listeners.delete(listener);
  };
}

const memoryOf = (people: People) => people.shown.memory;

function remember(people: People, memory: FolkMemory): void {
  saveFolk(memory);
  show(people, { memory });
}

/** Everyone within a radius of a point. */
export const peopleAround = (people: People, x: number, z: number, radius: number) => peopleNear(people.world, x, z, radius, people.cell);

/** The people's lost animals round a point that are still lost: not gone home. */
export function lostAnimalsNear(people: People, x: number, z: number, radius: number): Stray[] {
  const home = new Set(memoryOf(people).home);
  return peopleAround(people, x, z, radius + LOST_REACH)
    .flatMap((p) => (p.pet ? [p.pet] : []))
    .filter((pet) => !home.has(pet.id) && Math.hypot(pet.home.x - x, pet.home.z - z) <= radius)
    .map((pet) => ({ id: pet.id, species: pet.species, seed: pet.seed, home: pet.home, roam: pet.roam }));
}

/** The person a lost animal belongs to, by the animal's id. */
function ownerOf(people: People, key: string): Person | null {
  if (!key.startsWith("lost/")) return null;
  const id = key.slice("lost/".length);
  const [cx, cz] = id.split("/")[0].split(",").map(Number);
  return people.cell(cx, cz).find((p) => p.id === id) ?? null;
}

/** The name an animal's person gave it, for the naming card to offer first. */
export function lostAnimalName(people: People, key: string): string | null {
  const pet = ownerOf(people, key)?.pet ?? null;
  return pet ? petName(pet) : null;
}

/** A person brought to life for the scene, with their look and name. */
export function liveOf(people: People, person: Person): PersonLive {
  const known = people.live.get(person.id);
  if (known) return known;
  const look = folkLook(person.seed, person.role);
  const frame = folkFrame(look, person.seat);
  const live: PersonLive = { person, look, name: folkName(person.seed), y: people.world.heightAt(person.x, person.z), face: frame.neck + 0.17 };
  people.live.set(person.id, live);
  return live;
}

/** Where on a person the eye aims, and how wide they are, for offering them like anything else. */
export function offerablePerson(live: PersonLive): Offerable {
  return { heart: { x: live.person.x, y: live.y + live.face - 0.3, z: live.person.z }, spread: 0.42, reach: { first: 4.2, third: 3.2 } };
}

/** The scene says what a tap on the screen says of the people, and who is drawn, or that it can't. */
export function answerPeopleTaps(people: People, tapAt: People["tapAt"], isDrawn: People["isDrawn"]): void {
  people.tapAt = tapAt;
  people.isDrawn = isDrawn;
}

/** The person who would be offered this frame, and how strongly, before the animals and forage have their say. */
export function weighPerson(people: People, candidate: People["candidate"]): void {
  people.candidate = candidate;
}

/** After the animals and forage have had their say: whether a person is offered to talk with now. */
export function settlePeople(people: People, othersOffered: boolean): void {
  const candidate = othersOffered || people.shown.talking ? null : people.candidate;
  const live = candidate ? (people.live.get(candidate.id) ?? null) : null;
  const offer = live ? { id: live.person.id, name: live.name, look: live.look } : null;
  if (offer?.id === people.shown.offer?.id) return;
  show(people, { offer });
}

export const speakerOf = (person: Person): Speaker => ({ id: person.id, role: person.role, seed: person.seed, story: person.story, partner: person.partner?.id ?? null });

/** What Elliott has with them for a person: the basket, the dishes, and whether their lost animal follows close by. */
export function havingFor(people: People, person: Person): Having {
  const { companionship } = people;
  const pet = person.pet;
  const companion = pet ? companionOf(companionship, pet.id) : null;
  const animal = pet ? companionship.animals.get(pet.id) : undefined;
  const petHere = companion?.following === true && animal !== undefined && Math.hypot(animal.body.x - person.x, animal.body.z - person.z) < BROUGHT_BACK;
  return { basket: people.foraging.foraged.basket, larder: people.hearth.shown.larder, satchel: people.hearth.shown.satchel, petHere, case: people.cases?.view(person.id) };
}

/** What the braces in a person's texts are filled with. */
function valuesFor(people: People, live: PersonLive): Parameters<typeof fill>[1] {
  const { person } = live;
  const story = storyOf(person.story);
  const known = memoryOf(people).known[person.id] as FolkMemory["known"][string] | undefined;
  const values: Parameters<typeof fill>[1] = { name: live.name };
  if (person.pet) {
    values.pet = petName(person.pet);
    values.way = wayTo(person, person.pet.home);
  }
  if (person.partner) {
    values.partner = folkName(person.partner.seed);
    values.way = wayTo(person, person.partner);
  }
  if (story.kind === "help" && story.request.kind === "dish" && story.request.dish !== "warm") values.dish = recipeOf(story.request.dish)?.name ?? story.request.dish;
  const gave = known?.gave ?? null;
  if (gave !== null) values.gave = isDish(gave) ? dishName(gave) : isBrew(gave) ? brewName(gave) : FORAGE_NAMES[gave as Food];
  return values;
}

function spokenOf(people: People, live: PersonLive, conversation: Conversation, pages: readonly Page[]): Pick<Talking, "line" | "lead" | "said" | "choices" | "last"> {
  const values = valuesFor(people, live);
  const page = pages[conversation.page];
  const chose = conversation.chose === null ? null : (page.choices?.find((c) => c.tone === conversation.chose) ?? null);
  const waiting = awaitsChoice(conversation, pages);
  return {
    line: fill(chose ? chose.reply : page.say, values),
    lead: page.lead === undefined || chose ? null : fill(page.lead, values),
    said: chose ? { tone: chose.tone, text: fill(chose.say, values) } : null,
    choices: waiting ? (page.choices ?? []).map((c) => ({ tone: c.tone, text: fill(c.say, values) })) : null,
    last: !waiting && conversation.page === pages.length - 1,
  };
}


/** What a help story's asking and waiting talks show was asked for. */
function askingOf(person: Person, talk: TalkName): Talking["asking"] {
  const story = storyOf(person.story);
  if (story.kind !== "help" || (talk !== "meet" && talk !== "waiting")) return null;
  return { request: story.request, lostSeed: person.pet?.seed ?? null };
}

function givenOf(people: People, live: PersonLive, taking: Taking | null, keepsPet: boolean | null): Given | null {
  if (taking === null) return null;
  switch (taking.kind) {
    case "dish":
      return { kind: "dish", dish: taking.dish };
    case "brew":
      return { kind: "brew", brew: taking.brew };
    case "forage":
      return { kind: "forage", foods: taking.foods };
    case "carry":
      return { kind: "note" };
    case "pet": {
      const pet = live.person.pet;
      if (!pet) throw new Error(`${live.person.id} has no lost animal to be given back`);
      const portrait = pet.species === "cat" ? catPortrait(generateCat(pet.seed)) : dogPortrait(generateDog(pet.seed));
      return { kind: "pet", portrait, name: petName(pet), home: keepsPet === false };
    }
  }
}

/** What a talk took from Elliott leaves them: a dish out of the larder, a brew out of the satchel, forage out of the basket, an animal going home. */
function hand(people: People, live: PersonLive, taking: Taking | null, keepsPet: boolean | null): void {
  if (taking === null) return;
  if (taking.kind === "dish") {
    if (!isDish(taking.dish)) throw new Error(`${taking.dish} is no dish`);
    giveDish(people.hearth, taking.dish);
  }
  if (taking.kind === "brew") giveBrew(people.hearth, taking.brew);
  if (taking.kind === "forage") takeIngredients(people.foraging, taking.foods.flatMap(([food, n]) => Array.from({ length: n }, () => food)));
  if (taking.kind === "pet" && keepsPet === false) {
    const pet = live.person.pet;
    if (!pet) throw new Error(`${live.person.id} has no lost animal to go home`);
    partWith(people.companionship, pet.id);
  }
}

function open(people: People, live: PersonLive): void {
  const tone = (memoryOf(people).known[live.person.id] as FolkMemory["known"][string] | undefined)?.tone ?? null;
  const opened = openTalk(memoryOf(people), speakerOf(live.person), havingFor(people, live.person));
  hand(people, live, opened.taking, opened.keepsPet);
  saveFolk(opened.memory);
  if (storyOf(live.person.story).kind === "mystery") people.cases?.heard(live.person.id, live.person.story, opened.testimony);
  const conversation = beginConversation(live.person.id, opened.talk);
  people.shown = { ...people.shown, memory: opened.memory };
  const pages = pagesOf(storyOf(live.person.story), opened.talk, tone);
  people.opened++;
  show(people, {
    offer: null,
    journal: false,
    talking: {
      id: live.person.id,
      name: live.name,
      look: live.look,
      talk: opened.talk,
      greeted: tone,
      conversation,
      ...spokenOf(people, live, conversation, pages),
      given: givenOf(people, live, opened.taking, opened.keepsPet),
      asking: askingOf(live.person, opened.talk),
      gifts: giftsOf(storyOf(live.person.story), opened.talk),
      noted: opened.testimony.length,
      opened: people.opened,
    },
  });
}

/** Starts talking with a live person. */
export function talkWith(people: People, id: string): void {
  const live = people.live.get(id);
  if (!live) throw new Error(`No one live called ${id} to talk with`);
  if (people.shown.talking) return;
  open(people, live);
}

function talkingNow(people: People): { talking: Talking; live: PersonLive; pages: readonly Page[] } {
  const talking = people.shown.talking;
  if (!talking) throw new Error("No one is being talked with");
  const live = people.live.get(talking.id);
  if (!live) throw new Error(`${talking.id} is no longer here`);
  return { talking, live, pages: pagesOf(storyOf(live.person.story), talking.talk, talking.greeted) };
}

function moveTo(people: People, talking: Talking, live: PersonLive, conversation: Conversation, pages: readonly Page[]): void {
  show(people, { talking: { ...talking, conversation, ...spokenOf(people, live, conversation, pages) } });
}

/** Elliott answers in a tone; the person replies, and remembers it. */
export function chooseTone(people: People, tone: Tone): void {
  const { talking, live, pages } = talkingNow(people);
  const conversation = choose(talking.conversation, pages, tone);
  remember(people, rememberTone(memoryOf(people), talking.id, tone));
  moveTo(people, talking, live, conversation, pages);
}

/** On to the next page; past the last, the talk ends, going straight on to thanks where Elliott already has what was asked. */
export function goOn(people: People): void {
  const { talking, live, pages } = talkingNow(people);
  if (awaitsChoice(talking.conversation, pages)) return;
  const next = nextPage(talking.conversation, pages);
  if (next) {
    moveTo(people, talking, live, next, pages);
    return;
  }
  const following = talkFor(storyOf(live.person.story), memoryOf(people), speakerOf(live.person), havingFor(people, live.person));
  show(people, { talking: null });
  if (followsOn(talking.talk, following)) open(people, live);
}

/** Elliott walks off: whatever the talk did is done already. */
export function leaveTalk(people: People): void {
  if (people.shown.talking) show(people, { talking: null });
}

export function setJournalOpen(people: People, open: boolean): void {
  show(people, { journal: open });
}

/** Sets a keepsake out at camp as if it had been given: for screenshots and tests. */
export function stockKeepsake(people: People, keepsake: Keepsake): void {
  if (people.shown.memory.keepsakes.includes(keepsake)) return;
  const memory = { ...people.shown.memory, keepsakes: [...people.shown.memory.keepsakes, keepsake] };
  saveFolk(memory);
  show(people, { memory });
}

/** Forgets everyone Elliott has met and everything given, here and on the device. */
export function forgetPeople(people: People): void {
  const memory = noAcquaintances();
  saveFolk(memory);
  show(people, { memory, talking: null, offer: null, journal: false });
}
