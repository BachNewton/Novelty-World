import type { FigureId, GameState, RuleRef, Step, Trait } from "../types";
import { traitName } from "./describe";
import {
  continueWith,
  damage,
  defineDecision,
  defineStep,
  die,
  handle,
  isHandled,
  roll,
  steal,
  stealable,
  step,
  stun,
} from "./effects";
import {
  allFigures,
  figureName,
  figureOf,
  seatExplorer,
  together,
} from "./figures";
import {
  askPermission,
  askSet,
  askStructured,
  controllerOf,
  hasTrait,
  type AttackMode,
  type AttackSubject,
  type AttackTarget,
  type CombatOutcome,
  type Harm,
  type Modifier,
} from "./questions";
import { inPlay, isOpponent } from "./sides";
import type { DecisionKind, Engine, StepHandler } from "./step-loop";

// An attack (p. 13): both sides roll, the higher result wins, and the loser
// suffers the difference as damage (a monster is stunned instead, p. 18), or
// the attacker steals an item instead. Each part is a question, so a card or
// a haunt can change it: who may be attacked at all (canAttack), the ways to
// attack and how far each reaches (attackModes), the dice (dicePool), and
// what the results lead to (combatOutcome: damage of either kind, a stun or
// a kill). Before the haunt no one may attack (p. 13), so attacks happen
// only when a card makes one; from the haunt on, a figure may also make one
// attack of its own each turn, on an opponent.

const ATTACK_RULE: RuleRef = { source: "rulebook", page: 13 };

/** Who attacks: a figure, or an attacker a card stands in for ("a Might 4
 *  attack on behalf of the Creepy Puppet"), whose dice a player throws. */
export type Attacker =
  | { kind: "figure"; figure: FigureId }
  | { kind: "card"; trait: Trait; dice: number };

type Attack = {
  attacker: Attacker;
  defender: FigureId;
  rule: RuleRef;
  /** The attacker chose to make it: the turn's own attack. Its target must
   *  be in the reach of the way it attacks, and, if stunned, worth attacking
   *  (p. 13). An attack a rule makes (the Bloody Vision's) puts its target
   *  in reach itself. */
  chosen: boolean;
  /** Continues after the attack, with its `outcome` added. */
  then: Step | null;
};

/** An attack under way: its mode, and the figure that rolls for the
 *  attacker. */
type Moded = Attack & { mode: AttackMode; roller: FigureId };

/** An attack a rule makes on a figure. `then`, if given, runs once the
 *  attack is over, with the combat outcome added to its parameters as
 *  `outcome`. */
export function attack(
  attacker: Attacker,
  defender: FigureId,
  rule: RuleRef,
  then: Step | null = null,
): Step {
  return step<Attack>("attack", {
    attacker,
    defender,
    rule,
    chosen: false,
    then,
  });
}

/** The seat on a seat's right. Turns pass to the left, the next seat. */
export function playerOnRight(state: GameState, seat: number): number {
  const count = state.seats.length;
  return (seat - 1 + count) % count;
}

/** A card's attack on a figure: "the player on your right makes a Might 4
 *  attack against you on behalf of" something the card names. */
export function cardAttack(
  defender: FigureId,
  trait: Trait,
  dice: number,
  rule: RuleRef,
  then: Step | null = null,
): Step {
  return attack({ kind: "card", trait, dice }, defender, rule, then);
}

/** The figure that rolls for the attacker: the attacking figure, or, for a
 *  card's attacker, the explorer of the player on the defender's right. */
function attackRoller(engine: Engine, state: GameState, p: Attack): FigureId {
  if (p.attacker.kind === "figure") return p.attacker.figure;
  return seatExplorer(
    state,
    playerOnRight(state, controllerOf(engine, state, p.defender)),
  );
}

/** A card its holder may attack with, in this trait, rolling extra dice on
 *  the attack (a weapon, p. 12; the Ring), and reaching as far as it says
 *  (the Revolver's line of sight). Only one card is used per attack, and
 *  never to defend. */
export function attackWith(
  card: string,
  trait: Trait,
  extraDice: number,
  reach: AttackMode["reach"] = "room",
): Modifier[] {
  return [
    {
      question: "attackModes",
      when: (_state, { attacker }, source) => attacker === source.holder,
      change: {
        adjust: (_state, _subject, modes) => [
          ...modes,
          { trait, card, reach },
        ],
      },
    },
    {
      question: "dicePool",
      when: (_state, { roll: r }) =>
        r.spec.kind === "attack" &&
        r.spec.role === "attacker" &&
        r.spec.card === card,
      change: { add: extraDice },
    },
  ];
}

function subject(p: Attack): AttackSubject {
  return {
    attacker: p.attacker.kind === "figure" ? p.attacker.figure : null,
    defender: p.defender,
    rule: p.rule,
  };
}

/** Whether a way of attacking reaches the defender: in the attacker's room
 *  (and on its side of a barrier), or, for an attack that reaches along a
 *  line of sight, in a room the attacker can see (p. 13). */
function inReach(
  engine: Engine,
  state: GameState,
  attacker: FigureId,
  defender: FigureId,
  mode: AttackMode,
): boolean {
  const from = figureOf(state, attacker);
  const to = figureOf(state, defender);
  if (together(from, to)) return true;
  return (
    mode.reach === "sight" &&
    from.place !== null &&
    to.place !== null &&
    askSet(engine, state, "lineOfSight", { room: from.place.room }).includes(
      to.place.room,
    )
  );
}

/** A stunned monster may be attacked only when beating it does more than
 *  stun it again: kill it, or let the attacker steal from it (p. 13, ruling
 *  stunned-benefit). What beating it does is the combat outcome of a win by
 *  2, the least that lets an attacker steal. */
function worthAttacking(
  engine: Engine,
  state: GameState,
  attacker: FigureId,
  defender: FigureId,
  mode: AttackMode,
): boolean {
  const target = figureOf(state, defender);
  if (!target.stunned) return true;
  const won = askStructured(engine, state, "combatOutcome", {
    attack: { attacker, defender, rule: ATTACK_RULE },
    mode,
    attackResult: 2,
    defenceResult: 0,
  });
  return (
    won.harm?.kind === "kill" ||
    (won.steal && target.cards.some((c) => stealable(engine, state, c)))
  );
}

/** The ways a figure may attack another: a card in a mode must be one it
 *  holds and hasn't already used this turn, and no one may be attacked
 *  with a trait either side lacks (p. 13). A chosen attack also needs the
 *  mode to reach, and a stunned target to be worth it. */
function attackModes(
  engine: Engine,
  state: GameState,
  attacker: FigureId,
  defender: FigureId,
  chosen: boolean,
): AttackMode[] {
  const held = figureOf(state, attacker).cards;
  return askStructured(engine, state, "attackModes", {
    attacker,
    defender,
  }).filter(
    (m) =>
      (m.card === null ||
        (held.includes(m.card) && !isHandled(state, m.card))) &&
      hasTrait(engine, state, attacker, m.trait) &&
      hasTrait(engine, state, defender, m.trait) &&
      (!chosen ||
        (inReach(engine, state, attacker, defender, m) &&
          worthAttacking(engine, state, attacker, defender, m))),
  );
}

const sameMode = (a: AttackMode, b: AttackMode) =>
  a.trait === b.trait && a.card === b.card && a.reach === b.reach;

/** Whether a figure could be made to attack another at all: the target
 *  takes part, may be attacked by it, and some way of attacking works on
 *  it. Who counts as an opponent, and the reach, are for the rule making the
 *  attack to say. */
export function canBeAttacked(
  engine: Engine,
  state: GameState,
  attacker: FigureId,
  defender: FigureId,
): boolean {
  return (
    defender !== attacker &&
    inPlay(figureOf(state, defender)) &&
    askPermission(engine, state, "canAttack", {
      attacker,
      target: { kind: "figure", figure: defender },
    }).allowed &&
    attackModes(engine, state, attacker, defender, false).length > 0
  );
}

/** Whether a figure still has its one attack of the turn to make (p. 13):
 *  only once the haunt has begun, once a turn, while it is in play and may
 *  act. Attacks a card makes are outside this allowance. */
export function mayAttackNow(
  engine: Engine,
  state: GameState,
  figure: FigureId,
): boolean {
  const turn = state.turn;
  return (
    state.status === "haunt" &&
    turn !== null &&
    !turn.attacked.includes(figure) &&
    inPlay(figureOf(state, figure)) &&
    askPermission(engine, state, "canAct", { figure }).allowed
  );
}

function isTurnTarget(
  engine: Engine,
  state: GameState,
  attacker: FigureId,
  defender: FigureId,
): boolean {
  return (
    canBeAttacked(engine, state, attacker, defender) &&
    isOpponent(engine, state, attacker, defender) &&
    attackModes(engine, state, attacker, defender, true).length > 0
  );
}

/** Whom a figure may attack with its turn's attack: an opponent (p. 13) in
 *  reach of a way it can attack them. */
export function attackTargets(
  engine: Engine,
  state: GameState,
  attacker: FigureId,
): AttackTarget[] {
  if (!mayAttackNow(engine, state, attacker)) return [];
  return allFigures(state)
    .filter((f) => isTurnTarget(engine, state, attacker, f.id))
    .map((f) => ({ kind: "figure", figure: f.id }));
}

/** The turn's own attack, which uses up the attacker's one attack of the
 *  turn, or why it can't be made. */
export function turnAttack(
  engine: Engine,
  state: GameState,
  attacker: FigureId,
  target: AttackTarget,
): string | Step {
  if (target.kind !== "figure") return "Only a figure can be attacked";
  if (!mayAttackNow(engine, state, attacker))
    return "No attack is left to make this turn";
  if (
    !(target.figure in state.figures) ||
    !isTurnTarget(engine, state, attacker, target.figure)
  )
    return "That can't be attacked";
  return step<Attack>("turn-attack", {
    attacker: { kind: "figure", figure: attacker },
    defender: target.figure,
    rule: ATTACK_RULE,
    chosen: true,
    then: null,
  });
}

/** A figure can't attack again this turn (the Sacrificial Dagger twisting
 *  in the hand): its one attack of the turn is used up. */
export function attackSpent(figure: FigureId): Step {
  return step<{ figure: FigureId }>("attack-spent", { figure });
}

type Beaten = {
  winner: FigureId;
  loser: FigureId;
  points: number;
  rule: RuleRef;
};

/** A figure beaten by another as if in physical combat, by this many
 *  points: what it suffers is the combat outcome's (a monster that fails
 *  its roll against the Dynamite, by the card's official ruling). */
export function beaten(
  winner: FigureId,
  loser: FigureId,
  points: number,
  rule: RuleRef,
): Step {
  return step<Beaten>("beaten", { winner, loser, points, rule });
}

/** The steps that carry out what the loser of an attack suffers. */
function harmSteps(
  loser: FigureId,
  winner: FigureId | null,
  harm: Harm,
): Step[] {
  switch (harm.kind) {
    case "damage":
      return [
        damage(loser, harm.damage, { points: harm.points }, harm.rule, winner),
      ];
    case "stun":
      return [stun(loser, harm.rule)];
    case "kill":
      return [die(loser, harm.rule, winner)];
  }
}

export const COMBAT_STEPS: Record<string, StepHandler> = {
  // The turn's own attack uses up the attacker's one attack of the turn
  // when it is declared, whatever then happens (p. 13).
  "turn-attack": defineStep<Attack>((state, p, ctx) => {
    if (p.attacker.kind !== "figure" || state.turn === null)
      throw new Error("The turn's attack is a figure's, on its turn");
    state.turn.attacked.push(p.attacker.figure);
    ctx.push(step<Attack>("attack", p));
  }),

  "attack-spent": defineStep<{ figure: FigureId }>((state, p) => {
    const turn = state.turn;
    if (turn !== null && !turn.attacked.includes(p.figure))
      turn.attacked.push(p.figure);
  }),

  attack: defineStep<Attack>((state, p, ctx) => {
    const roller = attackRoller(ctx.engine, state, p);
    ctx.emit("attacked", p.rule, {
      attacker: p.attacker,
      defender: p.defender,
      roller,
    });
    if (p.attacker.kind === "card") {
      ctx.push(
        step<Moded>("attack-roll", {
          ...p,
          mode: { trait: p.attacker.trait, card: null, reach: "room" },
          roller,
        }),
      );
      return;
    }
    ctx.decide(
      [controllerOf(ctx.engine, state, p.attacker.figure)],
      "attack-mode",
      p,
      p.rule,
    );
  }),

  "attack-roll": defineStep<Moded>((_state, p, ctx) => {
    ctx.push(
      roll(
        p.roller,
        {
          kind: "attack",
          trait: p.mode.trait,
          role: "attacker",
          card: p.mode.card,
          dice: p.attacker.kind === "card" ? p.attacker.dice : null,
        },
        p.rule,
        step<Moded>("attack-defend", p),
      ),
    );
  }),

  // The attacker rolls first and the defender second, each with their own
  // cards (the rulebook's project ruling).
  "attack-defend": defineStep<Moded & { result: number }>((_state, p, ctx) => {
    const { result, ...rest } = p;
    ctx.push(
      roll(
        p.defender,
        {
          kind: "attack",
          trait: p.mode.trait,
          role: "defender",
          card: null,
          dice: null,
        },
        p.rule,
        step<Moded & { attackResult: number }>("attack-compare", {
          ...rest,
          attackResult: result,
        }),
      ),
    );
  }),

  "attack-compare": defineStep<
    Moded & { attackResult: number; result: number }
  >((state, p, ctx) => {
    const { result, attackResult, ...attack } = p;
    const { attacker } = subject(p);
    const outcome = askStructured(ctx.engine, state, "combatOutcome", {
      attack: subject(p),
      mode: p.mode,
      attackResult,
      defenceResult: result,
    });
    ctx.emit("attack-outcome", p.rule, {
      attacker,
      defender: p.defender,
      attackResult,
      defenceResult: result,
      loser: outcome.loser,
      harm: outcome.harm,
      near:
        attacker !== null &&
        together(figureOf(state, attacker), figureOf(state, p.defender)),
    });
    const settle: Settle = { ...attack, outcome };
    // Only a figure that can hold cards can steal one: monsters can't
    // (p. 19).
    if (
      outcome.steal &&
      attacker !== null &&
      askPermission(ctx.engine, state, "canCarry", { figure: attacker })
        .allowed &&
      figureOf(state, p.defender).cards.some((c) =>
        stealable(ctx.engine, state, c),
      )
    ) {
      ctx.decide(
        [controllerOf(ctx.engine, state, attacker)],
        "attack-steal",
        settle,
        p.rule,
      );
      return;
    }
    ctx.push(step<Settle>("attack-settle", settle));
  }),

  "attack-settle": defineStep<Settle>((_state, p, ctx) => {
    const { harm, loser } = p.outcome;
    const { attacker } = subject(p);
    const [losing, winner] =
      loser === "defender" ? [p.defender, attacker] : [attacker, p.defender];
    ctx.push(
      ...(harm !== null && losing !== null
        ? harmSteps(losing, winner, harm)
        : []),
      ...after(p),
    );
  }),

  beaten: defineStep<Beaten>((state, p, ctx) => {
    const { harm } = askStructured(ctx.engine, state, "combatOutcome", {
      attack: { attacker: p.winner, defender: p.loser, rule: p.rule },
      mode: { trait: "might", card: null, reach: "room" },
      attackResult: p.points,
      defenceResult: 0,
    });
    if (harm !== null) ctx.push(...harmSteps(p.loser, p.winner, harm));
  }),
};

type Settle = Moded & { outcome: CombatOutcome };

function after(p: Settle): Step[] {
  return p.then ? [continueWith(p.then, { outcome: p.outcome })] : [];
}

function cardName(engine: Engine, card: string): string {
  return engine.catalog.cards[card].name;
}

/** What dealing a harm does to the loser, as a choice's label. */
function harmLabel(
  engine: Engine,
  state: GameState,
  harm: Harm,
  loser: FigureId,
): string {
  const name = figureName(engine.catalog, state, loser);
  switch (harm.kind) {
    case "damage":
      return `Deal ${harm.points} ${harm.damage} damage`;
    case "stun":
      return `Stun ${name}`;
    case "kill":
      return `Kill ${name}`;
  }
}

export const COMBAT_DECISIONS: Record<string, DecisionKind> = {
  "attack-mode": defineDecision<Attack, AttackMode>({
    candidates: (state, p, _seat, engine) =>
      p.attacker.kind === "figure"
        ? attackModes(engine, state, p.attacker.figure, p.defender, p.chosen)
        : [],
    label: (_state, _p, mode, engine) =>
      mode.card === null
        ? `Attack with ${traitName(mode.trait)}`
        : `Attack with ${traitName(mode.trait)}, using the ${cardName(engine, mode.card)}`,
    resolve: (state, p, mode, ctx) => {
      if (p.attacker.kind !== "figure")
        return "A card's attacker has no choice";
      const attacker = p.attacker.figure;
      if (
        !attackModes(ctx.engine, state, attacker, p.defender, p.chosen).some(
          (m) => sameMode(m, mode),
        )
      )
        return "That attack isn't possible";
      const go = step<Moded>("attack-roll", { ...p, mode, roller: attacker });
      if (mode.card === null) {
        ctx.push(go);
        return null;
      }
      // Attacking with a card uses it (p. 11).
      handle(state, mode.card);
      ctx.emit(
        "card-used",
        { source: "card", card: mode.card },
        { figure: attacker, card: mode.card },
      );
      const before = ctx.engine.behaviours.cards[mode.card]?.beforeAttack;
      ctx.push(...(before ? before(state, attacker, go) : [go]));
      return null;
    },
  }),

  "attack-steal": defineDecision<Settle, string | null>({
    candidates: (state, p, _seat, engine) => [
      null,
      ...figureOf(state, p.defender).cards.filter((c) =>
        stealable(engine, state, c),
      ),
    ],
    label: (state, p, card, engine) => {
      if (card !== null) return `Steal the ${cardName(engine, card)} instead`;
      const { harm } = p.outcome;
      if (harm === null)
        throw new Error("A steal offered with nothing to replace");
      return harmLabel(engine, state, harm, p.defender);
    },
    resolve: (state, p, card, ctx) => {
      if (card === null) {
        ctx.push(step<Settle>("attack-settle", p));
        return null;
      }
      const thief = subject(p).attacker;
      if (
        thief === null ||
        !figureOf(state, p.defender).cards.includes(card) ||
        !stealable(ctx.engine, state, card)
      )
        return "That can't be stolen";
      ctx.push(steal(p.defender, thief, card, p.rule), ...after(p));
      return null;
    },
  }),
};
