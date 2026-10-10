import { describe, expect, it } from "vitest";
import { ENGINE } from "../game";
import { placed } from "../engine/board";
import { apply } from "../engine/step-loop";
import { viewFor } from "../engine/view";
import { simulate } from "../simulation";
import { choose, offered, testGame, waitingOn } from "../testing";
import type { GameState } from "../types";
import { boardFocus, NO_CHOICES, NO_FOCUS, playChoices } from "./choices";
import { lookahead } from "./lookahead";
import { due } from "./seat";

const choicesOf = (state: GameState) => playChoices(viewFor(ENGINE, state, waitingOn(state)));
const focusOf = (state: GameState) => boardFocus(viewFor(ENGINE, state, waitingOn(state)));

describe("playChoices", () => {
  it("puts the moves and doorways of a turn in the house, and ending it apart", () => {
    const state = testGame();
    const { targets, panel, end } = choicesOf(state);
    expect(targets.map((t) => t.id).sort()).toEqual(["doorway:entrance-hall:bottom", "doorway:entrance-hall:top", "room:foyer"]);
    // A choice's id, never a room's.
    expect(targets.some((t) => t.id === t.room)).toBe(false);
    expect(panel).toEqual([]);
    expect(end?.label).toBe("End your turn");
  });

  it("offers a move to another floor as its room, by its route up the stairs", () => {
    // The Grand Staircase leads straight up to the Upper Landing.
    const state = testGame({ explorers: [{ seat: 0, room: "grand-staircase" }] });
    const upstairs = choicesOf(state).targets.find((t) => t.id === "room:upper-landing");
    expect(upstairs).toMatchObject({ kind: "room", room: "upper-landing", side: null, preview: null });
    expect(upstairs?.actions).toHaveLength(1);
  });

  it("with the turn looked ahead, offers every place the move can reach, each with its route and the actions walking it", () => {
    const state = testGame();
    const view = viewFor(ENGINE, state, 0);
    const { targets } = playChoices(view, lookahead(ENGINE, state, 0));
    const landing = targets.find((t) => t.id === "room:upper-landing");
    expect(landing?.preview?.route.map((place) => place.room)).toEqual(["entrance-hall", "foyer", "grand-staircase", "upper-landing"]);
    expect(landing?.actions).toHaveLength(3);
    expect(landing?.preview).toMatchObject({ target: "room:upper-landing", spaces: 3, left: 4 });
    // A doorway further on is a target too, reached by its route and then explored.
    const far = targets.find((t) => t.id === "doorway:upper-landing:top");
    expect(far?.actions).toHaveLength(4);
    // Every target is one choice: no two share an id.
    expect(new Set(targets.map((t) => t.id)).size).toBe(targets.length);
  });

  it("puts a discovered room's ways round on its ghost, on the cell through the doorway, and nothing in the panel", () => {
    const state = choose(testGame({ stack: ["game-room"] }), "Explore");
    expect(state.pending?.type === "decision" && state.pending.kind).toBe("rotation");
    const { targets, panel, end, ghost } = choicesOf(state);
    expect([targets, panel, end]).toEqual([[], [], null]);
    expect(ghost?.tile).toBe("game-room");
    expect(ghost?.stay).toBeNull();
    expect(ghost?.cells).toHaveLength(1);
    expect(ghost?.cells[0].options.map((option) => option.label)).toEqual(offered(state).map((c) => c.label));
    // The cell beyond the explored doorway, which the room then goes on.
    const placedAt = (rotation: number) => {
      const option = ghost?.cells[0].options.find((candidate) => candidate.rotation === rotation);
      if (!option) throw new Error(`No way round ${rotation}`);
      const result = apply(ENGINE, state, option.action);
      if (!result.ok) throw new Error(result.reason);
      return placed(result.state.board, "game-room");
    };
    for (const option of ghost?.cells[0].options ?? []) expect(placedAt(option.rotation)).toMatchObject({ ...ghost?.cells[0].spot, rotation: option.rotation });
  });

  it("offers no ghost for a room that fits only one way: the engine places it, and says so", () => {
    // The Creaky Hallway fits through the Entrance Hall's north door one way only.
    const state = choose(testGame({ stack: ["creaky-hallway"] }), "Explore through the north door");
    expect(state.pending?.type === "decision" && state.pending.kind).toBe("turn");
    expect(state.lastEvents.map((event) => event.type)).toContain("forced");
    expect(placed(state.board, "creaky-hallway")).toBeDefined();
    expect(choicesOf(state).ghost).toBeNull();
  });

  it("puts a decision that isn't about a place in the panel", () => {
    // Something Hidden asks whether to roll: a question, not a place.
    const state = choose(testGame({ stack: ["game-room"], decks: { event: ["something-hidden"] } }), "Explore");
    const placedState = choose(state, "Place the Game Room");
    expect(placedState.pending?.type === "decision" && placedState.pending.kind).toBe("choose-one");
    const { targets, panel, end, ghost } = choicesOf(placedState);
    expect([targets, end, ghost]).toEqual([[], null, null]);
    expect(panel.map((c) => c.label)).toEqual(offered(placedState).map((c) => c.label));
  });

  it("offers nothing to a seat the decision isn't put to", () => {
    expect(playChoices(viewFor(ENGINE, testGame(), 1))).toEqual(NO_CHOICES);
  });

  // A whole game's every write, each listed choice applied: seconds of work when the suite runs in parallel.
  it.each(["choices-1", "choices-2", "choices-3"])("splits every decision of a whole game, each listed choice once, and the engine accepts every one (%s)", (seed) => {
    let checked = 0;
    simulate(seed, ENGINE, (state) => {
      if (state.pending?.type !== "decision") return;
      const seat = due(viewFor(ENGINE, state, null));
      if (seat === null) throw new Error("A decision is pending but no seat is due");
      const view = viewFor(ENGINE, state, seat);
      const { targets, panel, end, ghost } = playChoices(view);
      const placings = ghost ? [...ghost.cells.flatMap((cell) => cell.options.map((option, i) => ({ ...option, id: `ghost:${cell.spot.floor}:${cell.spot.x}:${cell.spot.y}:${i}` }))), ...(ghost.stay ? [ghost.stay] : [])] : [];
      const all = [...targets, ...panel, ...(end ? [end] : []), ...placings];
      const listed = view.pending?.type === "decision" ? (view.pending.detail?.choices ?? []) : [];
      const actionOf = (c: (typeof all)[number]) => ("actions" in c ? c.actions[0] : c.action);
      for (const target of targets) expect(target.actions).toHaveLength(1);
      expect(all.map((c) => actionOf(c).kind === "choose" && JSON.stringify((actionOf(c) as { choice: unknown }).choice)).sort()).toEqual(listed.map((c) => JSON.stringify(c.choice)).sort());
      expect(new Set(all.map((c) => c.id)).size).toBe(all.length);
      for (const choice of all) {
        const result = apply(ENGINE, state, actionOf(choice));
        if (!result.ok) throw new Error(`${choice.id} (${choice.label}) was rejected: ${result.reason}`);
      }
      for (const target of targets) if (target.kind === "room") expect(placed(state.board, target.room)).toBeDefined();
      checked++;
    });
    expect(checked).toBeGreaterThan(20);
  }, 30_000);
});

describe("boardFocus", () => {
  it("highlights the rooms a turn can move to and the doorways it can explore", () => {
    const state = testGame();
    const focus = focusOf(state);
    const moves = offered(state).filter((c) => c.label.startsWith("Move to"));
    expect(focus.rooms.size).toBe(moves.length);
    const [room, action] = [...focus.rooms][0];
    if (!action) throw new Error(`No single action for ${room}`);
    expect(apply(ENGINE, state, action).ok).toBe(true);
    expect(focus.doorways.length).toBe(offered(state).filter((c) => c.label.startsWith("Explore")).length);
  });

  it("highlights nothing for a seat the decision isn't put to", () => {
    const state = testGame();
    expect(boardFocus(viewFor(ENGINE, state, 1))).toEqual(NO_FOCUS);
  });

  it("shows where a discovered room goes", () => {
    // Three doors, so it can face more than one way and the engine asks.
    const state = choose(testGame({ stack: ["game-room"] }), "Explore");
    expect(state.pending?.type === "decision" && state.pending.kind).toBe("rotation");
    const focus = focusOf(state);
    expect(focus.cells).toHaveLength(1);
    expect(focus.cells[0].tile).toBe("game-room");
  });
});
