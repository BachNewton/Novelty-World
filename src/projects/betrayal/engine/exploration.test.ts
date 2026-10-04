import { describe, expect, it } from "vitest";
import { ENGINE } from "../game";
import {
  choose,
  eventTypes,
  offered,
  pendingDecision,
  testGame,
  waitingOn,
} from "../testing";
import type { GameState } from "../types";
import { traitValue } from "./explorers";
import { chooseOne, damage, endOngoing, gain, startOngoing } from "./effects";
import { apply, choices, start } from "./step-loop";

const labels = (state: GameState) => offered(state).map((c) => c.label);

describe("setup", () => {
  it("puts every explorer in the Entrance Hall on their starting traits, and starts the next birthday's turn", () => {
    const state = testGame();
    expect(state.explorers.map((e) => e.room)).toEqual([
      "entrance-hall",
      "entrance-hall",
      "entrance-hall",
    ]);
    expect(traitValue(ENGINE.catalog, state, 0, "speed")).toBe(4);
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
    expect(state.explorers[0].room).toBe("creaky-hallway");
    expect(state.turn?.moved).toBe(1);
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
    expect(state.explorers[0].cards).toEqual(["book"]);
    expect(state.turn?.movementEnded).toBe(true);
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
    expect(state.haunt).toEqual({
      number: 7,
      revealer: 0,
      omen: "book",
      room: "abandoned-room",
    });
    expect(state.pending).toBeNull();
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
    state.explorers[0].cards = ["axe"];
    state.explorers[1].cards = ["lucky-stone"];
    return state;
  }

  it("trades with an explorer in the same room once they accept", () => {
    let state = choose(
      twoInTheHall(),
      "Offer Ox Bellows your Axe for their Lucky Stone",
    );
    expect(waitingOn(state)).toBe(1);
    state = choose(state, "Accept the trade");
    expect(state.explorers[0].cards).toEqual(["lucky-stone"]);
    expect(state.explorers[1].cards).toEqual(["axe"]);
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
    expect(state.explorers[1].cards).toEqual(["lucky-stone", "axe"]);
    expect(state.piles["entrance-hall"]).toBeUndefined();
  });

  it("won't let a companion be traded or dropped", () => {
    const state = testGame();
    state.explorers[0].cards = ["dog"];
    expect(labels(state).filter((l) => l.includes("Dog"))).toEqual([]);
  });
});

describe("damage", () => {
  it("lets the player split it, offering each different outcome once", () => {
    const state = testGame();
    const after = start(ENGINE, { ...state, pending: null }, [
      damage(0, "physical", { points: 2 }, { source: "rulebook", page: 5 }),
    ]);
    expect(choices(ENGINE, after, 0).map((c) => c.label)).toEqual([
      "Take 2 Might and 0 Speed",
      "Take 1 Might and 1 Speed",
      "Take 0 Might and 2 Speed",
    ]);
  });

  it("takes the only outcome itself when traits are already at their lowest", () => {
    const state = testGame();
    state.explorers[0].clips.might = 0;
    state.explorers[0].clips.speed = 0;
    const after = start(ENGINE, { ...state, pending: null }, [
      damage(0, "physical", { points: 2 }, { source: "rulebook", page: 5 }),
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
        0,
        [
          { label: "Gain 1 Might", steps: [gain(0, "might", 1, rule)] },
          { label: "Gain 1 Sanity", steps: [gain(0, "sanity", 1, rule)] },
        ],
        rule,
      ),
    ]);
    const sanity = state.explorers[0].clips.sanity;
    const after = choose(state, "Gain 1 Sanity");
    expect(after.explorers[0].clips.sanity).toBe(sanity + 1);
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
  it("over random play, every offered choice applies", () => {
    for (const seed of ["a", "b", "c", "d", "e"]) {
      // Only cards with behaviours so far: one event, and items and omens whose text needs none to be held.
      let state = testGame({ seed });
      state.decks.event.draw = Array.from({ length: 10 }, () => "angry-being");
      for (let i = 0; i < 400 && state.pending?.type === "decision"; i++) {
        const options = choices(ENGINE, state, waitingOn(state));
        expect(options.length).toBeGreaterThan(0);
        const pick = options[(i * 7 + seed.charCodeAt(0)) % options.length];
        const result = apply(ENGINE, state, {
          kind: "choose",
          decision: pendingDecision(state).id,
          seat: waitingOn(state),
          choice: pick.choice,
        });
        expect(result.ok).toBe(true);
        if (result.ok) state = result.state;
      }
    }
  });
});
