import { describe, expect, it } from "vitest";
import { withHaunts } from "../kit/haunt";
import { checkListedAreLegal, simulate } from "../simulation";
import {
  ALL_TOY_ENGINE,
  DOZING,
  PHANTOM,
  TOY_ENGINE,
  toMonsterTurn,
  toyBegun,
  toyHaunt,
} from "../test/toy-haunt";
import { BASE_ENGINE } from "../game";
import {
  choose,
  eventTypes,
  explorer,
  offered,
  pendingDecision,
  put,
  waitingOn,
  spectator,
} from "../testing";
import type {
  FigureDefinition,
  GameEvent,
  GameState,
  RuleRef,
} from "../types";
import { describeDecision, describeEvent } from "./describe";
import { damage } from "./effects";
import { spawn } from "./haunt";
import { askNumber } from "./questions";
import { start, type Engine } from "./step-loop";

// The monster turn and how monsters work (rules.md, pp. 18-19, and their
// project rulings), played through the toy haunt (test/toy-haunt.ts): Ox,
// seat 1, is the dozing traitor, with Phantom 1 beside him in the Entrance
// Hall; Zoe (seat 0) and Father Rhinehardt (seat 2) are the heroes. Ending
// both heroes' turns passes the dozing traitor's turn at once and starts his
// seat's monster turn.

const FATHER = "father-rhinehardt";
const PHANTOM_1 = "phantom-1";
const RULE: RuleRef = { source: "haunt", haunt: 13, section: "Rules" };
const SEEDS = Array.from({ length: 200 }, (_, i) => `${i}`);

/** A second type of monster, for one roll per type. */
const SHADE: FigureDefinition = {
  ...PHANTOM,
  id: "shade",
  name: "Shade",
  traits: { kind: "fixed", values: { speed: 2, might: 3 } },
};

/** The toy haunt with a Shade beside the Phantom, and an action that
 *  unleashes another Phantom, for a monster to take partway through its
 *  turn. */
const BUSY_ENGINE: Engine = withHaunts(BASE_ENGINE, [
  toyHaunt(13, {
    figures: [PHANTOM, SHADE],
    setup: {
      traitor: [
        { part: "status", who: "traitor", status: "dozing" },
        { part: "spawn", figure: "phantom", count: 1, at: "traitor", owner: "traitor" },
        { part: "spawn", figure: "shade", count: 1, at: "traitor", owner: "traitor" },
        { part: "counter", counter: "escapes", start: 0 },
        { part: "secret", secret: "target", value: { of: "players" }, knownBy: "traitor" },
      ],
      heroes: [{ part: "counter", counter: "wakes", start: 0 }],
    },
    actions: {
      unleash: {
        label: "Unleash another Phantom",
        side: "traitor",
        available: (state) => state.turn?.kind === "monster",
        steps: () => [
          spawn("phantom", { count: 1, at: "traitor", owner: "traitor" }, RULE),
        ],
      },
    },
  }),
]);

/** The toy haunt with at most one Phantom in play at a time. */
const SCARCE_ENGINE: Engine = withHaunts(BASE_ENGINE, [
  toyHaunt(13, {
    statuses: { dozing: DOZING },
    modifiers: [{ question: "supply", change: { set: 1 } }],
  }),
]);


/** The toy haunt's own actions, offered to anyone on any side. */
const TOY_ACTIONS = ["Take an extra turn after this one", "Meet both goals at once"];

/** What is offered, past the toy haunt's own actions. */
const labels = (state: GameState, engine: Engine) =>
  offered(state, engine)
    .map((c) => c.label)
    .filter((label) => !TOY_ACTIONS.includes(label));

const describeAll = (engine: Engine, state: GameState) =>
  state.lastEvents.flatMap((e: GameEvent) => describeEvent(engine, spectator(state, engine), e) ?? []);

/** Sets a monster type's movement for the turn, as a test's setup. */
function moves(state: GameState, definition: string, spaces: number): void {
  if (state.turn === null) throw new Error("No turn");
  state.turn.rolled[definition] = spaces;
}

describe("the monster turn's start (rules.md, p. 18)", () => {
  it("rolls movement once for each type of monster, its Speed in dice, before any acts", () => {
    const state = toMonsterTurn(toyBegun(BUSY_ENGINE), BUSY_ENGINE);
    const rolls = state.lastEvents.filter(
      (e) => e.type === "rolled" && (e.data as { spec: { kind: string } }).spec.kind === "movement",
    );
    expect(rolls.map((e) => (e.data as { figure: string }).figure)).toEqual([
      PHANTOM_1,
      "shade-1",
    ]);
    expect(rolls.map((e) => (e.data as { dice: number[] }).dice.length)).toEqual([3, 2]);
    const rolled = state.turn?.rolled ?? {};
    expect(Object.keys(rolled).sort()).toEqual(["phantom", "shade"]);
    // Each moves what its type rolled, at least 1 even on a 0 (p. 17).
    expect(askNumber(BUSY_ENGINE, state, "movement", { figure: "shade-1" })).toBe(
      Math.max(rolled.shade ?? 0, 1),
    );
    expect(labels(state, BUSY_ENGINE)).toEqual([
      "Act with Phantom 1, in the Entrance Hall",
      "Act with Shade 1, in the Entrance Hall",
      "End the monster turn",
    ]);
    expect(describeAll(BUSY_ENGINE, state)).toContain("Ox Bellows's monster turn.");
    expect(describeDecision(BUSY_ENGINE, spectator(state, BUSY_ENGINE), pendingDecision(state))).toBe(
      "Ox Bellows's monster turn: which monster acts next?",
    );
    const acting = choose(state, "Act with Shade 1", BUSY_ENGINE);
    expect(describeAll(BUSY_ENGINE, acting)).toContain(
      "Shade 1 acts, from the Entrance Hall.",
    );
    expect(describeDecision(BUSY_ENGINE, spectator(acting, BUSY_ENGINE), pendingDecision(acting))).toBe(
      "Ox Bellows's monster turn: what next for Shade 1?",
    );
  });

  it("makes a monster type's Speed known to everyone once it is rolled (ruling monster-traits-known)", () => {
    const state = toMonsterTurn(toyBegun(TOY_ENGINE), TOY_ENGINE);
    expect(state.memory.traitsKnown).toEqual([
      { definition: "phantom", trait: "speed", value: 3 },
    ]);
    expect(describeAll(TOY_ENGINE, state)).toContain(
      "Everyone now knows the Phantom's Speed: 3.",
    );
  });

  it("passes at once with no monster to act", () => {
    const state = toMonsterTurn(
      toyBegun(TOY_ENGINE, (s) => {
        s.figures[PHANTOM_1].alive = false;
        s.figures[PHANTOM_1].place = null;
      }),
      TOY_ENGINE,
    );
    expect(eventTypes(state)).toContain("forced");
    expect(state.turn).toMatchObject({ seat: 2, kind: "explorer" });
  });
});

describe("a monster acting (rules.md, p. 18)", () => {
  it("moves one space at a time by the turn's own choices, attacks partway and keeps moving, then the turn ends", () => {
    for (const seed of SEEDS) {
      let state = toMonsterTurn(
        toyBegun(
          TOY_ENGINE,
          (s) => {
            put(s, 2, "foyer");
            put(s, 0, "upper-landing");
            explorer(s, 2).cards.push("angel-feather");
          },
          { seed },
        ),
        TOY_ENGINE,
      );
      moves(state, "phantom", 5);
      state = choose(state, "Act with Phantom 1", TOY_ENGINE);
      expect(labels(state, TOY_ENGINE)).toEqual([
        "Move to the Foyer",
        "End the monster turn",
      ]);
      state = choose(state, "Move to the Foyer", TOY_ENGINE);
      expect(state.turn?.moved).toEqual({ [PHANTOM_1]: 1 });
      state = choose(state, "Attack Father Rhinehardt", TOY_ENGINE);
      expect(waitingOn(state)).toBe(2);
      state = choose(state, "the result is 0", TOY_ENGINE);
      // A tie, or the Phantom wins: it isn't stunned, so it goes on.
      if (pendingDecision(state).kind === "split-damage")
        state = choose(state, "Take", TOY_ENGINE);
      if (
        state.turn?.kind !== "monster" ||
        state.turn.acting !== PHANTOM_1 ||
        !state.figures[FATHER].alive
      )
        continue;
      expect(state.turn.attacked).toEqual([PHANTOM_1]);
      const turn = () => state.turn;
      // Leaving Father costs a space more (p. 17), and it has no attack left.
      expect(labels(state, TOY_ENGINE)).toEqual([
        "Move to the Entrance Hall",
        "Move to the Grand Staircase",
        "End the monster turn",
      ]);
      state = choose(state, "Move to the Grand Staircase", TOY_ENGINE);
      expect(turn()?.moved).toEqual({ [PHANTOM_1]: 3 });
      state = choose(state, "Move to the Upper Landing", TOY_ENGINE);
      // One space left can't take it past Zoe, and its attack is spent.
      expect(labels(state, TOY_ENGINE)).toEqual(["End the monster turn"]);
      state = choose(state, "End the monster turn", TOY_ENGINE);
      expect(state.turn).toMatchObject({ seat: 2, kind: "explorer" });
      return;
    }
    throw new Error("No seed leaves the Phantom standing after its attack");
  });

  it("chases a hero, stopping in the hero's room to attack", () => {
    let state = toMonsterTurn(
      toyBegun(TOY_ENGINE, (s) => {
        put(s, 2, "upper-landing");
        put(s, 0, "grand-staircase");
      }),
      TOY_ENGINE,
    );
    moves(state, "phantom", 2);
    state = choose(state, "Act with Phantom 1", TOY_ENGINE);
    state = choose(state, "Move to the Foyer", TOY_ENGINE);
    state = choose(state, "Move to the Grand Staircase", TOY_ENGINE);
    expect(labels(state, TOY_ENGINE)).toEqual([
      "Attack Zoe Ingstrom",
      "End the monster turn",
    ]);
  });

  it("has each monster finish before the next acts, and a monster unleashed partway waits for the next monster turn", () => {
    let state = toMonsterTurn(toyBegun(BUSY_ENGINE), BUSY_ENGINE);
    state = choose(state, "Act with Phantom 1", BUSY_ENGINE);
    expect(labels(state, BUSY_ENGINE)).not.toContain("Act with Shade 1, in the Entrance Hall");
    expect(labels(state, BUSY_ENGINE)).toContain("Finish Phantom 1's actions");
    state = choose(state, "Unleash another Phantom", BUSY_ENGINE);
    expect(Object.keys(state.figures)).toContain("phantom-2");
    state = choose(state, "Finish Phantom 1's actions", BUSY_ENGINE);
    expect(labels(state, BUSY_ENGINE)).toEqual([
      "Act with Shade 1, in the Entrance Hall",
      "End the monster turn",
    ]);
    state = choose(state, "End the monster turn", BUSY_ENGINE);
    state = toMonsterTurn(state, BUSY_ENGINE);
    expect(labels(state, BUSY_ENGINE)).toContain(
      "Act with Phantom 2, in the Entrance Hall",
    );
  });
});

describe("a stunned monster (rules.md, p. 18)", () => {
  const stunned = (s: GameState) => {
    s.figures[PHANTOM_1].stunned = true;
  };

  it("stunned before its monster turn misses it, and recovers at its end", () => {
    const state = toMonsterTurn(toyBegun(TOY_ENGINE, stunned), TOY_ENGINE);
    expect(eventTypes(state)).toEqual(
      expect.arrayContaining(["turn-missed", "forced", "recovered"]),
    );
    expect(describeAll(TOY_ENGINE, state)).toEqual(
      expect.arrayContaining([
        "Phantom 1 is stunned and misses this turn.",
        "Phantom 1 recovers from being stunned.",
      ]),
    );
    expect(state.figures[PHANTOM_1].stunned).toBe(false);
    expect(state.turn).toMatchObject({ seat: 2, kind: "explorer" });
  });

  it("stunned on its own turn stops at once, and misses exactly the next monster turn", () => {
    let state = toMonsterTurn(toyBegun(TOY_ENGINE), TOY_ENGINE);
    state = choose(state, "Act with Phantom 1", TOY_ENGINE);
    // Stunned partway through its actions, as by losing its attack.
    state.figures[PHANTOM_1].stunned = true;
    state = choose(state, "Move to the Foyer", TOY_ENGINE);
    // With no one else to act, the turn ends at once, the Phantom still
    // stunned through the heroes' turns; then it misses the next one.
    expect(state.turn).toMatchObject({ seat: 2, kind: "explorer" });
    expect(state.figures[PHANTOM_1].stunned).toBe(true);
    state = toMonsterTurn(state, TOY_ENGINE);
    expect(eventTypes(state)).toEqual(
      expect.arrayContaining(["turn-missed", "recovered"]),
    );
    expect(state.figures[PHANTOM_1].stunned).toBe(false);
  });

  it("is stunned by damage from anything, not only an attack (p. 18, ruling monster-traits)", () => {
    const state = start(TOY_ENGINE, { ...toyBegun(TOY_ENGINE), pending: null }, [
      damage(PHANTOM_1, "physical", { points: 2 }, RULE),
    ]);
    expect(state.figures[PHANTOM_1].stunned).toBe(true);
  });
});

describe("spawning a haunt's figures", () => {
  it("numbers each new figure with a number never used before, and stops at the supply in play", () => {
    let state = toyBegun(SCARCE_ENGINE);
    state = start(SCARCE_ENGINE, { ...state, pending: null }, [
      spawn("phantom", { count: 1, at: "traitor", owner: "traitor" }, RULE),
    ]);
    expect(Object.keys(state.figures)).not.toContain("phantom-2");
    expect(describeAll(SCARCE_ENGINE, state)).toContain(
      "No Phantom can appear in the Entrance Hall: the supply of Phantom tokens has run out.",
    );
    state.figures[PHANTOM_1].alive = false;
    state.figures[PHANTOM_1].place = null;
    state = start(SCARCE_ENGINE, { ...state, pending: null }, [
      spawn("phantom", { count: 1, at: "traitor", owner: "traitor" }, RULE),
    ]);
    expect(state.figures["phantom-2"]).toMatchObject({ alive: true, owner: 1 });
    expect(state.memory.spawned).toEqual({ phantom: 2 });
  });
});

describe("the choices listed on monster turns", () => {
  it("are exactly the legal ones, decision by decision", () => {
    let state = toMonsterTurn(toyBegun(BUSY_ENGINE), BUSY_ENGINE);
    const check = () => {
      const pending = state.pending;
      if (pending?.type !== "decision") throw new Error("No decision");
      checkListedAreLegal(BUSY_ENGINE, state, waitingOn(state), offered(state, BUSY_ENGINE));
    };
    check();
    state = choose(state, "Act with Phantom 1", BUSY_ENGINE);
    check();
    state = choose(state, "Move to the Foyer", BUSY_ENGINE);
    check();
    state = choose(state, "Finish Phantom 1's actions", BUSY_ENGINE);
    check();
    state = choose(state, "Act with Shade 1", BUSY_ENGINE);
    check();
  });

  it.each(["m3", "b", "d"])(
    "are exactly the legal ones over random play through the toy haunt, monsters acting, seed %s",
    (seed) => {
      const result = simulate(seed, ALL_TOY_ENGINE);
      expect(result.kinds["turn:activate"]).toBeGreaterThan(0);
    },
    30_000,
  );
});
