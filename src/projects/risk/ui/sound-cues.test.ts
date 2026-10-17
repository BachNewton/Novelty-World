import { describe, expect, it } from "vitest";
import type { GameEvent, GameView, Seat } from "../contract";
import { referenceEngine as engine } from "../engine";
import { TERRITORIES } from "../map";
import type { LoggedEvent } from "../online/game";
import { heardSince, MOST_AT_ONCE, soundsFor } from "./sound-cues";

const VIEW = engine.view(engine.newGame({ players: 4 }, "sound-cues").state, 0);

/** The view with every territory of `continent` held by `seat`. */
function holding(view: GameView, continent: string, seat: Seat): GameView {
  const territories = { ...view.territories };
  for (const t of TERRITORIES) if (t.continent === continent) territories[t.id] = { ...territories[t.id], owner: seat };
  return { ...view, territories };
}

/** No seat holds `continent`: its first territory goes to someone else. */
function breaking(view: GameView, continent: string): GameView {
  const first = TERRITORIES.find((t) => t.continent === continent);
  if (!first) throw new Error(`no territory in ${continent}`);
  const owner = view.territories[first.id].owner;
  return { ...view, territories: { ...view.territories, [first.id]: { ...view.territories[first.id], owner: ((owner + 1) % 4) as Seat } } };
}

/** A board where no seat holds a whole continent, so only the events sound. */
const QUIET = ["north-america", "south-america", "europe", "africa", "asia", "australia"].reduce(breaking, VIEW);

/** An event as the tests write it, without the rule it names. */
type Bare = GameEvent extends infer E ? (E extends GameEvent ? Omit<E, "rule"> : never) : never;
const named = (events: readonly Bare[]) => events.map((event) => ({ rule: "test", ...event }) as GameEvent);

const sounds = (events: readonly Bare[], viewer: Seat | null = 0, hidden = false) => soundsFor(named(events), viewer, QUIET, QUIET, hidden);

const captured = (seat: Seat, from: Seat): Bare => ({ kind: "captured", seat, from, territory: "alaska" });

describe("soundsFor", () => {
  it("sounds a battle's dice and a blitz's roll, whoever fights", () => {
    expect(sounds([{ kind: "battle", from: "alaska", to: "kamchatka", attackerDice: [6, 2], defenderDice: [3], attackerLosses: 0, defenderLosses: 1 }], 2)).toEqual(["dice"]);
    expect(sounds([{ kind: "blitzed", from: "alaska", to: "kamchatka", attackerLosses: 2, defenderLosses: 3 }])).toEqual(["blitz"]);
  });

  it("tells a capture by the viewer, of the viewer's and between others apart", () => {
    expect(sounds([captured(0, 1)])).toEqual(["capture"]);
    expect(sounds([captured(1, 0)])).toEqual(["lost"]);
    expect(sounds([captured(1, 2)])).toEqual(["taken"]);
  });

  it("calls only the viewer to their turn, and gives only the viewer's card a sound", () => {
    expect(sounds([{ kind: "turn-started", seat: 0, turn: 3 }])).toEqual(["turn"]);
    expect(sounds([{ kind: "turn-started", seat: 1, turn: 3 }])).toEqual([]);
    expect(sounds([{ kind: "card-drawn", seat: 0, card: "alaska" }])).toEqual(["card"]);
    expect(sounds([{ kind: "card-drawn", seat: 1 }])).toEqual([]);
  });

  it("sounds the end of the game as the viewer sees it", () => {
    expect(sounds([{ kind: "eliminated", seat: 0, by: 1, cardsTaken: 2 }])).toEqual(["defeat"]);
    expect(sounds([{ kind: "eliminated", seat: 2, by: 1, cardsTaken: 2 }])).toEqual(["eliminated"]);
    expect(sounds([{ kind: "game-over", winner: 0 }])).toEqual(["victory"]);
    expect(sounds([{ kind: "game-over", winner: 0 }], null)).toEqual(["victory"]);
    expect(sounds([{ kind: "game-over", winner: 1 }])).toEqual([]);
  });

  it("sounds a continent taken, but not one already held", () => {
    const held = holding(QUIET, "australia", 2);
    expect(soundsFor(named([captured(2, 1)]), 0, QUIET, held, false)).toEqual(["continent", "taken"]);
    expect(soundsFor(named([{ kind: "placed", owner: 2, territory: "eastern-australia", armies: 3 }]), 0, held, held, false)).toEqual(["place"]);
  });

  it("is silent when nothing was presented, even if the board moved under it", () => {
    expect(soundsFor([], 0, QUIET, holding(QUIET, "australia", 2), false)).toEqual([]);
  });

  it("merges a burst into its most telling few sounds, each once", () => {
    const burst: Bare[] = [
      ...Array.from({ length: 12 }, (): Bare => ({ kind: "blitzed", from: "alaska", to: "kamchatka", attackerLosses: 1, defenderLosses: 2 })),
      captured(1, 2),
      captured(1, 0),
      { kind: "placed", owner: 1, territory: "alaska", armies: 2 },
      { kind: "turn-started", seat: 0, turn: 4 },
    ];
    const heard = sounds(burst);
    expect(heard).toEqual(["turn", "lost"]);
    expect(heard.length).toBeLessThanOrEqual(MOST_AT_ONCE);
  });

  it("keeps a hidden tab to the news that should bring the player back", () => {
    expect(sounds([captured(1, 0), { kind: "turn-started", seat: 0, turn: 4 }], 0, true)).toEqual(["turn"]);
    expect(sounds([captured(1, 0)], 0, true)).toEqual([]);
  });
});

describe("heardSince", () => {
  const log: LoggedEvent[] = ["1:0", "1:1", "2:0"].map((id) => ({ id, event: { kind: "deck-reshuffled", rule: "test" } }));

  it("gives the events after the last one heard, and none again", () => {
    expect(heardSince(log, "1:0").map((e) => e.id)).toEqual(["1:1", "2:0"]);
    expect(heardSince(log, "2:0")).toEqual([]);
  });

  it("gives everything when nothing was heard yet, or the last heard fell off the front", () => {
    expect(heardSince(log, null)).toHaveLength(3);
    expect(heardSince(log, "0:5")).toHaveLength(3);
  });
});
