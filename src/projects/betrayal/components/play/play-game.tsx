"use client";

import { useState } from "react";
import { getProjectStorage } from "@/shared/lib/storage";
import { ENGINE } from "../../game";
import type { InputKind } from "../../input/controls";
import { createPlayStore, type PlayStore } from "../../play/store";
import { decodeGame, type SharedGame } from "../../share";
import { errorText } from "../pending-panel";
import { BETRAYAL_THEME } from "../theme";
import { PlayScreen } from "./play-screen";
import { Setup, type SavedGame } from "./setup";
import { usePads } from "./use-pads";
import { trimSeats } from "../../play/pads";

/*
 * The game, the page's default: set up a hot-seat game, or resume the one
 * saved in this browser, and play it. The game is saved as its share code
 * after every write, so closing the tab loses nothing. A linked game
 * (`?play=<code>`) opens straight on the play screen and is kept in memory
 * only, so reviewing one never overwrites the saved game. The input last
 * used is the device's, kept across setup and the game, so a player who set
 * up on a pad starts the game with the pad's focus and prompts showing.
 */

const storage = getProjectStorage("betrayal");
const SAVED = "hot-seat";

const save = (code: string) => {
  storage.set(SAVED, code);
};

/** The saved game, read back, or why it can't be. */
function savedGame(): SavedGame {
  const code = storage.get<string>(SAVED);
  if (code === null) return { game: null, error: null };
  try {
    return { game: decodeGame(code), error: null };
  } catch (error) {
    return { game: null, error: `The saved game can't be resumed: ${errorText(error)}` };
  }
}

const keepInMemory = () => undefined;

/** The linked game, opened, or why it can't be. */
function linkedGame(code: string | null): { store: PlayStore | null; error: string | null } {
  if (code === null) return { store: null, error: null };
  try {
    return { store: createPlayStore(ENGINE, decodeGame(code), keepInMemory), error: null };
  } catch (problem) {
    return { store: null, error: `The linked game can't be opened: ${errorText(problem)}` };
  }
}

export function PlayGame({ code }: { code: string | null }) {
  const [linked] = useState(() => linkedGame(code));
  const [store, setStore] = useState<PlayStore | null>(linked.store);
  const [error, setError] = useState<string | null>(linked.error);
  const pads = usePads();
  const [input, setInput] = useState<InputKind>("keyboard-mouse");

  const open = (shared: SharedGame) => {
    try {
      setStore(createPlayStore(ENGINE, shared, save));
      pads.set(trimSeats(pads.assignment, shared.game.seats.length));
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
          pads={pads}
          input={input}
          onInput={setInput}
          onLeave={() => {
            setStore(null);
          }}
        />
      ) : (
        <Setup error={error} readSaved={savedGame} onOpen={open} pads={pads} input={input} onInput={setInput} />
      )}
    </div>
  );
}
