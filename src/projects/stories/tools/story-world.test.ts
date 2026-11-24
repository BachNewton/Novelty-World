import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { world as citizens } from "../citizens-of-the-federation/world";
import type { StoryWorld } from "./story-world";

const STORIES: Record<string, StoryWorld> = { "citizens-of-the-federation": citizens };
const DATE = /^(\d{4}|\d{4}-\d{2}|\d{4}-\d{2}-\d{2})$/;

function chapterTitles(slug: string): string[] {
  const dir = join(import.meta.dirname, "..", slug, "chapters");
  return readdirSync(dir)
    .filter((name) => /^\d+$/.test(name))
    .sort((a, b) => Number(a) - Number(b))
    .map((name) => {
      const heading = readFileSync(join(dir, name, "chapter.md"), "utf8").split(/\r?\n/, 1)[0];
      return heading.replace(/^# Chapter \d+: /, "");
    });
}

describe.each(Object.entries(STORIES))("%s's world", (slug, world) => {
  const person = (id: string) => expect(world.people, `no person "${id}"`).toHaveProperty([id]);
  const place = (id: string) => expect(world.places, `no place "${id}"`).toHaveProperty([id]);

  it("points only at people and places it has", () => {
    for (const event of Object.values(world.events)) {
      event.who?.forEach(person);
      event.where?.forEach(place);
    }
    for (const tie of world.ties) [tie.who, tie.of].forEach(person);
    for (const chapter of world.chapters) chapter.where.forEach(place);
  });

  it("writes every date as YYYY, YYYY-MM or YYYY-MM-DD, and ends nothing before it starts", () => {
    const spans = [
      ...Object.values(world.events).map((e) => [e.date, e.end ?? e.date]),
      ...Object.values(world.people).map((p) => [p.born ?? p.died, p.died ?? p.born]),
      ...world.chapters.map((c) => [c.from, c.to]),
    ];
    for (const [from, to] of spans) {
      if (from === undefined || to === undefined) continue;
      expect(from).toMatch(DATE);
      expect(to).toMatch(DATE);
      expect(to >= from, `${from} to ${to}`).toBe(true);
    }
  });

  it("lists the chapters the book has, in order", () => {
    expect(world.chapters.map((c) => c.title)).toEqual(chapterTitles(slug));
  });
});
