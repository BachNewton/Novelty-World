"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Bot, ChevronDown, LogOut, Play, Plus, X } from "lucide-react";
import { useProfile } from "@/shared/lib/profile";
import { ProfileEditor } from "@/shared/components/profile-editor";
import { LOBBY_BOTS, type BotOption } from "../bots/roles";
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
  const isBot = player.botStrategy !== null;
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
        {isMine && (
          <span className="text-xs font-semibold" style={{ color: "var(--mono-orange)" }}>You</span>
        )}
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

      {isBot && <BotRoleSelector player={player} />}
      {isMine && <SeatPickers player={player} />}
    </li>
  );
}

/** Per-bot version selector: a compact DROPDOWN so each bot seat stays one line.
 *  The whole menu is DERIVED from the measured Elo ladder (`LOBBY_BOTS`) — a single
 *  axis, Elo = strength. There is deliberately NO "champion"/"crown" notion here:
 *  that's an evolution concept (it needs a confidence gate; see EVOLUTION.md) and
 *  must never leak into the player UI. The menu shows:
 *    - the STRONGEST bot (highest Elo across families) — the headline + default,
 *    - the best of each family (highest Elo in the family), and
 *    - every family's full version list, behind a collapsible header.
 *  Deprecated versions (no Elo, e.g. `claude-v1`) render struck-through with "???"
 *  and can't be picked. Anyone in the lobby can switch a seat, like kicking a bot.
 *  Adding a version needs no change here — the ladder re-ranks and the menu follows. */
function BotRoleSelector({ player }: { player: Player }) {
  const setStrategy = useMonopolyStore((s) => s.setStrategy);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const ref = useRef<HTMLDivElement>(null);

  // Resolve the seat's stored version to its ladder option for the trigger. A
  // lobby bot is always a real version; fall back to the raw label for an
  // unexpected value (e.g. a legacy `dumb` seat) so the trigger never blanks.
  const current = useMemo<BotOption | null>(() => {
    for (const fam of LOBBY_BOTS.families) {
      const found = fam.versions.find((o) => o.version === player.botStrategy);
      if (found) return found;
    }
    return null;
  }, [player.botStrategy]);

  // Close on an outside click or Escape — only while open, so we don't keep
  // document listeners around for every collapsed selector in the roster.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function select(version: string) {
    setStrategy(player.id, version);
    setOpen(false);
  }

  function toggleFamily(name: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  const triggerLabel = current?.version ?? player.botStrategy ?? "Bot";

  return (
    <div ref={ref} className="relative pl-12">
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); }}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-semibold transition-colors"
        style={{
          backgroundColor: "var(--mono-board)",
          color: "var(--mono-ink)",
          boxShadow: "inset 0 0 0 1px var(--mono-frame)",
        }}
      >
        <Bot className="h-3.5 w-3.5 shrink-0" aria-hidden="true" style={{ color: "var(--mono-rail)" }} />
        <span className="flex-1 truncate font-mono">{triggerLabel}</span>
        <EloTag rating={current?.rating ?? null} />
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
          style={{ color: "var(--mono-rail)" }}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-12 right-0 z-10 mt-1 max-h-72 overflow-y-auto rounded-md py-1"
          style={{ backgroundColor: "var(--mono-card)", boxShadow: "0 0 0 1px var(--mono-frame)" }}
        >
          {LOBBY_BOTS.overallBest && (
            <>
              <SectionHeading>Strongest</SectionHeading>
              <BotOptionRow
                option={LOBBY_BOTS.overallBest}
                title="Strongest"
                active={player.botStrategy === LOBBY_BOTS.overallBest.version}
                onSelect={select}
              />
            </>
          )}

          <SectionHeading>Best of each family</SectionHeading>
          {LOBBY_BOTS.families.map((fam) =>
            fam.best ? (
              <BotOptionRow
                key={fam.name}
                option={fam.best}
                title={fam.name}
                active={player.botStrategy === fam.best.version}
                onSelect={select}
              />
            ) : null,
          )}

          {LOBBY_BOTS.families.map((fam) => {
            // A family with no registered versions yet (its `FAMILY_SPECS` row is
            // kept for future snapshots) still renders — as a DISABLED header, so
            // it reads as "exists, nothing here yet" rather than vanishing.
            const empty = fam.versions.length === 0;
            const isOpen = expanded.has(fam.name) && !empty;
            return (
              <div key={fam.name}>
                <button
                  type="button"
                  onClick={() => { if (!empty) toggleFamily(fam.name); }}
                  disabled={empty}
                  aria-expanded={isOpen}
                  className="flex w-full items-center gap-2 px-3 pb-0.5 pt-2 text-left text-[9px] font-bold uppercase tracking-wider transition-colors hover:brightness-125 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:brightness-100"
                  style={{ color: "var(--mono-rail)" }}
                >
                  <ChevronDown
                    className={`h-3 w-3 shrink-0 transition-transform ${isOpen ? "rotate-180" : "-rotate-90"} ${empty ? "invisible" : ""}`}
                    aria-hidden="true"
                  />
                  <span className="flex-1">{fam.name} — all versions</span>
                  <span className="tabular-nums opacity-70">{fam.versions.length}</span>
                </button>
                {isOpen &&
                  fam.versions.map((option) => (
                    <BotOptionRow
                      key={option.version}
                      option={option}
                      title={option.version}
                      active={player.botStrategy === option.version}
                      onSelect={select}
                    />
                  ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Small uppercase section label inside the selector menu. */
function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <div
      className="px-3 pb-0.5 pt-2 text-[9px] font-bold uppercase tracking-wider"
      style={{ color: "var(--mono-rail)" }}
    >
      {children}
    </div>
  );
}

/** The strength badge shown beside a bot — its Elo, or "???" when deprecated
 *  (no rating). Higher is stronger; only relative gaps carry meaning. */
function EloTag({ rating, active }: { rating: number | null; active?: boolean }) {
  const color = active ? "var(--mono-card)" : "var(--mono-rail)";
  return (
    <span
      className="flex shrink-0 items-baseline gap-0.5 font-mono font-bold tabular-nums"
      style={{ color }}
      title="Strength rating — higher is a stronger bot"
    >
      <span className="text-[11px]">{rating ?? "???"}</span>
      <span className="text-[8px] opacity-70">ELO</span>
    </span>
  );
}

/** One selectable row in the menu. A deprecated option (no Elo) is struck through
 *  and disabled — present so the archive is visible, but never pickable. */
function BotOptionRow({
  option,
  title,
  active,
  onSelect,
}: {
  option: BotOption;
  title: string;
  active: boolean;
  onSelect: (version: string) => void;
}) {
  const showVersionTag = title !== option.version;
  if (option.deprecated) {
    return (
      <div
        className="flex w-full cursor-not-allowed items-center gap-2 px-3 py-1.5 text-xs opacity-45"
        style={{ color: "var(--mono-ink)" }}
        title="Deprecated — no strength rating, can't be selected"
      >
        <span className="flex-1 truncate font-mono line-through">{option.version}</span>
        <EloTag rating={null} />
      </div>
    );
  }
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onClick={() => { onSelect(option.version); }}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:brightness-125"
      style={{
        backgroundColor: active ? "var(--mono-orange)" : "transparent",
        color: active ? "var(--mono-card)" : "var(--mono-ink)",
      }}
    >
      <span className="flex-1 truncate font-semibold">{title}</span>
      <EloTag rating={option.rating} active={active} />
      {showVersionTag && (
        <span
          className="font-mono text-[10px] font-bold"
          style={{ color: active ? "var(--mono-card)" : "var(--mono-orange)" }}
        >
          {option.version}
        </span>
      )}
    </button>
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
