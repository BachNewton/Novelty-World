import type { CardType, Json, Step, Trait } from "../types";
import type { RollSpec } from "./sources";

// What a row of a roll table does, in a few typed words the screen can draw
// as icons: read off the row's own steps, so the table a player sees before
// a roll is the table the engine applies after it. A source's own step
// (`ownSteps`) is opaque, so a row holding one names what it does with a note.

/** What a source's own step in a table row does, where its typed steps can't say it. */
export type OutcomeNote =
  /** Attack someone (Bloody Vision's lowest row). */
  | "attack"
  /** Free yourself, or be freed (the Debris, the Webs). */
  | "freed"
  /** Stay stuck (the Debris, the Webs). */
  | "stuck"
  /** Fall to a room below. */
  | "fall"
  /** Go to a room of your choice. */
  | "choose-room"
  /** Land in a room below of your choice (the Mystic Slide's control). */
  | "choose-landing"
  /** Go to the Entrance Hall's floor or out of the house (The Beckoning's jump). */
  | "jump"
  /** To a room on this floor (the Mystic Elevator, the Secret Passage), or any floor. */
  | "floor-basement"
  | "floor-ground"
  | "floor-upper"
  | "floor-any"
  /** The room shakes: physical damage to everyone in it (the Mystic Elevator). */
  | "shake"
  /** Search a deck for a card (the Crystal Ball). */
  | "search"
  /** Someone nearby is affected too (Footsteps' nearest explorer). */
  | "nearest"
  /** Lose your lowest trait's value down to its lowest (Possession). */
  | "drop-to-lowest"
  /** An item blows away (Shrieking Wind). */
  | "item-blown"
  /** The Dark Dice's rows. */
  | "join-others"
  | "push"
  | "step"
  | "bottom-out"
  /** Others are called (the Bell). */
  | "call-heroes"
  | "call-monsters"
  /** You are mesmerized (the Music Box). */
  | "mesmerized"
  /** Put the Mask on or take it off. */
  | "mask"
  /** The haunt roll's two rows: the haunt held off, or begun. */
  | "haunt-held-off"
  | "haunt-begins";

/** Who gains: one trait, any trait of the gainer's choice, or a physical or mental trait of their choice. */
export type GainTrait = Trait | "choice" | "physical" | "mental";

/** One thing a table row does. */
export type RowOutcome =
  | { kind: "gain"; trait: GainTrait; amount: number }
  | { kind: "damage"; damage: "physical" | "mental"; dice: number | null; points: number | null }
  | { kind: "draw"; type: CardType }
  /** Keep this card (an event kept in front of you). */
  | { kind: "keep"; card: string }
  | { kind: "lose"; card: string }
  /** Go to a room, or (null) go on: out of the room, across it, or to a room the rules find. */
  | { kind: "move"; room: string | null }
  /** Stop: movement ends, or you stay. */
  | { kind: "stop" }
  /** A further roll. */
  | { kind: "roll"; spec: RollSpec }
  | { kind: "attack" }
  /** The task the roll was for is done, or not. */
  | { kind: "pass" }
  | { kind: "fail" }
  /** A choice between ways, each with what it does. */
  | { kind: "choice"; options: RowOutcome[][] }
  | { kind: "note"; note: OutcomeNote };

/** A table row as the screen reads it: its results, and what it does. */
export type RowSummary = {
  min: number;
  max: number | null;
  outcome: RowOutcome[];
};

/** Steps that do bookkeeping behind another of the row's steps, with nothing of their own to show. */
const SILENT = new Set(["remove-token", "place-token", "mark-card", "add-to-counter", "attack-spent"]);

const TRAIT_GROUPS: { group: GainTrait; traits: readonly Trait[] }[] = [
  { group: "physical", traits: ["might", "speed"] },
  { group: "mental", traits: ["knowledge", "sanity"] },
  { group: "choice", traits: ["might", "speed", "knowledge", "sanity"] },
];

const isLocal = (step: Step) => step.kind.includes(":");

type Params = { [key: string]: Json };
const paramsOf = (step: Step) => step.params as Params;

const same = (a: Json, b: Json) => JSON.stringify(a) === JSON.stringify(b);

/** Several options, each a single gain of the same amount, read as one gain of a trait of your choice. */
function gainChoice(options: RowOutcome[][]): RowOutcome | null {
  const gains = options.map((option) => (option.length === 1 && option[0].kind === "gain" ? option[0] : null));
  if (gains.some((gain) => gain === null || gain.amount !== gains[0]?.amount)) return null;
  const traits = new Set(gains.map((gain) => gain?.trait));
  const group = TRAIT_GROUPS.find((candidate) => candidate.traits.length === traits.size && candidate.traits.every((trait) => traits.has(trait)));
  return group && gains[0] ? { kind: "gain", trait: group.group, amount: gains[0].amount } : null;
}

/** The room a move puts a figure in, when its steps name one. */
function movedTo(step: Step): string | null {
  const params = paramsOf(step);
  if (step.kind === "relocate") return params.room as string;
  const then = params.then as Step | undefined;
  return then && typeof then === "object" ? movedTo(then) : null;
}

/** What one step does, with `note` standing for any source's own step. */
function stepOutcomes(step: Step, note: LocalOutcome | null): RowOutcome[] {
  if (isLocal(step)) {
    if (note === null) throw new Error(`A table row runs ${step.kind}, a source's own step, with no note to say what it does`);
    return typeof note === "string" ? [{ kind: "note", note }] : note;
  }
  if (SILENT.has(step.kind)) return [];
  const p = paramsOf(step);
  switch (step.kind) {
    case "gain":
      return [{ kind: "gain", trait: p.trait as Trait, amount: p.amount as number }];
    case "damage":
      return [{ kind: "damage", damage: p.damage as "physical" | "mental", dice: p.dice as number | null, points: p.amount as number | null }];
    case "draw-card":
      return [{ kind: "draw", type: p.type as CardType }];
    case "gain-card":
      return [{ kind: "keep", card: p.card as string }];
    case "lose-card":
      return [{ kind: "lose", card: p.card as string }];
    case "displace":
    case "relocate":
    case "draw-room-tile":
      return [{ kind: "move", room: movedTo(step) }];
    // Leaving the room, or crossing it, goes on.
    case "cross-barrier":
    case "leave-heard":
      return [{ kind: "move", room: null }];
    case "end-movement":
    case "stay":
      return [{ kind: "stop" }];
    case "roll":
      return [{ kind: "roll", spec: p.spec as RollSpec }];
    case "beaten":
      return [{ kind: "damage", damage: "physical", dice: null, points: p.points as number }];
    case "attack":
    case "attack-roll":
      return [{ kind: "attack" }];
    case "task-result":
      return [{ kind: p.success === true ? "pass" : "fail" }];
    case "choose-one": {
      const options = (p.options as { steps: Step[] }[]).map((option) => stepsOutcomes(option.steps, note));
      const gain = gainChoice(options);
      if (gain) return [gain];
      if (options.every((option) => same(option as Json, options[0] as Json))) return options[0] ?? [];
      return [{ kind: "choice", options }];
    }
    default:
      throw new Error(`A table row runs ${step.kind}, which has no outcome to show`);
  }
}

/** Whose a step is: the figure it acts on, or the one choosing. */
function whose(step: Step): Json {
  const params = step.params;
  if (params === null || typeof params !== "object" || Array.isArray(params)) return null;
  return params.figure ?? params.seat ?? null;
}

/** What steps do. The same outcome for several figures is said once (each
 *  explorer rolls, each loses a trait), and a row's note once; twice for one
 *  figure, it is said twice (two items drawn). */
function stepsOutcomes(steps: readonly Step[], note: LocalOutcome | null): RowOutcome[] {
  const said: { outcome: RowOutcome; figure: Json }[] = [];
  for (const step of steps)
    for (const outcome of stepOutcomes(step, note)) {
      const figure = whose(step);
      const known = said.some((each) => same(each.outcome as Json, outcome as Json) && (outcome.kind === "note" || each.figure !== figure));
      if (!known) said.push({ outcome, figure });
    }
  return said.map((each) => each.outcome);
}

/** What a row's own steps (`ownSteps`) do, said by hand: a note, or typed outcomes where they say it (the Medical Kit's heal is a physical gain). */
export type LocalOutcome = OutcomeNote | RowOutcome[];

/** What a table row does, read off its steps. Throws when a step can't be
 *  read: a source's own step in a row with no note, or a step kind with no
 *  outcome to show. */
export function rowOutcome(steps: readonly Step[], note: LocalOutcome | null): RowOutcome[] {
  return stepsOutcomes(steps, note);
}

/** The haunt roll as a table: at least the omens drawn holds the haunt off, under them it begins (p. 15). */
export function hauntRows(omens: number): RowSummary[] {
  const held: RowSummary = { min: omens, max: null, outcome: [{ kind: "note", note: "haunt-held-off" }] };
  return omens === 0 ? [held] : [held, { min: 0, max: omens - 1, outcome: [{ kind: "note", note: "haunt-begins" }] }];
}
