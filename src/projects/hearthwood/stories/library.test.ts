import { describe, expect, it } from "vitest";
import { GROUND_ROLES, PLACE_PEOPLE, ROLES, type Role } from "../engine/people";
import { FOLK_NAME_LENGTH } from "../gameplay/folk";
import { answerable } from "../gameplay/help";
import { NAMES } from "../gameplay/names";
import { RECIPES } from "../gameplay/recipes";
import { BREWS } from "../gameplay/brews";
import { FIRST_STORY, STORIES, storyOf } from "./library";
import { KEEPSAKES, talksOf, TONES, type Page, type Story } from "./story";

/*
 * The library held to what the game can do: every request can be answered
 * by systems the game already has, every talk can be reached and fits the
 * storybook panel, every choice is one of each tone, and every brace in a
 * text is one the world can fill for that story.
 */

/** How long a line may be once filled, in characters: what the panel shows without scrolling on the phone. */
const LONGEST = { say: 160, lead: 120, choice: 36, reply: 120, greet: 110 } as const;

/** The longest each brace can come out, so a filled text is measured at its worst. */
const longest = {
  name: FOLK_NAME_LENGTH,
  pet: Math.max(...[...NAMES.cat, ...NAMES.dog].map((n) => n.length)),
  way: "the north-west".length,
  partner: FOLK_NAME_LENGTH,
  dish: Math.max(...RECIPES.map((r) => r.name.length)),
  gave: Math.max(...RECIPES.map((r) => r.name.length), ...BREWS.map((b) => b.name.length), "stewed funnel chanterelles".length, "simple funnel chanterelle salve".length),
};
const filledLength = (text: string) => text.replace(/\{(\w+)\}/g, (_, key: string) => "x".repeat(longest[key as keyof typeof longest])).length;

/** The braces a story's texts may use, by what it holds. */
function bracesFor(story: Story, talk: string): Set<string> {
  const allowed = new Set(["name"]);
  if (story.kind === "receive") ["partner", "way"].forEach((b) => allowed.add(b));
  if (story.kind === "help") {
    const { request } = story;
    if (request.kind === "pet") ["pet", "way"].forEach((b) => allowed.add(b));
    if (request.kind === "carry") ["partner", "way"].forEach((b) => allowed.add(b));
    if (request.kind === "dish" && request.dish !== "warm") allowed.add("dish");
    if ((request.kind === "dish" || request.kind === "brew" || request.kind === "forage") && (talk === "thanks" || talk === "friend")) allowed.add("gave");
  }
  return allowed;
}

function textsOf(story: Story): { talk: string; kind: keyof typeof LONGEST; text: string }[] {
  const out: { talk: string; kind: keyof typeof LONGEST; text: string }[] = [];
  for (const [talk, { pages }] of Object.entries(talksOf(story))) {
    for (const page of pages as readonly Page[]) {
      out.push({ talk, kind: "say", text: page.say });
      if (page.lead !== undefined) out.push({ talk, kind: "lead", text: page.lead });
      for (const c of page.choices ?? []) out.push({ talk, kind: "choice", text: c.say }, { talk, kind: "reply", text: c.reply });
    }
  }
  for (const tone of TONES) out.push({ talk: "friend", kind: "greet", text: story.friend.greet[tone] });
  return out;
}

/** The roles the world places, and by which places. */
const placedRoles = new Set<Role>([...GROUND_ROLES, ...Object.values(PLACE_PEOPLE).flat()]);

describe("the story library", () => {
  it("has a few of each kind to start, each under an id of its own", () => {
    expect(STORIES.length).toBeGreaterThanOrEqual(8);
    expect(new Set(STORIES.map((s) => s.id)).size).toBe(STORIES.length);
    expect(STORIES.filter((s) => s.kind === "help").length).toBeGreaterThanOrEqual(4);
    expect(STORIES.filter((s) => s.kind === "talk").length).toBeGreaterThanOrEqual(3);
    expect(STORIES.filter((s) => s.kind === "mystery").length).toBeGreaterThanOrEqual(2);
  });

  it("gives every role in the world a story, and every story someone the world places to carry it", () => {
    for (const role of ROLES) expect(placedRoles.has(role)).toBe(true);
    for (const role of ROLES) expect(STORIES.some((s) => s.roles.includes(role) && (s.weight ?? 1) > 0)).toBe(true);
    for (const story of STORIES) {
      expect(story.roles.length).toBeGreaterThan(0);
      for (const role of story.roles) expect(placedRoles.has(role)).toBe(true);
      for (const place of story.places ?? []) expect(story.roles.some((role) => PLACE_PEOPLE[place]?.includes(role))).toBe(true);
    }
  });

  it("can answer every request with what the game already has, a brew's at some time of the year", () => {
    for (const story of STORIES) if (story.kind === "help") expect(answerable(story.request), story.id).toBe(true);
  });

  it("tells Elliott how to make a particular brew they ask for, as they ask", () => {
    for (const story of STORIES) {
      if (story.kind !== "help" || story.request.kind !== "brew" || story.request.brew === "tea" || story.request.brew === "salve") continue;
      const wanted = story.request.brew;
      expect(story.meet.gifts?.some((g) => g.kind === "brew-hint" && g.brew === wanted), story.id).toBe(true);
    }
  });

  it("leaves no story unreachable: a note's friend is some note's partner and only ever placed as one", () => {
    for (const story of STORIES) {
      if (story.kind !== "receive") continue;
      expect(story.weight).toBe(0);
      expect(STORIES.some((s) => s.kind === "help" && s.request.kind === "carry" && s.request.to === story.id)).toBe(true);
    }
    for (const story of STORIES) {
      if (story.kind !== "help" || story.request.kind !== "carry") continue;
      expect(storyOf(story.request.to).kind).toBe("receive");
    }
  });

  it("offers every choice as one of each tone, and every talk at least a page", () => {
    for (const story of STORIES) {
      for (const { pages } of Object.values(talksOf(story))) {
        expect(pages.length).toBeGreaterThan(0);
        for (const page of pages as readonly Page[]) {
          if (!page.choices) continue;
          expect(page.choices.map((c) => c.tone).sort()).toEqual([...TONES].sort());
        }
      }
    }
  });

  it("fits every line in the storybook panel, filled at its longest", () => {
    for (const story of STORIES) {
      for (const { kind, text } of textsOf(story)) {
        expect(text.trim().length, `${story.id}: empty ${kind}`).toBeGreaterThan(0);
        expect(filledLength(text), `${story.id}: "${text}"`).toBeLessThanOrEqual(LONGEST[kind]);
      }
    }
  });

  it("only uses braces the world fills for that story", () => {
    for (const story of STORIES) {
      for (const { talk, text } of textsOf(story)) {
        for (const [, key] of text.matchAll(/\{(\w+)\}/g)) expect(bracesFor(story, talk).has(key), `${story.id} ${talk}: {${key}} in "${text}"`).toBe(true);
      }
    }
  });

  it("gives only gifts the game has: real recipes and brews, every keepsake by someone, and an animal to keep only where one was found", () => {
    const given = new Set<string>();
    for (const story of STORIES) {
      for (const [talk, t] of Object.entries(talksOf(story))) {
        for (const gift of t.gifts ?? []) {
          if (gift.kind === "hint") expect(RECIPES.some((r) => r.id === gift.recipe)).toBe(true);
          if (gift.kind === "brew-hint") expect(BREWS.some((b) => b.id === gift.brew)).toBe(true);
          if (gift.kind === "keepsake") given.add(gift.keepsake);
          if (gift.kind === "companion") {
            expect(talk).toBe("thanks");
            expect(story.kind === "help" && story.request.kind === "pet").toBe(true);
          }
        }
      }
    }
    for (const keepsake of KEEPSAKES) expect(given.has(keepsake)).toBe(true);
  });

  it("starts near camp with help Elliott can give at once: finding a lost animal", () => {
    const first = storyOf(FIRST_STORY);
    expect(first.kind === "help" && first.request.kind === "pet").toBe(true);
    expect(first.roles).toContain("cottager");
  });
});
