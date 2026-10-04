import { describe, expect, it } from "vitest";
import { CARDS } from "./cards";
import { readContent as readRaw, sections } from "./content-reader";
import type { RuleNotes, RuleText, Ruling } from "./rule-notes";
import { ROOMS } from "./rooms";
import { TOKENS } from "./tokens";

// Builds rule-notes.json from content/. The file is a snapshot: this test
// fails when content/ changes until it is rewritten with `vitest run -u`.

/** Line endings depend on the checkout, and the snapshot mustn't. */
const readContent = (file: string) => readRaw(file).replace(/\r\n/g, "\n");

const NOTE = /^\s*> Note: (.*)$/;
const RESOLUTION = /^\s*> Resolution \(([^)]*)\): (.*)$/;

function rulings(body: string): Ruling[] {
  const lines = body.split("\n");
  return lines.flatMap((line, i) => {
    const note = NOTE.exec(line);
    if (!note) return [];
    const next = lines.slice(i + 1).find((l) => l.trim() !== "") ?? "";
    const resolution = RESOLUTION.exec(next);
    return [
      {
        note: note[1],
        authority: resolution ? resolution[1] : null,
        resolution: resolution ? resolution[2] : null,
      },
    ];
  });
}

/** The rule's lines: bullets, table rows and prose, from the `Text` field on
 *  when the entry has one, leaving out notes and the entry's other fields. */
function ruleLines(body: string, fromText: boolean): string[] {
  let lines = body.split("\n");
  if (fromText) {
    const start = lines.findIndex((l) => l.startsWith("- Text:"));
    if (start < 0) return [];
    lines = lines.slice(start);
  }
  return lines.flatMap((raw) => {
    const line = raw.trim();
    if (line === "" || line.startsWith(">") || /^\|[-| ]+\|$/.test(line))
      return [];
    if (line.startsWith("|"))
      return [
        line
          .replace(/^\||\|$/g, "")
          .split("|")
          .map((c) => c.trim())
          .join(": "),
      ];
    const field = /^- (Text|Table):\s*(.*)$/.exec(line);
    if (field) return field[2] && field[2] !== "none" ? [field[2]] : [];
    if (fromText && /^- [A-Z][a-z]+:/.test(raw)) return [];
    return [line.replace(/^- /, "")];
  });
}

function entry(title: string, body: string, fromText: boolean): RuleText {
  return { title, lines: ruleLines(body, fromText), rulings: rulings(body) };
}

/** Matches content/ headings to typed entries by name. Two cards share a
 *  name (Image in the Mirror), so same-named entries pair up in order. */
function namer<T extends { id: string; name: string }>(entries: T[]) {
  const seen: Record<string, number> = {};
  return (name: string): T => {
    const index = seen[name] ?? 0;
    seen[name] = index + 1;
    const found = entries.filter((e) => e.name === name)[index];
    if (!(found as T | undefined))
      throw new Error(`No typed entry for content/'s ${name} (#${index + 1})`);
    return found;
  };
}

function sorted<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(
    Object.entries(record).sort(([a], [b]) => (a < b ? -1 : 1)),
  );
}

function buildRuleNotes(): RuleNotes {
  const rooms: Record<string, RuleText> = {};
  const room = namer(ROOMS);
  for (const s of sections(readContent("rooms.md")))
    rooms[room(s.heading).id] = entry(s.heading, s.body, true);

  const cards: Record<string, RuleText> = {};
  const card = namer(CARDS);
  for (const file of ["omens", "items", "events"])
    for (const s of sections(readContent(`cards/${file}.md`)))
      cards[card(s.heading).id] = entry(s.heading, s.body, true);

  const tokens: Record<string, RuleText> = {};
  const token = namer(TOKENS);
  const tokenRules = readContent("tokens.md").split("## Room token rules")[1];
  for (const chunk of tokenRules.split(/^### /m).slice(1)) {
    const newline = chunk.indexOf("\n");
    const heading = chunk.slice(0, newline).trim();
    const names = heading.replace(/ \(.*$/, "").split(" and ");
    for (const name of names)
      tokens[token(name).id] = entry(name, chunk.slice(newline), false);
  }

  const pages: Record<string, RuleText[]> = {};
  for (const chunk of readContent("rules.md").split(/^#{2,3} /m).slice(1)) {
    const newline = chunk.indexOf("\n");
    const heading = chunk.slice(0, newline).trim();
    const page = /p\. (\d+)\)$/.exec(heading);
    if (!page) continue;
    const text = entry(heading, chunk.slice(newline), false);
    if (text.lines.length === 0 && text.rulings.length === 0) continue;
    (pages[page[1]] ??= []).push(text);
  }

  return {
    rooms: sorted(rooms),
    cards: sorted(cards),
    tokens: sorted(tokens),
    pages: sorted(pages),
  };
}

describe("rule-notes.json", () => {
  const notes = buildRuleNotes();

  it("matches content/", async () => {
    await expect(`${JSON.stringify(notes, null, 1)}\n`).toMatchFileSnapshot(
      "./rule-notes.json",
    );
  });

  it("has every room and card, and reads their rulings", () => {
    expect(Object.keys(notes.rooms)).toHaveLength(ROOMS.length);
    expect(Object.keys(notes.cards)).toHaveLength(CARDS.length);
    expect(notes.rooms["junk-room"].rulings[0].authority).toBe("official");
    expect(notes.cards["a-moment-of-hope"].lines[0]).toBe(
      "Put the Blessing token in this room.",
    );
    expect(notes.pages["15"]?.map((p) => p.title)).toContain(
      "Making a Haunt Roll (p. 15)",
    );
  });
});
