import { PEOPLE_CELL, peopleInCell, type Person, type Role } from "../../engine/people";
import type { FolkMemory } from "../../gameplay/conversation";
import { TONES, type Tone } from "../../stories/story";
import { chooseTone, forgetPeople, goOn, leaveTalk, liveOf, peopleAround, setJournalOpen, talkWith, type People } from "./people";

/*
 * The people's part of the world's probe (`window.__hearthwoodWorld.people`),
 * for screenshots and tests: who stands near a point, the nearest of a role
 * (searched outward cell by cell), whether someone is drawn, who is offered,
 * a conversation (opening it, the line and choices showing, choosing a tone,
 * going on, walking off), the journal, and what is remembered.
 */

export interface PersonReading {
  id: string;
  role: Role;
  story: string;
  x: number;
  z: number;
  heading: number;
  seat: number | null;
  homes: { kind: string; x: number; z: number; turn: number }[];
  pet: { id: string; species: string; x: number; z: number } | null;
  partner: { id: string; x: number; z: number } | null;
}

export interface PeopleProbe {
  near: (x: number, z: number, radius: number) => PersonReading[];
  /** The nearest person of a role (and a story, if given) to a point, looking out to `cells` cells away. */
  find: (role: Role, x: number, z: number, cells: number, story?: string) => PersonReading | null;
  drawn: (id: string) => boolean;
  offer: () => string | null;
  talk: (id: string) => void;
  talking: () => { id: string; talk: string; page: number; line: string; said: string | null; choices: { tone: Tone; text: string }[] | null; last: boolean; given: string | null; gifts: string[] } | null;
  choose: (tone: Tone) => void;
  next: () => void;
  leave: () => void;
  setJournalOpen: (open: boolean) => void;
  memory: () => FolkMemory;
  forget: () => void;
}

const reading = (p: Person): PersonReading => ({
  id: p.id,
  role: p.role,
  story: p.story,
  x: p.x,
  z: p.z,
  heading: p.heading,
  seat: p.seat,
  homes: p.homes.map((h) => ({ ...h })),
  pet: p.pet && { id: p.pet.id, species: p.pet.species, x: p.pet.home.x, z: p.pet.home.z },
  partner: p.partner && { id: p.partner.id, x: p.partner.x, z: p.partner.z },
});

/** Finds a person by id anywhere the world placed them, by their cell. */
function personById(people: People, id: string): Person {
  const [cx, cz] = id.split("/")[0].split(",").map(Number);
  const person = people.cell(cx, cz).find((p) => p.id === id);
  if (!person) throw new Error(`Nobody called ${id}`);
  return person;
}

export function peopleProbe(people: People): PeopleProbe {
  return {
    near: (x, z, radius) => peopleAround(people, x, z, radius).map(reading),
    find: (role, x, z, cells, story) => {
      const cx0 = Math.floor(x / PEOPLE_CELL);
      const cz0 = Math.floor(z / PEOPLE_CELL);
      const found: { person: Person; d: number }[] = [];
      for (let r = 0; r <= cells; r++) {
        for (let dz = -r; dz <= r; dz++) {
          for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
            for (const person of peopleInCell(people.world, cx0 + dx, cz0 + dz)) {
              if (person.role === role && (story === undefined || person.story === story)) found.push({ person, d: Math.hypot(person.x - x, person.z - z) });
            }
          }
        }
        found.sort((a, b) => a.d - b.d);
        // A ring further out can't hold anyone nearer than the next ring in.
        if (found.length > 0 && found[0].d < r * PEOPLE_CELL) break;
      }
      return found.length > 0 ? reading(found[0].person) : null;
    },
    drawn: (id) => people.isDrawn?.(id) ?? false,
    offer: () => people.shown.offer?.id ?? null,
    talk: (id) => {
      liveOf(people, personById(people, id));
      talkWith(people, id);
    },
    talking: () => {
      const t = people.shown.talking;
      if (!t) return null;
      const given = t.given ? (t.given.kind === "dish" ? t.given.dish : t.given.kind === "forage" ? t.given.foods.map(([f, n]) => `${n} ${f}`).join(", ") : t.given.kind === "pet" ? `${t.given.name}${t.given.home ? " (home)" : ""}` : "note") : null;
      return {
        id: t.id,
        talk: t.talk,
        page: t.conversation.page,
        line: t.line,
        said: t.said?.text ?? null,
        choices: t.choices,
        last: t.last,
        given,
        gifts: t.gifts.map((g) => (g.kind === "hint" ? `hint:${g.recipe}` : g.kind === "keepsake" ? `keepsake:${g.keepsake}` : "companion")),
      };
    },
    choose: (tone) => {
      if (!TONES.includes(tone)) throw new Error(`${tone} is no tone`);
      chooseTone(people, tone);
    },
    next: () => {
      goOn(people);
    },
    leave: () => {
      leaveTalk(people);
    },
    setJournalOpen: (open) => {
      setJournalOpen(people, open);
    },
    memory: () => JSON.parse(JSON.stringify(people.shown.memory)) as FolkMemory,
    forget: () => {
      forgetPeople(people);
    },
  };
}
