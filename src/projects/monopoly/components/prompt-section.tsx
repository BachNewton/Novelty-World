"use client";

import type { CSSProperties, ReactNode } from "react";
import { SPACES } from "../data";
import { firstNegativePlayer, JAIL_FEE } from "../engine";
import { heldJailCard, ownablePrice } from "../logic";
import { useMonopolyStore } from "../store";
import { PROPERTY_COLOR_VAR } from "../theme";
import type { GameState } from "../types";
import { AuctionPanel } from "./auction-panel";
import { ManagePanel } from "./manage-panel";
import { TradePanel } from "./trade-panel";

interface Props {
  state: GameState;
}

/** Contextual single-action prompt that lives between the board and the
 *  event log. Visible only to the local player and only when something
 *  needs their input. Rendering paths so far:
 *
 *  - Trade building / pending: shown to everyone (the proposal is synced).
 *  - Must-raise-cash: the current debtor sells / mortgages back to ≥ 0 via the
 *    same manage panel + board staging as a voluntary intermission.
 *  - Managing: the manager's open intermission (board two-zone tap + summary).
 *  - Buy decision: the active player buys or passes a landed-on property.
 *
 *  When none of the above is true, the section renders nothing and the log
 *  flows directly under the board. Spectators never see this section —
 *  they infer state from the event log (roll, buy / auction). */
export function PromptSection({ state }: Props) {
  const myPlayerId = useMonopolyStore((s) => s.myPlayerId);
  const submit = useMonopolyStore((s) => s.submit);
  const step = useMonopolyStore((s) => s.step);

  const { phase, pendingBuy } = state.turn;

  // Trade building / pending is shown to EVERYONE — including a seatless
  // spectator — because the proposal lives in synced state and the footer
  // hides the log to make room for it. Interactivity inside the panel is gated
  // by role (proposer edits, named parties vote, everyone else watches).
  if (phase === "trade-building" || phase === "trade-pending") {
    return <TradePanel state={state} />;
  }

  // The auction is synced state shown to EVERYONE (including spectators): the
  // panel renders the standings live and gates the bid/drop buttons on whether
  // this client is the current bidder.
  if (phase === "auction") {
    return <AuctionPanel state={state} />;
  }

  if (!myPlayerId) return null;

  // Must-raise-cash forces the manage panel open for the current debtor
  // (whoever is in the red — possibly off-turn after a trade), who can't dismiss
  // it, only sell buildings and / or mortgage back to ≥ 0. Same panel + board
  // two-zone staging as the voluntary intermission, constrained to raising.
  if (phase === "must-raise-cash") {
    if (firstNegativePlayer(state) !== myPlayerId) return null;
    return <ManagePanel state={state} playerId={myPlayerId} />;
  }

  // Manage intermission for the queued manager (may be off-turn): the board
  // rows are the controls, this panel is the summary + commit / cancel.
  if (phase === "managing" && state.turn.managerId === myPlayerId) {
    return <ManagePanel state={state} playerId={myPlayerId} />;
  }

  // Everything below is the active player's own decision.
  if (state.turn.playerId !== myPlayerId) return null;

  // Jail: a per-turn prompt (a deliberate exception to "jail is a stance, not a
  // prompt" — see monopoly/CLAUDE.md). The player chooses each jail turn: roll
  // for doubles (the mechanical jail roll, fired via `step`), pay the $50 fine,
  // or play a held Get-Out-of-Jail-Free card.
  if (phase === "jail-decision") {
    return (
      <JailPrompt
        state={state}
        playerId={myPlayerId}
        onRoll={() => {
          step();
        }}
        onPay={() => {
          submit({ kind: "pay-to-leave-jail", playerId: myPlayerId });
        }}
        onCard={() => {
          submit({ kind: "use-jail-card", playerId: myPlayerId });
        }}
      />
    );
  }

  if (phase === "buy-decision" && pendingBuy !== undefined) {
    return (
      <BuyPrompt
        state={state}
        position={pendingBuy}
        playerId={myPlayerId}
        onBuy={() => {
          submit({ kind: "buy", playerId: myPlayerId });
        }}
        onPass={() => {
          submit({ kind: "decline-buy", playerId: myPlayerId });
        }}
      />
    );
  }

  return null;
}

const SECTION_STYLE: CSSProperties = {
  backgroundColor: "var(--mono-card)",
  color: "var(--mono-ink)",
  // Top divider only — the EventLog directly below has its own inset top
  // line, so we don't double up on the boundary.
  boxShadow: "inset 0 1px 0 var(--mono-frame)",
};

function BuyPrompt({
  state,
  position,
  playerId,
  onBuy,
  onPass,
}: {
  state: GameState;
  position: number;
  playerId: string;
  onBuy: () => void;
  onPass: () => void;
}) {
  const price = ownablePrice(position);
  if (price === null) return null;
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return null;

  const cashAfter = player.cash - price;
  const canAfford = cashAfter >= 0;

  return (
    <div className="relative z-10 flex shrink-0" style={SECTION_STYLE}>
      <div
        className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2"
        style={{ minHeight: "56px", fontSize: "clamp(0.75rem, 2.2vmin, 0.95rem)" }}
      >
        <SpaceTag position={position} />
        <span
          className="font-semibold"
          style={{
            color: "var(--mono-red)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          −${price.toLocaleString("en-US")}
        </span>
        <span
          className="inline-flex items-center gap-1"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          <span style={{ opacity: 0.7 }}>
            ${player.cash.toLocaleString("en-US")}
          </span>
          <span style={{ opacity: 0.5 }}>→</span>
          <span
            className="font-semibold"
            style={{ color: canAfford ? "var(--mono-ink)" : "var(--mono-red)" }}
          >
            ${cashAfter.toLocaleString("en-US")}
          </span>
        </span>
      </div>
      <PromptButton label="Auction" onClick={onPass} />
      <PromptButton
        label="Buy"
        onClick={onBuy}
        disabled={!canAfford}
        variant="primary"
      />
    </div>
  );
}

function JailPrompt({
  state,
  playerId,
  onRoll,
  onPay,
  onCard,
}: {
  state: GameState;
  playerId: string;
  onRoll: () => void;
  onPay: () => void;
  onCard: () => void;
}) {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return null;
  const canPay = player.cash >= JAIL_FEE;
  const hasCard = heldJailCard(state, playerId) !== null;

  return (
    <div className="relative z-10 flex shrink-0" style={SECTION_STYLE}>
      <div
        className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 font-semibold uppercase tracking-wide"
        style={{ minHeight: "56px", fontSize: "clamp(0.75rem, 2.2vmin, 0.95rem)" }}
      >
        <span className="truncate" style={{ color: "var(--mono-orange)" }}>
          In Jail
        </span>
        <span style={{ opacity: 0.6, fontVariantNumeric: "tabular-nums" }}>
          {player.jailTurns}/3
        </span>
      </div>
      {hasCard && <PromptButton label="Card" onClick={onCard} />}
      <PromptButton label={`Pay $${JAIL_FEE.toString()}`} onClick={onPay} disabled={!canPay} />
      <PromptButton label="Roll" onClick={onRoll} variant="primary" />
    </div>
  );
}

function PromptButton({
  label,
  onClick,
  disabled,
  variant = "default",
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: "default" | "primary";
}) {
  const background =
    variant === "primary" ? "var(--mono-green)" : "var(--mono-board)";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      // Width is locked so prompt buttons land in the same column as the
      // action-bar cells directly below, even though this row's left half
      // is a flexible info area instead of three equal flex-1 cells.
      className="flex shrink-0 items-center justify-center px-3 py-3 font-semibold uppercase tracking-wide disabled:opacity-40"
      style={{
        backgroundColor: background,
        color: "var(--mono-ink)",
        fontSize: "clamp(0.875rem, 2.5vmin, 1.125rem)",
        minHeight: "56px",
        minWidth: "5.5rem",
      }}
    >
      {label}
    </button>
  );
}

function SpaceTag({ position }: { position: number }): ReactNode {
  const space = SPACES[position];
  if (space.kind === "property") {
    return (
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <span
          className="inline-block h-3 w-3 shrink-0 rounded-sm"
          style={{
            backgroundColor: PROPERTY_COLOR_VAR[space.color],
            boxShadow: "0 0 0 1px var(--mono-frame)",
          }}
        />
        <span className="truncate font-semibold">{space.name}</span>
      </span>
    );
  }
  if (space.kind === "railroad" || space.kind === "utility") {
    return <span className="truncate font-semibold">{space.name}</span>;
  }
  return null;
}
