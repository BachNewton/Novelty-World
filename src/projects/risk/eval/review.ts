import { createRng } from "@/shared/lib/seeded-random";
import type { GameEvent, GameView, Move, Seat } from "../contract";
import { CONTINENTS, TERRITORIES, type TerritoryId } from "../map";
import type { BotInput } from "../bots/bot";
import { fromView, IDS } from "../bots/rule-v1/board";
import { plans as v1Plans, type Plan } from "../bots/rule-v1/planner";
import { V1_PARAMS } from "../bots/rule-v1/params";
import { plans as v2Plans } from "../bots/rule-v2/planner";
import { V2_PARAMS } from "../bots/rule-v2/params";
import type { Observer } from "./runner";

// A played game as a readable record, for reading how bots play (`risk:review`): each
// player-turn opens with every seat's standing, then the seat's moves as they happened, and
// for a rule bot the plans it weighed when its turn began and when its attack began, best
// first, with each plan's chance and score. Nothing here plays a move: it watches.

const NAME = new Map<string, string>(TERRITORIES.map((t) => [t.id, t.name]));
const name = (t: TerritoryId) => NAME.get(t) ?? t;

/** The rule bots whose plans the record can show, by label. */
const PLANNERS: Record<string, (input: BotInput) => Plan[]> = {
  "rule-v1": (input) => v1Plans(fromView(input.view), input.seat, input.view.armiesToPlace, V1_PARAMS, createRng(input.seed)),
  "rule-v2": (input) => v2Plans(fromView(input.view), input.seat, input.view.armiesToPlace, V2_PARAMS, createRng(input.seed)),
};

function continentsHeld(board: GameView, seat: Seat): string[] {
  return CONTINENTS.filter((c) => TERRITORIES.every((t) => t.continent !== c.id || board.territories[t.id].owner === seat)).map((c) => c.name);
}

function standing(board: GameView, seat: Seat, label: string): string {
  const s = board.seats[seat];
  if (s.eliminated) return `  S${seat.toString()} ${label}: out`;
  const held = continentsHeld(board, seat);
  const bonus = held.reduce((sum, c) => sum + (CONTINENTS.find((x) => x.name === c)?.bonus ?? 0), 0);
  const income = Math.max(3, Math.floor(s.territories / 3)) + bonus;
  let biggest = 0;
  for (const t of TERRITORIES) if (board.territories[t.id].owner === seat) biggest = Math.max(biggest, board.territories[t.id].armies);
  return (
    `  S${seat.toString()} ${label}: ${s.territories.toString()} terr, ${s.armies.toString()} armies (biggest ${biggest.toString()}), income ${income.toString()}, ` +
    `${s.handSize.toString()} cards${held.length > 0 ? `, holds ${held.join(" + ")}` : ""}`
  );
}

function planLine(plan: Plan): string {
  const targets = plan.targets.map((t) => name(IDS[t])).join(", ");
  const p = plan.capture ? ` p ${(100 * plan.capture.pSuccess).toFixed(0)}%` : "";
  const place = [...plan.place].map(([t, a]) => `+${a.toString()} ${name(IDS[t])}`).join(", ");
  return `      ${plan.kind}${targets ? ` [${targets}]` : ""}${p}  value ${plan.value.toFixed(4)}${place ? `  place ${place}` : ""}`;
}

/** Records a game for reading, line by line. */
export class Review implements Observer {
  readonly lines: string[] = [];
  private board: GameView | null = null;
  private planned = new Set<string>();

  constructor(private readonly labels: readonly string[]) {}

  private seat(s: Seat): string {
    return `S${s.toString()}(${this.labels[s]})`;
  }

  started(events: readonly GameEvent[], board: GameView): void {
    this.lines.push(`Seats: ${this.labels.map((l, s) => `S${s.toString()} ${l}`).join(", ")}   Turn order: ${board.turnOrder.map((s) => `S${s.toString()}`).join(" ")}`);
    this.render(events, board);
  }

  decided(input: BotInput, _move: Move): void {
    const planner = PLANNERS[this.labels[input.seat]] as ((input: BotInput) => Plan[]) | undefined;
    if (!planner) return;
    const phase = input.options.kind;
    if (phase !== "reinforce" && phase !== "attack") return;
    const key = `${input.view.turn.toString()}/${phase}`;
    if (this.planned.has(key)) return;
    this.planned.add(key);
    const ranked = planner(input).sort((a, b) => b.value - a.value);
    this.lines.push(`    ${this.seat(input.seat)} weighs (${phase === "reinforce" ? `${input.view.armiesToPlace.toString()} to place` : "attack"}), best first:`);
    for (const plan of ranked.slice(0, 5)) this.lines.push(planLine(plan));
  }

  applied(_seat: Seat, _move: Move, events: readonly GameEvent[], board: GameView): void {
    this.render(events, board);
  }

  private render(events: readonly GameEvent[], board: GameView): void {
    const before = this.board ?? board;
    for (const e of events) {
      switch (e.kind) {
        case "turn-started":
          this.lines.push("");
          this.lines.push(`Turn ${e.turn.toString()}: ${this.seat(e.seat)}`);
          for (let s = 0; s < this.labels.length; s++) this.lines.push(standing(board, s, this.labels[s]));
          break;
        case "reinforcements":
          this.lines.push(`    reinforcements ${(e.fromTerritories + e.fromContinents.reduce((x, c) => x + c.bonus, 0) + e.firstTurnBonus).toString()}`);
          break;
        case "traded":
          this.lines.push(`    trades a set for ${e.armies.toString()}${e.bonus ? ` (+${e.bonus.armies.toString()} on ${name(e.bonus.territory)})` : ""}`);
          break;
        case "placed":
          this.lines.push(`    places ${e.armies.toString()} on ${name(e.territory)} (now ${board.territories[e.territory].armies.toString()})`);
          break;
        case "battle":
          this.lines.push(
            `    rolls ${name(e.from)} → ${name(e.to)} [${e.attackerDice.join("")} v ${e.defenderDice.join("")}]: loses ${e.attackerLosses.toString()}, kills ${e.defenderLosses.toString()}`,
          );
          break;
        case "blitzed":
          this.lines.push(
            `    blitzes ${name(e.from)} (${before.territories[e.from].armies.toString()}) → ${name(e.to)} (${before.territories[e.to].armies.toString()}, ${this.seat(before.territories[e.to].owner)}): loses ${e.attackerLosses.toString()}, kills ${e.defenderLosses.toString()}`,
          );
          break;
        case "captured":
          this.lines.push(`      captures ${name(e.territory)}`);
          break;
        case "occupied":
          this.lines.push(`      moves ${e.armies.toString()} in (${name(e.from)} keeps ${board.territories[e.from].armies.toString()})`);
          break;
        case "eliminated":
          this.lines.push(`    ★ ${this.seat(e.by)} eliminates ${this.seat(e.seat)}, taking ${e.cardsTaken.toString()} cards`);
          break;
        case "fortified":
          this.lines.push(`    fortifies ${e.armies.toString()} ${name(e.from)} → ${name(e.to)}`);
          break;
        case "game-over":
          this.lines.push("");
          this.lines.push(`Game over: ${this.seat(e.winner)} wins on turn ${board.turn.toString()}`);
          break;
        default:
          break;
      }
    }
    this.board = board;
  }
}
