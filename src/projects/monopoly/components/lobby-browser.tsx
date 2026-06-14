"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Plus, RefreshCw } from "lucide-react";
import { useProfile } from "@/shared/lib/profile";
import { ProfileEditor } from "@/shared/components/profile-editor";
import { listGames, type GameSummary } from "../sync";
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
 *  and refreshed on demand. */
export function LobbyBrowser({ onOpen }: Props) {
  const [games, setGames] = useState<GameSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    refresh();
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
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider" style={{ color: "var(--mono-rail)" }}>
              Games
              {games && games.length > 0 ? ` (${games.length.toString()})` : ""}
            </h2>
            <button
              type="button"
              onClick={refresh}
              aria-label="Refresh games"
              className="rounded-md p-1.5 transition-colors hover:bg-white/10"
              style={{ color: "var(--mono-rail)" }}
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

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
            <ul className="flex flex-col gap-2">
              {games.map((game) => (
                <GameRow key={game.id} game={game} onOpen={onOpen} />
              ))}
            </ul>
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
}: {
  game: GameSummary;
  onOpen: (gameId: string) => void;
}) {
  const myId = useProfile((s) => s.id);
  const inGame = game.players.some((p) => p.id === myId);
  const isLobby = game.status === "lobby";
  // Wording tracks what opening the row does for this user: rejoin a seat,
  // sit down in a lobby, or spectate a game already in play.
  const cta = inGame ? "Rejoin" : isLobby ? "Join" : "Watch";

  return (
    <li>
      <button
        type="button"
        onClick={() => { onOpen(game.id); }}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors hover:brightness-125"
        style={{ backgroundColor: "var(--mono-card)" }}
      >
        <span className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1">
          {game.players.map((p) => (
            <span key={p.id} className="flex items-center gap-1.5">
              <PlayerToken player={p} className="h-6 w-6" />
              <span className="text-sm font-medium">{p.name}</span>
            </span>
          ))}
        </span>
        <span className="flex flex-col items-end gap-0.5">
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
