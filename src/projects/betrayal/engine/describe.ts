import type {
  CardType,
  Decision,
  Edge,
  FigureId,
  FloorId,
  GameEvent,
  GameState,
  Json,
  Role,
  RuleRef,
  Side,
  Trait,
} from "../types";
import type { Attacker } from "./combat";
import type { CardDestination, GainedBy } from "./effects";
import type { RollSpec, Words } from "./sources";
import type { Engine } from "./step-loop";
import { FLOOR_NAMES } from "./board";
import { explorerOf, figureName } from "./figures";
import { traitValue } from "./questions";

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
    case "attack":
      return spec.dice === null
        ? `${traitName(spec.trait)} ${spec.role === "attacker" ? "attack" : "defence"} roll`
        : `${traitName(spec.trait)} ${spec.dice} attack roll`;
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
    case "scenario":
      return "Scenario";
  }
}

function wordsFor(engine: Engine, state: GameState): Words {
  const { rooms, cards } = engine.catalog;
  return {
    figure: (figure) => figureName(engine.catalog, state, figure),
    seat: (seat) => {
      const explorer = explorerOf(state, seat);
      return explorer === null
        ? state.seats[seat].name
        : figureName(engine.catalog, state, explorer);
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

const SIDE_WORDS: Record<Side, string> = {
  heroes: "is a hero",
  traitor: "is on the traitor's side",
  neutral: "is on no one's side",
};

const STACK: Record<CardType, string> = {
  event: "event stack",
  item: "item stack",
  omen: "omen stack",
};

const data = <T extends Json>(event: GameEvent): T => event.data as T;

const capital = (text: string) => `${text[0].toUpperCase()}${text.slice(1)}`;

/** "a", "a and b", "a, b and c". */
function list(items: string[]): string {
  return items.length < 2
    ? items.join("")
    : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

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

  const who = (figure: FigureId) => words.figure(figure);
  const seat = (n: number) => words.seat(n);
  const sentence = (text: string, about: string | null = null) =>
    withRule(engine, event.rule, `${text}.`, about);

  switch (event.type) {
    case "game-started":
      return sentence(
        `The game begins. ${seat(data<{ first: number }>(event).first)} goes first`,
      );
    case "turn-started":
      return sentence(`${seat(data<{ seat: number }>(event).seat)}'s turn`);
    case "turn-ended": {
      const d = data<{ seat: number; room: string | null }>(event);
      return sentence(
        d.room === null
          ? `${seat(d.seat)} ends the turn`
          : `${seat(d.seat)} ends the turn in the ${words.room(d.room)}`,
      );
    }
    case "turn-cut-short":
      return sentence(
        `${seat(data<{ seat: number }>(event).seat)}'s turn ends at once`,
      );
    case "ready":
      return sentence(`${seat(data<{ seat: number }>(event).seat)} is ready`);
    case "forced": {
      const d = data<{ seat: number; label: string }>(event);
      return sentence(`${seat(d.seat)}: ${d.label} (the only choice)`);
    }
    case "left":
      return null;
    case "entered": {
      const d = data<{ figure: FigureId; room: string; moved: boolean }>(event);
      return sentence(
        d.moved
          ? `${who(d.figure)} enters the ${words.room(d.room)}`
          : `${who(d.figure)} is put in the ${words.room(d.room)}`,
      );
    }
    case "crossed": {
      const d = data<{ figure: FigureId; room: string }>(event);
      return sentence(`${who(d.figure)} crosses the ${words.room(d.room)}`);
    }
    case "discovered": {
      const d = data<{ figure: FigureId; room: string }>(event);
      return sentence(`${who(d.figure)} discovers the ${words.room(d.room)}`);
    }
    case "stayed": {
      const d = data<{ figure: FigureId; room: string }>(event);
      return sentence(
        `${who(d.figure)} stays in the ${words.room(d.room)} and moves no further this turn`,
      );
    }
    case "movement-ended":
      return sentence(
        `${who(data<{ figure: FigureId }>(event).figure)} can't move any further this turn`,
      );
    case "card-drawn": {
      const d = data<{ figure: FigureId; card: string; type: CardType }>(event);
      return sentence(
        `${who(d.figure)} draws ${d.type === "event" ? "the event" : `the ${d.type}`} ${words.card(d.card)}`,
        d.card,
      );
    }
    case "card-gained": {
      const d = data<{ figure: FigureId; card: string; by: GainedBy }>(event);
      const gained: Record<GainedBy, string | null> = {
        drawn: null,
        traded: null,
        kept: `${who(d.figure)} keeps the ${words.card(d.card)}`,
        "picked-up": `${who(d.figure)} picks up the ${words.card(d.card)}`,
        given: `${who(d.figure)} is given the ${words.card(d.card)}`,
        stolen: `${who(d.figure)} steals the ${words.card(d.card)}`,
      };
      const text = gained[d.by];
      return text === null ? null : sentence(text, d.card);
    }
    case "card-lost": {
      const d = data<{
        figure: FigureId;
        card: string;
        destination: CardDestination;
      }>(event);
      const text = lostText(engine, words, d.figure, d.card, d.destination);
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
      const d = data<{ figure: FigureId; card: string }>(event);
      return sentence(`${who(d.figure)} uses the ${words.card(d.card)}`, d.card);
    }
    case "ongoing-ended": {
      const d = data<{ card: string }>(event);
      return sentence(`The ${words.card(d.card)} ends`, d.card);
    }
    case "traded": {
      const d = data<{
        from: FigureId;
        to: FigureId;
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
      const d = data<{ from: FigureId; to: FigureId }>(event);
      return sentence(`${who(d.to)} declines ${who(d.from)}'s trade`);
    }
    case "trait-changed": {
      const d = data<{ figure: FigureId; trait: Trait; spaces: number }>(event);
      if (d.spaces === 0)
        return sentence(
          `${who(d.figure)}'s ${traitName(d.trait)} can't go any further`,
        );
      return sentence(
        `${who(d.figure)} ${d.spaces > 0 ? "gains" : "loses"} ${Math.abs(d.spaces)} ${traitName(d.trait)}`,
      );
    }
    case "damaged": {
      const d = data<{
        figure: FigureId;
        damage: string;
        split: { [trait: string]: number };
      }>(event);
      const total = Object.values(d.split).reduce((a, b) => a + b, 0);
      const parts = Object.entries(d.split)
        .filter(([, n]) => n > 0)
        .map(([trait, n]) => `${n} ${traitName(trait as Trait)}`);
      return sentence(
        `${who(d.figure)} takes ${total} ${d.damage} damage${parts.length > 0 ? `: ${parts.join(" and ")}` : ""}`,
      );
    }
    case "damage-converted": {
      const d = data<{ figure: FigureId; from: string; to: string }>(event);
      return sentence(
        `${who(d.figure)} takes the ${d.from} damage as ${d.to} damage instead`,
      );
    }
    case "damage-prevented": {
      const d = data<{ figure: FigureId; damage: string }>(event);
      return sentence(`${who(d.figure)} takes no ${d.damage} damage`);
    }
    case "rolled": {
      const d = data<{
        figure: FigureId;
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
      // A card's attacker's dice are thrown for it by a player.
      if (d.spec.kind === "attack" && d.spec.dice !== null)
        return sentence(
          `${who(d.figure)} throws the dice for the ${rollName(d.spec)}: ${how}`,
        );
      return sentence(`${who(d.figure)}'s ${rollName(d.spec)}: ${how}`);
    }
    case "attacked": {
      const d = data<{
        attacker: Attacker;
        defender: FigureId;
        roller: FigureId;
      }>(event);
      return sentence(
        d.attacker.kind === "figure"
          ? `${who(d.attacker.figure)} attacks ${who(d.defender)}`
          : `${who(d.roller)} makes a ${traitName(d.attacker.trait)} ${d.attacker.dice} attack against ${who(d.defender)} on the card's behalf`,
      );
    }
    case "attack-outcome": {
      const d = data<{
        attacker: FigureId | null;
        defender: FigureId;
        attackResult: number;
        defenceResult: number;
        loser: "attacker" | "defender" | null;
        damage: { kind: string; points: number } | null;
      }>(event);
      const attacker = d.attacker === null ? "the attack" : who(d.attacker);
      const defender = who(d.defender);
      const score = (a: number, b: number) => `${a} to ${b}`;
      if (d.loser === null)
        return sentence(
          `A tie, ${score(d.attackResult, d.defenceResult)}: no one is hurt`,
        );
      if (d.loser === "defender")
        return sentence(
          `${capital(attacker)} beats ${defender}, ${score(d.attackResult, d.defenceResult)}`,
        );
      const beaten = `${defender} beats ${attacker}, ${score(d.defenceResult, d.attackResult)}`;
      return sentence(
        d.damage === null && d.attacker !== null
          ? `${beaten}, but ${attacker} attacked from another room and takes no damage`
          : beaten,
      );
    }
    case "deck-empty":
      return sentence(
        `The ${STACK[data<{ type: CardType }>(event).type]} is empty`,
      );
    case "deck-stacked": {
      const d = data<{ figure: FigureId; type: CardType; card: string }>(event);
      return sentence(
        `${who(d.figure)} puts a chosen card on top of the ${STACK[d.type]}`,
      );
    }
    case "room-stack-seen":
      return sentence(
        `${who(data<{ figure: FigureId }>(event).figure)} looks at the top room tile`,
      );
    case "search-found-nothing":
      return sentence(
        `${who(data<{ figure: FigureId }>(event).figure)} finds nothing to search`,
      );
    case "token-placed":
    case "token-removed": {
      const d = data<{ token: string; room: string; wall?: Edge[] | null }>(
        event,
      );
      const name = engine.catalog.tokens[d.token].name;
      const where = d.wall
        ? `on a ${d.wall.length === 2 ? "corner" : "wall"} of the ${words.room(d.room)}`
        : `in the ${words.room(d.room)}`;
      return sentence(
        event.type === "token-placed"
          ? `The ${name} token is placed ${where}`
          : `The ${name} token is removed from the ${words.room(d.room)}`,
      );
    }
    case "room-placed": {
      const d = data<{ tile: string; floor: FloorId }>(event);
      return sentence(
        `The ${words.room(d.tile)} is put in the house, on the ${FLOOR_NAMES[d.floor]}`,
      );
    }
    case "room-moved": {
      const d = data<{ tile: string; from: FloorId; floor: FloorId }>(event);
      return sentence(
        d.from === d.floor
          ? `The ${words.room(d.tile)} moves elsewhere on the ${FLOOR_NAMES[d.floor]}, with everything in it`
          : `The ${words.room(d.tile)} moves to the ${FLOOR_NAMES[d.floor]}, with everything in it`,
      );
    }
    case "room-stayed":
      return sentence(
        `The ${words.room(data<{ tile: string }>(event).tile)} stays where it is`,
      );
    case "room-not-found":
      return sentence("No room tile is left that can go there");
    case "haunt-held-off": {
      const d = data<{ figure: FigureId; result: number; omens: number }>(event);
      return sentence(
        `${who(d.figure)} rolls ${d.result} for the haunt, not under the ${d.omens} omens drawn: the haunt holds off`,
      );
    }
    case "explorer-set-up": {
      const d = data<{ figure: FigureId; room: string | null; traits: Trait[] }>(
        event,
      );
      const traits = d.traits.map(
        (t) => `${traitName(t)} ${traitValue(engine, state, d.figure, t)}`,
      );
      const parts = [
        ...(d.room === null ? [] : [`starts in the ${words.room(d.room)}`]),
        ...(traits.length === 0 ? [] : [`starts with ${list(traits)}`]),
      ];
      return sentence(`${who(d.figure)} ${parts.join(" and ")}`);
    }
    case "side-set": {
      const d = data<{
        seat: number;
        side: Side;
        roles: Role[];
        secret: boolean;
      }>(event);
      const what = d.roles.includes("traitor")
        ? "is the traitor"
        : SIDE_WORDS[d.side];
      return sentence(
        `${seat(d.seat)} ${what}${d.secret ? ", which is kept secret" : ""}`,
      );
    }
    case "haunt-started": {
      const d = data<{
        number: number;
        revealer: number;
        omen: string;
        room: string;
      }>(event);
      return sentence(
        `Haunt ${d.number} begins, revealed by ${seat(d.revealer)} with the ${words.card(d.omen)} in the ${words.room(d.room)}`,
      );
    }
    case "haunt-revealed": {
      const d = data<{
        figure: FigureId;
        result: number;
        omens: number;
        haunt: number;
      }>(event);
      return sentence(
        `${who(d.figure)} rolls ${d.result} for the haunt, under the ${d.omens} omens drawn: haunt ${d.haunt} begins`,
      );
    }
  }
  throw new Error(`No description for the event type ${event.type}`);
}

function lostText(
  engine: Engine,
  words: Words,
  figure: FigureId,
  card: string,
  where: CardDestination,
): string | null {
  const who = words.figure(figure);
  const name = words.card(card);
  switch (where.to) {
    case "discard":
      return `${who} discards the ${name}`;
    case "deck":
      return `${who} puts the ${name} back in the ${STACK[engine.catalog.cards[card].type]}, which is shuffled`;
    case "room":
      return `${who} leaves the ${name} in the ${words.room(where.room)}`;
    case "figure":
      return null;
  }
}

/** The figure making an attack. Only a figure's attack asks its attacker
 *  anything: a card's attacker has no choices. */
function attackingFigure(attacker: Attacker): FigureId {
  if (attacker.kind !== "figure")
    throw new Error("A card's attacker is never asked a decision");
  return attacker.figure;
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
      return ask(`${words.seat(p.seat)}'s turn: what next?`);
    }
    case "rotation": {
      const p = decision.params as { figure: FigureId; tile: string };
      return ask(
        `${words.figure(p.figure)}: which way should the ${words.room(p.tile)} face?`,
      );
    }
    case "place-tile": {
      const p = decision.params as { figure: FigureId; tile: string };
      return ask(
        `${words.figure(p.figure)}: where should the ${words.room(p.tile)} go?`,
      );
    }
    case "trade-offer": {
      const p = decision.params as { from: FigureId; to: FigureId };
      return ask(
        `${words.figure(p.to)}: accept ${words.figure(p.from)}'s trade?`,
      );
    }
    case "split-damage": {
      const p = decision.params as {
        figure: FigureId;
        damage: string;
        amount: number;
      };
      return ask(
        `${words.figure(p.figure)}: how should ${p.amount} ${p.damage} damage be split?`,
      );
    }
    case "damage-kind": {
      const p = decision.params as {
        figure: FigureId;
        damage: string;
        points: number;
      };
      return ask(
        `${words.figure(p.figure)}: take ${p.points} ${p.damage} damage as it is, or change it?`,
      );
    }
    case "choose-one": {
      const p = decision.params as { figure: FigureId };
      return ask(`${words.figure(p.figure)}: choose one`);
    }
    case "roll-before": {
      const p = decision.params as { figure: FigureId; spec: RollSpec };
      return ask(
        `${words.figure(p.figure)}: use something before the ${rollName(p.spec)}?`,
      );
    }
    case "attack-mode": {
      const p = decision.params as { defender: FigureId; attacker: Attacker };
      return ask(
        `${words.figure(attackingFigure(p.attacker))}: how do you attack ${words.figure(p.defender)}?`,
      );
    }
    case "attack-steal": {
      const p = decision.params as { defender: FigureId; attacker: Attacker };
      return ask(
        `${words.figure(attackingFigure(p.attacker))}: deal the damage, or steal an item from ${words.figure(p.defender)} instead?`,
      );
    }
    case "roll-after": {
      const p = decision.params as { figure: FigureId; spec: RollSpec };
      return ask(
        `${words.figure(p.figure)}: keep the ${rollName(p.spec)}, or reroll?`,
      );
    }
  }
  throw new Error(`No description for the decision kind ${decision.kind}`);
}
