import { newGame, type NewGame } from "./engine/exploration";
import type { Scenario } from "./engine/scenario";
import { apply, type Engine } from "./engine/step-loop";
import type { Action, GameState, Json } from "./types";

// A game written down so it can be passed around: how it started (seed,
// seats, date, scenario) and, optionally, every action since. The engine is
// deterministic, so replaying it rebuilds the game exactly, which makes a
// playtest position or a bug something anyone can open from a link.

export interface SharedGame {
  game: Omit<NewGame, "gameId">;
  actions: Action[];
}

/** Raise it whenever recorded actions may mean something else to the engine,
 *  so an older code fails plainly instead of replaying into a different game. */
const SHARE_FORMAT = 2;

export function encodeGame(shared: SharedGame): string {
  const json = JSON.stringify({ format: SHARE_FORMAT, ...shared });
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Reads a shared game back. Throws, saying what is wrong, on anything else. */
export function decodeGame(code: string): SharedGame {
  let parsed: unknown;
  try {
    const binary = atob(code.trim().replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error("That isn't a shared game code");
  }
  const root = record(parsed, "the code");
  if (typeof root.format === "number" && root.format < SHARE_FORMAT)
    throw new Error(
      "That game was shared from an older version of the engine and can't be replayed",
    );
  if (root.format !== SHARE_FORMAT)
    throw new Error(`Unknown shared game format ${String(root.format)}`);
  const game = record(root.game, "game");
  const today = record(game.today, "game.today");
  return {
    game: {
      seed: text(game.seed, "game.seed"),
      sets: list(game.sets, "game.sets").map((set, i) => {
        if (set !== "base" && set !== "widows-walk")
          throw new Error(`game.sets[${i}] is not a set`);
        return set;
      }),
      seats: list(game.seats, "game.seats").map((seat, i) => {
        const s = record(seat, `game.seats[${i}]`);
        return {
          name: text(s.name, `game.seats[${i}].name`),
          character: text(s.character, `game.seats[${i}].character`),
        };
      }),
      today: {
        month: number(today.month, "game.today.month"),
        day: number(today.day, "game.today.day"),
      },
      ...(game.scenario === undefined
        ? {}
        : { scenario: scenario(game.scenario) }),
    },
    actions: list(root.actions, "actions").map(action),
  };
}

/** The game's state after its start and after each of its actions. */
export function replay(
  engine: Engine,
  shared: SharedGame,
  gameId: string,
): GameState[] {
  const states = [newGame(engine, { ...shared.game, gameId })];
  shared.actions.forEach((act, i) => {
    const result = apply(engine, states[states.length - 1], act);
    if (!result.ok)
      throw new Error(`Action ${i + 1} was rejected: ${result.reason}`);
    states.push(result.state);
  });
  return states;
}

// ---------------------------------------------------------------------------
// Shape checks: each returns its value typed, or throws naming the field.
// ---------------------------------------------------------------------------

function record(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error(`${field} should be an object`);
  return value as Record<string, unknown>;
}

function list(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${field} should be a list`);
  return value;
}

function text(value: unknown, field: string): string {
  if (typeof value !== "string") throw new Error(`${field} should be text`);
  return value;
}

function number(value: unknown, field: string): number {
  if (typeof value !== "number") throw new Error(`${field} should be a number`);
  return value;
}

function texts(value: unknown, field: string): string[] {
  return list(value, field).map((v, i) => text(v, `${field}[${i}]`));
}

function optional<T>(
  value: unknown,
  read: (value: unknown) => T,
): T | undefined {
  return value === undefined ? undefined : read(value);
}

function scenario(value: unknown): Scenario {
  const s = record(value, "game.scenario");
  const decks = optional(s.decks, (v) => record(v, "scenario.decks"));
  const haunt = optional(s.haunt, (v) => record(v, "scenario.haunt"));
  const sides = optional(s.sides, (v) => list(v, "scenario.sides"));
  return {
    first: optional(s.first, (v) => number(v, "scenario.first")),
    decks: decks && {
      omen: optional(decks.omen, (v) => texts(v, "scenario.decks.omen")),
      item: optional(decks.item, (v) => texts(v, "scenario.decks.item")),
      event: optional(decks.event, (v) => texts(v, "scenario.decks.event")),
    },
    stack: optional(s.stack, (v) => texts(v, "scenario.stack")),
    rooms: optional(s.rooms, (v) => texts(v, "scenario.rooms")),
    explorers: optional(s.explorers, (v) =>
      list(v, "scenario.explorers").map((e, i) => {
        const field = `scenario.explorers[${i}]`;
        const x = record(e, field);
        const clips = optional(x.clips, (c) => record(c, `${field}.clips`));
        return {
          seat: number(x.seat, `${field}.seat`),
          room: optional(x.room, (r) => text(r, `${field}.room`)),
          clips: clips && {
            speed: optional(clips.speed, (c) => number(c, `${field}.clips.speed`)),
            might: optional(clips.might, (c) => number(c, `${field}.clips.might`)),
            sanity: optional(clips.sanity, (c) => number(c, `${field}.clips.sanity`)),
            knowledge: optional(clips.knowledge, (c) =>
              number(c, `${field}.clips.knowledge`),
            ),
          },
          cards: optional(x.cards, (c) => texts(c, `${field}.cards`)),
        };
      }),
    ),
    haunt: haunt && {
      number: number(haunt.number, "scenario.haunt.number"),
      revealer: number(haunt.revealer, "scenario.haunt.revealer"),
      omen: optional(haunt.omen, (v) => text(v, "scenario.haunt.omen")),
      room: optional(haunt.room, (v) => text(v, "scenario.haunt.room")),
    },
    sides: sides?.map((entry, i) => {
      const field = `scenario.sides[${i}]`;
      const x = record(entry, field);
      return {
        seat: number(x.seat, `${field}.seat`),
        side: oneOf(x.side, `${field}.side`, ["heroes", "traitor", "neutral"]),
        roles: optional(x.roles, (r) =>
          list(r, `${field}.roles`).map((role, j) =>
            oneOf(role, `${field}.roles[${j}]`, ["traitor"]),
          ),
        ),
        knownBy: optional(x.knownBy, (k) =>
          list(k, `${field}.knownBy`).map((n, j) =>
            number(n, `${field}.knownBy[${j}]`),
          ),
        ),
      };
    }),
  };
}

function oneOf<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
): T {
  const found = allowed.find((a) => a === value);
  if (found === undefined)
    throw new Error(`${field} should be one of ${allowed.join(", ")}`);
  return found;
}

function action(value: unknown, i: number): Action {
  const field = `actions[${i}]`;
  const a = record(value, field);
  if (a.kind === "ready")
    return {
      kind: "ready",
      wait: text(a.wait, `${field}.wait`),
      seat: number(a.seat, `${field}.seat`),
    };
  if (a.kind === "choose")
    return {
      kind: "choose",
      decision: text(a.decision, `${field}.decision`),
      seat: number(a.seat, `${field}.seat`),
      // The engine checks a choice against the ones it offers.
      choice: a.choice as Json,
    };
  throw new Error(`${field} is not an action`);
}
