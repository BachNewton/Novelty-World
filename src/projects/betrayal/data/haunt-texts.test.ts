import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { HauntHalf, HauntTexts } from "../types";
import { readContent as readRaw, sections } from "./content-reader";
import { HAUNTS } from "./haunts";

// Builds data/haunt-texts/<file>.json, one per content/haunts/ file: each
// side's half of the haunt, for the seats that may read it (engine/view.ts).
// A haunt definition imports its own file as its `texts`. The files are
// snapshots: this test fails when content/haunts/ changes until they are
// rewritten with `npx vitest run src/projects/betrayal/data/haunt-texts -u`.

/** Line endings depend on the checkout, and the snapshot mustn't. */
const readContent = (file: string) => readRaw(file).replace(/\r\n/g, "\n");

const HALVES = {
  traitor: "Traitor (Traitor's Tome)",
  heroes: "Heroes (Secrets of Survival)",
} as const;

function half(file: string, text: string, side: keyof typeof HALVES): HauntHalf {
  const found = sections(text).filter((s) => s.heading === HALVES[side]);
  if (found.length !== 1)
    throw new Error(`${file} should have one "## ${HALVES[side]}" section`);
  const title = /\((.*)\)$/.exec(HALVES[side])?.[1];
  if (title === undefined) throw new Error(`No book named in ${HALVES[side]}`);
  return { title, text: found[0].body.trim() };
}

export function buildHauntTexts(file: string): HauntTexts {
  const text = readContent(`haunts/${file}`);
  const name = /^# .+? — (.+)$/m.exec(text)?.[1];
  if (name === undefined) throw new Error(`${file} has no "# N — Name" title`);
  return {
    name,
    traitor: half(file, text, "traitor"),
    heroes: half(file, text, "heroes"),
  };
}

const FILES = readdirSync(path.join(__dirname, "..", "content", "haunts"))
  .filter((f) => f.endsWith(".md"))
  .sort();

const jsonName = (file: string) => file.replace(/\.md$/, ".json");

describe("haunt-texts/", () => {
  it.each(FILES)("%s matches content/", async (file) => {
    await expect(
      `${JSON.stringify(buildHauntTexts(file), null, 1)}\n`,
    ).toMatchFileSnapshot(`./haunt-texts/${jsonName(file)}`);
  });

  it("splits each haunt into its two halves, notes included", () => {
    const texts = buildHauntTexts("13-perchance-to-dream.md");
    expect(texts.name).toBe("Perchance to Dream");
    expect(texts.traitor.title).toBe("Traitor's Tome");
    expect(texts.traitor.text).toContain("Secretly count the \"escape rooms\"");
    expect(texts.traitor.text).not.toContain("How to Wake the Dreamer");
    expect(texts.heroes.title).toBe("Secrets of Survival");
    expect(texts.heroes.text).toContain("How to Wake the Dreamer");
    expect(texts.heroes.text).not.toContain("escape rooms");
  });
});

describe("a built haunt's texts", () => {
  it("are its content file's", () => {
    for (const haunt of HAUNTS)
      expect(haunt.texts, `haunt ${haunt.number}`).toEqual(
        buildHauntTexts(haunt.content),
      );
  });
});
