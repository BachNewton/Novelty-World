import { describe, expect, it } from "vitest";
import { ENGINE } from "../game";
import {
  choose,
  eventTypes,
  explorer,
  offered,
  pendingDecision,
  put,
  testGame,
  waitingOn,
} from "../testing";
import type { GameState, RuleRef } from "../types";
import { attack, cardAttack, playerOnRight } from "./combat";
import { describeDecision, describeEvent } from "./describe";
import { start } from "./step-loop";

// The attack rules of content/rules.md, "Make an Attack" and "Special
// Attacks" (p. 13). The attacker holds the Angel Feather, which names their
// result; a seed is searched for the defence result a test needs.

const ZOE = 0;
const OX = 1;
const FATHER = 2;
/** The seats' explorers, by figure id. */
const ZOE_FIGURE = "zoe-ingstrom";
const OX_FIGURE = "ox-bellows";
const FATHER_FIGURE = "father-rhinehardt";
const RULE: RuleRef = { source: "rulebook", page: 13 };
const SEEDS = Array.from({ length: 500 }, (_, i) => `${i}`);

const labels = (state: GameState) => offered(state).map((c) => c.label);

type SetUp = (state: GameState) => void;

/** Zoe's turn, everyone in the Entrance Hall, Zoe holding the Angel Feather. */
function table(setUp: SetUp = () => {}, seed?: string): GameState {
  const state = testGame({ seed });
  explorer(state, ZOE).cards.push("angel-feather");
  setUp(state);
  return state;
}

/** Starts Zoe's attack on Ox in the middle of her turn. */
function attackOn(state: GameState): GameState {
  return start(ENGINE, { ...state, pending: null }, [
    attack({ kind: "figure", figure: ZOE_FIGURE }, OX_FIGURE, RULE),
  ]);
}

type Outcome = {
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

/** Zoe attacks (choosing `mode` if given) and names her result; the first
 *  seed whose defence result passes. */
function fight(
  named: number,
  passes: (defence: number) => boolean,
  options: { setUp?: SetUp; mode?: string } = {},
): GameState {
  for (const seed of SEEDS) {
    let state = attackOn(table(options.setUp, seed));
    if (options.mode) state = choose(state, options.mode);
    state = choose(state, `the result is ${named}`);
    if (passes(outcome(state).defenceResult)) return state;
  }
  throw new Error("No seed gives that defence");
}

describe("Make an Attack (rules.md, p. 13)", () => {
  it("each side rolls dice equal to its own Might", () => {
    let state = attackOn(table());
    // Zoe's Might is 3, and the only way she can attack is with Might.
    expect(labels(state)[0]).toBe("Make the Might attack roll (3 dice)");
    state = choose(state, "the result is 4");
    const defence = state.lastEvents.filter((e) => e.type === "rolled")[1]
      .data as { figure: string; dice: number[] };
    // Ox's Might is 5.
    expect(defence).toMatchObject({ figure: OX_FIGURE });
    expect(defence.dice).toHaveLength(5);
  });

  it("the higher result deals the difference as physical damage, which the loser splits", () => {
    const state = fight(8, (d) => d < 7);
    const { defenceResult } = outcome(state);
    expect(outcome(state)).toMatchObject({ loser: "defender" });
    // Ox has no item to steal, so the damage is dealt.
    expect(pendingDecision(state)).toMatchObject({
      kind: "split-damage",
      seats: [OX],
      params: { damage: "physical", amount: 8 - defenceResult },
    });
  });

  it("the defender can win, and deals the damage to the attacker", () => {
    const state = fight(1, (d) => d > 1);
    expect(outcome(state)).toMatchObject({ loser: "attacker" });
    expect(pendingDecision(state)).toMatchObject({
      kind: "split-damage",
      seats: [ZOE],
      params: { amount: outcome(state).defenceResult - 1 },
    });
  });

  it("a tie hurts no one", () => {
    const state = fight(4, (d) => d === 4);
    expect(outcome(state)).toMatchObject({ loser: null, harm: null });
    expect(state.pending).toBeNull();
    expect(eventTypes(state)).not.toContain("damaged");
  });

  it("explains the attack in plain language", () => {
    const started = attackOn(table());
    expect(
      started.lastEvents.map((e) => describeEvent(ENGINE, started, e)),
    ).toContain("Zoe Ingstrom attacks Ox Bellows.");
    const state = fight(8, (d) => d === 3);
    expect(
      state.lastEvents.map((e) => describeEvent(ENGINE, state, e)),
    ).toContain("Zoe Ingstrom beats Ox Bellows, 8 to 3.");
  });
});

describe("Stealing Items (rules.md, p. 13)", () => {
  const armed: SetUp = (s) =>
    explorer(s, OX).cards.push("axe", "armor", "bite");

  it("an attack that would deal 2 or more physical damage may steal a tradable item instead", () => {
    let state = fight(8, (d) => d <= 6, { setUp: armed });
    expect(pendingDecision(state)).toMatchObject({
      kind: "attack-steal",
      seats: [ZOE],
    });
    // Not the Armor ("can't be stolen") or the Bite ("can't be ... stolen").
    expect(labels(state)).toEqual([
      `Deal ${8 - outcome(state).defenceResult} physical damage`,
      "Steal the Axe instead",
    ]);
    state = choose(state, "Steal the Axe");
    expect(explorer(state, ZOE).cards).toContain("axe");
    expect(explorer(state, OX).cards).not.toContain("axe");
    expect(eventTypes(state)).not.toContain("damaged");
    // Stealing is the Axe's one action this turn (p. 11).
    expect(state.turn?.handled).toContain("axe");
  });

  it("the attacker may deal the damage instead", () => {
    const state = choose(
      fight(8, (d) => d <= 6, { setUp: armed }),
      "Deal",
    );
    expect(pendingDecision(state)).toMatchObject({
      kind: "split-damage",
      seats: [OX],
    });
  });

  it("not at a margin of 1", () => {
    const state = fight(8, (d) => d === 7, {
      setUp: (s) => explorer(s, OX).cards.push("axe"),
    });
    expect(pendingDecision(state)).toMatchObject({
      kind: "split-damage",
      params: { amount: 1 },
    });
  });

  it("a defender who wins deals damage but never steals", () => {
    const state = fight(0, (d) => d >= 2, {
      setUp: (s) => explorer(s, ZOE).cards.push("lucky-stone"),
    });
    expect(pendingDecision(state)).toMatchObject({
      kind: "split-damage",
      seats: [ZOE],
    });
  });

  it("not from a mental attack", () => {
    const state = fight(8, (d) => d <= 6, {
      setUp: (s) => {
        explorer(s, ZOE).cards.push("ring");
        armed(s);
      },
      mode: "using the Ring",
    });
    expect(pendingDecision(state)).toMatchObject({
      kind: "split-damage",
      params: { damage: "mental" },
    });
  });
});

describe("Distance Attacks (rules.md, p. 13)", () => {
  const apart: SetUp = (s) => {
    put(s, OX, "upper-landing");
    explorer(s, OX).cards.push("axe");
  };

  it("an attacker beaten by a target in another room takes no damage", () => {
    const state = fight(0, (d) => d === 4, { setUp: apart });
    expect(outcome(state)).toMatchObject({ loser: "attacker", harm: null });
    expect(state.pending).toBeNull();
    expect(
      state.lastEvents
        .filter((e) => e.type === "attack-outcome")
        .map((e) => describeEvent(ENGINE, state, e)),
    ).toEqual([
      "Ox Bellows beats Zoe Ingstrom, 4 to 0, but Zoe Ingstrom attacked from another room and takes no damage.",
    ]);
  });

  it("nothing can be stolen from another room", () => {
    const state = fight(8, (d) => d <= 6, { setUp: apart });
    expect(pendingDecision(state)).toMatchObject({
      kind: "split-damage",
      seats: [OX],
    });
  });
});

describe("Weapons (rules.md, p. 12)", () => {
  const holding = (...cards: string[]) =>
    attackOn(table((s) => explorer(s, ZOE).cards.push(...cards)));

  it("are optional, and only one is used per attack", () => {
    const state = holding("axe", "spear");
    expect(describeDecision(ENGINE, state, pendingDecision(state))).toBe(
      "Zoe Ingstrom: how do you attack Ox Bellows?",
    );
    expect(labels(state)).toEqual([
      "Attack with Might",
      "Attack with Might, using the Axe",
      "Attack with Might, using the Spear",
    ]);
  });

  it("are never used to defend", () => {
    const armed = testGame();
    explorer(armed, OX).cards.push("axe");
    const state = attackOn(armed);
    // Ox is offered nothing: he defends with his own 5 Might.
    const defence = state.lastEvents.filter((e) => e.type === "rolled")[1]
      .data as { figure: string; dice: number[] };
    expect(defence.figure).toBe(OX_FIGURE);
    expect(defence.dice).toHaveLength(5);
  });

  it("using one uses the item for the turn (p. 11)", () => {
    const state = choose(holding("axe"), "using the Axe");
    expect(state.turn?.handled).toContain("axe");
    expect(
      state.lastEvents.map((e) => describeEvent(ENGINE, state, e)),
    ).toContain("Zoe Ingstrom uses the Axe.");
  });

  it("one used this turn can't be used again", () => {
    const state = attackOn(
      table((s) => {
        explorer(s, ZOE).cards.push("axe");
        s.turn?.handled.push("axe");
      }),
    );
    // The only way left is a plain Might attack, which is forced.
    expect(pendingDecision(state).kind).toBe("roll-before");
  });
});

describe("Using an item on another player's turn (cards/items.md)", () => {
  // Zoe holds nothing, so her attack roll is made at once and Ox defends.
  const defending = (...cards: string[]) => {
    const state = testGame();
    explorer(state, OX).cards.push(...cards);
    const after = attackOn(state);
    expect(after.turn?.seat).toBe(ZOE);
    return after;
  };

  it("the Angel Feather names a defence roll's result on another explorer's turn", () => {
    const state = defending("angel-feather");
    expect(waitingOn(state)).toBe(OX);
    expect(labels(state)).toContain("Use Angel Feather: the result is 8");
  });

  it("the Lucky Stone rerolls a defence roll on another explorer's turn", () => {
    const state = defending("lucky-stone");
    expect(pendingDecision(state).kind).toBe("roll-after");
    expect(waitingOn(state)).toBe(OX);
    expect(labels(state).some((l) => l.startsWith("Use Lucky Stone"))).toBe(
      true,
    );
  });

  it("the Rabbit's Foot is for its holder's own turn only", () => {
    expect(eventTypes(defending("rabbits-foot"))).toContain("attack-outcome");
  });

  it("the Idol adds 2 dice to a defence roll (its community ruling)", () => {
    expect(labels(defending("idol"))).toEqual([
      "Make the Might defence roll (5 dice)",
      "Use Idol: add 2 dice",
    ]);
  });
});

describe("A card's attacker (cards that attack on behalf of something)", () => {
  it("is rolled by the player on the defender's right; turns pass to the left", () => {
    const state = testGame();
    expect(playerOnRight(state, ZOE)).toBe(FATHER);
    expect(playerOnRight(state, OX)).toBe(ZOE);
  });

  it("rolls its fixed dice, untouched by the roller's cards, and takes no damage when beaten", () => {
    let state = table((s) => explorer(s, FATHER).cards.push("idol"));
    state = start(ENGINE, { ...state, pending: null }, [
      cardAttack(ZOE_FIGURE, "might", 4, { source: "card", card: "bite" }),
    ]);
    // Father Rhinehardt throws the attack's dice at once; Zoe defends.
    expect(waitingOn(state)).toBe(ZOE);
    const thrown = state.lastEvents.find((e) => e.type === "rolled")?.data as
      { figure: string; dice: number[]; result: number } | undefined;
    expect(thrown?.figure).toBe(FATHER_FIGURE);
    expect(thrown?.dice).toHaveLength(4);
    expect(labels(state)[0]).toBe("Make the Might defence roll (3 dice)");
  });

  it("takes no damage when beaten", () => {
    for (const seed of SEEDS) {
      let state = table(() => {}, seed);
      state = start(ENGINE, { ...state, pending: null }, [
        cardAttack(ZOE_FIGURE, "might", 4, { source: "card", card: "bite" }),
      ]);
      state = choose(state, "the result is 8");
      if (outcome(state).loser !== "attacker") continue;
      expect(outcome(state).harm).toBeNull();
      expect(state.pending).toBeNull();
      return;
    }
    throw new Error("No seed has the attack beaten");
  });
});
