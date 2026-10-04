import { describe, expect, it } from "vitest";
import { withHaunts } from "../kit/haunt";
import { checkListedAreLegal } from "../simulation";
import { DOZING, PHANTOM, TOY_ENGINE, toyHaunt } from "../test/toy-haunt";
import { BASE_ENGINE, ENGINE } from "../game";
import {
  choose,
  eventTypes,
  explorer,
  offered,
  pendingDecision,
  put,
  ready,
  testGame,
  waitingOn,
  type TestGame,
  spectator,
} from "../testing";
import type { GameEvent, GameState, RuleRef } from "../types";
import { lineOfSight } from "./board";
import { describeEvent } from "./describe";
import { sideOf } from "./sides";
import { local, type Behaviour } from "./sources";
import { start, type Engine } from "./step-loop";

// The turn's own attack (rules.md, "Make an Attack", p. 13) and combat
// between any figures, played through the toy haunt (test/toy-haunt.ts):
// Ox, seat 1, is the dozing traitor, with a Phantom beside him in the
// Entrance Hall; Zoe (seat 0) and Father Rhinehardt (seat 2) are the heroes,
// there with them, and the first turn is Father's. The attacker holds the Angel Feather, which
// names their result; a seed is searched for the defence result a test
// needs.

const ZOE = "zoe-ingstrom";
const OX = "ox-bellows";
const FATHER = "father-rhinehardt";
const PHANTOM_1 = "phantom-1";
const SEEDS = Array.from({ length: 400 }, (_, i) => `${i}`);
const HAUNT_RULE: RuleRef = { source: "haunt", haunt: 13, section: "Rules" };

/** The toy haunt with haunt 13's two rules for Nightmares, given to its
 *  Phantom: everything a Phantom deals is mental, and a hero who beats one
 *  kills it. */
const NIGHTMARE_ENGINE: Engine = withHaunts(BASE_ENGINE, [
  toyHaunt(13, {
    modifiers: [
      {
        question: "combatOutcome",
        change: {
          transform: (state, { attack }, outcome) => {
            const winner =
              outcome.loser === "defender" ? attack.attacker : attack.defender;
            return winner !== null &&
              state.figures[winner].definition === PHANTOM.id &&
              outcome.harm?.kind === "damage"
              ? { ...outcome, harm: { ...outcome.harm, damage: "mental" } }
              : outcome;
          },
        },
      },
      {
        question: "combatOutcome",
        when: (state, { attack }, _source, engine) =>
          attack.attacker !== null &&
          sideOf(engine, state, attack.attacker) === "heroes" &&
          state.figures[attack.defender].definition === PHANTOM.id,
        change: {
          transform: (_state, _subject, outcome, source) =>
            outcome.loser === "defender"
              ? { ...outcome, harm: { kind: "kill", rule: source.rule } }
              : outcome,
        },
      },
    ],
  }),
]);

/** A status that hands its bearer's choices to seat 0. */
const HELD: Behaviour = {
  modifiers: [
    {
      question: "controller",
      when: (_state, { figure }, source) => figure === source.holder,
      change: { transform: () => 0 },
    },
  ],
};
const HELD_ENGINE: Engine = withHaunts(BASE_ENGINE, [
  toyHaunt(13, { statuses: { dozing: DOZING, held: HELD } }),
]);

type SetUp = (state: GameState) => void;

/** Haunt 13 begun and everyone ready: Father Rhinehardt's turn, with the
 *  Angel Feather. */
function begun(
  engine: Engine,
  setUp: SetUp = () => {},
  options: TestGame = {},
): GameState {
  let state = testGame({
    engine,
    haunt: { number: 13, revealer: 0 },
    ...options,
  });
  state = state.seats.reduce((s, _seat, i) => ready(s, i, engine), state);
  // The revealer starts where the haunt was revealed; bring her back.
  put(state, 0, "entrance-hall");
  explorer(state, 2).cards.push("angel-feather");
  setUp(state);
  return state;
}

const labels = (state: GameState, engine: Engine) =>
  offered(state, engine).map((c) => c.label);

type Outcome = {
  attacker: string | null;
  defender: string;
  attackResult: number;
  defenceResult: number;
  loser: string | null;
  harm: { kind: string } | null;
};

function outcome(state: GameState): Outcome {
  const event = state.lastEvents.find((e) => e.type === "attack-outcome");
  if (!event) throw new Error("No attack outcome");
  return event.data as Outcome;
}

/** Father attacks, choosing the offered choices whose labels hold `steps`,
 *  then names his result; the first seed whose defence result passes. */
function fight(
  engine: Engine,
  steps: string[],
  named: number,
  passes: (defence: number) => boolean,
  setUp?: SetUp,
): GameState {
  for (const seed of SEEDS) {
    let state = begun(engine, setUp, { seed });
    for (const label of steps) state = choose(state, label, engine);
    state = choose(state, `the result is ${named}`, engine);
    if (passes(outcome(state).defenceResult)) return state;
  }
  throw new Error("No seed gives that defence");
}

const describeAll = (engine: Engine, state: GameState) =>
  state.lastEvents.flatMap((e: GameEvent) => describeEvent(engine, spectator(state, engine), e) ?? []);

describe("the turn's attack (rules.md, p. 13)", () => {
  it("is offered on each opponent in the room, once the haunt has begun", () => {
    const state = begun(TOY_ENGINE);
    expect(labels(state, TOY_ENGINE)).toEqual(
      expect.arrayContaining(["Attack Ox Bellows", "Attack Phantom 1"]),
    );
    // Not a fellow hero.
    expect(labels(state, TOY_ENGINE)).not.toContain("Attack Zoe Ingstrom");
  });

  it("isn't offered before the haunt", () => {
    const state = testGame();
    expect(labels(state, ENGINE).some((l) => l.startsWith("Attack"))).toBe(
      false,
    );
  });

  it("is made once a turn, and counted for the attacking figure", () => {
    let state = fight(TOY_ENGINE, ["Attack Ox Bellows"], 4, (d) => d === 4);
    expect(state.turn?.attacked).toEqual([FATHER]);
    expect(waitingOn(state)).toBe(2);
    expect(labels(state, TOY_ENGINE).some((l) => l.startsWith("Attack"))).toBe(
      false,
    );
    // The next turn has its own attack.
    state = choose(state, "End your turn", TOY_ENGINE);
    expect(state.turn?.seat).toBe(0);
    expect(labels(state, TOY_ENGINE)).toContain("Attack Ox Bellows");
  });

  it("offers each weapon the attacker holds as a real choice", () => {
    const state = choose(
      begun(TOY_ENGINE, (s) => explorer(s, 2).cards.push("axe", "spear")),
      "Attack Ox Bellows",
      TOY_ENGINE,
    );
    expect(pendingDecision(state).kind).toBe("attack-mode");
    expect(labels(state, TOY_ENGINE)).toEqual([
      "Attack with Might",
      "Attack with Might, using the Axe",
      "Attack with Might, using the Spear",
    ]);
  });
});

describe("a hero attacks the traitor", () => {
  it("and wins: the traitor takes the difference, split by the seat controlling him", () => {
    const state = fight(TOY_ENGINE, ["Attack Ox Bellows"], 8, (d) => d < 7);
    expect(outcome(state)).toMatchObject({
      attacker: FATHER,
      defender: OX,
      loser: "defender",
      harm: { kind: "damage", damage: "physical" },
    });
    expect(pendingDecision(state)).toMatchObject({
      kind: "split-damage",
      seats: [1],
      params: { figure: OX, amount: 8 - outcome(state).defenceResult, by: FATHER },
    });
  });

  it("and loses: the sleeping traitor's defence damages the hero", () => {
    // A margin of 1 can't kill him.
    const state = fight(TOY_ENGINE, ["Attack Ox Bellows"], 0, (d) => d === 1);
    expect(outcome(state)).toMatchObject({ loser: "attacker" });
    expect(pendingDecision(state)).toMatchObject({
      kind: "split-damage",
      seats: [2],
      params: { figure: FATHER, by: OX, amount: 1 },
    });
  });

  it("the split goes to whichever seat controls the loser", () => {
    const state = fight(
      HELD_ENGINE,
      ["Attack Ox Bellows"],
      8,
      (d) => d < 7,
      (s) =>
        s.figures[OX].statuses.push({ id: "held", rule: HAUNT_RULE, params: null }),
    );
    expect(pendingDecision(state)).toMatchObject({
      kind: "split-damage",
      seats: [0],
      params: { figure: OX },
    });
  });

  it("a death from it records the attacker as the killer", () => {
    const state = fight(
      TOY_ENGINE,
      ["Attack Ox Bellows"],
      8,
      (d) => d < 8,
      (s) => {
        const ox = explorer(s, 1);
        ox.traits.clips.might = 0;
        ox.traits.clips.speed = 0;
      },
    );
    expect(state.figures[OX]).toMatchObject({ alive: false, place: null });
    expect(state.memory.deaths).toEqual([
      expect.objectContaining({ figure: OX, killer: FATHER }),
    ]);
    expect(describeAll(TOY_ENGINE, state)).toContain(
      "Ox Bellows dies in the Entrance Hall as Might reaches the skull, killed by Father Rhinehardt.",
    );
  });
});

describe("the traitor attacks a hero", () => {
  /** Ox wakes for the test, and the heroes end their turns. */
  const traitorTurn = (seed: string) => {
    let state = begun(
      TOY_ENGINE,
      (s) => {
        s.figures[OX].statuses = [];
      },
      { seed },
    );
    state = choose(state, "End your turn", TOY_ENGINE);
    state = choose(state, "End your turn", TOY_ENGINE);
    return state;
  };

  it("on the traitor turn, a hero but never the traitor's own monster", () => {
    const state = traitorTurn("0");
    expect(state.turn).toMatchObject({ seat: 1, kind: "traitor" });
    const attacks = labels(state, TOY_ENGINE).filter((l) =>
      l.startsWith("Attack"),
    );
    expect(attacks).toEqual(["Attack Zoe Ingstrom", "Attack Father Rhinehardt"]);
  });

  it("and the loser takes the difference", () => {
    for (const seed of SEEDS) {
      const state = choose(traitorTurn(seed), "Attack Zoe Ingstrom", TOY_ENGINE);
      if (!state.lastEvents.some((e) => e.type === "attack-outcome")) continue;
      const result = outcome(state);
      // A margin of 1 can't kill her.
      if (result.attackResult - result.defenceResult !== 1) continue;
      expect(pendingDecision(state)).toMatchObject({
        kind: "split-damage",
        seats: [0],
        params: { figure: ZOE, by: OX, amount: 1 },
      });
      return;
    }
    throw new Error("No seed has Ox win");
  });
});

describe("attacking a monster (rules.md, pp. 13 and 18)", () => {
  it("a beaten monster is stunned instead of damaged", () => {
    const state = fight(TOY_ENGINE, ["Attack Phantom 1"], 8, (d) => d < 8);
    expect(outcome(state)).toMatchObject({
      loser: "defender",
      harm: { kind: "stun" },
    });
    expect(state.figures[PHANTOM_1].stunned).toBe(true);
    expect(eventTypes(state)).not.toContain("damaged");
    expect(describeAll(TOY_ENGINE, state)).toContain("Phantom 1 is stunned.");
  });

  it("a monster that wins as defender deals physical damage", () => {
    const state = fight(TOY_ENGINE, ["Attack Phantom 1"], 0, (d) => d === 1);
    expect(pendingDecision(state)).toMatchObject({
      kind: "split-damage",
      params: { figure: FATHER, damage: "physical", by: PHANTOM_1 },
    });
  });

  it("no one may attack with a trait the monster lacks", () => {
    // The Phantom has no Knowledge, but has Sanity, so the Ring works on it.
    const state = choose(
      begun(TOY_ENGINE, (s) => explorer(s, 2).cards.push("ring")),
      "Attack Phantom 1",
      TOY_ENGINE,
    );
    expect(labels(state, TOY_ENGINE)).toEqual([
      "Attack with Might",
      "Attack with Sanity, using the Ring",
    ]);
  });

  it("a stunned monster is offered only when beating it would do more", () => {
    const stunned = (s: GameState) => {
      s.figures[PHANTOM_1].stunned = true;
    };
    expect(labels(begun(TOY_ENGINE, stunned), TOY_ENGINE)).not.toContain(
      "Attack Phantom 1",
    );
    expect(
      labels(begun(NIGHTMARE_ENGINE, stunned), NIGHTMARE_ENGINE),
    ).toContain("Attack Phantom 1");
  });

  it("a stunned monster defends, but the attacker who loses takes no damage", () => {
    const state = fight(
      NIGHTMARE_ENGINE,
      ["Attack Phantom 1"],
      0,
      (d) => d > 0,
      (s) => {
        s.figures[PHANTOM_1].stunned = true;
      },
    );
    expect(outcome(state)).toMatchObject({ loser: "attacker", harm: null });
    expect(eventTypes(state)).not.toContain("damaged");
    expect(waitingOn(state)).toBe(2);
    expect(describeAll(NIGHTMARE_ENGINE, state)).toContain(
      `Phantom 1 beats Father Rhinehardt, ${outcome(state).defenceResult} to 0, but Father Rhinehardt takes no damage.`,
    );
  });
});

describe("a haunt's rules for its monster (haunt 13's, on the toy Phantom)", () => {
  it("a hero who beats it kills it: it leaves play, killed by the hero, under the haunt's rule", () => {
    const state = fight(NIGHTMARE_ENGINE, ["Attack Phantom 1"], 8, (d) => d < 8);
    expect(outcome(state).harm).toMatchObject({ kind: "kill" });
    expect(state.figures[PHANTOM_1]).toMatchObject({
      alive: false,
      place: null,
    });
    const died = state.lastEvents.find((e) => e.type === "died");
    expect(died?.rule).toEqual(HAUNT_RULE);
    expect(state.memory.deaths).toEqual([
      expect.objectContaining({ figure: PHANTOM_1, killer: FATHER, trait: null }),
    ]);
    // Its death doesn't cut the hero's turn short.
    expect(waitingOn(state)).toBe(2);
    expect(pendingDecision(state).kind).toBe("turn");
  });

  it("everything it deals is mental, defending too", () => {
    const state = fight(NIGHTMARE_ENGINE, ["Attack Phantom 1"], 0, (d) => d === 1);
    expect(pendingDecision(state)).toMatchObject({
      kind: "split-damage",
      params: { figure: FATHER, damage: "mental" },
    });
  });

  it("the Dynamite beats it as if in physical combat: a hero's throw kills it", () => {
    for (const seed of SEEDS) {
      let state = begun(
        NIGHTMARE_ENGINE,
        (s) => {
          explorer(s, 2).cards.push("dynamite");
          s.figures[PHANTOM_1].place = { room: "foyer", side: null };
        },
        { seed },
      );
      state = choose(state, "Throw the Dynamite", NIGHTMARE_ENGINE);
      const rolled = state.lastEvents.find((e) => e.type === "rolled")
        ?.data as { figure: string; result: number };
      expect(rolled.figure).toBe(PHANTOM_1);
      if (rolled.result >= 5) continue;
      expect(state.figures[PHANTOM_1].alive).toBe(false);
      expect(state.memory.deaths[0]).toMatchObject({ killer: FATHER });
      return;
    }
    throw new Error("No seed has the Phantom fail its roll");
  });

  it("without the haunt's rule, the Dynamite stuns it", () => {
    for (const seed of SEEDS) {
      let state = begun(
        TOY_ENGINE,
        (s) => {
          explorer(s, 2).cards.push("dynamite");
          s.figures[PHANTOM_1].place = { room: "foyer", side: null };
        },
        { seed },
      );
      state = choose(state, "Throw the Dynamite", TOY_ENGINE);
      const rolled = state.lastEvents.find((e) => e.type === "rolled")
        ?.data as { result: number };
      if (rolled.result >= 5) continue;
      expect(state.figures[PHANTOM_1]).toMatchObject({ alive: true, stunned: true });
      return;
    }
    throw new Error("No seed has the Phantom fail its roll");
  });
});

describe("a distance attack with the Revolver (cards/items.md, rules.md p. 13)", () => {
  /** Ox stands at the far end of a line of sight from the Entrance Hall. */
  const apart = (s: GameState) => {
    const seen = lineOfSight(s.board, ENGINE.catalog, "entrance-hall");
    const far = seen[seen.length - 1];
    put(s, 1, far);
  };
  const armed = (s: GameState) => {
    apart(s);
    explorer(s, 2).cards.push("revolver");
  };
  const farRoom = (state: GameState) =>
    ENGINE.catalog.rooms[state.figures[OX].place?.room ?? ""].name;

  it("reaches an opponent in line of sight, only with the Revolver", () => {
    const without = begun(TOY_ENGINE, apart);
    expect(
      labels(without, TOY_ENGINE).filter((l) => l.startsWith("Attack Ox")),
    ).toEqual([]);
    const state = begun(TOY_ENGINE, armed);
    const label = `Attack Ox Bellows, in the ${farRoom(state)}`;
    expect(labels(state, TOY_ENGINE)).toContain(label);
    // The Revolver is the only way to reach him, so it is used.
    const attacking = choose(state, label, TOY_ENGINE);
    expect(attacking.turn?.handled).toContain("revolver");
  });

  it("an attacker it beats takes no damage", () => {
    for (const seed of SEEDS) {
      let state = begun(TOY_ENGINE, armed, { seed });
      state = choose(state, `Attack Ox Bellows, in the ${farRoom(state)}`, TOY_ENGINE);
      state = choose(state, "the result is 0", TOY_ENGINE);
      if (outcome(state).defenceResult === 0) continue;
      expect(outcome(state)).toMatchObject({ loser: "attacker", harm: null });
      expect(eventTypes(state)).not.toContain("damaged");
      return;
    }
    throw new Error("No seed has Ox win");
  });
});

describe("the Bloody Vision's attack, after the haunt (cards/events.md)", () => {
  const vision = (engine: Engine, setUp: SetUp) => {
    const state = begun(engine, setUp);
    return start(engine, { ...state, pending: null }, [
      local("bloody-vision", "attack", { figure: FATHER }),
    ]);
  };

  it("attacks the lowest-Might explorer in reach, a fellow hero included, outside the turn's one attack", () => {
    const state = vision(TOY_ENGINE, (s) => {
      if (s.turn) s.turn.attacked = [FATHER];
    });
    const attacked = state.lastEvents.find((e) => e.type === "attacked");
    // Zoe's Might is 3, below Ox's.
    expect(attacked?.data).toMatchObject({ defender: ZOE });
    expect(attacked?.rule).toEqual({ source: "card", card: "bloody-vision" });
    expect(state.turn?.attacked).toEqual([FATHER]);
  });

  it("doesn't use up the turn's attack", () => {
    const state = vision(TOY_ENGINE, () => {});
    expect(state.turn?.attacked).toEqual([]);
  });

  it("attacks a monster only when no explorer is in reach", () => {
    const state = vision(TOY_ENGINE, (s) => {
      put(s, 0, "upper-landing");
      put(s, 1, "upper-landing");
    });
    expect(state.lastEvents.find((e) => e.type === "attacked")?.data).toMatchObject({
      defender: PHANTOM_1,
    });
  });
});

describe("choices match legality in attack states", () => {
  const check = (engine: Engine, state: GameState) => {
    checkListedAreLegal(engine, state, waitingOn(state), offered(state, engine));
  };

  it("the turn's choices, with targets near, far, stunned and already attacked", () => {
    check(TOY_ENGINE, begun(TOY_ENGINE));
    check(
      TOY_ENGINE,
      begun(TOY_ENGINE, (s) => {
        s.figures[PHANTOM_1].stunned = true;
        explorer(s, 2).cards.push("revolver");
        put(s, 1, lineOfSight(s.board, ENGINE.catalog, "entrance-hall")[0]);
      }),
    );
    check(
      NIGHTMARE_ENGINE,
      begun(NIGHTMARE_ENGINE, (s) => {
        s.figures[PHANTOM_1].stunned = true;
      }),
    );
    check(
      TOY_ENGINE,
      begun(TOY_ENGINE, (s) => {
        if (s.turn) s.turn.attacked = [FATHER];
      }),
    );
  });

  it("the choice of weapon, and of stealing", () => {
    const moding = choose(
      begun(TOY_ENGINE, (s) => explorer(s, 2).cards.push("axe", "spear", "ring")),
      "Attack Ox Bellows",
      TOY_ENGINE,
    );
    check(TOY_ENGINE, moding);
    const stealing = fight(
      TOY_ENGINE,
      ["Attack Ox Bellows"],
      8,
      (d) => d <= 6,
      (s) => explorer(s, 1).cards.push("axe"),
    );
    expect(pendingDecision(stealing).kind).toBe("attack-steal");
    check(TOY_ENGINE, stealing);
  });
});
