import { viewFor, type GameView } from "../engine/view";
import type { Engine } from "../engine/step-loop";
import type { CardType, GameState, Json } from "../types";
import { HEROES_ONLY, SIGIL, TRAITOR_ONLY } from "./toy-haunt";

// What every view of a game must hold, whatever the game: it survives JSON,
// and it carries nothing its viewer may not see. The checks look for the
// hidden material itself in the view, not for a flag saying it is hidden.

/** Every string and number in a value. */
function leaves(value: unknown, into: (string | number)[] = []): (string | number)[] {
  if (typeof value === "string" || typeof value === "number") into.push(value);
  else if (Array.isArray(value)) for (const item of value) leaves(item, into);
  else if (typeof value === "object" && value !== null)
    for (const item of Object.values(value)) leaves(item, into);
  return into;
}

function knowsSide(state: GameState, viewer: number | null, seat: number): boolean {
  const { knownBy } = state.seats[seat];
  return knownBy === null || (viewer !== null && knownBy.includes(viewer));
}

/** The view's material outside the latest write's events and outside the
 *  question put to the viewer itself: those may name a card a seat has just
 *  seen go back into a deck, or offer the viewer cards it is searching. */
function standing(view: GameView): Omit<GameView, "events" | "pending"> & {
  pending: Json;
} {
  const { events: _events, pending, ...rest } = view;
  const own = pending?.type === "decision" && pending.detail !== null;
  return {
    ...rest,
    pending: own ? { ...pending, detail: null } : (pending as Json),
  };
}

/** Ids that name a room tile or card but nothing else in the catalogue, so
 *  finding one in a view means that tile or card. */
function unambiguous(engine: Engine, ids: string[]): string[] {
  const { rooms, cards, tokens, figures } = engine.catalog;
  return ids.filter(
    (id) =>
      [id in rooms, id in cards, id in tokens, id in figures].filter(Boolean)
        .length === 1,
  );
}

/** Throws, naming the leak, when a view carries something its viewer may
 *  not see. */
export function checkView(engine: Engine, state: GameState, viewer: number | null): void {
  const view = viewFor(engine, state, viewer);
  const who = viewer === null ? "the spectator" : `seat ${viewer}`;
  const fail = (what: string) => {
    throw new Error(`The view for ${who} ${what}`);
  };

  const text = JSON.stringify(view);
  if (JSON.stringify(JSON.parse(text)) !== text) fail("doesn't survive JSON");
  const all = leaves(view);
  if (all.includes(state.seed)) fail("carries the seed");

  // The order of the stacks: none of their contents, only their sizes.
  const shown = new Set(leaves(standing(view)));
  const decks: CardType[] = ["omen", "item", "event"];
  const hidden = unambiguous(engine, [
    ...state.board.stack,
    ...decks.flatMap((type) => state.decks[type].draw),
  ]);
  const seen = hidden.filter((id) => shown.has(id));
  if (seen.length > 0) fail(`shows what is in the stacks: ${seen.join(", ")}`);

  // Sides: a seat's side and roles only where the viewer knows them, and no
  // list of seats that would give one away.
  const anyHidden = state.seats.some((_s, i) => !knowsSide(state, viewer, i));
  state.seats.forEach((_seat, i) => {
    if (knowsSide(state, viewer, i)) return;
    const seen = view.seats[i];
    if (!seen.hidden || seen.side !== null || seen.roles.length > 0)
      fail(`shows seat ${i}'s hidden side`);
    for (const figure of Object.values(view.figures))
      if (figure.kind !== "explorer" && figure.owner === i)
        fail(`shows that seat ${i} owns ${figure.id}`);
    for (const event of view.events) {
      const data = event.data as { [key: string]: Json } | null;
      if (event.type === "side-set" && data?.seat === i && "side" in data)
        fail(`shows seat ${i}'s side in an event`);
    }
  });
  if (anyHidden) {
    for (const event of view.events)
      if (event.type === "secret-set" && "knownBy" in (event.data as object))
        fail("names who knows a secret, giving a hidden side away");
    for (const secret of view.haunt?.secrets ?? [])
      if (secret.knownBy !== undefined)
        fail(`names who knows the ${secret.id}, giving a hidden side away`);
  }

  // Secrets: their values only for the seats that know them.
  for (const secret of state.haunt?.secrets ?? []) {
    const knows =
      secret.knownBy === null || (viewer !== null && secret.knownBy.includes(viewer));
    if (knows) continue;
    const seenSecret = view.haunt?.secrets.find((s) => s.id === secret.id);
    if (seenSecret?.known !== false) fail(`knows the ${secret.id}`);
    if (secret.id === "sigil" && all.includes(SIGIL)) fail("shows the sigil's value");
  }

  // The haunt's halves: only the viewer's own side's.
  const side =
    viewer !== null && knowsSide(state, viewer, viewer)
      ? state.seats[viewer].side
      : null;
  const traitorHalf = all.some((v) => typeof v === "string" && v.includes(TRAITOR_ONLY));
  const heroesHalf = all.some((v) => typeof v === "string" && v.includes(HEROES_ONLY));
  if (traitorHalf && side !== "traitor") fail("shows the traitor's half");
  if (heroesHalf && side !== "heroes") fail("shows the heroes' half");

  // A haunt ruling, only to the seats that may read the half its note is in.
  const texts = state.haunt && engine.haunts[state.haunt.number]?.texts;
  for (const half of ["traitor", "heroes"] as const) {
    if (!texts || half === side) continue;
    for (const [, id] of texts[half].text.matchAll(/> Note \[([a-z0-9-]+)\]/g))
      if (all.includes(id)) fail(`cites the ruling ${id} from the ${half} half`);
  }

  // The pending decision: in full only for its addressees.
  const pending = state.pending;
  if (
    pending?.type === "decision" &&
    view.pending?.type === "decision" &&
    !(viewer !== null && pending.seats.includes(viewer)) &&
    view.pending.detail !== null
  )
    fail("shows a decision put to someone else");

  // What a figure looked at, only for the seat that looked.
  for (const event of view.events) {
    const data = event.data as { [key: string]: Json };
    const looked =
      (event.type === "deck-stacked" && "card" in data) ||
      (event.type === "room-stack-seen" && "tile" in data);
    if (!looked) continue;
    const owner = state.figures[data.figure as string].owner;
    if (owner !== viewer) fail(`shows what ${String(data.figure)} looked at`);
  }
}

/** Checks every seat's view of a state, and a spectator's. */
export function checkViews(engine: Engine, state: GameState): void {
  for (const viewer of [...state.seats.map((_s, i) => i), null])
    checkView(engine, state, viewer);
}
