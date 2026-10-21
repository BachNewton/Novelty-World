import type { PlayerProfile } from "@/shared/lib/profile";
import type { Answer, RiskEngine } from "../contract";
import { isBotId, seatBot } from "./seat-bots";
import { botInput, extendHistory, replayHistory, type History } from "./drive-input";
import { applyAnswer, newOnlineGame, pendingSeat, STALE_DECISION, tookAnswer } from "./game";
import type { Request, Response } from "./protocol";
import { botToMove, controllerOf, MAX_PLAYERS, MIN_PLAYERS, seatOf, type Controller, type GameRow, type LoggedMove, type Status } from "./table";

/*
 * The single writer's logic, behind two seams: the engine, and the database
 * as a `RowStore`. Every operation goes through one commit routine: read the
 * row, work out the next one, and write it only if the version is unchanged,
 * starting again from a fresh read when another write got there first.
 */

/** What a write changes. The version is raised by the store. */
export type RowChange = Pick<GameRow, "status" | "seats" | "game">;

export interface RowStore {
  read: (id: string) => Promise<GameRow | null>;
  /** Writes only if the row is still at `fromVersion`, and logs the answer the write takes in
   *  the same transaction; null when another write got there first. */
  write: (id: string, fromVersion: number, change: RowChange, answer: LoggedMove | null) => Promise<GameRow | null>;
  /** Creates a row at version 0; null when the id is taken. */
  insert: (id: string, change: RowChange) => Promise<GameRow | null>;
  /** The game's move log, in decision order. */
  moves: (id: string) => Promise<LoggedMove[]>;
  /** Deletes the row and its move log, only if it is still at `atVersion` when one is given; the
   *  row as it was, or null when there was none (or it had moved on). */
  remove: (id: string, atVersion?: number) => Promise<GameRow | null>;
}

export type Step =
  | { kind: "rejected"; reason: string }
  | { kind: "unchanged" }
  | { kind: "changed"; change: RowChange; answer: LoggedMove | null }
  /** Deletes the game: a commit that removes answers with the row as it was. */
  | { kind: "removed" };

/** How many times a commit re-reads after losing the race to another write. Each loss means
 *  another write landed, so the game is moving; the bound turns a storm of them into an error. */
export const COMMIT_ATTEMPTS = 8;

export async function commit(store: RowStore, id: string, step: (row: GameRow) => Step): Promise<Response> {
  for (let attempt = 0; attempt < COMMIT_ATTEMPTS; attempt++) {
    const row = await store.read(id);
    if (!row) return { ok: false, reason: GONE, row: null };
    const next = step(row);
    if (next.kind === "rejected") return { ok: false, reason: next.reason, row };
    if (next.kind === "unchanged") return { ok: true, row };
    if (next.kind === "removed") {
      const removed = await store.remove(id, row.version);
      if (removed) return { ok: true, row: removed };
      continue;
    }
    const written = await store.write(id, row.version, next.change, next.answer);
    if (written) return { ok: true, row: written };
  }
  throw new Error(`Game ${id}: lost the write race ${COMMIT_ATTEMPTS.toString()} times running`);
}

const GONE = "That table is gone";
const NO_SUCH_BOT = "There's no such bot";

const rejected = (reason: string): Step => ({ kind: "rejected", reason });
const changed = (row: GameRow, change: Partial<RowChange>, answer: LoggedMove | null = null): Step => ({
  kind: "changed",
  change: { status: row.status, seats: row.seats, game: row.game, ...change },
  answer,
});

function inLobby(row: GameRow, profileId: string, then: () => Step): Step {
  if (row.status !== "lobby") return rejected("The game has already started");
  if (seatOf(row, profileId) === null) return rejected("Join the game first");
  return then();
}

/** Leaving a table only changes it when the leaver made a table no one else has joined: a
 *  gathering table where they are the only person seated (bots don't count) is deleted, so it
 *  doesn't linger in the lobby. Anyone else leaving keeps their seat to come back to. */
export function leaveStep(row: GameRow, profileId: string): Step {
  if (row.status !== "lobby" || seatOf(row, profileId) === null) return { kind: "unchanged" };
  const someoneElse = row.seats.some((c) => c.kind === "human" && c.profile.id !== profileId);
  return someoneElse ? { kind: "unchanged" } : { kind: "removed" };
}

/** An answer applied: the decision it names must be pending, else a repeat of one that landed
 *  is accepted as it is and anything else is rejected. The game's end ends the row's play. */
export function answerStep(engine: RiskEngine, row: GameRow, answer: Answer): Step {
  if (row.status === "lobby" || !row.game) return rejected("The game hasn't started");
  if (answer.decision !== row.game.decision) return tookAnswer(row.game, answer) ? { kind: "unchanged" } : rejected(STALE_DECISION);
  const result = applyAnswer(engine, row.game, answer);
  if (!result.ok) return rejected(result.reason);
  const status: Status = pendingSeat(engine, result.game) === null ? "over" : "playing";
  return changed(row, { game: result.game, status }, { ...answer, controller: controllerOf(row, answer.seat) });
}

export interface ServerDeps {
  engine: RiskEngine;
  store: RowStore;
  /** A fresh row id: the table's key in the database and the open lobby, never shown. */
  newId: () => string;
  /** A fresh game seed. */
  newSeed: () => string;
}

/** The seat a person takes, with the Elo their device brought. */
const person = ({ profile, elo }: { profile: PlayerProfile; elo?: number }): Controller =>
  elo === undefined ? { kind: "human", profile } : { kind: "human", profile, elo };

/** How many fresh ids creating a game tries before it gives up loudly. */
const CREATE_ATTEMPTS = 8;

/** Handles one request. The caller drives the bots afterwards when `botToMove` says so, unless
 *  the request deleted the game: a delete, and a leave that deletes, answer with the row as it
 *  was. */
export async function handle(deps: ServerDeps, request: Request): Promise<Response> {
  const { engine, store } = deps;
  switch (request.op) {
    case "create": {
      const seats: Controller[] = [person(request)];
      for (let attempt = 0; attempt < CREATE_ATTEMPTS; attempt++) {
        const row = await store.insert(deps.newId(), { status: "lobby", seats, game: null });
        if (row) return { ok: true, row };
      }
      throw new Error(`Couldn't find a free row id in ${CREATE_ATTEMPTS.toString()} tries`);
    }
    case "join":
      return commit(store, request.game, (row) => {
        const seat = seatOf(row, request.profile.id);
        if (seat !== null) {
          // Coming back keeps the Elo the seat was taken with: it is what the table is rated at.
          const current = controllerOf(row, seat);
          const elo = current.kind === "human" ? current.elo : undefined;
          const seats = row.seats.with(seat, person({ profile: request.profile, elo }));
          return JSON.stringify(seats) === JSON.stringify(row.seats) ? { kind: "unchanged" } : changed(row, { seats });
        }
        if (row.status !== "lobby") return rejected("The game has already started");
        if (row.seats.length >= MAX_PLAYERS) return rejected("The table is full");
        return changed(row, { seats: [...row.seats, person(request)] });
      });
    case "add-bot": {
      const { bot } = request;
      return commit(store, request.game, (row) =>
        inLobby(row, request.profile.id, () => {
          if (!isBotId(bot)) return rejected(NO_SUCH_BOT);
          return row.seats.length >= MAX_PLAYERS ? rejected("The table is full") : changed(row, { seats: [...row.seats, { kind: "bot", bot }] });
        }),
      );
    }
    case "remove-seat":
      return commit(store, request.game, (row) =>
        inLobby(row, request.profile.id, () => {
          if (request.seat >= row.seats.length) return rejected("That seat is empty");
          const seats = row.seats.filter((_, i) => i !== request.seat);
          return seats.some((c) => c.kind === "human") ? changed(row, { seats }) : rejected("A game needs someone to play it");
        }),
      );
    case "start":
      return commit(store, request.game, (row) => {
        if (row.status !== "lobby") return seatOf(row, request.profile.id) === null ? rejected("The game has already started") : { kind: "unchanged" };
        return inLobby(row, request.profile.id, () => {
          if (row.seats.length < MIN_PLAYERS) return rejected(`A game needs at least ${MIN_PLAYERS.toString()} players`);
          const game = newOnlineGame(engine, row.seats.length, deps.newSeed());
          return changed(row, { status: "playing", game });
        });
      });
    case "move":
      return commit(store, request.game, (row) => {
        const { answer } = request;
        if (answer.seat >= row.seats.length) return rejected("That seat isn't at the table");
        const controller = controllerOf(row, answer.seat);
        if (controller.kind !== "human" || controller.profile.id !== request.profile.id) return rejected("That seat isn't yours");
        return answerStep(engine, row, answer);
      });
    case "leave":
      return commit(store, request.game, (row) => leaveStep(row, request.profile.id));
    case "nudge": {
      const row = await store.read(request.game);
      return row ? { ok: true, row } : { ok: false, reason: GONE, row: null };
    }
    case "delete": {
      const row = await store.remove(request.game);
      return row ? { ok: true, row } : { ok: false, reason: GONE, row: null };
    }
  }
}

/** How many decisions one drive makes before it hands on to a fresh one (`more`), so a long run
 *  of bot turns never meets a function's time limit. */
export const DRIVE_DECISIONS = 300;

/**
 * Plays the bot seats while the game waits on one. Idempotent: it acts only
 * on the decision pending, and its answer names it, so a drive that runs
 * twice, or alongside another, only ever lands one answer per decision. Each
 * bot sees only what its seat may know (`botInput`): the game's history is
 * replayed from the move log once per drive, then grown by each answer it lands.
 *
 * A bot's illegal move is a bug in the bot, and the drive fails loudly on it:
 * a bot is deterministic, so asking it again gives the same move, and playing
 * another bot's move instead would hide the bug behind a game that plays on.
 */
export async function drive(deps: Pick<ServerDeps, "engine" | "store">, id: string): Promise<"done" | "more"> {
  const { engine, store } = deps;
  let history: History | null = null;
  for (let made = 0; made < DRIVE_DECISIONS; made++) {
    const row = await store.read(id);
    if (!row) return "done";
    const toMove = botToMove(engine, row);
    if (!toMove) return "done";
    const { seat, game } = toMove;
    const controller = controllerOf(row, seat);
    if (controller.kind !== "bot") throw new Error("A bot seat lost its bot mid-drive");
    history = (history && extendHistory(history, game)) ?? replayHistory(engine, game, await store.moves(id));
    const humans = row.seats.map((c) => c.kind === "human");
    const input = botInput(engine, game, history, humans, seat, `${id}/${game.decision.toString()}`);
    const answer: Answer = { decision: game.decision, seat, move: seatBot(controller.bot).bot(input) };
    const tried = applyAnswer(engine, game, answer);
    if (!tried.ok) {
      throw new Error(`Risk game ${id}: bot "${controller.bot}" at seat ${seat.toString()} made an illegal move at decision ${game.decision.toString()} (${tried.reason}): ${JSON.stringify(answer.move)}`);
    }
    const result = await commit(store, id, (current) => answerStep(engine, current, answer));
    // Rejected only because the decision moved on (another drive answered it): read again.
    if (!result.ok && result.reason !== STALE_DECISION) throw new Error(`Risk game ${id}: the bot's move was rejected: ${result.reason}`);
  }
  return "more";
}
