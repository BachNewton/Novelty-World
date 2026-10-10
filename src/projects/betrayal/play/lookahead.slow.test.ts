import { describe, expect, it } from "vitest";
import type { TurnChoice } from "../engine/exploration";
import { placeOf } from "../engine/figures";
import { moveCost } from "../engine/questions";
import { apply, choices } from "../engine/step-loop";
import { ENGINE } from "../game";
import { simulate } from "../simulation";
import type { GameState, Place } from "../types";
import { lookahead, type Reach } from "./lookahead";

/*
 * The lookahead agrees with the engine, at every turn of whole seeded games,
 * before the haunt and in haunt 13 (monster turns included): every route it
 * offers is walked by the engine to where it says, spending what it says;
 * every step the turn offers is among its routes; nothing a route reaches
 * with movement to spare leads anywhere it missed or priced too high; and
 * what it finds is the same whatever the dice would say.
 */

const key = (place: Place) => `${place.room}|${place.side ?? ""}`;

function walk(state: GameState, reach: Reach): GameState[] {
  const states = [state];
  for (const action of reach.actions) {
    const now = states[states.length - 1];
    expect(action.kind === "choose" && now.pending?.type === "decision" && now.pending.id === action.decision).toBe(true);
    const result = apply(ENGINE, now, action);
    if (!result.ok) throw new Error(`A route's step was refused: ${result.reason}`);
    states.push(result.state);
  }
  return states;
}

const strip = (reaches: readonly Reach[]) => reaches.map(({ actions, ...rest }) => ({ ...rest, actions: actions.length }));

function check(state: GameState, timings: number[]): boolean {
  const pending = state.pending;
  if (pending?.type !== "decision" || pending.kind !== "turn" || state.turn?.acting == null) return false;
  const seat = pending.seats[0];
  const figure = state.turn.acting;
  const started = performance.now();
  const found = lookahead(ENGINE, state, seat);
  timings.push(performance.now() - started);
  if (!found) throw new Error("A turn with a figure acting wasn't looked ahead");
  const best = new Map(found.reaches.flatMap((r) => (r.end.kind === "move" ? [[key(r.end.place), r.spaces] as const] : [])));
  const from = placeOf(state, figure);
  const cost = moveCost(ENGINE, state, figure);

  // Every step the turn offers is among the routes, at no more than it costs.
  for (const { choice } of choices(ENGINE, state, seat)) {
    const turn = choice as TurnChoice;
    if (turn.act === "move" && key({ room: turn.to, side: turn.side }) !== key(from)) expect(best.get(key({ room: turn.to, side: turn.side }))).toBeLessThanOrEqual(cost);
    if (turn.act === "discover") expect(found.reaches.some((r) => r.end.kind === "discover" && r.actions.length === 1 && r.end.direction === turn.direction)).toBe(true);
  }

  for (const reach of found.reaches) {
    const states = walk(state, reach);
    // Every step but the last only moves: the same figure still has the turn.
    for (const between of states.slice(1, -1)) expect(between.pending?.type === "decision" && between.pending.kind === "turn" && between.pending.about === figure).toBe(true);
    if (reach.end.kind !== "move") continue;
    const last = states[states.length - 1];
    const plain = last.pending?.type === "decision" && last.pending.kind === "turn" && last.pending.about === figure && !last.lastEvents.some((e) => e.type === "rolled" || e.type === "card-drawn");
    const there = key(placeOf(last, figure)) === key(reach.end.place);
    expect(reach.stops).toBe(!(plain && there));
    // A route the engine ends anywhere but its room says why.
    if (!there) expect(reach.warnings.length).toBeGreaterThan(0);
    if (reach.stops) continue;
    expect((last.turn?.moved[figure] ?? 0) - (state.turn.moved[figure] ?? 0)).toBe(reach.spaces);
    // Nowhere one more step leads is missing, or dearer than this route and the step.
    if (reach.spaces >= found.left || last.turn?.movementEnded.includes(figure)) continue;
    const step = moveCost(ENGINE, last, figure);
    for (const { choice } of choices(ENGINE, last, seat)) {
      const turn = choice as TurnChoice;
      const to = { room: turn.act === "move" ? turn.to : "", side: turn.act === "move" ? turn.side : null };
      if (turn.act !== "move" || key(to) === key(from) || reach.spaces + step > found.left) continue;
      expect(best.get(key(to)), `${key(to)} from ${key(reach.end.place)}`).toBeLessThanOrEqual(reach.spaces + step);
    }
  }

  // What it finds is the dice's to change in nothing.
  expect(strip(lookahead(ENGINE, { ...state, seed: `${state.seed}/other` }, seat)?.reaches ?? [])).toEqual(strip(found.reaches));
  return true;
}

describe("the lookahead agrees with the engine", () => {
  it.each([
    ["lookahead-1", undefined],
    ["lookahead-2", undefined],
    ["lookahead-3", undefined],
    ["lookahead-haunt-1", 13],
    ["lookahead-haunt-2", 13],
  ] as const)("at every turn of a whole game (%s)", (seed, haunt) => {
    const timings: number[] = [];
    let checked = 0;
    simulate(seed, ENGINE, (state) => {
      if (check(state, timings)) checked++;
    }, haunt === undefined ? {} : { haunt });
    expect(checked).toBeGreaterThan(10);
    timings.sort((a, b) => a - b);
    console.log(`${seed}: ${checked} turns looked ahead; median ${timings[Math.floor(timings.length / 2)].toFixed(1)} ms, slowest ${timings[timings.length - 1].toFixed(1)} ms`);
  }, 600_000);
});
