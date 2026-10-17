import type { CardId, GameEvent, Seat } from "../contract";

// The card history one seat can see, in the form the odds work on.
//
// The deck below its top 3 cards is always in uniformly random order: it starts shuffled,
// a traded card goes into it at a uniformly random place (`CARDS-8`), and a draw takes the
// top card, so the card moving up into the top 3 is a uniformly random one of the rest. So
// the deck is a queue of 3 in front of a bag, and every card drawn was picked at random
// from the bag 3 draws before it was drawn (the first three, from the full deck at the
// start). Each pick is a **slot**: it lands in a hand when drawn, and passes to whoever
// eliminates its holder (`ELIM-2`).
//
// A card's **stay** is its time in the bag: from the start of the game, or from a trade
// that put it back, until a pick took it. A stay ends in one slot, picked after the stay
// began. When the card is seen again (traded by its holder, drawn by the viewer, or taken
// on an elimination by the viewer), the slot it ended in is narrowed to those that seat
// held at that moment. Every way of matching stays to slots that fits those facts is
// equally likely: each pick is uniform over a bag whose size is public. That matching is
// all the odds need.

/** The deck's top cards that a traded card never goes under (`CARDS-8`). */
export const QUEUE = 3;

/** A start before every pick: the stays of the cards in the starting deck. */
const START = -2;
/** When the first three picks were made, filling the queue from the starting deck. */
const FIRST_PICKS = -1;

export interface Slot {
  /** When the pick was made, as an index into the history: `FIRST_PICKS` for the first three. */
  picked: number;
  /** When it was drawn, or null while it is still in the deck's top 3. */
  drawn: number | null;
  /** Its holders, each from the event it came to them: the seat that drew it, then each seat
   *  that eliminated its holder. */
  holders: { seat: Seat; from: number }[];
}

export interface Stay {
  card: CardId;
  /** When the card went into the bag: an index into the history, or `START`. */
  start: number;
  /** For a stay ended by a card seen since: the slots it may have ended in, and when it was
   *  seen. Null for a card not seen since, which is in the bag or in a hidden slot. */
  seen: { slots: readonly number[]; at: number } | null;
}

export interface Timeline {
  players: number;
  viewer: Seat | null;
  slots: readonly Slot[];
  stays: readonly Stay[];
  /** The slot of the deck's top card: the next card drawn. */
  top: number;
  /** Cards in the bag: the deck below its top 3. */
  bag: number;
  /** Each seat's cards that the viewer can't see: the whole hand of anyone else, none of
   *  their own. 0 for a seat out of the game. */
  hidden: readonly number[];
  out: readonly boolean[];
}

export function holderAt(slot: Slot, at: number): Seat | null {
  let holder: Seat | null = null;
  for (const h of slot.holders) if (h.from <= at) holder = h.seat;
  return holder;
}

export function holderNow(slot: Slot): Seat | null {
  return slot.holders.length === 0 ? null : slot.holders[slot.holders.length - 1].seat;
}

/** The timeline of a game as `viewer` sees it, from its redacted history and the viewer's hand
 *  now. Null when the viewer is out of the game: their old hand has gone to the seat that
 *  eliminated them, a case the odds aren't for. `deck` is the starting deck: the whole deck in
 *  a real game, a smaller one in tests. */
export function buildTimeline(input: {
  players: number;
  viewer: Seat | null;
  history: readonly GameEvent[];
  hand: readonly CardId[] | null;
  deck: readonly CardId[];
}): Timeline | null {
  const { players, viewer, history, deck } = input;
  const slots: Slot[] = [];
  for (let i = 0; i < QUEUE; i++) slots.push({ picked: FIRST_PICKS, drawn: null, holders: [] });
  const stays: Stay[] = [];
  const current = new Map<CardId, Stay>();
  const begin = (card: CardId, start: number) => {
    const stay: Stay = { card, start, seen: null };
    stays.push(stay);
    current.set(card, stay);
  };
  for (const card of deck) begin(card, START);

  const end = (card: CardId, slots: readonly number[], at: number) => {
    const stay = current.get(card);
    if (!stay) throw new Error(`card ${card} is not in the deck`);
    if (stay.seen) throw new Error(`card ${card} was seen twice in one stay`);
    if (slots.length === 0) throw new Error(`card ${card}, seen at event ${at}, fits no slot`);
    stay.seen = { slots, at };
    current.delete(card);
  };
  /** Slots `seat` held just before event `at` that were picked during `card`'s stay. */
  const heldBy = (seat: Seat, at: number, card: CardId) => {
    const stay = current.get(card);
    if (!stay) throw new Error(`card ${card} is not in the deck`);
    const fits: number[] = [];
    slots.forEach((slot, k) => {
      if (slot.drawn !== null && slot.drawn < at && slot.picked > stay.start && holderAt(slot, at - 1) === seat) fits.push(k);
    });
    return fits;
  };

  const handSize: number[] = Array.from({ length: players }, () => 0);
  const out: boolean[] = Array.from({ length: players }, () => false);
  /** The viewer's cards whose stays are ended: drawn by them, or taken and since seen. */
  const known = new Set<CardId>();
  /** The viewer's eliminations, whose cards are seen only as the viewer trades them or now. */
  const taken: { victim: Seat; at: number }[] = [];
  /** A card the viewer holds but didn't draw came from one of their eliminations before `at`. */
  const endTaken = (card: CardId, at: number) => {
    const from = taken.filter((t) => t.at < at);
    if (from.length === 0) throw new Error(`the viewer holds ${card} but never drew or took it`);
    // When the viewer took cards from more than one seat before this one was seen, it is
    // known only to be from one of them.
    const fits = new Set(from.flatMap((t) => heldBy(t.victim, t.at, card)));
    end(card, [...fits].sort((a, b) => a - b), from[from.length - 1].at);
  };

  let draws = 0;
  history.forEach((event, at) => {
    switch (event.kind) {
      case "card-drawn": {
        const k = draws++;
        const slot = slots[k];
        slot.drawn = at;
        slot.holders.push({ seat: event.seat, from: at });
        slots.push({ picked: at, drawn: null, holders: [] });
        handSize[event.seat]++;
        if (event.seat === viewer) {
          if (event.card === undefined) throw new Error("the viewer's own draw has no card");
          const stay = current.get(event.card);
          if (!stay || stay.start >= slot.picked) throw new Error(`card ${event.card} can't have been drawn at event ${at}`);
          end(event.card, [k], at);
          known.add(event.card);
        }
        return;
      }
      case "traded": {
        const inDeck = deck.length - handSize.reduce((sum, n) => sum + n, 0);
        if (inDeck <= QUEUE) throw new Error(`a trade into a deck of ${inDeck}: the odds assume a deck of more than ${QUEUE}`);
        handSize[event.seat] -= 3;
        for (const card of event.cards) {
          if (event.seat === viewer) {
            if (!known.delete(card)) endTaken(card, at);
          } else {
            if (known.has(card)) throw new Error(`seat ${event.seat} traded ${card}, which the viewer holds`);
            end(card, heldBy(event.seat, at, card), at);
          }
          begin(card, at);
        }
        return;
      }
      case "eliminated": {
        for (const slot of slots) {
          if (slot.drawn !== null && holderNow(slot) === event.seat) slot.holders.push({ seat: event.by, from: at });
        }
        handSize[event.by] += handSize[event.seat];
        handSize[event.seat] = 0;
        out[event.seat] = true;
        if (event.by === viewer) taken.push({ victim: event.seat, at });
        return;
      }
      default:
        return;
    }
  });

  if (viewer !== null && out[viewer]) return null;
  if (viewer !== null) {
    if (!input.hand) throw new Error("a seated viewer's hand is needed");
    if (input.hand.length !== handSize[viewer]) {
      throw new Error(`the viewer holds ${input.hand.length} cards, the history says ${handSize[viewer]}`);
    }
    for (const card of input.hand) if (!known.has(card)) endTaken(card, history.length);
  }
  const inHands = handSize.reduce((sum, n) => sum + n, 0);
  return {
    players,
    viewer,
    slots,
    stays,
    top: draws,
    bag: deck.length - inHands - QUEUE,
    hidden: handSize.map((n, seat) => (seat === viewer ? 0 : n)),
    out,
  };
}
