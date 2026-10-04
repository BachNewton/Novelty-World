import type { FigureId, GameState, RuleRef, Step, Trait } from "../types";
import { traitName } from "./describe";
import {
  continueWith,
  damage,
  defineDecision,
  defineStep,
  handle,
  isHandled,
  roll,
  steal,
  stealable,
  step,
} from "./effects";
import { figureOf, seatExplorer } from "./figures";
import {
  askStructured,
  controllerOf,
  type AttackMode,
  type AttackSubject,
  type CombatOutcome,
  type Modifier,
} from "./questions";
import type { DecisionKind, Engine, StepHandler } from "./step-loop";

// An attack (p. 13): both sides roll, the higher result wins, and the loser
// takes the difference as damage, or the attacker steals an item instead.
// Each part is a question, so a card or a haunt can change it: the ways to
// attack (attackModes), the dice (dicePool), and what the results lead to
// (combatOutcome). Before the haunt no one may attack (p. 13), so attacks
// happen only when a card makes one; the turn's own attack action comes with
// the haunt, which says who is an opponent.

/** Who attacks: a figure, or an attacker a card stands in for ("a Might 4
 *  attack on behalf of the Creepy Puppet"), whose dice a player throws. */
export type Attacker =
  | { kind: "figure"; figure: FigureId }
  | { kind: "card"; trait: Trait; dice: number };

type Attack = {
  attacker: Attacker;
  defender: FigureId;
  rule: RuleRef;
  /** Continues after the attack, with its `outcome` added. */
  then: Step | null;
};

/** An attack under way: its mode, and the figure that rolls for the
 *  attacker. */
type Moded = Attack & { mode: AttackMode; roller: FigureId };

/** An attack on a figure. `then`, if given, runs once the attack is over,
 *  with the combat outcome added to its parameters as `outcome`. */
export function attack(
  attacker: Attacker,
  defender: FigureId,
  rule: RuleRef,
  then: Step | null = null,
): Step {
  return step<Attack>("attack", { attacker, defender, rule, then });
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
 *  the attack (a weapon, p. 12; the Ring). Only one card is used per attack,
 *  and never to defend. */
export function attackWith(
  card: string,
  trait: Trait,
  extraDice: number,
): Modifier[] {
  return [
    {
      question: "attackModes",
      when: (_state, { attacker }, source) => attacker === source.holder,
      change: {
        transform: (_state, _subject, modes) => [...modes, { trait, card }],
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

/** The ways a figure may attack: a card in a mode must be one it holds and
 *  hasn't already used this turn. */
function attackModes(
  engine: Engine,
  state: GameState,
  attacker: FigureId,
  defender: FigureId,
): AttackMode[] {
  const held = figureOf(state, attacker).cards;
  return askStructured(engine, state, "attackModes", {
    attacker,
    defender,
  }).filter(
    (m) =>
      m.card === null || (held.includes(m.card) && !isHandled(state, m.card)),
  );
}

const sameMode = (a: AttackMode, b: AttackMode) =>
  a.trait === b.trait && a.card === b.card;


export const COMBAT_STEPS: Record<string, StepHandler> = {
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
          mode: { trait: p.attacker.trait, card: null },
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
    const outcome = askStructured(ctx.engine, state, "combatOutcome", {
      attack: subject(p),
      mode: p.mode,
      attackResult,
      defenceResult: result,
    });
    ctx.emit("attack-outcome", p.rule, {
      attacker: subject(p).attacker,
      defender: p.defender,
      attackResult,
      defenceResult: result,
      loser: outcome.loser,
      damage: outcome.damage,
    });
    const settle: Settle = { ...attack, outcome };
    const thief = subject(p).attacker;
    if (
      outcome.steal &&
      thief !== null &&
      figureOf(state, p.defender).cards.some((c) =>
        stealable(ctx.engine, state, c),
      )
    ) {
      ctx.decide(
        [controllerOf(ctx.engine, state, thief)],
        "attack-steal",
        settle,
        p.rule,
      );
      return;
    }
    ctx.push(step<Settle>("attack-settle", settle));
  }),

  "attack-settle": defineStep<Settle>((_state, p, ctx) => {
    const { outcome } = p;
    const loser =
      outcome.loser === "defender" ? p.defender : subject(p).attacker;
    ctx.push(
      ...(outcome.damage && loser !== null
        ? [
            damage(
              loser,
              outcome.damage.kind,
              { points: outcome.damage.points },
              p.rule,
            ),
          ]
        : []),
      ...after(p),
    );
  }),
};

type Settle = Moded & { outcome: CombatOutcome };

function after(p: Settle): Step[] {
  return p.then ? [continueWith(p.then, { outcome: p.outcome })] : [];
}

function cardName(engine: Engine, card: string): string {
  return engine.catalog.cards[card].name;
}

export const COMBAT_DECISIONS: Record<string, DecisionKind> = {
  "attack-mode": defineDecision<Attack, AttackMode>({
    candidates: (state, p, _seat, engine) =>
      p.attacker.kind === "figure"
        ? attackModes(engine, state, p.attacker.figure, p.defender)
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
        !attackModes(ctx.engine, state, attacker, p.defender).some((m) =>
          sameMode(m, mode),
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
    label: (_state, p, card, engine) => {
      if (card !== null) return `Steal the ${cardName(engine, card)} instead`;
      const { damage: dealt } = p.outcome;
      if (!dealt) throw new Error("A steal offered without damage to replace");
      return `Deal ${dealt.points} ${dealt.kind} damage`;
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
