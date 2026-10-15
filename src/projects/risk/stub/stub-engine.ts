import { createRng } from "@/shared/lib/seeded-random";
import { shuffleArray as shuffle } from "@/shared/lib/utils";
import type { ApplyResult, CardId, GameConfig, GameEvent, GameState, GameView, Move, Options, Phase, RiskEngine, Seat } from "../contract";
import { ADJACENCY, CONTINENTS, TERRITORIES, type TerritoryId } from "../map";

/*
 * A stand-in engine for building the UI while the real one is written. It plays a rough game
 * of Risk so every screen can be reached by playing, but it is NOT the rules: it checks little,
 * and its numbers are only plausible. `scenes.ts` builds hand-made positions in its state for
 * the phases that are slow to reach by play. The UI only ever sees it through `RiskEngine`;
 * `local-engine.ts` is the one line that picks it.
 */

export interface StubState {
  players: number;
  turnOrder: Seat[];
  owners: Record<TerritoryId, Seat>;
  armies: Record<TerritoryId, number>;
  active: Seat;
  turn: number;
  phase: Phase;
  /** Starting armies each seat still has to place in setup. */
  setupLeft: number[];
  toPlace: number;
  hands: CardId[][];
  deck: CardId[];
  discard: CardId[];
  setsTraded: number;
  occupying: { from: TerritoryId; to: TerritoryId; min: number; max: number } | null;
  capturedThisTurn: boolean;
  /** Whether an army has been placed this reinforce phase, which closes trading. */
  placed: boolean;
  /** A trade forced mid-attack by taking an eliminated player's cards (`ELIM-3`). */
  forcedTrade: boolean;
  eliminated: boolean[];
  winner: Seat | null;
  rng: number;
}

const IDS = TERRITORIES.map((t) => t.id);
const SYMBOL = new Map<TerritoryId, string>(TERRITORIES.map((t) => [t.id, t.symbol]));
const STARTING_ARMIES: Record<number, number> = { 3: 35, 4: 30, 5: 25, 6: 20 };

export const stubState = (state: GameState): StubState => state.engineState as StubState;
const wrap = (s: StubState): GameState => ({ engineState: s });
const clone = (s: StubState): StubState => structuredClone(s);

export function setValue(setsTraded: number): number {
  const fixed = [4, 6, 8, 10, 12, 15];
  return setsTraded < fixed.length ? fixed[setsTraded] : 15 + 5 * (setsTraded - 5);
}

function symbolOf(card: CardId): string {
  return card === "wild-1" || card === "wild-2" ? "wild" : (SYMBOL.get(card) ?? "wild");
}

export function isSet(cards: readonly CardId[]): boolean {
  const symbols = cards.map(symbolOf);
  const wilds = symbols.filter((s) => s === "wild").length;
  if (wilds > 0) return true;
  const distinct = new Set(symbols).size;
  return distinct === 1 || distinct === 3;
}

function setsIn(hand: readonly CardId[]): [CardId, CardId, CardId][] {
  const sets: [CardId, CardId, CardId][] = [];
  for (let a = 0; a < hand.length; a++)
    for (let b = a + 1; b < hand.length; b++)
      for (let c = b + 1; c < hand.length; c++) if (isSet([hand[a], hand[b], hand[c]])) sets.push([hand[a], hand[b], hand[c]]);
  return sets;
}

function territoriesOf(s: StubState, seat: Seat): TerritoryId[] {
  return IDS.filter((id) => s.owners[id] === seat);
}

function roll(s: StubState, count: number): number[] {
  const rng = createRng(s.rng);
  const dice = Array.from({ length: count }, () => 1 + Math.floor(rng.next() * 6));
  s.rng = rng.getState();
  return dice.sort((a, b) => b - a);
}

function nextSeat(s: StubState, from: Seat, eligible: (seat: Seat) => boolean): Seat | null {
  const at = s.turnOrder.indexOf(from);
  for (let i = 1; i <= s.turnOrder.length; i++) {
    const seat = s.turnOrder[(at + i) % s.turnOrder.length];
    if (eligible(seat)) return seat;
  }
  return null;
}

function startTurn(s: StubState, seat: Seat, events: GameEvent[]): void {
  s.active = seat;
  s.turn += 1;
  s.capturedThisTurn = false;
  s.forcedTrade = false;
  s.placed = false;
  const owned = territoriesOf(s, seat);
  const fromTerritories = Math.max(3, Math.floor(owned.length / 3));
  const fromContinents = CONTINENTS.filter((c) => TERRITORIES.filter((t) => t.continent === c.id).every((t) => s.owners[t.id] === seat)).map((c) => ({ continent: c.id, bonus: c.bonus }));
  s.toPlace = fromTerritories + fromContinents.reduce((sum, c) => sum + c.bonus, 0);
  s.phase = "reinforce";
  events.push({ kind: "turn-started", rule: "TURN-2", seat, turn: s.turn });
  events.push({ kind: "reinforcements", rule: "REINF-2", seat, fromTerritories, fromContinents });
  events.push({ kind: "phase", rule: "TURN-1", phase: "reinforce" });
}

function setPhase(s: StubState, phase: Phase, events: GameEvent[], rule = "TURN-1"): void {
  s.phase = phase;
  events.push({ kind: "phase", rule, phase });
}

function endTurn(s: StubState, events: GameEvent[]): void {
  const next = nextSeat(s, s.active, (seat) => !s.eliminated[seat]);
  if (next !== null) startTurn(s, next, events);
}

function battle(s: StubState, from: TerritoryId, to: TerritoryId, dice: number, events: GameEvent[]): void {
  const attackerDice = roll(s, dice);
  const defenderDice = roll(s, Math.min(2, s.armies[to]));
  let attackerLosses = 0;
  let defenderLosses = 0;
  for (let i = 0; i < Math.min(attackerDice.length, defenderDice.length); i++) {
    if (attackerDice[i] > defenderDice[i]) defenderLosses++;
    else attackerLosses++;
  }
  s.armies[from] -= attackerLosses;
  s.armies[to] -= defenderLosses;
  events.push({ kind: "battle", rule: "COMBAT-4", from, to, attackerDice, defenderDice, attackerLosses, defenderLosses });
  if (s.armies[to] > 0) return;

  const loser = s.owners[to];
  s.owners[to] = s.active;
  s.capturedThisTurn = true;
  events.push({ kind: "captured", rule: "COMBAT-6", seat: s.active, territory: to, from: loser });
  // The dice's worth moves in with the capture; the occupy move names the total.
  s.armies[to] = dice;
  s.armies[from] -= dice;
  s.occupying = { from, to, min: dice, max: dice + s.armies[from] - 1 };
  if (territoriesOf(s, loser).length === 0) {
    s.eliminated[loser] = true;
    const taken = s.hands[loser];
    s.hands[s.active].push(...taken);
    s.hands[loser] = [];
    events.push({ kind: "eliminated", rule: "ELIM-2", seat: loser, by: s.active, cardsTaken: taken.length });
    if (s.eliminated.filter((e) => !e).length === 1) {
      s.winner = s.active;
      s.occupying = null;
      setPhase(s, "game-over", events, "WIN-1");
      events.push({ kind: "game-over", rule: "WIN-1", winner: s.active });
      return;
    }
    if (s.hands[s.active].length >= 6) s.forcedTrade = true;
  }
  if (s.occupying.min >= s.occupying.max) occupy(s, s.occupying.max, events);
}

function occupy(s: StubState, armies: number, events: GameEvent[]): void {
  if (!s.occupying) return;
  const { from, to } = s.occupying;
  s.armies[from] -= armies - s.armies[to];
  s.armies[to] = armies;
  s.occupying = null;
  events.push({ kind: "occupied", rule: "COMBAT-6", from, to, armies });
  if (s.forcedTrade) {
    s.toPlace = 0;
    s.placed = false;
    setPhase(s, "reinforce", events, "ELIM-3");
  }
}

function reachable(s: StubState, from: TerritoryId): TerritoryId[] {
  const seen = new Set<TerritoryId>([from]);
  const queue = [from];
  while (queue.length > 0) {
    const at = queue.shift() as TerritoryId;
    for (const next of ADJACENCY[at])
      if (!seen.has(next) && s.owners[next] === s.active) {
        seen.add(next);
        queue.push(next);
      }
  }
  seen.delete(from);
  return [...seen];
}

function applyMove(s: StubState, seat: Seat, move: Move): GameEvent[] | string {
  if (seat !== s.active || s.phase === "game-over") return "not your turn";
  const events: GameEvent[] = [];
  switch (move.kind) {
    case "place": {
      if (s.owners[move.territory] !== seat) return "not your territory";
      s.armies[move.territory] += move.armies;
      events.push({ kind: "placed", rule: s.phase === "setup-place" ? "SETUP-5" : "REINF-5", owner: seat, territory: move.territory, armies: move.armies });
      if (s.phase === "setup-place") {
        s.setupLeft[seat] -= move.armies;
        const next = nextSeat(s, seat, (other) => s.setupLeft[other] > 0);
        if (next !== null) s.active = next;
        else startTurn(s, s.turnOrder[0], events);
        return events;
      }
      s.toPlace -= move.armies;
      s.placed = true;
      if (s.toPlace <= 0) {
        s.forcedTrade = false;
        setPhase(s, "attack", events);
      }
      return events;
    }
    case "trade": {
      const hand = s.hands[seat];
      if (!isSet(move.cards) || !move.cards.every((card) => hand.includes(card))) return "not a set in hand";
      s.hands[seat] = hand.filter((card) => !move.cards.includes(card));
      s.discard.push(...move.cards);
      const armies = setValue(s.setsTraded);
      s.setsTraded += 1;
      s.toPlace += armies;
      const pictured = move.cards.filter((card): card is TerritoryId => card !== "wild-1" && card !== "wild-2" && s.owners[card as TerritoryId] === seat);
      const bonusAt = move.bonusTerritory ?? pictured.at(0);
      const bonus = bonusAt === undefined ? null : { territory: bonusAt, armies: 2 };
      events.push({ kind: "traded", rule: s.forcedTrade ? "ELIM-3" : "CARDS-6", seat, cards: move.cards, armies, bonus });
      if (bonus) {
        s.armies[bonus.territory] += 2;
        events.push({ kind: "placed", rule: "CARDS-7", owner: seat, territory: bonus.territory, armies: 2 });
      }
      return events;
    }
    case "attack":
      battle(s, move.from, move.to, move.dice, events);
      return events;
    case "blitz":
      while (s.owners[move.to] !== seat && s.armies[move.from] > Math.max(1, move.keepAtLeast)) {
        battle(s, move.from, move.to, Math.min(3, s.armies[move.from] - 1), events);
        if (s.winner !== null) break;
      }
      return events;
    case "occupy":
      occupy(s, move.armies, events);
      return events;
    case "end-attack":
      if (s.capturedThisTurn) {
        if (s.deck.length === 0) {
          const rng = createRng(s.rng);
          s.deck = shuffle(s.discard, rng.next);
          s.rng = rng.getState();
          s.discard = [];
          events.push({ kind: "deck-reshuffled", rule: "CARDS-8" });
        }
        const card = s.deck.shift();
        if (card) {
          s.hands[seat].push(card);
          events.push({ kind: "card-drawn", rule: "CARDS-1", seat, card });
        }
      }
      setPhase(s, "fortify", events);
      return events;
    case "fortify":
      s.armies[move.from] -= move.armies;
      s.armies[move.to] += move.armies;
      events.push({ kind: "fortified", rule: "FORT-1", from: move.from, to: move.to, armies: move.armies });
      endTurn(s, events);
      return events;
    case "end-turn":
      endTurn(s, events);
      return events;
  }
}

export function viewOf(s: StubState, viewer: Seat | null): GameView {
  const seats = Array.from({ length: s.players }, (_, seat) => {
    const owned = territoriesOf(s, seat);
    return { seat, eliminated: s.eliminated[seat], territories: owned.length, armies: owned.reduce((sum, id) => sum + s.armies[id], 0), handSize: s.hands[seat].length };
  });
  const territories = Object.fromEntries(IDS.map((id) => [id, { owner: s.owners[id], armies: s.armies[id] }])) as GameView["territories"];
  return {
    viewer,
    turnOrder: s.turnOrder,
    seats,
    territories,
    turn: s.turn,
    active: s.active,
    phase: s.phase,
    armiesToPlace: s.phase === "setup-place" ? s.setupLeft[s.active] : s.phase === "reinforce" ? s.toPlace : 0,
    cards: { drawPile: s.deck.length, discardPile: s.discard, setsTraded: s.setsTraded, nextSetValue: setValue(s.setsTraded), hand: viewer === null ? null : s.hands[viewer] },
    occupying: s.occupying,
    winner: s.winner,
  };
}

function optionsOf(s: StubState, seat: Seat): Options | null {
  if (seat !== s.active) return null;
  const own = territoriesOf(s, seat);
  if (s.occupying) return { kind: "occupy", ...s.occupying };
  switch (s.phase) {
    case "setup-place":
      return { kind: "setup-place", ownTerritories: own, ownArmiesLeft: s.setupLeft[seat] };
    case "reinforce": {
      const hand = s.hands[seat];
      const mustTrade = hand.length >= 5;
      const tradingOpen = !s.placed && !(s.forcedTrade && !mustTrade);
      return {
        kind: "reinforce",
        armiesToPlace: s.toPlace,
        mayPlace: !mustTrade && s.toPlace > 0,
        ownTerritories: own,
        mustTrade,
        sets: tradingOpen ? setsIn(hand) : [],
        bonusTerritories: hand.filter((card): card is TerritoryId => card !== "wild-1" && card !== "wild-2" && s.owners[card as TerritoryId] === seat),
      };
    }
    case "attack":
      return {
        kind: "attack",
        attacks: own
          .filter((from) => s.armies[from] >= 2)
          .flatMap((from) => ADJACENCY[from].filter((to) => s.owners[to] !== seat).map((to) => ({ from, to, maxDice: Math.min(3, s.armies[from] - 1) as 1 | 2 | 3 }))),
      };
    case "fortify":
      return { kind: "fortify", moves: own.filter((from) => s.armies[from] >= 2).flatMap((from) => reachable(s, from).map((to) => ({ from, to, maxArmies: s.armies[from] - 1 }))) };
    case "game-over":
      return null;
  }
}

export function dealtState(config: GameConfig, seed: string): StubState {
  const rng = createRng(seed);
  const players = config.players;
  const turnOrder = shuffle(
    Array.from({ length: players }, (_, i) => i),
    rng.next,
  );
  const dealt = shuffle([...IDS], rng.next);
  const owners = {} as Record<TerritoryId, Seat>;
  const armies = {} as Record<TerritoryId, number>;
  dealt.forEach((id, i) => {
    owners[id] = turnOrder[i % players];
    armies[id] = 1;
  });
  const start = STARTING_ARMIES[players];
  return {
    players,
    turnOrder,
    owners,
    armies,
    active: turnOrder[0],
    turn: 0,
    phase: "setup-place",
    setupLeft: Array.from({ length: players }, (_, seat) => start - IDS.filter((id) => owners[id] === seat).length),
    toPlace: 0,
    hands: Array.from({ length: players }, () => []),
    deck: shuffle<CardId>([...IDS, "wild-1", "wild-2"], rng.next),
    discard: [],
    setsTraded: 0,
    occupying: null,
    capturedThisTurn: false,
    placed: false,
    forcedTrade: false,
    eliminated: Array.from({ length: players }, () => false),
    winner: null,
    rng: rng.getState(),
  };
}

export const stubEngine: RiskEngine = {
  newGame(config, seed) {
    const s = dealtState(config, seed);
    return {
      state: wrap(s),
      events: [
        { kind: "turn-order", rule: "SETUP-3", order: s.turnOrder },
        { kind: "dealt", rule: "SETUP-4", owners: { ...s.owners } },
        { kind: "phase", rule: "SETUP-5", phase: "setup-place" },
      ],
    };
  },
  apply(state, seat, move): ApplyResult {
    const s = clone(stubState(state));
    const result = applyMove(s, seat, move);
    if (typeof result === "string") return { ok: false, reason: result };
    return { ok: true, state: wrap(s), events: result };
  },
  options: (state, seat) => optionsOf(stubState(state), seat),
  view: (state, viewer) => viewOf(stubState(state), viewer),
  redact: (events, viewer) => events.map((event) => (event.kind === "card-drawn" && event.seat !== viewer ? { kind: "card-drawn", rule: event.rule, seat: event.seat } : event)),
};

export const wrapStub = wrap;
