import type {
  CardType,
  Decision,
  GameEvent,
  GameState,
  Json,
  RuleRef,
  Trait,
} from "../types";
import type { CardDestination, GainedBy } from "./effects";
import type { RollSpec, Words } from "./sources";
import type { Engine } from "./step-loop";

// Plain language for events and decisions, for the game log, the UI and AI
// players alike. Each line names the rule behind it when that rule is a room,
// card or token, so a player can see why it happened.

export function traitName(trait: Trait): string {
  return `${trait[0].toUpperCase()}${trait.slice(1)}`;
}

export function rollName(spec: RollSpec): string {
  switch (spec.kind) {
    case "trait":
      return `${traitName(spec.trait)} roll`;
    case "dice":
      return `${spec.count}-dice roll`;
    case "haunt":
      return "haunt roll";
  }
}

/** The rule's source, by name. */
export function describeRule(engine: Engine, rule: RuleRef): string {
  const { rooms, cards, tokens } = engine.catalog;
  switch (rule.source) {
    case "rulebook":
      return `Rulebook, p. ${rule.page}`;
    case "room":
      return rooms[rule.room].name;
    case "card":
      return cards[rule.card].name;
    case "token":
      return `${tokens[rule.token].name} token`;
    case "haunt":
      return `Haunt ${rule.haunt}, ${rule.section}`;
  }
}

function wordsFor(engine: Engine, state: GameState): Words {
  const { characters, rooms, cards } = engine.catalog;
  return {
    explorer: (seat) => {
      const explorer = state.explorers.find((e) => e.seat === seat);
      return explorer
        ? characters[explorer.character].name
        : state.seats[seat].name;
    },
    room: (room) => rooms[room].name,
    card: (card) => cards[card].name,
  };
}

/** Prefixes a sentence with the room, card or token rule behind it, unless the sentence is about that card already. */
function withRule(
  engine: Engine,
  rule: RuleRef,
  sentence: string,
  about: string | null = null,
): string {
  if (rule.source === "rulebook" || rule.source === "haunt") return sentence;
  if (rule.source === "card" && rule.card === about) return sentence;
  return `${describeRule(engine, rule)}: ${sentence}`;
}

const STACK: Record<CardType, string> = {
  event: "event stack",
  item: "item stack",
  omen: "omen stack",
};

const data = <T extends Json>(event: GameEvent): T => event.data as T;

/** One event in plain language, or null for bookkeeping another event in the
 *  same write already tells (a drawn card's gain, a trade's two hand-overs). */
export function describeEvent(
  engine: Engine,
  state: GameState,
  event: GameEvent,
): string | null {
  const words = wordsFor(engine, state);
  const own =
    event.rule.source === "card"
      ? engine.behaviours.cards[event.rule.card]?.describe?.[event.type]
      : undefined;
  if (own) return withRule(engine, event.rule, `${own(event, words)}.`);

  const who = (seat: number) => words.explorer(seat);
  const sentence = (text: string, about: string | null = null) =>
    withRule(engine, event.rule, `${text}.`, about);

  switch (event.type) {
    case "game-started":
      return sentence(
        `The game begins. ${who(data<{ first: number }>(event).first)} goes first`,
      );
    case "turn-started":
      return sentence(`${who(data<{ seat: number }>(event).seat)}'s turn`);
    case "turn-ended": {
      const d = data<{ seat: number; room: string }>(event);
      return sentence(
        `${who(d.seat)} ends the turn in the ${words.room(d.room)}`,
      );
    }
    case "turn-cut-short":
      return sentence(
        `${who(data<{ seat: number }>(event).seat)}'s turn ends at once`,
      );
    case "ready":
      return sentence(`${who(data<{ seat: number }>(event).seat)} is ready`);
    case "forced":
      return sentence(
        `${data<{ label: string }>(event).label} (the only choice)`,
      );
    case "left":
      return null;
    case "entered": {
      const d = data<{ seat: number; room: string; moved: boolean }>(event);
      return sentence(
        d.moved
          ? `${who(d.seat)} enters the ${words.room(d.room)}`
          : `${who(d.seat)} is put in the ${words.room(d.room)}`,
      );
    }
    case "discovered": {
      const d = data<{ seat: number; room: string }>(event);
      return sentence(`${who(d.seat)} discovers the ${words.room(d.room)}`);
    }
    case "movement-ended":
      return sentence(
        `${who(data<{ seat: number }>(event).seat)} can't move any further this turn`,
      );
    case "card-drawn": {
      const d = data<{ seat: number; card: string; type: CardType }>(event);
      return sentence(
        `${who(d.seat)} draws ${d.type === "event" ? "the event" : `the ${d.type}`} ${words.card(d.card)}`,
        d.card,
      );
    }
    case "card-gained": {
      const d = data<{ seat: number; card: string; by: GainedBy }>(event);
      const gained: Record<GainedBy, string | null> = {
        drawn: null,
        traded: null,
        kept: `${who(d.seat)} keeps the ${words.card(d.card)}`,
        "picked-up": `${who(d.seat)} picks up the ${words.card(d.card)}`,
        given: `${who(d.seat)} is given the ${words.card(d.card)}`,
      };
      const text = gained[d.by];
      return text === null ? null : sentence(text, d.card);
    }
    case "card-lost": {
      const d = data<{
        seat: number;
        card: string;
        destination: CardDestination;
      }>(event);
      const text = lostText(engine, words, d.seat, d.card, d.destination);
      return text === null ? null : sentence(text, d.card);
    }
    case "card-marked": {
      const d = data<{ card: string; name: string; value: number | boolean }>(
        event,
      );
      return sentence(
        `The ${words.card(d.card)}'s ${d.name} is now ${String(d.value)}`,
        d.card,
      );
    }
    case "card-used": {
      const d = data<{ seat: number; card: string }>(event);
      return sentence(`${who(d.seat)} uses the ${words.card(d.card)}`, d.card);
    }
    case "ongoing-ended": {
      const d = data<{ card: string }>(event);
      return sentence(`The ${words.card(d.card)} ends`, d.card);
    }
    case "traded": {
      const d = data<{
        from: number;
        to: number;
        give: string | null;
        take: string | null;
      }>(event);
      const give = d.give === null ? null : `the ${words.card(d.give)}`;
      const take = d.take === null ? null : `the ${words.card(d.take)}`;
      if (give && take)
        return sentence(
          `${who(d.from)} trades ${give} to ${who(d.to)} for ${take}`,
        );
      return give
        ? sentence(`${who(d.from)} gives ${who(d.to)} ${give}`)
        : sentence(`${who(d.to)} gives ${who(d.from)} ${take ?? ""}`);
    }
    case "trade-declined": {
      const d = data<{ from: number; to: number }>(event);
      return sentence(`${who(d.to)} declines ${who(d.from)}'s trade`);
    }
    case "trait-changed": {
      const d = data<{ seat: number; trait: Trait; spaces: number }>(event);
      if (d.spaces === 0)
        return sentence(
          `${who(d.seat)}'s ${traitName(d.trait)} can't go any further`,
        );
      return sentence(
        `${who(d.seat)} ${d.spaces > 0 ? "gains" : "loses"} ${Math.abs(d.spaces)} ${traitName(d.trait)}`,
      );
    }
    case "damaged": {
      const d = data<{
        seat: number;
        damage: string;
        split: { [trait: string]: number };
      }>(event);
      const total = Object.values(d.split).reduce((a, b) => a + b, 0);
      const parts = Object.entries(d.split)
        .filter(([, n]) => n > 0)
        .map(([trait, n]) => `${n} ${traitName(trait as Trait)}`);
      return sentence(
        `${who(d.seat)} takes ${total} ${d.damage} damage${parts.length > 0 ? `: ${parts.join(" and ")}` : ""}`,
      );
    }
    case "damage-prevented": {
      const d = data<{ seat: number; damage: string }>(event);
      return sentence(`${who(d.seat)} takes no ${d.damage} damage`);
    }
    case "rolled": {
      const d = data<{
        seat: number;
        spec: RollSpec;
        dice: number[];
        named: number | null;
        bonus: number;
        result: number;
      }>(event);
      const how =
        d.named === null
          ? `rolls ${d.result}${d.dice.length > 0 ? ` (dice ${d.dice.join(", ")}${d.bonus ? `, +${d.bonus}` : ""})` : ""}`
          : `names the result: ${d.result}`;
      return sentence(`${who(d.seat)}'s ${rollName(d.spec)}: ${how}`);
    }
    case "deck-empty":
      return sentence(
        `The ${STACK[data<{ type: CardType }>(event).type]} is empty`,
      );
    case "deck-stacked": {
      const d = data<{ seat: number; type: CardType; card: string }>(event);
      return sentence(
        `${who(d.seat)} puts a chosen card on top of the ${STACK[d.type]}`,
      );
    }
    case "room-stack-seen":
      return sentence(
        `${who(data<{ seat: number }>(event).seat)} looks at the top room tile`,
      );
    case "search-found-nothing":
      return sentence(
        `${who(data<{ seat: number }>(event).seat)} finds nothing to search`,
      );
    case "token-placed":
    case "token-removed": {
      const d = data<{ token: string; room: string }>(event);
      const name = engine.catalog.tokens[d.token].name;
      return sentence(
        event.type === "token-placed"
          ? `The ${name} token is placed in the ${words.room(d.room)}`
          : `The ${name} token is removed from the ${words.room(d.room)}`,
      );
    }
    case "haunt-held-off": {
      const d = data<{ seat: number; result: number; omens: number }>(event);
      return sentence(
        `${who(d.seat)} rolls ${d.result} for the haunt, not under the ${d.omens} omens drawn: the haunt holds off`,
      );
    }
    case "haunt-revealed": {
      const d = data<{
        seat: number;
        result: number;
        omens: number;
        haunt: number;
      }>(event);
      return sentence(
        `${who(d.seat)} rolls ${d.result} for the haunt, under the ${d.omens} omens drawn: haunt ${d.haunt} begins`,
      );
    }
  }
  throw new Error(`No description for the event type ${event.type}`);
}

function lostText(
  engine: Engine,
  words: Words,
  seat: number,
  card: string,
  where: CardDestination,
): string | null {
  const who = words.explorer(seat);
  const name = words.card(card);
  switch (where.to) {
    case "discard":
      return `${who} discards the ${name}`;
    case "deck":
      return `${who} puts the ${name} back in the ${STACK[engine.catalog.cards[card].type]}, which is shuffled`;
    case "room":
      return `${who} leaves the ${name} in the ${words.room(where.room)}`;
    case "explorer":
      return null;
  }
}

/** What a pending decision asks, and of whom. */
export function describeDecision(
  engine: Engine,
  state: GameState,
  decision: Decision,
): string {
  const words = wordsFor(engine, state);
  const ask = (text: string) => withRule(engine, decision.rule, text);
  switch (decision.kind) {
    case "turn": {
      const p = decision.params as { seat: number };
      return ask(`${words.explorer(p.seat)}'s turn: what next?`);
    }
    case "rotation": {
      const p = decision.params as { seat: number; tile: string };
      return ask(
        `${words.explorer(p.seat)}: which way should the ${words.room(p.tile)} face?`,
      );
    }
    case "trade-offer": {
      const p = decision.params as { from: number; to: number };
      return ask(
        `${words.explorer(p.to)}: accept ${words.explorer(p.from)}'s trade?`,
      );
    }
    case "split-damage": {
      const p = decision.params as {
        seat: number;
        damage: string;
        amount: number;
      };
      return ask(
        `${words.explorer(p.seat)}: how should ${p.amount} ${p.damage} damage be split?`,
      );
    }
    case "choose-one": {
      const p = decision.params as { seat: number };
      return ask(`${words.explorer(p.seat)}: choose one`);
    }
    case "roll-before": {
      const p = decision.params as { seat: number; spec: RollSpec };
      return ask(
        `${words.explorer(p.seat)}: use something before the ${rollName(p.spec)}?`,
      );
    }
    case "roll-after": {
      const p = decision.params as { seat: number; spec: RollSpec };
      return ask(
        `${words.explorer(p.seat)}: keep the ${rollName(p.spec)}, or reroll?`,
      );
    }
  }
  throw new Error(`No description for the decision kind ${decision.kind}`);
}
