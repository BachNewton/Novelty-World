"use client";

import type { CSSProperties, ReactNode } from "react";
import { SPACES } from "../data";
import { ownablePrice } from "../logic";
import { useMonopolyStore } from "../store";
import { PROPERTY_COLOR_VAR } from "../theme";
import type { GameState } from "../types";

interface Props {
  state: GameState;
}

/** Contextual single-action prompt that lives between the board and the
 *  event log. Visible only to the local player and only when something
 *  needs their input. Three rendering paths so far:
 *
 *  - Buy decision: phase = `buy-decision` and it's the local player's turn.
 *    Shows the property tag, price, and cash before → after with explicit
 *    Buy / Pass buttons.
 *  - Pre-roll pause: turn is paused at the local player's pre-roll, e.g.
 *    because their armed `beforeRoll` flag just fired. Shows a "Roll" CTA
 *    that fires `resume`.
 *  - Post-roll pause: same but at post-roll. Shows an "End turn" CTA.
 *
 *  When none of the above is true, the section renders nothing and the log
 *  flows directly under the board. Spectators never see this section —
 *  they infer state from the event log (roll, buy / auction). */
export function PromptSection({ state }: Props) {
  const myPlayerId = useMonopolyStore((s) => s.myPlayerId);
  const submit = useMonopolyStore((s) => s.submit);

  if (!myPlayerId) return null;
  if (state.turn.playerId !== myPlayerId) return null;

  const { phase, paused, pendingBuy } = state.turn;

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

  if (paused && phase === "pre-roll") {
    return (
      <PausePrompt
        label="Paused before your roll"
        action="Roll"
        onResume={() => {
          submit({ kind: "resume", playerId: myPlayerId });
        }}
      />
    );
  }

  if (paused && phase === "post-roll") {
    return (
      <PausePrompt
        label="Paused before your end of turn"
        action="End turn"
        onResume={() => {
          submit({ kind: "resume", playerId: myPlayerId });
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

function PausePrompt({
  label,
  action,
  onResume,
}: {
  label: string;
  action: string;
  onResume: () => void;
}) {
  return (
    <div className="relative z-10 flex shrink-0" style={SECTION_STYLE}>
      <div
        className="flex flex-1 items-center px-3 py-3 font-semibold uppercase tracking-wide"
        style={{ fontSize: "clamp(0.75rem, 2.2vmin, 1rem)", minHeight: "56px" }}
      >
        <span
          className="inline-flex items-center gap-2"
          style={{ color: "var(--mono-orange)" }}
        >
          <PauseGlyph />
          {label}
        </span>
      </div>
      <PromptButton label={action} onClick={onResume} variant="primary" />
    </div>
  );
}

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
      <PromptButton label="Pass" onClick={onPass} />
      <PromptButton
        label="Buy"
        onClick={onBuy}
        disabled={!canAfford}
        variant="primary"
      />
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

function PauseGlyph(): ReactNode {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5"
      aria-hidden="true"
      style={{ color: "currentColor" }}
    >
      <rect x="4" y="3" width="3" height="10" rx="0.5" fill="currentColor" />
      <rect x="9" y="3" width="3" height="10" rx="0.5" fill="currentColor" />
    </svg>
  );
}
