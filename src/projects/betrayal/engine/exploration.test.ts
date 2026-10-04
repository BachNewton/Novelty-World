import { describe, expect, it } from "vitest";
import { ENGINE } from "../game";
import {
  at,
  choose,
  eventTypes,
  explorer,
  offered,
  pendingDecision,
  put,
  testGame,
  waitingOn,
} from "../testing";
import type { GameState } from "../types";
import { traitValue } from "./questions";
import {
  cardCount,
  cardFlag,
  chooseOne,
  damage,
  discardCard,
  drawCard,
  endOngoing,
  gain,
  keepCard,
  loseCard,
  markCard,
  returnToDeck,
  startOngoing,
  step,
} from "./effects";
import { NO_HAUNT_ENGINE, simulate } from "../simulation";
import { choices, start } from "./step-loop";

const labels = (state: GameState) => offered(state).map((c) => c.label);

/** Seat 0's and seat 1's explorers, by figure id. */
const ZOE = "zoe-ingstrom";
const OX = "ox-bellows";

describe("setup", () => {
  it("puts every explorer in the Entrance Hall on their starting traits, and starts the next birthday's turn", () => {
    const state = testGame();
    expect([0, 1, 2].map((seat) => at(state, seat).room)).toEqual([
      "entrance-hall",
      "entrance-hall",
      "entrance-hall",
    ]);
    expect(traitValue(ENGINE, state, ZOE, "speed")).toBe(4);
    expect(state.turn?.seat).toBe(0);
    expect(waitingOn(state)).toBe(0);
    expect(state.decks.omen.draw).toHaveLength(13);
    expect(state.decks.item.draw).toHaveLength(22);
    expect(state.decks.event.draw).toHaveLength(45);
  });

  it("refuses two explorers from one character card", () => {
    expect(() =>
      testGame({
        characters: ["zoe-ingstrom", "missy-dubourde", "ox-bellows"],
      }),
    ).toThrow(/yellow card/);
  });
});

describe("the turn", () => {
  it("offers moving, exploring each open doorway, and ending the turn", () => {
    expect(labels(testGame())).toEqual([
      "Move to the Foyer",
      "Explore through the north door of the Entrance Hall",
      "Explore through the south door of the Entrance Hall",
      "End your turn",
    ]);
  });

  it("allows moves up to the explorer's Speed", () => {
    // Zoe's Speed is 4.
    const moving = (state: GameState) =>
      labels(state).some(
        (l) => l.startsWith("Move") || l.startsWith("Explore"),
      );
    let state = testGame();
    for (const room of ["Foyer", "Grand Staircase", "Upper Landing"])
      state = choose(state, `Move to the ${room}`);
    expect(moving(state)).toBe(true);
    // The fourth move uses the last of it. Ending the turn is then the only choice, so the engine takes it.
    state = choose(state, "Move to the Grand Staircase");
    expect(eventTypes(state)).toContain("forced");
    expect(state.turn?.seat).toBe(1);
  });

  it("passes to the next seat when a turn ends", () => {
    const state = choose(testGame(), "End your turn");
    expect(state.turn?.seat).toBe(1);
    expect(waitingOn(state)).toBe(1);
  });
});

describe("discovering a room", () => {
  it("skips tiles for other floors, places the room, and moves the explorer in", () => {
    // The Crypt is basement-only, so it goes to the discard pile; a four-door hallway fits any way round.
    const state = choose(
      testGame({ stack: ["crypt", "creaky-hallway"] }),
      "Explore through the north door",
    );
    expect(state.board.discards).toEqual(["crypt"]);
    expect(state.board.tiles.at(-1)).toMatchObject({
      tile: "creaky-hallway",
      floor: "ground",
      x: 2,
      y: -1,
    });
    expect(at(state, 0).room).toBe("creaky-hallway");
    expect(state.turn?.moved).toEqual({ [ZOE]: 1 });
    expect(eventTypes(state)).toContain("discovered");
  });

  it("lets the player choose between placements that leave different doorways", () => {
    // The Organ Room's doors are left and bottom: entering from the south, it can open west or east.
    const state = choose(
      testGame({ stack: ["organ-room"] }),
      "Explore through the north door",
    );
    expect(pendingDecision(state).kind).toBe("rotation");
    expect(offered(state)).toHaveLength(2);
  });

  it("draws the room's card, which ends movement", () => {
    let state = testGame({
      stack: ["abandoned-room"],
      decks: { omen: ["book"] },
    });
    state = choose(state, "Explore through the north door");
    expect(explorer(state, 0).cards).toEqual(["book"]);
    expect(state.turn?.movementEnded).toEqual([ZOE]);
    expect(labels(state).some((l) => l.startsWith("Move"))).toBe(false);
  });
});

describe("omens and the haunt roll", () => {
  it("reveals the haunt from the chart when the roll is under the omens drawn", () => {
    let state = testGame({
      stack: ["abandoned-room"],
      decks: { omen: ["book"] },
    });
    // With 12 omens already out, the 13th makes any 6-dice roll (at most 12) start the haunt.
    state.omensDrawn = 12;
    state = choose(state, "Explore through the north door");
    state = choose(state, "End your turn");
    expect(state.status).toBe("haunt");
    expect(state.haunt).toMatchObject({
      number: 7,
      revealer: 0,
      omen: "book",
      room: "abandoned-room",
    });
    expect(state.pending).toBeNull();
  });

  it("has whoever drew the omen make its roll, at the end of the turn it was drawn on (rules.md's project ruling)", () => {
    const base = testGame({ decks: { omen: ["book"] } });
    base.board.tiles.push({
      tile: "abandoned-room",
      floor: "ground",
      x: 9,
      y: 9,
      rotation: 0,
    });
    put(base, 1, "abandoned-room");
    base.omensDrawn = 12;
    // Ox draws the Book on Zoe's turn.
    let state = start(ENGINE, { ...base, pending: null }, [
      drawCard(OX, "omen", { source: "rulebook", page: 10 }),
      step("turn-menu", { seat: 0 }),
    ]);
    state = choose(state, "End your turn");
    const rolled = state.lastEvents.find((e) => e.type === "rolled");
    expect((rolled?.data as { figure: string }).figure).toBe(OX);
    expect(state.haunt).toMatchObject({
      revealer: 1,
      omen: "book",
      room: "abandoned-room",
    });
  });

  it("holds the haunt off when the roll isn't under the omens drawn", () => {
    let state = testGame({
      stack: ["abandoned-room"],
      decks: { omen: ["book"] },
    });
    state = choose(state, "Explore through the north door");
    // The first omen: the haunt starts only on a roll under 1, which is 0.
    state = choose(state, "End your turn");
    const rolled = state.lastEvents.find((e) => e.type === "rolled");
    const result = (rolled?.data as { result: number }).result;
    expect(state.status).toBe(result < 1 ? "haunt" : "exploring");
  });
});

describe("items", () => {
  function twoInTheHall(): GameState {
    const state = testGame();
    explorer(state, 0).cards = ["axe"];
    explorer(state, 1).cards = ["lucky-stone"];
    return state;
  }

  it("trades with an explorer in the same room once they accept", () => {
    let state = choose(
      twoInTheHall(),
      "Offer Ox Bellows your Axe for their Lucky Stone",
    );
    expect(waitingOn(state)).toBe(1);
    state = choose(state, "Accept the trade");
    expect(explorer(state, 0).cards).toEqual(["lucky-stone"]);
    expect(explorer(state, 1).cards).toEqual(["axe"]);
    expect(
      labels(state).some((l) => l.startsWith("Offer") || l.startsWith("Give")),
    ).toBe(false);
    // Each card allows one action a turn, so the traded Lucky Stone can't be dropped now.
    expect(labels(state)).not.toContain("Drop the Lucky Stone");
  });

  it("drops items into a pile that others can pick up", () => {
    let state = choose(twoInTheHall(), "Drop the Axe");
    expect(state.piles["entrance-hall"]).toEqual(["axe"]);
    state = choose(state, "End your turn");
    state = choose(state, "Pick up the Axe");
    expect(explorer(state, 1).cards).toEqual(["lucky-stone", "axe"]);
    expect(state.piles["entrance-hall"]).toBeUndefined();
  });

  it("won't let a companion be traded or dropped", () => {
    const state = testGame();
    explorer(state, 0).cards = ["dog"];
    expect(
      labels(state).filter((l) => /^(Drop|Offer|Give).*Dog/.test(l)),
    ).toEqual([]);
  });
});

describe("damage", () => {
  it("lets the player split it, offering each different outcome once", () => {
    const state = testGame();
    const after = start(ENGINE, { ...state, pending: null }, [
      damage(ZOE, "physical", { points: 2 }, { source: "rulebook", page: 5 }),
    ]);
    expect(choices(ENGINE, after, 0).map((c) => c.label)).toEqual([
      "Take 2 Might and 0 Speed",
      "Take 1 Might and 1 Speed",
      "Take 0 Might and 2 Speed",
    ]);
  });

  it("takes the only outcome itself when traits are already at their lowest", () => {
    const state = testGame();
    explorer(state, 0).traits.clips.might = 0;
    explorer(state, 0).traits.clips.speed = 0;
    const after = start(ENGINE, { ...state, pending: null }, [
      damage(ZOE, "physical", { points: 2 }, { source: "rulebook", page: 5 }),
    ]);
    expect(after.pending).toBeNull();
    expect(eventTypes(after)).toEqual(["forced", "damaged"]);
  });
});

describe("effects", () => {
  const rule = { source: "rulebook", page: 5 } as const;

  it("chooseOne offers each option by its label and runs the chosen option's steps", () => {
    const state = start(ENGINE, { ...testGame(), pending: null }, [
      chooseOne(
        ZOE,
        [
          { label: "Gain 1 Might", steps: [gain(ZOE, "might", 1, rule)] },
          { label: "Gain 1 Sanity", steps: [gain(ZOE, "sanity", 1, rule)] },
        ],
        rule,
      ),
    ]);
    const sanity = explorer(state, 0).traits.clips.sanity;
    const after = choose(state, "Gain 1 Sanity");
    expect(explorer(after, 0).traits.clips.sanity).toBe(sanity + 1);
  });

  it("keeps an ongoing event out of the discard pile until it ends", () => {
    const state = start(ENGINE, { ...testGame(), pending: null }, [
      startOngoing("angry-being"),
    ]);
    expect(state.ongoing).toEqual(["angry-being"]);
    const ended = start(ENGINE, state, [endOngoing("angry-being")]);
    expect(ended.ongoing).toEqual([]);
    expect(ended.decks.event.discard).toContain("angry-being");
  });
});

describe("the choices offered are exactly the legal ones", () => {
  /** A whole game takes a few seconds. */
  const GAME_TIMEOUT = 30_000;

  // The simulation checks, at every decision of a whole game played with the
  // full decks, that every listed choice applies and every candidate left out
  // doesn't. simulation.slow.test.ts sweeps many more seeds.
  it.each(["a", "b", "c"])(
    "over random play to the haunt or a full house, seed %s",
    (seed) => {
      expect(["haunt", "house-full"]).toContain(simulate(seed).ending);
    },
    GAME_TIMEOUT,
  );

  it.each(["a", "b"])(
    "over random play with the haunt held off until the house is full, seed %s",
    (seed) => {
      expect(simulate(seed, NO_HAUNT_ENGINE).ending).toBe("house-full");
    },
    GAME_TIMEOUT,
  );
});

describe("cards changing hands", () => {
  const rule = { source: "rulebook", page: 11 } as const;
  const gained = (state: GameState) =>
    state.lastEvents
      .filter((e) => e.type === "card-gained")
      .map((e) => e.data as { figure: string; card: string; by: string });
  const idle = (state: GameState) => ({ ...state, pending: null });

  it("raises card-gained however a card is gained", () => {
    const base = testGame({ decks: { item: ["axe"] } });
    const drawn = start(ENGINE, idle(base), [drawCard(ZOE, "item", rule)]);
    expect(gained(drawn)).toEqual([{ figure: ZOE, card: "axe", by: "drawn" }]);

    const kept = start(ENGINE, idle(base), [keepCard(ZOE, "lights-out")]);
    expect(gained(kept)).toEqual([{ figure: ZOE, card: "lights-out", by: "kept" }]);

    const pile = testGame();
    pile.piles["entrance-hall"] = ["axe"];
    expect(gained(choose(pile, "Pick up the Axe"))).toEqual([
      { figure: ZOE, card: "axe", by: "picked-up" },
    ]);

    const trade = testGame();
    explorer(trade, 0).cards = ["axe"];
    explorer(trade, 1).cards = ["lucky-stone"];
    const traded = choose(
      choose(trade, "Offer Ox Bellows your Axe for their Lucky Stone"),
      "Accept the trade",
    );
    expect(gained(traded)).toEqual([
      { figure: OX, card: "axe", by: "traded" },
      { figure: ZOE, card: "lucky-stone", by: "traded" },
    ]);
  });

  it("keeps a card's marks for as long as they last", () => {
    const state = testGame();
    explorer(state, 0).cards = ["axe", "lucky-stone"];
    const marked = start(ENGINE, idle(state), [
      markCard("axe", "held", true, "holder", rule),
      markCard("axe", "count", 2, "play", rule),
      markCard("lucky-stone", "count", 1, "play", rule),
    ]);
    expect(cardFlag(marked, "axe", "held")).toBe(true);
    expect(cardCount(marked, "axe", "count")).toBe(2);

    // Leaving its holder clears the holder's marks; the card's own stay with it.
    const dropped = start(ENGINE, marked, [
      loseCard(ZOE, "axe", { to: "room", room: "entrance-hall" }, rule),
    ]);
    expect(cardFlag(dropped, "axe", "held")).toBe(false);
    expect(cardCount(dropped, "axe", "count")).toBe(2);

    // Leaving play clears them all.
    const discarded = start(ENGINE, marked, [discardCard(ZOE, "lucky-stone")]);
    expect(discarded.cardMarks["lucky-stone"]).toBeUndefined();
    expect(cardCount(discarded, "axe", "count")).toBe(2);
  });

  it("returns a held card to its deck, shuffles the deck, and runs the card's onLose", () => {
    const state = testGame();
    state.decks.item.draw = state.decks.item.draw.filter((c) => c !== "bell");
    explorer(state, 0).cards = ["bell"];
    const before = explorer(state, 0).traits.clips.sanity;
    const after = start(ENGINE, idle(state), [returnToDeck(ZOE, "bell", rule)]);
    expect(explorer(after, 0).cards).toEqual([]);
    expect([...after.decks.item.draw].sort()).toEqual(
      [...state.decks.item.draw, "bell"].sort(),
    );
    expect(after.decks.item.draw).not.toEqual([
      ...state.decks.item.draw,
      "bell",
    ]);
    // The Bell: "If you lose the Bell, lose 1 Sanity."
    expect(explorer(after, 0).traits.clips.sanity).toBe(before - 1);
  });
});
