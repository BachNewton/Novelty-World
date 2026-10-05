import type {
  CardType,
  Edge,
  FigureId,
  FloorId,
  GameEvent,
  Json,
  Role,
  Side,
  Trait,
  TurnKind,
} from "../types";
import type { Attacker } from "./combat";
import type { CardDestination, ChosenBy, GainedBy } from "./effects";
import type { Harm } from "./questions";
import type { RollSpec, Words } from "./sources";
import type { Engine } from "./step-loop";
import {
  viewExplorer,
  type EventView,
  type FigureView,
  type GameView,
  type RuleView,
} from "./view";
import { FLOOR_NAMES, sideName } from "./board";

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
    case "movement":
      return "movement roll";
    case "attack":
      return spec.dice === null
        ? `${traitName(spec.trait)} ${spec.role === "attacker" ? "attack" : "defence"} roll`
        : `${traitName(spec.trait)} ${spec.dice} attack roll`;
  }
}

/** The rule's source, by name. */
export function describeRule(engine: Engine, rule: RuleView): string {
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
      return rule.section === undefined
        ? `Haunt ${rule.haunt}`
        : `Haunt ${rule.haunt}, ${rule.section}`;
    case "scenario":
      return "Scenario";
  }
}

function figureIn(view: GameView, figure: FigureId): FigureView {
  const found = view.figures[figure] as FigureView | undefined;
  if (!found) throw new Error(`There is no figure ${figure}`);
  return found;
}

function wordsFor(engine: Engine, view: GameView): Words {
  const { rooms, cards } = engine.catalog;
  return {
    figure: (figure) => figureIn(view, figure).name,
    seat: (seat) => viewExplorer(view, seat)?.name ?? view.seats[seat].name,
    room: (room) => rooms[room].name,
    card: (card) => cards[card].name,
  };
}

/** Prefixes a sentence with the room, card or token rule behind it, unless the sentence is about that card already. */
function withRule(
  engine: Engine,
  rule: RuleView,
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

const TURN_WORDS: Record<TurnKind, string> = {
  explorer: "turn",
  traitor: "traitor turn",
  monster: "monster turn",
};

/** The name a haunt gives one of its counters or secrets. */
function hauntName(
  engine: Engine,
  view: GameView,
  kind: "counters" | "secrets",
  id: string,
): string {
  const haunt = view.haunt === null ? undefined : engine.haunts[view.haunt.number];
  const name = haunt?.[kind][id]?.name;
  if (name === undefined) throw new Error(`The haunt has no ${kind} entry ${id}`);
  return name;
}

const STACK: Record<CardType, string> = {
  event: "event stack",
  item: "item stack",
  omen: "omen stack",
};

const data = <T extends Json>(event: Pick<GameEvent, "data">): T =>
  event.data as T;

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
  view: GameView,
  event: EventView,
): string | null {
  const words = wordsFor(engine, view);
  const own =
    event.rule.source === "card"
      ? engine.behaviours.cards[event.rule.card]?.describe?.[event.type]
      : event.rule.source === "haunt"
        ? engine.haunts[event.rule.haunt]?.behaviour.describe?.[event.type]
        : undefined;
  if (own) return withRule(engine, event.rule, `${own(event, words)}.`);

  const who = (figure: FigureId) => words.figure(figure);
  // A seat a view keeps back (whose monster turn it is, who was put a
  // decision that would give a side away) is "a player".
  const seat = (n: number | undefined) =>
    n === undefined ? "A player" : words.seat(n);
  const sentence = (text: string, about: string | null = null) =>
    withRule(engine, event.rule, `${text}.`, about);

  switch (event.type) {
    case "game-started":
      return sentence(
        `The game begins. ${seat(data<{ first: number }>(event).first)} goes first`,
      );
    case "turn-started": {
      const d = data<{ seat?: number; kind: TurnKind }>(event);
      return sentence(`${seat(d.seat)}'s ${TURN_WORDS[d.kind]}`);
    }
    case "turn-inserted": {
      const d = data<{ seat?: number; kind: TurnKind }>(event);
      return sentence(
        `${seat(d.seat)} takes an extra ${TURN_WORDS[d.kind]} next`,
      );
    }
    case "turn-ended": {
      const d = data<{ seat?: number; room: string | null }>(event);
      return sentence(
        d.room === null
          ? `${seat(d.seat)} ends the turn`
          : `${seat(d.seat)} ends the turn in the ${words.room(d.room)}`,
      );
    }
    case "turn-cut-short":
      return sentence(
        `${seat(data<{ seat?: number }>(event).seat)}'s turn ends at once`,
      );
    case "ready":
      return sentence(`${seat(data<{ seat: number }>(event).seat)} is ready`);
    case "forced": {
      // Its one choice comes only to the seat it was put to.
      const d = data<{ seat?: number; label?: string }>(event);
      return d.label === undefined
        ? sentence(`${seat(d.seat)} has only one choice`)
        : sentence(`${seat(d.seat)}: ${d.label} (the only choice)`);
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
        custody: `${who(d.figure)} takes custody of the ${words.card(d.card)}, left where its explorer died`,
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
        harm: Harm | null;
        near: boolean;
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
      if (d.harm !== null || d.attacker === null) return sentence(beaten);
      return sentence(
        d.near
          ? `${beaten}, but ${attacker} takes no damage`
          : `${beaten}, but ${attacker} attacked from another room and takes no damage`,
      );
    }
    case "stunned":
      return sentence(
        `${who(data<{ figure: FigureId }>(event).figure)} is stunned`,
      );
    case "spawned": {
      const d = data<{
        definition: string;
        figures: FigureId[];
        room: string;
        short: number;
      }>(event);
      const name = engine.catalog.figures[d.definition].name;
      const where = `in the ${words.room(d.room)}`;
      const appear =
        d.figures.length === 0
          ? `No ${name} can appear ${where}`
          : d.figures.length === 1
            ? `${list(d.figures.map(who))} appears ${where}`
            : `${list(d.figures.map(who))} appear ${where}`;
      return sentence(
        d.short > 0
          ? `${appear}: the supply of ${name} tokens has run out`
          : appear,
      );
    }
    case "turn-missed":
      return sentence(
        `${who(data<{ figure: FigureId }>(event).figure)} is stunned and misses this turn`,
      );
    case "recovered":
      return sentence(
        `${who(data<{ figure: FigureId }>(event).figure)} recovers from being stunned`,
      );
    case "acting": {
      const d = data<{ figure: FigureId; room: string }>(event);
      return sentence(
        `${who(d.figure)} acts, from the ${words.room(d.room)}`,
      );
    }
    case "side-chosen": {
      const d = data<{ figure: FigureId; room: string; side: Edge }>(event);
      return sentence(
        `${who(d.figure)} stops on the ${sideName(view.board, d.room, d.side)} side of the ${words.room(d.room)}`,
      );
    }
    case "text-ignored": {
      const d = data<{ figure: FigureId; what: string }>(event);
      return sentence(`${who(d.figure)} ignores ${d.what}`);
    }
    case "traits-fixed": {
      const d = data<{ figure: FigureId; trait: Trait }>(event);
      return sentence(
        `${who(d.figure)}'s ${traitName(d.trait)} doesn't change`,
      );
    }
    case "trait-known": {
      const d = data<{ definition: string; trait: Trait; value: number }>(
        event,
      );
      return sentence(
        `Everyone now knows the ${engine.catalog.figures[d.definition].name}'s ${traitName(d.trait)}: ${d.value}`,
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
        (t) => `${traitName(t)} ${String(figureIn(view, d.figure).traits[t])}`,
      );
      const parts = [
        ...(d.room === null ? [] : [`starts in the ${words.room(d.room)}`]),
        ...(traits.length === 0 ? [] : [`starts with ${list(traits)}`]),
      ];
      return sentence(`${who(d.figure)} ${parts.join(" and ")}`);
    }
    case "slowed": {
      const d = data<{ figure: FigureId; room: string; extra: number }>(event);
      return sentence(
        `${who(d.figure)} spends ${d.extra} more ${d.extra === 1 ? "space" : "spaces"} of movement to get past opponents in the ${words.room(d.room)}`,
      );
    }
    case "died": {
      const d = data<{
        figure: FigureId;
        trait: Trait | null;
        cause: RuleView;
        killer: FigureId | null;
        room: string;
      }>(event);
      const how =
        d.trait === null ? "" : ` as ${traitName(d.trait)} reaches the skull`;
      const by =
        d.killer === null
          ? d.cause.source === "rulebook"
            ? ""
            : ` (${describeRule(engine, d.cause)})`
          : `, killed by ${who(d.killer)}`;
      return sentence(
        `${who(d.figure)} dies in the ${words.room(d.room)}${how}${by}`,
      );
    }
    case "side-set": {
      // A side set in secret comes without it for the seats it is kept from.
      const d = data<{
        seat: number;
        side?: Side;
        roles?: Role[];
        secret: boolean;
      }>(event);
      if (d.side === undefined || d.roles === undefined)
        return sentence(`${seat(d.seat)} is given a side in secret`);
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
    case "haunt-unbuilt":
      return sentence(
        `Haunt ${data<{ haunt: number }>(event).haunt} isn't built yet, so the game stops here`,
      );
    case "traitor-tie": {
      const d = data<{ tied: number[]; seat: number }>(event);
      return sentence(
        `${list(d.tied.map(seat))} tie to be the traitor; it goes to ${seat(d.seat)}, ${d.seat === view.haunt?.revealer ? "who revealed the haunt" : "nearest the revealer's left"}`,
      );
    }
    case "sides-dealt":
      return sentence(
        "The traitor is dealt in secret: each player looks at their own token",
      );
    case "haunt-setup":
      return sentence(
        data<{ side: "traitor" | "heroes" }>(event).side === "traitor"
          ? "The traitor carries out the haunt's setup"
          : "The heroes carry out the haunt's setup",
      );
    case "secret-set": {
      // Who knows it is left out where it would give away a hidden side.
      const d = data<{ secret: string; knownBy?: number[] | null }>(event);
      const name = hauntName(engine, view, "secrets", d.secret);
      if (d.knownBy === undefined)
        return sentence(`The ${name} is written down in secret`);
      const who =
        d.knownBy === null ? "everyone" : list(d.knownBy.map(seat)) || "no one";
      return sentence(`The ${name} is written down, known to ${who}`);
    }
    case "secret-revealed": {
      const d = data<{ secret: string }>(event);
      const secret = view.haunt?.secrets.find((s) => s.id === d.secret);
      if (!secret?.known)
        throw new Error(`The haunt secret ${d.secret} isn't known to this view`);
      return sentence(
        `The ${hauntName(engine, view, "secrets", d.secret)} is shown to everyone: ${JSON.stringify(secret.value)}`,
      );
    }
    case "counter-changed": {
      const d = data<{ counter: string; value: number }>(event);
      return sentence(
        `${capital(hauntName(engine, view, "counters", d.counter))}: ${d.value}`,
      );
    }
    case "status-added":
    case "status-removed": {
      const d = data<{ figure: FigureId; status: string }>(event);
      const name = engine.behaviours.statuses[d.status]?.name;
      if (name === undefined)
        throw new Error(`The status ${d.status} has no name to describe it by`);
      return sentence(
        event.type === "status-added"
          ? `${who(d.figure)} is now ${name}`
          : `${who(d.figure)} is no longer ${name}`,
      );
    }
    case "game-over": {
      const d = data<{ winners: number[]; side: Side | null; tied: boolean }>(
        event,
      );
      const winners =
        d.side === "heroes"
          ? "The heroes win"
          : d.side === "traitor"
            ? `The traitor's side wins: ${list(d.winners.map(seat))}`
            : d.winners.length === 0
              ? "No one wins"
              : `${list(d.winners.map(seat))} ${d.winners.length === 1 ? "wins" : "win"}`;
      return sentence(
        d.tied
          ? `${winners} (both sides' goals were met at once, on their turn)`
          : winners,
      );
    }
    case "not-moved": {
      const d = data<{ figure: FigureId; room: string }>(event);
      return sentence(
        `${who(d.figure)} can't be moved out of the ${words.room(d.room)}`,
      );
    }
    case "escaped": {
      const d = data<{
        figure: FigureId;
        room: string;
        marker: string | null;
        counter: string | null;
        value: number | null;
        of: string | null;
      }>(event);
      const room = words.room(d.room);
      const tile = engine.catalog.rooms[d.room];
      const way =
        tile.windows.length > 0
          ? `through the ${room}'s window`
          : tile.frontDoor !== null
            ? `through the ${room}'s front door`
            : `out of the ${room}`;
      const secret =
        d.of === null
          ? undefined
          : view.haunt?.secrets.find((s) => s.id === d.of);
      const target =
        secret === undefined ? "" : ` of ${secret.known ? JSON.stringify(secret.value) : "?"}`;
      const marked =
        d.marker === null
          ? ""
          : `, and the ${engine.catalog.tokens[d.marker].name} token left there marks it used`;
      const counted =
        d.counter === null
          ? ""
          : `: ${String(d.value)}${target} ${hauntName(engine, view, "counters", d.counter)}`;
      return sentence(`${who(d.figure)} escapes from the house ${way}${marked}${counted}`);
    }
    case "rooms-short":
      return sentence("No more of the rooms the haunt asks for can be put in the house");
    case "room-stack-shuffled":
      return sentence("The room stack is shuffled");
    case "replacement-declined": {
      const d = data<{ definition: string }>(event);
      return sentence(
        `No other ${engine.catalog.figures[d.definition].name} is brought in: the chance is lost`,
      );
    }
    case "task-result": {
      const d = data<{
        figure: FigureId;
        task: string;
        success: boolean;
        token: string | null;
      }>(event);
      const won =
        d.token === null ? "" : `, and takes a ${engine.catalog.tokens[d.token].name} token`;
      return sentence(
        d.success
          ? `${who(d.figure)}'s roll to ${d.task} succeeds${won}`
          : `${who(d.figure)}'s roll to ${d.task} fails`,
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
    case "aside":
      return where.room === null
        ? `${who}'s ${name} is set aside, out of the game`
        : `${who}'s ${name} stays in the ${words.room(where.room)}, for the next explorer to come in`;
  }
}

/** The figure making an attack. Only a figure's attack asks its attacker
 *  anything: a card's attacker has no choices. */
function attackingFigure(attacker: Attacker): FigureId {
  if (attacker.kind !== "figure")
    throw new Error("A card's attacker is never asked a decision");
  return attacker.figure;
}

/** A decision's question: its kind, its parameters and the rule that raised
 *  it, which a view holds only for the seats it is put to. */
export interface Question {
  kind: string;
  params: Json;
  rule: RuleView;
}

/** What a pending decision asks, and of whom. */
export function describeDecision(
  engine: Engine,
  view: GameView,
  decision: Question,
): string {
  const words = wordsFor(engine, view);
  const ask = (text: string) => withRule(engine, decision.rule, text);
  const chooser = (by: ChosenBy) =>
    "seat" in by ? words.seat(by.seat) : words.figure(by.figure);
  switch (decision.kind) {
    case "turn": {
      const p = decision.params as { seat: number };
      const turn = view.turn;
      if (turn?.kind !== "monster")
        return ask(`${words.seat(p.seat)}'s turn: what next?`);
      return ask(
        turn.acting === null
          ? `${words.seat(p.seat)}'s monster turn: which monster acts next?`
          : `${words.seat(p.seat)}'s monster turn: what next for ${words.figure(turn.acting)}?`,
      );
    }
    case "rotation": {
      const p = decision.params as { figure: FigureId; tile: string };
      return ask(
        `${words.figure(p.figure)}: which way should the ${words.room(p.tile)} face?`,
      );
    }
    case "place-tile": {
      const p = decision.params as ChosenBy & { tile: string };
      return ask(`${chooser(p)}: where should the ${words.room(p.tile)} go?`);
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
      const p = decision.params as ChosenBy & { prompt?: string };
      return ask(`${chooser(p)}: ${p.prompt ?? "choose one"}`);
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
    case "replace-figure": {
      const p = decision.params as { definition: string };
      return ask(
        `One of the ${engine.catalog.figures[p.definition].name}s has left play: bring in another now, or lose the chance?`,
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

/** What everyone else sees of a decision put to other seats: whom the game
 *  is waiting on, and what kind of question it is. */
export function describeWaiting(
  engine: Engine,
  view: GameView,
  decision: {
    seats: number[];
    unnamed: boolean;
    answered: number[];
    kind: string;
  },
): string {
  const words = wordsFor(engine, view);
  const waiting = decision.seats
    .filter((s) => !decision.answered.includes(s))
    .map(words.seat);
  // Seats the view keeps back are waited on too, unnamed.
  if (decision.unnamed) waiting.push(waiting.length === 0 ? "a player" : "another player");
  return `Waiting for ${list(waiting)} to decide (${decision.kind})`;
}
