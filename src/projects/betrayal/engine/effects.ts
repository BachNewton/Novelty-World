import type {
  Catalog,
  CardMark,
  CardType,
  Edge,
  FigureId,
  GameState,
  Json,
  Place,
  RuleRef,
  Status,
  Step,
  Trait,
} from "../types";
import { sideName } from "./board";
import { rollName, traitName } from "./describe";
import {
  allFigures,
  figureOf,
  MENTAL,
  moveClip,
  PHYSICAL,
  takesDamage,
  trackTraits,
  placeOf,
  putFigure,
} from "./figures";
import {
  askNumber,
  askPermission,
  askStructured,
  barrierSides,
  MAX_DICE,
  moveCost,
  onTurn,
} from "./questions";
import { readyActors } from "./monsters";
import {
  liveSources,
  type RollOption,
  type RollSpec,
  type Source,
} from "./sources";
import type {
  DecisionKind,
  Engine,
  StepContext,
  StepHandler,
} from "./step-loop";

// The primitive effects every rule is built from: trait changes, damage,
// rolls, card draws, tokens. Each is a registered step, so an effect that
// pauses for a decision halfway through is stored as data and resumes later.

/** A step handler with typed parameters. Parameters are stored as JSON, so the type is the step's contract. */
export function defineStep<P extends Json>(
  handler: (state: GameState, params: P, ctx: StepContext) => void,
): StepHandler {
  return (state, params, ctx) => handler(state, params as P, ctx);
}

export function step<P extends Json>(kind: string, params: P): Step {
  return { kind, params };
}

/** A decision kind with typed parameters and choices. `choice` is the answer of a
 *  single-seat decision; a shared decision reads every seat's in `answers`. */
export function defineDecision<P extends Json, C extends Json>(kind: {
  candidates: (
    state: GameState,
    params: P,
    seat: number,
    engine: Engine,
  ) => C[];
  label: (state: GameState, params: P, choice: C, engine: Engine) => string;
  alwaysAsks?: (state: GameState, params: P, engine: Engine) => boolean;
  resolve: (
    state: GameState,
    params: P,
    choice: C,
    ctx: StepContext,
    answers: Record<number, C>,
  ) => string | null;
}): DecisionKind {
  const asks = kind.alwaysAsks;
  return {
    candidates: (state, decision, seat, engine) =>
      kind.candidates(state, decision.params as P, seat, engine),
    label: (state, decision, choice, engine) =>
      kind.label(state, decision.params as P, choice as C, engine),
    alwaysAsks: (state, decision, engine) =>
      asks?.(state, decision.params as P, engine) ?? false,
    resolve: (state, decision, ctx) => {
      const answers = decision.answers as Record<number, C>;
      return kind.resolve(
        state,
        decision.params as P,
        answers[decision.seats[0]],
        ctx,
        answers,
      );
    },
  };
}

/** Continues with a step, adding a value to its parameters (a roll's result, a drawn tile). */
export function continueWith(
  then: Step,
  values: { [key: string]: Json },
): Step {
  if (
    then.params === null ||
    typeof then.params !== "object" ||
    Array.isArray(then.params)
  ) {
    throw new Error(`Continuation ${then.kind} needs object parameters`);
  }
  return { kind: then.kind, params: { ...then.params, ...values } };
}

/** Marks a card as used, traded, dropped or picked up this turn: one such action per card per turn (p. 11). */
export function handle(state: GameState, card: string): void {
  if (state.turn && !state.turn.handled.includes(card))
    state.turn.handled.push(card);
}

export function isHandled(state: GameState, card: string): boolean {
  return state.turn?.handled.includes(card) ?? false;
}

/** Spends a move's spaces as a figure leaves its room under its own
 *  movement: 1, plus whatever leaving costs (opponents in the way, p. 17).
 *  Called while the figure is still in the room it leaves. */
export function spendMove(
  state: GameState,
  ctx: StepContext,
  figure: FigureId,
): void {
  const cost = moveCost(ctx.engine, state, figure);
  if (cost > 1)
    ctx.emit(
      "slowed",
      { source: "rulebook", page: 17 },
      { figure, room: placeOf(state, figure).room, extra: cost - 1 },
    );
  if (state.turn)
    state.turn.moved[figure] = (state.turn.moved[figure] ?? 0) + cost;
}

/** A figure goes out of the room it is in, by whatever way: under its own
 *  movement it spends a move's spaces, and the `left` event says so. Every
 *  departure comes through here, after its rules for leaving have had
 *  their say (`leaveRoom`). Returns the room it left, which it is still in
 *  until the caller puts it somewhere. */
export function goOut(
  state: GameState,
  ctx: StepContext,
  figure: FigureId,
  rule: RuleRef,
  moved: boolean,
): string {
  const room = placeOf(state, figure).room;
  if (moved) spendMove(state, ctx, figure);
  ctx.emit("left", rule, { figure, room, moved });
  return room;
}

/** Ends a figure's movement for the rest of the turn. */
export function endMovementOf(state: GameState, figure: FigureId): void {
  if (state.turn && !state.turn.movementEnded.includes(figure))
    state.turn.movementEnded.push(figure);
}

/** Takes a card out of a room's item pile. */
export function takeFromPile(
  state: GameState,
  room: string,
  card: string,
): void {
  const pile = state.piles[room] ?? [];
  if (!pile.includes(card)) throw new Error(`No ${card} in the ${room} pile`);
  const rest = pile.filter((c) => c !== card);
  if (rest.length > 0) state.piles[room] = rest;
  else delete state.piles[room];
}

// ---------------------------------------------------------------------------
// Traits and damage
// ---------------------------------------------------------------------------

type Gain = {
  figure: FigureId;
  trait: Trait;
  amount: number;
  card: string | null;
  rule: RuleRef;
};

/** Gain (or, negative, lose) spaces on a trait. Name the card when the change comes from holding it (p. 11). */
export function gain(
  figure: FigureId,
  trait: Trait,
  amount: number,
  rule: RuleRef,
  card: string | null = null,
): Step {
  return step<Gain>("gain", { figure, trait, amount, card, rule });
}

type Damage = {
  figure: FigureId;
  damage: "physical" | "mental";
  amount: number | null;
  dice: number | null;
  rule: RuleRef;
  /** The figure dealing it, if one is: the killer, should it kill. */
  by: FigureId | null;
};

/** Damage to a figure, from a rule, and dealt by a figure where one deals
 *  it (an attack's winner). */
export function damage(
  figure: FigureId,
  kind: "physical" | "mental",
  amount: { points: number } | { dice: number },
  rule: RuleRef,
  by: FigureId | null = null,
): Step {
  return step<Damage>("damage", {
    figure,
    damage: kind,
    amount: "points" in amount ? amount.points : null,
    dice: "dice" in amount ? amount.dice : null,
    rule,
    by,
  });
}

type DamageLands = {
  figure: FigureId;
  damage: "physical" | "mental";
  points: number;
  rule: RuleRef;
  by: FigureId | null;
};

/** The cards that let a figure take this damage as the other kind instead. */
function damageKinds(
  engine: Engine,
  state: GameState,
  figure: FigureId,
  damage: "physical" | "mental",
): Source[] {
  return liveSources(engine, state, "damageAs")
    .filter(
      ({ source, behaviour }) =>
        source.holder === figure &&
        behaviour.damageAs !== undefined &&
        behaviour.damageAs !== damage,
    )
    .map(({ source }) => source);
}

type Split = {
  figure: FigureId;
  damage: "physical" | "mental";
  amount: number;
  rule: RuleRef;
  by: FigureId | null;
};

function splitOptions(
  engine: Engine,
  state: GameState,
  split: Split,
): { [trait: string]: number }[] {
  const [first, second] = split.damage === "physical" ? PHYSICAL : MENTAL;
  const clips = trackTraits(engine.catalog, state, split.figure).live.clips;
  const kills = (trait: Trait, spaces: number) =>
    clips[trait] - spaces < 0 &&
    askStructured(engine, state, "lethalOutcome", {
      figure: split.figure,
      trait,
      cause: split.rule,
    }).kind === "death";
  const seen = new Set<string>();
  const options: { [trait: string]: number }[] = [];
  for (let onFirst = split.amount; onFirst >= 0; onFirst--) {
    const option = { [first]: onFirst, [second]: split.amount - onFirst };
    // A trait stops at its lowest value unless the skull kills, so different
    // splits can land the same way, and every split that kills ends alike.
    const outcome =
      kills(first, onFirst) || kills(second, option[second])
        ? "dead"
        : `${Math.max(clips[first] - onFirst, 0)}/${Math.max(clips[second] - option[second], 0)}`;
    if (seen.has(outcome)) continue;
    seen.add(outcome);
    options.push(option);
  }
  return options;
}

// ---------------------------------------------------------------------------
// Rolls
// ---------------------------------------------------------------------------

type Roll = {
  figure: FigureId;
  spec: RollSpec;
  rule: RuleRef;
  then: Step;
  /** Names the roll for "the same roll only once a turn" (p. 12). */
  id: string | null;
  /** Dice the rule adds to or takes from this one roll. */
  extraDice: number;
};

type RollInProgress = Roll & {
  pool: number;
  bonus: number;
  named: number | null;
  dice: number[];
  /** Cards whose roll options were used on this roll. */
  used: string[];
};

/** A roll whose result continues into `then`, added to its parameters as
 *  `result`. `id` names a roll that may be attempted only once a turn;
 *  `extraDice` adds dice to (or, negative, takes them from) this one roll. */
export function roll(
  figure: FigureId,
  spec: RollSpec,
  rule: RuleRef,
  then: Step,
  options: { id?: string; extraDice?: number } = {},
): Step {
  return step<Roll>("roll", {
    figure,
    spec,
    rule,
    then,
    id: options.id ?? null,
    extraDice: options.extraDice ?? 0,
  });
}

/** A roll's outcome table: the first row whose range holds the result. A
 *  result past the table's top (a number named with the Angel Feather, a bonus
 *  on a roll whose top row is closed) takes the top row (cards/items.md). */
export type TableRow = {
  min: number;
  /** Inclusive. Null for "or more". */
  max: number | null;
  steps: Step[];
};

/** Continues a roll into its outcome table. */
export function table(rows: TableRow[]): Step {
  return step<{ rows: TableRow[] }>("table", { rows });
}

type OptionChoice =
  { card: string; option: number; value: number | null } | { card: null };
type RerollChoice =
  { card: string; option: number; faces: number[] } | { card: null };

function rollOptions(
  engine: Engine,
  state: GameState,
  r: RollInProgress,
  timing: "before" | "after",
): { card: string; index: number; option: RollOption }[] {
  const result: { card: string; index: number; option: RollOption }[] = [];
  // A card's attacker's dice are thrown by a player, but the roll is not
  // theirs, so none of their cards act on it.
  if (r.spec.kind === "attack" && r.spec.dice !== null) return result;
  const ownTurn = onTurn(engine, state, r.figure);
  for (const { source, behaviour } of liveSources(
    engine,
    state,
    "rollOptions",
  )) {
    if (
      source.kind !== "card" ||
      source.holder !== r.figure ||
      r.used.includes(source.id) ||
      isHandled(state, source.id)
    )
      continue;
    (behaviour.rollOptions ?? []).forEach((option, index) => {
      if (
        option.timing === timing &&
        (ownTurn || option.offTurn === true) &&
        option.applies(state, r.figure, {
          spec: r.spec,
          rule: r.rule,
          extraDice: r.extraDice,
        })
      ) {
        result.push({ card: source.id, index, option });
      }
    });
  }
  return result;
}

/** Ways to reroll some of the dice: how many of each face to reroll, never more than the option allows. */
function rerollChoices(dice: number[], max: number | null): number[][] {
  const counts = [0, 1, 2].map((face) => dice.filter((d) => d === face).length);
  const result: number[][] = [];
  for (let zeros = 0; zeros <= counts[0]; zeros++)
    for (let ones = 0; ones <= counts[1]; ones++)
      for (let twos = 0; twos <= counts[2]; twos++) {
        const total = zeros + ones + twos;
        if (total === 0 || (max !== null && total > max)) continue;
        result.push([
          ...Array<number>(zeros).fill(0),
          ...Array<number>(ones).fill(1),
          ...Array<number>(twos).fill(2),
        ]);
      }
  return result;
}

function rollTotal(r: RollInProgress): number {
  return (r.named ?? r.dice.reduce((a, b) => a + b, 0)) + r.bonus;
}

/** A die shows 0, 1 or 2. */
const highestResult = (pool: number) => pool * 2;

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

type DrawCard = { figure: FigureId; type: CardType; rule: RuleRef };

export function drawCard(figure: FigureId, type: CardType, rule: RuleRef): Step {
  return step<DrawCard>("draw-card", { figure, type, rule });
}

/** How a card came to its holder. "custody": a dead explorer's companion,
 *  taken by the next explorer to come into the room (p. 19). */
export type GainedBy =
  | "drawn"
  | "kept"
  | "picked-up"
  | "traded"
  | "given"
  | "stolen"
  | "custody";

type GainCard = { figure: FigureId; card: string; by: GainedBy; rule: RuleRef };

/** A figure gets a card that is no longer anywhere else. Every way of
 *  getting a card goes through here, so "card-gained" covers them all. */
export function gainCard(
  figure: FigureId,
  card: string,
  by: GainedBy,
  rule: RuleRef,
): Step {
  return step<GainCard>("gain-card", { figure, card, by, rule });
}

/** Where a card goes when its holder loses it. */
export type CardDestination =
  | { to: "discard" }
  /** Back into its deck, which is then shuffled. */
  | { to: "deck" }
  | { to: "room"; room: string }
  | { to: "figure"; figure: FigureId; by: GainedBy }
  /** Set aside: in a room, waiting for the next explorer to come in (a dead
   *  explorer's companion), or, with no room, out of the game. */
  | { to: "aside"; room: string | null };

type LoseCard = {
  figure: FigureId;
  card: string;
  destination: CardDestination;
  rule: RuleRef;
};

/** Its holder loses a card, however: its onLose runs, the marks that belong
 *  to the holder are cleared, and the card goes to its destination. */
export function loseCard(
  figure: FigureId,
  card: string,
  destination: CardDestination,
  rule: RuleRef,
): Step {
  return step<LoseCard>("lose-card", { figure, card, destination, rule });
}

/** An event card the drawer keeps in front of them (for example while buried). */
export function keepCard(figure: FigureId, card: string): Step {
  return gainCard(figure, card, "kept", { source: "card", card });
}

/** Its holder loses a card, to its deck's discard pile. */
export function discardCard(figure: FigureId, card: string): Step {
  return loseCard(figure, card, { to: "discard" }, { source: "card", card });
}

/** Its holder puts a card back into its deck, and the deck is shuffled. */
export function returnToDeck(figure: FigureId, card: string, rule: RuleRef): Step {
  return loseCard(figure, card, { to: "deck" }, rule);
}

/** Whether an item or omen can be stolen now: its card allows it, and it
 *  hasn't been used, traded, dropped or picked up this turn (p. 11). */
export function stealable(engine: Engine, state: GameState, card: string): boolean {
  return engine.catalog.cards[card].transfer.steal && !isHandled(state, card);
}

/** A figure steals a card from another: stealing is that card's one
 *  action this turn (p. 11). */
export function steal(
  from: FigureId,
  to: FigureId,
  card: string,
  rule: RuleRef,
): Step {
  return step<{ from: FigureId; to: FigureId; card: string; rule: RuleRef }>(
    "steal",
    { from, to, card, rule },
  );
}

type MarkCard = {
  card: string;
  name: string;
  value: number | boolean;
  lasts: CardMark["lasts"];
  rule: RuleRef;
};

/** Sets a counter or flag on a card in play. False clears it. */
export function markCard(
  card: string,
  name: string,
  value: number | boolean,
  lasts: CardMark["lasts"],
  rule: RuleRef,
): Step {
  return step<MarkCard>("mark-card", { card, name, value, lasts, rule });
}

export function cardFlag(
  state: GameState,
  card: string,
  name: string,
): boolean {
  return state.cardMarks[card]?.[name]?.value === true;
}

export function cardCount(
  state: GameState,
  card: string,
  name: string,
): number {
  const value = state.cardMarks[card]?.[name]?.value;
  return typeof value === "number" ? value : 0;
}

const DRAWN_BY = "drawn-by";

/** The figure that drew an event card, while the card is in play: a rule
 *  may favour rolls for events its holder drew (the Candle). */
export function drawnBy(state: GameState, rule: RuleRef): FigureId | null {
  if (rule.source !== "card") return null;
  const value = state.cardMarks[rule.card]?.[DRAWN_BY]?.value;
  return typeof value === "string" ? value : null;
}

/** Clears a card's marks: those of its holder, or, as it leaves play, all of them. */
function clearMarks(
  state: GameState,
  card: string,
  which: "holder" | "all",
): void {
  const marks = state.cardMarks[card];
  if (!marks) return;
  const kept = Object.fromEntries(
    Object.entries(marks).filter(
      ([, mark]) => which === "holder" && mark.lasts === "play",
    ),
  );
  if (Object.keys(kept).length > 0) state.cardMarks[card] = kept;
  else delete state.cardMarks[card];
}

type PlaceToken = {
  token: string;
  room: string;
  wall: Edge[] | null;
  side: Edge | null;
  link: Place | null;
  holder: FigureId | null;
  rule: RuleRef;
};

/** Puts a token in a room: in a barrier room, on one `side`; one of a linked
 *  pair, with a `link` to where the other lies; or following a `holder`
 *  figure wherever it goes. */
export function placeToken(
  token: string,
  room: string,
  rule: RuleRef,
  how: { side?: Edge | null; link?: Place; holder?: FigureId } = {},
): Step {
  return step<PlaceToken>("place-token", {
    token,
    room,
    wall: null,
    side: how.side ?? null,
    link: how.link ?? null,
    holder: how.holder ?? null,
    rule,
  });
}

/** Puts a token on a wall of a room (printed edges of its tile: one for a
 *  wall, two for a corner), between that room and whatever lies beyond. */
export function placeWallToken(
  token: string,
  room: string,
  wall: Edge[],
  rule: RuleRef,
): Step {
  return step<PlaceToken>("place-token", {
    token,
    room,
    wall,
    side: null,
    link: null,
    holder: null,
    rule,
  });
}

export function removeToken(token: string, room: string, rule: RuleRef): Step {
  return step<{ token: string; room: string; rule: RuleRef }>("remove-token", {
    token,
    room,
    rule,
  });
}

type Relocate = {
  figure: FigureId;
  room: string;
  rule: RuleRef;
  side: Edge | null;
  after: Step[];
};

/** Puts a figure in a room without moving there: no movement is spent.
 *  Leaving its room first runs its rules for leaving, as any departure does,
 *  so `after` runs only once it is in.
 *  Landing in a barrier room, it goes to `side`, or else its controller
 *  chooses one (p. 7). */
export function relocate(
  figure: FigureId,
  room: string,
  rule: RuleRef,
  side: Edge | null = null,
  after: Step[] = [],
): Step {
  return displace(
    figure,
    leaveRoom(
      figure,
      step<Relocate>("relocate", { figure, room, rule, side, after }),
    ),
  );
}

/** An effect moves a figure out of its room by running `then`, unless the
 *  canBeMoved question says nothing may (haunt 13's sleeping body): then the
 *  figure stays where it is, and the move lapses. */
export function displace(figure: FigureId, then: Step): Step {
  return step<{ figure: FigureId; then: Step }>("displace", { figure, then });
}

/** Whether an effect may move a figure out of its room. */
export function canBeMoved(
  engine: Engine,
  state: GameState,
  figure: FigureId,
): boolean {
  return askPermission(engine, state, "canBeMoved", { figure }).allowed;
}

/** Has the controller of a figure landing in a barrier room choose which
 *  side it lands on (p. 7), continuing into `then` with it as `side`. */
export function chooseSide(
  state: GameState,
  figure: FigureId,
  room: string,
  sides: Edge[],
  rule: RuleRef,
  then: Step,
  roomName: string,
): Step {
  return chooseOne(
    figure,
    sides.map((side) => ({
      label: `Land on the ${sideName(state.board, room, side)} side of the ${roomName}`,
      steps: [continueWith(then, { side })],
    })),
    rule,
  );
}

type Leave = {
  figure: FigureId;
  room: string;
  /** The departure itself: the step that moves the figure out. */
  then: Step;
  /** Sources whose say over this departure has been had, as kind:id. */
  heard: string[];
};

/** A figure leaves its room by running `then`, once every source with a
 *  say over leaving it (a room's roll to leave) has had it. A source can keep
 *  the figure in the room by not continuing. */
export function leaveRoom(figure: FigureId, then: Step): Step {
  return step<{ figure: FigureId; then: Step }>("leave", { figure, then });
}

/** The figure stays in the room it was leaving, and moves no further this
 *  turn: it tries again on a later turn. */
export function stayInRoom(figure: FigureId, rule: RuleRef): Step {
  return step<{ figure: FigureId; rule: RuleRef }>("stay", { figure, rule });
}

/** An event card that stays in play, held by no one, until something ends it. */
export function startOngoing(card: string): Step {
  return step<{ card: string }>("start-ongoing", { card });
}

/** Ends an ongoing event, to the event discard pile. */
export function endOngoing(card: string): Step {
  return step<{ card: string }>("end-ongoing", { card });
}

export type Option = { label: string; steps: Step[] };

/** Who makes a choice: the seat controlling a figure, for a choice the
 *  rules give the figure (where it lands, whether it comes closer), or a
 *  seat itself, for one the rules give a player ("the traitor chooses"). */
export type Chooser = FigureId | { seat: number };

/** A choice's chooser as stored in its parameters. */
export type ChosenBy = { figure: FigureId } | { seat: number };

export function chosenBy(chooser: Chooser): ChosenBy {
  return typeof chooser === "string" ? { figure: chooser } : { seat: chooser.seat };
}

type ChooseOne = ChosenBy & {
  options: Option[];
  rule: RuleRef;
  /** What is being chosen, for the question ("choose a room to add to the
   *  house"), where "choose one" says too little. */
  prompt?: string;
};

/** A choice among options worked out when the effect runs: a room, a trait,
 *  a figure. Each option carries its own steps. */
export function chooseOne(
  chooser: Chooser,
  options: Option[],
  rule: RuleRef,
  prompt?: string,
): Step {
  const by = chosenBy(chooser);
  return step<ChooseOne>(
    "choose-one",
    prompt === undefined
      ? { ...by, options, rule }
      : { ...by, options, rule, prompt },
  );
}

export function endMovement(figure: FigureId, rule: RuleRef): Step {
  return step<{ figure: FigureId; rule: RuleRef }>("end-movement", {
    figure,
    rule,
  });
}

/** Ends the turn of the seat controlling the figure at its next chance to
 *  act. Off that seat's turn, it does nothing. */
export function endTurnNow(figure: FigureId, rule: RuleRef): Step {
  return step<{ figure: FigureId; rule: RuleRef }>("end-turn-now", {
    figure,
    rule,
  });
}

/** Puts a status on a figure: a named condition with its rule and its own
 *  data, which acts as a rule source while the figure has it. */
export function addStatus(figure: FigureId, status: Status): Step {
  return step<{ figure: FigureId; status: Status }>("add-status", {
    figure,
    status,
  });
}

/** Takes a status off a figure. */
export function removeStatus(
  figure: FigureId,
  status: string,
  rule: RuleRef,
): Step {
  return step<{ figure: FigureId; status: string; rule: RuleRef }>(
    "remove-status",
    { figure, status, rule },
  );
}

// ---------------------------------------------------------------------------
// Death
// ---------------------------------------------------------------------------

const rulebook = (page: number, ruling?: string): RuleRef =>
  ruling === undefined
    ? { source: "rulebook", page }
    : { source: "rulebook", page, ruling };

/** Whether a figure still takes part. A dead explorer takes no further part
 *  (p. 16): what was still to happen to it (more damage from the same card,
 *  a roll it was to make, a card it was to draw) lapses. */
function takesPart(state: GameState, figure: FigureId): boolean {
  return figureOf(state, figure).alive;
}

type Die = {
  figure: FigureId;
  trait: Trait | null;
  cause: RuleRef;
  killer: FigureId | null;
};

/** A trait has gone past its lowest value: what the skull means is a
 *  question, asked with the rule that took it there. */
function reachSkull(
  state: GameState,
  ctx: StepContext,
  figure: FigureId,
  trait: Trait,
  cause: RuleRef,
  killer: FigureId | null,
): void {
  const outcome = askStructured(ctx.engine, state, "lethalOutcome", {
    figure,
    trait,
    cause,
  });
  if (outcome.kind === "death")
    ctx.push(step<Die>("die", { figure, trait, cause, killer }));
}

/** A figure dies, with the rule that killed it and the figure that dealt
 *  the blow, if any. */
export function die(
  figure: FigureId,
  cause: RuleRef,
  killer: FigureId | null = null,
): Step {
  return step<Die>("die", { figure, trait: null, cause, killer });
}

type Harmful = {
  figure: FigureId;
  rule: RuleRef;
  /** What is ignored, for the log ("the roll to leave"). */
  what: string;
  apply: Option;
  ignore: Option;
};

/** Text that may harm or hold back a figure: whether it binds the figure
 *  is the bindingText question. Binding, `apply` runs; ignored, `ignore`
 *  runs; optional, the figure's controller chooses (the traitor's new
 *  powers, p. 17; monsters, p. 19; ruling harmful-text). */
export function harmful(
  figure: FigureId,
  rule: RuleRef,
  text: { what: string; apply: Option; ignore: Option },
): Step {
  return step<Harmful>("harmful", { figure, rule, ...text });
}

/** Records a once-a-turn use made without a roll (passing the Wall Switch
 *  without rolling), so it counts as the figure's attempt at that roll
 *  (p. 12). */
export function attempt(figure: FigureId, id: string): Step {
  return step<{ figure: FigureId; id: string }>("attempt", { figure, id });
}

/** Whether a figure has attempted a roll this turn: each may attempt the
 *  same roll once a turn (p. 12). */
export function attempted(state: GameState, figure: FigureId, id: string): boolean {
  return state.turn?.rolls[figure]?.includes(id) ?? false;
}

/** Whether a figure may attempt a roll now: on a turn, and not yet this
 *  turn. */
export function mayAttempt(state: GameState, figure: FigureId, id: string): boolean {
  return state.turn !== null && !attempted(state, figure, id);
}

function recordAttempt(state: GameState, figure: FigureId, id: string): void {
  if (state.turn === null || attempted(state, figure, id)) return;
  state.turn.rolls[figure] = [...(state.turn.rolls[figure] ?? []), id];
}

/** A figure is stunned (p. 18): it gets in no one's way, and misses its next
 *  monster turn, at whose end it recovers. */
export function stun(figure: FigureId, rule: RuleRef): Step {
  return step<{ figure: FigureId; rule: RuleRef }>("stun", { figure, rule });
}

/** Whether a card works as an item: every item, and every omen but the
 *  companions and those that can't be traded, dropped or stolen at all (the
 *  Bite), as the 1st-edition FAQ treats them. */
export function worksAsItem(catalog: Catalog, card: string): boolean {
  const { type, label, transfer } = catalog.cards[card];
  if (type === "item") return true;
  return (
    type === "omen" &&
    label !== "companion" &&
    (transfer.trade || transfer.drop || transfer.steal)
  );
}

/** Where a dead explorer's card goes (p. 19): a companion stays in the room
 *  for the next explorer to come in, and every card that works as an item
 *  drops onto the room's item pile. Kept events and the Bite stay with the
 *  body and do nothing more. */
function dropOnDeath(
  catalog: Catalog,
  figure: FigureId,
  card: string,
  room: string,
): Step[] {
  if (catalog.cards[card].label === "companion")
    return [loseCard(figure, card, { to: "aside", room }, rulebook(19))];
  if (!worksAsItem(catalog, card)) return [];
  const rule =
    catalog.cards[card].type === "omen"
      ? rulebook(19, "dead-explorers-omens")
      : rulebook(19);
  return [loseCard(figure, card, { to: "room", room }, rule)];
}

/** A figure has come into a room: a living explorer takes custody of any
 *  dead explorer's companion waiting there (p. 19). */
export function arrived(
  state: GameState,
  ctx: StepContext,
  figure: FigureId,
  room: string,
): void {
  const you = figureOf(state, figure);
  if (you.kind !== "explorer" || !you.alive) return;
  const waiting = state.aside.filter((a) => a.room === room);
  if (waiting.length === 0) return;
  state.aside = state.aside.filter((a) => a.room !== room);
  ctx.push(
    ...waiting.map((a) => gainCard(figure, a.card, "custody", rulebook(19))),
  );
}

/** A drawn card's effect on its drawer, who may choose not to be affected
 *  where the bindingText question allows it: the traitor, by an event card
 *  or the Bite, deciding before any roll it asks for (p. 17, ruling
 *  traitor-events). */
function affectedBy(
  state: GameState,
  ctx: StepContext,
  figure: FigureId,
  card: string,
  onDraw: (state: GameState, figure: FigureId, engine: Engine) => Step[],
): Step {
  const name = cardName(ctx.engine, card);
  return harmful(figure, { source: "card", card }, {
    what: "the card",
    apply: {
      label: `Be affected by the ${name}`,
      steps: onDraw(state, figure, ctx.engine),
    },
    ignore: { label: `Don't be affected by the ${name}`, steps: [] },
  });
}

/** The trait a roll rolls, if it rolls one's dice: a trait roll, a
 *  movement roll (Speed), or an attack roll not standing in for a card. */
function rolledTrait(spec: RollSpec): Trait | null {
  switch (spec.kind) {
    case "trait":
      return spec.trait;
    case "movement":
      return "speed";
    case "attack":
      return spec.dice === null ? spec.trait : null;
    case "dice":
    case "haunt":
      return null;
  }
}

/** A monster's roll shows its trait to everyone, for every monster of its
 *  type (ruling monster-traits-known). */
function learnTrait(
  state: GameState,
  ctx: StepContext,
  p: RollInProgress,
): void {
  const trait = rolledTrait(p.spec);
  const { definition } = figureOf(state, p.figure);
  if (
    trait === null ||
    !(definition in ctx.catalog.figures) ||
    ctx.catalog.figures[definition].traits.kind !== "fixed" ||
    state.memory.traitsKnown.some(
      (k) => k.definition === definition && k.trait === trait,
    )
  )
    return;
  const value = askNumber(ctx.engine, state, "traitValue", {
    figure: p.figure,
    trait,
  });
  state.memory.traitsKnown.push({ definition, trait });
  ctx.emit("trait-known", rulebook(18, "monster-traits-known"), {
    definition,
    trait,
    value,
  });
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const EFFECT_STEPS: Record<string, StepHandler> = {
  gain: defineStep<Gain>((state, p, ctx) => {
    if (!takesPart(state, p.figure)) return;
    // A monster's traits are fixed: it can't benefit from a gain (p. 19),
    // and a loss that isn't damage leaves it as it is (ruling
    // monster-traits).
    if (figureOf(state, p.figure).traits.kind === "fixed") {
      ctx.emit("traits-fixed", rulebook(19, "monster-traits"), {
        figure: p.figure,
        trait: p.trait,
      });
      return;
    }
    const moved = moveClip(
      ctx.catalog,
      state,
      p.figure,
      p.trait,
      p.amount,
      p.card,
    );
    ctx.emit("trait-changed", p.rule, {
      figure: p.figure,
      trait: p.trait,
      spaces: moved.spaces,
    });
    if (moved.skull) reachSkull(state, ctx, p.figure, p.trait, p.rule, null);
  }),

  damage: defineStep<Damage>((state, p, ctx) => {
    if (!takesPart(state, p.figure)) return;
    if (p.dice !== null) {
      ctx.push(
        roll(
          p.figure,
          { kind: "dice", count: p.dice },
          p.rule,
          step("damage-rolled", {
            figure: p.figure,
            damage: p.damage,
            rule: p.rule,
            by: p.by,
          }),
        ),
      );
      return;
    }
    const points = p.amount ?? 0;
    if (
      points > 0 &&
      damageKinds(ctx.engine, state, p.figure, p.damage).length > 0
    ) {
      ctx.decideFor(
        p.figure,
        "damage-kind",
        { figure: p.figure, damage: p.damage, points, rule: p.rule, by: p.by },
        p.rule,
      );
      return;
    }
    ctx.push(
      step<DamageLands>("damage-lands", {
        figure: p.figure,
        damage: p.damage,
        points,
        rule: p.rule,
        by: p.by,
      }),
    );
  }),

  "damage-lands": defineStep<DamageLands>((state, p, ctx) => {
    const amount = askNumber(ctx.engine, state, "damageAmount", {
      figure: p.figure,
      damage: p.damage,
      amount: p.points,
      rule: p.rule,
    });
    if (amount <= 0) {
      ctx.emit("damage-prevented", p.rule, { figure: p.figure, damage: p.damage });
      return;
    }
    // A monster that would take any damage is stunned instead (p. 18).
    if (!takesDamage(ctx.catalog, state, p.figure)) {
      ctx.push(stun(p.figure, rulebook(18)));
      return;
    }
    ctx.decideFor(
      p.figure,
      "split-damage",
      { figure: p.figure, damage: p.damage, amount, rule: p.rule, by: p.by },
      p.rule,
    );
  }),

  "damage-rolled": defineStep<{
    figure: FigureId;
    damage: "physical" | "mental";
    rule: RuleRef;
    by: FigureId | null;
    result: number;
  }>((_state, p, ctx) => {
    ctx.push(damage(p.figure, p.damage, { points: p.result }, p.rule, p.by));
  }),

  roll: defineStep<Roll>((state, p, ctx) => {
    if (!takesPart(state, p.figure)) return;
    if (p.id !== null) {
      if (attempted(state, p.figure, p.id))
        throw new Error(`${p.figure} already attempted roll ${p.id} this turn`);
      recordAttempt(state, p.figure, p.id);
    }
    const pool = askNumber(ctx.engine, state, "dicePool", {
      figure: p.figure,
      roll: { spec: p.spec, rule: p.rule, extraDice: p.extraDice },
    });
    ctx.push(
      step<RollInProgress>("roll-before", {
        ...p,
        pool,
        bonus: 0,
        named: null,
        dice: [],
        used: [],
      }),
    );
  }),

  // The roller can die between the roll's steps (the Idol's cost, paid as
  // it is used), and a roll a dead figure was to make lapses.
  "roll-before": defineStep<RollInProgress>((state, p, ctx) => {
    if (!takesPart(state, p.figure)) return;
    if (rollOptions(ctx.engine, state, p, "before").length === 0)
      ctx.push(step("roll-dice", p));
    else
      ctx.decideFor(
        p.figure,
        "roll-before",
        p,
        p.rule,
      );
  }),

  "roll-dice": defineStep<RollInProgress>((state, p, ctx) => {
    if (!takesPart(state, p.figure)) return;
    const dice = p.named === null ? ctx.random.dice(p.pool) : [];
    ctx.push(step<RollInProgress>("roll-after", { ...p, dice }));
  }),

  "roll-after": defineStep<RollInProgress>((state, p, ctx) => {
    if (!takesPart(state, p.figure)) return;
    const offered =
      rollOptions(ctx.engine, state, p, "after").some(
        (o) => o.option.effect.kind === "reroll",
      ) && p.dice.length > 0;
    if (offered)
      ctx.decideFor(
        p.figure,
        "roll-after",
        p,
        p.rule,
      );
    else ctx.push(step("roll-done", p));
  }),

  "roll-done": defineStep<RollInProgress>((state, p, ctx) => {
    if (!takesPart(state, p.figure)) return;
    const result = rollTotal(p);
    learnTrait(state, ctx, p);
    ctx.emit("rolled", p.rule, {
      figure: p.figure,
      spec: p.spec,
      dice: p.dice,
      named: p.named,
      bonus: p.bonus,
      result,
    });
    ctx.push(continueWith(p.then, { result }));
  }),

  table: defineStep<{ rows: TableRow[]; result: number }>((_state, p, ctx) => {
    const top = p.rows.reduce((a, b) => (b.min > a.min ? b : a));
    const row =
      p.rows.find(
        (r) => p.result >= r.min && (r.max === null || p.result <= r.max),
      ) ?? (top.max !== null && p.result > top.max ? top : undefined);
    if (!row) throw new Error(`No table row for a result of ${p.result}`);
    ctx.push(...row.steps);
  }),

  "draw-card": defineStep<DrawCard>((state, p, ctx) => {
    if (!takesPart(state, p.figure)) return;
    const deck = state.decks[p.type];
    if (deck.draw.length === 0) {
      deck.draw = ctx.random.shuffle(deck.discard);
      deck.discard = [];
    }
    const card = deck.draw.shift();
    if (card === undefined) {
      ctx.emit("deck-empty", p.rule, { type: p.type });
      return;
    }
    const room = placeOf(state, p.figure).room;
    endMovementOf(state, p.figure);
    ctx.emit("card-drawn", p.rule, { figure: p.figure, card, type: p.type });
    const behaviour = ctx.engine.behaviours.cards[card];
    if (p.type === "event") {
      state.cardMarks[card] = {
        ...state.cardMarks[card],
        [DRAWN_BY]: { value: p.figure, lasts: "play" },
      };
      if (!behaviour?.onDraw) throw new Error(`Event ${card} has no behaviour`);
      ctx.push(
        affectedBy(state, ctx, p.figure, card, behaviour.onDraw),
        step("settle-event", { card }),
      );
      return;
    }
    if (p.type === "omen" && state.status === "exploring" && state.turn) {
      state.turn.omens.push({ card, figure: p.figure, room });
    }
    if (p.type === "omen") state.omensDrawn += 1;
    ctx.push(
      gainCard(p.figure, card, "drawn", p.rule),
      ...(behaviour?.onDraw
        ? [affectedBy(state, ctx, p.figure, card, behaviour.onDraw)]
        : []),
    );
  }),

  "settle-event": defineStep<{ card: string }>((state, p) => {
    const kept =
      allFigures(state).some((f) => f.cards.includes(p.card)) ||
      state.ongoing.includes(p.card);
    if (kept) return;
    state.decks.event.discard.push(p.card);
    clearMarks(state, p.card, "all");
  }),

  "gain-card": defineStep<GainCard>((state, p, ctx) => {
    figureOf(state, p.figure).cards.push(p.card);
    ctx.emit("card-gained", p.rule, { figure: p.figure, card: p.card, by: p.by });
    ctx.push(
      ...(ctx.engine.behaviours.cards[p.card]?.onGain?.(state, p.figure) ?? []),
    );
  }),

  "lose-card": defineStep<LoseCard>((state, p, ctx) => {
    const holder = figureOf(state, p.figure);
    // A figure that died since this was queued dropped its cards then;
    // losing this one lapses (rules p. 19, dead-explorers-body).
    if (!holder.alive && !holder.cards.includes(p.card)) return;
    if (!holder.cards.includes(p.card))
      throw new Error(`${p.figure} doesn't hold ${p.card}`);
    // Worked out while the card is still held, so it can read the card's marks.
    const onLose =
      ctx.engine.behaviours.cards[p.card]?.onLose?.(
        state,
        p.figure,
        p.destination,
      ) ?? [];
    holder.cards = holder.cards.filter((c) => c !== p.card);
    const deck = state.decks[ctx.catalog.cards[p.card].type];
    const where = p.destination;
    switch (where.to) {
      case "discard":
        deck.discard.push(p.card);
        clearMarks(state, p.card, "all");
        break;
      case "deck":
        deck.draw = ctx.random.shuffle([...deck.draw, p.card]);
        clearMarks(state, p.card, "all");
        break;
      case "room":
        state.piles[where.room] = [...(state.piles[where.room] ?? []), p.card];
        clearMarks(state, p.card, "holder");
        break;
      case "figure":
        clearMarks(state, p.card, "holder");
        break;
      case "aside":
        state.aside.push({ card: p.card, room: where.room });
        clearMarks(state, p.card, "holder");
        break;
    }
    ctx.emit("card-lost", p.rule, {
      figure: p.figure,
      card: p.card,
      destination: where,
    });
    ctx.push(
      ...onLose,
      ...(where.to === "figure"
        ? [gainCard(where.figure, p.card, where.by, p.rule)]
        : []),
    );
  }),

  steal: defineStep<{
    from: FigureId;
    to: FigureId;
    card: string;
    rule: RuleRef;
  }>(
    (state, p, ctx) => {
      if (!stealable(ctx.engine, state, p.card))
        throw new Error(`${p.card} can't be stolen now`);
      handle(state, p.card);
      ctx.push(
        loseCard(
          p.from,
          p.card,
          { to: "figure", figure: p.to, by: "stolen" },
          p.rule,
        ),
      );
    },
  ),

  "mark-card": defineStep<MarkCard>((state, p, ctx) => {
    const marks = { ...state.cardMarks[p.card] };
    if (p.value === false) delete marks[p.name];
    else marks[p.name] = { value: p.value, lasts: p.lasts };
    if (Object.keys(marks).length > 0) state.cardMarks[p.card] = marks;
    else delete state.cardMarks[p.card];
    ctx.emit("card-marked", p.rule, {
      card: p.card,
      name: p.name,
      value: p.value,
    });
  }),

  "place-token": defineStep<PlaceToken>((state, p, ctx) => {
    state.tokens.push({
      token: p.token,
      room: p.room,
      ...(p.wall && { wall: p.wall }),
      ...(p.side && { side: p.side }),
      ...(p.link && { link: p.link }),
      ...(p.holder !== null && { holder: p.holder }),
    });
    ctx.emit("token-placed", p.rule, {
      token: p.token,
      room: p.room,
      wall: p.wall,
    });
  }),

  "remove-token": defineStep<{ token: string; room: string; rule: RuleRef }>(
    (state, p, ctx) => {
      const index = state.tokens.findIndex(
        (t) => t.token === p.token && t.room === p.room,
      );
      if (index < 0) throw new Error(`No ${p.token} token in ${p.room}`);
      state.tokens.splice(index, 1);
      ctx.emit("token-removed", p.rule, { token: p.token, room: p.room });
    },
  ),

  leave: defineStep<{ figure: FigureId; then: Step }>((state, p, ctx) => {
    if (!takesPart(state, p.figure)) return;
    ctx.push(
      step<Leave>("leave-heard", {
        figure: p.figure,
        room: placeOf(state, p.figure).room,
        then: p.then,
        heard: [],
      }),
    );
  }),

  "leave-heard": defineStep<Leave>((state, p, ctx) => {
    if (!takesPart(state, p.figure)) return;
    if (placeOf(state, p.figure).room !== p.room)
      throw new Error(`${p.figure} left ${p.room} before its rules said so`);
    const next = liveSources(ctx.engine, state, "beforeLeave").find(
      ({ source, behaviour }) =>
        behaviour.beforeLeave !== undefined &&
        !p.heard.includes(`${source.kind}:${source.id}`) &&
        ((source.kind === "room" && source.id === p.room) ||
          (source.kind !== "room" && source.room === p.room) ||
          source.holder === p.figure),
    );
    if (!next?.behaviour.beforeLeave) {
      ctx.push(p.then);
      return;
    }
    const { source } = next;
    ctx.push(
      ...next.behaviour.beforeLeave(
        state,
        p.figure,
        source,
        step<Leave>("leave-heard", {
          ...p,
          heard: [...p.heard, `${source.kind}:${source.id}`],
        }),
      ),
    );
  }),

  displace: defineStep<{ figure: FigureId; then: Step }>((state, p, ctx) => {
    if (!takesPart(state, p.figure)) return;
    const moved = askPermission(ctx.engine, state, "canBeMoved", {
      figure: p.figure,
    });
    if (moved.allowed) {
      ctx.push(p.then);
      return;
    }
    const rule = moved.because.at(0);
    if (rule === undefined)
      throw new Error(`Nothing says why ${p.figure} can't be moved`);
    ctx.emit("not-moved", rule, {
      figure: p.figure,
      room: placeOf(state, p.figure).room,
    });
  }),

  stay: defineStep<{ figure: FigureId; rule: RuleRef }>((state, p, ctx) => {
    endMovementOf(state, p.figure);
    ctx.emit("stayed", p.rule, {
      figure: p.figure,
      room: placeOf(state, p.figure).room,
    });
  }),

  relocate: defineStep<Relocate>((state, p, ctx) => {
    const sides = barrierSides(ctx.engine, p.room);
    if (sides.length > 0 && p.side === null) {
      ctx.push(
        chooseSide(
          state,
          p.figure,
          p.room,
          sides,
          p.rule,
          step<Relocate>("relocate", p),
          ctx.catalog.rooms[p.room].name,
        ),
      );
      return;
    }
    goOut(state, ctx, p.figure, p.rule, false);
    putFigure(state, p.figure, {
      room: p.room,
      side: sides.length > 0 ? p.side : null,
    });
    ctx.emit("entered", p.rule, { figure: p.figure, room: p.room, moved: false });
    arrived(state, ctx, p.figure, p.room);
    ctx.push(...p.after);
  }),

  die: defineStep<Die>((state, p, ctx) => {
    const figure = figureOf(state, p.figure);
    // A figure dies once, however many of its traits reach the skull at once.
    if (!figure.alive) return;
    const room = placeOf(state, p.figure).room;
    figure.alive = false;
    state.memory.deaths.push({ ...p, room });
    // A trait at the skull kills (p. 5); any other death is its cause's own
    // rule (a haunt's monster killed when beaten).
    ctx.emit("died", p.trait === null ? p.cause : rulebook(5), { ...p, room });
    ctx.push(
      ...figure.cards.flatMap((card) =>
        dropOnDeath(ctx.catalog, p.figure, card, room),
      ),
      step<{ figure: FigureId }>("leave-board", { figure: p.figure }),
      // The turn's acting figure dying ends the turn, unless others are
      // still to act on it: a monster killed on its own turn leaves the
      // rest of the monster turn to the others. Any other figure's death,
      // the seat's own explorer's on its monster turn included, leaves the
      // turn as it is.
      ...(state.turn?.acting === p.figure && readyActors(state).length === 0
        ? [endTurnNow(p.figure, rulebook(16, "dead-seats-turns"))]
        : []),
    );
  }),

  // A figure already stunned stays so.
  stun: defineStep<{ figure: FigureId; rule: RuleRef }>((state, p, ctx) => {
    const figure = figureOf(state, p.figure);
    if (!takesPart(state, p.figure) || figure.stunned) return;
    figure.stunned = true;
    ctx.emit("stunned", p.rule, { figure: p.figure });
  }),

  // A dead figure leaves the board: it is in no room, so it slows no one
  // and nothing can reach it.
  "leave-board": defineStep<{ figure: FigureId }>((state, p) => {
    figureOf(state, p.figure).place = null;
  }),

  "start-ongoing": defineStep<{ card: string }>((state, p) => {
    state.ongoing.push(p.card);
  }),

  "end-ongoing": defineStep<{ card: string }>((state, p, ctx) => {
    if (!state.ongoing.includes(p.card))
      throw new Error(`${p.card} isn't ongoing`);
    state.ongoing = state.ongoing.filter((c) => c !== p.card);
    state.decks.event.discard.push(p.card);
    clearMarks(state, p.card, "all");
    ctx.emit(
      "ongoing-ended",
      { source: "card", card: p.card },
      { card: p.card },
    );
  }),

  "choose-one": defineStep<ChooseOne>(
    (state, p, ctx) => {
      if (p.options.length === 0) throw new Error("A choice with no options");
      if ("seat" in p) ctx.decide([p.seat], "choose-one", p, p.rule);
      else ctx.decideFor(p.figure, "choose-one", p, p.rule);
    },
  ),

  "end-movement": defineStep<{ figure: FigureId; rule: RuleRef }>(
    (state, p, ctx) => {
      endMovementOf(state, p.figure);
      ctx.emit("movement-ended", p.rule, { figure: p.figure });
    },
  ),

  // A figure has a status at most once, so its data is never ambiguous.
  "add-status": defineStep<{ figure: FigureId; status: Status }>(
    (state, p, ctx) => {
      const figure = figureOf(state, p.figure);
      if (figure.statuses.some((s) => s.id === p.status.id))
        throw new Error(`${p.figure} already has the status ${p.status.id}`);
      figure.statuses.push(p.status);
      ctx.emit("status-added", p.status.rule, {
        figure: p.figure,
        status: p.status.id,
      });
    },
  ),

  "remove-status": defineStep<{ figure: FigureId; status: string; rule: RuleRef }>(
    (state, p, ctx) => {
      const figure = figureOf(state, p.figure);
      if (!figure.statuses.some((s) => s.id === p.status))
        throw new Error(`${p.figure} has no status ${p.status}`);
      figure.statuses = figure.statuses.filter((s) => s.id !== p.status);
      ctx.emit("status-removed", p.rule, {
        figure: p.figure,
        status: p.status,
      });
    },
  ),

  harmful: defineStep<Harmful>((state, p, ctx) => {
    if (!takesPart(state, p.figure)) return;
    const binding = askStructured(ctx.engine, state, "bindingText", {
      figure: p.figure,
      rule: p.rule,
    });
    const ignored = step<{ figure: FigureId; what: string; rule: RuleRef }>(
      "text-ignored",
      { figure: p.figure, what: p.what, rule: p.rule },
    );
    switch (binding) {
      case "binding":
        ctx.push(...p.apply.steps);
        return;
      case "ignored":
        ctx.push(ignored, ...p.ignore.steps);
        return;
      case "optional":
        ctx.push(
          chooseOne(
            p.figure,
            [p.apply, { ...p.ignore, steps: [ignored, ...p.ignore.steps] }],
            p.rule,
          ),
        );
        return;
    }
  }),

  "text-ignored": defineStep<{ figure: FigureId; what: string; rule: RuleRef }>(
    (_state, p, ctx) => {
      ctx.emit("text-ignored", p.rule, { figure: p.figure, what: p.what });
    },
  ),

  attempt: defineStep<{ figure: FigureId; id: string }>((state, p) => {
    recordAttempt(state, p.figure, p.id);
  }),

  "end-turn-now": defineStep<{ figure: FigureId; rule: RuleRef }>(
    (state, p, ctx) => {
      if (!state.turn || !onTurn(ctx.engine, state, p.figure)) return;
      state.turn.over = true;
      ctx.emit("turn-cut-short", p.rule, {
        seat: state.turn.seat,
        kind: state.turn.kind,
      });
    },
  ),
};

function cardName(engine: Engine, card: string): string {
  return engine.catalog.cards[card].name;
}

export const EFFECT_DECISIONS: Record<string, DecisionKind> = {
  "split-damage": defineDecision<Split, { [trait: string]: number }>({
    candidates: (state, p, _seat, engine) => splitOptions(engine, state, p),
    label: (_state, _p, split) =>
      `Take ${Object.entries(split)
        .map(([trait, n]) => `${n} ${traitName(trait as Trait)}`)
        .join(" and ")}`,
    resolve: (state, p, split, ctx) => {
      const skulls = Object.entries(split).flatMap(([trait, spaces]) =>
        moveClip(ctx.catalog, state, p.figure, trait as Trait, -spaces, null)
          .skull
          ? [trait as Trait]
          : [],
      );
      ctx.emit("damaged", p.rule, { figure: p.figure, damage: p.damage, split });
      for (const trait of skulls)
        reachSkull(state, ctx, p.figure, trait, p.rule, p.by);
      return null;
    },
  }),

  "damage-kind": defineDecision<DamageLands, string | null>({
    candidates: (state, p, _seat, engine) => [
      null,
      ...damageKinds(engine, state, p.figure, p.damage).map((s) => s.id),
    ],
    label: (_state, p, card, engine) => {
      const other = p.damage === "physical" ? "mental" : "physical";
      return card === null
        ? `Take ${p.points} ${p.damage} damage`
        : `Use ${cardName(engine, card)}: take ${p.points} ${other} damage instead`;
    },
    resolve: (state, p, card, ctx) => {
      if (card === null) {
        ctx.push(step<DamageLands>("damage-lands", p));
        return null;
      }
      const to = ctx.engine.behaviours.cards[card]?.damageAs;
      if (to === undefined || to === p.damage)
        return "That card doesn't change this damage";
      ctx.emit(
        "damage-converted",
        { source: "card", card },
        { figure: p.figure, from: p.damage, to },
      );
      ctx.push(step<DamageLands>("damage-lands", { ...p, damage: to }));
      return null;
    },
  }),

  "choose-one": defineDecision<ChooseOne, number>({
    candidates: (_state, p) => p.options.map((_option, index) => index),
    label: (_state, p, index) => p.options[index].label,
    resolve: (_state, p, index, ctx) => {
      ctx.push(...p.options[index].steps);
      return null;
    },
  }),

  "roll-before": defineDecision<RollInProgress, OptionChoice>({
    candidates: (state, r, _seat, engine) => {
      const choices: OptionChoice[] = [{ card: null }];
      for (const { card, index, option } of rollOptions(
        engine,
        state,
        r,
        "before",
      )) {
        if (option.effect.kind === "add" || option.effect.kind === "dice")
          choices.push({ card, option: index, value: null });
        if (option.effect.kind === "number")
          choices.push({
            card,
            option: index,
            value: Math.min(option.effect.value(state), highestResult(r.pool)),
          });
        if (option.effect.kind === "name") {
          for (
            let value = option.effect.min;
            value <= option.effect.max;
            value++
          )
            choices.push({ card, option: index, value });
        }
      }
      return choices;
    },
    label: (_state, r, c, engine) => {
      if (c.card === null)
        return `Make the ${rollName(r.spec)} (${r.pool} ${r.pool === 1 ? "die" : "dice"})`;
      const effect =
        engine.behaviours.cards[c.card]?.rollOptions?.[c.option]?.effect;
      if (effect?.kind === "dice")
        return `Use ${cardName(engine, c.card)}: add ${effect.amount} dice`;
      return c.value === null
        ? `Use ${cardName(engine, c.card)}`
        : `Use ${cardName(engine, c.card)}: the result is ${c.value}`;
    },
    resolve: (state, r, c, ctx) => {
      if (c.card === null) {
        ctx.push(step("roll-dice", r));
        return null;
      }
      const option =
        ctx.engine.behaviours.cards[c.card]?.rollOptions?.[c.option];
      if (!option) return "That option doesn't exist";
      handle(state, c.card);
      ctx.emit(
        "card-used",
        { source: "card", card: c.card },
        { figure: r.figure, card: c.card },
      );
      const next: RollInProgress = { ...r, used: [...r.used, c.card] };
      if (option.effect.kind === "add") next.bonus += option.effect.amount;
      if (option.effect.kind === "dice")
        next.pool = Math.min(next.pool + option.effect.amount, MAX_DICE);
      if (option.effect.kind === "name" || option.effect.kind === "number")
        next.named = c.value;
      ctx.push(step("roll-before", next));
      return null;
    },
  }),

  "roll-after": defineDecision<RollInProgress, RerollChoice>({
    candidates: (state, r, _seat, engine) => {
      const choices: RerollChoice[] = [{ card: null }];
      for (const { card, index, option } of rollOptions(
        engine,
        state,
        r,
        "after",
      )) {
        if (option.effect.kind !== "reroll") continue;
        for (const faces of rerollChoices(r.dice, option.effect.max))
          choices.push({ card, option: index, faces });
      }
      return choices;
    },
    label: (_state, r, c, engine) => {
      if (c.card === null) return `Keep the result (${rollTotal(r)})`;
      return `Use ${cardName(engine, c.card)}: reroll ${c.faces.join(", ")}`;
    },
    resolve: (state, r, c, ctx) => {
      if (c.card === null) {
        ctx.push(step("roll-done", r));
        return null;
      }
      const kept = [...r.dice];
      for (const face of c.faces) kept.splice(kept.indexOf(face), 1);
      handle(state, c.card);
      ctx.emit(
        "card-used",
        { source: "card", card: c.card },
        { figure: r.figure, card: c.card },
      );
      const dice = [...kept, ...ctx.random.dice(c.faces.length)];
      ctx.push(
        step<RollInProgress>("roll-after", {
          ...r,
          dice,
          used: [...r.used, c.card],
        }),
      );
      return null;
    },
  }),
};
