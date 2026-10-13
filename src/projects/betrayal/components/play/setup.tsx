"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { builtHaunts, requireBuilt } from "../../engine/haunt";
import { ENGINE } from "../../game";
import type { InputKind } from "../../input/controls";
import { portraitOf } from "../../play/portraits";
import { takenBy } from "../../play/setup";
import { characterTracks } from "../../play/tracks";
import type { SharedGame } from "../../share";
import { ErrorBox } from "../error-box";
import { PAD_FOCUS } from "../prompts";
import { defaultSeats, MAX_SEATS, MIN_SEATS, today, type Seats } from "../start-form";
import { PadPicker } from "./pad-picker";
import { seatDot } from "./seat-colour";
import { useSetupPads } from "./setup-pads";
import { TrackRow } from "./trait-track";
import type { PadSeats } from "./use-pads";

/*
 * Setting up a hot-seat game, carried by the characters' portraits: resume
 * the game saved in this browser, or choose three to six seats, each with a
 * character (one per card) and a pad, and the haunt to play. A seat is its
 * character: its four traits show on it as the card prints them, so players
 * pick by them. Every input does all of it: a pad moves its focus round the
 * buttons (`setup-pads.ts`).
 */

const characters = Object.values(ENGINE.catalog.characters);
const nameOf = (character: string) => ENGINE.catalog.characters[character].name;
const tracksOf = (character: string) => characterTracks(ENGINE.catalog.characters[character]);

const DEFAULT_SEATS = 4;

// Served as shot: `tools/portraits.mjs` sizes and compresses them for the largest place they show, so the
// optimizer would only compress them a second time and blur the backdrop's dark gradient.
function Portrait({ character, className }: { character: string; className: string }) {
  return <Image src={portraitOf(character)} unoptimized alt={nameOf(character)} draggable={false} className={`rounded object-cover ${className}`} />;
}

/** A character's four traits, as their card prints them. */
function Traits({ character }: { character: string }) {
  return (
    <div aria-label={`${nameOf(character)}'s traits`} className="flex flex-col gap-1">
      {tracksOf(character).map((track) => (
        <TrackRow key={track.trait} track={track} skull={false} />
      ))}
    </div>
  );
}

const BUTTON = "min-h-11 rounded border border-(--bt-line) px-3 py-1 hover:border-(--bt-accent) disabled:opacity-40";

/** The game saved in this browser, or why it can't be resumed. */
export type SavedGame = { game: SharedGame; error: null } | { game: null; error: string | null };

export function Setup({
  error,
  readSaved,
  onOpen,
  pads,
  input,
  onInput,
}: {
  error: string | null;
  /** Read as setup opens: leaving a game comes back here with it saved. */
  readSaved: () => SavedGame;
  onOpen: (shared: SharedGame) => void;
  pads: PadSeats;
  /** The input last used on this device, which the prompts and the pad's focus follow. */
  input: InputKind;
  onInput: (kind: InputKind) => void;
}) {
  const [{ game: saved, error: savedError }] = useState(readSaved);
  const [seats, setSeats] = useState<Seats>(() => defaultSeats(characters, DEFAULT_SEATS));
  const [haunt, setHaunt] = useState<number | null>(null);
  const [choosing, setChoosing] = useState<number | null>(null);
  const ready = seats.every((seat) => seat.character !== "");
  const start = () => {
    if (!ready) return;
    onOpen({ game: { seed: crypto.randomUUID(), sets: ["base"], seats, today: today(), ...(haunt === null ? {} : { chosenHaunt: haunt }) }, actions: [] });
  };
  const root = useRef<HTMLDivElement>(null);
  useSetupPads(root, input, onInput);

  return (
    // Four seat cards side by side set the width on a desktop, two between, and a phone has one a row.
    <div ref={root} data-pad-layer="0" className={`mx-auto flex w-full max-w-[69rem] flex-col gap-4 ${input === "pad" ? PAD_FOCUS : ""}`}>
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
        <ul className="grid grid-cols-[minmax(0,20rem)] justify-center gap-3 sm:grid-cols-[repeat(2,16rem)] xl:grid-cols-[repeat(4,16rem)]">
          {seats.map((seat, index) => (
            <SeatCard
              key={index}
              index={index}
              seats={seats}
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
              setSeats([...seats, { character: free?.id ?? "" }]);
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
          <li key={i} title={nameOf(seat.character)}>
            <Portrait character={seat.character} className="h-16 w-13 border-2 border-(--bt-panel)" />
          </li>
        ))}
      </ul>
      <p className="min-w-0 flex-1 text-sm text-(--bt-muted)">
        {seats.map((seat) => nameOf(seat.character)).join(", ")}
        {chosenHaunt !== undefined && ` · haunt ${chosenHaunt}`}
      </p>
      <button type="button" onClick={onResume} className="min-h-11 rounded bg-(--bt-accent) px-6 py-1 font-semibold text-(--bt-bg)">
        Resume
      </button>
    </section>
  );
}

function SeatCard({ index, seats, onChoose, pads }: { index: number; seats: Seats; onChoose: () => void; pads: PadSeats }) {
  const { character } = seats[index];
  return (
    <li aria-label={`Seat ${index}`} className="flex min-w-0 flex-col gap-2 rounded border border-(--bt-line) bg-(--bt-bg) p-1.5 focus-within:border-(--bt-accent)">
      {/* The card is the portrait, with the character's name over its foot; the whole portrait opens the character picker. */}
      <button
        type="button"
        aria-label={`Seat ${index} character: ${nameOf(character)}`}
        onClick={onChoose}
        className="group relative block w-full cursor-pointer rounded outline-offset-2 hover:outline-2 hover:outline-(--bt-accent) focus-visible:outline-3 focus-visible:outline-(--bt-ink)"
      >
        <Portrait character={character} className="aspect-4/5 h-auto w-full transition-[filter] group-hover:brightness-110" />
        <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 rounded-b bg-linear-to-t from-(--bt-bg) via-(--bt-bg)/80 to-transparent p-2 pt-8 text-center text-sm font-semibold">
          <span aria-hidden className={`inline-block size-2.5 shrink-0 rounded-full ${seatDot(ENGINE, character)}`} />
          <span className="truncate">{nameOf(character)}</span>
        </span>
      </button>
      <Traits character={character} />
      {pads.connected.length > 0 && <PadPicker seat={index} name={nameOf(character)} pads={pads} />}
    </li>
  );
}

/** Every character, to pick one for a seat; those whose card another seat has are taken, and dimmed. The one in focus shows its traits. A small centred panel, as wide as six portraits at most. */
function CharacterGrid({ seat, seats, onPick, onClose }: { seat: number; seats: Seats; onPick: (character: string) => void; onClose: () => void }) {
  const [shown, setShown] = useState(seats[seat].character);
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
      <div className="flex max-h-full w-full max-w-[34rem] flex-col gap-3 overflow-y-auto rounded border border-(--bt-line) bg-(--bt-panel) p-3">
        <div className="flex items-start gap-3">
          <section aria-label="In focus" className="flex min-w-0 flex-1 flex-col gap-1.5">
            <h2 className="flex items-center gap-1.5 font-semibold">
              <span aria-hidden className={`inline-block size-2.5 shrink-0 rounded-full ${seatDot(ENGINE, shown)}`} />
              {nameOf(shown)}
            </h2>
            <Traits character={shown} />
          </section>
          <button
            type="button"
            // The grid opens to choose from: its close button takes the focus, so Escape or Enter closes it.
            autoFocus
            data-pad-back
            aria-label="Close"
            onClick={onClose}
            className={`${BUTTON} inline-flex items-center gap-1.5`}
          >
            ✕
          </button>
        </div>
        <ul className="grid grid-cols-4 gap-1 sm:grid-cols-6">
          {characters.map((character) => {
            const taken = takenBy(characters, seats, seat, character.id);
            const show = () => {
              setShown(character.id);
            };
            return (
              <li key={character.id}>
                <button
                  type="button"
                  disabled={taken !== null}
                  aria-pressed={seats[seat].character === character.id}
                  onFocus={show}
                  onPointerEnter={show}
                  onClick={() => {
                    onPick(character.id);
                  }}
                  className="flex w-full flex-col items-center gap-1 rounded border border-transparent p-1 text-xs hover:border-(--bt-accent) disabled:opacity-35 aria-pressed:border-(--bt-accent)"
                >
                  <Portrait character={character.id} className="aspect-4/5 h-auto w-full" />
                  {/* The portrait's glow carries the seat colour, which leaves the name the tile's whole width. */}
                  <span className="line-clamp-2 text-center leading-tight">{character.name}</span>
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
