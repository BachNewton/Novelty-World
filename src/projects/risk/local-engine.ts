import type { GameEvent, GameState, RiskEngine } from "./contract";
import { STUB_SCENES } from "./stub/scenes";
import { stubEngine } from "./stub/stub-engine";

/** A hand-made position to jump to, for looking at a screen without playing to it. */
export interface Scene {
  id: string;
  name: string;
  start: () => { state: GameState; events: readonly GameEvent[] };
}

export interface LocalEngine {
  engine: RiskEngine;
  scenes: readonly Scene[];
}

/** The engine a local game plays on: the stub, until the real engine lands. Swapping it is this
 *  one line (the real engine brings no scenes: they are the stub's own positions). */
export const LOCAL: LocalEngine = { engine: stubEngine, scenes: STUB_SCENES };
