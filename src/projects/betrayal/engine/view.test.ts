import { describe, expect, it } from "vitest";
import { logLines } from "../components/describe";
import { BASE_ENGINE, ENGINE } from "../game";
import { withHaunts } from "../kit/haunt";
import { simulate } from "../simulation";
import { choose, testGame, waitingOn } from "../testing";
import {
  ALL_TOY_ENGINE,
  HEROES_ONLY,
  SIGIL,
  toyBegun,
  toyHaunt,
  TRAITOR_ONLY,
  withSigil,
} from "../test/toy-haunt";
import { checkViews } from "../test/view-checks";
import type { Decision, GameEvent, GameState, Json } from "../types";
import { describeDecision, describeWaiting } from "./describe";
import { apply, type Engine } from "./step-loop";
import { viewFor } from "./view";

// Each kind of hidden material is looked for in the serialized view itself:
// absent for the seats that may not see it, present for those that may.

const SIGIL_ENGINE = withHaunts(BASE_ENGINE, [withSigil(toyHaunt(13))]);

const json = (engine: Engine, state: GameState, seat: number | null) =>
  JSON.stringify(viewFor(engine, state, seat));

const SEATS = [0, 1, 2, null] as const;

describe("before the haunt", () => {
  const stack = ["game-room", "vault", "wine-cellar"];
  const items = ["revolver", "dynamite", "medical-kit"];
  const state = testGame({ stack, decks: { item: items } });

  it("hides the stacks' order from everyone, showing their sizes", () => {
    for (const seat of SEATS) {
      const view = viewFor(ENGINE, state, seat);
      const text = JSON.stringify(view);
      for (const id of [...stack, ...items]) expect(text).not.toContain(`"${id}"`);
      expect(view.board.stack).toBe(state.board.stack.length);
      expect(view.decks.item.draw).toBe(state.decks.item.draw.length);
    }
  });

  it("leaves out the seed, the unfinished work and the rule memory", () => {
    for (const seat of SEATS) {
      const text = json(ENGINE, state, seat);
      expect(text).not.toContain(state.seed);
      for (const key of ["seed", "work", "nextId", "memory"])
        expect(text).not.toContain(`"${key}":`);
    }
  });

  it("shows the turn's choices only to the seat whose turn it is", () => {
    expect(waitingOn(state)).toBe(0);
    const own = viewFor(ENGINE, state, 0).pending;
    expect(own?.type === "decision" && own.detail?.choices.length).toBeGreaterThan(1);
    for (const seat of [1, 2, null]) {
      const view = viewFor(ENGINE, state, seat);
      expect(view.pending).toMatchObject({ type: "decision", kind: "turn", seats: [0] });
      expect(view.pending?.type === "decision" && view.pending.detail).toBeNull();
      expect(JSON.stringify(view)).not.toContain("End your turn");
      expect(describeWaiting(ENGINE, view, view.pending as never)).toBe(
        "Waiting for Zoe Ingstrom to decide (turn)",
      );
    }
  });

  it("shows no haunt text before the haunt", () => {
    for (const seat of SEATS) expect(viewFor(ENGINE, state, seat).haunt).toBeNull();
  });
});

describe("in a haunt", () => {
  // Ox (seat 1) is the traitor, beside Phantom 1; Zoe and Father are heroes.
  const state = toyBegun(SIGIL_ENGINE);

  it("gives each side its own half of the haunt, and a spectator neither", () => {
    expect(json(SIGIL_ENGINE, state, 1)).toContain(TRAITOR_ONLY);
    expect(json(SIGIL_ENGINE, state, 1)).not.toContain(HEROES_ONLY);
    for (const hero of [0, 2]) {
      expect(json(SIGIL_ENGINE, state, hero)).toContain(HEROES_ONLY);
      expect(json(SIGIL_ENGINE, state, hero)).not.toContain(TRAITOR_ONLY);
    }
    const spectator = json(SIGIL_ENGINE, state, null);
    expect(spectator).not.toContain(TRAITOR_ONLY);
    expect(spectator).not.toContain(HEROES_ONLY);
  });

  it("shows a secret's value only to the seats that know it", () => {
    expect(json(SIGIL_ENGINE, state, 1)).toContain(String(SIGIL));
    for (const seat of [0, 2, null]) {
      expect(json(SIGIL_ENGINE, state, seat)).not.toContain(String(SIGIL));
      const sigil = viewFor(SIGIL_ENGINE, state, seat).haunt?.secrets.find(
        (s) => s.id === "sigil",
      );
      // That it exists, and who knows it, is public.
      expect(sigil).toEqual({ id: "sigil", name: "sigil", knownBy: [1], known: false });
    }
  });

  it("hides a monster's trait values from the other side until they are known", () => {
    const traits = (seat: number | null) =>
      viewFor(SIGIL_ENGINE, state, seat).figures["phantom-1"].traits;
    expect(traits(1)).toEqual({ speed: 3, might: 4, sanity: 3 });
    // That it has Speed, Might and Sanity, and no Knowledge, is public.
    for (const seat of [0, 2, null])
      expect(traits(seat)).toEqual({ speed: null, might: null, sanity: null });

    const rolled = structuredClone(state);
    rolled.memory.traitsKnown.push({ definition: "phantom", trait: "might", value: 4 });
    expect(viewFor(SIGIL_ENGINE, rolled, 0).figures["phantom-1"].traits).toEqual({
      speed: null,
      might: 4,
      sanity: null,
    });
  });

  it("words the log from the view, as each seat may see it", () => {
    // The last seat's confirmation ran both setups, the sigil's included.
    for (const seat of SEATS) {
      const lines = logLines(SIGIL_ENGINE, viewFor(SIGIL_ENGINE, state, seat));
      const text = lines.map((l) => l.text).join(" | ");
      expect(text).toContain("The sigil is written down, known to Ox Bellows.");
      expect(text).not.toContain(String(SIGIL));
    }
  });

  it("passes every leak check for every seat and the spectator", () => {
    checkViews(SIGIL_ENGINE, state);
  });
});

describe("secret sides", () => {
  // Haunt 1 isn't built, so a scenario sets its sides: Ox is the traitor,
  // known only to himself; each hero knows their own side and Ox knows all.
  const state = testGame({
    haunt: { number: 1, revealer: 0 },
    sides: [
      { seat: 0, side: "heroes", knownBy: [0, 1] },
      { seat: 1, side: "traitor", roles: ["traitor"], knownBy: [1] },
      { seat: 2, side: "heroes", knownBy: [2, 1] },
    ],
  });

  it("hides another seat's side from the seats that don't know it", () => {
    for (const seat of [0, 2, null]) {
      const view = viewFor(ENGINE, state, seat);
      expect(view.seats[1]).toMatchObject({ side: null, roles: [], hidden: true, secret: true });
      expect(JSON.stringify(view)).not.toContain('"traitor"');
    }
    const traitor = viewFor(ENGINE, state, 1);
    expect(traitor.seats.map((s) => s.side)).toEqual(["heroes", "traitor", "heroes"]);
    expect(viewFor(ENGINE, state, 0).seats[0].side).toBe("heroes");
    expect(viewFor(ENGINE, state, 0).seats[2]).toMatchObject({ side: null, hidden: true });
  });

  it("tells the others only that a side was set in secret", () => {
    const lines = (seat: number | null) =>
      logLines(ENGINE, viewFor(ENGINE, state, seat)).map((l) => l.text);
    expect(lines(0)).toContain("Scenario: Ox Bellows is given a side in secret.");
    expect(lines(0)).toContain("Scenario: Zoe Ingstrom is a hero, which is kept secret.");
    expect(lines(1)).toContain("Scenario: Ox Bellows is the traitor, which is kept secret.");
    expect(lines(null)).not.toContain("Scenario: Zoe Ingstrom is a hero, which is kept secret.");
  });

  it("passes every leak check", () => {
    checkViews(ENGINE, state);
  });
});

describe("a shared decision", () => {
  // A vote put to every seat at once, each with answers of its own.
  const VOTE_ENGINE: Engine = {
    ...ENGINE,
    rules: {
      ...ENGINE.rules,
      decisions: {
        ...ENGINE.rules.decisions,
        vote: {
          candidates: (_state, _decision, seat) => [`seat${seat}-aye`, `seat${seat}-nay`],
          label: (_state, _decision, choice) => `Vote ${String(choice)}`,
          resolve: () => null,
        },
      },
    },
  };
  const voting = (answers: Record<number, Json>): GameState => {
    const state = testGame();
    const decision: Decision = {
      type: "decision",
      id: "d-vote",
      seats: [0, 1, 2],
      kind: "vote",
      params: null,
      rule: { source: "scenario" },
      answers,
    };
    return { ...state, pending: decision, lastEvents: [] };
  };

  it("hides the answers given until the last is in", () => {
    const state = voting({ 0: "seat0-nay" });
    for (const seat of [1, 2, null]) {
      const view = viewFor(VOTE_ENGINE, state, seat);
      expect(JSON.stringify(view)).not.toContain("seat0-");
      expect(view.pending).toMatchObject({ answered: [0] });
    }
    const own = viewFor(VOTE_ENGINE, state, 0).pending;
    expect(own?.type === "decision" && own.detail).toEqual({
      params: null,
      choices: [],
      answer: "seat0-nay",
    });
    const next = viewFor(VOTE_ENGINE, state, 1).pending;
    expect(next?.type === "decision" && next.detail?.choices.map((c) => c.label)).toEqual([
      "Vote seat1-aye",
      "Vote seat1-nay",
    ]);
  });

  it("closes once every seat has answered", () => {
    let state = voting({ 0: "seat0-nay" });
    for (const seat of [1, 2]) {
      const result = apply(VOTE_ENGINE, state, {
        kind: "choose",
        decision: "d-vote",
        seat,
        choice: `seat${seat}-aye`,
      });
      if (!result.ok) throw new Error(result.reason);
      state = result.state;
    }
    expect(viewFor(VOTE_ENGINE, state, 1).pending?.type).not.toBe("decision");
  });
});

describe("events only some seats may see", () => {
  const withEvent = (type: string, data: Json): GameState => {
    const event: GameEvent = { id: "x:0", type, rule: { source: "scenario" }, data };
    return { ...testGame(), lastEvents: [event] };
  };

  it("shows what a figure looked at only to its seat", () => {
    const seen = withEvent("room-stack-seen", { figure: "zoe-ingstrom", tile: "vault" });
    expect(json(ENGINE, seen, 0)).toContain('"vault"');
    for (const seat of [1, 2, null]) expect(json(ENGINE, seen, seat)).not.toContain('"vault"');

    const stacked = withEvent("deck-stacked", {
      figure: "ox-bellows",
      type: "item",
      card: "revolver",
    });
    expect(json(ENGINE, stacked, 1)).toContain('"revolver"');
    for (const seat of [0, 2, null])
      expect(json(ENGINE, stacked, seat)).not.toContain('"revolver"');
  });

  it("shows a forced step's one choice only to the seat it was put to", () => {
    const forced = withEvent("forced", {
      seat: 2,
      kind: "choose-one",
      choice: 0,
      label: "Put the Revolver on top of the item stack",
    });
    expect(json(ENGINE, forced, 2)).toContain("Revolver");
    const other = viewFor(ENGINE, forced, 0);
    expect(JSON.stringify(other)).not.toContain("Revolver");
    expect(logLines(ENGINE, other).map((l) => l.text)).toEqual([
      "Scenario: Father Rhinehardt has only one choice.",
    ]);
  });
});

describe("describe on views", () => {
  it("words the pending question from the addressee's view", () => {
    const state = testGame();
    const view = viewFor(ENGINE, state, 0);
    const pending = view.pending;
    if (pending?.type !== "decision" || pending.detail === null)
      throw new Error("The turn isn't put to seat 0");
    expect(
      describeDecision(ENGINE, view, { ...pending, params: pending.detail.params }),
    ).toBe("Zoe Ingstrom's turn: what next?");
    const next = choose(state, "End your turn");
    expect(viewFor(ENGINE, next, 1).pending).toMatchObject({ seats: [1] });
  });
});

// Random play through the toy haunt, checking every seat's view and a
// spectator's after every write. The seeds reach a Crystal Ball and a
// Spirit Board looking at the stacks (v4, v10) and both hidden-traitor
// haunts (v55: 34, v118: 43).
describe("every view of random games", () => {
  it.each(["v0", "v4", "v10", "v55", "v118"])(
    "seed %s through the toy haunt",
    (seed) => {
      simulate(seed, ALL_TOY_ENGINE, (state) => {
        checkViews(ALL_TOY_ENGINE, state);
      });
    },
    60_000,
  );

  it.each(["v0", "v1"])(
    "seed %s before the haunt",
    (seed) => {
      simulate(seed, ENGINE, (state) => {
        checkViews(ENGINE, state);
      });
    },
    60_000,
  );
});
