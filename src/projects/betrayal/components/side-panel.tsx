import type { Side, Trait, TurnKind } from "../types";
import type { Engine } from "../engine/step-loop";
import type { GameView, SeatView, SecretView } from "../engine/view";
import { seatLabel } from "./describe";

/** A seat's side and roles, as far as the viewer knows them. */
function allegiance(seat: SeatView): string[] {
  if (seat.hidden) return ["Side kept secret"];
  if (seat.side === null) return [];
  const what = seat.roles.includes("traitor") ? "Traitor" : SIDE_NAMES[seat.side];
  return [seat.secret ? `${what} (secret)` : what];
}

const TURN_NAMES: Record<TurnKind, string> = {
  explorer: "explorer turn",
  traitor: "traitor turn",
  monster: "monster turn",
};

const SIDE_NAMES: Record<Side, string> = {
  heroes: "Hero",
  traitor: "Traitor's side",
  neutral: "Neutral",
};

function secretText(view: GameView, secret: SecretView): string {
  const value = secret.known ? JSON.stringify(secret.value) : "unknown to you";
  const knowers =
    secret.knownBy === undefined
      ? ""
      : secret.knownBy === null
        ? " (everyone knows)"
        : ` (known to ${secret.knownBy.map((seat) => seatLabel(view, seat)).join(", ") || "no one"})`;
  return `${secret.name}: ${value}${knowers}`;
}

export function SidePanel({ engine, view }: { engine: Engine; view: GameView }) {
  const { rooms, cards } = engine.catalog;
  const piles = Object.entries(view.piles);
  return (
    <div className="flex flex-col gap-3 text-sm">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3">
        <dt className="text-(--bt-muted)">Status</dt>
        <dd>{view.status}</dd>
        <dt className="text-(--bt-muted)">Omens drawn</dt>
        <dd>{view.omensDrawn}</dd>
        <dt className="text-(--bt-muted)">Stacks</dt>
        <dd>
          {view.board.stack} rooms, {view.decks.omen.draw} omens,{" "}
          {view.decks.item.draw} items, {view.decks.event.draw} events
        </dd>
        <dt className="text-(--bt-muted)">Turn</dt>
        <dd>
          {view.turn
            ? `${view.turn.seat === null ? "A player" : seatLabel(view, view.turn.seat)}, ${TURN_NAMES[view.turn.kind]}${view.turn.follows ? " (inserted)" : ""}`
            : "none"}
        </dd>
        <dt className="text-(--bt-muted)">Haunt</dt>
        <dd>
          {view.haunt
            ? `#${view.haunt.number}${view.haunt.name === null ? "" : ` ${view.haunt.name}`}, revealed by ${seatLabel(view, view.haunt.revealer)} (${cards[view.haunt.omen].name} in the ${rooms[view.haunt.room].name})`
            : "not yet"}
        </dd>
        {view.haunt && (
          <>
            <dt className="text-(--bt-muted)">Counters</dt>
            <dd>
              {Object.entries(view.haunt.counters)
                .map(
                  ([id, value]) =>
                    `${engine.haunts[view.haunt?.number ?? 0]?.counters[id]?.name ?? id}: ${value}`,
                )
                .join(", ") || "none"}
            </dd>
            <dt className="text-(--bt-muted)">Secrets</dt>
            <dd>
              {view.haunt.secrets.map((s) => secretText(view, s)).join("; ") ||
                "none"}
            </dd>
          </>
        )}
        {view.result && (
          <>
            <dt className="text-(--bt-muted)">Result</dt>
            <dd>
              {view.result.winners.length === 0
                ? "no one wins"
                : `won by ${view.result.winners.map((seat) => seatLabel(view, seat)).join(", ")}`}
            </dd>
          </>
        )}
      </dl>

      {Object.values(view.figures).map((figure) => (
        <section key={figure.id} className="rounded border border-(--bt-line) p-2">
          <h3 className="font-semibold">
            {figure.owner === null
              ? ""
              : `${figure.owner}. ${view.seats[figure.owner].name}: `}
            {figure.name}
          </h3>
          <p className="text-(--bt-muted)">
            {[
              ...(figure.kind === "explorer" && figure.owner !== null
                ? allegiance(view.seats[figure.owner])
                : []),
              figure.alive ? null : "Dead",
              figure.stunned ? "Stunned" : null,
              ...figure.statuses.map(
                (status) => engine.behaviours.statuses[status.id]?.name ?? status.id,
              ),
              figure.place === null
                ? "Off the board"
                : `In the ${rooms[figure.place.room].name}`,
            ]
              .filter((part) => part !== null)
              .join(" · ")}
          </p>
          <ul className="mt-1 grid grid-cols-2 gap-x-3">
            {(Object.entries(figure.traits) as [Trait, number | null][]).map(
              ([trait, value]) => (
                <li key={trait} className="flex justify-between">
                  <span className="capitalize text-(--bt-muted)">{trait}</span>
                  <span>{value ?? "?"}</span>
                </li>
              ),
            )}
          </ul>
          <p className="mt-1">
            <span className="text-(--bt-muted)">Cards: </span>
            {figure.cards.length > 0
              ? figure.cards.map((c) => cards[c].name).join(", ")
              : "none"}
          </p>
        </section>
      ))}

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

/** The halves of the haunt's text the viewing seat may read. */
export function HauntText({ view }: { view: GameView }) {
  const halves = [view.haunt?.halves.traitor, view.haunt?.halves.heroes].filter(
    (half) => half !== undefined,
  );
  if (halves.length === 0)
    return (
      <p className="text-sm text-(--bt-muted)">
        {view.haunt === null
          ? "The haunt hasn't begun."
          : "No half of this haunt is yours to read."}
      </p>
    );
  return (
    <div className="flex flex-col gap-2 text-sm">
      {halves.map((half) => (
        <details key={half.title} open>
          <summary className="cursor-pointer font-semibold">{half.title}</summary>
          <div className="mt-1 max-h-[24rem] overflow-y-auto whitespace-pre-wrap break-words">
            {half.text}
          </div>
        </details>
      ))}
    </div>
  );
}
