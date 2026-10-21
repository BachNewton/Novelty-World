import { describe, expect, it } from "vitest";
import { createRng, type Rng } from "@/shared/lib/seeded-random";
import { shuffleArray } from "@/shared/lib/utils";
import type { CardId, GameEvent, GameState, GameView, Move, Seat } from "./contract";
import { referenceEngine as engine } from "./engine";
import { wrap } from "./engine/state";
import { inside, play, randomLegalMove } from "./engine/test-kit";
import { buildWorld, sampleHidden, type HiddenCards, type World } from "./sim";

/** A real game at one decision, with every seat's redacted history up to it. */
interface Moment {
  state: GameState;
  histories: readonly (readonly GameEvent[])[];
  step: number;
}

/** A random-legal game, `onStep` seeing it at every decision until it ends or `onStep` says to
 *  stop. */
function playGame(players: number, seed: string, onStep: (m: Moment) => boolean | void): void {
  const started = engine.newGame({ players }, seed);
  let state = started.state;
  const histories: GameEvent[][] = Array.from({ length: players }, (_, seat) => [...engine.redact(started.events, seat)]);
  const rng = createRng(`moves:${seed}`);
  for (let step = 0; step < 50_000; step++) {
    const view = engine.view(state, null);
    if (view.phase === "game-over") return;
    if (onStep({ state, histories, step }) === true) return;
    const options = engine.options(state, view.active);
    if (!options) throw new Error("the active seat has no options");
    const result = play(engine, state, view.active, randomLegalMove(options, engine.view(state, view.active), rng));
    histories.forEach((history, seat) => history.push(...engine.redact(result.events, seat)));
    state = result.state;
  }
}

/** The cards `seat` can't see, as they really are. */
function trueHidden(state: GameState): HiddenCards {
  const s = inside(state);
  return { hands: s.hands, deck: s.deck };
}

function worldOf(m: Moment, seat: Seat, hidden: HiddenCards, seed: string): World {
  return buildWorld(engine.view(m.state, seat), m.histories[seat], hidden, seed);
}

/** The kind of decision a game is at, to show the fuzzing reaches every kind. */
function decisionKind(state: GameState): string {
  const s = inside(state);
  if (s.phase === "reinforce") {
    if (s.reinforce?.afterElimination === true) return "forced trade";
    if (s.round === 0) return "first-turn reinforce";
    return s.reinforce?.placedAny === true ? "placing, part placed" : "placing";
  }
  if (s.phase === "attack") return s.occupying ? (s.occupying.eliminating === null ? "occupying" : "occupying, eliminating") : "attacking";
  return s.phase;
}

const seats = (view: GameView): Seat[] => view.seats.map((s) => s.seat);

/** Plays the same random moves in a world and in the real game, comparing as it goes. */
function playAlong(world: World, state: GameState, moves: number, rng: Rng): number {
  let played = 0;
  for (; played < moves; played++) {
    const view = engine.view(state, null);
    expect(world.view(null)).toEqual(view);
    for (const seat of seats(view)) {
      expect(world.view(seat)).toEqual(engine.view(state, seat));
      expect(world.options(seat)).toEqual(engine.options(state, seat));
    }
    if (view.phase === "game-over") break;
    const options = engine.options(state, view.active);
    if (!options) throw new Error("the active seat has no options");
    const move: Move = randomLegalMove(options, engine.view(state, view.active), rng);
    const real = play(engine, state, view.active, move);
    const imagined = world.apply(view.active, move);
    if (!imagined.ok) throw new Error(`the world refused ${JSON.stringify(move)}: ${imagined.reason}`);
    expect(imagined.events).toEqual(real.events);
    state = real.state;
    world = imagined.world;
  }
  return played;
}

describe("sim", () => {
  it.each([3, 4, 5, 6])(
    "builds from a seat's view, history and the true cards a world that shows the same view and options, at %i players",
    (players) => {
      const kinds = new Map<string, number>();
      for (const game of ["a"]) {
        playGame(players, `round-trip-${players}-${game}`, (m) => {
          const view = engine.view(m.state, null);
          kinds.set(decisionKind(m.state), (kinds.get(decisionKind(m.state)) ?? 0) + 1);
          const alive = view.seats.filter((s) => !s.eliminated).map((s) => s.seat);
          const other = alive[m.step % alive.length];
          for (const seat of new Set([view.active, other])) {
            const world = worldOf(m, seat, trueHidden(m.state), `world/${m.step}`);
            expect(world.view(seat)).toEqual(engine.view(m.state, seat));
            expect(world.options(seat)).toEqual(engine.options(m.state, seat));
            // A sampled guess is always one the seat could make.
            worldOf(m, seat, sampleHidden(engine.view(m.state, seat), m.histories[seat], `guess/${m.step}`), "w");
          }
        });
      }
      for (const kind of ["first-turn reinforce", "placing", "placing, part placed", "attacking", "occupying", "occupying, eliminating", "fortify"]) {
        expect(kinds.get(kind), kind).toBeGreaterThan(0);
      }
    },
  );

  it("reaches a forced trade after an elimination (ELIM-3) and builds it back", () => {
    // Forced trades are rare in random games: these seeds were found to reach some.
    let reached = 0;
    for (const seed of ["forced-0", "forced-1", "forced-2", "forced-3", "forced-4", "forced-5"]) {
      playGame(5, seed, (m) => {
        if (decisionKind(m.state) !== "forced trade") return;
        const seat = engine.view(m.state, null).active;
        const world = worldOf(m, seat, trueHidden(m.state), "forced");
        expect(world.view(seat)).toEqual(engine.view(m.state, seat));
        expect(world.options(seat)).toEqual(engine.options(m.state, seat));
        reached++;
      });
    }
    expect(reached).toBeGreaterThan(0);
  });

  it("plays the same future as the real game, given the true cards and the same random stream", () => {
    let checked = 0;
    for (const players of [3, 4, 5, 6]) {
      const rng = createRng(`future-${players}`);
      playGame(players, `future-${players}`, (m) => {
        if (m.step % 80 !== 0) return;
        const seat = engine.view(m.state, null).active;
        const seed = `future/${m.step}`;
        const world = worldOf(m, seat, trueHidden(m.state), seed);
        // The world's dice come from the bot's seed alone, so the real game is given that stream.
        const real = structuredClone(inside(m.state));
        real.rng = createRng(seed).getState();
        checked += playAlong(world, wrap(real), 60, rng);
      });
    }
    expect(checked).toBeGreaterThan(1000);
  });

  it("is the same world whatever the real game's hidden cards and random state", () => {
    let checked = 0;
    for (const players of [4, 6]) {
      const rng = createRng(`leak-${players}`);
      playGame(players, `leak-${players}`, (m) => {
        if (m.step % 60 !== 0) return;
        const seat = engine.view(m.state, null).active;
        const other = redealHidden(m.state, seat, rng);
        const view = engine.view(m.state, seat);
        expect(engine.view(other, seat)).toEqual(view);

        const worldFrom = (state: GameState) => {
          const seen = engine.view(state, seat);
          return buildWorld(seen, m.histories[seat], sampleHidden(seen, m.histories[seat], "guess"), "dice");
        };
        let a = worldFrom(m.state);
        let b = worldFrom(other);
        const moves = createRng(`leak-moves/${m.step}`);
        for (let i = 0; i < 40; i++) {
          const now = a.view(null);
          expect(b.view(null)).toEqual(now);
          for (const s of seats(now)) expect(b.view(s)).toEqual(a.view(s));
          if (now.phase === "game-over") break;
          const options = a.options(now.active);
          expect(b.options(now.active)).toEqual(options);
          if (!options) throw new Error("the active seat has no options");
          const move = randomLegalMove(options, a.view(now.active), moves);
          const ra = a.apply(now.active, move);
          const rb = b.apply(now.active, move);
          if (!ra.ok || !rb.ok) throw new Error("a world refused a move its options allowed");
          expect(rb.events).toEqual(ra.events);
          a = ra.world;
          b = rb.world;
          checked++;
        }
      });
    }
    expect(checked).toBeGreaterThan(200);
  });

  describe("refuses a guess the seat's knowledge rules out", () => {
    // A moment with cards in two hands and a traded card still buried below the deck's top.
    const found = findMoment();
    const { m, seat, holder, buried } = found;
    const view = engine.view(m.state, seat);
    const truth = trueHidden(m.state);
    const build = (hidden: HiddenCards) => () => buildWorld(view, m.histories[seat], hidden, "s");
    const withHands = (hands: (readonly CardId[])[]): HiddenCards => ({ hands, deck: truth.deck });

    it("accepts the true cards", () => {
      expect(build(truth)).not.toThrow();
    });

    it("refuses wrong hand sizes", () => {
      const hands = [...truth.hands];
      hands[holder] = [...hands[holder], truth.deck[0]];
      expect(build({ hands, deck: truth.deck.slice(1) })).toThrow(/cards, not/);
    });

    it("refuses a change to the seat's own hand", () => {
      const hands = [...truth.hands];
      hands[seat] = [truth.hands[holder][0], ...truth.hands[seat].slice(1)];
      hands[holder] = [truth.hands[seat][0], ...truth.hands[holder].slice(1)];
      expect(build(withHands(hands))).toThrow(/own hand/);
      hands[seat] = [...truth.hands[seat]].reverse();
      expect(build(withHands(hands))).toThrow(/own hand/);
    });

    it("refuses a card missing, duplicated or not in the game", () => {
      expect(build({ hands: truth.hands, deck: [truth.deck[1], ...truth.deck.slice(1)] })).toThrow(/twice/);
      const hands = [...truth.hands];
      hands[holder] = [truth.hands[seat][0], ...truth.hands[holder].slice(1)];
      expect(build(withHands(hands))).toThrow(/twice/);
      expect(build({ hands: truth.hands, deck: ["atlantis" as CardId, ...truth.deck.slice(1)] })).toThrow(/isn't in the game/);
    });

    it("refuses a traded card the draws since can't have reached", () => {
      const deck = [...truth.deck];
      const at = deck.indexOf(buried);
      [deck[0], deck[at]] = [deck[at], deck[0]];
      expect(build({ hands: truth.hands, deck })).toThrow(/traded back/);
      const hands = [...truth.hands];
      const swapped = [...truth.deck];
      swapped[at] = hands[holder][0];
      hands[holder] = [buried, ...hands[holder].slice(1)];
      expect(build({ hands, deck: swapped })).toThrow(/in a hand/);
    });

    it("refuses a spectator's view and a history that doesn't lead to the view", () => {
      expect(() => buildWorld(engine.view(m.state, null), m.histories[seat], truth, "s")).toThrow(/spectator/);
      expect(() => buildWorld(view, [], truth, "s")).toThrow(/beginning/);
      expect(() => buildWorld(view, m.histories[seat].slice(0, -1), truth, "s")).toThrow();
      expect(() => buildWorld(view, m.histories[(seat + 1) % view.seats.length], truth, "s")).toThrow(/another seat drew/);
    });
  });
});

/** The same game with everything `seat` can't see dealt again (the other hands, their sizes
 *  kept, and the deck's order) and the random source reseeded. */
function redealHidden(state: GameState, seat: Seat, rng: Rng): GameState {
  const s = structuredClone(inside(state));
  const others = s.hands.map((_, i) => i).filter((i) => i !== seat);
  const pool = shuffleArray([...s.deck, ...others.flatMap((i) => s.hands[i])], rng.next);
  s.deck = pool.splice(0, s.deck.length);
  for (const i of others) s.hands[i] = pool.splice(0, s.hands[i].length);
  s.rng = Math.floor(rng.next() * 2 ** 32);
  return wrap(s);
}

/** The first decision of a 4-player game where the active seat and another both hold cards and
 *  a card traded back is still buried below the deck's top. */
function findMoment(): { m: Moment; seat: Seat; holder: Seat; buried: CardId } {
  const found: { m: Moment; seat: Seat; holder: Seat; buried: CardId }[] = [];
  playGame(4, "refusals", (m) => {
    const s = inside(m.state);
    const seat = s.active;
    const holder = s.hands.findIndex((h, i) => i !== seat && h.length > 0);
    const last = s.trades.at(-1);
    if (s.hands[seat].length < 2 || holder < 0 || !last || s.phase !== "attack") return;
    // Buried until four draws have passed: none since this trade, and the deck was big.
    const drawsSince = m.histories[seat].slice(m.histories[seat].findLastIndex((e) => e.kind === "traded")).filter((e) => e.kind === "card-drawn").length;
    if (drawsSince > 0 || s.deck.length < 10) return;
    found.push({ m: { ...m, histories: m.histories.map((h) => [...h]) }, seat, holder, buried: last.cards[0] });
    return true;
  });
  if (found.length === 0) throw new Error("no moment for the refusal tests");
  return found[0];
}
