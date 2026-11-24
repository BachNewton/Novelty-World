/**
 * The shape of a story's world (`<slug>/world.ts`): its places, people, the ties between them,
 * its chapters and every dated event it rests on. The date tool computes from it, and anything
 * that draws the story (a timeline, a map, a family tree) reads it.
 */

/** A date, partial when that is all the story knows: YYYY, YYYY-MM or YYYY-MM-DD. */
export type StoryDate = string;

/** The canon a story borrows from: a series, or a film. */
export type CanonWork =
  | "The Original Series"
  | "The Animated Series"
  | "The Next Generation"
  | "Deep Space Nine"
  | "Voyager"
  | "Enterprise"
  | "Discovery"
  | "Picard"
  | "Lower Decks"
  | "Prodigy"
  | "Strange New Worlds"
  | "Film";

/**
 * How directly canon says a thing, which is how much it binds: `stated` in dialogue, `shown`
 * happening on screen, `background` in a prop, display or set detail, or `implied` and never
 * said or seen.
 */
export type CanonHow = "stated" | "shown" | "background" | "implied";

/** Where canon says it. The year it aired is its era: what its writers feared or hoped then. */
export interface Source {
  work: CanonWork;
  /** The episode, or the film. */
  title: string;
  aired: number;
  how: CanonHow;
  /** The words, or what is seen, where it matters. */
  note?: string;
}

/**
 * A canon event the story doesn't take literally, because canon contradicts itself, the real
 * world, or what the story needs: what canon says, what the story makes of it, and why that
 * reading is the one that contradicts least.
 */
export interface Reading {
  canon: string;
  ours: string;
  why: string;
}

/**
 * Where something comes from: our real world, canon, or the story's own invention. When the
 * source says a thing happens it is real or canon, however much the story adds; `filled` says
 * what the story supplied where its source is silent. Canon always names its sources. An event
 * that puts the story's people inside a real or canon one keeps that event's kind; its `who`
 * says they were there.
 */
export type Origin =
  | { kind: "story" }
  | { kind: "real"; filled?: string }
  | { kind: "canon"; sources: [Source, ...Source[]]; filled?: string };

export type Kind = Origin["kind"];

export type Person = Origin & {
  name: string;
  born?: StoryDate;
  died?: StoryDate;
  /** Who they are, in a line. */
  role: string;
  /** What stays true of them: work, origin, where they live. What happens to them is in the events. */
  facts?: string[];
};

/** Read as "`who` is the `is` of `of`": Anna is the daughter of Walt. */
export interface Tie {
  who: string;
  is: string;
  of: string;
}

/** The book's chapters in order; the first is chapter 1. */
export interface Chapter {
  title: string;
  from: StoryDate;
  to: StoryDate;
  /** Place ids. */
  where: string[];
}

export type StoryEvent = (Exclude<Origin, { kind: "canon" }> | (Extract<Origin, { kind: "canon" }> & { reading?: Reading })) & {
  date: StoryDate;
  /** Set for something that lasts, such as a war. */
  end?: StoryDate;
  /** A few words for a chart, on the events worth one. */
  label?: string;
  what: string;
  /** Person ids. */
  who?: string[];
  /** Place ids. */
  where?: string[];
};

export interface StoryWorld {
  places: Record<string, Place>;
  people: Record<string, Person>;
  ties: Tie[];
  chapters: Chapter[];
  events: Record<string, StoryEvent>;
}

export interface Place {
  name: string;
  /** Its IANA time zone, for the clock arithmetic. */
  zone: string;
  lat: number;
  lon: number;
  about: string;
}
