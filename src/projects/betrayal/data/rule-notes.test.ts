import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CARDS } from "./cards";
import { HAUNTS } from "./haunts";
import { readContent as readRaw, sections } from "./content-reader";
import {
  ruleDetail,
  type RuleNotes,
  type RuleText,
  type Ruling,
} from "./rule-notes";
import { ROOMS } from "./rooms";
import { TOKENS } from "./tokens";

// Builds rule-notes.json from content/. The file is a snapshot: this test
// fails when content/ changes until it is rewritten with `vitest run -u`.

/** Line endings depend on the checkout, and the snapshot mustn't. */
const readContent = (file: string) => readRaw(file).replace(/\r\n/g, "\n");

const NOTE = /^\s*> Note: (.*)$/;
/** A note the engine cites by id. */
const CITED_NOTE = /^\s*> Note \[([a-z0-9-]+)\]: (.*)$/;
const RESOLUTION = /^\s*> Resolution \(([^)]*)\): (.*)$/;

function rulings(body: string): Ruling[] {
  const lines = body.split("\n");
  return lines.flatMap((line, i) => {
    const cited = CITED_NOTE.exec(line);
    const plain = NOTE.exec(line);
    const note = cited
      ? { id: cited[1], text: cited[2] }
      : plain && { id: null, text: plain[1] };
    if (!note) return [];
    const next = lines.slice(i + 1).find((l) => l.trim() !== "") ?? "";
    const resolution = RESOLUTION.exec(next);
    return [
      {
        ...(note.id === null ? {} : { id: note.id }),
        note: note.text,
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

  const haunts: Record<string, RuleText[]> = {};
  const files = readdirSync(path.join(__dirname, "..", "content", "haunts"));
  for (const file of files.sort()) {
    const number = /^(\d+)-/.exec(file)?.[1];
    if (number === undefined) continue;
    const text = readContent(`haunts/${file}`);
    const cited = text
      .split(/^#{2,4} /m)
      .slice(1)
      .flatMap((chunk) => {
        const newline = chunk.indexOf("\n");
        const found = rulings(chunk.slice(newline)).filter(
          (r) => r.id !== undefined,
        );
        return found.length === 0
          ? []
          : [{ title: chunk.slice(0, newline).trim(), lines: [], rulings: found }];
      });
    if (cited.length > 0) haunts[String(Number(number))] = cited;
  }
  return {
    rooms: sorted(rooms),
    cards: sorted(cards),
    tokens: sorted(tokens),
    pages: sorted(pages),
    haunts: sorted(haunts),
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

/** Every ruling id the engine and the content code cite, from their source:
 *  a reference is written `ruling: "<id>"`. */
function citedRulings(): string[] {
  const root = path.join(__dirname, "..");
  const files = ["engine", "kit", "data"].flatMap((dir) =>
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- test-only scan of this project's own engine/, kit/ and data/ folders
    readdirSync(path.join(root, dir), { recursive: true, encoding: "utf8" })
      .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
      .map((f) => path.join(root, dir, f)),
  );
  return files.flatMap((file) =>
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- test-only scan of this project's own engine/ and data/ source files
    [...readFileSync(file, "utf8").matchAll(/ruling: "([a-z0-9-]+)"/g)].map(
      (m) => m[1],
    ),
  );
}

describe("ruling ids", () => {
  const notes = buildRuleNotes();
  const ids = [
    ...Object.values(notes.rooms),
    ...Object.values(notes.cards),
    ...Object.values(notes.tokens),
    ...Object.values(notes.pages).flatMap((texts) => texts ?? []),
    ...Object.values(notes.haunts).flatMap((texts) => texts ?? []),
  ].flatMap((text) => text.rulings.flatMap((r) => r.id ?? []));

  it("are read from the note's brackets, and are unique", () => {
    expect(ids).toContain("dead-explorers-omens");
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("cited by the code all exist, so a renamed note fails here", () => {
    for (const id of citedRulings()) expect(ids).toContain(id);
  });

  it("that a built haunt depends on are its own, and settled", () => {
    for (const haunt of HAUNTS) {
      const own = (notes.haunts[haunt.number] ?? []).flatMap((t) => t.rulings);
      for (const id of haunt.rulings ?? []) {
        const ruling = own.find((r) => r.id === id);
        expect(ruling, `haunt ${haunt.number}: ${id}`).toBeDefined();
        expect(ruling?.authority).not.toBe("unresolved");
      }
    }
  });

  it("narrow \"why?\" to the one ruling, and throw on one the source lacks", () => {
    const rule = { source: "rulebook", page: 19 } as const;
    const all = ruleDetail(notes, rule);
    expect(all.length).toBeGreaterThan(1);
    const one = ruleDetail(notes, { ...rule, ruling: "dead-explorers-omens" });
    expect(one).toHaveLength(1);
    expect(one[0].title).toBe("What Happens to My Stuff if I Die? (p. 19)");
    expect(one[0].rulings.map((r) => r.id)).toEqual(["dead-explorers-omens"]);
    expect(() => ruleDetail(notes, { ...rule, ruling: "no-such-ruling" })).toThrow(
      "No ruling no-such-ruling",
    );
  });
});
