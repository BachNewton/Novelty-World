import { describe, expect, it } from "vitest";
import { ENGINE } from "../game";
import { decodeGame, type SharedGame } from "../share";
import { DEFAULT_CHARACTERS } from "../testing";
import type { Action } from "../types";
import { playChoices } from "./choices";
import { createPlayStore } from "./store";

const GAME: SharedGame = {
  game: {
    seed: "store",
    sets: ["base"],
    seats: DEFAULT_CHARACTERS.map((character, i) => ({ name: `Player ${i + 1}`, character })),
    today: ENGINE.catalog.characters[DEFAULT_CHARACTERS[0]].birthday,
  },
  actions: [],
};

/** The store's sends answer on a later microtask; this waits for the code saved by the write. */
function saves() {
  const codes: string[] = [];
  let resolve = (_code: string) => undefined as void;
  return {
    codes,
    save: (code: string) => {
      codes.push(code);
      resolve(code);
    },
    next: () =>
      new Promise<string>((done) => {
        resolve = done;
      }),
  };
}

describe("the play store", () => {
  it("shows an action at once, saves the game once it is written, and passes the device to whoever is due", async () => {
    const saved = saves();
    const store = createPlayStore(ENGINE, GAME, saved.save);
    const first = store.snapshot();
    expect(first.holder).toBe(0);
    expect(first.view.viewer).toBe(0);
    const end = playChoices(first.view).end;
    if (!end) throw new Error("The first turn can't be ended");
    const written = saved.next();
    store.act(end.action);
    // Shown before the write is confirmed: the device has passed to the next seat.
    expect(store.snapshot().holder).toBe(1);
    expect(store.snapshot().view.viewer).toBe(1);
    expect(decodeGame(await written).actions).toEqual([end.action]);
    expect(store.snapshot().client.queue).toEqual([]);
  });

  it("resumes a saved game where it was", async () => {
    const saved = saves();
    const store = createPlayStore(ENGINE, GAME, saved.save);
    const end = playChoices(store.snapshot().view).end?.action as Action;
    const written = saved.next();
    store.act(end);
    const resumed = createPlayStore(ENGINE, decodeGame(await written), () => undefined);
    expect(resumed.snapshot().holder).toBe(1);
    expect(resumed.snapshot().client.confirmed?.version).toBe(1);
  });
});
