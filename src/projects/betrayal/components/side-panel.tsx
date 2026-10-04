import type { GameState, Seat, Side } from "../types";
import { allFigures, figureName, TRAITS } from "../engine/figures";
import { traitValue } from "../engine/questions";
import type { Engine } from "../engine/step-loop";
import { seatLabel } from "./describe";

/** A seat's side and roles, as the debug view shows them: secrets too. */
function allegiance(seat: Seat): string[] {
  if (seat.side === null) return [];
  const what = seat.roles.includes("traitor") ? "Traitor" : SIDE_NAMES[seat.side];
  return [seat.knownBy === null ? what : `${what} (secret)`];
}

const SIDE_NAMES: Record<Side, string> = {
  heroes: "Hero",
  traitor: "Traitor's side",
  neutral: "Neutral",
};

export function SidePanel({
  engine,
  state,
}: {
  engine: Engine;
  state: GameState;
}) {
  const { rooms, cards } = engine.catalog;
  const piles = Object.entries(state.piles);
  return (
    <div className="flex flex-col gap-3 text-sm">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3">
        <dt className="text-(--bt-muted)">Status</dt>
        <dd>{state.status}</dd>
        <dt className="text-(--bt-muted)">Omens drawn</dt>
        <dd>{state.omensDrawn}</dd>
        <dt className="text-(--bt-muted)">Turn</dt>
        <dd>
          {state.turn ? seatLabel(engine, state, state.turn.seat) : "none"}
        </dd>
        <dt className="text-(--bt-muted)">Haunt</dt>
        <dd>
          {state.haunt
            ? `#${state.haunt.number}, revealed by ${seatLabel(engine, state, state.haunt.revealer)} (${cards[state.haunt.omen].name} in the ${rooms[state.haunt.room].name})`
            : "not yet"}
        </dd>
      </dl>

      {allFigures(state).map((figure) => {
        return (
          <section
            key={figure.id}
            className="rounded border border-(--bt-line) p-2"
          >
            <h3 className="font-semibold">
              {figure.owner === null
                ? ""
                : `${figure.owner}. ${state.seats[figure.owner].name}: `}
              {figureName(engine.catalog, state, figure.id)}
            </h3>
            <p className="text-(--bt-muted)">
              {[
                ...(figure.owner === null
                  ? []
                  : allegiance(state.seats[figure.owner])),
                figure.alive ? null : "Dead",
                figure.place === null
                  ? "Off the board"
                  : `In the ${rooms[figure.place.room].name}`,
              ]
                .filter((part) => part !== null)
                .join(" · ")}
            </p>
            <ul className="mt-1 grid grid-cols-2 gap-x-3">
              {TRAITS.map((trait) => (
                <li key={trait} className="flex justify-between">
                  <span className="capitalize text-(--bt-muted)">{trait}</span>
                  <span>
                    {traitValue(engine, state, figure.id, trait)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-1">
              <span className="text-(--bt-muted)">Cards: </span>
              {figure.cards.length > 0
                ? figure.cards.map((c) => cards[c].name).join(", ")
                : "none"}
            </p>
          </section>
        );
      })}

      <section>
        <h3 className="font-semibold">Item piles</h3>
        {piles.length === 0 ? (
          <p className="text-(--bt-muted)">none</p>
        ) : (
          <ul>
            {piles.map(([room, pile]) => (
              <li key={room}>
                {rooms[room].name}: {pile.map((c) => cards[c].name).join(", ")}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
