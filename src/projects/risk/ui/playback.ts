import { pathThrough } from "../board/graph";
import type { GameEvent, GameView, Seat, TerritoryView } from "../contract";
import { CONTINENTS, TERRITORIES, type ContinentId, type TerritoryId } from "../map";
import type { LoggedEvent } from "../online/game";

/*
 * Playback: what the screen presents of a game, one event at a time, at the viewer's chosen speed.
 *
 * A phone hears other seats' moves in bursts: the server drives every bot seat as fast as the
 * engine goes, so a bot's whole turn lands in a fraction of a second. The screen plays what it
 * hears back at a human pace instead: each event of another seat's turn holds the screen for a
 * beat, the board stepping through the state after each one. The game itself is untouched: the
 * engine, the server's drive and the bots never wait on it.
 *
 * The board between two views is stepped from the events alone (`stepView`), which carry
 * everything the board shows except one number: the armies a blitz's capture moves in before the
 * attacker picks the total, which it guesses. Every batch the feed delivers ends with the view it
 * leads to, so the presented board snaps to the engine's own view at each one, and a guess, or a
 * batch missed while the page wasn't listening, never outlives it.
 *
 * The viewer's own moves are never held back: the player made them and knows what they are, so
 * pacing them would only make the game feel slow to answer. Their effects still play on the map.
 */

export interface Speed {
  name: string;
  /** How long a beat lasts against the default pace; 0 plays everything as it arrives. */
  scale: number;
}

export const SPEEDS: readonly Speed[] = [
  { name: "Very slow", scale: 2 },
  { name: "Slower", scale: 1.4 },
  { name: "Slow", scale: 1 },
  { name: "Moderate", scale: 0.75 },
  { name: "Brisk", scale: 0.55 },
  { name: "Quick", scale: 0.4 },
  { name: "Fast", scale: 0.3 },
  { name: "Faster", scale: 0.2 },
  { name: "Very fast", scale: 0.1 },
  { name: "Instant", scale: 0 },
];

/** Slow: each beat lasts long enough to find where it happened and see what came of it (about a
 *  second, the big ones longer), so a bot's typical turn takes about twenty seconds. */
export const DEFAULT_SPEED = 2;

/** How long each kind of event holds the screen at the default pace, in ms. The rest (the phase
 *  changing, the deck reshuffled, setup) pass with the beat before them. */
const BEAT_MS: Partial<Record<GameEvent["kind"], number>> = {
  "turn-started": 1000,
  reinforcements: 700,
  placed: 900,
  traded: 1300,
  battle: 1000,
  blitzed: 1400,
  captured: 800,
  occupied: 900,
  fortified: 1500,
  "card-drawn": 500,
  eliminated: 2400,
  "game-over": 2500,
};

/** How long the map's effects of an event play when nothing waits for them: the viewer's own
 *  moves, and every move at the instant speed. */
export const FLASH_MS = 450;

/** Events kept for the log and the news, as many as the feed keeps. */
const SHOWN_KEPT = 200;

// ---------------------------------------------------------------------------
// The board between views
// ---------------------------------------------------------------------------

/** The latest fight of the turn: where it was, and the dice the attacker rolled (null for a
 *  blitz), which set how many armies a capture moves in at once. */
export interface Fight {
  from: TerritoryId;
  to: TerritoryId;
  dice: number | null;
}

export interface Board {
  view: GameView;
  fight: Fight | null;
}

const IDS = TERRITORIES.map((t) => t.id);
const CONTINENT_IDS = new Map<ContinentId, TerritoryId[]>(CONTINENTS.map((c) => [c.id, TERRITORIES.filter((t) => t.continent === c.id).map((t) => t.id)]));

function withTerritories(view: GameView, changes: Partial<Record<TerritoryId, TerritoryView>>): GameView {
  const territories = { ...view.territories, ...changes };
  const seats = view.seats.map((seat) => {
    const owned = IDS.filter((id) => territories[id].owner === seat.seat);
    return { ...seat, territories: owned.length, armies: owned.reduce((sum, id) => sum + territories[id].armies, 0) };
  });
  return { ...view, territories, seats };
}

function withArmies(view: GameView, changes: readonly [TerritoryId, number][]): GameView {
  const next: Partial<Record<TerritoryId, TerritoryView>> = {};
  for (const [id, delta] of changes) {
    const at = next[id] ?? view.territories[id];
    next[id] = { ...at, armies: at.armies + delta };
  }
  return withTerritories(view, next);
}

const withSeat = (view: GameView, seat: Seat, change: (s: GameView["seats"][number]) => Partial<GameView["seats"][number]>): GameView => ({
  ...view,
  seats: view.seats.map((s) => (s.seat === seat ? { ...s, ...change(s) } : s)),
});

/** The board once `event` has happened: the territories, the seats' counts, whose turn and which
 *  phase, the cards' public counts and the viewer's hand where the event shows it. */
export function stepView(board: Board, event: GameEvent): Board {
  const { view, fight } = board;
  const at = (view: GameView): Board => ({ view, fight });
  switch (event.kind) {
    case "turn-order":
      return at({ ...view, turnOrder: event.order });
    case "dealt":
      return at(withTerritories(view, Object.fromEntries(Object.entries(event.owners).map(([id, owner]) => [id, { owner, armies: 1 }]))));
    case "starting-armies":
      return at(withTerritories(view, Object.fromEntries(Object.entries(event.armies).map(([id, armies]) => [id, { owner: view.territories[id as TerritoryId].owner, armies }]))));
    case "reinforcements":
      return at({ ...view, armiesToPlace: event.fromTerritories + event.fromContinents.reduce((sum, c) => sum + c.bonus, 0) + event.firstTurnBonus });
    case "placed":
      return at({ ...withArmies(view, [[event.territory, event.armies]]), armiesToPlace: view.armiesToPlace - event.armies });
    case "traded": {
      const placed = event.bonus ? withArmies(view, [[event.bonus.territory, event.bonus.armies]]) : view;
      const traded = withSeat(placed, event.seat, (s) => ({ handSize: s.handSize - 3 }));
      const hand = view.cards.hand && event.seat === view.viewer ? view.cards.hand.filter((card) => !event.cards.includes(card)) : view.cards.hand;
      return at({ ...traded, armiesToPlace: view.armiesToPlace + event.armies, cards: { deck: view.cards.deck + 3, traded: [...view.cards.traded, { seat: event.seat, cards: event.cards }], hand } });
    }
    case "battle":
    case "blitzed":
      return {
        view: withArmies(view, [
          [event.from, -event.attackerLosses],
          [event.to, -event.defenderLosses],
        ]),
        fight: { from: event.from, to: event.to, dice: event.kind === "battle" ? event.attackerDice.length : null },
      };
    case "captured": {
      if (fight?.to !== event.territory) throw new Error(`${event.territory} was captured with no fight for it`);
      const from = view.territories[fight.from];
      // A battle moves in as many armies as it rolled dice; a blitz rolls none and moves in 3, or
      // all that can move. A blitz that kept more than that back moves in fewer, which the view
      // at the end of the batch puts right.
      const moving = fight.dice ?? Math.min(3, from.armies - 1);
      const moved = withTerritories(view, { [fight.from]: { ...from, armies: from.armies - moving }, [event.territory]: { owner: event.seat, armies: moving } });
      return at({ ...moved, cardEarned: true, occupying: { from: fight.from, to: event.territory, min: moving, max: from.armies - 1 } });
    }
    case "occupied": {
      const extra = event.armies - view.territories[event.to].armies;
      return at({ ...withArmies(view, [[event.from, -extra], [event.to, extra]]), occupying: null });
    }
    case "eliminated": {
      const taken = withSeat(withSeat(view, event.by, (s) => ({ handSize: s.handSize + event.cardsTaken })), event.seat, () => ({ eliminated: true, handSize: 0 }));
      return at(event.seat === view.viewer ? { ...taken, cards: { ...taken.cards, hand: [] } } : taken);
    }
    case "card-drawn": {
      const drawn = withSeat(view, event.seat, (s) => ({ handSize: s.handSize + 1 }));
      const hand = view.cards.hand && event.card && event.seat === view.viewer ? [...view.cards.hand, event.card] : view.cards.hand;
      return at({ ...drawn, cards: { ...view.cards, deck: view.cards.deck - 1, hand } });
    }
    case "deck-reshuffled":
      return board;
    case "fortified":
      return at(withArmies(view, [[event.from, -event.armies], [event.to, event.armies]]));
    case "turn-started":
      return { view: { ...view, active: event.seat, turn: event.turn, cardEarned: false }, fight: null };
    case "phase":
      return at({ ...view, phase: event.phase, occupying: event.phase === "game-over" ? null : view.occupying });
    case "game-over":
      return at({ ...view, winner: event.winner, occupying: null });
  }
}

// ---------------------------------------------------------------------------
// What the map shows of each event
// ---------------------------------------------------------------------------

export type Effect =
  /** Armies arriving on a territory: placed, or a trade's bonus. */
  | { kind: "arrive"; territory: TerritoryId; armies: number; seat: Seat }
  /** A fight across a border, with each side's losses. */
  | { kind: "fight"; from: TerritoryId; to: TerritoryId; attackerLosses: number; defenderLosses: number }
  /** A territory changing hands. */
  | { kind: "capture"; territory: TerritoryId; seat: Seat }
  /** Armies marching along a path of territories: a capture's move-in, or a fortify. */
  | { kind: "march"; path: readonly TerritoryId[]; armies: number; seat: Seat }
  /** A seat taking a whole continent. */
  | { kind: "continent"; continent: ContinentId; seat: Seat }
  /** A seat out of the game, where its last territory fell. */
  | { kind: "fallen"; seat: Seat; territory: TerritoryId | null };

/** Who holds each whole continent, if anyone. */
export function continentHolders(view: GameView): Map<ContinentId, Seat | null> {
  return new Map(
    [...CONTINENT_IDS].map(([continent, ids]) => {
      const owner = view.territories[ids[0]].owner;
      return [continent, ids.every((id) => view.territories[id].owner === owner) ? owner : null];
    }),
  );
}

function effectsOf(before: Board, after: Board, event: GameEvent): Effect[] {
  const effects: Effect[] = [];
  switch (event.kind) {
    case "placed":
      effects.push({ kind: "arrive", territory: event.territory, armies: event.armies, seat: event.owner });
      break;
    case "traded":
      if (event.bonus) effects.push({ kind: "arrive", territory: event.bonus.territory, armies: event.bonus.armies, seat: event.seat });
      break;
    case "battle":
    case "blitzed":
      effects.push({ kind: "fight", from: event.from, to: event.to, attackerLosses: event.attackerLosses, defenderLosses: event.defenderLosses });
      break;
    case "captured":
      effects.push({ kind: "capture", territory: event.territory, seat: event.seat });
      break;
    case "occupied":
      if (event.armies > before.view.territories[event.to].armies) effects.push({ kind: "march", path: [event.from, event.to], armies: event.armies - before.view.territories[event.to].armies, seat: after.view.territories[event.to].owner });
      break;
    case "fortified": {
      const path = pathThrough(before.view.territories, event.from, event.to) ?? [event.from, event.to];
      effects.push({ kind: "march", path, armies: event.armies, seat: before.view.territories[event.from].owner });
      break;
    }
    case "eliminated":
      effects.push({ kind: "fallen", seat: event.seat, territory: before.fight?.to ?? null });
      break;
    default:
      break;
  }
  const held = continentHolders(before.view);
  for (const [continent, seat] of continentHolders(after.view)) if (seat !== null && held.get(continent) !== seat) effects.push({ kind: "continent", continent, seat });
  return effects;
}

// ---------------------------------------------------------------------------
// The queue
// ---------------------------------------------------------------------------

/** What waits to be presented: an event, or the view a batch of them leads to. */
type Item = { kind: "event"; logged: LoggedEvent; first: boolean } | { kind: "view"; view: GameView };

/** One step of the presentation: the map's effects of the events it showed, and how long they
 *  play. A paced beat holds the screen for that long; a flash only plays. */
export interface Beat {
  key: number;
  effects: readonly Effect[];
  ms: number;
  paced: boolean;
}

export interface Playback {
  board: Board;
  /** The events presented so far, oldest first. */
  shown: readonly LoggedEvent[];
  /** Where the latest batch's events start in `shown`: the news is its last line. */
  latestFrom: number;
  pending: readonly Item[];
  /** The id of the last event taken from the feed. */
  cursor: string | null;
  beat: Beat | null;
  /** A paced beat holds the screen until `tick`. */
  holding: boolean;
}

/** How the presentation runs now: its speed's scale, and whose moves are the viewer's own. */
export interface Pace {
  scale: number;
  viewer: Seat | null;
}

/** A game as it first shows: everything so far already presented. */
export function startPlayback(view: GameView, events: readonly LoggedEvent[]): Playback {
  const shown = events.slice(-SHOWN_KEPT);
  return { board: { view, fight: null }, shown, latestFrom: Math.max(0, shown.length - 1), pending: [], cursor: events.at(-1)?.id ?? null, beat: null, holding: false };
}

/** Whether the screen shows the game as it is: nothing waiting and no beat holding it. */
export const caughtUp = (p: Playback) => !p.holding && p.pending.length === 0;

function holdFor(view: GameView, event: GameEvent, pace: Pace): number {
  if (pace.scale === 0 || view.active === pace.viewer) return 0;
  return (BEAT_MS[event.kind] ?? 0) * pace.scale;
}

/** Presents what waits, up to and including the next event that takes a beat. */
function advance(p: Playback, pace: Pace): Playback {
  let { board, shown, latestFrom } = p;
  const pending = [...p.pending];
  const effects: Effect[] = [];
  let hold = 0;
  for (let item = pending.at(0); item !== undefined; item = pending.at(0)) {
    if (item.kind === "view") {
      board = { ...board, view: item.view };
      pending.shift();
      continue;
    }
    const ms = holdFor(board.view, item.logged.event, pace);
    if (ms > 0 && hold > 0) break;
    pending.shift();
    if (item.first) latestFrom = shown.length;
    const next = stepView(board, item.logged.event);
    effects.push(...effectsOf(board, next, item.logged.event));
    board = next;
    shown = [...shown, item.logged];
    if (shown.length > SHOWN_KEPT) {
      latestFrom = Math.max(0, latestFrom - (shown.length - SHOWN_KEPT));
      shown = shown.slice(-SHOWN_KEPT);
    }
    hold = Math.max(hold, ms);
  }
  const beat = effects.length > 0 || hold > 0 ? { key: (p.beat?.key ?? 0) + 1, effects, ms: hold > 0 ? hold : FLASH_MS, paced: hold > 0 } : p.beat;
  return { ...p, board, shown, latestFrom, pending, beat, holding: hold > 0 };
}

/** The feed changed: the events after the cursor join the queue, followed by the view they lead
 *  to, and play at once unless a beat holds the screen. */
export function receive(p: Playback, view: GameView, events: readonly LoggedEvent[], pace: Pace): Playback {
  const at = p.cursor === null ? -1 : events.findLastIndex((logged) => logged.id === p.cursor);
  // A cursor no longer in the feed fell off its front: everything in it is new.
  const fresh = events.slice(at + 1);
  const items: Item[] = [...fresh.map((logged, i): Item => ({ kind: "event", logged, first: i === 0 })), { kind: "view", view }];
  const next = { ...p, pending: [...p.pending, ...items], cursor: fresh.at(-1)?.id ?? p.cursor };
  return p.holding ? next : advance(next, pace);
}

/** The beat holding the screen is over: on to the next. */
export const tick = (p: Playback, pace: Pace): Playback => advance({ ...p, holding: false }, pace);
