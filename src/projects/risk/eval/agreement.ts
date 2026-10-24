import type { Move, Options } from "../contract";
import type { Bot, BotInput } from "../bots/bot";
import type { Observer } from "./runner";

// How often candidate bots make the same decision as a base bot over the same positions
// (`risk:agreement`): a bot meant to play as another does except where it was changed
// (`ideas/rule-bot-v6.1.md`) shows how far its play moved, decision kind by decision kind.

export const DECISION_KINDS = ["placement", "trade", "attack", "move-in", "fortify"] as const;
export type DecisionKind = (typeof DECISION_KINDS)[number];

/** A reinforce decision with a trade in either answer is a trade decision; otherwise a
 *  placement. The rest follow the phase. */
export function decisionKind(options: Options, a: Move, b: Move): DecisionKind {
  switch (options.kind) {
    case "reinforce":
      return a.kind === "trade" || b.kind === "trade" ? "trade" : "placement";
    case "attack":
      return "attack";
    case "occupy":
      return "move-in";
    case "fortify":
      return "fortify";
  }
}

/** The move as text with its fields in a fixed order, so two equal moves read the same. */
function canonical(move: Move): string {
  return JSON.stringify(move, Object.keys(move).sort());
}

export function sameMove(a: Move, b: Move): boolean {
  return canonical(a) === canonical(b);
}

export interface Tally {
  asked: number;
  same: number;
}

type Tallies = Record<DecisionKind | "all", Tally>;

function emptyTallies(): Tallies {
  const out = { all: { asked: 0, same: 0 } } as Partial<Tallies>;
  for (const k of DECISION_KINDS) out[k] = { asked: 0, same: 0 };
  return out as Tallies;
}

/** Asks the base and every candidate each decision it watches. With `basePlays`, the move made
 *  is the base's own (a game the base plays in every seat), so the base isn't asked again. */
export class Agreement implements Observer {
  readonly tallies: Map<string, Tallies>;
  /** Milliseconds each bot spent deciding, by label, the base's under "base" (not counted when
   *  it plays the moves itself). */
  readonly spent = new Map<string, number>();

  constructor(
    private readonly base: Bot,
    private readonly candidates: ReadonlyMap<string, Bot>,
    private readonly basePlays = false,
  ) {
    this.tallies = new Map([...candidates.keys()].map((label) => [label, emptyTallies()]));
  }

  decided(input: BotInput, move: Move): void {
    const mine = this.basePlays ? move : this.timed("base", () => this.base(input));
    for (const [label, bot] of this.candidates) {
      const theirs = this.timed(label, () => bot(input));
      const tallies = this.tallies.get(label) as Tallies;
      const same = sameMove(mine, theirs) ? 1 : 0;
      for (const t of [tallies[decisionKind(input.options, mine, theirs)], tallies.all]) {
        t.asked++;
        t.same += same;
      }
    }
  }

  private timed(label: string, decide: () => Move): Move {
    const start = performance.now();
    const move = decide();
    this.spent.set(label, (this.spent.get(label) ?? 0) + performance.now() - start);
    return move;
  }
}

const pct = (t: Tally) => (t.asked === 0 ? "     -" : `${((100 * t.same) / t.asked).toFixed(1).padStart(5)}%`);

/** A row per candidate: its share of decisions the same as the base's, by kind, with the
 *  number of decisions of each kind. */
export function agreementLines(base: string, agreement: Agreement): string[] {
  const kinds = [...DECISION_KINDS, "all"] as const;
  const width = Math.max(9, ...[...agreement.tallies.keys()].map((l) => l.length));
  const lines = [`Same decision as ${base}:`, `  ${"".padEnd(width)}  ${kinds.map((k) => k.padStart(9)).join("")}`];
  for (const [label, tallies] of agreement.tallies) lines.push(`  ${label.padEnd(width)}  ${kinds.map((k) => pct(tallies[k]).padStart(9)).join("")}`);
  const first = [...agreement.tallies.values()][0] as Tallies | undefined;
  if (first) lines.push(`  ${"decisions".padEnd(width)}  ${kinds.map((k) => first[k].asked.toString().padStart(9)).join("")}`);
  const asked = first?.all.asked ?? 0;
  if (asked > 0) {
    lines.push("Time per decision:");
    for (const [label, ms] of agreement.spent) lines.push(`  ${(label === "base" ? base : label).padEnd(width)}  ${(ms / asked).toFixed(2)} ms`);
  }
  return lines;
}
