"use client";

import { useState } from "react";
import type { Character } from "../types";
import type { NewGame } from "../engine/exploration";
import type { Engine } from "../engine/step-loop";
import { ErrorBox } from "./error-box";

const MIN_SEATS = 3;
const MAX_SEATS = 6;

interface SeatDraft {
  name: string;
  character: string;
}

/** One explorer from each of the first few character cards. */
function defaultSeats(characters: Character[], count: number): SeatDraft[] {
  const cards = [...new Set(characters.map((c) => c.card))];
  return cards.slice(0, count).map((card, index) => ({
    name: `Player ${index + 1}`,
    character: characters.find((c) => c.card === card)?.id ?? "",
  }));
}

export function StartForm({
  engine,
  error,
  onStart,
}: {
  engine: Engine;
  error: string | null;
  onStart: (seats: NewGame["seats"]) => void;
}) {
  const characters = Object.values(engine.catalog.characters);
  const [seats, setSeats] = useState(() => defaultSeats(characters, MIN_SEATS));

  const cardOf = (id: string) => characters.find((c) => c.id === id)?.card;
  const update = (index: number, change: Partial<SeatDraft>) => {
    setSeats(seats.map((s, i) => (i === index ? { ...s, ...change } : s)));
  };
  const addSeat = () => {
    const taken = new Set(seats.map((s) => cardOf(s.character)));
    const free = characters.find((c) => !taken.has(c.card));
    setSeats([
      ...seats,
      { name: `Player ${seats.length + 1}`, character: free?.id ?? "" },
    ]);
  };

  return (
    <form
      className="flex max-w-xl flex-col gap-3 rounded border border-(--bt-line) bg-(--bt-panel) p-4"
      onSubmit={(e) => {
        e.preventDefault();
        onStart(seats);
      }}
    >
      <h2 className="text-lg font-semibold">New hot-seat game</h2>
      {seats.map((seat, index) => {
        const takenByOthers = new Set(
          seats.filter((_, i) => i !== index).map((s) => cardOf(s.character)),
        );
        return (
          <div key={index} className="flex flex-wrap items-center gap-2">
            <span className="w-14 text-sm text-(--bt-muted)">Seat {index}</span>
            <input
              className="min-w-0 flex-1 rounded border border-(--bt-line) bg-(--bt-bg) px-2 py-1"
              value={seat.name}
              aria-label={`Seat ${index} name`}
              onChange={(e) => {
                update(index, { name: e.target.value });
              }}
            />
            <select
              className="min-w-0 flex-1 rounded border border-(--bt-line) bg-(--bt-bg) px-2 py-1"
              value={seat.character}
              aria-label={`Seat ${index} character`}
              onChange={(e) => {
                update(index, { character: e.target.value });
              }}
            >
              <option value="" disabled>
                Choose an explorer
              </option>
              {characters.map((c) => (
                <option
                  key={c.id}
                  value={c.id}
                  disabled={takenByOthers.has(c.card)}
                >
                  {c.name} ({c.card})
                </option>
              ))}
            </select>
          </div>
        );
      })}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded border border-(--bt-line) px-3 py-1 disabled:opacity-40"
          disabled={seats.length >= MAX_SEATS}
          onClick={addSeat}
        >
          Add seat
        </button>
        <button
          type="button"
          className="rounded border border-(--bt-line) px-3 py-1 disabled:opacity-40"
          disabled={seats.length <= MIN_SEATS}
          onClick={() => {
            setSeats(seats.slice(0, -1));
          }}
        >
          Remove seat
        </button>
        <button
          type="submit"
          className="ml-auto rounded bg-(--bt-accent) px-4 py-1 font-semibold text-(--bt-bg)"
        >
          Start
        </button>
      </div>
      {error !== null && <ErrorBox message={error} />}
    </form>
  );
}
