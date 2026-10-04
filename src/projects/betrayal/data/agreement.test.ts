import { describe, expect, it } from "vitest";
import type { CardType, SetId, TokenShape, TraitorRule } from "../types";
import { CARDS } from "./cards";
import { CHARACTERS } from "./characters";
import { BASE_CHART } from "./chart";
import {
  field,
  leadingList,
  readContent,
  requiredField,
  sections,
  table,
  type Section,
} from "./content-reader";
import { ROOMS } from "./rooms";
import { TOKENS } from "./tokens";

// The typed data is the executable form of content/. These tests read the
// regular facts back out of the prose and fail when the two disagree.

const SETS: Record<string, SetId> = {
  base: "base",
  "Widow's Walk": "widows-walk",
};

function only<T extends { name: string }>(entries: T[], name: string): T {
  const found = entries.filter((e) => e.name === name);
  if (found.length !== 1)
    throw new Error(
      `Expected one typed entry named ${name}, found ${found.length}`,
    );
  return found[0];
}

describe("rooms agree with content/rooms.md", () => {
  const rooms = sections(readContent("rooms.md"));

  it("have one typed entry per heading, and no others", () => {
    expect(ROOMS.map((r) => r.name).sort()).toEqual(
      rooms.map((s) => s.heading).sort(),
    );
  });

  it.each(rooms.map((s): [string, Section] => [s.heading, s]))(
    "%s",
    (name, section) => {
      const room = only(ROOMS, name);
      const floors = requiredField(section, "Floors");
      const marks = requiredField(section, "Marks");
      const symbols = requiredField(section, "Symbols");
      expect(room.set).toBe(SETS[requiredField(section, "Set")]);
      expect(room.floors).toEqual(
        leadingList(floors).map((f) => f.toLowerCase()),
      );
      expect(room.start !== null).toBe(floors.includes("(starting tile)"));
      expect(room.doors).toEqual(leadingList(requiredField(section, "Doors")));
      expect(room.windows).toEqual(
        leadingList(requiredField(section, "Windows")),
      );
      expect(room.outside).toBe(field(section, "Outside") === "yes");
      expect(room.symbols).toEqual(
        symbols.startsWith("none") ? [] : leadingList(symbols),
      );
      expect(room.anyCard).toBe(marks.includes('"?"'));
      expect(room.dumbwaiter).toBe(marks.includes("dumbwaiter"));
      expect(room.special).toBe(marks.includes("asterisk"));
    },
  );

  it("place the front door and links only between rooms that exist", () => {
    for (const room of ROOMS) {
      if (room.frontDoor) expect(room.doors).toContain(room.frontDoor);
      for (const link of room.links)
        expect(ROOMS.map((r) => r.id)).toContain(link);
    }
  });
});

describe("characters agree with content/characters.md", () => {
  const characters = sections(readContent("characters.md"));
  const MONTHS = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  it("have one typed entry per heading, and no others", () => {
    expect(CHARACTERS.map((c) => c.name).sort()).toEqual(
      characters.map((s) => s.heading).sort(),
    );
  });

  it.each(characters.map((s): [string, Section] => [s.heading, s]))(
    "%s",
    (name, section) => {
      const character = only(CHARACTERS, name);
      const card = /^(\w+) \(other side: (.+)\)$/.exec(
        requiredField(section, "Card"),
      );
      expect(card?.[1]).toBe(character.card);
      expect(only(CHARACTERS, card?.[2] ?? "").id).toBe(character.otherSide);
      expect(character.sex).toBe(requiredField(section, "Sex"));
      const vital = requiredField(section, "Age");
      expect(vital.startsWith(`${character.age} `)).toBe(true);
      const { month, day } = character.birthday;
      expect(vital).toContain(`Birthday: ${MONTHS[month - 1]} ${day}`);
      expect(character.hobbies).toEqual(
        leadingList(requiredField(section, "Hobbies")),
      );
      for (const trait of ["speed", "might", "sanity", "knowledge"] as const) {
        const printed = requiredField(
          section,
          trait[0].toUpperCase() + trait.slice(1),
        ).split(" ");
        expect(character.tracks[trait]).toEqual(
          printed.map((v) => Number(v.replace(/[[\]]/g, ""))),
        );
        expect(printed[character.start[trait]]).toMatch(/^\[\d\]$/);
      }
    },
  );
});

describe("cards agree with content/cards/", () => {
  const FILES: Record<CardType, string> = {
    omen: "cards/omens.md",
    item: "cards/items.md",
    event: "cards/events.md",
  };

  it.each(Object.entries(FILES))(
    "%s cards have one typed entry per heading",
    (type, file) => {
      const headings = sections(readContent(file));
      const typed = CARDS.filter((c) => c.type === type);
      expect(typed.map((c) => c.name).sort()).toEqual(
        headings.map((s) => s.heading).sort(),
      );
      // Duplicate names are matched up in file order.
      headings.forEach((section, i) => {
        const card = typed.filter((c) => c.name === section.heading)[
          headings.slice(0, i).filter((s) => s.heading === section.heading)
            .length
        ];
        expect(card.type).toBe(requiredField(section, "Deck"));
        expect(card.set).toBe(SETS[requiredField(section, "Set")]);
        const label = requiredField(section, "Label");
        expect(card.label).toBe(label === "none" ? null : label.toLowerCase());
      });
    },
  );

  it("restrict trading, dropping and stealing exactly where the card's text does", () => {
    for (const file of ["cards/items.md", "cards/omens.md"]) {
      for (const section of sections(readContent(file))) {
        const card = only(CARDS, section.heading);
        // "This item can't be stolen." / "This omen can't be dropped, traded, or stolen." / "The Box can't be stolen."
        const line =
          /^ {2}- (?:This (?:item|omen)|The \w+) can't be ([^.]+)\./m.exec(
            section.body,
          )?.[1] ?? "";
        const cant = (word: string) => line.includes(word);
        expect(card.transfer).toEqual({
          trade: !cant("traded"),
          drop: !cant("dropped"),
          // A card that can't be traded can't be stolen either (rules.md, p. 13).
          steal: !cant("stolen") && !cant("traded"),
        });
      }
    }
  });

  it("match the rulebook's base counts: 13 omens, 22 items, 45 events", () => {
    const base = CARDS.filter((c) => c.set === "base");
    expect(
      ["omen", "item", "event"].map(
        (t) => base.filter((c) => c.type === t).length,
      ),
    ).toEqual([13, 22, 45]);
  });
});

describe("tokens agree with content/tokens.md", () => {
  it("add up to the totals table, by set and kind", () => {
    const SHAPES: Record<string, TokenShape> = {
      "Large circular monster tokens": "large-circle",
      "Small circular monster tokens": "small-circle",
      "Small circular explorer tokens": "small-circle",
      "Square event and room tokens": "square",
      "Pentagonal item tokens (numbered items and Item Piles)": "pentagon",
      "Triangular Trait Roll tokens": "triangle",
    };
    const expected = new Map<string, number>();
    for (const [set, type, , count] of table(
      readContent("tokens.md"),
      "Set",
      "Token type",
    )) {
      if (type.startsWith("**")) continue;
      if (type.startsWith("Ghost")) {
        // The replacement sheet's Ghost and three Speed Rolls count as Widow's Walk.
        expected.set(
          "widows-walk large-circle",
          (expected.get("widows-walk large-circle") ?? 0) + 1,
        );
        expected.set("widows-walk triangle", 3);
        continue;
      }
      const key = `${SETS[set]} ${SHAPES[type]}`;
      expected.set(key, (expected.get(key) ?? 0) + Number(count));
    }
    const actual = new Map<string, number>();
    for (const token of TOKENS) {
      const key = `${token.set} ${token.shape}`;
      actual.set(key, (actual.get(key) ?? 0) + token.count);
    }
    expect(Object.fromEntries(actual)).toEqual(Object.fromEntries(expected));
  });
});

describe("the haunt chart agrees with content/haunt-chart.md", () => {
  const text = readContent("haunt-chart.md");

  it("has every cell of the chart", () => {
    const [header, ...rows] = [
      text.split("\n").find((l) => l.startsWith("| Room | Bite")) ?? "",
      ...table(text, "Room", "Bite").map((r) => r.join("|")),
    ];
    const omens = header
      .split("|")
      .map((c) => c.trim())
      .filter(Boolean)
      .slice(1);
    const cardId = (name: string) => only(CARDS, name).id;
    const roomId = (name: string) => only(ROOMS, name).id;
    const printed: Record<string, Record<string, number>> = {};
    for (const row of rows) {
      const [room, ...cells] = row.split("|");
      printed[roomId(room)] = Object.fromEntries(
        omens.map((omen, i) => [cardId(omen), Number(cells[i])]),
      );
    }
    expect(BASE_CHART.cells).toEqual(printed);
  });

  it("has every row of the traitor table", () => {
    const printed = table(text, "Haunt", "Traitor").map(([haunt, traitor]) => [
      Number(haunt),
      traitor
        .replace(/ \((at first|see Secrets of Survival)\)/, "")
        .replace(/ \([^)]+\) or/, " or"),
    ]);
    const typed = Object.entries(BASE_CHART.traitors).map(([haunt, rule]) => [
      Number(haunt),
      describeTraitor(rule),
    ]);
    expect(typed).toEqual(printed);
  });
});

/** The traitor table's own wording for a rule. */
function describeTraitor(rule: TraitorRule): string {
  const except = (exceptRevealer: boolean) =>
    exceptRevealer ? " (except for the haunt revealer)" : "";
  const capital = (s: string) => s[0].toUpperCase() + s.slice(1);
  switch (rule.kind) {
    case "revealer":
      return "Haunt revealer";
    case "left-of-revealer":
      return "Left of the haunt revealer";
    case "trait":
      return `${capital(rule.extreme)} ${capital(rule.trait)}*${except(rule.exceptRevealer)}`;
    case "age":
      return `${capital(rule.extreme)} explorer${except(rule.exceptRevealer)}`;
    case "named": {
      const otherwise = describeTraitor(rule.otherwise);
      const name = CHARACTERS.find((c) => c.id === rule.character)?.name;
      return `${name} or ${otherwise[0].toLowerCase()}${otherwise.slice(1)}`;
    }
    case "hidden":
      return "Hidden traitor";
    case "none":
      return "None";
  }
}
