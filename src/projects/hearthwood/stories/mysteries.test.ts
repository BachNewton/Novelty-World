import { describe, expect, it } from "vitest";
import { PEOPLE_CELL, peopleInCell, type Person } from "../engine/people";
import { createWorld } from "../engine/world";
import { emptyBasket } from "../gameplay/basket";
import { noAcquaintances, openTalk, talkFor, type Having, type Speaker } from "../gameplay/conversation";
import { emptyLarder } from "../gameplay/cooking";
import { addClues, connect, emptyCasebook, foundClues, isSolved, openCase, parseCasebook, serializeCasebook, type Casebook } from "../gameplay/sleuthing";
import { canStand } from "../gameplay/walking";
import { STORIES } from "./library";
import type { MysteryStory } from "./story";

/*
 * Every mystery held to being solvable from its clues alone: every clue is
 * either found in the world (and the world places it) or told by a talk
 * Elliott can reach, every deduction is drawn from clues and deductions
 * that come before it, the solution follows from everything there is to
 * find, and nothing is a dead end. Then each is played through the rules,
 * and found in a world with every clue lying where it should.
 */

const MYSTERIES = STORIES.filter((s): s is MysteryStory => s.kind === "mystery");

/** Everything a case can hold once every clue is found and every talk heard. */
function everything(story: MysteryStory): Set<string> {
  const { mystery, meet, hunch } = story;
  const known = new Set<string>([...(meet.testimony ?? []), ...foundClues(mystery).map((c) => c.id)]);
  if (known.has(hunch.after)) for (const c of hunch.talk.testimony ?? []) known.add(c);
  for (let grew = true; grew; ) {
    grew = false;
    for (const d of mystery.deductions) {
      if (!known.has(d.id) && d.from.every((id) => known.has(id))) {
        known.add(d.id);
        grew = true;
      }
    }
  }
  return known;
}

describe("the mysteries", () => {
  it("are a few, each with clues found and said, and deductions joining them", () => {
    expect(MYSTERIES.length).toBeGreaterThanOrEqual(2);
    for (const { mystery } of MYSTERIES) {
      const ids = [...mystery.clues.map((c) => c.id), ...mystery.deductions.map((d) => d.id)];
      expect(new Set(ids).size).toBe(ids.length);
      expect(foundClues(mystery).length).toBeGreaterThanOrEqual(3);
      expect(mystery.clues.some((c) => c.kind === "said")).toBe(true);
      expect(mystery.deductions.map((d) => d.id)).toContain(mystery.solution);
    }
  });

  it("draw each deduction from two or more clues or earlier deductions, no two from the same ones", () => {
    for (const { id, mystery } of MYSTERIES) {
      const before = new Set(mystery.clues.map((c) => c.id));
      const sets = new Set<string>();
      for (const d of mystery.deductions) {
        expect(d.from.length, `${id}/${d.id}`).toBeGreaterThanOrEqual(2);
        expect(new Set(d.from).size).toBe(d.from.length);
        for (const input of d.from) expect(before.has(input), `${id}/${d.id} draws on ${input}`).toBe(true);
        const key = [...d.from].sort().join("+");
        expect(sets.has(key), `${id}/${d.id}`).toBe(false);
        sets.add(key);
        before.add(d.id);
      }
    }
  });

  it("tell every spoken clue in exactly one talk Elliott can reach, the hunch following on from a clue found", () => {
    for (const story of MYSTERIES) {
      const { mystery, meet, hunch } = story;
      expect(foundClues(mystery).map((c) => c.id)).toContain(hunch.after);
      expect((meet.testimony ?? []).length).toBeGreaterThan(0);
      expect((hunch.talk.testimony ?? []).length).toBeGreaterThan(0);
      const told = [...(meet.testimony ?? []), ...(hunch.talk.testimony ?? [])];
      expect(new Set(told).size).toBe(told.length);
      expect(told.sort()).toEqual(mystery.clues.filter((c) => c.kind === "said").map((c) => c.id).sort());
      for (const talk of [story.waiting, story.reveal, story.friend]) expect("testimony" in talk).toBe(false);
    }
  });

  it("can be solved from its clues alone, and every clue and deduction counts towards it", () => {
    for (const story of MYSTERIES) {
      const { mystery } = story;
      expect(everything(story).has(mystery.solution), story.id).toBe(true);
      const used = new Set(mystery.deductions.flatMap((d) => d.from));
      for (const c of mystery.clues) expect(used.has(c.id), `${story.id}: ${c.id} leads nowhere`).toBe(true);
      for (const d of mystery.deductions) if (d.id !== mystery.solution) expect(used.has(d.id), `${story.id}: ${d.id} leads nowhere`).toBe(true);
      expect(used.has(mystery.solution)).toBe(false);
    }
  });

  it("place their clues a few steps from the person or a home their role keeps", () => {
    const homesOf: Record<string, readonly string[]> = { beekeeper: ["hives"], cottager: ["cottage"], fisher: ["boat"] };
    for (const story of MYSTERIES) {
      for (const clue of foundClues(story.mystery)) {
        expect(clue.at.near).toBeGreaterThan(0);
        expect(clue.at.far).toBeGreaterThan(clue.at.near);
        expect(clue.at.far).toBeLessThanOrEqual(25);
        if (clue.at.from !== "person") for (const role of story.roles) expect(homesOf[role]).toContain(clue.at.from);
      }
    }
  });
});

const nothing: Having = { basket: emptyBasket(), larder: emptyLarder(), petHere: false };

describe("a mystery played through", () => {
  for (const story of MYSTERIES) {
    it(`${story.id}: told, its clues gathered, a wrong pairing refused, deduced step by step, revealed, then a friend`, () => {
      const speaker: Speaker = { id: "3,4/0", role: story.roles[0], seed: "seed/3,4/0", story: story.id, partner: null };
      let memory = noAcquaintances();
      let book: Casebook = openCase(emptyCasebook(), speaker.id, story.id);
      const view = () => ({ clues: [...book.cases[speaker.id].clues, ...book.cases[speaker.id].deduced], solved: isSolved(book.cases[speaker.id]) });
      const talk = () => talkFor(story, memory, speaker, { ...nothing, case: view() });

      const met = openTalk(memory, speaker, { ...nothing, case: view() });
      expect(met.talk).toBe("meet");
      memory = met.memory;
      book = addClues(book, speaker.id, met.testimony);
      expect(talk()).toBe("waiting");

      for (const clue of foundClues(story.mystery)) book = addClues(book, speaker.id, [clue.id]);
      expect(talk()).toBe("hunch");
      const hunch = openTalk(memory, speaker, { ...nothing, case: view() });
      memory = hunch.memory;
      book = addClues(book, speaker.id, hunch.testimony);
      expect(talk()).toBe("waiting");

      const [first, second] = book.cases[speaker.id].clues;
      const pairing = [first, second];
      const real = story.mystery.deductions.some((d) => d.from.length === 2 && d.from.every((id) => pairing.includes(id)));
      if (!real) expect(connect(book, speaker.id, pairing).connection.kind).toBe("not-yet");

      for (const d of story.mystery.deductions) {
        expect(isSolved(book.cases[speaker.id])).toBe(false);
        const made = connect(book, speaker.id, [...d.from].reverse());
        expect(made.connection.kind).toBe("deduced");
        book = made.book;
        expect(connect(book, speaker.id, d.from).connection.kind).toBe("known");
      }
      expect(isSolved(book.cases[speaker.id])).toBe(true);
      expect(talk()).toBe("reveal");
      const reveal = openTalk(memory, speaker, { ...nothing, case: view() });
      memory = reveal.memory;
      expect(memory.known[speaker.id].help).toBe("given");
      expect(memory.known[speaker.id].received.length).toBeGreaterThan(0);
      expect(talk()).toBe("friend");
      expect(parseCasebook(serializeCasebook(book))).toEqual(book);
    });
  }
});

describe("mysteries in the world", () => {
  it("are told by people near enough to camp to meet, every clue lying on ground Elliott can stand on, by its person or their home", () => {
    // A world whose camp has all of them within a walk: fishers stand only by open water, which some camps have far off.
    const world = createWorld("elliott");
    const camp = { cx: Math.floor(world.camp.x / PEOPLE_CELL), cz: Math.floor(world.camp.z / PEOPLE_CELL) };
    const tellers = new Map<string, Person>();
    for (let r = 0; r <= 6 && tellers.size < MYSTERIES.length; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          for (const person of peopleInCell(world, camp.cx + dx, camp.cz + dz)) {
            if (MYSTERIES.some((m) => m.id === person.story) && !tellers.has(person.story)) tellers.set(person.story, person);
          }
        }
      }
    }
    expect([...tellers.keys()].sort()).toEqual(MYSTERIES.map((m) => m.id).sort());
    for (const story of MYSTERIES) {
      const person = tellers.get(story.id);
      if (!person) throw new Error(`Nobody tells ${story.id}`);
      expect(person.clues.map((c) => c.id).sort()).toEqual(foundClues(story.mystery).map((c) => c.id).sort());
      for (const placed of person.clues) {
        const clue = foundClues(story.mystery).find((c) => c.id === placed.id);
        if (!clue) throw new Error(`${placed.id} isn't one of ${story.id}'s clues`);
        const anchor = clue.at.from === "person" ? person : person.homes.find((h) => h.kind === clue.at.from);
        if (!anchor) throw new Error(`${story.id}'s ${placed.id} lies by a ${clue.at.from} its person hasn't`);
        const d = Math.hypot(placed.x - anchor.x, placed.z - anchor.z);
        expect(d).toBeGreaterThanOrEqual(clue.at.near - 1e-9);
        expect(d).toBeLessThanOrEqual(clue.at.far + 1e-9);
        expect(canStand(world, placed.x, placed.z), `${story.id}/${placed.id}`).toBe(true);
      }
    }
  });
});
