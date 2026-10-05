import type {
  CardType,
  Edge,
  FigureId,
  GameEvent,
  GameState,
  Json,
  RoomToken,
  RuleRef,
  Status,
  Step,
  Trait,
} from "../types";
import { beyondWall, roomAt } from "./board";
import { allFigures } from "./figures";
import type { CardDestination } from "./effects";
import type { Engine, StepHandler } from "./step-loop";
import type { Modifier } from "./questions";

// A rule source is anything in play whose text changes the game: a held or
// ongoing card, a room on the board, a token in a room, a status on a figure,
// the haunt being played. Its behaviour is code in the content catalogue;
// everything it does to the game goes through steps, so the game stays
// serializable.

/** Where a live source is, and who holds it. */
export interface Source {
  layer: Layer;
  /** "rulebook" for the rulebook's own conditions, such as its goal for
   *  every haunt. */
  kind: "room" | "card" | "token" | "status" | "haunt" | "rulebook";
  id: string;
  rule: RuleRef;
  /** The figure holding a card, or bearing a status, if any. */
  holder: FigureId | null;
  /** The room a room source is, a token sits in, or a card lies in. */
  room: string | null;
  /** For a token on a wall, the room on the wall's other side, if any. An
   *  figure in either room is at the token. */
  beside: string | null;
  /** The token itself, for a token source. */
  token: RoomToken | null;
  /** The status itself, for a status source. */
  status: Status | null;
}

/** The rulebook's order for conflicts: a card beats the rulebook (p. 12), a haunt beats everything (p. 17). */
export type Layer = "rulebook" | "room" | "card" | "haunt";
export const LAYERS: readonly Layer[] = ["rulebook", "room", "card", "haunt"];

/** The order of source kinds within a layer. */
const KIND_ORDER: readonly Source["kind"][] = [
  "rulebook",
  "room",
  "card",
  "token",
  "status",
  "haunt",
];

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** The order sources' modifiers apply in: by layer, then within a layer by
 *  source kind, then id, never by when a source came into play or where it
 *  sits in the state. Copies of one source (a status on two figures, a
 *  token in two rooms) go by the figure bearing it, then the room. */
export function sourceOrder(a: Source, b: Source): number {
  return (
    LAYERS.indexOf(a.layer) - LAYERS.indexOf(b.layer) ||
    KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
    compare(a.id, b.id) ||
    compare(a.holder ?? "", b.holder ?? "") ||
    compare(a.room ?? "", b.room ?? "")
  );
}

/** The layer a rule's own source belongs to: a status sits in the layer of
 *  the rule that applied it. */
export const LAYER_OF: Record<RuleRef["source"], Layer> = {
  rulebook: "rulebook",
  room: "room",
  card: "card",
  token: "card",
  haunt: "haunt",
  // A scenario only sets a game up and never changes an answer.
  scenario: "rulebook",
};

/** What a roll is, so effects can tell rolls apart. */
export type RollSpec =
  | { kind: "trait"; trait: Trait }
  | { kind: "dice"; count: number }
  | { kind: "haunt" }
  /** A roll for movement, of as many dice as the figure's Speed: a monster
   *  type's, at the start of the monster turn (p. 18). */
  | { kind: "movement" }
  /** One side's roll in an attack: not a trait roll, though it rolls a
   *  trait (p. 13). `card` is what the attacker attacks with (a weapon, the
   *  Ring). `dice` is set for an attacker a card stands in for ("a Might 4
   *  attack"): a player throws its dice, but the roll isn't theirs. */
  | {
      kind: "attack";
      trait: Trait;
      role: "attacker" | "defender";
      card: string | null;
      dice: number | null;
    };

export interface RollOption {
  timing: "before" | "after";
  /** It may be used on a roll its holder makes on another seat's turn,
   *  such as a defence roll. Other options are for its holder's own turn. */
  offTurn?: boolean;
  /** Whether this option can act on this roll. */
  applies: (state: GameState, figure: FigureId, roll: RollContext) => boolean;
  effect:
    | { kind: "add"; amount: number }
    /** Add dice to the roll, up to the most dice a roll may have. */
    | { kind: "dice"; amount: number }
    /** Name the result instead of rolling. */
    | { kind: "name"; min: number; max: number }
    /** Use a number already known instead of rolling, at most the roll's highest result. */
    | { kind: "number"; value: (state: GameState) => number }
    /** Reroll some dice: at most this many, or any number. */
    | { kind: "reroll"; max: number | null };
}

export interface RollContext {
  spec: RollSpec;
  /** The card or room whose rule asked for the roll. */
  rule: RuleRef;
  /** Dice the rule asking for this one roll adds or takes away. */
  extraDice: number;
}

export interface SourceAction {
  label: string;
  /** Who a card's action is offered to: its holder (the default), or any
   *  figure with the holder, who takes it without using the card (freeing
   *  the holder from the Webs). */
  offeredTo?: "holder" | "room";
  /** Offered even while its figure can't act, being the way out of what
   *  stops it (freeing a figure from the Webs). */
  whileUnable?: boolean;
  /** Whether the figure may take it now. Being offered is not enough: the action must also apply. */
  available: (
    state: GameState,
    figure: FigureId,
    source: Source,
    engine: Engine,
  ) => boolean;
  steps: (state: GameState, figure: FigureId, source: Source) => Step[];
}

export interface Reaction {
  event: string;
  when?: (
    state: GameState,
    event: GameEvent,
    source: Source,
    engine: Engine,
  ) => boolean;
  steps: (
    state: GameState,
    event: GameEvent,
    source: Source,
    engine: Engine,
  ) => Step[];
}

/** A predicate over the state, checked after every step (section 5 of the
 *  engine design): when it turns true it fires, ending the game for its
 *  winners or queueing its steps. */
export interface Condition {
  id: string;
  /** Fires at most once a game. Any other condition fires again each time
   *  it turns true after having stopped holding. */
  once?: boolean;
  /** The rule to name, where it is narrower than its source's (one section
   *  of a haunt). */
  rule?: RuleRef;
  holds: (state: GameState, source: Source, engine: Engine) => boolean;
  then:
    | {
        /** A goal: the game ends at once, and these seats win. */
        win: (state: GameState, source: Source, engine: Engine) => number[];
        /** Secrets shown to everyone as it is met. */
        reveal?: string[];
      }
    | { steps: (state: GameState, source: Source, engine: Engine) => Step[] };
}

export interface Behaviour {
  /** A card's effect when drawn: an event's whole text, or an omen's immediate effect. */
  onDraw?: (state: GameState, figure: FigureId, engine: Engine) => Step[];
  /** When a figure gets an item or omen, however: drawing, picking up, trading or stealing. */
  onGain?: (state: GameState, figure: FigureId) => Step[];
  /** When its holder loses it, however, and where it goes. */
  onLose?: (
    state: GameState,
    figure: FigureId,
    destination: CardDestination,
  ) => Step[];
  /** Actions it offers on its holder's turn, or, for a room or token, to a figure there. Using a card's action uses the card (p. 11). */
  actions?: Record<string, SourceAction>;
  reactions?: Reaction[];
  modifiers?: Modifier[];
  conditions?: Condition[];
  rollOptions?: RollOption[];
  /** Before a figure leaves the room this source is in (or, for a card,
   *  its holder's room): the steps to run instead of leaving at once. They
   *  continue the departure by running `go`, or keep the figure in the room
   *  by leaving it out. */
  beforeLeave?: (
    state: GameState,
    figure: FigureId,
    source: Source,
    go: Step,
  ) => Step[];
  /** When its holder attacks with it: the steps to run before the dice (the
   *  Sacrificial Dagger's roll). They continue the attack by running `go`,
   *  or call it off by leaving it out. */
  beforeAttack?: (state: GameState, figure: FigureId, go: Step) => Step[];
  /** Its holder may take damage of the other kind as this kind instead (the Skull). */
  damageAs?: "physical" | "mental";
  /** A barrier room: split in two, one side by each door, crossed by this
   *  trait roll (p. 7). */
  barrier?: { trait: Trait; target: number };
  /** The cards discovering this room draws, where its text gives some of its
   *  printed symbols another meaning (the Vault's items are its contents). */
  discoveryDraws?: CardType[];
  /** A kept event whose ongoing effect works against its holder (the
   *  Webs): the traitor is freed from it on becoming the traitor (p. 17). */
  impedes?: boolean;
  /** An omen the traitor may choose not to be affected by, as by an event
   *  card (the Bite, p. 17). */
  refusable?: boolean;
  /** For one of the rulebook's own rules, the page it is on. */
  page?: number;
  /** What a status makes its bearer, in words ("asleep"), for the log. */
  name?: string;
  /** Steps only this source uses, registered under the source's id. */
  steps?: Record<string, StepHandler>;
  /** A card lying in a room still acts from there (an open Music Box). Other
   *  cards act only while someone holds them or they are ongoing. */
  actsFromRoom?: boolean;
  /** Plain-language wording for events this source names as their rule,
   *  where the general wording of the event type would say too little. */
  describe?: Partial<
    Record<string, (event: Pick<GameEvent, "type" | "data">, words: Words) => string>
  >;
}

/** Names for the things an event refers to by id. */
export interface Words {
  figure: (figure: FigureId) => string;
  /** A seat, by its explorer's name where it has one. */
  seat: (seat: number) => string;
  room: (room: string) => string;
  card: (card: string) => string;
}

/** Part of the content's behaviours, as one file contributes them. */
export interface BehaviourGroup {
  /** The rulebook's own rules that act as sources: the traitor's new
   *  powers, how monsters work. Always live. */
  rulebook?: Record<string, Behaviour>;
  cards?: Record<string, Behaviour>;
  rooms?: Record<string, Behaviour>;
  tokens?: Record<string, Behaviour>;
  statuses?: Record<string, Behaviour>;
}

export interface Behaviours {
  rulebook: Partial<Record<string, Behaviour>>;
  cards: Partial<Record<string, Behaviour>>;
  rooms: Partial<Record<string, Behaviour>>;
  tokens: Partial<Record<string, Behaviour>>;
  statuses: Partial<Record<string, Behaviour>>;
}

/** The id the active haunt has as a rule source, and its own steps' names
 *  are registered under. */
export function hauntSourceId(haunt: number): string {
  return `haunt-${haunt}`;
}

/** What a reader of the live sources looks for. A source whose behaviour
 *  lacks it would contribute nothing, so it is left out: the questions are
 *  asked many times for every choice tried, and most sources have no say in
 *  most of them. */
export type Facet =
  | `modifiers:${string}`
  | "conditions"
  | "reactions"
  | "rollOptions"
  | "actions"
  | "damageAs"
  | "beforeLeave";

type Group = Partial<Record<string, Behaviour>>;

function hasFacet(behaviour: Behaviour, facet: Facet): boolean {
  if (facet.startsWith("modifiers:")) {
    const question = facet.slice("modifiers:".length);
    return (behaviour.modifiers ?? []).some((m) => m.question === question);
  }
  return (
    behaviour[facet as Exclude<Facet, `modifiers:${string}`>] !== undefined
  );
}

const withFacet = new WeakMap<Group, Map<Facet, Group | null>>();

/** The behaviours of one kind (every card's, say) that have a facet, or null
 *  for none. Worked out once: the content's behaviours never change while
 *  the engine runs. */
function only(group: Group, facet: Facet): Group | null {
  let known = withFacet.get(group);
  if (!known) withFacet.set(group, (known = new Map()));
  let found = known.get(facet);
  if (found === undefined) {
    const entries = Object.entries(group).filter(
      ([, b]) => b !== undefined && hasFacet(b, facet),
    );
    found = entries.length === 0 ? null : Object.fromEntries(entries);
    known.set(facet, found);
  }
  return found;
}

const rulebookOrder = new WeakMap<
  Group,
  { id: string; behaviour: Behaviour; page: number }[]
>();

/** The rulebook's own sources in order of id. */
function rulebookRules(
  rulebook: Group,
): { id: string; behaviour: Behaviour; page: number }[] {
  let rules = rulebookOrder.get(rulebook);
  if (!rules) {
    rules = Object.entries(rulebook)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .flatMap(([id, behaviour]) => {
        if (!behaviour) return [];
        if (behaviour.page === undefined)
          throw new Error(`The rulebook rule ${id} names no page`);
        return [{ id, behaviour, page: behaviour.page }];
      });
    rulebookOrder.set(rulebook, rules);
  }
  return rules;
}

/** Every source in play whose behaviour has a facet, in a stable order. */
export function liveSources(
  engine: Engine,
  state: GameState,
  facet: Facet,
): { source: Source; behaviour: Behaviour }[] {
  const { behaviours } = engine;
  const result: { source: Source; behaviour: Behaviour }[] = [];
  const rulebook = only(behaviours.rulebook, facet);
  if (rulebook)
    for (const { id, behaviour, page } of rulebookRules(rulebook)) {
      const source: Source = {
        layer: "rulebook",
        kind: "rulebook",
        id,
        rule: { source: "rulebook", page },
        holder: null,
        room: null,
        beside: null,
        token: null,
        status: null,
      };
      result.push({ source, behaviour });
    }
  const rooms = only(behaviours.rooms, facet);
  if (rooms)
    for (const tile of state.board.tiles) {
      const behaviour = rooms[tile.tile];
      if (behaviour) {
        const source: Source = {
          layer: "room",
          kind: "room",
          id: tile.tile,
          rule: { source: "room", room: tile.tile },
          holder: null,
          room: tile.tile,
          beside: null,
          token: null,
          status: null,
        };
        result.push({ source, behaviour });
      }
    }
  const cards = only(behaviours.cards, facet);
  const statuses = only(behaviours.statuses, facet);
  // A dead figure's cards and statuses do nothing more: it takes no further
  // part (p. 16).
  if (cards || statuses)
    for (const figure of allFigures(state).filter((f) => f.alive)) {
      if (cards)
        for (const card of figure.cards) {
          const behaviour = cards[card];
          if (behaviour)
            result.push({ source: cardSource(card, figure.id), behaviour });
        }
      if (statuses)
        for (const status of figure.statuses) {
          const behaviour = statuses[status.id];
          if (behaviour) {
            const source: Source = {
              layer: LAYER_OF[status.rule.source],
              kind: "status",
              id: status.id,
              rule: status.rule,
              holder: figure.id,
              room: null,
              beside: null,
              token: null,
              status,
            };
            result.push({ source, behaviour });
          }
        }
    }
  if (cards) {
    for (const card of state.ongoing) {
      const behaviour = cards[card];
      if (behaviour) result.push({ source: cardSource(card, null), behaviour });
    }
    const piles = Object.entries(state.piles).sort(([a], [b]) =>
      a < b ? -1 : 1,
    );
    for (const [room, pile] of piles) {
      for (const card of pile) {
        const behaviour = cards[card];
        if (behaviour?.actsFromRoom)
          result.push({
            source: { ...cardSource(card, null), room },
            behaviour,
          });
      }
    }
  }
  const tokens = only(behaviours.tokens, facet);
  if (tokens)
    for (const token of state.tokens) {
      const behaviour = tokens[token.token];
      if (behaviour) {
        const source: Source = {
          layer: "card",
          kind: "token",
          id: token.token,
          rule: { source: "token", token: token.token },
          holder: null,
          room: token.room,
          beside: token.wall
            ? besideWall(state, token.room, token.wall)
            : null,
          token,
          status: null,
        };
        result.push({ source, behaviour });
      }
    }
  const haunt = state.status === "haunt" ? state.haunt : null;
  const hauntRules = haunt === null ? undefined : engine.haunts[haunt.number];
  if (haunt !== null && hauntRules && hasFacet(hauntRules.behaviour, facet)) {
    const source: Source = {
      layer: "haunt",
      kind: "haunt",
      id: hauntSourceId(haunt.number),
      rule: { source: "haunt", haunt: haunt.number, section: "Rules" },
      holder: null,
      room: null,
      beside: null,
      token: null,
      status: null,
    };
    result.push({ source, behaviour: hauntRules.behaviour });
  }
  return result;
}

function cardSource(card: string, holder: FigureId | null): Source {
  return {
    layer: "card",
    kind: "card",
    id: card,
    rule: { source: "card", card },
    holder,
    room: null,
    beside: null,
    token: null,
    status: null,
  };
}

function besideWall(state: GameState, room: string, wall: Edge[]) {
  const cell = beyondWall(state.board, room, wall);
  return roomAt(state.board, cell.floor, cell.x, cell.y)?.tile ?? null;
}

/** Whether a figure in this room is at the source: in its room, or, for a
 *  token on a wall, in the room on either side. */
export function atSource(source: Source, room: string): boolean {
  return source.room === room || source.beside === room;
}

/** An event's data, typed by the event's contract. Events are stored as JSON, so the type is the emitter's promise. */
export function eventData<T extends Json>(event: Pick<GameEvent, "data">): T {
  return event.data as T;
}

/** A status source's data, typed by its behaviour's contract. Statuses are
 *  stored as JSON, so the type is the applying rule's promise. */
export function statusData<T extends Json>(source: Source): T {
  if (source.status === null) throw new Error(`${source.id} isn't a status`);
  return source.status.params as T;
}

/** The figure a turn event is about: the turn's seat's explorer, if it has
 *  one. */
export function turnFigure(event: GameEvent): FigureId | null {
  return eventData<{ figure: FigureId | null }>(event).figure;
}

/** The registered name of a source's own step. */
export function localStep(sourceId: string, name: string): string {
  return `${sourceId}:${name}`;
}

/** A step that runs one of a source's own steps. */
export function local(
  sourceId: string,
  name: string,
  params: Json = null,
): Step {
  return { kind: localStep(sourceId, name), params };
}
