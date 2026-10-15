import type { GameEvent, GameState, Phase } from "../contract";
import { FULL_DECK, setValue } from "./cards";
import { STARTING_ARMIES } from "./setup";
import { seatsInGame, TERRITORY_IDS, unwrap, type EngineState } from "./state";

// The invariants of `RULES.md` section 11 (INV-1 to INV-9; INV-10 is a replay test), checked
// on every state a game passes through and every step between two states. A checker follows
// one game from `newGame` on and throws, naming the invariant, at the first break.

const PHASE_STEPS: Record<Phase, readonly Phase[]> = {
  "setup-place": ["reinforce"],
  reinforce: ["attack"],
  attack: ["fortify", "reinforce", "game-over"],
  fortify: ["reinforce"],
  "game-over": [],
};

export class InvariantChecker {
  private setsTraded = 0;
  private turn = 0;
  private cardsDrawnThisTurn = 0;
  private fortifiesThisTurn = 0;
  /** Armies earned and placed in the current reinforce phase. */
  private earned = 0;
  private placed = 0;

  start(state: GameState, events: readonly GameEvent[]): void {
    const s = unwrap(state);
    if (s.turn > 1) fail("INV-3", "a new game starts in setup or its first turn");
    this.walk(null, s, events);
    this.checkState(s);
  }

  step(before: GameState, after: GameState, events: readonly GameEvent[]): void {
    const b = unwrap(before);
    const a = unwrap(after);
    if (b.phase === "game-over") fail("INV-9", "a move was accepted after the game ended");
    if (a.turnOrder.join() !== b.turnOrder.join()) fail("SETUP-2", "the seat order changed");
    this.checkArmies(b, a, events);
    this.walk(b, a, events);
    this.checkState(a);
  }

  /** Follows the events in order: phase order (INV-3), card draws (INV-4), trade values (INV-5),
   *  the bonus cap (INV-7), and that a reinforce phase places exactly what it earned. */
  private walk(before: EngineState | null, after: EngineState, events: readonly GameEvent[]): void {
    let phase: Phase | null = before?.phase ?? null;
    for (const e of events) {
      switch (e.kind) {
        case "phase":
          if (phase !== null && !PHASE_STEPS[phase].includes(e.phase)) {
            fail("INV-3", `phase ${phase} -> ${e.phase}`);
          }
          if (phase === "attack" && e.phase === "reinforce" && e.rule !== "ELIM-3") {
            fail("INV-3", "the attack phase returned to reinforce other than after an elimination");
          }
          if (phase === "reinforce" && e.phase === "attack" && this.earned !== this.placed) {
            fail("INV-3", `the attack began with ${this.earned - this.placed} reinforcements unplaced`);
          }
          if (e.phase === "reinforce" && e.rule === "ELIM-3") {
            this.earned = 0;
            this.placed = 0;
          }
          phase = e.phase;
          break;
        case "turn-started":
          if (e.turn !== this.turn + 1) fail("INV-3", `turn ${e.turn} followed turn ${this.turn}`);
          this.turn = e.turn;
          this.cardsDrawnThisTurn = 0;
          this.fortifiesThisTurn = 0;
          this.earned = 0;
          this.placed = 0;
          break;
        case "reinforcements":
          this.earned += e.fromTerritories + e.fromContinents.reduce((sum, c) => sum + c.bonus, 0);
          break;
        case "traded": {
          if (phase !== "reinforce") fail("CARDS-5", `a trade in the ${phase} phase`);
          this.setsTraded++;
          if (e.armies !== setValue(this.setsTraded)) fail("INV-5", `set ${this.setsTraded} was worth ${e.armies}`);
          this.earned += e.armies;
          if (e.bonus && e.bonus.armies !== 2) fail("INV-7", `a set earned ${e.bonus.armies} bonus armies`);
          break;
        }
        case "placed":
          if (phase === "reinforce") this.placed += e.armies;
          break;
        case "battle":
          if (phase !== "attack") fail("INV-3", `a battle in the ${phase} phase`);
          break;
        case "card-drawn":
          if (phase !== "attack") fail("CARDS-1", `a card drawn in the ${phase} phase`);
          if (++this.cardsDrawnThisTurn > 1) fail("INV-4", "two cards drawn in one turn");
          break;
        case "fortified":
          if (phase !== "fortify") fail("INV-3", `a fortify in the ${phase} phase`);
          if (++this.fortifiesThisTurn > 1) fail("INV-3", "two fortifying moves in one turn");
          break;
        case "turn-order":
        case "dealt":
        case "captured":
        case "occupied":
        case "eliminated":
        case "deck-reshuffled":
        case "game-over":
          break;
      }
    }
    if (this.setsTraded !== after.setsTraded) fail("INV-5", `counter ${after.setsTraded}, ${this.setsTraded} traded`);
    if (phase !== after.phase) fail("INV-3", `events end in ${phase}, the state is in ${after.phase}`);
    if (after.turn !== this.turn) fail("INV-3", `the state is on turn ${after.turn}, the events on ${this.turn}`);
  }

  /** INV-2: the board's total moves only by placements and battle losses. */
  private checkArmies(b: EngineState, a: EngineState, events: readonly GameEvent[]): void {
    let change = 0;
    for (const e of events) {
      if (e.kind === "placed") change += e.armies;
      if (e.kind === "traded" && e.bonus) change += e.bonus.armies;
      if (e.kind === "battle") {
        const lost = e.attackerLosses + e.defenderLosses;
        if (lost !== Math.min(e.attackerDice.length, e.defenderDice.length)) {
          fail("INV-2", `a battle of ${e.attackerDice.length} v ${e.defenderDice.length} dice lost ${lost}`);
        }
        change -= lost;
      }
    }
    if (total(a) - total(b) !== change) fail("INV-2", `the board changed by ${total(a) - total(b)}, events say ${change}`);
  }

  private checkState(s: EngineState): void {
    checkBoard(s);
    checkCards(s);
    checkSeats(s);
    if (s.turn === 1 && s.phase === "reinforce" && !s.reinforce?.placedAny && s.setsTraded === 0) checkSetupDone(s);
  }
}

function fail(rule: string, message: string): never {
  throw new Error(`${rule}: ${message}`);
}

function total(s: EngineState, owner?: number): number {
  return TERRITORY_IDS.reduce((sum, t) => {
    const h = s.board[t];
    return owner === undefined || h.owner === owner ? sum + h.armies : sum;
  }, 0);
}

/** INV-1, and the owners are seats in the game. */
function checkBoard(s: EngineState): void {
  for (const t of TERRITORY_IDS) {
    const h = s.board[t];
    if (!Number.isInteger(h.armies) || h.armies < 1) fail("INV-1", `${t} holds ${h.armies}`);
    if (!(h.owner >= 0 && h.owner < s.players) || s.eliminated[h.owner]) {
      fail("INV-8", `${t} is held by seat ${h.owner}`);
    }
  }
}

/** INV-4 and INV-6. */
function checkCards(s: EngineState): void {
  const all = [...s.drawPile, ...s.discardPile, ...s.hands.flat()];
  if (all.length !== 44 || new Set(all).size !== 44 || !FULL_DECK.every((c) => all.includes(c))) {
    fail("INV-4", `${all.length} cards, ${new Set(all).size} distinct`);
  }
  const hand = s.hands[s.active].length;
  for (const [seat, cards] of s.hands.entries()) {
    if (seat !== s.active && cards.length > 6) fail("INV-6", `seat ${seat} holds ${cards.length} off turn`);
  }
  if (s.phase === "reinforce") {
    const r = s.reinforce;
    if (!r) fail("INV-3", "a reinforce phase without its state");
    if (!r.afterElimination && r.handAtStart > 6) fail("INV-6", `a turn began with ${r.handAtStart} cards`);
    // ELIM-3: forced trades stop as soon as the hand is down to 4, 3 or 2.
    if (r.afterElimination && hand < 2) fail("ELIM-3", `traded down to ${hand}`);
  }
  if (s.phase === "attack" && !s.reinforce && hand > 5) fail("INV-6", `${hand} cards in the attack phase`);
  if (s.phase === "fortify" && hand > 6) fail("INV-6", `${hand} cards in the fortify phase`);
}

/** INV-8 and INV-9. */
function checkSeats(s: EngineState): void {
  const pending = s.occupying?.eliminating ?? null;
  for (let seat = 0; seat < s.players; seat++) {
    const owns = TERRITORY_IDS.some((t) => s.board[t].owner === seat);
    // A captured last territory eliminates its owner once the move-in is done (`ELIM-3`).
    if (seat === pending) {
      if (owns || s.eliminated[seat]) fail("INV-8", `seat ${seat} is mid-elimination but owns land or is out`);
      continue;
    }
    if (owns === s.eliminated[seat]) {
      fail("INV-8", `seat ${seat} ${owns ? "owns land but is out" : "owns nothing but is in"}`);
    }
    if (s.eliminated[seat] && s.hands[seat].length > 0) fail("INV-8", `eliminated seat ${seat} holds cards`);
  }
  if (s.eliminated[s.active] && s.phase !== "game-over") fail("INV-8", "an eliminated seat is taking a turn");
  const left = seatsInGame(s);
  if ((s.phase === "game-over") !== (left.length === 1)) fail("INV-9", `${left.length} seats left in ${s.phase}`);
  if (s.phase === "game-over" && s.winner !== left[0]) fail("INV-9", `winner ${s.winner}, last seat ${left[0]}`);
}

/** SETUP-9, checked as the first turn begins. */
function checkSetupDone(s: EngineState): void {
  for (let seat = 0; seat < s.players; seat++) {
    if (total(s, seat) !== STARTING_ARMIES[s.players]) fail("SETUP-9", `seat ${seat} has ${total(s, seat)} armies`);
  }
  if (s.drawPile.length !== 44) fail("SETUP-9", `the draw pile holds ${s.drawPile.length}`);
  if (s.hands.some((hand) => hand.length > 0)) fail("SETUP-9", "a hand is not empty");
}
