import { createRng } from "@/shared/lib/seeded-random";
import { shuffleArray } from "@/shared/lib/utils";
import { FULL_DECK } from "./cards";
import type { CardId, GameEvent, GameState, GameView, Move, Options, Seat } from "./contract";
import { referenceEngine } from "./engine";
import { TERRITORY_IDS, wrap, type EngineState, type Holding } from "./engine/state";
import type { TerritoryId } from "./map";

// Worlds a searching bot plays forward: whole games on the reference engine, built from one
// seat's view and history and the bot's own guess at what the seat can't see (the other hands
// and the deck's order), with a random source seeded by the bot. A world is opaque: it offers
// views, options and moves, and nothing converts it to or from a real game, so search can't
// reach any real game's hidden cards or dice.

/** A guess at the cards a seat can't see. */
export interface HiddenCards {
  /** Every seat's hand, the guessing seat's own included (exactly as its view shows it). */
  readonly hands: readonly (readonly CardId[])[];
  /** The deck, `deck[0]` its top card. */
  readonly deck: readonly CardId[];
}

export type WorldApplyResult =
  | { ok: true; world: World; events: readonly GameEvent[] }
  | { ok: false; reason: string };

/** A whole game the bot imagined, played by the reference engine, so legality is the engine's
 *  own. Its events aren't redacted: every card in it is the bot's own guess. */
export interface World {
  view(viewer: Seat | null): GameView;
  options(seat: Seat): Options | null;
  apply(seat: Seat, move: Move): WorldApplyResult;
}

class EngineWorld implements World {
  readonly #state: GameState;

  constructor(state: GameState) {
    this.#state = state;
  }

  view(viewer: Seat | null): GameView {
    return referenceEngine.view(this.#state, viewer);
  }

  options(seat: Seat): Options | null {
    return referenceEngine.options(this.#state, seat);
  }

  apply(seat: Seat, move: Move): WorldApplyResult {
    const result = referenceEngine.apply(this.#state, seat, move);
    if (!result.ok) return result;
    return { ok: true, world: new EngineWorld(result.state), events: result.events };
  }
}

// ---------------------------------------------------------------------------
// What the seat's history says, beyond its view
// ---------------------------------------------------------------------------

/** The public facts a world needs that the view doesn't carry, read from the seat's history. */
interface PublicRecord {
  /** Rounds of the turn order completed (`REINF-6`). */
  round: number;
  /** The reinforce phase in progress, if one is. */
  reinforce: { placedAny: boolean; afterElimination: boolean } | null;
  /** Cards traded back into the deck below its top 3 (`CARDS-8`) that too few draws have
   *  happened since to reach: each must still be in the deck, at least this deep. */
  minDepth: Map<CardId, number>;
}

/** CARDS-8: a traded card goes back below the deck's top 3 cards. */
const BURIED = 3;

function readHistory(view: GameView, history: readonly GameEvent[]): PublicRecord {
  const at = (seat: Seat) => view.turnOrder.indexOf(seat);
  let round = 0;
  let deck: number | null = null;
  let turn: { seat: Seat; turn: number } | null = null;
  let phase: GameView["phase"] | null = null;
  let reinforce: PublicRecord["reinforce"] = null;
  const minDepth = new Map<CardId, number>();
  const traded: (readonly CardId[])[] = [];

  for (const event of history) {
    switch (event.kind) {
      case "turn-order":
        if (event.order.join() !== view.turnOrder.join()) throw new Error("the history's turn order is not the view's");
        break;
      case "deck-reshuffled":
        deck = FULL_DECK.length;
        minDepth.clear();
        break;
      case "turn-started":
        // TURN-2: a new round begins when the turn order wraps round.
        if (turn !== null && at(event.seat) <= at(turn.seat)) round++;
        turn = { seat: event.seat, turn: event.turn };
        break;
      case "phase":
        phase = event.phase;
        reinforce = event.phase === "reinforce" ? { placedAny: false, afterElimination: event.rule === "ELIM-3" } : null;
        break;
      case "placed":
        if (reinforce === null) throw new Error("the history places armies outside a reinforce phase");
        reinforce.placedAny = true;
        break;
      case "card-drawn":
        if (deck === null) throw new Error("the history draws a card before the deck is made");
        deck--;
        if (event.card !== undefined && event.seat !== view.viewer) throw new Error("the history shows a card another seat drew");
        if (event.card !== undefined && minDepth.has(event.card)) {
          throw new Error(`the history draws ${event.card} sooner than a traded card can come up`);
        }
        for (const [card, depth] of minDepth) {
          if (depth <= 1) minDepth.delete(card);
          else minDepth.set(card, depth - 1);
        }
        break;
      case "traded":
        if (deck === null) throw new Error("the history trades a card before the deck is made");
        traded.push(event.cards);
        for (const card of event.cards) {
          // CARDS-8: anywhere in a deck of 3 or fewer. A card returned later can only push this
          // one deeper, so the bound holds until draws wear it away.
          if (deck > BURIED) minDepth.set(card, BURIED);
          else minDepth.delete(card);
          deck++;
        }
        break;
      default:
        break;
    }
  }

  if (deck === null || turn === null || phase === null) throw new Error("the history does not start at the game's beginning");
  if (turn.turn !== view.turn || turn.seat !== view.active) throw new Error("the history does not end at the view's turn");
  if (phase !== view.phase) throw new Error("the history does not end in the view's phase");
  if (deck !== view.cards.deck) throw new Error("the history's deck size is not the view's");
  if (traded.map((cards) => cards.join()).join(";") !== view.cards.traded.map((t) => t.cards.join()).join(";")) {
    throw new Error("the history's trades are not the view's");
  }
  return { round, reinforce, minDepth };
}

// ---------------------------------------------------------------------------
// Building a world
// ---------------------------------------------------------------------------

function seatOf(view: GameView): Seat {
  if (view.viewer === null || view.cards.hand === null) throw new Error("a world is built from a seat's view, not a spectator's");
  return view.viewer;
}

/** Why `hidden` can't be the cards `view`'s seat can't see, or null when it can. */
function refusal(view: GameView, record: PublicRecord, hidden: HiddenCards): string | null {
  const seat = seatOf(view);
  if (hidden.hands.length !== view.seats.length) return `the guess has ${hidden.hands.length} hands for ${view.seats.length} seats`;
  for (const s of view.seats) {
    if (hidden.hands[s.seat].length !== s.handSize) {
      return `the guess gives seat ${s.seat} ${hidden.hands[s.seat].length} cards, not ${s.handSize}`;
    }
  }
  if (hidden.hands[seat].join() !== (view.cards.hand ?? []).join()) return "the guess changes the seat's own hand";
  if (hidden.deck.length !== view.cards.deck) return `the guess's deck has ${hidden.deck.length} cards, not ${view.cards.deck}`;

  const seen = new Set<CardId>();
  for (const card of [...hidden.hands.flat(), ...hidden.deck]) {
    if (!FULL_DECK.includes(card)) return `the guess has a card that isn't in the game: ${String(card)}`;
    if (seen.has(card)) return `the guess has ${card} twice`;
    seen.add(card);
  }
  // Every card is somewhere (CARDS-8, derived): with the sizes right, no duplicate means none missing.

  for (const [card, depth] of record.minDepth) {
    const at = hidden.deck.indexOf(card);
    if (at < depth) return `${card} was traded back below the deck's top cards and can't be ${at < 0 ? "in a hand" : `at depth ${at}`} yet`;
  }
  return null;
}

/** A world for the seat whose `view` this is: its board and public facts exactly the real
 *  game's, the cards it can't see as `hidden` guesses them, and dice drawn from `seed`.
 *  `history` is the seat's redacted history, every event since the game began. Throws on a
 *  guess the seat's knowledge rules out. */
export function buildWorld(view: GameView, history: readonly GameEvent[], hidden: HiddenCards, seed: string): World {
  seatOf(view);
  const record = readHistory(view, history);
  const reason = refusal(view, record, hidden);
  if (reason !== null) throw new Error(`not a guess this seat could make: ${reason}`);

  const o = view.occupying;
  // During a move-in, the seat that lost its last territory is still in the game (ELIM-3,
  // note `elimination-order`): the one seat with no territories that isn't out.
  const eliminating = view.seats.find((s) => s.territories === 0 && !s.eliminated)?.seat ?? null;
  const state: EngineState = {
    players: view.seats.length,
    rng: createRng(seed).getState(),
    turnOrder: [...view.turnOrder],
    board: Object.fromEntries(
      TERRITORY_IDS.map((t): [TerritoryId, Holding] => [t, { owner: view.territories[t].owner, armies: view.territories[t].armies }]),
    ) as Record<TerritoryId, Holding>,
    hands: hidden.hands.map((hand) => [...hand]),
    deck: [...hidden.deck],
    trades: view.cards.traded.map((t) => ({ seat: t.seat, cards: [t.cards[0], t.cards[1], t.cards[2]] })),
    eliminated: view.seats.map((s) => s.eliminated),
    turn: view.turn,
    round: record.round,
    active: view.active,
    phase: view.phase,
    reinforce: record.reinforce && { armiesToPlace: view.armiesToPlace, ...record.reinforce },
    occupying: o && { from: o.from, to: o.to, min: o.min, max: o.max, eliminating },
    capturedThisTurn: view.cardEarned,
    winner: view.winner,
  };
  const world = new EngineWorld(wrap(state));
  if (canonical(world.view(view.viewer)) !== canonical(view)) {
    throw new Error("a world built from this view doesn't show it back: the view and history disagree");
  }
  return world;
}

/** A guess at the cards `view`'s seat can't see, drawn from `seed`: the unseen cards dealt at
 *  random, with a card traded back below the deck's top kept out of reach of the draws since. */
export function sampleHidden(view: GameView, history: readonly GameEvent[], seed: string): HiddenCards {
  const seat = seatOf(view);
  const record = readHistory(view, history);
  const rng = createRng(seed);
  const own = view.cards.hand ?? [];
  const unseen = shuffleArray(FULL_DECK.filter((card) => !own.includes(card)), rng.next);

  // The buried cards first, deepest bound first: each later one may go anywhere the earlier
  // ones could, so this finds room whenever there is any.
  const deck: (CardId | null)[] = Array.from({ length: view.cards.deck }, () => null);
  const buried = [...record.minDepth].sort(([, a], [, b]) => b - a);
  for (const [card, depth] of buried) {
    const free = deck.flatMap((c, i) => (c === null && i >= depth ? [i] : []));
    if (free.length === 0) throw new Error(`no room in the deck for ${card} below depth ${depth}`);
    deck[free[Math.floor(rng.next() * free.length)]] = card;
  }
  const rest = unseen.filter((card) => !record.minDepth.has(card));
  const hands = view.seats.map((s) => (s.seat === seat ? [...own] : rest.splice(0, s.handSize)));
  return { hands, deck: deck.map((card) => card ?? (rest.shift() as CardId)) };
}

/** JSON with every object's keys in order, so two equal views compare equal however built. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_, v: unknown) =>
    v !== null && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1)))
      : v,
  );
}
