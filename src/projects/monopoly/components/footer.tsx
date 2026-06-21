"use client";

import { manageActorId } from "../manage";
import { useMonopolyStore } from "../store";
import type { GameState } from "../types";
import { ACTION_BAR_HEIGHT, ActionBar } from "./action-bar";
import { EventLog } from "./event-log";
import { PromptSection } from "./prompt-section";

interface Props {
  state: GameState;
}

export function Footer({ state }: Props) {
  const myPlayerId = useMonopolyStore((s) => s.myPlayerId);

  // The log gives way to make panel / board room in two distinct cases:
  //
  //  - Trade and auction are shown to the whole table (a trade's tall shared
  //    panel; an open-outcry auction everyone can bid in), so the log hides for
  //    EVERYONE.
  //  - A manage-style intermission (managing / raising-cash / must-raise-cash)
  //    turns the board into the ACTOR's sell / build / mortgage surface, so the
  //    log hides only for that actor — every spectator keeps their log and just
  //    watches the synced staging fill in. A plain buy-decision is NOT staging
  //    (the board is inert), so its log stays until the buyer steps into
  //    `raising-cash`.
  const { phase } = state.turn;
  const tableWide =
    phase === "trade-building" || phase === "trade-pending" || phase === "auction";
  const actorStaging =
    (phase === "managing" ||
      phase === "raising-cash" ||
      phase === "must-raise-cash") &&
    manageActorId(state) === myPlayerId;
  const hideLog = tableWide || actorStaging;

  // The action bar's two toggles only do something for a player who can still
  // act. A spectator (no seat) or a bankrupt player can't arm a trade/manage,
  // so the bar is dead weight — hide it and let the log absorb its height.
  const me =
    myPlayerId === null
      ? undefined
      : state.players.find((p) => p.id === myPlayerId);
  const canAct = me !== undefined && !me.bankrupt;
  return (
    <div
      className="relative z-10 flex shrink-0 flex-col"
      // Mirror of the header treatment: sharp 1px divider plus a soft
      // upward shadow so the footer reads as elevated above the board.
      style={{
        boxShadow:
          "0 -1px 0 var(--mono-frame), 0 -6px 12px rgba(0, 0, 0, 0.75)",
      }}
    >
      <PromptSection state={state} />
      {!hideLog && (
        <EventLog
          state={state}
          extraHeight={canAct ? undefined : ACTION_BAR_HEIGHT}
        />
      )}
      {canAct && <ActionBar state={state} />}
    </div>
  );
}
