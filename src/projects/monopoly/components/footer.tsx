import type { GameState } from "../types";
import { ActionBar } from "./action-bar";
import { EventLog } from "./event-log";
import { PromptSection } from "./prompt-section";

interface Props {
  state: GameState;
}

export function Footer({ state }: Props) {
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
      <EventLog state={state} />
      <ActionBar state={state} />
    </div>
  );
}
