import type { GameState } from "../types";
import { HoldingsGrid, SLOT_GROUPS } from "./holdings-grid";

interface Props {
  state: GameState;
}

export function Header({ state }: Props) {
  // When five or more players are present the header would crowd the board
  // off-screen, so cap it at 4.5 rows (each row is h-11) and scroll the
  // overflow. The half-row peek signals there's more below.
  const scrollable = state.players.length > 4;
  return (
    <div
      className={`relative z-10 flex shrink-0 flex-col ${
        scrollable ? "max-h-[12.375rem] overflow-y-auto" : ""
      }`}
      // Sharp 1px frame line acts as the section divider; the soft shadow
      // below makes the header read as elevated above the scrolling board.
      // Box-shadow renders outside the box without changing layout, so the
      // flex math (header + flex-1 squares + footer = 100dvh) is unaffected.
      style={{
        boxShadow: "0 1px 0 var(--mono-frame), 0 6px 12px rgba(0, 0, 0, 0.75)",
      }}
    >
      <HoldingsGrid
        players={state.players}
        groups={SLOT_GROUPS}
        ownership={state.ownership}
        mortgaged={state.mortgaged}
        jailFreeCards={state.jailFreeCards}
        activePlayerId={state.turn.playerId}
        renderMeta={(player) => (
          <>
            <span className="truncate text-sm font-semibold">{player.name}</span>
            <span className="font-mono text-xs">
              ${player.cash.toLocaleString("en-US")}
            </span>
          </>
        )}
      />
    </div>
  );
}
