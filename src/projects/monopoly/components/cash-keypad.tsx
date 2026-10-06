"use client";

import { Delete, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { cashEntryValue, openCashEntry, pressCashKey } from "../trade-cash";
import type { CashKey } from "../trade-cash";
import { TRADE_ROW_STYLE, TradeCash } from "./trade-ui";

interface Props {
  /** The signed amount the keypad opens on. */
  initial: number;
  /** Whose amount is being edited. */
  label: ReactNode;
  onCommit: (value: number) => void;
  onCancel: () => void;
}

type KeyAction = CashKey | "ok" | "cancel";

/** In-panel cash entry, in place of the OS keyboard (which would cover half a
 *  phone's board). Edits stay local until OK, so the synced draft gets one
 *  snapshot per entry rather than one per keystroke. While open it also takes
 *  the desktop keyboard: digits, Backspace, Enter, Escape, and `-`. */
export function CashKeypad({ initial, label, onCommit, onCancel }: Props) {
  const [entry, setEntry] = useState(() => openCashEntry(initial));
  const rootRef = useRef<HTMLDivElement>(null);

  // The panel scrolls, and the keypad can open below its fold.
  useEffect(() => {
    rootRef.current?.scrollIntoView({ block: "nearest" });
  }, []);

  const act = useCallback(
    (action: KeyAction) => {
      if (action === "ok") onCommit(cashEntryValue(entry));
      else if (action === "cancel") onCancel();
      else setEntry(pressCashKey(entry, action));
    },
    [entry, onCommit, onCancel],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const action = keyAction(e.key);
      if (action === null) return;
      // Claims the key: other hotkeys skip a prevented event, and a focused
      // keypad button doesn't also click on Enter.
      e.preventDefault();
      act(action);
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, [act]);

  const digit = (d: number) => (
    <Key
      label={String(d)}
      onClick={() => {
        act({ kind: "digit", digit: d });
      }}
    />
  );

  return (
    <div ref={rootRef} className="flex flex-col gap-1">
      <div className="flex items-center gap-2 rounded pl-2" style={TRADE_ROW_STYLE}>
        <span className="flex min-w-0 flex-1 items-center">{label}</span>
        <span className="text-base" style={{ opacity: entry.fresh ? 0.6 : 1 }}>
          <TradeCash amount={entry.amount} negative={entry.negative} />
        </span>
        <button
          type="button"
          aria-label="Cancel cash entry"
          onClick={onCancel}
          className="flex h-11 w-11 shrink-0 items-center justify-center"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-4 gap-1">
        {digit(1)}
        {digit(2)}
        {digit(3)}
        <Key
          label={<Delete className="h-4 w-4" />}
          ariaLabel="Delete digit"
          onClick={() => {
            act({ kind: "back" });
          }}
        />
        {digit(4)}
        {digit(5)}
        {digit(6)}
        <Key
          label="−"
          ariaLabel="Negative"
          onClick={() => {
            act({ kind: "negate" });
          }}
        />
        {digit(7)}
        {digit(8)}
        {digit(9)}
        <Key
          label="C"
          ariaLabel="Clear"
          onClick={() => {
            act({ kind: "clear" });
          }}
        />
        <Key
          label="0"
          wide
          onClick={() => {
            act({ kind: "digit", digit: 0 });
          }}
        />
        <Key
          label="OK"
          wide
          primary
          onClick={() => {
            act("ok");
          }}
        />
      </div>
    </div>
  );
}

function keyAction(key: string): KeyAction | null {
  if (/^[0-9]$/.test(key)) return { kind: "digit", digit: Number(key) };
  switch (key) {
    case "Backspace":
      return { kind: "back" };
    case "-":
      return { kind: "negate" };
    case "Enter":
      return "ok";
    case "Escape":
      return "cancel";
    default:
      return null;
  }
}

const KEY_STYLE: CSSProperties = {
  backgroundColor: "var(--mono-card)",
  color: "var(--mono-ink)",
  boxShadow: "inset 0 0 0 1px var(--mono-frame)",
};

// Dark ink on the bright green, matching the panel's primary buttons.
const PRIMARY_KEY_STYLE: CSSProperties = {
  backgroundColor: "var(--mono-green)",
  color: "var(--mono-frame)",
};

function Key({
  label,
  ariaLabel,
  onClick,
  wide = false,
  primary = false,
}: {
  label: ReactNode;
  ariaLabel?: string;
  onClick: () => void;
  wide?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      className={`flex h-11 items-center justify-center rounded text-base font-semibold ${wide ? "col-span-2" : ""}`}
      style={primary ? PRIMARY_KEY_STYLE : KEY_STYLE}
    >
      {label}
    </button>
  );
}
