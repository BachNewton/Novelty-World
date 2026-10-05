import type { GameState, Json } from "../types";

/** The saved state's format. Raise it with every change to the state's shape,
 *  and add the migration from the previous format, tested with a saved fixture. */
export const STATE_FORMAT = 10;

type JsonObject = { [key: string]: Json };

const isObject = (value: Json | undefined): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Migrations by the format they upgrade from, each to the next format. */
type Migration = (state: JsonObject) => JsonObject;
const MIGRATIONS: Partial<Record<number, Migration>> = {
  // Format 2 adds marks on cards and turns that end early.
  1: (state) => {
    const turn = state.turn;
    return {
      ...state,
      cardMarks: {},
      turn:
        turn !== null && typeof turn === "object" && !Array.isArray(turn)
          ? { ...turn, over: false }
          : null,
    };
  },
  // Format 3 records whether the turn's attack has been made.
  2: (state) => {
    const turn = state.turn;
    return {
      ...state,
      turn:
        turn !== null && typeof turn === "object" && !Array.isArray(turn)
          ? { ...turn, attacked: false }
          : null,
    };
  },
  // Format 4 records who drew each of the turn's omens. An older state's were
  // all rolled for by the turn's own explorer, so they are put down to them.
  3: (state) => {
    const turn = state.turn;
    if (
      turn === null ||
      typeof turn !== "object" ||
      Array.isArray(turn) ||
      !Array.isArray(turn.omens)
    )
      return state;
    return {
      ...state,
      turn: {
        ...turn,
        omens: turn.omens.map((o) =>
          o !== null && typeof o === "object" && !Array.isArray(o)
            ? { ...o, seat: turn.seat }
            : o,
        ),
      },
    };
  },
  // Format 5 keeps every piece on the board as a figure, by id (an
  // explorer's is its character), where format 4 kept one explorer per seat,
  // and counts the turn's movement and attack per figure. Work in progress
  // names explorers by seat, and what it means can't be read from its data,
  // so only a state with no work queued and no decision pending but the
  // turn's own can be carried over. Last events are dropped: they name
  // explorers by seat too, and only animate the write that made them.
  4: (state) => {
    const explorers = Array.isArray(state.explorers) ? state.explorers : [];
    const pending = state.pending;
    const work = state.work;
    if (
      (Array.isArray(work) && work.length > 0) ||
      (isObject(pending) &&
        pending.type === "decision" &&
        pending.kind !== "turn")
    )
      throw new Error(
        "A format 4 state paused partway through an effect can't be carried over",
      );
    const idOf = (seat: Json | undefined): string => {
      const explorer = explorers.find((e) => isObject(e) && e.seat === seat);
      if (!isObject(explorer) || typeof explorer.character !== "string")
        throw new Error(`Seat ${JSON.stringify(seat)} has no explorer`);
      return explorer.character;
    };
    const figures: JsonObject = {};
    for (const e of explorers) {
      if (!isObject(e) || typeof e.character !== "string") continue;
      figures[e.character] = {
        id: e.character,
        kind: "explorer",
        definition: e.character,
        owner: e.seat ?? null,
        place: { room: e.room ?? null, side: e.side ?? null },
        traits: { kind: "track", clips: e.clips ?? {}, overTop: e.overTop ?? [] },
        cards: e.cards ?? [],
        statuses: [],
        stunned: false,
        alive: true,
      };
    }
    const tokens = Array.isArray(state.tokens)
      ? state.tokens.map((t) =>
          isObject(t) && "holder" in t
            ? { ...t, holder: idOf(t.holder) }
            : t,
        )
      : state.tokens;
    const marks = isObject(state.cardMarks)
      ? Object.fromEntries(
          Object.entries(state.cardMarks).map(([card, byName]) => {
            if (!isObject(byName) || !isObject(byName["drawn-by"]))
              return [card, byName];
            const drawn = byName["drawn-by"];
            return [
              card,
              { ...byName, "drawn-by": { ...drawn, value: idOf(drawn.value) } },
            ];
          }),
        )
      : state.cardMarks;
    const turn = state.turn;
    const mover = isObject(turn) ? idOf(turn.seat) : null;
    const rest = { ...state };
    delete rest.explorers;
    return {
      ...rest,
      figures,
      tokens,
      cardMarks: marks,
      turn:
        isObject(turn) && mover !== null
          ? {
              ...turn,
              moved: typeof turn.moved === "number" ? { [mover]: turn.moved } : {},
              movementEnded: turn.movementEnded === true ? [mover] : [],
              attacked: turn.attacked === true ? [mover] : [],
              omens: Array.isArray(turn.omens)
                ? turn.omens.map((o) => {
                    if (!isObject(o)) return o;
                    const { seat, ...omen } = o;
                    return { ...omen, figure: idOf(seat) };
                  })
                : [],
            }
          : null,
      lastEvents: [],
    };
  },
  // Format 6 gives seats a side, roles and who knows them, all unset before
  // the haunt, and records rule memory and cards set aside. Statuses gain a
  // shape that carries their rule and data; format 5 never stored one.
  5: (state) => {
    const figures = isObject(state.figures) ? state.figures : {};
    for (const figure of Object.values(figures))
      if (
        isObject(figure) &&
        Array.isArray(figure.statuses) &&
        figure.statuses.length > 0
      )
        throw new Error("A format 5 figure has statuses, which it never stored");
    const seats = state.seats;
    return {
      ...state,
      ...(Array.isArray(seats) && {
        seats: seats.map((seat) =>
          isObject(seat)
            ? { ...seat, side: null, roles: [], knownBy: null }
            : seat,
        ),
      }),
      memory: { deaths: [] },
      aside: [],
    };
  },
  // Format 7 gives turns a kind and a queue of inserted turns, a revealed
  // haunt its secrets and counters, rule memory the conditions that have
  // fired, and the game a result. A format 6 game never went past the
  // reveal, so every turn was an explorer's taken in order.
  6: (state) => {
    const turn = state.turn;
    const haunt = state.haunt;
    const memory = isObject(state.memory) ? state.memory : {};
    return {
      ...state,
      turn: isObject(turn)
        ? { ...turn, kind: "explorer", follows: null }
        : null,
      insertedTurns: [],
      haunt: isObject(haunt) ? { ...haunt, secrets: [], counters: {} } : null,
      memory: { ...memory, conditions: [] },
      result: null,
    };
  },
  // Format 8 gives an attack's modes a reach, an attack whether its
  // attacker chose it, and its outcome what the loser suffers (damage, a stun
  // or a kill) where format 7 gave only damage. An attack in progress can't
  // be carried over, as its modes and outcome don't say what they would now
  // mean. Last events are dropped: an attack's outcome among them would be
  // described by its new shape, and they only animate the write that made
  // them.
  7: (state) => {
    if (/"kind":"attack/.test(JSON.stringify([state.pending, state.work])))
      throw new Error(
        "A format 7 state paused partway through an attack can't be carried over",
      );
    return { ...state, lastEvents: [] };
  },
  // Format 9 gives turns the figures acting on them (a format 8 turn's was
  // its seat's explorer, and a monster turn had none) and the monster
  // turn's bookkeeping, and rule memory the monster traits made known and
  // how many of each haunt figure have come into play, which format 8
  // numbered from 1 by its figures.
  8: (state) => {
    const turn = state.turn;
    const figures = isObject(state.figures) ? state.figures : {};
    const memory = isObject(state.memory) ? state.memory : {};
    const spawned: JsonObject = {};
    for (const figure of Object.values(figures)) {
      if (!isObject(figure) || figure.kind === "explorer") continue;
      const { id, definition } = figure;
      if (typeof id !== "string" || typeof definition !== "string") continue;
      const number = Number(id.slice(definition.length + 1));
      const known = spawned[definition];
      spawned[definition] = Math.max(typeof known === "number" ? known : 0, number);
    }
    const explorer = isObject(turn)
      ? Object.values(figures).find(
          (f) =>
            isObject(f) &&
            f.kind === "explorer" &&
            f.owner === turn.seat &&
            f.alive === true &&
            f.place !== null,
        )
      : undefined;
    const actors =
      isObject(turn) && turn.kind !== "monster" && isObject(explorer)
        ? [explorer.id ?? null]
        : [];
    return {
      ...state,
      turn: isObject(turn)
        ? {
            ...turn,
            actors,
            acting: actors.at(0) ?? null,
            done: [],
            rolled: {},
            recovering: [],
            setUses: [],
          }
        : null,
      memory: { ...memory, traitsKnown: [], spawned },
    };
  },
  // Format 10 keeps the rolls attempted on a turn by the figure that
  // attempted them. A format 9 turn's were its acting figure's, or, between
  // a monster turn's monsters, can't be told apart.
  9: (state) => {
    const turn = state.turn;
    if (!isObject(turn) || !Array.isArray(turn.rolls)) return state;
    if (turn.rolls.length === 0) return { ...state, turn: { ...turn, rolls: {} } };
    const roller = turn.acting;
    if (typeof roller !== "string")
      throw new Error(
        "A format 9 turn's rolls can't be put down to a figure: none is acting",
      );
    return { ...state, turn: { ...turn, rolls: { [roller]: turn.rolls } } };
  },
};

/** Thrown for a state written by newer code than this bundle: the deploy has
 *  moved on, so the client reloads its code. */
export class NewerFormatError extends Error {
  constructor(readonly format: number) {
    super(`State format ${format} is newer than this code's ${STATE_FORMAT}`);
  }
}

export function migrate(saved: { [key: string]: Json }): GameState {
  let state = saved;
  let format = state.format;
  if (typeof format !== "number")
    throw new Error("Saved state has no format number");
  if (format > STATE_FORMAT) throw new NewerFormatError(format);
  while (format < STATE_FORMAT) {
    const step = MIGRATIONS[format];
    if (!step) throw new Error(`No migration from state format ${format}`);
    state = { ...step(state), format: format + 1 };
    format += 1;
  }
  return state as unknown as GameState;
}
