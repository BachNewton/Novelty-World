"use client";

import { useState } from "react";
import { getProjectStorage } from "@/shared/lib/storage";
import { ENGINE } from "../../game";
import { createPlayStore, type PlayStore } from "../../play/store";
import { decodeGame, type SharedGame } from "../../share";
import { ErrorBox } from "../error-box";
import { errorText } from "../pending-panel";
import { defaultSeats, MIN_SEATS, SeatPickers, today, type Seats } from "../start-form";
import { BETRAYAL_THEME } from "../theme";
import { PlayScreen } from "./play-screen";

/*
 * The game, the page's default: set up a hot-seat game, or resume the one
 * saved in this browser, and play it. The game is saved as its share code
 * after every write, so closing the tab loses nothing.
 */

const storage = getProjectStorage("betrayal");
const SAVED = "hot-seat";

const save = (code: string) => {
  storage.set(SAVED, code);
};

/** The saved game, read back, or why it can't be. */
function savedGame(): { game: SharedGame; error: null } | { game: null; error: string | null } {
  const code = storage.get<string>(SAVED);
  if (code === null) return { game: null, error: null };
  try {
    return { game: decodeGame(code), error: null };
  } catch (error) {
    return { game: null, error: `The saved game can't be resumed: ${errorText(error)}` };
  }
}

export function PlayGame() {
  const [store, setStore] = useState<PlayStore | null>(null);
  const [error, setError] = useState<string | null>(null);

  const open = (shared: SharedGame) => {
    try {
      setStore(createPlayStore(ENGINE, shared, save));
      setError(null);
    } catch (problem) {
      setError(errorText(problem));
    }
  };

  return (
    <div style={BETRAYAL_THEME} className="min-h-screen bg-(--bt-bg) p-4 text-(--bt-ink)">
      {store ? (
        <PlayScreen
          store={store}
          onLeave={() => {
            setStore(null);
          }}
        />
      ) : (
        <Setup error={error} onOpen={open} />
      )}
    </div>
  );
}

function Setup({ error, onOpen }: { error: string | null; onOpen: (shared: SharedGame) => void }) {
  const characters = Object.values(ENGINE.catalog.characters);
  const [seats, setSeats] = useState<Seats>(() => defaultSeats(characters, MIN_SEATS));
  const [saved] = useState(savedGame);
  const game = saved.game;
  const ready = seats.every((seat) => seat.name.trim() !== "" && seat.character !== "");

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <h1 className="text-2xl font-bold">Betrayal at House on the Hill</h1>
      {game && (
        <section className="flex flex-col gap-2 rounded border border-(--bt-line) bg-(--bt-panel) p-4">
          <h2 className="text-lg font-semibold">Your game in this browser</h2>
          <p className="text-sm text-(--bt-muted)">
            {game.game.seats.map((seat) => seat.name).join(", ")} · {game.actions.length} moves made
          </p>
          <button
            type="button"
            className="min-h-11 self-start rounded bg-(--bt-accent) px-4 py-1 font-semibold text-(--bt-bg)"
            onClick={() => {
              onOpen(game);
            }}
          >
            Resume
          </button>
        </section>
      )}
      {saved.error !== null && <ErrorBox message={saved.error} />}
      <form
        className="flex flex-col gap-3 rounded border border-(--bt-line) bg-(--bt-panel) p-4"
        onSubmit={(e) => {
          e.preventDefault();
          onOpen({ game: { seed: crypto.randomUUID(), sets: ["base"], seats, today: today() }, actions: [] });
        }}
      >
        <h2 className="text-lg font-semibold">New game</h2>
        <p className="text-sm text-(--bt-muted)">
          One device, passed round the table: each player takes their turn on it, and looks away from what isn&apos;t theirs.
          {game && " Starting a new game replaces the saved one."}
        </p>
        <SeatPickers characters={characters} seats={seats} onChange={setSeats} />
        <button
          type="submit"
          disabled={!ready}
          className="min-h-11 self-end rounded bg-(--bt-accent) px-4 py-1 font-semibold text-(--bt-bg) disabled:opacity-40"
        >
          Start
        </button>
        {error !== null && <ErrorBox message={error} />}
      </form>
    </div>
  );
}
