import type { GameState } from "../types";
import { TRAITS, traitValue } from "../engine/explorers";
import type { Engine } from "../engine/step-loop";
import { seatLabel } from "./describe";

export function SidePanel({
  engine,
  state,
}: {
  engine: Engine;
  state: GameState;
}) {
  const { rooms, cards, characters } = engine.catalog;
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

      {state.explorers.map((explorer) => {
        const character = characters[explorer.character];
        return (
          <section
            key={explorer.seat}
            className="rounded border border-(--bt-line) p-2"
          >
            <h3 className="font-semibold">
              {explorer.seat}. {state.seats[explorer.seat].name}:{" "}
              {character.name}
            </h3>
            <p className="text-(--bt-muted)">
              In the {rooms[explorer.room].name}
            </p>
            <ul className="mt-1 grid grid-cols-2 gap-x-3">
              {TRAITS.map((trait) => (
                <li key={trait} className="flex justify-between">
                  <span className="capitalize text-(--bt-muted)">{trait}</span>
                  <span>
                    {traitValue(engine.catalog, state, explorer.seat, trait)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-1">
              <span className="text-(--bt-muted)">Cards: </span>
              {explorer.cards.length > 0
                ? explorer.cards.map((c) => cards[c].name).join(", ")
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
