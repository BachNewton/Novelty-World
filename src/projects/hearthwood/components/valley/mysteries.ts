import type { PlacedClue } from "../../engine/people";
import type { World } from "../../engine/world";
import type { CaseView } from "../../gameplay/conversation";
import type { Offerable } from "../../gameplay/offering";
import { addClues, clueOf, connect, foundClues, hasInCase, isSolved, loadCasebook, mysteryOf, openCase, saveCasebook, emptyCasebook, type Casebook, type Connection } from "../../gameplay/sleuthing";
import type { FoundClue } from "../../stories/story";
import type { People } from "./people";

/*
 * A walk's mysteries, between the scene, the overlays and the probe: the
 * clues lying round the people who tell mysteries (live while their person
 * is), the clue on offer to examine (by the one rule, after the people and
 * before the animals and forage, which must beat it), a clue being
 * examined, and the casebook: every case, the clues and deductions
 * chosen to connect, and what the last connection came to. The casebook is
 * kept on the device. It tells the people how a person's case stands, so
 * their talk can be chosen by it, and hears the clues a talk tells.
 */

/** A clue in the world round Elliott, live while its person is. */
export interface ClueLive {
  /** Its person's id and the clue's: what the scene and a tap know it by. */
  key: string;
  person: string;
  story: string;
  clue: FoundClue;
  placed: PlacedClue;
  y: number;
}

export interface Examining {
  key: string;
  person: string;
  clue: FoundClue;
  /** How many clues the case holds now, with this one. */
  count: number;
}

/** What the last connection in the casebook came to, for the page to show; `at` counts them, so each shows arriving. */
export interface Verdict {
  person: string;
  connection: Connection;
  solved: boolean;
  at: number;
}

export interface MysteriesShown {
  offer: { key: string; clue: FoundClue } | null;
  examining: Examining | null;
  book: Casebook;
  /** Whether the journal shows the casebook's page rather than the people's. */
  casebook: boolean;
  /** The case the casebook shows, by its person, or null for the latest. */
  chosen: string | null;
  /** The clues and deductions chosen to connect. */
  selected: string[];
  verdict: Verdict | null;
}

export interface Mysteries {
  world: World;
  people: People;
  live: Map<string, ClueLive>;
  /** The clue that would be offered this frame and how strongly, before the animals and forage have their say. */
  candidate: { key: string; score: number } | null;
  /** What a tap on the screen says of the clues, given by the scene, which knows the camera. */
  tapAt: ((x: number, y: number) => string | null) | null;
  shown: MysteriesShown;
  listeners: Set<() => void>;
  connections: number;
}

export function createMysteries(world: World, people: People): Mysteries {
  return {
    world,
    people,
    live: new Map(),
    candidate: null,
    tapAt: null,
    shown: { offer: null, examining: null, book: loadCasebook(), casebook: false, chosen: null, selected: [], verdict: null },
    listeners: new Set(),
    connections: 0,
  };
}

/**
 * Joins the mysteries to the people (who choose a mystery's talk by its case,
 * and tell it clues) while the scene is up; undone after.
 */
export function joinMysteries(mysteries: Mysteries): () => void {
  const { people } = mysteries;
  people.cases = {
    view: (id) => caseView(mysteries, id),
    heard: (id, story, clues) => {
      hear(mysteries, id, story, clues);
    },
  };
  return () => {
    people.cases = null;
  };
}

function show(mysteries: Mysteries, change: Partial<MysteriesShown>): void {
  mysteries.shown = { ...mysteries.shown, ...change };
  for (const listener of mysteries.listeners) listener();
}

export function subscribeMysteries(mysteries: Mysteries, listener: () => void): () => void {
  mysteries.listeners.add(listener);
  return () => {
    mysteries.listeners.delete(listener);
  };
}

function keep(mysteries: Mysteries, book: Casebook, change: Partial<MysteriesShown> = {}): void {
  saveCasebook(book);
  show(mysteries, { ...change, book });
}

/** How a person's case stands, for their talk to be chosen by: undefined where Elliott has none with them. */
function caseView(mysteries: Mysteries, person: string): CaseView | undefined {
  const known = mysteries.shown.book.cases[person] as Casebook["cases"][string] | undefined;
  if (!known) return undefined;
  return { clues: [...known.clues, ...known.deduced], solved: isSolved(known) };
}

/** A talk told Elliott clues: the case opens if it wasn't, and they go into it. */
function hear(mysteries: Mysteries, person: string, story: string, clues: readonly string[]): void {
  const opened = openCase(mysteries.shown.book, person, story);
  const book = addClues(opened, person, clues);
  if (book !== mysteries.shown.book) keep(mysteries, book, { chosen: person });
}

export const clueKey = (person: string, clue: string) => `${person}/${clue}`;

/** Brings to life the clues of the people round Elliott, and lets go of those whose person has gone. */
export function streamClues(mysteries: Mysteries): void {
  const { people, world } = mysteries;
  const wanted = new Set<string>();
  for (const live of people.live.values()) {
    const { person } = live;
    if (person.clues.length === 0) continue;
    const mystery = mysteryOf(person.story);
    for (const placed of person.clues) {
      const key = clueKey(person.id, placed.id);
      wanted.add(key);
      if (mysteries.live.has(key)) continue;
      const clue = foundClues(mystery).find((c) => c.id === placed.id);
      if (!clue) throw new Error(`${person.story} has no clue ${placed.id}`);
      mysteries.live.set(key, { key, person: person.id, story: person.story, clue, placed, y: world.heightAt(placed.x, placed.z) });
    }
  }
  for (const key of mysteries.live.keys()) if (!wanted.has(key)) mysteries.live.delete(key);
}

/** Whether a clue is there to examine: its case open (its mystery told), and the clue not yet in it. */
export function examinable(mysteries: Mysteries, live: ClueLive): boolean {
  const known = mysteries.shown.book.cases[live.person] as Casebook["cases"][string] | undefined;
  return known !== undefined && !known.clues.includes(live.clue.id);
}

/** Where on a clue the eye aims, and how wide it is, for offering it like anything else. */
export function offerableClue(live: ClueLive): Offerable {
  return { heart: { x: live.placed.x, y: live.y + 0.12, z: live.placed.z }, spread: 0.4, reach: { first: 3.4, third: 2.6 } };
}

export function answerClueTaps(mysteries: Mysteries, tapAt: Mysteries["tapAt"]): void {
  mysteries.tapAt = tapAt;
}

/** The clue that would be offered this frame, and how strongly. */
export function weighClue(mysteries: Mysteries, candidate: Mysteries["candidate"]): void {
  mysteries.candidate = candidate;
}

/** After the animals and forage have had their say: whether a clue is offered now. */
export function settleClues(mysteries: Mysteries, othersOffered: boolean): void {
  const busy = othersOffered || mysteries.shown.examining !== null || mysteries.people.shown.talking !== null;
  const live = busy || mysteries.candidate === null ? null : (mysteries.live.get(mysteries.candidate.key) ?? null);
  const offer = live ? { key: live.key, clue: live.clue } : null;
  if (offer?.key === mysteries.shown.offer?.key) return;
  show(mysteries, { offer });
}

/** Elliott looks closely at a clue: it goes into its case, and its card shows what they made of it. */
export function examineClue(mysteries: Mysteries, key: string): void {
  const live = mysteries.live.get(key);
  if (!live) throw new Error(`No clue ${key} round Elliott`);
  if (!examinable(mysteries, live)) return;
  const book = addClues(mysteries.shown.book, live.person, [live.clue.id]);
  keep(mysteries, book, { offer: null, chosen: live.person, examining: { key, person: live.person, clue: live.clue, count: book.cases[live.person].clues.length } });
}

export function closeExamining(mysteries: Mysteries): void {
  if (mysteries.shown.examining) show(mysteries, { examining: null });
}

/** The journal shows the casebook's page, or the people's. */
export function setCasebookPage(mysteries: Mysteries, casebook: boolean): void {
  show(mysteries, { casebook, selected: [], verdict: null });
}

/** The case the casebook shows: the one chosen, or else the one most lately added to. */
export function caseShown(mysteries: Mysteries): string | null {
  const { book, chosen } = mysteries.shown;
  if (chosen !== null && chosen in book.cases) return chosen;
  const people = Object.keys(book.cases);
  return people.length > 0 ? people[people.length - 1] : null;
}

export function chooseCase(mysteries: Mysteries, person: string): void {
  if (!(person in mysteries.shown.book.cases)) throw new Error(`No case with ${person}`);
  show(mysteries, { chosen: person, selected: [], verdict: null });
}

/** Chooses a clue or deduction to connect, or lets it go again. */
export function toggleSelected(mysteries: Mysteries, id: string): void {
  const person = caseShown(mysteries);
  if (person === null) throw new Error("No case to choose from");
  const known = mysteries.shown.book.cases[person];
  if (!hasInCase(known, id)) throw new Error(`${id} isn't in the case with ${person}`);
  const { selected } = mysteries.shown;
  show(mysteries, { selected: selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id], verdict: null });
}

/** Connects what is chosen: a deduction made is kept and the choice cleared; one that doesn't connect yet just says so. */
export function connectSelected(mysteries: Mysteries): void {
  const person = caseShown(mysteries);
  if (person === null) throw new Error("No case to connect in");
  const made = connect(mysteries.shown.book, person, mysteries.shown.selected);
  mysteries.connections++;
  const verdict: Verdict = { person, connection: made.connection, solved: isSolved(made.book.cases[person]), at: mysteries.connections };
  if (made.connection.kind === "deduced") keep(mysteries, made.book, { selected: [], verdict });
  else show(mysteries, { verdict, selected: made.connection.kind === "known" ? [] : mysteries.shown.selected });
}

/** Forgets every case, here and on the device. */
export function forgetMysteries(mysteries: Mysteries): void {
  keep(mysteries, emptyCasebook(), { offer: null, examining: null, chosen: null, selected: [], verdict: null });
}

/** The text of anything in a case, clue or deduction. */
export function caseEntry(story: string, id: string): { kind: "clue" | "deduction"; title: string; note: string } {
  const mystery = mysteryOf(story);
  const deduction = mystery.deductions.find((d) => d.id === id);
  if (deduction) return { kind: "deduction", title: deduction.title, note: deduction.note };
  const clue = clueOf(mystery, id);
  return { kind: "clue", title: clue.title, note: clue.note };
}
