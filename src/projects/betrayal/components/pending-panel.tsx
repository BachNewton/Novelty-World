import type { Action, GameState } from "../types";
import { choices, type Choice, type Engine } from "../engine/step-loop";
import { describeDecision, describeRule } from "../engine/describe";
import { seatLabel } from "./describe";
import { ErrorBox } from "./error-box";
import type { Offer } from "./focus";
import { SEAT_BG } from "./theme";
import { Why } from "./why";

/** What the pending decision offers one seat still to answer it. Listing
 *  choices runs engine code, which throws for content with no behaviour yet,
 *  and the panel shows that error in place of the choices. */
export type SeatOffer = Offer | { seat: number; choices: null; error: string };

export function offersFor(engine: Engine, state: GameState): SeatOffer[] {
  const pending = state.pending;
  if (pending?.type !== "decision") return [];
  return pending.seats
    .filter((seat) => !(seat in pending.answers))
    .map((seat) => {
      try {
        return { seat, choices: choices(engine, state, seat) };
      } catch (error) {
        return { seat, choices: null, error: errorText(error) };
      }
    });
}

export function errorText(error: unknown): string {
  if (error instanceof Error) return error.stack ?? error.message;
  return String(error);
}

export function PendingPanel({
  engine,
  state,
  offers,
  onAction,
}: {
  engine: Engine;
  state: GameState;
  offers: SeatOffer[];
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
        <div>
          Waiting for players to read and confirm{" "}
          <span className="text-(--bt-muted)">
            ({describeRule(engine, pending.rule)})
          </span>
          <Why engine={engine} rule={pending.rule} />
        </div>
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

  return (
    <div className="flex flex-col gap-3">
      <div>
        {describeDecision(engine, state, pending)}{" "}
        <span className="text-xs text-(--bt-muted)">
          ({pending.id}, {describeRule(engine, pending.rule)})
        </span>
        <Why engine={engine} rule={pending.rule} />
      </div>
      {offers.map((offer) => (
        <div key={offer.seat} className="flex flex-col gap-1">
          <h3 className="flex items-center gap-1.5 font-semibold">
            <span className={`inline-block size-2.5 rounded-full ${SEAT_BG[offer.seat]}`} />
            {seatLabel(engine, state, offer.seat)}
          </h3>
          {offer.choices === null ? (
            <ErrorBox message={offer.error} />
          ) : (
            <div className="flex flex-wrap gap-2">
              {offer.choices.map((c: Choice) => (
                <ChoiceButton
                  key={JSON.stringify(c.choice)}
                  label={c.label}
                  onClick={() => {
                    onAction({
                      kind: "choose",
                      decision: pending.id,
                      seat: offer.seat,
                      choice: c.choice,
                    });
                  }}
                />
              ))}
            </div>
          )}
        </div>
      ))}
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
