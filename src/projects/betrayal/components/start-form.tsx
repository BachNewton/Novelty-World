"use client";

import { useState } from "react";
import type { Character } from "../types";
import type { Scenario } from "../engine/scenario";
import type { Engine } from "../engine/step-loop";
import type { SharedGame } from "../share";
import { ErrorBox } from "./error-box";
import { compactScenario, ScenarioForm } from "./scenario-form";

const MIN_SEATS = 3;
const MAX_SEATS = 6;

const FIELD = "min-w-0 rounded border border-(--bt-line) bg-(--bt-bg) px-2 py-1";
const BUTTON = "rounded border border-(--bt-line) px-3 py-1 disabled:opacity-40";

type Seats = SharedGame["game"]["seats"];

/** One explorer from each of the first few character cards. */
function defaultSeats(characters: Character[], count: number): Seats {
  const cards = [...new Set(characters.map((c) => c.card))];
  return cards.slice(0, count).map((card, index) => ({
    name: `Player ${index + 1}`,
    character: characters.find((c) => c.card === card)?.id ?? "",
  }));
}

function today(): SharedGame["game"]["today"] {
  const now = new Date();
  return { month: now.getMonth() + 1, day: now.getDate() };
}

export function StartForm({
  engine,
  error,
  initial,
  onStart,
  onOpen,
}: {
  engine: Engine;
  error: string | null;
  /** The game to start from again: its seats, seed and scenario. */
  initial: SharedGame["game"] | null;
  onStart: (game: SharedGame["game"]) => void;
  /** Opens a pasted shared-game code. */
  onOpen: (code: string) => void;
}) {
  const characters = Object.values(engine.catalog.characters);
  const [seats, setSeats] = useState(
    () => initial?.seats ?? defaultSeats(characters, MIN_SEATS),
  );
  const [seed, setSeed] = useState(() => initial?.seed ?? crypto.randomUUID());
  const [scenario, setScenario] = useState<Scenario>(() => initial?.scenario ?? {});
  const [code, setCode] = useState("");

  const cardOf = (id: string) => characters.find((c) => c.id === id)?.card;
  const update = (index: number, change: Partial<Seats[number]>) => {
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
    <div className="flex max-w-3xl flex-col gap-4">
      <form
        className="flex flex-col gap-3 rounded border border-(--bt-line) bg-(--bt-panel) p-4"
        onSubmit={(e) => {
          e.preventDefault();
          const chosen = compactScenario(scenario, seats.length);
          onStart({
            seed,
            sets: ["base"],
            seats,
            today: initial?.today ?? today(),
            ...(chosen ? { scenario: chosen } : {}),
          });
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
                className={`${FIELD} flex-1`}
                value={seat.name}
                aria-label={`Seat ${index} name`}
                onChange={(e) => {
                  update(index, { name: e.target.value });
                }}
              />
              <select
                className={`${FIELD} flex-1`}
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
            className={BUTTON}
            disabled={seats.length >= MAX_SEATS}
            onClick={addSeat}
          >
            Add seat
          </button>
          <button
            type="button"
            className={BUTTON}
            disabled={seats.length <= MIN_SEATS}
            onClick={() => {
              setSeats(seats.slice(0, -1));
            }}
          >
            Remove seat
          </button>
        </div>

        <label className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-(--bt-muted)">Seed</span>
          <input
            className={`${FIELD} flex-1 font-mono text-xs`}
            value={seed}
            onChange={(e) => {
              setSeed(e.target.value);
            }}
          />
          <button
            type="button"
            className={BUTTON}
            onClick={() => {
              setSeed(crypto.randomUUID());
            }}
          >
            New seed
          </button>
        </label>

        <details className="rounded border border-(--bt-line) p-2">
          <summary className="cursor-pointer font-semibold">
            Scenario (playtesting): stacked decks, placed explorers, start a haunt
          </summary>
          <div className="mt-3">
            <ScenarioForm
              engine={engine}
              seats={seats}
              scenario={scenario}
              onChange={setScenario}
            />
            <button
              type="button"
              className={`${BUTTON} mt-3`}
              onClick={() => {
                setScenario({});
              }}
            >
              Clear the scenario
            </button>
          </div>
        </details>

        <button
          type="submit"
          className="self-end rounded bg-(--bt-accent) px-4 py-1 font-semibold text-(--bt-bg)"
        >
          Start
        </button>
        {error !== null && <ErrorBox message={error} />}
      </form>

      <form
        className="flex flex-col gap-2 rounded border border-(--bt-line) bg-(--bt-panel) p-4"
        onSubmit={(e) => {
          e.preventDefault();
          onOpen(code);
        }}
      >
        <h2 className="font-semibold">Open a shared game</h2>
        <p className="text-xs text-(--bt-muted)">
          Paste a code or link from a game&apos;s Share panel. It rebuilds that
          game exactly, from its start or at the position it was shared.
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            className={`${FIELD} flex-1 font-mono text-xs`}
            value={code}
            placeholder="Code or link"
            onChange={(e) => {
              setCode(e.target.value);
            }}
          />
          <button type="submit" className={BUTTON} disabled={code.trim() === ""}>
            Open
          </button>
        </div>
      </form>
    </div>
  );
}
