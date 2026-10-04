import type {
  Catalog,
  CardType,
  GameState,
  Haunt,
  Role,
  RuleRef,
  SetId,
  Side,
  Trait,
} from "../types";
import { placed } from "./board";
import { defineStep, gainCard } from "./effects";
import { putFigure, seatExplorer, trackTraits, TRAITS } from "./figures";
import { barrierSides } from "./questions";
import type { Engine, StepHandler } from "./step-loop";
import { placeOptions } from "./tiles";

// A scenario starts a game somewhere other than the default deal, for
// playtesting and tests: stacked decks and room stack, rooms already in the
// house, explorers placed with chosen traits and cards, or the haunt already
// revealed. It is applied during setup, through the engine's own steps, so a
// game started from a seed and a scenario is as reproducible as any other.

export const SCENARIO_RULE: RuleRef = { source: "scenario" };

/** How the seat's explorer starts. */
export interface ExplorerSetup {
  seat: number;
  /** Any room of the sets in play; one not yet in the house is put in it. */
  room?: string;
  /** Each trait's clip, as an index into the character's track, before the
   *  explorer's cards change it. */
  clips?: Partial<Record<Trait, number>>;
  /** Cards held from the start, gained in order as in play, so a card's
   *  effect on gaining it (a trait gain, the Dog's token) applies. */
  cards?: string[];
}

export interface HauntStart {
  number: number;
  revealer: number;
  /** The omen and room that give the haunt on the chart. Either or both may
   *  be left out; the first chart cell for the haunt that fits is used. */
  omen?: string;
  room?: string;
}

/** A seat's side and roles once the haunt starts. */
export interface SideSetup {
  seat: number;
  side: Side;
  roles?: Role[];
  /** Keep the side and roles secret, known only to these seats. */
  knownBy?: number[];
}

export interface Scenario {
  /** The seat that goes first, instead of the next birthday. */
  first?: number;
  /** Cards on top of each deck, top first. */
  decks?: Partial<Record<CardType, string[]>>;
  /** Room tiles on top of the stack, top first. */
  stack?: string[];
  /** Rooms put in the house before play, in order, each at the first place it fits. */
  rooms?: string[];
  explorers?: ExplorerSetup[];
  /** Start with this haunt revealed, as if its haunt roll had just been made. */
  haunt?: HauntStart;
  /** Seats' sides and roles in that haunt, set before it starts. Sides come
   *  with the haunt, so they need one. */
  sides?: SideSetup[];
}

/** A checked scenario with every default worked out, as step parameters. */
export type PreparedScenario = {
  first: number | null;
  decks: Record<CardType, string[]>;
  stack: string[];
  rooms: string[];
  explorers: {
    seat: number;
    room: string | null;
    clips: { trait: Trait; clip: number }[];
    cards: string[];
  }[];
  haunt: Haunt | null;
  sides: {
    seat: number;
    side: Side;
    roles: Role[];
    knownBy: number[] | null;
  }[];
};

const CARD_TYPES: readonly CardType[] = ["omen", "item", "event"];
const SIDES: readonly Side[] = ["heroes", "traitor", "neutral"];
const ROLES: readonly Role[] = ["traitor"];

/** Checks a scenario against the catalogue and the seats, and works out its
 *  defaults. Throws, naming the problem, when it can't be set up. */
export function prepareScenario(
  catalog: Catalog,
  sets: SetId[],
  characters: string[],
  scenario: Scenario,
): PreparedScenario {
  const seats = characters.length;
  const seat = (n: number, what: string) => {
    if (!Number.isInteger(n) || n < 0 || n >= seats)
      throw new Error(`${what}: there is no seat ${n}`);
    return n;
  };
  const room = (id: string, what: string) => {
    if (!(id in catalog.rooms)) throw new Error(`${what}: no room ${id}`);
    if (!sets.includes(catalog.rooms[id].set))
      throw new Error(`${what}: the ${id} isn't in the sets in play`);
    return id;
  };
  const tile = (id: string, what: string) => {
    if (catalog.rooms[room(id, what)].start)
      throw new Error(`${what}: the ${id} is a starting tile, always in the house`);
    return id;
  };
  const used = new Set<string>();
  const card = (id: string, what: string, type: CardType | null = null) => {
    if (!(id in catalog.cards)) throw new Error(`${what}: no card ${id}`);
    const found = catalog.cards[id];
    if (!sets.includes(found.set))
      throw new Error(`${what}: the ${id} isn't in the sets in play`);
    if (type !== null && found.type !== type)
      throw new Error(`${what}: the ${id} is an ${found.type}, not an ${type}`);
    if (used.has(id)) throw new Error(`${what}: the ${id} is used twice`);
    used.add(id);
    return id;
  };

  const decks = {} as Record<CardType, string[]>;
  for (const type of CARD_TYPES)
    decks[type] = (scenario.decks?.[type] ?? []).map((id) =>
      card(id, `The ${type} deck`, type),
    );

  const tiles = new Set<string>();
  const once = (id: string, what: string) => {
    if (tiles.has(id)) throw new Error(`${what}: the ${id} is used twice`);
    tiles.add(id);
    return id;
  };
  const stack = (scenario.stack ?? []).map((id) =>
    once(tile(id, "The room stack"), "The room stack"),
  );
  const rooms = (scenario.rooms ?? []).map((id) =>
    once(tile(id, "The rooms in the house"), "The rooms in the house"),
  );
  const intoHouse = (id: string, what: string) => {
    if (catalog.rooms[id].start || rooms.includes(id)) return;
    if (stack.includes(id))
      throw new Error(`${what}: the ${id} is stacked, so it can't be in the house`);
    rooms.push(id);
  };

  const seen = new Set<number>();
  const explorers = (scenario.explorers ?? []).map((setup) => {
    const what = `Seat ${setup.seat}`;
    seat(setup.seat, "An explorer");
    if (seen.has(setup.seat)) throw new Error(`${what} is set up twice`);
    seen.add(setup.seat);
    const traits = catalog.figures[characters[setup.seat]].traits;
    if (traits.kind !== "tracks")
      throw new Error(`${what}: ${characters[setup.seat]} has no tracks`);
    const tracks = traits.tracks;
    const clips = TRAITS.flatMap((trait) => {
      const clip = setup.clips?.[trait];
      if (clip === undefined) return [];
      if (!Number.isInteger(clip) || clip < 0 || clip >= tracks[trait].length)
        throw new Error(`${what}: no ${trait} track position ${clip}`);
      return [{ trait, clip }];
    });
    const at = setup.room === undefined ? null : room(setup.room, what);
    if (at !== null) intoHouse(at, what);
    return {
      seat: setup.seat,
      room: at,
      clips,
      cards: (setup.cards ?? []).map((id) => card(id, what)),
    };
  });

  let haunt: Haunt | null = null;
  if (scenario.haunt) {
    const h = scenario.haunt;
    const what = `Haunt ${h.number}`;
    const revealer = seat(h.revealer, `${what}'s revealer`);
    const cell = hauntCells(catalog, h.number).find(
      (c) =>
        (h.omen === undefined || c.omen === h.omen) &&
        (h.room === undefined || c.room === h.room),
    );
    if (!cell)
      throw new Error(
        `${what}: the chart has no cell for it${h.omen ? ` with the ${h.omen}` : ""}${h.room ? ` in the ${h.room}` : ""}`,
      );
    room(cell.room, what);
    intoHouse(cell.room, what);
    haunt = { number: h.number, revealer, omen: cell.omen, room: cell.room };
    // The revealer drew the omen in the omen room (p. 15), so unless the
    // scenario says otherwise they are there, holding it.
    let setup = explorers.find((e) => e.seat === revealer);
    if (!setup) {
      setup = { seat: revealer, room: null, clips: [], cards: [] };
      explorers.push(setup);
    }
    setup.room ??= cell.room;
    if (!used.has(cell.omen)) setup.cards.push(card(cell.omen, what, "omen"));
  }

  const sided = new Set<number>();
  const sides = (scenario.sides ?? []).map((setup) => {
    const what = `Seat ${setup.seat}'s side`;
    if (haunt === null) throw new Error(`${what}: sides come with a haunt`);
    seat(setup.seat, what);
    if (sided.has(setup.seat)) throw new Error(`${what} is set twice`);
    sided.add(setup.seat);
    if (!SIDES.includes(setup.side))
      throw new Error(`${what}: no side ${setup.side}`);
    const roles = setup.roles ?? [];
    for (const role of roles)
      if (!ROLES.includes(role)) throw new Error(`${what}: no role ${role}`);
    return {
      seat: setup.seat,
      side: setup.side,
      roles,
      knownBy:
        setup.knownBy === undefined
          ? null
          : setup.knownBy.map((n) => seat(n, `${what}, known by`)),
    };
  });

  return {
    sides,
    first: scenario.first === undefined ? null : seat(scenario.first, "First player"),
    decks,
    stack,
    rooms,
    explorers,
    haunt,
  };
}

/** The omen and room pairs that give a haunt on the chart, in a stable order. */
export function hauntCells(
  catalog: Catalog,
  haunt: number,
): { omen: string; room: string }[] {
  return Object.entries(catalog.chart.cells)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .flatMap(([room, row]) =>
      Object.entries(row ?? {})
        .filter(([, number]) => number === haunt)
        .map(([omen]) => ({ omen, room }))
        .sort((a, b) => (a.omen < b.omen ? -1 : 1)),
    );
}

/** Every haunt number on the chart, lowest first. */
export function hauntNumbers(catalog: Catalog): number[] {
  const numbers = new Set<number>();
  for (const row of Object.values(catalog.chart.cells))
    for (const number of Object.values(row ?? {}))
      if (number !== undefined) numbers.add(number);
  return [...numbers].sort((a, b) => a - b);
}

/** Puts the scenario's chosen cards and rooms on top of the shuffled decks
 *  and room stack, and takes the cards it deals out of them. */
export function stackScenario(state: GameState, scenario: PreparedScenario): void {
  const dealt = new Set(scenario.explorers.flatMap((e) => e.cards));
  for (const type of CARD_TYPES) {
    const top = scenario.decks[type];
    state.decks[type].draw = [
      ...top,
      ...state.decks[type].draw.filter((c) => !top.includes(c) && !dealt.has(c)),
    ];
  }
  const top = scenario.stack;
  const house = new Set(scenario.rooms);
  state.board.stack = [
    ...top,
    ...state.board.stack.filter((t) => !top.includes(t) && !house.has(t)),
  ];
}

export const SCENARIO_STEPS: Record<string, StepHandler> = {
  scenario: defineStep<PreparedScenario>((state, p, ctx) => {
    for (const id of p.rooms) {
      if (placed(state.board, id)) continue;
      const where = placeOptions(ctx.catalog, state.board, id, {
        kind: "doorways",
        floors: ctx.catalog.rooms[id].floors,
        except: null,
      }).at(0);
      if (!where)
        throw new Error(`The scenario can't fit the ${id} into the house`);
      state.board.tiles.push({ tile: id, ...where });
      ctx.emit("room-placed", SCENARIO_RULE, { tile: id, floor: where.floor });
    }
    for (const setup of p.explorers) {
      const figure = seatExplorer(state, setup.seat);
      if (setup.room !== null)
        putFigure(state, figure, {
          room: setup.room,
          side: firstSide(ctx.engine, setup.room),
        });
      for (const { trait, clip } of setup.clips)
        trackTraits(ctx.catalog, state, figure).live.clips[trait] = clip;
      if (setup.room !== null || setup.clips.length > 0)
        ctx.emit("explorer-set-up", SCENARIO_RULE, {
          figure,
          room: setup.room,
          traits: setup.clips.map((c) => c.trait),
        });
    }
    const gains = p.explorers.flatMap((setup) =>
      setup.cards.map((card) =>
        gainCard(seatExplorer(state, setup.seat), card, "given", SCENARIO_RULE),
      ),
    );
    for (const { seat, side, roles, knownBy } of p.sides) {
      state.seats[seat] = { ...state.seats[seat], side, roles, knownBy };
      ctx.emit("side-set", SCENARIO_RULE, { seat, side, roles, secret: knownBy !== null });
    }
    state.omensDrawn += p.explorers
      .flatMap((e) => e.cards)
      .filter((card) => ctx.catalog.cards[card].type === "omen").length;
    ctx.push(...gains);
  }),
};

/** In a barrier room, a placed explorer stands by its first door. */
function firstSide(engine: Engine, room: string) {
  return barrierSides(engine, room)[0] ?? null;
}
