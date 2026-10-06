import type { CSSProperties } from "react";
import { PLAYER_COLOR_VAR } from "../theme";
import type { Player } from "../types";
import { Money } from "./money";

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

/** A player's trade cash in the money grammar, from that player's side: green
 *  +$ in, red −$ out, plain $0. `negative` carries a minus typed before any
 *  digit, so the keypad shows "−$0" until the amount follows. */
export function TradeCash({
  amount,
  negative = amount < 0,
}: {
  amount: number;
  negative?: boolean;
}) {
  if (amount === 0 && !negative) return <Money amount={0} mine={false} />;
  return <Money amount={Math.abs(amount)} sign={negative ? "-" : "+"} mine />;
}
