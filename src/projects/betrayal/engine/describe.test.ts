import { describe, expect, it } from "vitest";
import { ENGINE } from "../game";
import { pendingDecision, testGame, waitingOn, spectator } from "../testing";
import type { GameEvent, GameState, Json, RuleRef } from "../types";
import { describeDecision, describeEvent, describeRule } from "./describe";
import { apply, choices } from "./step-loop";

const event = (type: string, rule: RuleRef, data: Json): GameEvent => ({
  id: "d0.0:0",
  type,
  rule,
  data,
});

const text = (e: GameEvent, state: GameState = testGame()) =>
  describeEvent(ENGINE, spectator(state, ENGINE), e);

describe("describeEvent", () => {
  it("tells of a card set aside out of the game, and a death no trait caused", () => {
    expect(
      text(
        event(
          "card-lost",
          { source: "haunt", haunt: 13, section: "Setup" },
          {
            figure: "zoe-ingstrom",
            card: "dog",
            destination: { to: "aside", room: null },
          },
        ),
      ),
    ).toBe("Zoe Ingstrom's Dog is set aside, out of the game.");
    expect(
      text(
        event(
          "died",
          { source: "rulebook", page: 5 },
          {
            figure: "ox-bellows",
            trait: null,
            cause: { source: "haunt", haunt: 22, section: "Rules" },
            killer: null,
            room: "foyer",
          },
        ),
      ),
    ).toBe("Ox Bellows dies in the Foyer (Haunt 22, Rules).");
  });

  it("says what happened and names the room, card or token rule behind it", () => {
    expect(
      text(
        event(
          "rolled",
          { source: "room", room: "junk-room" },
          {
            figure: "zoe-ingstrom",
            spec: { kind: "trait", trait: "might" },
            dice: [1, 2, 0],
            named: null,
            bonus: 0,
            result: 3,
          },
        ),
      ),
    ).toBe("Junk Room: Zoe Ingstrom's Might roll: rolls 3 (dice 1, 2, 0).");
    expect(
      text(
        event(
          "trait-changed",
          { source: "card", card: "bell" },
          { figure: "ox-bellows", trait: "sanity", spaces: 1 },
        ),
      ),
    ).toBe("Bell: Ox Bellows gains 1 Sanity.");
  });

  it("leaves out the rulebook, and a card's name where the sentence already says it", () => {
    expect(
      text(
        event(
          "entered",
          { source: "rulebook", page: 6 },
          { figure: "zoe-ingstrom", room: "foyer", moved: true },
        ),
      ),
    ).toBe("Zoe Ingstrom enters the Foyer.");
    expect(
      text(
        event(
          "card-lost",
          { source: "card", card: "angel-feather" },
          { figure: "zoe-ingstrom", card: "angel-feather", destination: { to: "discard" } },
        ),
      ),
    ).toBe("Zoe Ingstrom discards the Angel Feather.");
  });

  it("is silent for bookkeeping another event already tells", () => {
    const rule: RuleRef = { source: "rulebook", page: 10 };
    expect(
      text(event("card-gained", rule, { figure: "zoe-ingstrom", card: "axe", by: "drawn" })),
    ).toBeNull();
    expect(
      text(
        event("card-gained", rule, { figure: "zoe-ingstrom", card: "axe", by: "picked-up" }),
      ),
    ).toBe("Zoe Ingstrom picks up the Axe.");
  });

  it("uses a card's own wording where it gives one", () => {
    expect(
      text(
        event(
          "card-marked",
          { source: "card", card: "mask" },
          { card: "mask", name: "worn", value: true },
        ),
      ),
    ).toBe("Mask: The Mask is put on.");
  });

  it("words staying in a room, changed damage and a reordered stack", () => {
    expect(
      text(
        event(
          "stayed",
          { source: "room", room: "junk-room" },
          { figure: "zoe-ingstrom", room: "junk-room" },
        ),
      ),
    ).toBe(
      "Junk Room: Zoe Ingstrom stays in the Junk Room and moves no further this turn.",
    );
    expect(
      text(
        event(
          "damage-converted",
          { source: "card", card: "skull" },
          { figure: "zoe-ingstrom", from: "mental", to: "physical" },
        ),
      ),
    ).toBe(
      "Skull: Zoe Ingstrom takes the mental damage as physical damage instead.",
    );
    expect(
      text(
        event(
          "stack-reordered",
          { source: "card", card: "it-is-meant-to-be" },
          { figure: "zoe-ingstrom", stack: "item" },
        ),
      ),
    ).toBe(
      "It Is Meant to Be: Zoe Ingstrom looks at the top of the item stack and puts them back in an order only they know.",
    );
  });

  it("says what a forced step chose", () => {
    const forced = event(
      "forced",
      { source: "card", card: "angry-being" },
      {
        seat: 0,
        kind: "split-damage",
        choice: null,
        label: "Take 1 Might and 0 Speed",
      },
    );
    expect(text(forced)).toBe(
      "Angry Being: Zoe Ingstrom: Take 1 Might and 0 Speed (the only choice).",
    );
  });

  it("tells a scenario's setup, naming the scenario as its source", () => {
    const state = testGame({
      first: 1,
      explorers: [{ seat: 0, room: "chapel", clips: { might: 7 } }],
      decks: { omen: ["dog"] },
    });
    const lines = state.lastEvents.map((e) => text(e, state));
    expect(lines).toContain(
      "Scenario: The game begins. Ox Bellows goes first.",
    );
    expect(lines).toContain(
      "Scenario: The Chapel is put in the house, on the upper floor.",
    );
    expect(lines).toContain(
      "Scenario: Zoe Ingstrom starts in the Chapel and starts with Might 7.",
    );
  });

  it("tells a haunt a scenario starts", () => {
    const state = testGame({ haunt: { number: 13, revealer: 1 } });
    const started = state.lastEvents.find((e) => e.type === "haunt-started");
    if (!started) throw new Error("No haunt-started event");
    expect(text(started, state)).toMatch(
      /^Scenario: Haunt 13 begins, revealed by Ox Bellows with the .+ in the .+\.$/,
    );
  });

  it("fails loudly on an event type it can't describe", () => {
    expect(() =>
      text(event("nonsense", { source: "rulebook", page: 1 }, null)),
    ).toThrow(/nonsense/);
  });

  it("describes every event and decision of random play", () => {
    for (const seed of ["a", "b", "c", "d", "e"]) {
      let state = testGame({ seed });
      state.decks.event.draw = Array.from({ length: 10 }, () => "angry-being");
      for (let i = 0; i < 300 && state.pending?.type === "decision"; i++) {
        for (const e of state.lastEvents) {
          const line = describeEvent(ENGINE, spectator(state, ENGINE), e);
          if (line !== null) expect(line).toMatch(/\.$/);
        }
        expect(
          describeDecision(ENGINE, spectator(state, ENGINE), pendingDecision(state)),
        ).not.toBe("");
        const options = choices(ENGINE, state, waitingOn(state));
        const pick = options[(i * 7 + seed.charCodeAt(0)) % options.length];
        const result = apply(ENGINE, state, {
          kind: "choose",
          decision: pendingDecision(state).id,
          seat: waitingOn(state),
          choice: pick.choice,
        });
        if (!result.ok) throw new Error(result.reason);
        state = result.state;
      }
    }
  });
});

describe("describeDecision", () => {
  it("says who is asked what", () => {
    const state = testGame();
    expect(describeDecision(ENGINE, spectator(state, ENGINE), pendingDecision(state))).toBe(
      "Zoe Ingstrom's turn: what next?",
    );
  });
});

describe("describeRule", () => {
  it("names the rule's source", () => {
    expect(describeRule(ENGINE, { source: "rulebook", page: 6 })).toBe(
      "Rulebook, p. 6",
    );
    expect(describeRule(ENGINE, { source: "card", card: "bell" })).toBe("Bell");
    expect(describeRule(ENGINE, { source: "scenario" })).toBe("Scenario");
  });
});
