"use client";

import { KeyRound, Minus, Plus } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { projectTrade, tradeParticipants } from "../engine";
import { useMonopolyStore } from "../store";
import { PLAYER_COLOR_VAR } from "../theme";
import type { CardSource, GameState, Player, TradeTerms } from "../types";
import { HoldingsGrid, SLOT_GROUPS } from "./holdings-grid";
import { Money } from "./money";

interface Props {
  state: GameState;
}

// Cash step per +/- tap. Coarse on purpose — most trade cash is round
// hundreds; a finer entry can come later if it's ever wanted.
const CASH_STEP = 50;

/** The trade UI, shown to EVERY player while a trade is being built or voted
 *  on — the proposal lives in synced state, so this is a live view, not just
 *  the proposer's. Two phases:
 *
 *  - `trade-building`: the proposer reassigns properties on the board and sets
 *    cash / cards here; everyone else watches it take shape read-only.
 *  - `trade-pending`: the finalized proposal; each named party approves or
 *    declines. All approvals execute it; any decline cancels it.
 *
 *  The log is hidden by the footer while this is up to make room. */
export function TradePanel({ state }: Props) {
  const myPlayerId = useMonopolyStore((s) => s.myPlayerId);
  const bumpTradeCash = useMonopolyStore((s) => s.bumpTradeCash);
  const cycleTradeGojf = useMonopolyStore((s) => s.cycleTradeGojf);
  const proposeTrade = useMonopolyStore((s) => s.proposeTrade);
  const cancelTrade = useMonopolyStore((s) => s.cancelTrade);
  const acceptTrade = useMonopolyStore((s) => s.acceptTrade);
  const declineTrade = useMonopolyStore((s) => s.declineTrade);

  const turn = state.turn;
  const isPending = turn.phase === "trade-pending";
  const terms: (TradeTerms & { proposerId: string }) | undefined = isPending
    ? turn.pendingTrade
    : turn.tradeDraft;
  if (!terms) return null;

  const byId = new Map(state.players.map((p) => [p.id, p]));
  const proposer = byId.get(terms.proposerId) ?? null;
  const isProposer = myPlayerId !== null && myPlayerId === terms.proposerId;
  const canEdit = !isPending && isProposer;

  const cashSum = Object.values(terms.cashDelta).reduce((a, b) => a + b, 0);
  const movesSomething =
    Object.keys(terms.propertyTo).length > 0 ||
    Object.keys(terms.gojfTo).length > 0 ||
    Object.values(terms.cashDelta).some((v) => v !== 0);
  const partyCount = tradeParticipants(state, terms).size;
  // Why the trade can't be proposed yet — surfaced on the Propose button itself
  // so we don't need a separate balance/validity row.
  let proposeIssue: string | null = null;
  if (!movesSomething) proposeIssue = "Nothing to trade";
  else if (partyCount < 2) proposeIssue = "Needs 2 players";
  else if (cashSum !== 0) {
    proposeIssue = `Off by $${Math.abs(cashSum).toLocaleString("en-US")}`;
  }
  const canPropose = proposeIssue === null;

  const approvals = isPending ? (turn.pendingTrade?.approvals ?? {}) : null;
  const myApproval = approvals && myPlayerId !== null ? approvals[myPlayerId] : undefined;
  const canVote = isPending && myApproval === false;

  const heldCards = (["chance", "communityChest"] as const).filter(
    (src) => state.jailFreeCards[src] !== undefined,
  );

  return (
    <div className="relative z-10 flex shrink-0 flex-col" style={SECTION_STYLE}>
      <div
        className="flex min-w-0 flex-col gap-2 overflow-y-auto px-3 py-2"
        style={{ maxHeight: "44vh", fontSize: "clamp(0.7rem, 2vmin, 0.85rem)" }}
      >
        <Heading
          isPending={isPending}
          isProposer={isProposer}
          proposerName={proposer?.name ?? "Someone"}
        />

        <TradeHoldings state={state} terms={terms} myPlayerId={myPlayerId} />

        {/* The cash steppers and card-cycle rows are the proposer's *input*
            surface; everyone else reads the outcome from TradeHoldings above. */}
        {canEdit && (
          <>
            {heldCards.length > 0 && (
              <div className="flex flex-col gap-1">
                {heldCards.map((src) => (
                  <CardRow
                    key={src}
                    source={src}
                    state={state}
                    terms={terms}
                    byId={byId}
                    onCycle={() => {
                      cycleTradeGojf(src);
                    }}
                  />
                ))}
              </div>
            )}

            <div className="flex flex-col gap-1">
              {state.players
                .filter((p) => !p.bankrupt)
                .map((p) => (
                  <CashRow
                    key={p.id}
                    player={p}
                    amount={terms.cashDelta[p.id] ?? 0}
                    onBump={(step) => {
                      bumpTradeCash(p.id, step);
                    }}
                  />
                ))}
            </div>
          </>
        )}

        {isPending && approvals && (
          <ApprovalStatus approvals={approvals} byId={byId} />
        )}
      </div>

      <div className="flex">
        {canEdit && (
          <>
            <PanelButton
              label="Cancel"
              onClick={() => {
                cancelTrade();
              }}
            />
            <PanelButton
              label={proposeIssue ?? "Propose"}
              variant="primary"
              disabled={!canPropose}
              onClick={() => {
                proposeTrade();
              }}
            />
          </>
        )}
        {isPending && isProposer && (
          <PanelButton
            label="Withdraw"
            onClick={() => {
              cancelTrade();
            }}
          />
        )}
        {canVote && (
          <>
            <PanelButton
              label="Decline"
              onClick={() => {
                declineTrade();
              }}
            />
            <PanelButton
              label="Approve"
              variant="primary"
              onClick={() => {
                acceptTrade();
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}

const SECTION_STYLE: CSSProperties = {
  backgroundColor: "var(--mono-card)",
  color: "var(--mono-ink)",
  boxShadow: "inset 0 1px 0 var(--mono-frame)",
};

function Heading({
  isPending,
  isProposer,
  proposerName,
}: {
  isPending: boolean;
  isProposer: boolean;
  proposerName: string;
}) {
  let text: string;
  if (isPending) text = `Proposed by ${proposerName} — vote`;
  else if (isProposer) text = "Trade — tap squares to reassign";
  else text = `${proposerName} is building a trade`;
  return (
    <span className="truncate font-semibold uppercase tracking-wide">
      {text}
    </span>
  );
}

/** The trade's result in the header's own grammar: the named parties as rows,
 *  the sets the trade touches as columns, rendered against the *projected*
 *  (post-trade) ownership. The persistent header above is the "before"; this is
 *  the "after", so players read the outcome — who completes a set, who breaks
 *  one — by diffing the two in a layout they already know. Each party's meta
 *  cell leads with the signed cash the trade moves for them — the log's money
 *  grammar (green in / red out for me, white for others), so the cash on the
 *  table is as legible to a voter as it is to the proposer at the steppers — then
 *  the resulting balance and the 10% bank interest a receiver owes on a
 *  still-mortgaged property. */
function TradeHoldings({
  state,
  terms,
  myPlayerId,
}: {
  state: GameState;
  terms: TradeTerms;
  myPlayerId: string | null;
}) {
  const projection = projectTrade(state, terms);
  const movedPositions = new Set(
    Object.keys(terms.propertyTo).map((pos) => Number(pos)),
  );
  const cardsMoved = Object.keys(terms.gojfTo).length > 0;

  const affectedGroups = SLOT_GROUPS.filter((group) => {
    if (group.key === "gojf") return cardsMoved;
    return group.slots.some(
      (slot) => slot.kind !== "gojf" && movedPositions.has(slot.position),
    );
  });

  const partyIds = tradeParticipants(state, terms);
  const parties = state.players.filter((p) => partyIds.has(p.id));

  if (parties.length === 0) {
    return (
      <span style={{ opacity: 0.5 }}>No properties or cards moved yet.</span>
    );
  }

  return (
    <HoldingsGrid
      players={parties}
      groups={affectedGroups}
      ownership={projection.ownership}
      mortgaged={state.mortgaged}
      jailFreeCards={projection.jailFreeCards}
      changed={movedPositions}
      metaMinWidth="5rem"
      renderMeta={(player) => {
        const delta = terms.cashDelta[player.id] ?? 0;
        const after = projection.cashById[player.id] ?? player.cash;
        const fee = projection.feesById[player.id] ?? 0;
        const cashChanged = delta !== 0 || fee > 0;
        return (
          <>
            <span className="truncate text-sm font-semibold">{player.name}</span>
            {delta !== 0 && (
              <Money
                amount={Math.abs(delta)}
                sign={delta > 0 ? "+" : "-"}
                mine={myPlayerId === player.id}
              />
            )}
            {fee > 0 && (
              <span
                className="font-mono text-[0.65rem]"
                style={{ color: "var(--mono-red)" }}
              >
                −${fee.toLocaleString("en-US")} interest
              </span>
            )}
            {cashChanged && (
              <span
                className="font-mono text-[0.65rem]"
                style={{
                  opacity: 0.7,
                  color: after < 0 ? "var(--mono-red)" : "var(--mono-ink)",
                }}
              >
                → ${after.toLocaleString("en-US")}
              </span>
            )}
          </>
        );
      }}
    />
  );
}

// Proposer-only: tap to cycle which player holds a Get-Out-of-Jail-Free card.
function CardRow({
  source,
  state,
  terms,
  byId,
  onCycle,
}: {
  source: CardSource;
  state: GameState;
  terms: TradeTerms;
  byId: ReadonlyMap<string, Player>;
  onCycle: () => void;
}) {
  const base = state.jailFreeCards[source];
  const holderId = terms.gojfTo[source] ?? base;
  const holder = holderId ? (byId.get(holderId) ?? null) : null;
  return (
    <button
      type="button"
      onClick={onCycle}
      className="flex items-center justify-between rounded px-2 py-1 text-left"
      style={{ ...ROW_STYLE, cursor: "pointer" }}
    >
      <span className="inline-flex items-center gap-1.5">
        <KeyRound className="h-3.5 w-3.5" style={{ color: "var(--mono-orange)" }} />
        <span className="font-medium">
          {source === "chance" ? "Chance" : "Chest"} card
        </span>
      </span>
      <span className="inline-flex items-center gap-1">
        <span style={{ opacity: 0.4 }}>→</span>
        {holder ? <PlayerTag player={holder} /> : <span>—</span>}
      </span>
    </button>
  );
}

// Proposer-only: step a player's net cash delta for the trade up or down.
function CashRow({
  player,
  amount,
  onBump,
}: {
  player: Player;
  amount: number;
  onBump: (step: number) => void;
}) {
  const color =
    amount > 0
      ? "var(--mono-green)"
      : amount < 0
        ? "var(--mono-red)"
        : "var(--mono-ink)";
  const text =
    amount === 0
      ? "$0"
      : `${amount > 0 ? "+" : "−"}$${Math.abs(amount).toLocaleString("en-US")}`;
  return (
    <div className="flex items-center justify-between rounded px-2 py-1" style={ROW_STYLE}>
      <PlayerTag player={player} />
      <div className="flex items-center gap-2">
        <StepButton
          ariaLabel={`Less cash for ${player.name}`}
          onClick={() => {
            onBump(-CASH_STEP);
          }}
        >
          <Minus className="h-3.5 w-3.5" />
        </StepButton>
        <span
          className="w-16 text-right font-semibold tabular-nums"
          style={{ color }}
        >
          {text}
        </span>
        <StepButton
          ariaLabel={`More cash for ${player.name}`}
          onClick={() => {
            onBump(CASH_STEP);
          }}
        >
          <Plus className="h-3.5 w-3.5" />
        </StepButton>
      </div>
    </div>
  );
}

function ApprovalStatus({
  approvals,
  byId,
}: {
  approvals: Readonly<Record<string, boolean>>;
  byId: ReadonlyMap<string, Player>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {Object.entries(approvals).map(([id, ok]) => {
        const p = byId.get(id);
        if (!p) return null;
        return (
          <span key={id} className="inline-flex items-center gap-1">
            <span style={{ color: ok ? "var(--mono-green)" : "var(--mono-ink)", opacity: ok ? 1 : 0.5 }}>
              {ok ? "✓" : "○"}
            </span>
            <PlayerTag player={p} />
          </span>
        );
      })}
    </div>
  );
}

const ROW_STYLE: CSSProperties = {
  backgroundColor: "var(--mono-board)",
};

function PlayerTag({ player }: { player: Player }) {
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

function StepButton({
  ariaLabel,
  onClick,
  children,
}: {
  ariaLabel: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded"
      style={{
        backgroundColor: "var(--mono-card)",
        color: "var(--mono-ink)",
        boxShadow: "inset 0 0 0 1px var(--mono-frame)",
      }}
    >
      {children}
    </button>
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
}) {
  const background =
    variant === "primary" ? "var(--mono-green)" : "var(--mono-board)";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex flex-1 items-center justify-center px-3 py-3 font-semibold uppercase tracking-wide disabled:opacity-40"
      style={{
        backgroundColor: background,
        // Dark ink on the bright green primary (white-on-green is too low
        // contrast); near-white on the dark default.
        color: variant === "primary" ? "var(--mono-frame)" : "var(--mono-ink)",
        fontSize: "clamp(0.875rem, 2.5vmin, 1.125rem)",
        minHeight: "56px",
      }}
    >
      {label}
    </button>
  );
}
