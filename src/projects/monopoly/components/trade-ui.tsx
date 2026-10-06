import type { CSSProperties } from "react";
import { PLAYER_COLOR_VAR } from "../theme";
import type { Player } from "../types";

/** Pieces the trade panel and its cash editor share. */

export const TRADE_ROW_STYLE: CSSProperties = {
  backgroundColor: "var(--mono-board)",
};

export function PlayerTag({ player }: { player: Player }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      <span
        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
        style={{
          backgroundColor: PLAYER_COLOR_VAR[player.color],
          boxShadow: "0 0 0 1px var(--mono-frame)",
        }}
      />
      <span className="truncate font-semibold">{player.name}</span>
    </span>
  );
}

export function formatCash(amount: number): string {
  return `$${amount.toLocaleString("en-US")}`;
}
