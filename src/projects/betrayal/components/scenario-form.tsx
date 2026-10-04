"use client";

import type { ReactNode } from "react";
import type { CardType, Trait } from "../types";
import type { NewGame } from "../engine/exploration";
import { TRAITS } from "../engine/figures";
import { traitName } from "../engine/describe";
import {
  hauntCells,
  hauntNumbers,
  type ExplorerSetup,
  type Scenario,
} from "../engine/scenario";
import type { Engine } from "../engine/step-loop";

// The scenario half of the start form: it only collects input. The engine
// checks the scenario when the game starts and says what is wrong with it.

const FIELD =
  "min-w-0 rounded border border-(--bt-line) bg-(--bt-bg) px-2 py-1 text-sm";

interface Option {
  id: string;
  name: string;
}

export function ScenarioForm({
  engine,
  seats,
  scenario,
  onChange,
}: {
  engine: Engine;
  seats: NewGame["seats"];
  scenario: Scenario;
  onChange: (scenario: Scenario) => void;
}) {
  const { catalog } = engine;
  const base = (set: string) => set === "base";
  const byName = (a: Option, b: Option) => a.name.localeCompare(b.name);
  const rooms = Object.values(catalog.rooms).filter((r) => base(r.set)).sort(byName);
  const tiles = rooms.filter((r) => !r.start);
  const cards = Object.values(catalog.cards).filter((c) => base(c.set)).sort(byName);
  const ofType = (type: CardType) => cards.filter((c) => c.type === type);
  const set = (change: Partial<Scenario>) => {
    onChange({ ...scenario, ...change });
  };

  const explorer = (seat: number): ExplorerSetup =>
    scenario.explorers?.find((e) => e.seat === seat) ?? { seat };
  const setExplorer = (seat: number, change: Partial<ExplorerSetup>) => {
    const others = (scenario.explorers ?? []).filter((e) => e.seat !== seat);
    set({
      explorers: [...others, { ...explorer(seat), ...change }].sort(
        (a, b) => a.seat - b.seat,
      ),
    });
  };

  const haunt = scenario.haunt;
  const cells = haunt ? hauntCells(catalog, haunt.number) : [];
  const cellKey = (c: { omen?: string; room?: string }) => `${c.omen}|${c.room}`;

  return (
    <div className="flex flex-col gap-4 text-sm">
      <Row label="First player">
        <select
          className={FIELD}
          value={scenario.first ?? ""}
          onChange={(e) => {
            set({ first: e.target.value === "" ? undefined : Number(e.target.value) });
          }}
        >
          <option value="">Next birthday (the rule)</option>
          {seats.map((s, i) => (
            <option key={i} value={i}>
              Seat {i}: {s.name}
            </option>
          ))}
        </select>
      </Row>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-semibold">Stack the decks (top first)</legend>
        {(["omen", "item", "event"] as const).map((type) => (
          <Row key={type} label={`${type[0].toUpperCase()}${type.slice(1)}s`}>
            <IdList
              options={ofType(type)}
              value={scenario.decks?.[type] ?? []}
              onChange={(ids) => {
                set({ decks: { ...scenario.decks, [type]: ids } });
              }}
            />
          </Row>
        ))}
        <Row label="Room stack">
          <IdList
            options={tiles}
            value={scenario.stack ?? []}
            onChange={(ids) => {
              set({ stack: ids });
            }}
          />
        </Row>
      </fieldset>

      <Row label="Rooms already in the house">
        <IdList
          options={tiles}
          value={scenario.rooms ?? []}
          onChange={(ids) => {
            set({ rooms: ids });
          }}
        />
      </Row>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 font-semibold">Explorers</legend>
        <p className="text-xs text-(--bt-muted)">
          A room not yet in the house is put in it. Traits are the starting clip
          positions; held cards then apply their own effects, as if just gained.
        </p>
        {seats.map((seat, index) => {
          const setup = explorer(index);
          const character =
            seat.character === "" ? null : catalog.characters[seat.character];
          return (
            <div key={index} className="flex flex-col gap-2 rounded border border-(--bt-line) p-2">
              <h4 className="font-semibold">
                Seat {index}: {seat.name}
                {character ? ` (${character.name})` : ""}
              </h4>
              <Row label="Starts in">
                <select
                  className={FIELD}
                  value={setup.room ?? ""}
                  onChange={(e) => {
                    setExplorer(index, {
                      room: e.target.value === "" ? undefined : e.target.value,
                    });
                  }}
                >
                  <option value="">Entrance Hall (the rule)</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </Row>
              {character && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {TRAITS.map((trait) => (
                    <TraitPicker
                      key={trait}
                      trait={trait}
                      track={character.tracks[trait]}
                      start={character.start[trait]}
                      value={setup.clips?.[trait]}
                      onChange={(clip) => {
                        setExplorer(index, { clips: { ...setup.clips, [trait]: clip } });
                      }}
                    />
                  ))}
                </div>
              )}
              <Row label="Holding">
                <IdList
                  options={cards}
                  value={setup.cards ?? []}
                  onChange={(ids) => {
                    setExplorer(index, { cards: ids });
                  }}
                />
              </Row>
            </div>
          );
        })}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-semibold">Start the haunt</legend>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={haunt !== undefined}
            onChange={(e) => {
              set({
                haunt: e.target.checked
                  ? { number: hauntNumbers(catalog)[0], revealer: 0 }
                  : undefined,
              });
            }}
          />
          Start with the haunt already revealed
        </label>
        {haunt && (
          <>
            <Row label="Haunt">
              <select
                className={FIELD}
                value={haunt.number}
                onChange={(e) => {
                  set({ haunt: { number: Number(e.target.value), revealer: haunt.revealer } });
                }}
              >
                {hauntNumbers(catalog).map((n) => (
                  <option key={n} value={n}>
                    Haunt {n}
                  </option>
                ))}
              </select>
            </Row>
            <Row label="Revealer">
              <select
                className={FIELD}
                value={haunt.revealer}
                onChange={(e) => {
                  set({ haunt: { ...haunt, revealer: Number(e.target.value) } });
                }}
              >
                {seats.map((s, i) => (
                  <option key={i} value={i}>
                    Seat {i}: {s.name}
                  </option>
                ))}
              </select>
            </Row>
            <Row label="Omen and room">
              <select
                className={FIELD}
                value={haunt.omen === undefined ? "" : cellKey(haunt)}
                onChange={(e) => {
                  const cell = cells.find((c) => cellKey(c) === e.target.value);
                  set({
                    haunt: {
                      number: haunt.number,
                      revealer: haunt.revealer,
                      ...(cell ?? {}),
                    },
                  });
                }}
              >
                <option value="">First on the chart</option>
                {cells.map((c) => (
                  <option key={cellKey(c)} value={cellKey(c)}>
                    The {catalog.cards[c.omen].name} in the {catalog.rooms[c.room].name}
                  </option>
                ))}
              </select>
            </Row>
            <p className="text-xs text-(--bt-muted)">
              The revealer starts in the omen room holding the omen, unless set
              otherwise above.
            </p>
          </>
        )}
      </fieldset>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-3">
      <span className="text-(--bt-muted) sm:w-44 sm:shrink-0 sm:pt-1">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function TraitPicker({
  trait,
  track,
  start,
  value,
  onChange,
}: {
  trait: Trait;
  track: number[];
  start: number;
  value: number | undefined;
  onChange: (clip: number | undefined) => void;
}) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-xs text-(--bt-muted)">{traitName(trait)}</span>
      <select
        className={FIELD}
        value={value ?? ""}
        onChange={(e) => {
          onChange(e.target.value === "" ? undefined : Number(e.target.value));
        }}
      >
        <option value="">{track[start]} (start)</option>
        {track.map((v, clip) => (
          <option key={clip} value={clip}>
            {v} (space {clip + 1})
          </option>
        ))}
      </select>
    </label>
  );
}

/** An ordered list of ids: chips to remove, and a picker to add the next. */
function IdList({
  options,
  value,
  onChange,
}: {
  options: Option[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const name = (id: string) => options.find((o) => o.id === id)?.name ?? id;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {value.map((id, i) => (
        <span
          key={id}
          className="flex items-center gap-1 rounded border border-(--bt-line) bg-(--bt-room) px-1.5 py-0.5"
        >
          <span className="text-xs text-(--bt-muted)">{i + 1}.</span> {name(id)}
          <button
            type="button"
            className="text-(--bt-muted) hover:text-(--bt-danger)"
            aria-label={`Remove ${name(id)}`}
            onClick={() => {
              onChange(value.filter((v) => v !== id));
            }}
          >
            ✕
          </button>
        </span>
      ))}
      <select
        className={FIELD}
        value=""
        aria-label="Add"
        onChange={(e) => {
          onChange([...value, e.target.value]);
        }}
      >
        <option value="">{value.length === 0 ? "None: add…" : "Add…"}</option>
        {options
          .filter((o) => !value.includes(o.id))
          .map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
      </select>
    </div>
  );
}

/** The scenario without its empty parts, so a shared code stays short. A
 *  scenario with nothing in it is no scenario. */
export function compactScenario(scenario: Scenario, seats: number): Scenario | undefined {
  const some = <T,>(list: T[] | undefined) => (list && list.length > 0 ? list : undefined);
  const decks = {
    omen: some(scenario.decks?.omen),
    item: some(scenario.decks?.item),
    event: some(scenario.decks?.event),
  };
  const explorers = (scenario.explorers ?? [])
    .filter((e) => e.seat < seats)
    .map((e) => {
      // A trait set back to its start is undefined, which JSON leaves out.
      const clips = JSON.stringify(e.clips ?? {}) === "{}" ? undefined : e.clips;
      return {
        seat: e.seat,
        room: e.room,
        clips,
        cards: some(e.cards),
      };
    })
    .filter((e) => e.room !== undefined || e.clips || e.cards);
  const haunt =
    scenario.haunt && scenario.haunt.revealer < seats ? scenario.haunt : undefined;
  const result: Scenario = {
    first: scenario.first !== undefined && scenario.first < seats ? scenario.first : undefined,
    decks: decks.omen || decks.item || decks.event ? decks : undefined,
    stack: some(scenario.stack),
    rooms: some(scenario.rooms),
    explorers: some(explorers),
    haunt,
  };
  return JSON.stringify(result) === "{}" ? undefined : result;
}
