"use client";

import { KeyRound, Minus, Plus } from "lucide-react";
import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useMonopolyStore } from "../store";
import { nudgeFigure, pairAmounts, pairFigure } from "../trade-cash";
import type { CardSource, GameState, Player, TradeTerms } from "../types";
import { CashKeypad } from "./cash-keypad";
import { formatCash, PlayerTag, TRADE_ROW_STYLE } from "./trade-ui";

// Cash step per +/- tap: a quick nudge; the keypad is for exact amounts.
const CASH_STEP = 50;

/** Which amount the keypad is editing: the pair's single figure, or one
 *  player's delta. */
type KeypadTarget = { kind: "pair" } | { kind: "player"; player: Player };

/** The proposer's input surface: who holds each Get-Out-of-Jail card, and the
 *  cash. Between exactly two parties (`pair`) the cash is one figure, "A pays B
 *  $X", written to both sides so it always balances; otherwise each player has
 *  their own row. Tapping an amount swaps the rows for the keypad. The caller
 *  keys this on the pair, so a change of parties drops an open keypad. */
export function TradeInputs({
  state,
  terms,
  byId,
  pair,
}: {
  state: GameState;
  terms: TradeTerms;
  byId: ReadonlyMap<string, Player>;
  pair: readonly [string, string] | null;
}) {
  const setTradeCash = useMonopolyStore((s) => s.setTradeCash);
  const cycleTradeGojf = useMonopolyStore((s) => s.cycleTradeGojf);
  const [editing, setEditing] = useState<KeypadTarget | null>(null);

  const first = pair ? byId.get(pair[0]) : undefined;
  const second = pair ? byId.get(pair[1]) : undefined;
  const figure = pair ? pairFigure(terms.cashDelta, pair) : 0;
  function setFigure(next: number) {
    if (pair) setTradeCash(pairAmounts(pair, next));
  }

  if (editing) {
    const close = () => {
      setEditing(null);
    };
    if (editing.kind === "pair" && first && second) {
      return (
        <CashKeypad
          initial={figure}
          describe={(negative) => (
            <Pays payer={negative ? second : first} payee={negative ? first : second} />
          )}
          onCommit={(value) => {
            setFigure(value);
            close();
          }}
          onCancel={close}
        />
      );
    }
    if (editing.kind === "player") {
      const { player } = editing;
      return (
        <CashKeypad
          initial={terms.cashDelta[player.id] ?? 0}
          describe={(negative) => (
            <>
              <PlayerTag player={player} />
              <span style={{ opacity: 0.6 }}>{negative ? "pays" : "gets"}</span>
            </>
          )}
          onCommit={(value) => {
            setTradeCash({ [player.id]: value });
            close();
          }}
          onCancel={close}
        />
      );
    }
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
        {first && second ? (
          <CashRow
            label={
              figure < 0 ? (
                <Pays payer={second} payee={first} />
              ) : (
                <Pays payer={first} payee={second} />
              )
            }
            amountText={formatCash(Math.abs(figure))}
            color="var(--mono-ink)"
            subject={
              figure < 0
                ? `${second.name} pays ${first.name}`
                : `${first.name} pays ${second.name}`
            }
            onBump={(step) => {
              setFigure(nudgeFigure(figure, step));
            }}
            onOpen={() => {
              setEditing({ kind: "pair" });
            }}
          />
        ) : (
          state.players
            .filter((p) => !p.bankrupt)
            .map((p) => {
              const amount = terms.cashDelta[p.id] ?? 0;
              return (
                <CashRow
                  key={p.id}
                  label={<PlayerTag player={p} />}
                  amountText={signedCash(amount)}
                  color={signedColor(amount)}
                  subject={`${p.name}'s cash`}
                  onBump={(step) => {
                    setTradeCash({ [p.id]: amount + step });
                  }}
                  onOpen={() => {
                    setEditing({ kind: "player", player: p });
                  }}
                />
              );
            })
        )}
      </div>
    </>
  );
}

function Pays({ payer, payee }: { payer: Player; payee: Player }) {
  return (
    <>
      <PlayerTag player={payer} />
      <span className="shrink-0" style={{ opacity: 0.6 }}>
        pays
      </span>
      <PlayerTag player={payee} />
    </>
  );
}

function signedCash(amount: number): string {
  if (amount === 0) return "$0";
  return `${amount > 0 ? "+" : "−"}${formatCash(Math.abs(amount))}`;
}

function signedColor(amount: number): string {
  if (amount > 0) return "var(--mono-green)";
  if (amount < 0) return "var(--mono-red)";
  return "var(--mono-ink)";
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
      className="flex items-center justify-between rounded px-2 py-1 text-left"
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
  label,
  amountText,
  color,
  subject,
  onBump,
  onOpen,
}: {
  label: ReactNode;
  amountText: string;
  color: string;
  /** What the row's amount is, for the buttons' accessible names. */
  subject: string;
  onBump: (step: number) => void;
  onOpen: () => void;
}) {
  return (
    <div
      className="flex items-center justify-between gap-2 rounded px-2 py-1"
      style={TRADE_ROW_STYLE}
    >
      <span className="flex min-w-0 items-center gap-1">{label}</span>
      <div className="flex shrink-0 items-center gap-1.5">
        <StepButton
          ariaLabel={`$${CASH_STEP} less: ${subject}`}
          onClick={() => {
            onBump(-CASH_STEP);
          }}
        >
          <Minus className="h-3.5 w-3.5" />
        </StepButton>
        <button
          type="button"
          aria-label={`Enter amount: ${subject}`}
          onClick={onOpen}
          className="h-7 min-w-16 rounded px-1.5 text-right font-semibold tabular-nums"
          style={{ ...BUTTON_STYLE, color }}
        >
          {amountText}
        </button>
        <StepButton
          ariaLabel={`$${CASH_STEP} more: ${subject}`}
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
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded"
      style={BUTTON_STYLE}
    >
      {children}
    </button>
  );
}
