import type { PlayerProfile } from "@/shared/lib/profile";
import { PLAYER_COLORS, PLAYER_ICONS } from "./data";
import { createRng, initialDecks } from "./engine";
import type {
  GameState,
  Player,
  PlayerColor,
  PlayerIcon,
  PlayerPreferences,
  TurnGroup,
  TurnState,
} from "./types";

// ---------------------------------------------------------------------------
// Shared game-setup primitives. Both the lobby flow here and the immediate-play
// seed (`freshGame` in mocks.ts) build players from these, so starting cash and
// the default per-player records live in exactly one place.
// ---------------------------------------------------------------------------

export const STARTING_CASH = 1500;

/** Upper bound on seats — bounded by the eight-hue player palette. */
export const MAX_PLAYERS = 8;

/** Fewest participants that can start a game (at least one must be human). */
export const MIN_PLAYERS = 2;

export const DEFAULT_PREFERENCES: PlayerPreferences = {
  jailStance: "leave",
  autoBuyCashFraction: 1,
};

/** Bot display names, handed out in order. Falls back to `Bot N` once the
 *  pool is exhausted (only reachable past 7 bots, which the 8-seat cap nearly
 *  rules out). */
const BOT_NAMES = ["Alex", "Sam", "Jordan", "Riley", "Casey", "Morgan", "Drew"];

/** Dense per-player records keyed by id — every seated player has an entry. */
function densePreferences(
  players: readonly Player[],
): Record<string, PlayerPreferences> {
  return Object.fromEntries(players.map((p) => [p.id, DEFAULT_PREFERENCES]));
}

/** A player sitting at GO with full cash and no jail/bankruptcy state — the
 *  shape both a fresh seat and a game-start reset want. */
export function freshPlayer(args: {
  id: string;
  name: string;
  color: PlayerColor;
  icon: PlayerIcon;
  isBot: boolean;
}): Player {
  return {
    ...args,
    cash: STARTING_CASH,
    position: 0,
    inJail: false,
    jailTurns: 0,
    bankrupt: false,
  };
}

// ---------------------------------------------------------------------------
// Lobby operations — pure functions over GameState. Every mutation runs through
// the authoritative route (Stage 4 wiring), so these stay free of side effects,
// `Math.random`, and `Date.now`: any entropy (rng seed, ids) is injected or
// derived deterministically from the roster so the ops are unit-testable.
// ---------------------------------------------------------------------------

export type LobbyResult =
  | { ok: true; state: GameState }
  | { ok: false; reason: string };

function usedColors(state: GameState): Set<PlayerColor> {
  return new Set(state.players.map((p) => p.color));
}

function usedIcons(state: GameState): Set<PlayerIcon> {
  return new Set(state.players.map((p) => p.icon));
}

/** First entry in `ordered` not present in `used`, or null if all are taken.
 *  Generic over color and icon — both are assigned the same first-free way. */
function firstFree<T>(ordered: readonly T[], used: ReadonlySet<T>): T | null {
  return ordered.find((value) => !used.has(value)) ?? null;
}

/** Smallest `bot-N` (N ≥ 1) not already a seated id. Deterministic so adding
 *  a bot is pure — no randomness needed for a unique handle. */
function nextBotId(state: GameState): string {
  const ids = new Set(state.players.map((p) => p.id));
  for (let n = 1; ; n++) {
    const id = `bot-${n.toString()}`;
    if (!ids.has(id)) return id;
  }
}

/** First unused BOT_NAMES entry, falling back to a numbered default. */
function nextBotName(state: GameState): string {
  const names = new Set(state.players.map((p) => p.name));
  const free = BOT_NAMES.find((name) => !names.has(name));
  if (free) return free;
  return `Bot ${(state.players.length + 1).toString()}`;
}

/** A brand-new lobby seating the host as the only (human) player, holding the
 *  first color + icon. `rngSeed` is injected by the caller (the route stamps a
 *  timestamped seed) so this stays pure. */
export function createLobby(host: PlayerProfile, rngSeed: string): GameState {
  const player = freshPlayer({
    id: host.id,
    name: host.name,
    color: PLAYER_COLORS[0],
    icon: PLAYER_ICONS[0],
    isBot: false,
  });
  const players = [player];
  // Seed the decks from the game's RNG stream, then advance past the shuffle.
  const rng = createRng(rngSeed);
  const decks = initialDecks(rng);
  return {
    status: "lobby",
    players,
    ownership: {},
    mortgaged: {},
    houses: {},
    jailFreeCards: {},
    decks,
    turns: [{ turn: 1, playerId: player.id, events: [] }],
    turn: { playerId: player.id, phase: "pre-roll", doublesStreak: 0 },
    preferences: densePreferences(players),
    boundaryQueue: [],
    rngSeed,
    rngState: rng.getState(),
  };
}

/** Append a player to the lobby with the given identity, refreshing the dense
 *  per-player records. Shared by `joinLobby` and `addBot`. */
function seat(state: GameState, player: Player): GameState {
  const players = [...state.players, player];
  return {
    ...state,
    players,
    preferences: { ...state.preferences, [player.id]: DEFAULT_PREFERENCES },
  };
}

/** Seat a human, auto-assigning the first free color + icon. Idempotent: a
 *  profile that's already seated returns the unchanged state (handles a
 *  double-submit from a re-render). */
export function joinLobby(state: GameState, profile: PlayerProfile): LobbyResult {
  if (state.status !== "lobby") {
    return { ok: false, reason: "game already started" };
  }
  if (state.players.some((p) => p.id === profile.id)) {
    return { ok: true, state };
  }
  if (state.players.length >= MAX_PLAYERS) {
    return { ok: false, reason: "lobby full" };
  }
  const color = firstFree(PLAYER_COLORS, usedColors(state));
  const icon = firstFree(PLAYER_ICONS, usedIcons(state));
  if (!color || !icon) return { ok: false, reason: "lobby full" };
  return {
    ok: true,
    state: seat(
      state,
      freshPlayer({ id: profile.id, name: profile.name, color, icon, isBot: false }),
    ),
  };
}

/** Add a bot seat with a synthetic id/name and the first free color + icon. */
export function addBot(state: GameState): LobbyResult {
  if (state.status !== "lobby") {
    return { ok: false, reason: "game already started" };
  }
  if (state.players.length >= MAX_PLAYERS) {
    return { ok: false, reason: "lobby full" };
  }
  const color = firstFree(PLAYER_COLORS, usedColors(state));
  const icon = firstFree(PLAYER_ICONS, usedIcons(state));
  if (!color || !icon) return { ok: false, reason: "lobby full" };
  return {
    ok: true,
    state: seat(
      state,
      freshPlayer({
        id: nextBotId(state),
        name: nextBotName(state),
        color,
        icon,
        isBot: true,
      }),
    ),
  };
}

/** Remove a seat (a leaving human or a kicked bot). Drops the player and their
 *  dense records; repoints the (idle) lobby turn pointer if it referenced the
 *  removed seat so the state stays well-formed. */
export function removePlayer(state: GameState, playerId: string): LobbyResult {
  if (state.status !== "lobby") {
    return { ok: false, reason: "game already started" };
  }
  if (!state.players.some((p) => p.id === playerId)) {
    return { ok: false, reason: "unknown player" };
  }
  const players = state.players.filter((p) => p.id !== playerId);
  const preferences = { ...state.preferences };
  delete preferences[playerId];
  const turn =
    state.turn.playerId === playerId && players.length > 0
      ? { ...state.turn, playerId: players[0].id }
      : state.turn;
  return { ok: true, state: { ...state, players, preferences, turn } };
}

function updatePlayer(
  state: GameState,
  playerId: string,
  patch: Partial<Player>,
): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === playerId ? { ...p, ...patch } : p,
    ),
  };
}

/** Change a seat's color, rejecting a hue another seat already holds. */
export function setPlayerColor(
  state: GameState,
  playerId: string,
  color: PlayerColor,
): LobbyResult {
  if (state.status !== "lobby") {
    return { ok: false, reason: "game already started" };
  }
  if (!state.players.some((p) => p.id === playerId)) {
    return { ok: false, reason: "unknown player" };
  }
  if (state.players.some((p) => p.id !== playerId && p.color === color)) {
    return { ok: false, reason: "color taken" };
  }
  return { ok: true, state: updatePlayer(state, playerId, { color }) };
}

/** Change a seat's token icon, rejecting one another seat already holds. */
export function setPlayerIcon(
  state: GameState,
  playerId: string,
  icon: PlayerIcon,
): LobbyResult {
  if (state.status !== "lobby") {
    return { ok: false, reason: "game already started" };
  }
  if (!state.players.some((p) => p.id === playerId)) {
    return { ok: false, reason: "unknown player" };
  }
  if (state.players.some((p) => p.id !== playerId && p.icon === icon)) {
    return { ok: false, reason: "icon taken" };
  }
  return { ok: true, state: updatePlayer(state, playerId, { icon }) };
}

/** Rename a seat. Names need no uniqueness; a blank name is rejected. */
export function setPlayerName(
  state: GameState,
  playerId: string,
  name: string,
): LobbyResult {
  if (state.status !== "lobby") {
    return { ok: false, reason: "game already started" };
  }
  if (!state.players.some((p) => p.id === playerId)) {
    return { ok: false, reason: "unknown player" };
  }
  const trimmed = name.trim();
  if (trimmed.length === 0) return { ok: false, reason: "name required" };
  return { ok: true, state: updatePlayer(state, playerId, { name: trimmed }) };
}

/** Flip the lobby into play. Requires the minimum participant count with at
 *  least one human. Rebuilds the turn pointer and opening TurnGroup for the
 *  final roster (seat order = play order) and re-derives the dense records, so
 *  the game starts clean regardless of join/leave churn. */
export function startGame(state: GameState): LobbyResult {
  if (state.status !== "lobby") {
    return { ok: false, reason: "game already started" };
  }
  if (state.players.length < MIN_PLAYERS) {
    return { ok: false, reason: "need at least 2 players" };
  }
  if (!state.players.some((p) => !p.isBot)) {
    return { ok: false, reason: "need at least one human" };
  }
  const first = state.players[0];
  const turn: TurnState = {
    playerId: first.id,
    phase: "pre-roll",
    doublesStreak: 0,
  };
  const turns: TurnGroup[] = [{ turn: 1, playerId: first.id, events: [] }];
  return {
    ok: true,
    state: {
      ...state,
      status: "active",
      turn,
      turns,
      preferences: densePreferences(state.players),
    },
  };
}
