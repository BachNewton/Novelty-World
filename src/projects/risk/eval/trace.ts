import type { GameEvent, GameView, Move, Seat } from "../contract";
import { ADJACENCY, CONTINENTS, TERRITORIES } from "../map";
import { riskBot } from "../bots";
import { playGame, type Observer, type RiskGameResult, type RiskGameSpec } from "./runner";

// A game's trajectory, turn by turn, for asking why a game runs long (`risk:trace`): every seat's
// standing as each player-turn begins, and what the turn did (its income, trades, attacks,
// captures, losses on both sides, eliminations and fortify). Summed over windows of turns it shows
// whether a table is fighting, piling armies up, or stuck. Nothing here plays a move: it watches.

export interface SeatStanding {
  alive: boolean;
  territories: number;
  armies: number;
  biggest: number;
  /** Armies on territories that border another seat's. */
  front: number;
  continents: number;
  hand: number;
}

export interface TurnTrace {
  turn: number;
  seat: Seat;
  /** Every seat as this turn began. */
  start: SeatStanding[];
  income: number;
  trades: number;
  tradeArmies: number;
  /** Battles fought: single battles and blitzes alike. */
  attacks: number;
  captures: number;
  attackerLosses: number;
  defenderLosses: number;
  eliminated: Seat[];
  fortified: number;
}

function standings(board: GameView): SeatStanding[] {
  const out = board.seats.map((s) => ({
    alive: !s.eliminated,
    territories: s.territories,
    armies: s.armies,
    biggest: 0,
    front: 0,
    continents: 0,
    hand: s.handSize,
  }));
  for (const t of TERRITORIES) {
    const { owner, armies } = board.territories[t.id];
    const s = out[owner];
    s.biggest = Math.max(s.biggest, armies);
    if (ADJACENCY[t.id].some((n) => board.territories[n].owner !== owner)) s.front += armies;
  }
  for (const c of CONTINENTS) {
    const owners = new Set(TERRITORIES.filter((t) => t.continent === c.id).map((t) => board.territories[t.id].owner));
    if (owners.size === 1) out[[...owners][0]].continents++;
  }
  return out;
}

export class Trace implements Observer {
  readonly turns: TurnTrace[] = [];
  final: SeatStanding[] = [];
  winner: Seat | null = null;

  started(_events: readonly GameEvent[], board: GameView): void {
    this.open(board.turn, board.active, board);
  }

  applied(_seat: Seat, _move: Move, events: readonly GameEvent[], board: GameView): void {
    for (const e of events) {
      const t = this.turns.at(-1);
      if (e.kind === "turn-started") {
        this.open(e.turn, e.seat, board);
        continue;
      }
      if (!t) continue;
      if (e.kind === "reinforcements") t.income += e.fromTerritories + e.firstTurnBonus + e.fromContinents.reduce((a, c) => a + c.bonus, 0);
      else if (e.kind === "traded") {
        t.trades++;
        t.tradeArmies += e.armies + (e.bonus?.armies ?? 0);
      } else if (e.kind === "battle" || e.kind === "blitzed") {
        t.attacks++;
        t.attackerLosses += e.attackerLosses;
        t.defenderLosses += e.defenderLosses;
      } else if (e.kind === "captured") t.captures++;
      else if (e.kind === "eliminated") t.eliminated.push(e.seat);
      else if (e.kind === "fortified") t.fortified += e.armies;
      else if (e.kind === "game-over") this.winner = e.winner;
    }
    this.final = standings(board);
  }

  private open(turn: number, seat: Seat, board: GameView): void {
    this.turns.push({
      turn,
      seat,
      start: standings(board),
      income: 0,
      trades: 0,
      tradeArmies: 0,
      attacks: 0,
      captures: 0,
      attackerLosses: 0,
      defenderLosses: 0,
      eliminated: [],
      fortified: 0,
    });
  }
}

/** What a window of player-turns did, summed over every seat's turns in it. */
export interface WindowSummary {
  from: number;
  to: number;
  turns: number;
  attacksPerTurn: number;
  capturesPerTurn: number;
  /** Share of turns that captured anything, so earned a card. */
  capturingTurns: number;
  /** Share of turns that fought no battle at all. */
  idleTurns: number;
  trades: number;
  tradeArmies: number;
  incomePerTurn: number;
  lossesPerTurn: number;
  eliminations: number;
  /** As the window's last turn began. */
  alive: number;
  boardArmies: number;
  biggest: number;
  frontShare: number;
}

export function windows(trace: Trace, size: number): WindowSummary[] {
  const out: WindowSummary[] = [];
  for (let i = 0; i < trace.turns.length; i += size) {
    const slice = trace.turns.slice(i, i + size);
    const n = slice.length;
    const last = slice[n - 1].start.filter((s) => s.alive);
    const sum = (f: (t: TurnTrace) => number) => slice.reduce((a, t) => a + f(t), 0);
    const armies = last.reduce((a, s) => a + s.armies, 0);
    out.push({
      from: slice[0].turn,
      to: slice[n - 1].turn,
      turns: n,
      attacksPerTurn: sum((t) => t.attacks) / n,
      capturesPerTurn: sum((t) => t.captures) / n,
      capturingTurns: sum((t) => (t.captures > 0 ? 1 : 0)) / n,
      idleTurns: sum((t) => (t.attacks === 0 ? 1 : 0)) / n,
      trades: sum((t) => t.trades),
      tradeArmies: sum((t) => t.tradeArmies),
      incomePerTurn: sum((t) => t.income + t.tradeArmies) / n,
      lossesPerTurn: sum((t) => t.attackerLosses + t.defenderLosses) / n,
      eliminations: sum((t) => t.eliminated.length),
      alive: last.length,
      boardArmies: armies,
      biggest: Math.max(...last.map((s) => s.biggest)),
      frontShare: last.reduce((a, s) => a + s.front, 0) / armies,
    });
  }
  return out;
}

/** The turn a survey reads a table's armies at: past the opening, where human games carry 100 to
 *  250 armies at 6 players and a frozen bot table already twice that (`ideas/rule-bot-v6.1.md`). */
export const SHAPE_TURN = 100;

/** A game's shape, the two numbers that tell a stalling table from a reckless one and a
 *  human-like one. */
export interface GameShape {
  /** Armies on the board as player-turn `SHAPE_TURN` began; null for a game over before it. */
  armiesAtTurn: number | null;
  /** The armies lost in battle, both sides', over the armies earned, trades included: about 1 in
   *  people's games, well under in a table piling armies up. */
  lossesPerIncome: number;
}

export function shapeOf(trace: Trace, at = SHAPE_TURN): GameShape {
  const turn = trace.turns.at(at - 1);
  let losses = 0;
  let income = 0;
  for (const t of trace.turns) {
    losses += t.attackerLosses + t.defenderLosses;
    income += t.income + t.tradeArmies;
  }
  return {
    armiesAtTurn: turn === undefined ? null : turn.start.reduce((a, s) => a + (s.alive ? s.armies : 0), 0),
    lossesPerIncome: income === 0 ? 0 : losses / income,
  };
}

export interface SurveyResult extends RiskGameResult {
  /** Null for a game that errored. */
  shape: GameShape | null;
}

/** A survey's game: the runner's result, with the game's shape read off its trace. */
export function surveyGame(spec: RiskGameSpec): SurveyResult {
  const base = { index: spec.index, seed: spec.seed, labels: spec.labels };
  const trace = new Trace();
  try {
    const record = playGame({ seed: spec.seed, bots: spec.labels.map((l) => riskBot(l)), maxTurns: spec.maxTurns, observe: trace });
    return { ...base, ...record, shape: shapeOf(trace) };
  } catch (e) {
    // As the runner's own `runSpec`: one broken game comes back as an error the survey prints.
    return { ...base, winner: null, places: [], turns: 0, decisions: 0, error: (e as Error).message, shape: null };
  }
}

/** The survey's shape line: the mean board armies at `SHAPE_TURN` over the games that reached it,
 *  and the mean over every game of its losses over its income. */
export function shapeLine(results: readonly SurveyResult[]): string {
  const shapes = results.flatMap((r) => (r.shape === null ? [] : [r.shape]));
  const reached = shapes.flatMap((s) => (s.armiesAtTurn === null ? [] : [s.armiesAtTurn]));
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  return (
    `  shape: board armies at turn ${SHAPE_TURN.toString()} mean ${reached.length > 0 ? mean(reached).toFixed(0) : "-"} (${reached.length.toString()} of ${shapes.length.toString()} games reached it),` +
    ` losses ÷ income ${mean(shapes.map((s) => s.lossesPerIncome)).toFixed(2)}`
  );
}

const pad = (v: string | number, w: number) => String(v).padStart(w);

/** The trace as readable lines: windows of `size` player-turns, then every seat's standing at
 *  each window's end, and with `detail` every player-turn. */
export function traceLines(trace: Trace, labels: readonly string[], size: number, detail: boolean): string[] {
  const lines: string[] = [];
  lines.push(`Seats: ${labels.map((l, s) => `S${s.toString()} ${l}`).join(", ")}`);
  lines.push(`Ended: ${trace.winner === null ? "no winner (capped or cut short)" : `S${trace.winner.toString()} won`} after ${trace.turns.length.toString()} player-turns`);
  lines.push("");
  lines.push("  turns    alive  att/t  cap/t  capT%  idle%  inc/t  loss/t  trades(armies)  elim  board  biggest  front%");
  for (const w of windows(trace, size)) {
    lines.push(
      `  ${pad(w.from, 3)}-${pad(w.to, 3)}  ${pad(w.alive, 5)}  ${pad(w.attacksPerTurn.toFixed(1), 5)}  ${pad(w.capturesPerTurn.toFixed(1), 5)}  ${pad((100 * w.capturingTurns).toFixed(0), 5)}` +
        `  ${pad((100 * w.idleTurns).toFixed(0), 5)}  ${pad(w.incomePerTurn.toFixed(1), 5)}  ${pad(w.lossesPerTurn.toFixed(1), 6)}  ${pad(`${w.trades.toString()}(${w.tradeArmies.toString()})`, 14)}` +
        `  ${pad(w.eliminations, 4)}  ${pad(w.boardArmies, 5)}  ${pad(w.biggest, 7)}  ${pad((100 * w.frontShare).toFixed(0), 6)}`,
    );
  }
  lines.push("");
  lines.push("Standings as each window's last turn began (terr/armies/biggest stack/continents/cards):");
  for (let i = 0; i < trace.turns.length; i += size) {
    const t = trace.turns[Math.min(i + size, trace.turns.length) - 1];
    const cells = t.start.map((s, seat) => (s.alive ? `S${seat.toString()} ${s.territories.toString()}/${s.armies.toString()}/${s.biggest.toString()}/${s.continents.toString()}/${s.hand.toString()}` : `S${seat.toString()} out`));
    lines.push(`  turn ${pad(t.turn, 3)}: ${cells.join("  ")}`);
  }
  if (detail) {
    lines.push("");
    lines.push("Every player-turn: seat, its terr/armies/biggest as it began, income+trades, attacks, captures, losses att/def, fortify:");
    for (const t of trace.turns) {
      const s = t.start[t.seat];
      lines.push(
        `  ${pad(t.turn, 3)} S${t.seat.toString()} ${pad(s.territories, 2)}/${pad(s.armies, 3)}/${pad(s.biggest, 3)}  +${t.income.toString()}${t.trades > 0 ? `+${t.tradeArmies.toString()}c` : ""}` +
          `  att ${t.attacks.toString()} cap ${t.captures.toString()} loss ${t.attackerLosses.toString()}/${t.defenderLosses.toString()}${t.fortified > 0 ? ` fort ${t.fortified.toString()}` : ""}` +
          `${t.eliminated.length > 0 ? ` ELIMINATES ${t.eliminated.map((e) => `S${e.toString()}`).join(",")}` : ""}`,
      );
    }
  }
  return lines;
}
