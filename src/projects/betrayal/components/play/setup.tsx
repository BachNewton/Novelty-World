"use client";

import Image from "next/image";
import { useRef, useState, type CSSProperties } from "react";
import { builtHaunts, requireBuilt } from "../../engine/haunt";
import { ENGINE } from "../../game";
import { cycleCharacter, portraitSrc, takenBy } from "../../play/setup";
import type { SharedGame } from "../../share";
import { ErrorBox } from "../error-box";
import { FOCUS_A_MASK, PAD_FOCUS } from "../prompts";
import { defaultSeats, MAX_SEATS, MIN_SEATS, today, type Seats } from "../start-form";
import { PadPicker } from "./pad-picker";
import { seatDot } from "./seat-colour";
import { useSetupPads } from "./setup-pads";
import type { PadSeats } from "./use-pads";

/*
 * Setting up a hot-seat game, carried by the characters' portraits: resume
 * the game saved in this browser, or choose three to six seats, each with a
 * character (one per card) and a pad, and the haunt to play. Every input
 * does all of it: a pad moves its focus round the buttons (`setup-pads.ts`).
 */

const characters = Object.values(ENGINE.catalog.characters);
const nameOf = (character: string) => ENGINE.catalog.characters[character].name;

/** A portrait's size in CSS pixels, as `tools/portraits.mjs` shoots it. */
const PORTRAIT = { width: 192, height: 240 };

function Portrait({ character, className }: { character: string; className: string }) {
  return <Image src={portraitSrc(character)} width={PORTRAIT.width} height={PORTRAIT.height} alt={nameOf(character)} draggable={false} className={`rounded object-cover ${className}`} />;
}

const BUTTON = "min-h-11 rounded border border-(--bt-line) px-3 py-1 hover:border-(--bt-accent) disabled:opacity-40";

/** The game saved in this browser, or why it can't be resumed. */
export type SavedGame = { game: SharedGame; error: null } | { game: null; error: string | null };

export function Setup({
  error,
  readSaved,
  onOpen,
  pads,
}: {
  error: string | null;
  /** Read as setup opens: leaving a game comes back here with it saved. */
  readSaved: () => SavedGame;
  onOpen: (shared: SharedGame) => void;
  pads: PadSeats;
}) {
  const [{ game: saved, error: savedError }] = useState(readSaved);
  const [seats, setSeats] = useState<Seats>(() => defaultSeats(characters, MIN_SEATS));
  const [haunt, setHaunt] = useState<number | null>(null);
  const [choosing, setChoosing] = useState<number | null>(null);
  const ready = seats.every((seat) => seat.name.trim() !== "" && seat.character !== "");
  const start = () => {
    if (!ready) return;
    onOpen({ game: { seed: crypto.randomUUID(), sets: ["base"], seats, today: today(), ...(haunt === null ? {} : { chosenHaunt: haunt }) }, actions: [] });
  };
  const cycle = (seat: number, step: 1 | -1) => {
    setSeats((now) => cycleCharacter(characters, now, seat, step));
  };
  const root = useRef<HTMLDivElement>(null);
  const padActive = useSetupPads(root);

  return (
    <div ref={root} data-pad-layer="0" style={{ "--bt-focus-a": FOCUS_A_MASK } as CSSProperties} className={`mx-auto flex max-w-3xl flex-col gap-4 ${padActive ? PAD_FOCUS : ""}`}>
      <h1 className="text-2xl font-bold">Betrayal at House on the Hill</h1>
      {saved && <Resume saved={saved} onResume={() => onOpen(saved)} />}
      {savedError !== null && <ErrorBox message={savedError} />}
      <form
        aria-label="New game"
        className="flex flex-col gap-3 rounded border border-(--bt-line) bg-(--bt-panel) p-3 sm:p-4"
        onSubmit={(e) => {
          e.preventDefault();
          start();
        }}
      >
        <h2 className="text-lg font-semibold">New game</h2>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {seats.map((seat, index) => (
            <SeatCard
              key={index}
              index={index}
              seats={seats}
              onName={(name) => {
                setSeats(seats.map((s, i) => (i === index ? { ...s, name } : s)));
              }}
              onCycle={(step) => {
                cycle(index, step);
              }}
              onChoose={() => {
                setChoosing(index);
              }}
              pads={pads}
            />
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={BUTTON}
            disabled={seats.length >= MAX_SEATS}
            onClick={() => {
              const free = characters.find((c) => takenBy(characters, seats, seats.length, c.id) === null);
              setSeats([...seats, { name: `Player ${seats.length + 1}`, character: free?.id ?? "" }]);
            }}
          >
            + Seat
          </button>
          <button
            type="button"
            className={BUTTON}
            disabled={seats.length <= MIN_SEATS}
            onClick={() => {
              setSeats(seats.slice(0, -1));
            }}
          >
            − Seat
          </button>
        </div>
        <HauntChoice haunt={haunt} onChange={setHaunt} />
        <button type="submit" disabled={!ready} className="min-h-11 self-end rounded bg-(--bt-accent) px-6 py-1 font-semibold text-(--bt-bg) disabled:opacity-40">
          Start
        </button>
        {error !== null && <ErrorBox message={error} />}
      </form>
      {choosing !== null && (
        <CharacterGrid
          seat={choosing}
          seats={seats}
          onPick={(character) => {
            setSeats(seats.map((s, i) => (i === choosing ? { ...s, character } : s)));
            setChoosing(null);
          }}
          onClose={() => {
            setChoosing(null);
          }}
        />
      )}
    </div>
  );
}

function Resume({ saved, onResume }: { saved: SharedGame; onResume: () => void }) {
  const { seats, chosenHaunt } = saved.game;
  return (
    <section aria-label="Your game in this browser" className="flex flex-wrap items-center gap-3 rounded border border-(--bt-accent) bg-(--bt-panel) p-3">
      <ul className="flex -space-x-3">
        {seats.map((seat, i) => (
          <li key={i} title={`${seat.name} (${nameOf(seat.character)})`}>
            <Portrait character={seat.character} className="h-16 w-13 border-2 border-(--bt-panel)" />
          </li>
        ))}
      </ul>
      <p className="min-w-0 flex-1 text-sm text-(--bt-muted)">
        {seats.map((seat) => seat.name).join(", ")}
        {chosenHaunt !== undefined && ` · haunt ${chosenHaunt}`}
      </p>
      <button type="button" onClick={onResume} className="min-h-11 rounded bg-(--bt-accent) px-6 py-1 font-semibold text-(--bt-bg)">
        Resume
      </button>
    </section>
  );
}

function SeatCard({
  index,
  seats,
  onName,
  onCycle,
  onChoose,
  pads,
}: {
  index: number;
  seats: Seats;
  onName: (name: string) => void;
  onCycle: (step: 1 | -1) => void;
  onChoose: () => void;
  pads: PadSeats;
}) {
  const seat = seats[index];
  const arrow = "min-h-11 min-w-9 rounded border border-(--bt-line) bg-(--bt-bg) text-lg hover:border-(--bt-accent)";
  return (
    <li aria-label={`Seat ${index}`} className="flex min-w-0 flex-col gap-1.5 rounded border border-(--bt-line) bg-(--bt-bg) p-2 focus-within:border-(--bt-accent)">
      <button type="button" aria-label={`Seat ${index} character: ${nameOf(seat.character)}`} onClick={onChoose} className="self-center">
        <Portrait character={seat.character} className="h-36 w-29 sm:h-40 sm:w-32" />
      </button>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label={`Seat ${index}: previous character`}
          className={arrow}
          onClick={() => {
            onCycle(-1);
          }}
        >
          ‹
        </button>
        <span className="flex min-w-0 flex-1 items-center justify-center gap-1.5 text-center text-xs font-semibold">
          <span aria-hidden className={`inline-block size-2.5 shrink-0 rounded-full ${seatDot(ENGINE, seat.character)}`} />
          <span className="truncate">{nameOf(seat.character)}</span>
        </span>
        <button
          type="button"
          aria-label={`Seat ${index}: next character`}
          className={arrow}
          onClick={() => {
            onCycle(1);
          }}
        >
          ›
        </button>
      </div>
      <input
        aria-label={`Seat ${index} name`}
        value={seat.name}
        onChange={(e) => {
          onName(e.target.value);
        }}
        className="min-h-9 min-w-0 rounded border border-(--bt-line) bg-(--bt-panel) px-2 text-sm"
      />
      {pads.connected.length > 0 && <PadPicker seat={index} name={seat.name} pads={pads} />}
    </li>
  );
}

/** Every character, to pick one for a seat; those whose card another seat has are taken. */
function CharacterGrid({ seat, seats, onPick, onClose }: { seat: number; seats: Seats; onPick: (character: string) => void; onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Seat ${seat}'s character`}
      data-pad-layer="2"
      className="fixed inset-0 z-20 flex items-center justify-center bg-(--bt-bg)/85 p-3"
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div className="flex max-h-full w-full max-w-3xl flex-col gap-2 rounded border border-(--bt-line) bg-(--bt-panel) p-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">{seats[seat].name}</h2>
          <button
            type="button"
            // The grid opens to choose from: its close button takes the focus, so Escape or Enter closes it.
            autoFocus
            data-pad-back
            onClick={onClose}
            className={BUTTON}
          >
            ✕
          </button>
        </div>
        <ul className="grid grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4 md:grid-cols-6">
          {characters.map((character) => {
            const taken = takenBy(characters, seats, seat, character.id);
            return (
              <li key={character.id}>
                <button
                  type="button"
                  disabled={taken !== null}
                  aria-pressed={seats[seat].character === character.id}
                  onClick={() => {
                    onPick(character.id);
                  }}
                  className="flex w-full flex-col items-center gap-1 rounded border border-transparent p-1 text-xs hover:border-(--bt-accent) disabled:opacity-35 aria-pressed:border-(--bt-accent)"
                >
                  <Portrait character={character.id} className="aspect-4/5 h-auto w-full" />
                  <span className="flex items-center gap-1">
                    <span aria-hidden className={`inline-block size-2 shrink-0 rounded-full ${seatDot(ENGINE, character.id)}`} />
                    {character.name}
                  </span>
                  {taken !== null && <span className="text-(--bt-muted)">{seats[taken].name}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/** The haunt: the rules' (the chart's, at the haunt roll), or one that is built. */
function HauntChoice({ haunt, onChange }: { haunt: number | null; onChange: (haunt: number | null) => void }) {
  const options: { value: number | null; label: string }[] = [
    { value: null, label: "By the rules" },
    ...builtHaunts(ENGINE).map((number) => ({ value: number, label: `${number} · ${requireBuilt(ENGINE, number).name}` })),
  ];
  return (
    <fieldset className="flex flex-wrap items-center gap-2">
      <legend className="mb-1 text-sm font-semibold">Haunt</legend>
      {options.map(({ value, label }) => (
        <button
          key={label}
          type="button"
          aria-pressed={haunt === value}
          onClick={() => {
            onChange(value);
          }}
          className="min-h-11 rounded border border-(--bt-line) bg-(--bt-bg) px-3 py-1 text-sm aria-pressed:border-(--bt-accent) aria-pressed:bg-(--bt-room) aria-pressed:font-semibold"
        >
          {label}
        </button>
      ))}
    </fieldset>
  );
}
