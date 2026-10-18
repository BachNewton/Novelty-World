import type { Casebook } from "../../gameplay/sleuthing";
import { caseShown, chooseCase, closeExamining, connectSelected, examinable, examineClue, forgetMysteries, setCasebookPage, streamClues, toggleSelected, type Mysteries } from "./mysteries";
import { setJournalOpen } from "./people";
import { companionByClue, helping, type CompanionClues } from "./companion-clues";

/*
 * The mysteries' part of the world's probe (`window.__hearthwoodWorld.mysteries`),
 * for screenshots and tests: the clues live round Elliott, the clue offered,
 * examining one and putting it down, the casebook (open on its page, the
 * case shown, choosing what to connect, connecting, and what it came to),
 * forgetting every case, and the companions helping: who is off to a clue.
 */

export interface ClueReading {
  key: string;
  person: string;
  id: string;
  mark: string;
  x: number;
  y: number;
  z: number;
  examinable: boolean;
}

export interface MysteriesProbe {
  /** The clues live round Elliott, of one person if given. */
  clues: (person?: string) => ClueReading[];
  offer: () => string | null;
  examine: (key: string) => void;
  examining: () => { key: string; title: string; note: string; count: number } | null;
  close: () => void;
  casebook: () => Casebook;
  /** Opens or closes the journal on the casebook's page. */
  setCasebookOpen: (open: boolean) => void;
  shownCase: () => string | null;
  chooseCase: (person: string) => void;
  /** Chooses exactly these to connect, letting go of anything chosen before. */
  select: (ids: string[]) => void;
  selected: () => string[];
  connect: () => { kind: string; deduction: string | null; solved: boolean } | null;
  forget: () => void;
  /** Each companion off to a clue (going there, or by it), and whether one waits by a clue, its glints brightened. */
  helping: () => { animal: string; clue: string; phase: "going" | "by" }[];
  companionBy: (key: string) => boolean;
}

export function mysteriesProbe(mysteries: Mysteries, companionClues: CompanionClues): MysteriesProbe {
  const verdict = () => {
    const v = mysteries.shown.verdict;
    if (!v) return null;
    return { kind: v.connection.kind, deduction: v.connection.kind === "not-yet" ? null : v.connection.deduction.id, solved: v.solved };
  };
  return {
    clues: (person) => {
      streamClues(mysteries);
      return [...mysteries.live.values()]
        .filter((l) => person === undefined || l.person === person)
        .map((l) => ({ key: l.key, person: l.person, id: l.clue.id, mark: l.clue.mark, x: l.placed.x, y: l.y, z: l.placed.z, examinable: examinable(mysteries, l) }));
    },
    offer: () => mysteries.shown.offer?.key ?? null,
    examine: (key) => {
      streamClues(mysteries);
      examineClue(mysteries, key);
    },
    examining: () => {
      const e = mysteries.shown.examining;
      return e && { key: e.key, title: e.clue.title, note: e.clue.note, count: e.count };
    },
    close: () => {
      closeExamining(mysteries);
    },
    casebook: () => JSON.parse(JSON.stringify(mysteries.shown.book)) as Casebook,
    setCasebookOpen: (open) => {
      setCasebookPage(mysteries, open);
      setJournalOpen(mysteries.people, open);
    },
    shownCase: () => caseShown(mysteries),
    chooseCase: (person) => {
      chooseCase(mysteries, person);
    },
    select: (ids) => {
      for (const id of mysteries.shown.selected) toggleSelected(mysteries, id);
      for (const id of ids) toggleSelected(mysteries, id);
    },
    selected: () => [...mysteries.shown.selected],
    connect: () => {
      connectSelected(mysteries);
      return verdict();
    },
    forget: () => {
      forgetMysteries(mysteries);
    },
    helping: () => helping(companionClues),
    companionBy: (key) => companionByClue(companionClues, key),
  };
}
