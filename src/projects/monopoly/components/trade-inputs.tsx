"use client";

import { KeyRound, Minus, Plus } from "lucide-react";
import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useMonopolyStore } from "../store";
import type { CardSource, GameState, Player, TradeTerms } from "../types";
import { CashKeypad } from "./cash-keypad";
import { PlayerTag, TRADE_ROW_STYLE, TradeCash } from "./trade-ui";

// Cash step per +/- tap: a quick nudge; the keypad is for exact amounts.
const CASH_STEP = 50;

/** The proposer's input surface: who holds each Get-Out-of-Jail card, and each
 *  player's cash. Tapping an amount swaps the rows for the keypad. */
export function TradeInputs({
  state,
  terms,
  byId,
}: {
  state: GameState;
  terms: TradeTerms;
  byId: ReadonlyMap<string, Player>;
}) {
  const setTradeCash = useMonopolyStore((s) => s.setTradeCash);
  const cycleTradeGojf = useMonopolyStore((s) => s.cycleTradeGojf);
  const [editing, setEditing] = useState<Player | null>(null);

  if (editing) {
    const close = () => {
      setEditing(null);
    };
    return (
      <CashKeypad
        initial={terms.cashDelta[editing.id] ?? 0}
        label={<PlayerTag player={editing} />}
        onCommit={(value) => {
          setTradeCash(editing.id, value);
          close();
        }}
        onCancel={close}
      />
    );
  }

  const heldCards = (["chance", "communityChest"] as const).filter(
    (src) => state.jailFreeCards[src] !== undefined,
  );

  return (
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
                setTradeCash(p.id, (terms.cashDelta[p.id] ?? 0) + step);
              }}
              onOpen={() => {
                setEditing(p);
              }}
            />
          ))}
      </div>
    </>
  );
}

// Tap to cycle which player holds a Get-Out-of-Jail-Free card.
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
      className="flex min-h-11 items-center justify-between rounded px-2 text-left"
      style={{ ...TRADE_ROW_STYLE, cursor: "pointer" }}
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

function CashRow({
  player,
  amount,
  onBump,
  onOpen,
}: {
  player: Player;
  amount: number;
  onBump: (step: number) => void;
  onOpen: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-1 rounded pl-2" style={TRADE_ROW_STYLE}>
      <PlayerTag player={player} />
      <div className="flex shrink-0 items-center gap-1">
        <StepButton
          ariaLabel={`$${CASH_STEP} less for ${player.name}`}
          onClick={() => {
            onBump(-CASH_STEP);
          }}
        >
          <Minus className="h-4 w-4" />
        </StepButton>
        <button
          type="button"
          aria-label={`Enter ${player.name}'s cash`}
          onClick={onOpen}
          className="h-11 min-w-16 rounded px-1.5 text-right"
          style={BUTTON_STYLE}
        >
          <TradeCash amount={amount} />
        </button>
        <StepButton
          ariaLabel={`$${CASH_STEP} more for ${player.name}`}
          onClick={() => {
            onBump(CASH_STEP);
          }}
        >
          <Plus className="h-4 w-4" />
        </StepButton>
      </div>
    </div>
  );
}

const BUTTON_STYLE: CSSProperties = {
  backgroundColor: "var(--mono-card)",
  color: "var(--mono-ink)",
  boxShadow: "inset 0 0 0 1px var(--mono-frame)",
};

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
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded"
      style={BUTTON_STYLE}
    >
      {children}
    </button>
  );
}
