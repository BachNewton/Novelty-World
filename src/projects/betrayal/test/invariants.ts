import { allFigures, TRAITS } from "../engine/figures";
import { migrate } from "../engine/format";
import { activeHaunt, figuresInPlay } from "../engine/haunt";
import { askNumber } from "../engine/questions";
import type { Engine } from "../engine/step-loop";
import type { CardType, GameState, Json } from "../types";
import { checkView } from "./view-checks";

// What must hold after every write the engine makes, in any game. The test
// helpers (testing.ts) check every write a test makes through them, and the
// random games (simulation.ts) every write they make.

/** Checks the state a write left, and every seat's view of it. `before` is
 *  the state the write was made on, when there was one. A test may set up a
 *  state no game could reach (a tile taken out of the game, a figure past
 *  its supply) to reach a rule's edge; the write is then held to breaking
 *  nothing more than it was given. */
export function checkWrite(
  engine: Engine,
  before: GameState | null,
  after: GameState,
): void {
  const found = violations(engine, after);
  if (found.length === 0) return;
  const given = new Set(before === null ? [] : violations(engine, before));
  const made = found.filter((v) => !given.has(v));
  if (made.length > 0) throw new Error(made.join("\n"));
}

/** Throws when the state breaks any rule every game state must hold, for
 *  a caller that checks its own writes (the random games). */
export function checkState(engine: Engine, state: GameState): void {
  const found = stateViolations(engine, state);
  if (found.length > 0) throw new Error(found.join("\n"));
}

/** Every rule the state or a seat's view of it breaks, each named once per
 *  card, tile or figure, so a test's own setup can be told from the write.
 *  Every seat's view is checked, and the spectator's. */
function violations(engine: Engine, state: GameState): string[] {
  const found = stateViolations(engine, state);
  const viewers = state.seats.map((_s, i) => i);
  for (const viewer of [...viewers, null])
    try {
      checkView(engine, state, viewer);
    } catch (error) {
      found.push(error instanceof Error ? error.message : String(error));
    }
  return found;
}

function stateViolations(engine: Engine, state: GameState): string[] {
  const found: string[] = [];
  const saved = JSON.parse(JSON.stringify(state)) as { [key: string]: Json };
  if (JSON.stringify(migrate(saved)) !== JSON.stringify(state))
    found.push("The state doesn't survive saving and loading");
  status(engine, state, found);
  traits(engine, state, found);
  theDead(state, found);
  supply(engine, state, found);
  cardsAndTiles(engine, state, found);
  return found;
}

function status(engine: Engine, state: GameState, found: string[]): void {
  if (state.status === "exploring") {
    if (state.haunt !== null) found.push("A haunt is recorded before the haunt");
    if (state.pending === null) found.push("Exploration stopped with nothing pending");
  } else if (state.status === "haunt") {
    // Only a haunt that isn't built yet stops the game at its reveal.
    if (state.pending === null && activeHaunt(engine, state) !== null)
      found.push("The haunt stopped with nothing pending");
  } else if (state.status === "finished") {
    if (state.result === null) found.push("A finished game has no result");
    if (state.pending !== null || state.work.length > 0)
      found.push("A finished game still has something to do");
  } else {
    found.push(`Unexpected status ${state.status}`);
  }
  if (state.status !== "finished" && state.result !== null)
    found.push("A game still being played has a result");
  // Before the haunt only a card or room may make an attack (p. 13).
  if (
    state.status === "exploring" &&
    state.lastEvents.some((e) => e.type === "attacked" && e.rule.source === "rulebook")
  )
    found.push("An explorer took the attack action before the haunt");
}

/** Every clip is on its track: at or above its lowest value, never past its
 *  highest (p. 5). */
function traits(engine: Engine, state: GameState, found: string[]): void {
  for (const figure of allFigures(state)) {
    const source = engine.catalog.figures[figure.definition].traits;
    if (figure.traits.kind === "fixed") {
      if (source.kind !== "fixed")
        found.push(`${figure.id} has no clips, but its definition has tracks`);
      continue;
    }
    if (source.kind !== "tracks") {
      found.push(`${figure.id} has clips, but its definition has no tracks`);
      continue;
    }
    for (const trait of TRAITS) {
      const clip = figure.traits.clips[trait];
      const top = source.tracks[trait].length - 1;
      if (!Number.isInteger(clip) || clip < 0 || clip > top)
        found.push(`${figure.id}'s ${trait} clip is at ${clip}, off its track (0 to ${top})`);
    }
  }
}

/** A dead figure takes no part: no turn waits on it to act, and no
 *  decision is put to anyone about it. */
function theDead(state: GameState, found: string[]): void {
  const pending = state.pending?.type === "decision" ? state.pending : null;
  if (pending === null) return;
  const dead = (id: string) => !state.figures[id].alive;
  const acting = state.turn?.acting ?? null;
  if (pending.kind === "turn" && acting !== null && dead(acting))
    found.push(`${acting} is dead but the turn waits on it to act`);
  if (pending.about !== null && dead(pending.about))
    found.push(`${pending.about} is dead but a decision (${pending.kind}) is about it`);
}

/** No more of a figure is in play than its supply, where a haunt caps one
 *  (tokens.md). */
function supply(engine: Engine, state: GameState, found: string[]): void {
  const definitions = new Set(
    allFigures(state)
      .filter((f) => f.kind !== "explorer")
      .map((f) => f.definition),
  );
  for (const definition of definitions) {
    const cap = askNumber(engine, state, "supply", { definition });
    const inPlay = figuresInPlay(state, definition);
    if (inPlay > cap) found.push(`${inPlay} ${definition} are in play, over a supply of ${cap}`);
  }
}

/** Every card and every room tile is in exactly one place, and every figure
 *  stands in a room that is in the house. */
function cardsAndTiles(engine: Engine, state: GameState, found: string[]): void {
  const once = (what: string, places: string[], all: string[]) => {
    const seen = new Map<string, number>();
    for (const id of places) seen.set(id, (seen.get(id) ?? 0) + 1);
    for (const id of all)
      if (!seen.has(id)) found.push(`The ${what} ${id} is nowhere`);
    for (const [id, times] of seen)
      if (times > 1) found.push(`The ${what} ${id} is in ${times} places`);
  };

  once(
    "card",
    [
      ...(["omen", "item", "event"] as CardType[]).flatMap((type) => [
        ...state.decks[type].draw,
        ...state.decks[type].discard,
      ]),
      ...allFigures(state).flatMap((f) => f.cards),
      ...Object.values(state.piles).flat(),
      ...state.ongoing,
      ...state.aside.map((a) => a.card),
      ...state.inHand,
    ],
    Object.values(engine.catalog.cards)
      .filter((c) => state.sets.includes(c.set))
      .map((c) => c.id),
  );
  once(
    "room tile",
    [
      ...state.board.tiles.map((t) => t.tile),
      ...state.board.stack,
      ...state.board.discards,
      ...(state.board.drawn === null ? [] : [state.board.drawn]),
    ],
    Object.values(engine.catalog.rooms)
      .filter((r) => state.sets.includes(r.set))
      .map((r) => r.id),
  );

  for (const figure of allFigures(state)) {
    const room = figure.place?.room;
    if (room !== undefined && !state.board.tiles.some((t) => t.tile === room))
      found.push(`${figure.id} is in ${room}, which isn't in the house`);
  }
}
