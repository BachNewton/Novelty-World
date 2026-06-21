"use client";

import { ArrowRightLeft, Wrench } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { useMonopolyStore } from "../store";
import type { GameState } from "../types";

interface Props {
  state: GameState;
}

/** The bar's fixed height. Shared so the event log can absorb exactly this much
 *  extra height when the bar is hidden (a bankrupt or spectating viewer). */
export const ACTION_BAR_HEIGHT = "56px";

/** Bottom row of the footer. Two persistent toggles the local player uses to
 *  arm a between-turns intermission. Each column is the same width and
 *  represents its intent with an icon so the bar stays legible on a 360px
 *  viewport.
 *
 *  1. Trade — "I want to trade" toggle. Arming it queues the player; the game
 *     pauses at the next pre-roll ("just before the next roll") and opens their
 *     trade builder.
 *
 *  2. Manage — "I want to build / mortgage" toggle. Same boundary, same FIFO
 *     queue; arming it opens their manage intermission instead.
 *
 *  Both read as checkboxes because they share the arm-and-fire shape. The bar
 *  never gets hijacked by the buy-decision UI — that lives in the prompt
 *  section above the log instead. */
export function ActionBar({ state }: Props) {
  const myPlayerId = useMonopolyStore((s) => s.myPlayerId);
  const toggleQueue = useMonopolyStore((s) => s.toggleQueue);

  const interactive = myPlayerId !== null;
  const queued = (kind: "trade" | "manage"): boolean =>
    myPlayerId !== null &&
    state.boundaryQueue.some(
      (e) => e.playerId === myPlayerId && e.kind === kind,
    );

  return (
    <div className="flex">
      <ActionCell
        icon={<ArrowRightLeft className="h-5 w-5" aria-hidden="true" />}
        label="Trade"
        ariaLabel="Trade at the next turn boundary"
        checked={queued("trade")}
        disabled={!interactive}
        onToggle={() => {
          toggleQueue("trade");
        }}
      />
      <ActionCell
        icon={<Wrench className="h-5 w-5" aria-hidden="true" />}
        label="Manage"
        ariaLabel="Manage properties at the next turn boundary"
        checked={queued("manage")}
        disabled={!interactive}
        onToggle={() => {
          toggleQueue("manage");
        }}
      />
    </div>
  );
}

interface CellProps {
  icon: ReactNode;
  label: string;
  ariaLabel: string;
  checked: boolean;
  disabled: boolean;
  onToggle: (next: boolean) => void;
}

// Single layout primitive for every action-bar slot so the cells stay the
// same width and height. Vertical stack: icon row (checkbox glyph + intent
// icon) on top, short label below. Each cell is an arm/disarm toggle.
function ActionCell(props: CellProps) {
  const { checked } = props;
  const accent = checked ? "var(--mono-orange)" : "var(--mono-ink)";

  const style: CSSProperties = {
    backgroundColor: checked ? "var(--mono-card)" : "var(--mono-board)",
    color: accent,
    minHeight: ACTION_BAR_HEIGHT,
  };
  const className =
    "flex flex-1 flex-col items-center justify-center gap-1 px-2 py-2 disabled:opacity-40";

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
      <span className="inline-flex items-center gap-1.5">
        <CheckboxGlyph checked={checked} accent={accent} />
        {props.icon}
      </span>
      <span
        className="font-semibold uppercase tracking-wider"
        style={{ fontSize: "0.65rem", lineHeight: 1 }}
      >
        {props.label}
      </span>
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
