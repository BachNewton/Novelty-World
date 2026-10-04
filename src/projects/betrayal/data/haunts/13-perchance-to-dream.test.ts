import { describe, expect, it } from "vitest";
import { describeEvent } from "../../engine/describe";
import { die, discardCard, relocate } from "../../engine/effects";
import { hauntRule, matchesRoom, secretValue } from "../../engine/haunt";
import { moveCloser } from "../../engine/movement";
import { askNumber, askStructured } from "../../engine/questions";
import { local } from "../../engine/sources";
import { start } from "../../engine/step-loop";
import { placeOptions } from "../../engine/tiles";
import { viewFor } from "../../engine/view";
import { ENGINE } from "../../game";
import { simulate } from "../../simulation";
import {
  choose,
  eventTypes,
  explorer,
  offered,
  pendingDecision,
  put,
  ready,
  spectator,
  testGame,
  waitingOn,
  type TestGame,
} from "../../testing";
import type { GameState, RuleRef, Step } from "../../types";

// Haunt 13, Perchance to Dream, played from its content file
// (content/haunts/13-perchance-to-dream.md) and its rulings. Zoe reveals it
// with the Holy Symbol; Ox, with the lowest Sanity but for her, nearest her
// left, is the dreamer; Father Rhinehardt and Zoe are the heroes.

const ZOE = "zoe-ingstrom";
const OX = "ox-bellows";
const FATHER = "father-rhinehardt";
const N1 = "nightmare-1";
const N2 = "nightmare-2";
const SCENARIO_RULE: RuleRef = { source: "scenario" };
const ATTACK: RuleRef = { source: "rulebook", page: 13 };
const MIGHT = { trait: "might", card: null, reach: "room" } as const;

/** Haunt 13 begun with the Chapel already in the house, so the escape
 *  rooms (the Entrance Hall, the Grand Staircase and the Chapel) already
 *  number the players and the traitor adds none. `before` changes the game
 *  before anyone is ready, so the setup sees it; `after` once it is set up,
 *  on Father Rhinehardt's turn. */
function dreaming(
  {
    before = () => {},
    after = () => {},
  }: { before?: (s: GameState) => void; after?: (s: GameState) => void } = {},
  options: TestGame = {},
): GameState {
  let state = testGame({
    haunt: { number: 13, revealer: 0 },
    rooms: ["chapel"],
    ...options,
  });
  before(state);
  state = state.seats.reduce((s, _seat, i) => ready(s, i), state);
  after(state);
  return state;
}

/** Runs effects on a game, as a rule would, with nothing pending. */
function run(state: GameState, steps: Step[]): GameState {
  return start(ENGINE, { ...state, pending: null }, steps);
}

const labels = (state: GameState) => offered(state).map((c) => c.label);
const lines = (state: GameState) =>
  state.lastEvents
    .map((e) => describeEvent(ENGINE, spectator(state), e))
    .filter((line) => line !== null);
const eventOf = (state: GameState, type: string) => {
  const found = state.lastEvents.find((e) => e.type === type);
  if (!found) throw new Error(`No ${type} event`);
  return found;
};

/** Both heroes end their turns; the sleeping traitor's turn passes at once,
 *  and the Nightmares' monster turn begins with their movement roll. */
function toMonsterTurn(state: GameState): GameState {
  return choose(choose(state, "End your turn"), "End your turn");
}

const placeIn = (state: GameState, figure: string, room: string) => {
  state.figures[figure].place = { room, side: null };
};

describe("the traitor's setup", () => {
  it("puts the dreamer to sleep, with Nightmares, one per player, beside the body", () => {
    const state = dreaming();
    expect(state.seats[1].roles).toEqual(["traitor"]);
    expect(state.figures[OX].statuses.map((s) => s.id)).toEqual(["asleep"]);
    expect(eventOf(state, "status-added").rule.ruling).toBe("h13-asleep");
    const nightmares = Object.values(state.figures).filter(
      (f) => f.definition === "nightmare",
    );
    expect(nightmares.map((f) => [f.id, f.owner, f.place?.room])).toEqual([
      ["nightmare-1", 1, "entrance-hall"],
      ["nightmare-2", 1, "entrance-hall"],
      ["nightmare-3", 1, "entrance-hall"],
    ]);
    expect(lines(state)).toContain("Ox Bellows is now asleep.");
  });

  it("drops the dreamer's items and sets companions aside, and neither can kill", () => {
    const state = dreaming(
      {
        before: (s) => {
          // Holding the Book, Ox's Knowledge is as low as it goes: losing
          // the Book would take it past the skull.
          explorer(s, 1).traits.clips.knowledge = 0;
        },
      },
      { explorers: [{ seat: 1, cards: ["axe", "book", "dog", "bite"] }] },
    );
    expect(state.figures[OX].alive).toBe(true);
    expect(explorer(state, 1).traits.clips.knowledge).toBe(0);
    expect(state.piles["entrance-hall"]).toEqual(["axe", "book"]);
    // The companion is out of the game, not waiting for a hero to take it.
    expect(state.aside).toEqual([{ card: "dog", room: null }]);
    expect(state.tokens.some((t) => t.token === "dog")).toBe(false);
    // The Bite isn't an item: it stays with the body.
    expect(state.figures[OX].cards).toEqual(["bite"]);
  });

  it("writes down the escape rooms in the house, known only to the traitor", () => {
    const state = dreaming();
    expect(secretValue(state, "escape-rooms")).toBe(3);
    expect(state.haunt?.secrets).toEqual([
      { id: "escape-rooms", value: 3, knownBy: [1] },
    ]);
    expect(state.haunt?.counters).toEqual({ escapes: 0, wakes: 0 });
    expect(lines(state)).toContain(
      "The number of escape rooms is written down, known to Ox Bellows.",
    );
  });

  it("has the traitor choose and place escape rooms until they number the players", () => {
    let state = testGame({ haunt: { number: 13, revealer: 0 } });
    state = state.seats.reduce((s, _seat, i) => ready(s, i), state);
    expect(waitingOn(state)).toBe(1);
    const asked = pendingDecision(state);
    expect(asked.kind).toBe("choose-one");
    expect(asked.rule).toMatchObject({ source: "haunt", haunt: 13, ruling: "h13-top-up" });
    // Offered by name, never in the stack's hidden order.
    const names = labels(state);
    expect(names).toEqual([...names].sort());
    expect(names).toContain("Add the Chapel to the house");
    state = choose(state, "Add the Chapel to the house");
    expect(pendingDecision(state).kind).toBe("place-tile");
    state = choose(state, "Put the Chapel");
    expect(state.board.tiles.some((t) => t.tile === "chapel")).toBe(true);
    expect(eventTypes(state)).toContain("room-stack-shuffled");
    expect(secretValue(state, "escape-rooms")).toBe(3);
    // An added room draws no card.
    expect(eventTypes(state)).not.toContain("card-drawn");
    expect(state.turn?.seat).toBe(2);
  });
});

describe("the sleeping body", () => {
  it("passes its traitor turn, and slows no one", () => {
    let state = dreaming({ after: (s) => put(s, 0, "entrance-hall") });
    // Leaving the Entrance Hall, Father Rhinehardt is slowed by the three
    // Nightmares, never by the dreamer.
    expect(
      askNumber(ENGINE, state, "leaveCost", {
        figure: FATHER,
        from: { room: "entrance-hall", side: null },
      }),
    ).toBe(3);
    state = choose(state, "End your turn");
    state = choose(state, "End your turn");
    expect(state.turn?.kind).toBe("monster");
    expect(eventTypes(state)).toContain("forced");
  });

  it("can't be handed anything, nor be moved by any effect", () => {
    const state = dreaming({ after: (s) => put(s, 0, "entrance-hall") });
    // Heroes may attack the body, but not trade with it.
    expect(labels(state)).toContain("Attack Ox Bellows");
    expect(
      labels(state).some((l) => /(Give|Ask|Offer) Ox/.test(l)),
    ).toBe(false);
    const rule: RuleRef = { source: "card", card: "bell" };
    for (const move of [
      relocate(OX, "foyer", rule),
      moveCloser(OX, "foyer", ZOE, rule),
    ]) {
      const after = run(state, [move]);
      expect(after.figures[OX].place?.room).toBe("entrance-hall");
      expect(lines(after)).toContain(
        "Ox Bellows can't be moved out of the Entrance Hall.",
      );
    }
    // The Dark Dice's 5, rolled beside the body, has no one to push.
    const pushed = run(dreaming(), [
      local("dark-dice", "push", { figure: FATHER }),
    ]);
    expect(pushed.pending).toBeNull();
  });
});

describe("how Nightmares fight", () => {
  const outcome = (
    state: GameState,
    attacker: string,
    defender: string,
    attackResult: number,
    defenceResult: number,
  ) =>
    askStructured(ENGINE, state, "combatOutcome", {
      attack: { attacker, defender, rule: ATTACK },
      mode: MIGHT,
      attackResult,
      defenceResult,
    });

  it("deal mental damage, attacking or defending, which can't be swapped for a theft", () => {
    const state = dreaming();
    expect(outcome(state, N1, FATHER, 5, 2)).toMatchObject({
      loser: "defender",
      harm: { kind: "damage", damage: "mental", points: 3, rule: { ruling: "h13-mental-damage" } },
      steal: false,
    });
    expect(outcome(state, FATHER, N1, 1, 4)).toMatchObject({
      loser: "attacker",
      harm: { kind: "damage", damage: "mental", points: 3 },
    });
  });

  it("are killed by a hero who beats them attacking, and only stunned beaten as the attacker", () => {
    const state = dreaming();
    expect(outcome(state, FATHER, N1, 4, 2).harm).toMatchObject({
      kind: "kill",
      rule: { ruling: "h13-killed" },
    });
    expect(outcome(state, N1, FATHER, 2, 4).harm?.kind).toBe("stun");
  });
});

describe("how Nightmares escape", () => {
  /** The monster turn, with Nightmare 1 in the Chapel, acting. */
  function inChapel(after: (s: GameState) => void = () => {}): GameState {
    let state = dreaming({
      after: (s) => {
        placeIn(s, N1, "chapel");
        after(s);
      },
    });
    state = toMonsterTurn(state);
    return choose(state, "Act with Nightmare 1");
  }

  it("spends a move to leave the house, marks the room, and steps the escapes", () => {
    let state = inChapel();
    state = choose(state, "Escape from the house");
    expect(state.figures[N1].place).toBeNull();
    expect(state.figures[N1].alive).toBe(true);
    expect(state.haunt?.counters.escapes).toBe(1);
    expect(state.tokens).toContainEqual({ token: "item", room: "chapel" });
    const heroView = viewFor(ENGINE, state, 0);
    const escaped = eventOf(state, "escaped");
    expect(escaped.rule.ruling).toBe("h13-escape");
    expect(describeEvent(ENGINE, heroView, escaped)).toBe(
      "Nightmare 1 escapes from the house through the Chapel's window, and the Item token left there marks it used: 1 of ? escapes.",
    );
    expect(describeEvent(ENGINE, viewFor(ENGINE, state, 1), escaped)).toContain(
      "1 of 3 escapes",
    );
  });

  it("can always go before it has moved, but heroes in the way cost it a space each after", () => {
    const state = inChapel((s) => {
      put(s, 2, "chapel");
    });
    expect(labels(state)).toContain("Escape from the house");
    const tired = structuredClone(state);
    if (tired.turn === null) throw new Error("No turn");
    tired.turn.rolled.nightmare = 5;
    tired.turn.moved[N1] = 4;
    expect(labels(tired)).not.toContain("Escape from the house");
    // With no hero there, the last space is enough.
    put(tired, 2, "foyer");
    expect(labels(tired)).toContain("Escape from the house");
  });

  it("can't escape from a room already used", () => {
    let state = inChapel((s) => {
      placeIn(s, N2, "chapel");
    });
    state = choose(state, "Escape from the house");
    state = choose(state, "Bring in another Nightmare");
    state = choose(state, "Act with Nightmare 2");
    expect(labels(state)).not.toContain("Escape from the house");
  });

  it("can use an escape room found after the haunt began, which doesn't raise the number", () => {
    let state = inChapel((s) => {
      const where = placeOptions(ENGINE.catalog, s.board, "gardens", {
        kind: "doorways",
        floors: ["ground"],
        except: null,
      })[0];
      s.board.stack = s.board.stack.filter((t) => t !== "gardens");
      s.board.tiles.push({ tile: "gardens", ...where });
      placeIn(s, N1, "gardens");
    });
    state = choose(state, "Escape from the house");
    expect(state.haunt?.counters.escapes).toBe(1);
    expect(secretValue(state, "escape-rooms")).toBe(3);
  });
});

describe("unleashing Nightmares", () => {
  function escaped(after: (s: GameState) => void = () => {}): GameState {
    let state = dreaming({
      after: (s) => {
        placeIn(s, N1, "chapel");
        after(s);
      },
    });
    state = choose(toMonsterTurn(state), "Act with Nightmare 1");
    return choose(state, "Escape from the house");
  }

  it("is the traitor's choice at once, and a new one waits for the next monster turn", () => {
    let state = escaped();
    expect(pendingDecision(state).kind).toBe("replace-figure");
    expect(waitingOn(state)).toBe(1);
    expect(labels(state)).toEqual([
      "Bring in another Nightmare, in the Entrance Hall",
      "Don't bring in another Nightmare: the chance is lost",
    ]);
    state = choose(state, "Bring in another Nightmare");
    expect(state.figures["nightmare-4"].place?.room).toBe("entrance-hall");
    expect(state.turn?.actors).not.toContain("nightmare-4");
    expect(labels(state).some((l) => l.includes("Nightmare 4"))).toBe(false);
  });

  it("is lost when the traitor lets it pass", () => {
    const state = choose(escaped(), "Don't bring in another Nightmare");
    expect(lines(state)).toContain(
      "No other Nightmare is brought in: the chance is lost.",
    );
    expect(state.figures["nightmare-4"]).toBeUndefined();
  });

  it("never brings the Nightmares in play past one per player", () => {
    const state = escaped((s) => {
      s.figures["nightmare-9"] = { ...structuredClone(s.figures[N2]), id: "nightmare-9" };
    });
    expect(eventTypes(state)).toContain("replacement-declined");
    expect(eventTypes(state)).toContain("forced");
  });
});

describe("waking the dreamer", () => {
  /** Father Rhinehardt's turn in the dreamer's room, with Zoe there
   *  holding the Holy Symbol, and Father holding the Angel Feather. */
  const bedside = (wakes = 0) =>
    dreaming(
      {
        after: (s) => {
          put(s, 0, "entrance-hall");
          if (s.haunt) s.haunt.counters.wakes = wakes;
        },
      },
      { explorers: [{ seat: 2, cards: ["angel-feather", "smelling-salts"] }] },
    );
  const WAKE_SANITY = "Make a Sanity roll of 5+ to wake the dreamer";
  const WAKE_MIGHT = "Make a Might roll of 5+ to wake the dreamer";

  it("is a Sanity or Might roll of 5+, once a turn, by any hero while a hero there carries the Holy Symbol", () => {
    let state = bedside();
    expect(labels(state)).toEqual(expect.arrayContaining([WAKE_SANITY, WAKE_MIGHT]));
    state = choose(state, WAKE_SANITY);
    state = choose(state, "Use Angel Feather: the result is 5");
    expect(state.haunt?.counters.wakes).toBe(1);
    expect(eventOf(state, "task-result").rule.ruling).toBe("h13-wake");
    expect(lines(state)).toContain(
      "Father Rhinehardt's roll to wake the dreamer succeeds, and takes a Sanity Roll token.",
    );
    // One roll a turn, with either trait; the Holy Symbol wasn't used.
    expect(labels(state)).not.toContain(WAKE_SANITY);
    expect(labels(state)).not.toContain(WAKE_MIGHT);
    expect(state.turn?.handled).not.toContain("holy-symbol");
  });

  it("can't be tried with the Holy Symbol lying on a pile, nor away from the body", () => {
    const dropped = bedside();
    dropped.figures[ZOE].cards = [];
    dropped.piles["entrance-hall"] = ["holy-symbol"];
    expect(labels(dropped)).not.toContain(WAKE_SANITY);
    const away = bedside();
    put(away, 2, "foyer");
    put(away, 0, "foyer");
    expect(labels(away)).not.toContain(WAKE_SANITY);
  });

  it("isn't done by the Smelling Salts", () => {
    let state = bedside();
    explorer(state, 1).traits.clips.knowledge = 0;
    state = choose(state, "Use the Smelling Salts");
    if (pendingDecision(state).kind === "choose-one")
      state = choose(state, "Raise Ox Bellows's Knowledge");
    expect(state.haunt?.counters.wakes).toBe(0);
  });
});

describe("the end of the haunt", () => {
  const winners = (state: GameState) => state.result?.winners;

  it("goes to the traitor when enough Nightmares escape, showing everyone the number", () => {
    let state = dreaming({
      after: (s) => {
        placeIn(s, N1, "chapel");
        if (s.haunt) s.haunt.counters.escapes = 2;
      },
    });
    state = choose(toMonsterTurn(state), "Act with Nightmare 1");
    state = choose(state, "Escape from the house");
    expect(state.status).toBe("finished");
    expect(winners(state)).toEqual([1]);
    expect(state.haunt?.secrets[0].knownBy).toBeNull();
    expect(eventTypes(state).slice(-2)).toEqual(["secret-revealed", "game-over"]);
    expect(lines(state)).toContain(
      "The number of escape rooms is shown to everyone: 3.",
    );
  });

  it("goes to the heroes when they wake the dreamer", () => {
    let state = dreaming(
      {
        after: (s) => {
          put(s, 0, "entrance-hall");
          if (s.haunt) s.haunt.counters.wakes = 2;
        },
      },
      { explorers: [{ seat: 2, cards: ["angel-feather"] }] },
    );
    state = choose(state, "Make a Might roll of 5+ to wake the dreamer");
    state = choose(state, "Use Angel Feather: the result is 6");
    expect(state.status).toBe("finished");
    expect(winners(state)).toEqual([0, 2]);
    expect(lines(state)).toContain("The heroes win.");
  });

  it("goes to the traitor at once when the dreamer dies", () => {
    const state = run(dreaming(), [die(OX, ATTACK, FATHER)]);
    expect(winners(state)).toEqual([1]);
    expect(state.result?.rule).toMatchObject({ ruling: "h13-game-end" });
  });

  it("goes to the traitor at once when the Holy Symbol leaves the game", () => {
    const state = run(dreaming(), [discardCard(ZOE, "holy-symbol")]);
    expect(winners(state)).toEqual([1]);
    expect(state.result?.rule).toEqual({
      ...hauntRule(13, "Traitor wins when"),
      ruling: "h13-game-end",
    });
  });

  it("goes to the traitor when every hero dies", () => {
    const state = run(dreaming(), [
      die(ZOE, SCENARIO_RULE),
      die(FATHER, SCENARIO_RULE),
    ]);
    expect(winners(state)).toEqual([1]);
    expect(state.result?.rule).toMatchObject({ source: "rulebook", ruling: "game-end" });
  });
});

describe("what each side sees", () => {
  it("keeps the number of escape rooms from the heroes until it is shown", () => {
    const state = dreaming();
    for (const seat of [0, 2, null]) {
      const view = viewFor(ENGINE, state, seat);
      expect(view.haunt?.secrets).toEqual([
        { id: "escape-rooms", name: "number of escape rooms", knownBy: [1], known: false },
      ]);
      expect(view.haunt?.halves.traitor).toBeUndefined();
    }
    expect(viewFor(ENGINE, state, 1).haunt?.secrets[0]).toMatchObject({
      known: true,
      value: 3,
    });
  });
});

describe("random play through haunt 13", () => {
  it.each(["h6", "h17", "h22"])(
    "seed %s plays to the end, every listed choice legal, the number kept from the heroes",
    (seed) => {
      const hidden = (state: GameState) => {
        if (state.status !== "haunt") return;
        for (const [seat, s] of state.seats.entries()) {
          const secret = viewFor(ENGINE, state, seat).haunt?.secrets.find(
            (x) => x.id === "escape-rooms",
          );
          if (s.side === "heroes" && secret?.known)
            throw new Error(`Seat ${seat} sees the number of escape rooms`);
        }
      };
      expect(simulate(seed, ENGINE, hidden, { haunt: 13 }).ending).toBe(
        "finished",
      );
    },
    60_000,
  );
});

describe("the kit parts haunt 13 is built from", () => {
  it("match escape rooms by windows, outside and name, Widow's Walk tiles included", () => {
    const escapeRooms = { windows: true, outside: true, rooms: ["entrance-hall"] };
    const matching = Object.keys(ENGINE.catalog.rooms)
      .filter((room) => matchesRoom(ENGINE.catalog, room, escapeRooms))
      .sort();
    expect(matching).toEqual(
      expect.arrayContaining([
        "balcony", "bedroom", "chapel", "conservatory", "dining-room",
        "entrance-hall", "gardens", "grand-staircase", "graveyard",
        "master-bedroom", "patio", "tower", "drawing-room", "sewing-room",
        "roof-landing", "solarium", "tree-house", "widows-walk",
      ]),
    );
    expect(matching).not.toContain("foyer");
  });

  it("count a card still in its stack as in the game", () => {
    // Zoe holds the Holy Symbol; put it back in the omen stack instead.
    const state = dreaming();
    state.figures[ZOE].cards = [];
    state.decks.omen.draw.push("holy-symbol");
    const after = run(state, [die(N1, ATTACK, FATHER)]);
    expect(after.status).toBe("haunt");
  });
});
