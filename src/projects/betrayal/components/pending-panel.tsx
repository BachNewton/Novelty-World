import type { Action, GameState } from "../types";
import { choices, type Choice, type Engine } from "../engine/step-loop";
import { describeDecision, describeRule } from "../engine/describe";
import { seatLabel } from "./describe";
import { ErrorBox } from "./error-box";

/** Listing choices runs engine code, which throws for content with no behaviour yet. */
function choicesFor(
  engine: Engine,
  state: GameState,
  seat: number,
): { choices: Choice[] } | { error: string } {
  try {
    return { choices: choices(engine, state, seat) };
  } catch (error) {
    return { error: errorText(error) };
  }
}

export function errorText(error: unknown): string {
  if (error instanceof Error) return error.stack ?? error.message;
  return String(error);
}

export function PendingPanel({
  engine,
  state,
  onAction,
}: {
  engine: Engine;
  state: GameState;
  onAction: (action: Action) => void;
}) {
  if (state.haunt) {
    return (
      <p className="font-semibold text-(--bt-danger)">
        The haunt is revealed: haunt #{state.haunt.number}. Exploration ends
        here; haunts aren&apos;t built yet.
      </p>
    );
  }
  const pending = state.pending;
  if (!pending) return <p className="text-(--bt-muted)">Nothing pending.</p>;

  if (pending.type === "ready") {
    return (
      <div className="flex flex-col gap-2">
        <p>
          Waiting for players to read and confirm{" "}
          <span className="text-(--bt-muted)">
            ({describeRule(engine, pending.rule)})
          </span>
        </p>
        <div className="flex flex-wrap gap-2">
          {pending.seats.map((seat) => (
            <ChoiceButton
              key={seat}
              label={`Ready: ${seatLabel(engine, state, seat)}`}
              onClick={() => {
                onAction({ kind: "ready", wait: pending.id, seat });
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  const waiting = pending.seats.filter((seat) => !(seat in pending.answers));
  return (
    <div className="flex flex-col gap-3">
      <p>
        {describeDecision(engine, state, pending)}{" "}
        <span className="text-xs text-(--bt-muted)">
          ({pending.id}, {describeRule(engine, pending.rule)})
        </span>
      </p>
      {waiting.map((seat) => {
        const offered = choicesFor(engine, state, seat);
        return (
          <div key={seat} className="flex flex-col gap-1">
            <h3 className="font-semibold">{seatLabel(engine, state, seat)}</h3>
            {"error" in offered ? (
              <ErrorBox message={offered.error} />
            ) : (
              <div className="flex flex-wrap gap-2">
                {offered.choices.map((c) => (
                  <ChoiceButton
                    key={JSON.stringify(c.choice)}
                    label={c.label}
                    onClick={() => {
                      onAction({
                        kind: "choose",
                        decision: pending.id,
                        seat,
                        choice: c.choice,
                      });
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ChoiceButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="rounded border border-(--bt-line) bg-(--bt-room) px-3 py-1.5 text-left text-sm hover:border-(--bt-accent)"
      onClick={onClick}
    >
      {label}
    </button>
  );
}
