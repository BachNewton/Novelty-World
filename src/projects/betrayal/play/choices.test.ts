import { describe, expect, it } from "vitest";
import { ENGINE } from "../game";
import { placed } from "../engine/board";
import { relocate } from "../engine/effects";
import { apply, start } from "../engine/step-loop";
import { viewFor } from "../engine/view";
import { traitValue } from "../engine/questions";
import { choose, explorer, inHaunt, offered, put, testGame, waitingOn } from "../testing";
import type { GameState } from "../types";
import type { Layout } from "../engine/board";
import type { Edge } from "../types";
import { boardFocus, explorations, NO_CHOICES, NO_FOCUS, playChoices } from "./choices";
import { lookahead, type Reach } from "./lookahead";
import { chanceAtLeast } from "./preview";

const choicesOf = (state: GameState) => playChoices(viewFor(ENGINE, state, waitingOn(state)));
const focusOf = (state: GameState) => boardFocus(viewFor(ENGINE, state, waitingOn(state)));

describe("playChoices", () => {
  it("puts the moves and the cells to explore of a turn in the house, and ending it apart", () => {
    const state = testGame();
    const { targets, panel, end } = choicesOf(state);
    // The Entrance Hall stands at (2, 0): its unexplored doorways open north and south.
    expect(targets.map((t) => t.id).sort()).toEqual(["explore:ground:2:-1", "explore:ground:2:1", "room:foyer"]);
    expect(targets.find((t) => t.id === "explore:ground:2:-1")).toMatchObject({ kind: "explore", cell: { floor: "ground", x: 2, y: -1 }, room: "entrance-hall", direction: "top" });
    // A choice's id, never a room's.
    expect(targets.some((t) => "room" in t && t.id === t.room)).toBe(false);
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
    // A cell further on is a target too, reached by its route and then explored.
    const far = targets.find((t) => t.id === "explore:upper:0:-1");
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

  it("offers the rooms a choice's options name as places in the house, each answering its option", () => {
    const state = choose(testGame({ explorers: [{ seat: 0, cards: ["dog"] }] }), "Send the Dog");
    expect(state.pending?.type === "decision" && state.pending.kind).toBe("choose-one");
    const { targets, panel, end, ghost } = choicesOf(state);
    expect([panel, end, ghost]).toEqual([[], null, null]);
    expect(targets.map((t) => [t.kind, t.kind === "room" && t.room, t.label])).toEqual([
      ["room", "foyer", "Send the Dog to the Foyer"],
      ["room", "grand-staircase", "Send the Dog to the Grand Staircase"],
      ["room", "upper-landing", "Send the Dog to the Upper Landing"],
    ]);
    const foyer = targets[0];
    const result = apply(ENGINE, state, foyer.actions[0]);
    if (!result.ok) throw new Error(result.reason);
    expect(result.state.lastEvents.some((event) => event.type === "dog-ran" && (event.data as { room: string }).room === "foyer")).toBe(true);
    expect(focusOf(state).rooms.get("foyer")).toEqual(foyer.actions[0]);
  });

  it("offers the walls and corners a Wall Switch can go on as places in its room, named by the compass, and nothing in the panel", () => {
    // Zoe explores north into the Ballroom and draws the Revolving Wall: the Ballroom has a door on every wall, so only its corners.
    const state = choose(testGame({ stack: ["ballroom", "dusty-hallway"], decks: { event: ["revolving-wall"] } }), "Explore through the north door");
    expect(state.pending?.type === "decision" && state.pending.kind).toBe("choose-one");
    const { targets, panel, end, ghost } = choicesOf(state);
    expect([panel, end, ghost]).toEqual([[], null, null]);
    expect(targets.map((t) => (t.kind === "wall" ? [t.label, t.room, t.wall, t.token] : t.kind)).sort()).toEqual([
      ["North-east corner", "ballroom", ["top", "right"], "wall-switch"],
      ["North-west corner", "ballroom", ["left", "top"], "wall-switch"],
      ["South-east corner", "ballroom", ["right", "bottom"], "wall-switch"],
      ["South-west corner", "ballroom", ["bottom", "left"], "wall-switch"],
    ]);
    // Choosing the south-west corner, onto the Foyer, puts the switch there and Zoe through it.
    const corner = targets.find((t) => t.label === "South-west corner");
    if (!corner) throw new Error("No south-west corner");
    const result = apply(ENGINE, state, corner.actions[0]);
    if (!result.ok) throw new Error(result.reason);
    expect(result.state.tokens).toContainEqual({ token: "wall-switch", room: "ballroom", wall: ["bottom", "left"] });
  });

  it("offers the Wall Switch as the room beyond it, with its roll and its odds, and not in the panel", () => {
    // Zoe puts the switch on the Ballroom's south-west corner and goes through to the Foyer; Ox walks into the Foyer after her.
    const placedSwitch = choose(choose(testGame({ stack: ["ballroom", "dusty-hallway"], decks: { event: ["revolving-wall"] } }), "Explore through the north door"), "south-west corner");
    const state = choose(choose(placedSwitch, "End your turn"), "Move to the Foyer");
    const { targets, panel } = choicesOf(state);
    expect(panel.map((choice) => choice.label)).not.toContain("Use the Wall Switch (Knowledge roll)");
    const through = targets.filter((t) => t.kind === "through");
    const ox = explorer(state, 1).id;
    const dice = traitValue(ENGINE, state, ox, "knowledge");
    expect(through).toEqual([
      expect.objectContaining({
        kind: "through",
        room: "ballroom",
        figure: ox,
        from: "foyer",
        label: "Wall Switch: Knowledge roll 3+",
        through: { token: "wall-switch", room: "ballroom", wall: ["bottom", "left"], rooms: ["ballroom"], roll: { trait: "knowledge", dice, min: 3 } },
        chance: chanceAtLeast(dice, 3),
        preview: null,
      }),
    ]);
    // Pressing it takes the engine's own action: Ox rolls for the switch.
    const result = apply(ENGINE, state, through[0].actions[0]);
    if (!result.ok) throw new Error(result.reason);
    expect(result.state.lastEvents.some((event) => event.type === "rolled" && (event.data as { figure: string }).figure === ox)).toBe(true);
  });

  it("offers the Slide as every room below it, each taking the one roll", () => {
    // Zoe stands in the Attic, where a Slide lies: the ground floor and the basement are below.
    const state = testGame();
    state.board.tiles.push({ tile: "attic", floor: "upper", x: 9, y: 9, rotation: 0 });
    put(state, 0, "attic");
    state.tokens.push({ token: "slide", room: "attic" });
    const { targets, panel } = choicesOf(state);
    expect(panel.map((choice) => choice.label)).not.toContain("Use the Slide (Might roll)");
    const below = state.board.tiles.filter((tile) => tile.floor !== "upper").map((tile) => tile.tile);
    const through = targets.filter((t) => t.kind === "through");
    expect(through.map((t) => t.room).sort()).toEqual(below.sort());
    expect(new Set(through.map((t) => t.id)).size).toBe(through.length);
    for (const target of through) {
      expect(target).toMatchObject({ from: "attic", label: "Slide: Might roll 5+", through: { token: "slide", room: "attic", wall: [], roll: { trait: "might", min: 5 } } });
      expect(target.actions).toEqual(through[0].actions);
    }
  });

  it("offers each side of a barrier room a figure lands in as its own place", () => {
    const state = testGame({ rooms: ["tower"] });
    const zoe = explorer(state, 0).id;
    const landing = start(ENGINE, { ...state, pending: null }, [relocate(zoe, "tower", { source: "rulebook", page: 7 })]);
    const { targets, panel } = choicesOf(landing);
    expect(panel).toEqual([]);
    expect(targets.map((t) => (t.kind === "room" ? [t.room, t.side] : t.kind)).sort()).toEqual(ENGINE.catalog.rooms.tower.doors.map((side) => ["tower", side]).sort());
  });

  it("offers a choice among figures as the figures in the house", () => {
    // The Medical Kit heals Zoe or Ox, both hurt, in the Entrance Hall.
    const hurt = testGame({ explorers: [{ seat: 0, cards: ["medical-kit"], clips: { might: 1 } }, { seat: 1, clips: { might: 1 } }] });
    const state = choose(hurt, "Use the Medical Kit");
    const { targets, panel } = choicesOf(state);
    expect(panel).toEqual([]);
    expect(targets.map((t) => (t.kind === "figure" ? t.figure : t.kind)).sort()).toEqual([explorer(state, 0).id, explorer(state, 1).id].sort());
  });

  it("offers a turn's attack on a figure as that figure, its other actions staying in the panel", () => {
    const state = inHaunt(testGame(), 1);
    const ox = explorer(state, 1).id;
    const { targets, panel } = choicesOf(state);
    const attack = targets.find((t) => t.kind === "figure" && t.figure === ox);
    expect(attack?.id).toBe(`attack:${ox}`);
    expect(panel.some((c) => c.label.includes("Attack"))).toBe(false);
    if (!attack) throw new Error("No attack on Ox");
    expect(apply(ENGINE, state, attack.actions[0]).ok).toBe(true);
  });

  it("offers nothing to a seat the decision isn't put to", () => {
    expect(playChoices(viewFor(ENGINE, testGame(), 1))).toEqual(NO_CHOICES);
  });
});

describe("explorations", () => {
  /** The Kitchen and the Chapel either side of an empty cell, each with a doorway onto it. */
  const layout: Layout = {
    tiles: [
      { tile: "kitchen", floor: "ground", x: 0, y: 0, rotation: 0 },
      { tile: "chapel", floor: "ground", x: 2, y: 0, rotation: 0 },
    ],
  };
  const through = (room: string, direction: Edge, spaces: number, steps: number): Reach => ({
    end: { kind: "discover", room, direction },
    label: `Explore from the ${room}`,
    route: Array.from({ length: steps }, (_, i) => ({ room: i === steps - 1 ? room : `walk-${String(i)}`, side: null })),
    actions: [],
    spaces,
    warnings: [],
    stops: true,
  });
  const chosen = (reaches: Reach[]) => {
    const found = explorations(layout, reaches);
    expect(found).toHaveLength(1);
    expect(found[0].cell).toEqual({ floor: "ground", x: 1, y: 0 });
    return `${found[0].reach.end.room}:${found[0].reach.end.direction}`;
  };

  it("makes a cell beside two doorways one target, by the cheaper route there", () => {
    const kitchen = through("kitchen", "right", 3, 3);
    const chapel = through("chapel", "left", 2, 4);
    expect(chosen([kitchen, chapel])).toBe("chapel:left");
    expect(chosen([chapel, kitchen])).toBe("chapel:left");
  });

  it("prefers the room the turn stands in on a tie", () => {
    const here = through("kitchen", "right", 1, 1);
    const next = through("chapel", "left", 1, 2);
    expect(chosen([next, here])).toBe("kitchen:right");
    expect(chosen([here, next])).toBe("kitchen:right");
  });

  it("breaks any other tie by the room, the same whatever order the routes come in", () => {
    const chapel = through("chapel", "left", 2, 2);
    const kitchen = through("kitchen", "right", 2, 3);
    expect(chosen([kitchen, chapel])).toBe("chapel:left");
    expect(chosen([chapel, kitchen])).toBe("chapel:left");
  });

  it("keeps cells apart and leaves moves out", () => {
    const move: Reach = { ...through("kitchen", "right", 1, 2), end: { kind: "move", place: { room: "chapel", side: null } } };
    const found = explorations(layout, [move, through("kitchen", "right", 1, 1), through("kitchen", "left", 1, 1)]);
    expect(found.map(({ cell }) => `${String(cell.x)},${String(cell.y)}`).sort()).toEqual(["-1,0", "1,0"]);
  });
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
