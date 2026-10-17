"use client";

import { useSyncExternalStore } from "react";
import { getProjectStorage } from "@/shared/lib/storage";
import { NEW_LEDGER, parseLedger, settle, type EloLedger, type Outcome } from "./rating";

/*
 * This device's Risk Elo (`rating.ts`), kept in its own storage, as the profile is: a rating
 * belongs to whoever plays on the device, and no server holds it.
 */

const storage = getProjectStorage("risk");
const KEY = "elo";
const listeners = new Set<() => void>();
let held: EloLedger | null = null;

function ledger(): EloLedger {
  held ??= parseLedger(storage.get<unknown>(KEY));
  return held;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Another tab may have settled a game.
  const onStorage = () => {
    held = null;
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** The device's ledger, live; a newcomer's on the server render. */
export function useEloLedger(): EloLedger {
  return useSyncExternalStore(subscribe, ledger, () => NEW_LEDGER);
}

/** The device's Elo now, for a seat it is taking. */
export const currentElo = () => ledger().elo;

/** Scores a finished game on this device, once (`settle`). It reads the ledger afresh, so a game
 *  another tab has just scored isn't scored again. */
export function settleGame(gameId: string, elos: readonly number[], seat: number, outcome: Outcome): void {
  const before = parseLedger(storage.get<unknown>(KEY));
  const after = settle(before, gameId, elos, seat, outcome);
  if (after === before) return;
  // Storage can refuse a write (a private window, a full quota, blocked site data): the new
  // rating then holds for this visit only.
  try {
    storage.set(KEY, after);
  } catch (error) {
    console.warn("Risk couldn't save the Elo on this device", error);
  }
  held = after;
  for (const listener of listeners) listener();
}
