"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Plus, Trash2, Trophy } from "lucide-react";
import { useProfile } from "@/shared/lib/profile";
import { useHoldToActivate } from "@/shared/lib/use-hold-to-activate";
import { ProfileEditor } from "@/shared/components/profile-editor";
import { deleteGame, listGames, subscribeGames, type GameSummary } from "../sync";
import { PlayerToken } from "./player-token";

interface Props {
  /** Open a game by id — sets `?game=<id>` and connects. */
  onOpen: (gameId: string) => void;
}

/** A short, URL-friendly game code. Avoids the reserved `dev` sandbox id. */
function newGameId(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const code = Array.from(bytes, (b) => b.toString(36).padStart(2, "0"))
    .join("")
    .slice(0, 6);
  return code === "dev" ? newGameId() : code;
}

/** The no-`?game=` front door: browse open games, create one, or set your
 *  name. Creating mints a fresh id and opens it; `connect` seeds the lobby on
 *  first open. The list is derived from each row's state JSON via `listGames`
 *  and kept live by a table-wide subscription. */
export function LobbyBrowser({ onOpen }: Props) {
  const [games, setGames] = useState<GameSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The game awaiting a delete confirmation, or null when no dialog is open.
  const [pendingDelete, setPendingDelete] = useState<GameSummary | null>(null);

  // State updates happen only in the promise callbacks (never synchronously
  // in the effect body), so a fetch doesn't trigger a cascading render.
  const refresh = useCallback(() => {
    listGames()
      .then((list) => {
        setGames(list);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
        setGames([]);
      });
  }, []);

  // Fetch once on mount, then keep the list live: any insert/update/delete to
  // the games table triggers a re-fetch. An active game in the list writes on
  // every move, so coalesce bursts into at most one re-fetch per window rather
  // than refetching per change.
  useEffect(() => {
    refresh();
    let pending: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = subscribeGames(() => {
      if (pending !== null) return;
      pending = setTimeout(() => {
        pending = null;
        refresh();
      }, 250);
    });
    return () => {
      if (pending !== null) clearTimeout(pending);
      unsubscribe();
    };
  }, [refresh]);

  return (
    <div
      className="flex min-h-[100dvh] w-full flex-col items-center overflow-y-auto px-4 py-10"
      style={{ color: "var(--mono-ink)" }}
    >
      <div className="flex w-full max-w-lg flex-col gap-6">
        <header className="text-center">
          <h1 className="text-3xl font-black tracking-tight">Monopoly</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--mono-rail)" }}>
            Create a game or join one in progress.
          </p>
          <ProfileEditor />
        </header>

        <button
          type="button"
          onClick={() => { onOpen(newGameId()); }}
          className="flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-base font-bold transition-opacity hover:opacity-90"
          style={{ backgroundColor: "var(--mono-orange)", color: "var(--mono-frame)" }}
        >
          <Plus className="h-5 w-5" aria-hidden="true" />
          New Game
        </button>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-bold uppercase tracking-wider" style={{ color: "var(--mono-rail)" }}>
            Games
            {games && games.length > 0 ? ` (${games.length.toString()})` : ""}
          </h2>

          {error !== null && (
            <p className="rounded-md px-3 py-2 text-sm" style={{ backgroundColor: "var(--mono-card)", color: "var(--mono-red)" }}>
              {error}
            </p>
          )}

          {games === null ? (
            <div className="flex justify-center py-8" style={{ color: "var(--mono-rail)" }}>
              <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
            </div>
          ) : games.length === 0 ? (
            <p
              className="rounded-lg px-4 py-8 text-center text-sm"
              style={{ backgroundColor: "var(--mono-card)", color: "var(--mono-rail)" }}
            >
              No games yet. Start one!
            </p>
          ) : (
            <>
              <ul className="flex flex-col gap-2">
                {games.map((game) => (
                  <GameRow
                    key={game.id}
                    game={game}
                    onOpen={onOpen}
                    onDelete={setPendingDelete}
                  />
                ))}
              </ul>
              <p className="text-center text-[0.7rem]" style={{ color: "var(--mono-rail)" }}>
                Tap to open · hold to delete
              </p>
            </>
          )}
        </section>

        <Link
          href="/"
          className="text-center text-sm transition-colors hover:opacity-80"
          style={{ color: "var(--mono-rail)" }}
        >
          ← Back to Novelty World
        </Link>
      </div>

      {pendingDelete !== null && (
        <DeleteDialog
          game={pendingDelete}
          onClose={() => { setPendingDelete(null); }}
          onDeleted={() => {
            setPendingDelete(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

/** Confirmation modal for the destructive "delete game" action. Deleting is
 *  permanent, so it always goes through this explicit confirm step. Surfaces a
 *  route error inline and keeps the dialog open so the user can retry. */
function DeleteDialog({
  game,
  onClose,
  onDeleted,
}: {
  game: GameSummary;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = useCallback(() => {
    setBusy(true);
    setError(null);
    deleteGame(game.id)
      .then((err) => {
        if (err === null) {
          onDeleted();
        } else {
          setError(err);
          setBusy(false);
        }
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
        setBusy(false);
      });
  }, [game.id, onDeleted]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgb(0 0 0 / 0.6)" }}
      onClick={busy ? undefined : onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Delete game"
        className="flex w-full max-w-sm flex-col gap-4 rounded-xl p-5"
        style={{ backgroundColor: "var(--mono-frame)", color: "var(--mono-ink)" }}
        onClick={(e) => { e.stopPropagation(); }}
      >
        <h2 className="text-lg font-black">Delete this game?</h2>
        <p className="text-sm" style={{ color: "var(--mono-rail)" }}>
          This permanently deletes the game for everyone. This can&apos;t be undone.
        </p>

        {error !== null && (
          <p
            className="rounded-md px-3 py-2 text-sm"
            style={{ backgroundColor: "var(--mono-card)", color: "var(--mono-red)" }}
          >
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg px-4 py-2 text-sm font-bold transition-colors hover:bg-white/10 disabled:opacity-50"
            style={{ color: "var(--mono-rail)" }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: "var(--mono-red)", color: "var(--mono-frame)" }}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            )}
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

/** Human-readable "last played" stamp from the row's ISO `updated_at`, in the
 *  viewer's locale and timezone (e.g. "Jun 14, 3:42 PM"). */
function formatLastPlayed(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function GameRow({
  game,
  onOpen,
  onDelete,
}: {
  game: GameSummary;
  onOpen: (gameId: string) => void;
  onDelete: (game: GameSummary) => void;
}) {
  const myId = useProfile((s) => s.id);
  const inGame = game.players.some((p) => p.id === myId);
  const isLobby = game.status === "lobby";
  const isFinished = game.status === "finished";
  // The winner of a finished game is the lone survivor (matches the engine's
  // own winner check — the only non-bankrupt seat).
  const winner = isFinished
    ? game.players.find((p) => !p.bankrupt) ?? null
    : null;
  // Wording tracks what opening the row does for this user: review a finished
  // game, rejoin a seat, sit down in a lobby, or spectate a game in play.
  const cta = isFinished
    ? "Review"
    : inGame
      ? "Rejoin"
      : isLobby
        ? "Join"
        : "Watch";

  // Tap opens the game; pressing and holding requests deletion (which opens the
  // confirm dialog). A hold has no horizontal motion, so it never collides with
  // the browser's swipe-to-go-back gesture.
  const { holding, fillDurationMs, handlers } = useHoldToActivate({
    onActivate: () => { onOpen(game.id); },
    onHold: () => { onDelete(game); },
  });

  return (
    <li>
      <button
        type="button"
        {...handlers}
        aria-label={`${cta} game ${game.id}. Press and hold to delete.`}
        className="relative flex w-full select-none items-center gap-3 overflow-hidden rounded-lg px-3 py-3 text-left transition-colors hover:brightness-125"
        style={{ backgroundColor: "var(--mono-card)", WebkitTouchCallout: "none", touchAction: "manipulation" }}
      >
        {/* Hold affordance: a red wash sweeps across as the press is held, and
            snaps away instantly on release (transition only while holding). */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 w-full origin-left"
          style={{
            backgroundColor: "var(--mono-red)",
            opacity: 0.35,
            transform: holding ? "scaleX(1)" : "scaleX(0)",
            transition: holding ? `transform ${fillDurationMs.toString()}ms linear` : "none",
          }}
        />
        <span className="relative flex flex-1 flex-wrap items-center gap-x-3 gap-y-1">
          {game.players.map((p) => (
            <span key={p.id} className="flex items-center gap-1.5">
              <PlayerToken player={p} className="h-6 w-6" />
              <span className="text-sm font-medium">{p.name}</span>
            </span>
          ))}
        </span>
        <span className="relative flex flex-col items-end gap-1">
          {isFinished && (
            <span
              className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wider"
              style={
                winner
                  ? { backgroundColor: "var(--mono-green)", color: "var(--mono-frame)" }
                  : { backgroundColor: "var(--mono-neutral)", color: "var(--mono-ink)" }
              }
            >
              <Trophy className="h-3 w-3" aria-hidden="true" />
              {winner ? `${winner.name} won` : "Ended"}
            </span>
          )}
          <span className="text-sm font-semibold" style={{ color: "var(--mono-orange)" }}>
            {cta}
          </span>
          <span className="whitespace-nowrap text-[0.7rem]" style={{ color: "var(--mono-rail)" }}>
            {formatLastPlayed(game.updatedAt)}
          </span>
        </span>
      </button>
    </li>
  );
}
