import { storyOf } from "../stories/library";
import type { Clue, Deduction, FoundClue, Mystery, MysteryStory } from "../stories/story";

/*
 * Solving mysteries, as rules: the casebook, one case for each mystery
 * Elliott has been told, holding the clues they have (found in the world
 * and examined, or heard from someone) and the deductions they have made.
 * A deduction is made by connecting exactly the clues and deductions it is
 * drawn from, all of them already in the case: checked as it is made, so a
 * connection that isn't one is simply not accepted, never punished. The
 * case is solved once its solution's deduction is made. Kept on the device
 * under a key of its own, which names the shape it is kept in; a case is
 * kept under its person's id, which holds only as long as the people's
 * placement does, so a change to that starts a new key too.
 */

export interface Case {
  /** The mystery's story, by id. */
  story: string;
  /** The clues Elliott has, in the order they came: found and examined, or heard. */
  clues: string[];
  /** The deductions made, in the order made. */
  deduced: string[];
}

export interface Casebook {
  /** Each case by the id of the person who told it. */
  cases: Record<string, Case>;
}

export const MYSTERIES_KEY = "hearthwood/mysteries/v2";

export function emptyCasebook(): Casebook {
  return { cases: {} };
}

export function mysteryStory(story: string): MysteryStory {
  const found = storyOf(story);
  if (found.kind !== "mystery") throw new Error(`${story} is no mystery`);
  return found;
}

export const mysteryOf = (story: string): Mystery => mysteryStory(story).mystery;

export function clueOf(mystery: Mystery, id: string): Clue {
  const clue = mystery.clues.find((c) => c.id === id);
  if (!clue) throw new Error(`No clue ${id}`);
  return clue;
}

export function deductionOf(mystery: Mystery, id: string): Deduction {
  const deduction = mystery.deductions.find((d) => d.id === id);
  if (!deduction) throw new Error(`No deduction ${id}`);
  return deduction;
}

/** The case's mystery, opened if it isn't yet: told by a person, it starts with nothing in it. */
export function openCase(book: Casebook, person: string, story: string): Casebook {
  if (person in book.cases) return book;
  mysteryStory(story);
  return { cases: { ...book.cases, [person]: { story, clues: [], deduced: [] } } };
}

/** Clues come into a case: found and examined, or heard. Those it already has are left as they are. */
export function addClues(book: Casebook, person: string, clues: readonly string[]): Casebook {
  const known = book.cases[person] as Case | undefined;
  if (!known) throw new Error(`No case opened with ${person}`);
  const mystery = mysteryOf(known.story);
  for (const id of clues) clueOf(mystery, id);
  const fresh = clues.filter((id) => !known.clues.includes(id));
  if (fresh.length === 0) return book;
  return { cases: { ...book.cases, [person]: { ...known, clues: [...known.clues, ...fresh] } } };
}

/** Whether a case has a clue or a deduction. */
export const hasInCase = (known: Case, id: string) => known.clues.includes(id) || known.deduced.includes(id);

export const isSolved = (known: Case) => known.deduced.includes(mysteryOf(known.story).solution);

/** What connecting some clues and deductions comes to: a new deduction, one made already, or nothing yet. */
export type Connection = { kind: "deduced"; deduction: Deduction } | { kind: "known"; deduction: Deduction } | { kind: "not-yet" };

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((id) => b.includes(id));

/** Connects exactly these clues and deductions: the deduction drawn from them, if there is one. */
export function connect(book: Casebook, person: string, ids: readonly string[]): { book: Casebook; connection: Connection } {
  const known = book.cases[person] as Case | undefined;
  if (!known) throw new Error(`No case opened with ${person}`);
  if (new Set(ids).size !== ids.length || ids.length < 2) return { book, connection: { kind: "not-yet" } };
  for (const id of ids) if (!hasInCase(known, id)) throw new Error(`${id} isn't in the case with ${person}`);
  const deduction = mysteryOf(known.story).deductions.find((d) => sameSet(d.from, ids));
  if (!deduction) return { book, connection: { kind: "not-yet" } };
  if (known.deduced.includes(deduction.id)) return { book, connection: { kind: "known", deduction } };
  return { book: { cases: { ...book.cases, [person]: { ...known, deduced: [...known.deduced, deduction.id] } } }, connection: { kind: "deduced", deduction } };
}

/** The clues of a mystery that lie in the world. */
export const foundClues = (mystery: Mystery): FoundClue[] => mystery.clues.filter((c): c is FoundClue => c.kind === "found");

export function serializeCasebook(book: Casebook): string {
  return JSON.stringify(book);
}

/** A kept casebook read back. Anything but the shape this key holds is a bug in what wrote it, and says so. */
export function parseCasebook(text: string): Casebook {
  const data = JSON.parse(text) as Record<string, unknown>;
  const { cases } = data;
  if (typeof cases !== "object" || cases === null) throw new Error(`The kept casebook under ${MYSTERIES_KEY} isn't one: ${text}`);
  const out = emptyCasebook();
  for (const [person, c] of Object.entries(cases)) {
    const { story, clues, deduced } = (c ?? {}) as Record<string, unknown>;
    if (typeof story !== "string" || !Array.isArray(clues) || !Array.isArray(deduced)) throw new Error(`A kept case isn't one: ${JSON.stringify(c)}`);
    const mystery = mysteryOf(story);
    for (const id of clues as unknown[]) if (typeof id !== "string" || !mystery.clues.some((k) => k.id === id)) throw new Error(`A kept clue isn't one of ${story}'s: ${String(id)}`);
    for (const id of deduced as unknown[]) if (typeof id !== "string" || !mystery.deductions.some((d) => d.id === id)) throw new Error(`A kept deduction isn't one of ${story}'s: ${String(id)}`);
    out.cases[person] = { story, clues: clues as string[], deduced: deduced as string[] };
  }
  return out;
}

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** What was kept on this device, or an empty casebook where nothing was (or the device keeps nothing). */
export function loadCasebook(): Casebook {
  let text: string | null = null;
  try {
    text = storage()?.getItem(MYSTERIES_KEY) ?? null;
  } catch {
    // Storage that throws on reading keeps nothing: the walk goes on unsaved.
    return emptyCasebook();
  }
  return text === null ? emptyCasebook() : parseCasebook(text);
}

export function saveCasebook(book: Casebook): void {
  try {
    storage()?.setItem(MYSTERIES_KEY, serializeCasebook(book));
  } catch {
    // A full or refused storage keeps nothing; the casebook still holds for this visit.
  }
}
