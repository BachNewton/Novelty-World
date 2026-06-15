"use client";

import type { CSSProperties, ReactNode } from "react";
import {
  bankSupply,
  hasStagedChanges,
  manageSummary,
  type ManageStaged,
} from "../manage";
import { useMonopolyStore } from "../store";
import type { GameState } from "../types";

interface Props {
  state: GameState;
  playerId: string;
}

const EMPTY_STAGED: ManageStaged = { build: {}, mortgage: {} };

/** Summary bar for the manage intermission — the board rows are the controls
 *  (color strip cycles build level, body toggles mortgage); this bar shows the
 *  running cash delta, the bank's remaining houses / hotels, any shortage-forced
 *  liquidation, and the commit / cancel actions.
 *
 *  Staging lives in synced `turn.manageStaged`, so this is shown to EVERY player
 *  as a live view — `playerId` is the ACTOR (the manager, or the forced debtor),
 *  not necessarily the local player. Only the actor gets the action buttons and
 *  the interactive board zones; everyone else watches it take shape read-only.
 *
 *  Two entry paths share it:
 *
 *  - Voluntary `managing`: the queued manager builds / sells / mortgages. Cancel
 *    abandons the intermission (`cancel-manage`); Commit fires the `manage`
 *    intent when something legal is staged and affordable.
 *  - Forced `must-raise-cash`: the current debtor raises cash by selling
 *    buildings and / or mortgaging. No cancel — they must settle; Pay is enabled
 *    once the staged raise brings them back to ≥ 0, at which point the engine
 *    auto-settles and the phase exits. */
export function ManagePanel({ state, playerId }: Props) {
  const staged = useMonopolyStore((s) => s.state.turn.manageStaged) ?? EMPTY_STAGED;
  const myPlayerId = useMonopolyStore((s) => s.myPlayerId);
  const cancelManage = useMonopolyStore((s) => s.cancelManage);
  const commitManage = useMonopolyStore((s) => s.commitManage);

  const player = state.players.find((p) => p.id === playerId);
  if (!player) return null;

  const isActor = myPlayerId === playerId;
  const isForced = state.turn.phase === "must-raise-cash";
  const summary = manageSummary(state, playerId, staged);
  const netCash = summary.ok ? summary.netCash : 0;
  const notes = summary.ok ? summary.notes : [];
  const cashAfter = player.cash + netCash;
  const backInBlack = cashAfter >= 0;
  const hasStaged = hasStagedChanges(state, staged);
  // Commit needs a legal build plan, something staged, and enough cash to cover
  // the net spend (cashAfter ≥ 0). That single gate also covers forced mode:
  // the debtor's negative starting cash means Pay only enables once the staged
  // raise climbs them back to ≥ 0.
  const canCommit = summary.ok && hasStaged && backInBlack;

  const bank = bankSupply(state);

  return (
    <div className="relative z-10 flex shrink-0" style={SECTION_STYLE}>
      <div
        className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 px-3 py-2"
        style={{
          fontSize: "clamp(0.7rem, 2vmin, 0.85rem)",
          minHeight: "56px",
        }}
      >
        <Header isForced={isForced} shortfall={Math.max(0, -player.cash)} />
        <CashLine
          cashBefore={player.cash}
          cashAfter={cashAfter}
          netDelta={netCash}
        />
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5">
          <BankSupply houses={bank.houses} hotels={bank.hotels} />
          {!summary.ok && (
            <span className="truncate" style={{ color: "var(--mono-red)" }}>
              {summary.reason}
            </span>
          )}
          {notes.length > 0 && (
            <span className="truncate" style={{ color: "var(--mono-orange)" }}>
              Hotel liquidated — house shortage
            </span>
          )}
          {isForced && (
            <span
              className="truncate tabular-nums"
              style={{
                color: backInBlack ? "var(--mono-green)" : "var(--mono-red)",
              }}
            >
              {backInBlack
                ? "Back in the black"
                : `Need $${(-cashAfter).toLocaleString("en-US")} more`}
            </span>
          )}
        </div>
      </div>
      {isActor && !isForced && (
        <PanelButton
          label="Cancel"
          onClick={() => {
            cancelManage();
          }}
        />
      )}
      {isActor && (
        <PanelButton
          label={isForced ? "Pay" : "Commit"}
          onClick={() => {
            commitManage();
          }}
          disabled={!canCommit}
          variant="primary"
        />
      )}
    </div>
  );
}

const SECTION_STYLE: CSSProperties = {
  backgroundColor: "var(--mono-card)",
  color: "var(--mono-ink)",
  boxShadow: "inset 0 1px 0 var(--mono-frame)",
};

function Header({
  isForced,
  shortfall,
}: {
  isForced: boolean;
  shortfall: number;
}) {
  if (isForced) {
    return (
      <span
        className="truncate font-semibold uppercase tracking-wide"
        style={{ color: "var(--mono-red)" }}
      >
        Raise ${shortfall.toLocaleString("en-US")} — sell or mortgage
      </span>
    );
  }
  return (
    <span className="truncate font-semibold uppercase tracking-wide">
      Manage
    </span>
  );
}

function CashLine({
  cashBefore,
  cashAfter,
  netDelta,
}: {
  cashBefore: number;
  cashAfter: number;
  netDelta: number;
}) {
  const deltaSign = netDelta > 0 ? "+" : netDelta < 0 ? "−" : "";
  const deltaColor =
    netDelta > 0
      ? "var(--mono-green)"
      : netDelta < 0
        ? "var(--mono-red)"
        : "var(--mono-ink)";
  return (
    <span
      className="inline-flex min-w-0 items-center gap-1 truncate tabular-nums"
      style={{
        color: "color-mix(in srgb, var(--mono-ink) 70%, transparent)",
      }}
    >
      <span>${cashBefore.toLocaleString("en-US")}</span>
      <span style={{ opacity: 0.5 }}>→</span>
      <span style={{ color: "var(--mono-ink)", fontWeight: 600 }}>
        ${cashAfter.toLocaleString("en-US")}
      </span>
      {netDelta !== 0 && (
        <span style={{ color: deltaColor, fontWeight: 600 }}>
          ({deltaSign}${Math.abs(netDelta).toLocaleString("en-US")})
        </span>
      )}
    </span>
  );
}

function BankSupply({ houses, hotels }: { houses: number; hotels: number }) {
  return (
    <span
      className="inline-flex items-center gap-2 tabular-nums"
      style={{ color: "color-mix(in srgb, var(--mono-ink) 70%, transparent)" }}
    >
      <span className="inline-flex items-center gap-1">
        <span
          className="inline-block rounded-sm border border-black"
          style={{ width: "9px", height: "12px", backgroundColor: "var(--mono-green)" }}
        />
        <span>{houses}</span>
      </span>
      <span className="inline-flex items-center gap-1">
        <span
          className="inline-block rounded-sm border border-black"
          style={{ width: "16px", height: "12px", backgroundColor: "var(--mono-red)" }}
        />
        <span>{hotels}</span>
      </span>
    </span>
  );
}

function PanelButton({
  label,
  onClick,
  disabled,
  variant = "default",
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: "default" | "primary";
}): ReactNode {
  const background =
    variant === "primary" ? "var(--mono-green)" : "var(--mono-board)";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex shrink-0 items-center justify-center px-3 py-3 font-semibold uppercase tracking-wide disabled:opacity-40"
      style={{
        backgroundColor: background,
        // Dark ink on the bright green primary (white-on-green is too low
        // contrast); near-white on the dark default.
        color: variant === "primary" ? "var(--mono-frame)" : "var(--mono-ink)",
        fontSize: "clamp(0.875rem, 2.5vmin, 1.125rem)",
        minHeight: "56px",
        minWidth: "5.5rem",
      }}
    >
      {label}
    </button>
  );
}
