import { describe, expect, it } from "vitest";
import { BASE_ENGINE, ENGINE } from "../game";
import { withHaunts } from "../kit/haunt";
import { simulate } from "../simulation";
import { ALL_TOY_ENGINE, TOY_ENGINE, toyHaunt } from "../test/toy-haunt";
import {
  choose,
  eventTypes,
  offered,
  ready,
  testGame,
  type TestGame,
  spectator,
} from "../testing";
import type { Action, GameEvent, GameState, TurnKind } from "../types";
import { describeEvent } from "./describe";
import { traitValue } from "./questions";
import { die, removeStatus } from "./effects";
import { revealSecret } from "./haunt";
import { hauntSourceId, local } from "./sources";
import { apply, start, type Engine } from "./step-loop";

// The haunt framework, played through a toy haunt built from the kit
// (test/toy-haunt.ts): the reveal in the order rules.md settles it, the
// chart's traitor rules, turn order recomputed at every boundary, inserted
// turns, conditions and the game's result.

const ZOE = "zoe-ingstrom";
const OX = "ox-bellows";
const FATHER = "father-rhinehardt";
const VIVIAN = "vivian-lopez";
const PHANTOM_1 = "phantom-1";

/** Haunt 13 started by seat 0. Its chart rule is the lowest Sanity except
 *  the revealer, which with the default explorers is Ox, seat 1. */
const hauntGame = (options: TestGame = {}) =>
  testGame({ engine: TOY_ENGINE, haunt: { number: 13, revealer: 0 }, ...options });

const readyAll = (state: GameState, engine: Engine = TOY_ENGINE) =>
  state.seats.reduce((s, _seat, i) => ready(s, i, engine), state);

const data = <T>(event: GameEvent) => event.data as T;

const turnsStarted = (state: GameState) =>
  state.lastEvents
    .filter((e) => e.type === "turn-started")
    .map((e) => {
      const d = data<{ seat: number; kind: TurnKind }>(e);
      return [d.seat, d.kind];
    });

const describeAll = (engine: Engine, state: GameState) =>
  state.lastEvents.flatMap((e) => describeEvent(engine, spectator(state, engine), e) ?? []);

/** Takes a seat's explorer out of the game, as a test's setup. */
function kill(state: GameState, figure: string): void {
  state.figures[figure].alive = false;
  state.figures[figure].place = null;
}

describe("the haunt's reveal", () => {
  it("chooses the traitor, waits for every seat to be ready in any order, then runs the traitor's setup, the heroes', and the turn on the traitor's left", () => {
    let state = hauntGame();
    expect(state.seats.map((s) => [s.side, s.roles])).toEqual([
      ["heroes", []],
      ["traitor", ["traitor"]],
      ["heroes", []],
    ]);
    // The traitor's side is told first, then the heroes'.
    expect(
      state.lastEvents
        .filter((e) => e.type === "side-set")
        .map((e) => data<{ seat: number }>(e).seat),
    ).toEqual([1, 0, 2]);
    expect(state.pending).toMatchObject({ type: "ready", seats: [0, 1, 2] });
    expect(eventTypes(state)).not.toContain("haunt-setup");

    state = ready(state, 2, TOY_ENGINE);
    expect(state.pending).toMatchObject({ type: "ready", seats: [0, 1] });
    const wait = state.pending?.id ?? "";
    expect(
      apply(TOY_ENGINE, state, { kind: "ready", wait, seat: 2 }).ok,
    ).toBe(false);
    state = ready(state, 0, TOY_ENGINE);
    state = ready(state, 1, TOY_ENGINE);

    expect(eventTypes(state)).toEqual([
      "ready",
      "haunt-setup",
      "status-added",
      "spawned",
      "counter-changed",
      "secret-set",
      "haunt-setup",
      "counter-changed",
      "turn-started",
    ]);
    expect(turnsStarted(state)).toEqual([[2, "explorer"]]);
    expect(state.figures[OX].statuses.map((s) => s.id)).toEqual(["dozing"]);
    expect(describeAll(TOY_ENGINE, state)).toEqual([
      "Ox Bellows is ready.",
      "The traitor carries out the haunt's setup.",
      "Ox Bellows is now asleep.",
      "Phantom 1 appears in the Entrance Hall.",
      "Escaped nightmares: 0.",
      "The number of escapes is written down, known to Ox Bellows.",
      "The heroes carry out the haunt's setup.",
      "Wake tokens: 0.",
      "Father Rhinehardt's turn.",
    ]);
  });

  it("shows a secret to everyone, and takes a status off, saying so", () => {
    const rule = { source: "haunt", haunt: 13, section: "Rules" } as const;
    const state = start(TOY_ENGINE, { ...readyAll(hauntGame()), pending: null }, [
      revealSecret("target", rule),
      removeStatus(OX, "dozing", rule),
    ]);
    expect(state.haunt?.secrets[0].knownBy).toBeNull();
    expect(state.figures[OX].statuses).toEqual([]);
    expect(describeAll(TOY_ENGINE, state)).toEqual([
      "The number of escapes is shown to everyone: 3.",
      "Ox Bellows is no longer asleep.",
    ]);
  });

  it("keeps a secret's value out of its event, naming it by id", () => {
    const state = readyAll(hauntGame());
    expect(state.haunt?.secrets).toEqual([
      { id: "target", value: 3, knownBy: [1] },
    ]);
    const set = state.lastEvents.find((e) => e.type === "secret-set");
    expect(set?.data).toEqual({ secret: "target", knownBy: [1] });
  });

  it("ends the revealer's turn: after a haunt roll, play starts on the traitor's left", () => {
    // Haunt 7's traitor is Father Rhinehardt, seat 2, so play starts with
    // seat 0, who revealed it, rather than going on to seat 1.
    const engine = withHaunts(BASE_ENGINE, [toyHaunt(7)]);
    let state = testGame({
      engine,
      stack: ["abandoned-room"],
      decks: { omen: ["book"] },
    });
    state.omensDrawn = 12;
    state = choose(state, "Explore through the north door", engine);
    state = choose(state, "End your turn", engine);
    expect(state.status).toBe("haunt");
    expect(state.turn).toBeNull();
    expect(state.seats[2].roles).toEqual(["traitor"]);
    state = readyAll(state, engine);
    expect(turnsStarted(state)).toEqual([[0, "explorer"]]);
  });

  it("frees the new traitor from the event cards impeding them (ruling traitor-freed)", () => {
    let state = hauntGame({ explorers: [{ seat: 1, cards: ["webs", "it-is-meant-to-be"] }] });
    expect(state.figures[OX].cards).toEqual(["it-is-meant-to-be"]);
    expect(state.decks.event.discard).toContain("webs");
    state = readyAll(state);
    expect(state.status).toBe("haunt");
  });

  it("stops at the reveal of a haunt that isn't built, keeping a scenario's sides", () => {
    const state = testGame({
      haunt: { number: 14, revealer: 0 },
      sides: [{ seat: 2, side: "traitor", roles: ["traitor"] }],
    });
    expect(state.status).toBe("haunt");
    expect(state.pending).toBeNull();
    expect(state.seats[2].side).toBe("traitor");
    const unbuilt = state.lastEvents.find((e) => e.type === "haunt-unbuilt");
    if (!unbuilt) throw new Error("No haunt-unbuilt event");
    expect(describeEvent(ENGINE, spectator(state, ENGINE), unbuilt)).toBe(
      "Haunt 14 isn't built yet, so the game stops here.",
    );
  });

  it("refuses a scenario that sets sides for a haunt that decides them", () => {
    expect(() =>
      hauntGame({ sides: [{ seat: 2, side: "traitor", roles: ["traitor"] }] }),
    ).toThrow(/decides the sides at its reveal/);
  });
});

describe("the chart's traitor rule", () => {
  const traitorOf = (state: GameState) =>
    state.seats.findIndex((s) => s.roles.includes("traitor"));
  const tie = (state: GameState) =>
    state.lastEvents.find((e) => e.type === "traitor-tie");

  it("breaks a tie towards the revealer's left, leaving out an excepted revealer", () => {
    // Ox and Father Rhinehardt both have Sanity 3; Zoe revealed it.
    const state = hauntGame({
      explorers: [{ seat: 2, clips: { sanity: 0 } }],
    });
    expect(traitValue(TOY_ENGINE, state, OX, "sanity")).toBe(3);
    expect(traitValue(TOY_ENGINE, state, FATHER, "sanity")).toBe(3);
    expect(traitorOf(state)).toBe(1);
    const event = tie(state);
    if (!event) throw new Error("No traitor-tie event");
    expect(event.rule).toEqual({ source: "rulebook", page: 15, ruling: "traitor-tie" });
    expect(describeEvent(TOY_ENGINE, spectator(state, TOY_ENGINE), event)).toBe(
      "Ox Bellows and Father Rhinehardt tie to be the traitor; it goes to Ox Bellows, nearest the revealer's left.",
    );
  });

  it("goes round the table from the revealer to find the nearest tied seat", () => {
    // Ox reveals and is excepted; Zoe and Father Rhinehardt tie at 3.
    const state = hauntGame({
      haunt: { number: 13, revealer: 1 },
      explorers: [
        { seat: 0, clips: { sanity: 0 } },
        { seat: 2, clips: { sanity: 0 } },
      ],
    });
    expect(traitValue(TOY_ENGINE, state, ZOE, "sanity")).toBe(3);
    expect(traitorOf(state)).toBe(2);
  });

  it("gives a tie to the revealer when the revealer is eligible and tied", () => {
    // Haunt 6: lowest Sanity, revealer included. Ox reveals holding the Holy
    // Symbol, and ties with Father Rhinehardt.
    const state = testGame({
      engine: TOY_ENGINE,
      haunt: { number: 6, revealer: 1 },
      explorers: [
        { seat: 1, clips: { sanity: 0 } },
        { seat: 2, clips: { sanity: 0 } },
      ],
    });
    expect(traitValue(TOY_ENGINE, state, OX, "sanity")).toBe(3);
    expect(traitValue(TOY_ENGINE, state, FATHER, "sanity")).toBe(3);
    expect(traitorOf(state)).toBe(1);
  });

  it("deals a hidden traitor, known only to themself, and play goes on from the revealer's left", () => {
    const engine = withHaunts(BASE_ENGINE, [toyHaunt(34)]);
    let state = testGame({ engine, haunt: { number: 34, revealer: 0 } });
    const traitor = traitorOf(state);
    expect(traitor).toBeGreaterThanOrEqual(0);
    expect(eventTypes(state)).toContain("sides-dealt");
    expect(describeAll(engine, state)).toContain(
      "The traitor is dealt in secret: each player looks at their own token.",
    );
    expect(eventTypes(state)).not.toContain("side-set");
    state.seats.forEach((seat, i) => {
      expect(seat.knownBy).toEqual(i === traitor ? [i] : [i, traitor]);
    });
    state = readyAll(state, engine);
    expect(turnsStarted(state)).toEqual([[1, "explorer"]]);
  });
});

describe("turn order after the haunt", () => {
  const FOUR = [ZOE, OX, FATHER, VIVIAN];

  it("skips a dead hero, and gives an asleep traitor with no monsters its traitor and monster turns, each passing at once", () => {
    let state = readyAll(
      hauntGame({
        characters: FOUR,
        explorers: [{ seat: 1, clips: { sanity: 0 } }],
      }),
    );
    expect(state.seats[1].roles).toEqual(["traitor"]);
    expect(turnsStarted(state)).toEqual([[2, "explorer"]]);
    kill(state, VIVIAN);
    kill(state, PHANTOM_1);
    state = choose(state, "End your turn", TOY_ENGINE);
    expect(turnsStarted(state)).toEqual([[0, "explorer"]]);
    state = choose(state, "End your turn", TOY_ENGINE);
    expect(turnsStarted(state)).toEqual([
      [1, "traitor"],
      [1, "monster"],
      [2, "explorer"],
    ]);
    expect(eventTypes(state).filter((t) => t === "forced")).toHaveLength(2);
    expect(describeAll(TOY_ENGINE, state)).toContain("Ox Bellows's traitor turn.");
  });

  it("still gives a dead traitor's seat both of its turns, its monsters still its to move", () => {
    let state = readyAll(hauntGame());
    kill(state, OX);
    state = choose(state, "End your turn", TOY_ENGINE);
    state = choose(state, "End your turn", TOY_ENGINE);
    expect(turnsStarted(state)).toEqual([
      [1, "traitor"],
      [1, "monster"],
    ]);
    expect(offered(state, TOY_ENGINE).map((c) => c.label)).toEqual([
      "Act with Phantom 1, in the Entrance Hall",
      "End the monster turn",
    ]);
    state = choose(state, "End the monster turn", TOY_ENGINE);
    expect(turnsStarted(state)).toEqual([[2, "explorer"]]);
  });

  it("takes an inserted turn at the next boundary, then carries on from the turn it followed", () => {
    let state = readyAll(hauntGame());
    state = choose(state, "Take an extra turn after this one", TOY_ENGINE);
    expect(state.insertedTurns).toMatchObject([{ seat: 2, kind: "explorer" }]);
    expect(describeAll(TOY_ENGINE, state)).toContain(
      "Father Rhinehardt takes an extra turn next.",
    );
    state = choose(state, "End your turn", TOY_ENGINE);
    expect(turnsStarted(state)).toEqual([[2, "explorer"]]);
    expect(state.turn?.follows).toEqual({ seat: 2, kind: "explorer" });
    expect(offered(state, TOY_ENGINE).map((c) => c.label)).not.toContain(
      "Take an extra turn after this one",
    );
    state = choose(state, "End your turn", TOY_ENGINE);
    expect(turnsStarted(state)).toEqual([[0, "explorer"]]);
  });
});

describe("conditions and the result", () => {
  it("ends the game the moment a goal is met, partway through a move", () => {
    let state = readyAll(hauntGame());
    if (!state.haunt) throw new Error("No haunt");
    state.haunt.counters.wakes = 2;
    state = choose(state, "Move to the Foyer", TOY_ENGINE);
    expect(state.status).toBe("finished");
    expect(state.result).toEqual({
      winners: [0, 2],
      rule: { source: "haunt", haunt: 13, section: "Heroes win when" },
    });
    expect(state.pending).toBeNull();
    expect(state.turn).toBeNull();
    expect(eventTypes(state).slice(-3)).toEqual([
      "entered",
      "counter-changed",
      "game-over",
    ]);
    expect(describeAll(TOY_ENGINE, state).at(-1)).toBe("The heroes win.");
    expect(state.memory.conditions).toContain("haunt:haunt-13:woken");
  });

  it("gives the win to the side whose turn it is when one step meets both goals", () => {
    let state = readyAll(hauntGame());
    state = choose(state, "Meet both goals at once", TOY_ENGINE);
    expect(state.result?.winners).toEqual([0, 2]);
    expect(describeAll(TOY_ENGINE, state).at(-1)).toBe(
      "The heroes win (both sides' goals were met at once, on their turn).",
    );

    // An awake traitor meets both on the traitor turn.
    const awake = withHaunts(BASE_ENGINE, [
      toyHaunt(13, {
        setup: {
          traitor: [
            { part: "counter", counter: "escapes", start: 0 },
            { part: "secret", secret: "target", value: 3, knownBy: "traitor" },
          ],
          heroes: [{ part: "counter", counter: "wakes", start: 0 }],
        },
      }),
    ]);
    let traitor = readyAll(
      testGame({ engine: awake, haunt: { number: 13, revealer: 0 } }),
      awake,
    );
    traitor = choose(traitor, "End your turn", awake);
    traitor = choose(traitor, "End your turn", awake);
    expect(traitor.turn).toMatchObject({ seat: 1, kind: "traitor" });
    traitor = choose(traitor, "Meet both goals at once", awake);
    expect(traitor.result?.winners).toEqual([1]);
    expect(describeAll(awake, traitor).at(-1)).toBe(
      "The traitor's side wins: Ox Bellows (both sides' goals were met at once, on their turn).",
    );
  });

  it("shows every secret its goals reveal when goals with the same winners are met at once", () => {
    // The last heroes fall in the step that brings the escapes up to the
    // traitor's number: the rulebook's goal and the haunt's both go to the
    // traitor, and the haunt's still shows everyone the number.
    const doom = withHaunts(BASE_ENGINE, [
      toyHaunt(13, {
        goals: [
          {
            id: "escaped",
            side: "traitor",
            when: { counter: "escapes", atLeast: { of: "secret", secret: "target" } },
            reveals: ["target"],
          },
        ],
        actions: {
          doom: {
            label: "Bring doom",
            side: "heroes",
            steps: () => [local(hauntSourceId(13), "doom")],
          },
        },
        steps: {
          doom: (state) => {
            for (const figure of [ZOE, FATHER]) kill(state, figure);
            if (!state.haunt) throw new Error("No haunt");
            state.haunt.counters.escapes = 3;
          },
        },
      }),
    ]);
    let state = readyAll(hauntGame({ engine: doom }), doom);
    state = choose(state, "Bring doom", doom);
    expect(state.result?.winners).toEqual([1]);
    expect(state.haunt?.secrets.find((s) => s.id === "target")?.knownBy).toBeNull();
    expect(eventTypes(state).slice(-2)).toEqual(["secret-revealed", "game-over"]);
  });

  it("ends the game for the traitor's side once every hero is dead (ruling game-end)", () => {
    let state = readyAll(hauntGame());
    kill(state, ZOE);
    state = choose(state, "Drop dead", TOY_ENGINE);
    expect(state.status).toBe("finished");
    expect(state.result).toEqual({
      winners: [1],
      rule: { source: "rulebook", page: 19, ruling: "game-end" },
    });
    expect(eventTypes(state).slice(-2)).toEqual(["died", "game-over"]);
  });

  it("counts a hero who changed sides with the traitor's side, who wins with it", () => {
    const state = readyAll(hauntGame());
    state.seats[2] = { ...state.seats[2], side: "traitor", roles: [] };
    const after = start(TOY_ENGINE, { ...state, pending: null }, [
      die(ZOE, { source: "scenario" }),
    ]);
    expect(after.result?.winners).toEqual([1, 2]);
    expect(after.lastEvents.find((e) => e.type === "game-over")?.data).toMatchObject({
      winners: [1, 2],
      side: "traitor",
    });
  });

  it("lets the traitor win on its own goal, on the monster turn", () => {
    let state = readyAll(hauntGame());
    if (!state.haunt) throw new Error("No haunt");
    state.haunt.counters.escapes = 2;
    state = choose(state, "End your turn", TOY_ENGINE);
    state = choose(state, "End your turn", TOY_ENGINE);
    expect(state.result?.winners).toEqual([1]);
    expect(describeAll(TOY_ENGINE, state).at(-1)).toBe(
      "The traitor's side wins: Ox Bellows.",
    );
  });
});

describe("a haunt game", () => {
  it("replays exactly from its start and its actions", () => {
    const actions: Action[] = [];
    let state = hauntGame();
    const play = (action: Action) => {
      const result = apply(TOY_ENGINE, state, action);
      if (!result.ok) throw new Error(result.reason);
      actions.push(action);
      state = result.state;
    };
    for (const seat of [1, 2, 0])
      play({ kind: "ready", wait: state.pending?.id ?? "", seat });
    for (const label of ["Move to the Foyer", "End your turn", "End your turn"]) {
      const decision = state.pending;
      if (decision?.type !== "decision") throw new Error("No decision");
      const pick = offered(state, TOY_ENGINE).find((c) => c.label.includes(label));
      if (!pick) throw new Error(`No ${label}`);
      play({
        kind: "choose",
        decision: decision.id,
        seat: decision.seats[0],
        choice: pick.choice,
      });
    }
    let again = hauntGame();
    for (const action of actions) {
      const result = apply(TOY_ENGINE, again, action);
      if (!result.ok) throw new Error(result.reason);
      again = result.state;
    }
    expect(JSON.stringify(again)).toBe(JSON.stringify(state));
  });

  // Random play through the haunt to its end: at every decision the
  // simulation checks that the listed choices are exactly the legal ones.
  it.each(["a", "b", "c", "d"])(
    "lists exactly the legal choices over random play through the haunt, seed %s",
    (seed) => {
      const result = simulate(seed, ALL_TOY_ENGINE);
      expect(result.ending).toBe("finished");
      expect(simulate(seed, ALL_TOY_ENGINE)).toEqual(result);
    },
    30_000,
  );
});
