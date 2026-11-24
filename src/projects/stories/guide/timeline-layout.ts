import type { Kind, StoryDate, StoryWorld } from "../tools/story-world";

/** What a mark on the timeline is: one of the world's events, a chapter, or a life's start or end. */
export type Mark =
  | { type: "event"; id: string; kind: Kind }
  | { type: "chapter"; index: number }
  | { type: "born"; person: string }
  | { type: "died"; person: string };

export interface TimelineItem {
  key: string;
  mark: Mark;
  /** The world on the left; the people and chapters on the right. */
  side: "world" | "people";
  label: string;
  dateText: string;
  /** Fractional years. A point has `end` equal to `start`. */
  start: number;
  end: number;
  /** Lower ranks keep their label first when space is short. */
  rank: number;
  /** Ids of the people it belongs to, for following a life. */
  people: string[];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A date as a point in fractional years; a date known only to the year or month sits in its middle. */
export function yearOf(date: StoryDate): number {
  const year = Number(date.slice(0, 4));
  if (date.length === 4) return year + 0.5;
  const month = Number(date.slice(5, 7)) - 1;
  if (date.length === 7) return year + (month + 0.5) / 12;
  const day = Number(date.slice(8, 10)) - 1;
  return year + (month * 30.44 + day) / 365.25;
}

export function formatDate(date: StoryDate): string {
  if (date.length === 4) return date;
  const month = MONTHS[Number(date.slice(5, 7)) - 1];
  if (date.length === 7) return `${month} ${date.slice(0, 4)}`;
  return `${Number(date.slice(8, 10))} ${month} ${date.slice(0, 4)}`;
}

export function formatRange(from: StoryDate, to: StoryDate): string {
  if (from === to) return formatDate(from);
  const [fromYear, toYear] = [from.slice(0, 4), to.slice(0, 4)];
  if (from.length === 4 || to.length === 4) return `${fromYear}–${toYear}`;
  const [fromMonth, toMonth] = [MONTHS[Number(from.slice(5, 7)) - 1], MONTHS[Number(to.slice(5, 7)) - 1]];
  if (fromYear !== toYear) return `${fromMonth} ${fromYear} – ${toMonth} ${toYear}`;
  return fromMonth === toMonth ? `${fromMonth} ${fromYear}` : `${fromMonth}–${toMonth} ${fromYear}`;
}

/** Where an event's text says where a fact came from, which is the writer's reasoning, not the story. */
const PROVENANCE = /\s*\((?:[^()]*\b(?:real|canon|canon's|book's)\b[^()]*)\)/g;

export function settled(text: string): string {
  return text.replace(PROVENANCE, "");
}

const RANK = { chapter: 0, canon: 1, died: 1, story: 2, born: 2, real: 3 } as const;

export function timelineItems(world: StoryWorld): TimelineItem[] {
  const items: TimelineItem[] = [];
  for (const [id, event] of Object.entries(world.events)) {
    if (event.label === undefined) continue;
    const start = yearOf(event.date);
    items.push({
      key: `event:${id}`,
      mark: { type: "event", id, kind: event.kind },
      side: "world",
      label: event.label,
      dateText: event.end === undefined ? formatDate(event.date) : `${event.date.slice(0, 4)}–${event.end.slice(0, 4)}`,
      start,
      end: event.end === undefined ? start : yearOf(event.end),
      rank: RANK[event.kind],
      people: event.who ?? [],
    });
  }
  world.chapters.forEach((chapter, index) => {
    items.push({
      key: `chapter:${index}`,
      mark: { type: "chapter", index },
      side: "people",
      label: chapter.title,
      dateText: `${formatRange(chapter.from, chapter.to)} · ${chapter.where.map((p) => world.places[p].name).join(", ")}`,
      start: yearOf(chapter.from),
      end: yearOf(chapter.to),
      rank: RANK.chapter,
      people: [],
    });
  });
  for (const [id, person] of Object.entries(world.people)) {
    const born = person.born;
    if (born !== undefined) {
      items.push({ key: `born:${id}`, mark: { type: "born", person: id }, side: "people", label: `${person.name} born`, dateText: formatDate(born), start: yearOf(born), end: yearOf(born), rank: RANK.born, people: [id] });
    }
    const died = person.died;
    if (died !== undefined) {
      const age = born === undefined ? "" : `, aged ${Math.floor(yearOf(died) - yearOf(born))}`;
      items.push({ key: `died:${id}`, mark: { type: "died", person: id }, side: "people", label: `${person.name} dies${age}`, dateText: formatDate(died), start: yearOf(died), end: yearOf(died), rank: RANK.died, people: [id] });
    }
  }
  return items;
}

export interface LabelBox {
  key: string;
  /** Where the label wants to sit: the pixel its date or span points at. */
  want: number;
  height: number;
  rank: number;
}

/**
 * Places labels on one side without overlapping, in date order, each within `reach` pixels (or
 * twice its own height) of where it points. Higher-ranked labels claim space first; a label with no room gets no place
 * and waits for the reader to zoom in.
 */
export function placeLabels(boxes: LabelBox[], gap: number, reach: number): Map<string, number> {
  const placed: { top: number; height: number; want: number }[] = [];
  const tops = new Map<string, number>();
  const order = [...boxes].sort((a, b) => a.rank - b.rank || a.want - b.want);
  for (const box of order) {
    const ideal = box.want - Math.min(box.height / 2, 16);
    // A label may always move twice its own height, so labels dated close together can stack.
    const limit = Math.max(reach, 2 * box.height + gap);
    const candidates = [ideal];
    for (const p of placed) candidates.push(p.top + p.height + gap, p.top - gap - box.height);
    const top = candidates
      .filter((c) => c >= 0 && Math.abs(c - ideal) <= limit)
      .sort((a, b) => Math.abs(a - ideal) - Math.abs(b - ideal))
      .find((c) =>
        placed.every((p) => {
          const clear = c + box.height + gap <= p.top || c >= p.top + p.height + gap;
          const inOrder = p.want <= box.want ? p.top <= c : p.top >= c;
          return clear && inOrder;
        }),
      );
    if (top === undefined) continue;
    placed.push({ top, height: box.height, want: box.want });
    tops.set(box.key, top);
  }
  return tops;
}
