import type {
  CardMark,
  CardType,
  Edge,
  GameState,
  Json,
  Place,
  RuleRef,
  Step,
  Trait,
} from "../types";
import { sideName } from "./board";
import { rollName, traitName } from "./describe";
import {
  explorerAt,
  MENTAL,
  moveClip,
  PHYSICAL,
  putExplorer,
} from "./explorers";
import { askNumber, barrierSides, MAX_DICE } from "./questions";
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

type DamageLands = {
  seat: number;
  damage: "physical" | "mental";
  points: number;
  rule: RuleRef;
};

/** The cards that let a seat take this damage as the other kind instead. */
function damageKinds(
  engine: Engine,
  state: GameState,
  seat: number,
  damage: "physical" | "mental",
): Source[] {
  return liveSources(engine.behaviours, state)
    .filter(
      ({ source, behaviour }) =>
        source.holder === seat &&
        behaviour.damageAs !== undefined &&
        behaviour.damageAs !== damage,
    )
    .map(({ source }) => source);
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
  seat: number,
  spec: RollSpec,
  rule: RuleRef,
  then: Step,
  options: { id?: string; extraDice?: number } = {},
): Step {
  return step<Roll>("roll", {
    seat,
    spec,
    rule,
    then,
    id: options.id ?? null,
    extraDice: options.extraDice ?? 0,
  });
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
        option.applies(state, r.seat, {
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

/** The seat that drew an event card, while the card is in play: a rule may
 *  favour rolls for events its holder drew (the Candle). */
export function drawnBy(state: GameState, rule: RuleRef): number | null {
  if (rule.source !== "card") return null;
  const value = state.cardMarks[rule.card]?.[DRAWN_BY]?.value;
  return typeof value === "number" ? value : null;
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
  holder: number | null;
  rule: RuleRef;
};

/** Puts a token in a room: in a barrier room, on one `side`; one of a linked
 *  pair, with a `link` to where the other lies; or following a `holder`
 *  wherever their explorer goes. */
export function placeToken(
  token: string,
  room: string,
  rule: RuleRef,
  how: { side?: Edge | null; link?: Place; holder?: number } = {},
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
  seat: number;
  room: string;
  rule: RuleRef;
  side: Edge | null;
};

/** Puts an explorer in a room without moving there: no movement is spent.
 *  Leaving their room first runs its rules for leaving, as any departure does.
 *  Landing in a barrier room, they go to `side`, or else choose one (p. 7). */
export function relocate(
  seat: number,
  room: string,
  rule: RuleRef,
  side: Edge | null = null,
): Step {
  return leaveRoom(seat, step<Relocate>("relocate", { seat, room, rule, side }));
}

/** Has an explorer landing in a barrier room choose which side they land on
 *  (p. 7), continuing into `then` with it as `side`. */
export function chooseSide(
  state: GameState,
  seat: number,
  room: string,
  sides: Edge[],
  rule: RuleRef,
  then: Step,
  roomName: string,
): Step {
  return chooseOne(
    seat,
    sides.map((side) => ({
      label: `Land on the ${sideName(state.board, room, side)} side of the ${roomName}`,
      steps: [continueWith(then, { side })],
    })),
    rule,
  );
}

type Leave = {
  seat: number;
  room: string;
  /** The departure itself: the step that moves the explorer out. */
  then: Step;
  /** Sources whose say over this departure has been had, as kind:id. */
  heard: string[];
};

/** An explorer leaves their room by running `then`, once every source with a
 *  say over leaving it (a room's roll to leave) has had it. A source can keep
 *  the explorer in the room by not continuing. */
export function leaveRoom(seat: number, then: Step): Step {
  return step<{ seat: number; then: Step }>("leave", { seat, then });
}

/** The explorer stays in the room they were leaving, and moves no further
 *  this turn: they try again on a later turn. */
export function stayInRoom(seat: number, rule: RuleRef): Step {
  return step<{ seat: number; rule: RuleRef }>("stay", { seat, rule });
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
    const points = p.amount ?? 0;
    if (
      points > 0 &&
      damageKinds(ctx.engine, state, p.seat, p.damage).length > 0
    ) {
      ctx.decide(
        [p.seat],
        "damage-kind",
        { seat: p.seat, damage: p.damage, points, rule: p.rule },
        p.rule,
      );
      return;
    }
    ctx.push(step<DamageLands>("damage-lands", { ...p, points }));
  }),

  "damage-lands": defineStep<DamageLands>((state, p, ctx) => {
    const amount = askNumber(ctx.engine, state, "damageAmount", {
      seat: p.seat,
      damage: p.damage,
      amount: p.points,
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
      state.cardMarks[card] = {
        ...state.cardMarks[card],
        [DRAWN_BY]: { value: p.seat, lasts: "play" },
      };
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
    if (kept) return;
    state.decks.event.discard.push(p.card);
    clearMarks(state, p.card, "all");
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

  leave: defineStep<{ seat: number; then: Step }>((state, p, ctx) => {
    ctx.push(
      step<Leave>("leave-heard", {
        seat: p.seat,
        room: explorerAt(state, p.seat).room,
        then: p.then,
        heard: [],
      }),
    );
  }),

  "leave-heard": defineStep<Leave>((state, p, ctx) => {
    if (explorerAt(state, p.seat).room !== p.room)
      throw new Error(`Seat ${p.seat} left ${p.room} before its rules said so`);
    const next = liveSources(ctx.engine.behaviours, state).find(
      ({ source, behaviour }) =>
        behaviour.beforeLeave !== undefined &&
        !p.heard.includes(`${source.kind}:${source.id}`) &&
        ((source.kind === "room" && source.id === p.room) ||
          (source.kind !== "room" && source.room === p.room) ||
          source.holder === p.seat),
    );
    if (!next?.behaviour.beforeLeave) {
      ctx.push(p.then);
      return;
    }
    const { source } = next;
    ctx.push(
      ...next.behaviour.beforeLeave(
        state,
        p.seat,
        source,
        step<Leave>("leave-heard", {
          ...p,
          heard: [...p.heard, `${source.kind}:${source.id}`],
        }),
      ),
    );
  }),

  stay: defineStep<{ seat: number; rule: RuleRef }>((state, p, ctx) => {
    if (state.turn?.seat === p.seat) state.turn.movementEnded = true;
    ctx.emit("stayed", p.rule, {
      seat: p.seat,
      room: explorerAt(state, p.seat).room,
    });
  }),

  relocate: defineStep<Relocate>((state, p, ctx) => {
    const sides = barrierSides(ctx.engine, p.room);
    if (sides.length > 0 && p.side === null) {
      ctx.push(
        chooseSide(
          state,
          p.seat,
          p.room,
          sides,
          p.rule,
          step<Relocate>("relocate", p),
          ctx.catalog.rooms[p.room].name,
        ),
      );
      return;
    }
    ctx.emit("left", p.rule, {
      seat: p.seat,
      room: explorerAt(state, p.seat).room,
      moved: false,
    });
    putExplorer(state, p.seat, {
      room: p.room,
      side: sides.length > 0 ? p.side : null,
    });
    ctx.emit("entered", p.rule, { seat: p.seat, room: p.room, moved: false });
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
        .map(([trait, n]) => `${n} ${traitName(trait as Trait)}`)
        .join(" and ")}`,
    resolve: (state, p, split, ctx) => {
      for (const [trait, spaces] of Object.entries(split)) {
        moveClip(ctx.catalog, state, p.seat, trait as Trait, -spaces, null);
      }
      ctx.emit("damaged", p.rule, { seat: p.seat, damage: p.damage, split });
      return null;
    },
  }),

  "damage-kind": defineDecision<DamageLands, string | null>({
    candidates: (state, p, _seat, engine) => [
      null,
      ...damageKinds(engine, state, p.seat, p.damage).map((s) => s.id),
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
        { seat: p.seat, from: p.damage, to },
      );
      ctx.push(step<DamageLands>("damage-lands", { ...p, damage: to }));
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
        { seat: r.seat, card: c.card },
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
