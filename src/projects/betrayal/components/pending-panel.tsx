import type { Action } from "../types";
import type { Choice, Engine } from "../engine/step-loop";
import {
  describeDecision,
  describeRule,
  describeWaiting,
} from "../engine/describe";
import type { GameView } from "../engine/view";
import { seatLabel } from "./describe";
import { SEAT_BG } from "./theme";
import { Why } from "./why";

export function errorText(error: unknown): string {
  if (error instanceof Error) return error.stack ?? error.message;
  return String(error);
}

/** The pending decision as the viewing seat sees it: its question and
 *  choices when it is put to that seat, otherwise only whom it waits on. */
export function PendingPanel({
  engine,
  view,
  onAction,
}: {
  engine: Engine;
  view: GameView;
  onAction: (action: Action) => void;
}) {
  if (view.result) {
    const { winners, rule } = view.result;
    return (
      <div className="font-semibold text-(--bt-danger)">
        The game is over.{" "}
        {winners.length === 0
          ? "No one wins."
          : `Winners: ${winners.map((seat) => seatLabel(view, seat)).join(", ")}.`}{" "}
        <span className="text-xs font-normal text-(--bt-muted)">
          ({describeRule(engine, rule)})
        </span>
        <Why engine={engine} rule={rule} />
      </div>
    );
  }
  const pending = view.pending;
  if (!pending && view.haunt?.name === null) {
    return (
      <p className="font-semibold text-(--bt-danger)">
        The haunt is revealed: haunt #{view.haunt.number}, which isn&apos;t
        built yet, so the game stops here.
      </p>
    );
  }
  if (!pending) return <p className="text-(--bt-muted)">Nothing pending.</p>;
  const viewer = view.viewer;

  if (pending.type === "ready") {
    return (
      <div className="flex flex-col gap-2">
        <div>
          Waiting for {pending.seats.map((seat) => seatLabel(view, seat)).join(", ")}{" "}
          to read and confirm{" "}
          <span className="text-(--bt-muted)">
            ({describeRule(engine, pending.rule)})
          </span>
          <Why engine={engine} rule={pending.rule} />
        </div>
        {viewer !== null && pending.seats.includes(viewer) && (
          <div className="flex flex-wrap gap-2">
            <ChoiceButton
              label={`Ready: ${seatLabel(view, viewer)}`}
              onClick={() => {
                onAction({ kind: "ready", wait: pending.id, seat: viewer });
              }}
            />
          </div>
        )}
      </div>
    );
  }

  const { detail } = pending;
  if (detail === null || viewer === null) {
    return (
      <p>
        {describeWaiting(engine, view, pending)}{" "}
        <span className="text-xs text-(--bt-muted)">({pending.id})</span>
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <div>
        {describeDecision(engine, view, { ...pending, params: detail.params })}{" "}
        <span className="text-xs text-(--bt-muted)">
          ({pending.id}, {describeRule(engine, pending.rule)})
        </span>
        <Why engine={engine} rule={pending.rule} />
      </div>
      <h3 className="flex items-center gap-1.5 font-semibold">
        <span className={`inline-block size-2.5 rounded-full ${SEAT_BG[viewer]}`} />
        {seatLabel(view, viewer)}
      </h3>
      {detail.answer !== null ? (
        <p className="text-(--bt-muted)">
          You have answered. {describeWaiting(engine, view, pending)}.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {detail.choices.map((c: Choice) => (
            <ChoiceButton
              key={JSON.stringify(c.choice)}
              label={c.label}
              onClick={() => {
                onAction({
                  kind: "choose",
                  decision: pending.id,
                  seat: viewer,
                  choice: c.choice,
                });
              }}
            />
          ))}
        </div>
      )}
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
