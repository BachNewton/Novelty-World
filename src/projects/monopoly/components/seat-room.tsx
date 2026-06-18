"use client";

import { useEffect } from "react";
import { Bot, LogOut, Play, Plus, X } from "lucide-react";
import { useProfile } from "@/shared/lib/profile";
import { ProfileEditor } from "@/shared/components/profile-editor";
import { PLAYER_COLORS, PLAYER_ICONS } from "../data";
import { MAX_PLAYERS, MIN_PLAYERS } from "../lobby";
import { useMonopolyStore } from "../store";
import { PLAYER_COLOR_VAR } from "../theme";
import type { Player, PlayerColor, PlayerIcon } from "../types";
import { PLAYER_ICON_COMPONENTS } from "./player-token";

interface Props {
  /** The connected game id, shown as a shareable code. */
  gameId: string;
  /** Return to the lobby browser (used by Leave / Back). */
  onExit: () => void;
}

/** Pre-game seat room for a `lobby`-status game: shows the roster, lets the
 *  local player tune their own token, add or kick bots, and start once the
 *  roster is valid. A spectator (not yet seated) sees a Join button. When
 *  someone starts, `status` flips to `active` and the parent swaps in the
 *  board. */
export function SeatRoom({ gameId, onExit }: Props) {
  const players = useMonopolyStore((s) => s.state.players);
  const myPlayerId = useMonopolyStore((s) => s.myPlayerId);
  const syncError = useMonopolyStore((s) => s.syncError);
  const joinGame = useMonopolyStore((s) => s.joinGame);
  const addBot = useMonopolyStore((s) => s.addBot);
  const removePlayer = useMonopolyStore((s) => s.removePlayer);
  const startGame = useMonopolyStore((s) => s.startGame);
  const profileName = useProfile((s) => s.name);

  const seated = myPlayerId !== null;
  const full = players.length >= MAX_PLAYERS;
  const humans = players.filter((p) => p.botStrategy === null).length;
  const canStart = players.length >= MIN_PLAYERS && humans >= 1;

  // Keep the local player's seat name in sync with their profile. The seat
  // is seeded from the profile on join; a later rename via ProfileEditor
  // pushes through here. Guarded on a real difference so the converged state
  // (seat name === profile name) doesn't loop.
  const setName = useMonopolyStore((s) => s.setName);
  useEffect(() => {
    if (!myPlayerId) return;
    const mine = players.find((p) => p.id === myPlayerId);
    if (mine && mine.name !== profileName) setName(myPlayerId, profileName);
  }, [myPlayerId, players, profileName, setName]);

  function handleLeave() {
    if (myPlayerId) removePlayer(myPlayerId);
    onExit();
  }

  return (
    <div
      className="flex min-h-[100dvh] w-full flex-col items-center overflow-y-auto px-4 py-10"
      style={{ color: "var(--mono-ink)" }}
    >
      <div className="flex w-full max-w-lg flex-col gap-6">
        <header className="text-center">
          <h1 className="text-2xl font-black tracking-tight">Game Lobby</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--mono-rail)" }}>
            Code: <span className="font-mono font-bold" style={{ color: "var(--mono-orange)" }}>{gameId}</span>
          </p>
          <ProfileEditor />
        </header>

        <ul className="flex flex-col gap-2">
          {players.map((player) => (
            <SeatRow
              key={player.id}
              player={player}
              isMine={player.id === myPlayerId}
              onKick={player.botStrategy !== null ? () => { removePlayer(player.id); } : undefined}
            />
          ))}
        </ul>

        {seated && (
          <button
            type="button"
            onClick={addBot}
            disabled={full}
            className="flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors hover:brightness-125 disabled:opacity-40"
            style={{ backgroundColor: "var(--mono-card)", color: "var(--mono-ink)" }}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add Bot
          </button>
        )}

        {syncError !== null && (
          <p className="rounded-md px-3 py-2 text-sm" style={{ backgroundColor: "var(--mono-card)", color: "var(--mono-red)" }}>
            {syncError}
          </p>
        )}

        <div className="flex flex-col gap-2">
          {seated ? (
            <>
              <button
                type="button"
                onClick={startGame}
                disabled={!canStart}
                className="flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-base font-bold transition-opacity hover:opacity-90 disabled:opacity-40"
                style={{ backgroundColor: "var(--mono-green)", color: "var(--mono-frame)" }}
              >
                <Play className="h-5 w-5" aria-hidden="true" />
                Start Game
              </button>
              {!canStart && (
                <p className="text-center text-xs" style={{ color: "var(--mono-rail)" }}>
                  Need at least {MIN_PLAYERS} players to start.
                </p>
              )}
            </>
          ) : (
            <button
              type="button"
              onClick={joinGame}
              disabled={full}
              className="flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-base font-bold transition-opacity hover:opacity-90 disabled:opacity-40"
              style={{ backgroundColor: "var(--mono-orange)", color: "var(--mono-frame)" }}
            >
              {full ? "Lobby Full" : "Join Game"}
            </button>
          )}

          <button
            type="button"
            onClick={handleLeave}
            className="flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm transition-colors hover:opacity-80"
            style={{ color: "var(--mono-rail)" }}
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            {seated ? "Leave" : "Back"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SeatRow({
  player,
  isMine,
  onKick,
}: {
  player: Player;
  isMine: boolean;
  onKick?: () => void;
}) {
  const Icon = PLAYER_ICON_COMPONENTS[player.icon];
  return (
    <li
      className="flex flex-col gap-3 rounded-lg px-3 py-3"
      style={{
        backgroundColor: "var(--mono-card)",
        boxShadow: isMine ? "inset 0 0 0 2px var(--mono-orange)" : undefined,
      }}
    >
      <div className="flex items-center gap-3">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: PLAYER_COLOR_VAR[player.color], color: "white" }}
        >
          <Icon strokeWidth={2.5} className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="flex-1 truncate font-semibold">{player.name}</span>
        {player.botStrategy !== null ? (
          <span className="flex items-center gap-1 text-xs" style={{ color: "var(--mono-rail)" }}>
            <Bot className="h-3.5 w-3.5" aria-hidden="true" /> Bot
          </span>
        ) : isMine ? (
          <span className="text-xs font-semibold" style={{ color: "var(--mono-orange)" }}>You</span>
        ) : null}
        {onKick && (
          <button
            type="button"
            onClick={onKick}
            aria-label={`Remove ${player.name}`}
            className="rounded p-1 transition-colors hover:bg-white/10"
            style={{ color: "var(--mono-rail)" }}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {isMine && <SeatPickers player={player} />}
    </li>
  );
}

/** Color + icon pickers for the local player's own seat. A swatch / glyph
 *  another seat already holds is disabled — uniqueness is also enforced
 *  server-side, but greying the taken option avoids a pointless round-trip. */
function SeatPickers({ player }: { player: Player }) {
  const players = useMonopolyStore((s) => s.state.players);
  const setColor = useMonopolyStore((s) => s.setColor);
  const setIcon = useMonopolyStore((s) => s.setIcon);

  const colorTaken = (color: PlayerColor) =>
    players.some((p) => p.id !== player.id && p.color === color);
  const iconTaken = (icon: PlayerIcon) =>
    players.some((p) => p.id !== player.id && p.icon === icon);

  return (
    <div className="flex flex-col gap-2 pl-12">
      <div className="flex flex-wrap gap-1.5">
        {PLAYER_COLORS.map((color) => {
          const taken = colorTaken(color);
          const selected = player.color === color;
          return (
            <button
              key={color}
              type="button"
              onClick={() => { setColor(player.id, color); }}
              disabled={taken}
              aria-label={`Color ${color}`}
              aria-pressed={selected}
              className="h-6 w-6 rounded-full transition-transform hover:scale-110 disabled:cursor-not-allowed disabled:opacity-25 disabled:hover:scale-100"
              style={{
                backgroundColor: PLAYER_COLOR_VAR[color],
                boxShadow: selected ? "0 0 0 2px var(--mono-ink)" : undefined,
              }}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {PLAYER_ICONS.map((icon) => {
          const Glyph = PLAYER_ICON_COMPONENTS[icon];
          const taken = iconTaken(icon);
          const selected = player.icon === icon;
          return (
            <button
              key={icon}
              type="button"
              onClick={() => { setIcon(player.id, icon); }}
              disabled={taken}
              aria-label={`Icon ${icon}`}
              aria-pressed={selected}
              className="flex h-7 w-7 items-center justify-center rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-25"
              style={{
                backgroundColor: selected ? "var(--mono-orange)" : "var(--mono-board)",
                color: selected ? "var(--mono-frame)" : "var(--mono-ink)",
              }}
            >
              <Glyph strokeWidth={2.5} className="h-4 w-4" aria-hidden="true" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
