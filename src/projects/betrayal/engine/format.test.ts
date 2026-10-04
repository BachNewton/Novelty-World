import { describe, expect, it } from "vitest";
import type { Json } from "../types";
import { migrate, NewerFormatError, STATE_FORMAT } from "./format";

/** A format 1-4 explorer, kept one per seat. */
const zoe = {
  seat: 0,
  character: "zoe-ingstrom",
  room: "foyer",
  clips: { speed: 3, might: 2, sanity: 4, knowledge: 3 },
  overTop: [],
  cards: [],
};

/** The same explorer as a format 5 figure. */
const zoeFigure = {
  id: "zoe-ingstrom",
  kind: "explorer",
  definition: "zoe-ingstrom",
  owner: 0,
  place: { room: "foyer", side: null },
  traits: {
    kind: "track",
    clips: { speed: 3, might: 2, sanity: 4, knowledge: 3 },
    overTop: [],
  },
  cards: [],
  statuses: [],
  stunned: false,
  alive: true,
};

/** A format 5 turn ledger in which Zoe has done nothing yet. */
const zoeLedger = {
  moved: { "zoe-ingstrom": 0 },
  movementEnded: [],
  attacked: [],
  omens: [],
};

describe("migrate", () => {
  it("passes a current state through unchanged", () => {
    const saved = { format: STATE_FORMAT, gameId: "g" };
    expect(migrate(saved)).toEqual(saved);
  });

  it("refuses a state from newer code, so the client reloads", () => {
    expect(() => migrate({ format: STATE_FORMAT + 1 })).toThrow(
      NewerFormatError,
    );
  });

  it("upgrades a format 1 state: no marks on cards, and the turn isn't over", () => {
    const saved = {
      format: 1,
      gameId: "g",
      ongoing: [],
      explorers: [zoe],
      turn: { seat: 0, moved: 1, traded: false },
    };
    expect(migrate(saved)).toEqual({
      format: STATE_FORMAT,
      gameId: "g",
      ongoing: [],
      cardMarks: {},
      figures: { "zoe-ingstrom": zoeFigure },
      lastEvents: [],
      turn: {
        seat: 0,
        traded: false,
        over: false,
        ...zoeLedger,
        moved: { "zoe-ingstrom": 1 },
      },
    });
    expect(migrate({ format: 1, turn: null })).toMatchObject({ turn: null });
  });

  it("upgrades a format 2 state: the turn's attack hasn't been made", () => {
    const saved = {
      format: 2,
      gameId: "g",
      cardMarks: {},
      explorers: [zoe],
      turn: { seat: 0, moved: 0, traded: true, over: false },
    };
    expect(migrate(saved)).toEqual({
      format: STATE_FORMAT,
      gameId: "g",
      cardMarks: {},
      figures: { "zoe-ingstrom": zoeFigure },
      lastEvents: [],
      turn: { seat: 0, traded: true, over: false, ...zoeLedger },
    });
    expect(migrate({ format: 2, turn: null })).toMatchObject({ turn: null });
  });

  it("upgrades a format 3 state: the turn's omens were drawn by its own explorer", () => {
    const saved = {
      format: 3,
      gameId: "g",
      explorers: [zoe],
      turn: {
        seat: 0,
        attacked: false,
        omens: [{ card: "book", room: "attic" }],
      },
    };
    expect(migrate(saved)).toEqual({
      format: STATE_FORMAT,
      gameId: "g",
      figures: { "zoe-ingstrom": zoeFigure },
      lastEvents: [],
      turn: {
        seat: 0,
        moved: {},
        movementEnded: [],
        attacked: [],
        omens: [{ card: "book", figure: "zoe-ingstrom", room: "attic" }],
      },
    });
    expect(migrate({ format: 3, turn: null })).toMatchObject({ turn: null });
  });

  describe("a format 4 state", () => {
    const ox = {
      seat: 1,
      character: "ox-bellows",
      room: "chasm",
      side: "left",
      clips: { speed: 4, might: 5, sanity: 2, knowledge: 1 },
      overTop: [{ card: "dog", trait: "might", spaces: 1 }],
      cards: ["dog", "axe"],
    };
    type JsonObject = { [key: string]: Json };
    const turn: JsonObject = {
      seat: 1,
      moved: 2,
      movementEnded: true,
      attacked: true,
      rolls: ["bell"],
      omens: [{ card: "book", seat: 1, room: "chasm" }],
    };
    const pending: JsonObject = {
      type: "decision",
      id: "d7",
      seats: [1],
      kind: "turn",
      params: { seat: 1 },
      rule: { source: "rulebook", page: 6 },
      answers: {},
    };
    const saved: JsonObject = {
      format: 4,
      gameId: "g",
      explorers: [zoe, ox],
      tokens: [
        { token: "dog", room: "chasm", holder: 1 },
        { token: "blessing", room: "foyer" },
      ],
      cardMarks: {
        "angry-being": { "drawn-by": { value: 1, lasts: "play" } },
        candle: { "set-bonus": { value: true, lasts: "holder" } },
      },
      turn,
      work: [],
      pending,
      lastEvents: [
        { id: "d6.1:0", type: "turn-started", rule: null, data: { seat: 1 } },
      ],
    };

    it("keeps its explorers as figures by character, and names them by id wherever it named a seat", () => {
      expect(migrate(saved)).toEqual({
        format: STATE_FORMAT,
        gameId: "g",
        figures: {
          "zoe-ingstrom": zoeFigure,
          "ox-bellows": {
            id: "ox-bellows",
            kind: "explorer",
            definition: "ox-bellows",
            owner: 1,
            place: { room: "chasm", side: "left" },
            traits: {
              kind: "track",
              clips: { speed: 4, might: 5, sanity: 2, knowledge: 1 },
              overTop: [{ card: "dog", trait: "might", spaces: 1 }],
            },
            cards: ["dog", "axe"],
            statuses: [],
            stunned: false,
            alive: true,
          },
        },
        tokens: [
          { token: "dog", room: "chasm", holder: "ox-bellows" },
          { token: "blessing", room: "foyer" },
        ],
        cardMarks: {
          "angry-being": { "drawn-by": { value: "ox-bellows", lasts: "play" } },
          candle: { "set-bonus": { value: true, lasts: "holder" } },
        },
        turn: {
          seat: 1,
          moved: { "ox-bellows": 2 },
          movementEnded: ["ox-bellows"],
          attacked: ["ox-bellows"],
          rolls: ["bell"],
          omens: [{ card: "book", figure: "ox-bellows", room: "chasm" }],
        },
        work: [],
        pending,
        lastEvents: [],
      });
    });

    it("leaves a turn whose movement hasn't ended, with no attack made, with empty ledgers", () => {
      const migrated = migrate({
        ...saved,
        turn: { ...turn, movementEnded: false, attacked: false },
      });
      expect(migrated.turn).toMatchObject({ movementEnded: [], attacked: [] });
    });

    it("is refused while work is queued: it names explorers by seat", () => {
      expect(() =>
        migrate({ ...saved, work: [{ kind: "gain", params: { seat: 1 } }] }),
      ).toThrow(/partway through an effect/);
    });

    it("is refused while a decision other than the turn's own is pending", () => {
      expect(() =>
        migrate({
          ...saved,
          pending: { ...pending, kind: "split-damage" },
        }),
      ).toThrow(/partway through an effect/);
    });
  });

  it("refuses a state with no format number", () => {
    expect(() => migrate({ gameId: "g" })).toThrow(/format/);
  });
});
