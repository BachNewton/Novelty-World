"use client";

import { ArrowRightLeft, Dices, Flag } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { useMonopolyStore } from "../store";
import type { ArmedPauses, GameState } from "../types";

interface Props {
  state: GameState;
}

const NO_ARMED_PAUSES: ArmedPauses = { beforeRoll: false, beforeEnd: false };

/** Bottom row of the footer. Three persistent controls the local player
 *  uses to bend the auto-pacer to their will. Each column is the same
 *  width and represents its intent with an icon so the bar stays legible
 *  on a 375px viewport.
 *
 *  1. Trade — pause the game at the next inter-turn boundary so this
 *     player can propose a trade. Placeholder for now: the proposal flow
 *     and resolution sub-game aren't built yet, so the button is shown
 *     disabled to reserve its spot in the layout.
 *
 *  2. Pause before roll — armed one-shot pause that fires at the local
 *     player's next pre-roll. Lets them act before the dice fly.
 *     Auto-clears the moment it fires.
 *
 *  3. Pause before end of turn — same idea, but the pause fires at the
 *     local player's next post-roll, before the engine auto-end-turns.
 *
 *  The bar never gets hijacked by the buy-decision UI — that lives in
 *  the prompt section above the log instead. */
export function ActionBar({ state }: Props) {
  const myPlayerId = useMonopolyStore((s) => s.myPlayerId);
  const submit = useMonopolyStore((s) => s.submit);

  const armed = myPlayerId
    ? (state.armedPauses[myPlayerId] ?? NO_ARMED_PAUSES)
    : NO_ARMED_PAUSES;

  const setArmed = (when: "before-roll" | "before-end", value: boolean) => {
    if (!myPlayerId) return;
    submit({ kind: "set-armed-pause", playerId: myPlayerId, when, armed: value });
  };

  const interactive = myPlayerId !== null;

  return (
    <div className="flex">
      <ActionCell
        variant="button"
        icon={<ArrowRightLeft className="h-5 w-5" aria-hidden="true" />}
        label="Trade"
        disabled
      />
      <ActionCell
        variant="checkbox"
        // Checkbox glyph + Dices reads as "armed to pause before the dice
        // roll" — the visible check state anchors the toggle semantic so a
        // glance is enough to see it's a pause-arming control, not a roll
        // action.
        icon={<Dices className="h-5 w-5" aria-hidden="true" />}
        label="Roll"
        ariaLabel="Pause before roll"
        checked={armed.beforeRoll}
        disabled={!interactive}
        onToggle={(next) => {
          setArmed("before-roll", next);
        }}
      />
      <ActionCell
        variant="checkbox"
        icon={<Flag className="h-5 w-5" aria-hidden="true" />}
        label="End"
        ariaLabel="Pause before end of turn"
        checked={armed.beforeEnd}
        disabled={!interactive}
        onToggle={(next) => {
          setArmed("before-end", next);
        }}
      />
    </div>
  );
}

type CellProps =
  | {
      variant: "button";
      icon: ReactNode;
      label: string;
      disabled: boolean;
    }
  | {
      variant: "checkbox";
      icon: ReactNode;
      label: string;
      ariaLabel: string;
      checked: boolean;
      disabled: boolean;
      onToggle: (next: boolean) => void;
    };

// Single layout primitive for every action-bar slot so the three cells
// stay the same width and height. Vertical stack: icon row (checkbox
// glyph + intent icon for toggles, just the intent icon for buttons) on
// top, short label below. Variant selects whether the cell behaves like
// a one-shot button (Trade) or a toggle (the two pause checkboxes).
function ActionCell(props: CellProps) {
  const checked = props.variant === "checkbox" ? props.checked : false;
  const accent = checked ? "var(--mono-orange)" : "var(--mono-ink)";

  const style: CSSProperties = {
    backgroundColor: checked ? "var(--mono-card)" : "var(--mono-board)",
    color: accent,
    minHeight: "56px",
  };
  const className =
    "flex flex-1 flex-col items-center justify-center gap-1 px-2 py-2 disabled:opacity-40";

  const body = (
    <>
      <span className="inline-flex items-center gap-1.5">
        {props.variant === "checkbox" && (
          <CheckboxGlyph checked={checked} accent={accent} />
        )}
        {props.icon}
      </span>
      <span
        className="font-semibold uppercase tracking-wider"
        style={{ fontSize: "0.65rem", lineHeight: 1 }}
      >
        {props.label}
      </span>
    </>
  );

  if (props.variant === "button") {
    return (
      <button
        type="button"
        disabled={props.disabled}
        className={className}
        style={style}
      >
        {body}
      </button>
    );
  }

  return (
    <button
      type="button"
      role="checkbox"
      aria-label={props.ariaLabel}
      aria-checked={checked}
      disabled={props.disabled}
      onClick={() => {
        props.onToggle(!checked);
      }}
      className={className}
      style={style}
    >
      {body}
    </button>
  );
}

function CheckboxGlyph({
  checked,
  accent,
}: {
  checked: boolean;
  accent: string;
}): ReactNode {
  // Custom SVG so the check stroke uses the cell background color, giving
  // a crisp filled-square look against the dark theme without pulling in
  // another lucide icon just to render a 14px box.
  return (
    <span
      className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm"
      style={{
        backgroundColor: checked ? accent : "transparent",
        boxShadow: `inset 0 0 0 1.5px ${accent}`,
      }}
      aria-hidden="true"
    >
      {checked ? (
        <svg
          viewBox="0 0 16 16"
          className="h-2.5 w-2.5"
          style={{ color: "var(--mono-card)" }}
        >
          <path
            d="M3 8.5l3 3 7-7"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : null}
    </span>
  );
}
