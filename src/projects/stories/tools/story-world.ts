/**
 * The shape of a story's world (`<slug>/world.ts`): its places, people, the ties between them,
 * its chapters and every dated event it rests on. The date tool computes from it, and anything
 * that draws the story (a timeline, a map, a family tree) reads it.
 */

/**
 * Where something comes from: our real world, Star Trek's (or another universe's) canon, or the
 * story's own invention. An event that puts the story's people inside a real or canon one keeps
 * that event's kind; its `who` says they were there.
 */
export type Kind = "real" | "canon" | "story";

/** A date, partial when that is all the story knows: YYYY, YYYY-MM or YYYY-MM-DD. */
export type StoryDate = string;

export interface Place {
  name: string;
  /** Its IANA time zone, for the clock arithmetic. */
  zone: string;
  lat: number;
  lon: number;
  about: string;
}

export interface Person {
  name: string;
  kind: Kind;
  born?: StoryDate;
  died?: StoryDate;
  /** Who they are, in a line. */
  role: string;
  /** What stays true of them: work, origin, where they live. What happens to them is in the events. */
  facts?: string[];
}

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

export interface StoryEvent {
  date: StoryDate;
  /** Set for something that lasts, such as a war. */
  end?: StoryDate;
  kind: Kind;
  /** A few words for a chart, on the events worth one. */
  label?: string;
  what: string;
  /** Person ids. */
  who?: string[];
  /** Place ids. */
  where?: string[];
}

export interface StoryWorld {
  places: Record<string, Place>;
  people: Record<string, Person>;
  ties: Tie[];
  chapters: Chapter[];
  events: Record<string, StoryEvent>;
}
