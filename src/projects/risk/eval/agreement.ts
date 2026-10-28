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

type Tallies = Record<DecisionKind | "all", Tally> & { offPath: number };

function emptyTallies(): Tallies {
  const out = { all: { asked: 0, same: 0 }, offPath: 0 } as Partial<Tallies>;
  for (const k of DECISION_KINDS) out[k] = { asked: 0, same: 0 };
  return out as Tallies;
}

/** The reinforce phase a decision is in, as the deciding seat's history marks its start, or null
 *  outside one. */
function reinforcePhase(input: BotInput): string | null {
  if (input.options.kind !== "reinforce") return null;
  let at = input.history.length - 1;
  while (at >= 0 && input.history[at].kind !== "phase") at--;
  return `${input.seat.toString()}|${at.toString()}`;
}

/** Asks the base and every candidate each decision it watches. With `basePlays`, the move made
 *  is the base's own (a game the base plays in every seat), so the base isn't asked again.
 *
 *  A reinforce phase's placements are one plan placed a decision at a time, and a bot that plans
 *  the phase whole (rule-v7's search) can only place the rest of its own plan. So once a bot has
 *  answered one of the phase's decisions otherwise than the move played, the phase's later
 *  decisions are off its path: positions its own play wouldn't reach, which it isn't asked. They
 *  are counted apart as off its path, for the base too, since a candidate can't agree with an
 *  answer the base doesn't have. */
export class Agreement implements Observer {
  readonly tallies: Map<string, Tallies>;
  /** Decisions the base was asked (none when it plays the moves itself). */
  baseAsked = 0;
  /** The reinforce phase being watched, and the bots (the base as "base") off their path in it. */
  private phase: string | null = null;
  private readonly offPath = new Set<string>();
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
    const phase = reinforcePhase(input);
    if (phase !== this.phase) {
      this.phase = phase;
      this.offPath.clear();
    }
    const baseOff = this.offPath.has("base");
    const asksBase = !this.basePlays && !baseOff;
    if (asksBase) this.baseAsked++;
    const mine = asksBase ? this.timed("base", () => this.base(input)) : move;
    this.leavesPath("base", mine, move);
    for (const [label, bot] of this.candidates) {
      const tallies = this.tallies.get(label) as Tallies;
      if (baseOff || this.offPath.has(label)) {
        tallies.offPath++;
        continue;
      }
      const theirs = this.timed(label, () => bot(input));
      this.leavesPath(label, theirs, move);
      const same = sameMove(mine, theirs) ? 1 : 0;
      for (const t of [tallies[decisionKind(input.options, mine, theirs)], tallies.all]) {
        t.asked++;
        t.same += same;
      }
    }
  }

  /** Marks a bot off its path for the rest of a reinforce phase once its answer isn't the move played. */
  private leavesPath(label: string, answer: Move, played: Move): void {
    if (this.phase !== null && !sameMove(answer, played)) this.offPath.add(label);
  }

  private timed(label: string, decide: () => Move): Move {
    const start = performance.now();
    const move = decide();
    this.spent.set(label, (this.spent.get(label) ?? 0) + performance.now() - start);
    return move;
  }
}

const pct = (t: Tally) => (t.asked === 0 ? "     -" : `${((100 * t.same) / t.asked).toFixed(1).padStart(5)}%`);

/** A row per candidate: its share of decisions the same as the base's, by kind; then the number
 *  of decisions of each kind it was asked, and those off its path, which it wasn't. */
export function agreementLines(base: string, agreement: Agreement): string[] {
  const kinds = [...DECISION_KINDS, "all"] as const;
  const width = Math.max(9, ...[...agreement.tallies.keys()].map((l) => l.length));
  const header = (title: string, last?: string) => `  ${title.padEnd(width)}  ${kinds.map((k) => k.padStart(9)).join("")}${last === undefined ? "" : last.padStart(10)}`;
  const lines = [`Same decision as ${base}:`, header("")];
  for (const [label, tallies] of agreement.tallies) lines.push(`  ${label.padEnd(width)}  ${kinds.map((k) => pct(tallies[k]).padStart(9)).join("")}`);
  lines.push("Decisions asked:", header("", "off path"));
  for (const [label, tallies] of agreement.tallies) {
    lines.push(`  ${label.padEnd(width)}  ${kinds.map((k) => tallies[k].asked.toString().padStart(9)).join("")}${tallies.offPath.toString().padStart(10)}`);
  }
  const askedOf = (label: string) => (label === "base" ? agreement.baseAsked : (agreement.tallies.get(label)?.all.asked ?? 0));
  if ([...agreement.spent.keys()].some((label) => askedOf(label) > 0)) {
    lines.push("Time per decision:");
    for (const [label, ms] of agreement.spent) lines.push(`  ${(label === "base" ? base : label).padEnd(width)}  ${(ms / askedOf(label)).toFixed(2)} ms`);
  }
  return lines;
}
