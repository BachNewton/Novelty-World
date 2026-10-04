import type {
  CardMark,
  CardType,
  GameState,
  Json,
  RuleRef,
  Step,
  Trait,
} from "../types";
import { explorerAt, MENTAL, moveClip, PHYSICAL } from "./explorers";
import { askNumber } from "./questions";
import { liveSources, type RollOption, type RollSpec } from "./sources";
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
  resolve: (
    state: GameState,
    params: P,
    choice: C,
    ctx: StepContext,
    answers: Record<number, C>,
  ) => string | null;
}): DecisionKind {
  return {
    candidates: (state, decision, seat, engine) =>
      kind.candidates(state, decision.params as P, seat, engine),
    label: (state, decision, choice, engine) =>
      kind.label(state, decision.params as P, choice as C, engine),
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

// ---------------------------------------------------------------------------
// Traits and damage
// ---------------------------------------------------------------------------

type Gain = {
  seat: number;
  trait: Trait;
  amount: number;
  card: string | null;
  rule: RuleRef;
};

/** Gain (or, negative, lose) spaces on a trait. Name the card when the change comes from holding it (p. 11). */
export function gain(
  seat: number,
  trait: Trait,
  amount: number,
  rule: RuleRef,
  card: string | null = null,
): Step {
  return step<Gain>("gain", { seat, trait, amount, card, rule });
}

type Damage = {
  seat: number;
  damage: "physical" | "mental";
  amount: number | null;
  dice: number | null;
  rule: RuleRef;
};

export function damage(
  seat: number,
  kind: "physical" | "mental",
  amount: { points: number } | { dice: number },
  rule: RuleRef,
): Step {
  return step<Damage>("damage", {
    seat,
    damage: kind,
    amount: "points" in amount ? amount.points : null,
    dice: "dice" in amount ? amount.dice : null,
    rule,
  });
}

type Split = {
  seat: number;
  damage: "physical" | "mental";
  amount: number;
  rule: RuleRef;
};

function splitOptions(
  state: GameState,
  split: Split,
): { [trait: string]: number }[] {
  const [first, second] = split.damage === "physical" ? PHYSICAL : MENTAL;
  const clips = explorerAt(state, split.seat).clips;
  const seen = new Set<string>();
  const options: { [trait: string]: number }[] = [];
  for (let onFirst = split.amount; onFirst >= 0; onFirst--) {
    const option = { [first]: onFirst, [second]: split.amount - onFirst };
    // Before the haunt a trait stops at its lowest value, so different splits can land the same way.
    const outcome = `${Math.max(clips[first] - onFirst, 0)}/${Math.max(clips[second] - option[second], 0)}`;
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
  seat: number;
  spec: RollSpec;
  rule: RuleRef;
  then: Step;
  /** Names the roll for "the same roll only once a turn" (p. 12). */
  id: string | null;
};

type RollInProgress = Roll & {
  pool: number;
  bonus: number;
  named: number | null;
  dice: number[];
  /** Cards whose roll options were used on this roll. */
  used: string[];
};

/** A roll whose result continues into `then`, added to its parameters as `result`. */
export function roll(
  seat: number,
  spec: RollSpec,
  rule: RuleRef,
  then: Step,
  id: string | null = null,
): Step {
  return step<Roll>("roll", { seat, spec, rule, then, id });
}

/** A roll's outcome table: the first row whose range holds the result. */
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
  for (const { source, behaviour } of liveSources(engine.behaviours, state)) {
    if (
      source.kind !== "card" ||
      source.holder !== r.seat ||
      r.used.includes(source.id) ||
      isHandled(state, source.id)
    )
      continue;
    (behaviour.rollOptions ?? []).forEach((option, index) => {
      if (
        option.timing === timing &&
        option.applies(state, r.seat, { spec: r.spec, rule: r.rule })
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

function describeRoll(spec: RollSpec): string {
  switch (spec.kind) {
    case "trait":
      return `${spec.trait[0].toUpperCase()}${spec.trait.slice(1)} roll`;
    case "dice":
      return `${spec.count}-dice roll`;
    case "haunt":
      return "haunt roll";
  }
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

type DrawCard = { seat: number; type: CardType; rule: RuleRef };

export function drawCard(seat: number, type: CardType, rule: RuleRef): Step {
  return step<DrawCard>("draw-card", { seat, type, rule });
}

/** How a card came to its holder. */
export type GainedBy = "drawn" | "kept" | "picked-up" | "traded" | "given";

type GainCard = { seat: number; card: string; by: GainedBy; rule: RuleRef };

/** An explorer gets a card that is no longer anywhere else. Every way of
 *  getting a card goes through here, so "card-gained" covers them all. */
export function gainCard(
  seat: number,
  card: string,
  by: GainedBy,
  rule: RuleRef,
): Step {
  return step<GainCard>("gain-card", { seat, card, by, rule });
}

/** Where a card goes when its holder loses it. */
export type CardDestination =
  | { to: "discard" }
  /** Back into its deck, which is then shuffled. */
  | { to: "deck" }
  | { to: "room"; room: string }
  | { to: "explorer"; seat: number; by: GainedBy };

type LoseCard = {
  seat: number;
  card: string;
  destination: CardDestination;
  rule: RuleRef;
};

/** Its holder loses a card, however: its onLose runs, the marks that belong
 *  to the holder are cleared, and the card goes to its destination. */
export function loseCard(
  seat: number,
  card: string,
  destination: CardDestination,
  rule: RuleRef,
): Step {
  return step<LoseCard>("lose-card", { seat, card, destination, rule });
}

/** An event card the drawer keeps in front of them (for example while buried). */
export function keepCard(seat: number, card: string): Step {
  return gainCard(seat, card, "kept", { source: "card", card });
}

/** Its holder loses a card, to its deck's discard pile. */
export function discardCard(seat: number, card: string): Step {
  return loseCard(seat, card, { to: "discard" }, { source: "card", card });
}

/** Its holder puts a card back into its deck, and the deck is shuffled. */
export function returnToDeck(seat: number, card: string, rule: RuleRef): Step {
  return loseCard(seat, card, { to: "deck" }, rule);
}

type MarkCard = {
  card: string;
  name: string;
  value: number | boolean;
  lasts: CardMark["lasts"];
  rule: RuleRef;
};

/** Sets a counter or flag on a card in play. False and 0 clear it. */
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

export function placeToken(token: string, room: string, rule: RuleRef): Step {
  return step<{ token: string; room: string; rule: RuleRef }>("place-token", {
    token,
    room,
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

/** Puts an explorer in a room without moving there: no movement is spent. */
export function relocate(seat: number, room: string, rule: RuleRef): Step {
  return step<{ seat: number; room: string; rule: RuleRef }>("relocate", {
    seat,
    room,
    rule,
  });
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

/** A choice among options worked out when the effect runs: a room, a trait, an explorer. Each option carries its own steps. */
export function chooseOne(
  seat: number,
  options: Option[],
  rule: RuleRef,
): Step {
  return step<{ seat: number; options: Option[]; rule: RuleRef }>(
    "choose-one",
    { seat, options, rule },
  );
}

export function endMovement(seat: number, rule: RuleRef): Step {
  return step<{ seat: number; rule: RuleRef }>("end-movement", { seat, rule });
}

/** Ends the explorer's turn at its next chance to act. Off their turn, it does nothing. */
export function endTurnNow(seat: number, rule: RuleRef): Step {
  return step<{ seat: number; rule: RuleRef }>("end-turn-now", { seat, rule });
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const EFFECT_STEPS: Record<string, StepHandler> = {
  gain: defineStep<Gain>((state, p, ctx) => {
    const moved = moveClip(
      ctx.catalog,
      state,
      p.seat,
      p.trait,
      p.amount,
      p.card,
    );
    ctx.emit("trait-changed", p.rule, {
      seat: p.seat,
      trait: p.trait,
      spaces: moved,
    });
  }),

  damage: defineStep<Damage>((state, p, ctx) => {
    if (p.dice !== null) {
      ctx.push(
        roll(
          p.seat,
          { kind: "dice", count: p.dice },
          p.rule,
          step("damage-rolled", {
            seat: p.seat,
            damage: p.damage,
            rule: p.rule,
          }),
        ),
      );
      return;
    }
    const amount = askNumber(ctx.engine, state, "damageAmount", {
      seat: p.seat,
      damage: p.damage,
      amount: p.amount ?? 0,
      rule: p.rule,
    });
    if (amount <= 0) {
      ctx.emit("damage-prevented", p.rule, { seat: p.seat, damage: p.damage });
      return;
    }
    ctx.decide(
      [p.seat],
      "split-damage",
      { seat: p.seat, damage: p.damage, amount, rule: p.rule },
      p.rule,
    );
  }),

  "damage-rolled": defineStep<{
    seat: number;
    damage: "physical" | "mental";
    rule: RuleRef;
    result: number;
  }>((_state, p, ctx) => {
    ctx.push(damage(p.seat, p.damage, { points: p.result }, p.rule));
  }),

  roll: defineStep<Roll>((state, p, ctx) => {
    if (p.id !== null && state.turn) {
      if (state.turn.rolls.includes(p.id))
        throw new Error(`Roll ${p.id} was already attempted this turn`);
      state.turn.rolls.push(p.id);
    }
    const pool = askNumber(ctx.engine, state, "dicePool", {
      seat: p.seat,
      roll: { spec: p.spec, rule: p.rule },
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

  "roll-before": defineStep<RollInProgress>((state, p, ctx) => {
    if (rollOptions(ctx.engine, state, p, "before").length === 0)
      ctx.push(step("roll-dice", p));
    else ctx.decide([p.seat], "roll-before", p, p.rule);
  }),

  "roll-dice": defineStep<RollInProgress>((state, p, ctx) => {
    const dice = p.named === null ? ctx.random.dice(p.pool) : [];
    ctx.push(step<RollInProgress>("roll-after", { ...p, dice }));
  }),

  "roll-after": defineStep<RollInProgress>((state, p, ctx) => {
    const offered =
      rollOptions(ctx.engine, state, p, "after").some(
        (o) => o.option.effect.kind === "reroll",
      ) && p.dice.length > 0;
    if (offered) ctx.decide([p.seat], "roll-after", p, p.rule);
    else ctx.push(step("roll-done", p));
  }),

  "roll-done": defineStep<RollInProgress>((_state, p, ctx) => {
    const result = rollTotal(p);
    ctx.emit("rolled", p.rule, {
      seat: p.seat,
      spec: p.spec,
      dice: p.dice,
      named: p.named,
      bonus: p.bonus,
      result,
    });
    ctx.push(continueWith(p.then, { result }));
  }),

  table: defineStep<{ rows: TableRow[]; result: number }>((_state, p, ctx) => {
    const row = p.rows.find(
      (r) => p.result >= r.min && (r.max === null || p.result <= r.max),
    );
    if (!row) throw new Error(`No table row for a result of ${p.result}`);
    ctx.push(...row.steps);
  }),

  "draw-card": defineStep<DrawCard>((state, p, ctx) => {
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
    const explorer = explorerAt(state, p.seat);
    if (state.turn?.seat === p.seat) state.turn.movementEnded = true;
    ctx.emit("card-drawn", p.rule, { seat: p.seat, card, type: p.type });
    const behaviour = ctx.engine.behaviours.cards[card];
    if (p.type === "event") {
      if (!behaviour?.onDraw) throw new Error(`Event ${card} has no behaviour`);
      ctx.push(
        ...behaviour.onDraw(state, p.seat),
        step("settle-event", { card }),
      );
      return;
    }
    if (p.type === "omen" && state.status === "exploring" && state.turn) {
      state.turn.omens.push({ card, room: explorer.room });
    }
    if (p.type === "omen") state.omensDrawn += 1;
    ctx.push(
      gainCard(p.seat, card, "drawn", p.rule),
      ...(behaviour?.onDraw?.(state, p.seat) ?? []),
    );
  }),

  "settle-event": defineStep<{ card: string }>((state, p) => {
    const kept =
      state.explorers.some((e) => e.cards.includes(p.card)) ||
      state.ongoing.includes(p.card);
    if (!kept) state.decks.event.discard.push(p.card);
  }),

  "gain-card": defineStep<GainCard>((state, p, ctx) => {
    explorerAt(state, p.seat).cards.push(p.card);
    ctx.emit("card-gained", p.rule, { seat: p.seat, card: p.card, by: p.by });
    ctx.push(
      ...(ctx.engine.behaviours.cards[p.card]?.onGain?.(state, p.seat) ?? []),
    );
  }),

  "lose-card": defineStep<LoseCard>((state, p, ctx) => {
    const explorer = explorerAt(state, p.seat);
    if (!explorer.cards.includes(p.card))
      throw new Error(`Seat ${p.seat} doesn't hold ${p.card}`);
    // Worked out while the card is still held, so it can read the card's marks.
    const onLose =
      ctx.engine.behaviours.cards[p.card]?.onLose?.(state, p.seat) ?? [];
    explorer.cards = explorer.cards.filter((c) => c !== p.card);
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
      case "explorer":
        clearMarks(state, p.card, "holder");
        break;
    }
    ctx.emit("card-lost", p.rule, {
      seat: p.seat,
      card: p.card,
      destination: where,
    });
    ctx.push(
      ...onLose,
      ...(where.to === "explorer"
        ? [gainCard(where.seat, p.card, where.by, p.rule)]
        : []),
    );
  }),

  "mark-card": defineStep<MarkCard>((state, p, ctx) => {
    const marks = { ...state.cardMarks[p.card] };
    if (p.value === false || p.value === 0) delete marks[p.name];
    else marks[p.name] = { value: p.value, lasts: p.lasts };
    if (Object.keys(marks).length > 0) state.cardMarks[p.card] = marks;
    else delete state.cardMarks[p.card];
    ctx.emit("card-marked", p.rule, {
      card: p.card,
      name: p.name,
      value: p.value,
    });
  }),

  "place-token": defineStep<{ token: string; room: string; rule: RuleRef }>(
    (state, p, ctx) => {
      state.tokens.push({ token: p.token, room: p.room });
      ctx.emit("token-placed", p.rule, { token: p.token, room: p.room });
    },
  ),

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

  relocate: defineStep<{ seat: number; room: string; rule: RuleRef }>(
    (state, p, ctx) => {
      const explorer = explorerAt(state, p.seat);
      ctx.emit("left", p.rule, {
        seat: p.seat,
        room: explorer.room,
        moved: false,
      });
      explorer.room = p.room;
      ctx.emit("entered", p.rule, { seat: p.seat, room: p.room, moved: false });
    },
  ),

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

  "choose-one": defineStep<{ seat: number; options: Option[]; rule: RuleRef }>(
    (_state, p, ctx) => {
      if (p.options.length === 0) throw new Error("A choice with no options");
      ctx.decide([p.seat], "choose-one", p, p.rule);
    },
  ),

  "end-movement": defineStep<{ seat: number; rule: RuleRef }>(
    (state, p, ctx) => {
      if (state.turn?.seat === p.seat) state.turn.movementEnded = true;
      ctx.emit("movement-ended", p.rule, { seat: p.seat });
    },
  ),

  "end-turn-now": defineStep<{ seat: number; rule: RuleRef }>(
    (state, p, ctx) => {
      if (state.turn?.seat !== p.seat) return;
      state.turn.over = true;
      ctx.emit("turn-cut-short", p.rule, { seat: p.seat });
    },
  ),
};

function cardName(engine: Engine, card: string): string {
  return engine.catalog.cards[card].name;
}

export const EFFECT_DECISIONS: Record<string, DecisionKind> = {
  "split-damage": defineDecision<Split, { [trait: string]: number }>({
    candidates: (state, p) => splitOptions(state, p),
    label: (_state, _p, split) =>
      `Take ${Object.entries(split)
        .map(([trait, n]) => `${n} ${trait[0].toUpperCase()}${trait.slice(1)}`)
        .join(" and ")}`,
    resolve: (state, p, split, ctx) => {
      for (const [trait, spaces] of Object.entries(split)) {
        moveClip(ctx.catalog, state, p.seat, trait as Trait, -spaces, null);
      }
      ctx.emit("damaged", p.rule, { seat: p.seat, damage: p.damage, split });
      return null;
    },
  }),

  "choose-one": defineDecision<
    { seat: number; options: Option[]; rule: RuleRef },
    number
  >({
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
        if (option.effect.kind === "add")
          choices.push({ card, option: index, value: null });
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
        return `Make the ${describeRoll(r.spec)} (${r.pool} dice)`;
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
        { seat: r.seat, card: c.card },
      );
      const next: RollInProgress = { ...r, used: [...r.used, c.card] };
      if (option.effect.kind === "add") next.bonus += option.effect.amount;
      if (option.effect.kind === "name") next.named = c.value;
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
        { seat: r.seat, card: c.card },
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
