import type { CardId, CardSymbol, GameEvent, Phase, Seat } from "../contract";
import { CONTINENTS, TERRITORIES, type TerritoryId } from "../map";
import { seatName } from "./seats";

/*
 * What happened, in words: each engine event as a line for the log and the status box, with the
 * seat it is about. A run of battles between the same two territories reads as one line.
 */

export interface Line {
  text: string;
  seat: Seat | null;
  /** The dice of the battle the line tells, the last one of a run. */
  dice?: { attacker: readonly number[]; defender: readonly number[]; attackerLosses: number; defenderLosses: number };
  /** The battle or run of battles the line tells, with the armies each side lost in all of it. */
  battle?: { from: TerritoryId; to: TerritoryId; battles: number; attackerLost: number; defenderLost: number };
  /** Whether it is news worth the status box: captures, eliminations, cards, a battle. */
  headline: boolean;
}

const TERRITORY_NAME = new Map<string, string>(TERRITORIES.map((t) => [t.id, t.name]));
const SYMBOL = new Map<string, CardSymbol>(TERRITORIES.map((t) => [t.id, t.symbol]));
const CONTINENT_NAME = new Map<string, string>(CONTINENTS.map((c) => [c.id, c.name]));

export function territoryName(id: TerritoryId): string {
  return TERRITORY_NAME.get(id) ?? id;
}

export function isWild(card: CardId): boolean {
  return card === "wild-1" || card === "wild-2";
}

export function cardSymbol(card: CardId): CardSymbol | "wild" {
  return isWild(card) ? "wild" : (SYMBOL.get(card) ?? "wild");
}

export function cardName(card: CardId): string {
  return isWild(card) ? "Wild" : territoryName(card as TerritoryId);
}

const PHASE_NAME: Record<Phase, string> = {
  reinforce: "Reinforce",
  attack: "Attack",
  fortify: "Fortify",
  "game-over": "Game over",
};

export function phaseName(phase: Phase): string {
  return PHASE_NAME[phase];
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const armies = (n: number) => `${n} ${n === 1 ? "army" : "armies"}`;

function describe(event: GameEvent): Line | null {
  const line = (text: string, seat: Seat | null, headline = false): Line => ({ text, seat, headline });
  switch (event.kind) {
    case "turn-order":
      return line(`Turn order: ${event.order.map(seatName).join(", ")}.`, null, true);
    case "dealt": {
      const counts = new Map<Seat, number>();
      for (const owner of Object.values(event.owners)) counts.set(owner, (counts.get(owner) ?? 0) + 1);
      return line(`Territories dealt: ${[...counts].sort(([a], [b]) => a - b).map(([seat, n]) => `${seatName(seat)} ${n}`).join(", ")}.`, null, true);
    }
    case "starting-armies":
      return line("Starting armies placed at random.", null, true);
    case "placed":
      return line(`${seatName(event.owner)} placed ${armies(event.armies)} on ${territoryName(event.territory)}.`, event.owner);
    case "reinforcements": {
      const continents = event.fromContinents.map((c) => ` + ${c.bonus} for ${CONTINENT_NAME.get(c.continent) ?? c.continent}`).join("");
      const firstTurn = event.firstTurnBonus > 0 ? ` + ${event.firstTurnBonus} for moving later` : "";
      const total = event.fromTerritories + event.fromContinents.reduce((sum, c) => sum + c.bonus, 0) + event.firstTurnBonus;
      return line(`${seatName(event.seat)} gets ${total}: ${event.fromTerritories} for territories${continents}${firstTurn}.`, event.seat, true);
    }
    case "traded": {
      const bonus = event.bonus ? `, and 2 more on ${territoryName(event.bonus.territory)}` : "";
      return line(`${seatName(event.seat)} traded ${event.cards.map(cardName).join(", ")} for ${event.armies} armies${bonus}.`, event.seat, true);
    }
    case "battle":
      return {
        ...line(`${territoryName(event.from)} attacked ${territoryName(event.to)}: attacker lost ${event.attackerLosses}, defender lost ${event.defenderLosses}.`, null, true),
        dice: { attacker: event.attackerDice, defender: event.defenderDice, attackerLosses: event.attackerLosses, defenderLosses: event.defenderLosses },
        battle: { from: event.from, to: event.to, battles: 1, attackerLost: event.attackerLosses, defenderLost: event.defenderLosses },
      };
    case "blitzed":
      return {
        ...line(`${territoryName(event.from)} blitzed ${territoryName(event.to)}: attacker lost ${event.attackerLosses}, defender lost ${event.defenderLosses}.`, null, true),
        battle: { from: event.from, to: event.to, battles: 1, attackerLost: event.attackerLosses, defenderLost: event.defenderLosses },
      };
    case "captured":
      return line(`${seatName(event.seat)} captured ${territoryName(event.territory)} from ${seatName(event.from)}.`, event.seat, true);
    case "occupied":
      return line(`${armies(event.armies)} moved into ${territoryName(event.to)}.`, null);
    case "eliminated":
      return line(`${seatName(event.seat)} is out! ${seatName(event.by)} takes ${plural(event.cardsTaken, "card")}.`, event.by, true);
    case "card-drawn":
      return line(event.card ? `${seatName(event.seat)} drew ${cardName(event.card)} (${cardSymbol(event.card)}).` : `${seatName(event.seat)} drew a card.`, event.seat, true);
    case "deck-reshuffled":
      return line("The deck was shuffled.", null);
    case "fortified":
      return line(`${armies(event.armies)} moved from ${territoryName(event.from)} to ${territoryName(event.to)}.`, null, true);
    case "turn-started":
      return line(`Turn ${event.turn}: ${seatName(event.seat)}.`, event.seat);
    case "phase":
      return null;
    case "game-over":
      return line(`${seatName(event.winner)} rules the world!`, event.winner, true);
  }
}

/** The lines a batch of events reads as, oldest first. */
export function describeEvents(events: readonly GameEvent[]): Line[] {
  const lines: Line[] = [];
  let run: { from: TerritoryId; to: TerritoryId; battles: number; attackerLost: number; defenderLost: number } | null = null;
  for (const event of events) {
    const line = describe(event);
    if (line === null) continue;
    if (event.kind === "battle" && run && run.from === event.from && run.to === event.to) {
      run.battles += 1;
      run.attackerLost += event.attackerLosses;
      run.defenderLost += event.defenderLosses;
      lines[lines.length - 1] = {
        ...line,
        text: `${territoryName(event.from)} attacked ${territoryName(event.to)} ${run.battles} times: attacker lost ${run.attackerLost}, defender lost ${run.defenderLost}.`,
        battle: { ...run },
      };
      continue;
    }
    run = event.kind === "battle" ? { from: event.from, to: event.to, battles: 1, attackerLost: event.attackerLosses, defenderLost: event.defenderLosses } : null;
    lines.push(line);
  }
  return lines;
}
