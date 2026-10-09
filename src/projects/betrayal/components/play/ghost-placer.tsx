"use client";

import { useState, type RefObject } from "react";
import { GHOST_DOORWAY_COLOUR } from "../../art/house";
import type { Target } from "../../art/house-scene";
import { paletteHex } from "../../art/palette";
import type { Spot } from "../../engine/board";
import type { GameView } from "../../engine/view";
import { ENGINE } from "../../game";
import type { InputKind } from "../../input/controls";
import type { GhostCell, GhostChoice, GhostOption } from "../../play/choices";
import { countDoors, cycle, ghostDoors, type GhostDoor, type GhostDoorway } from "../../play/ghost";
import type { Action, Rotation } from "../../types";

/*
 * Placing a room tile: the house shows the actual room as a ghost on its
 * cell, turned the way the player has it, with what each doorway would do
 * there marked at its edges. The player turns it through its legal ways
 * round, then places it. When a rule lets the tile go on several cells, the
 * other cells glow, and choosing one moves the ghost there. Which cell and
 * way round are showing is the player's own until they place it: nothing is
 * sent before that.
 */

/** The ghost's target id: one ghost at a time. */
export const GHOST = "ghost";
const cellId = (spot: Spot) => `cell:${spot.floor}:${spot.x}:${spot.y}`;

/** What the e2e tests read of the ghost. */
export interface GhostReadout {
  tile: string;
  spot: Spot;
  rotation: Rotation;
  /** The ways round it may go on this cell, in the order turning it steps through them. */
  rotations: Rotation[];
  doors: GhostDoor[];
  cells: number;
}

export interface GhostPlacer {
  choice: GhostChoice;
  cell: GhostCell;
  option: GhostOption;
  /** Which of the cell's ways round shows, from 0. */
  way: number;
  doors: GhostDoor[];
  /** The ghost, and the other cells the tile may go on, as the house shows them, each with its name tag. */
  targets: (Target & { label: string })[];
  rotate: (step: 1 | -1) => void;
  /** Answers a target the house committed: the ghost places the tile as it
   *  shows, and another cell moves the ghost there. False for any other target. */
  commit: (id: string) => boolean;
  readout: GhostReadout;
}

interface Selection {
  decision: string;
  cell: number;
  rotation: Rotation;
}

/** The tile being placed, if the pending decision is one, with the cell and way round the player has chosen so far. */
export function useGhost(view: GameView, choice: GhostChoice | null, act: (action: Action) => void): GhostPlacer | null {
  const [chosen, setChosen] = useState<Selection | null>(null);
  const decision = view.pending?.id ?? null;
  if (!choice || decision === null) return null;
  // Until the player turns or moves it, the ghost is on the first cell, the first way round.
  const selection = chosen?.decision === decision ? chosen : { decision, cell: 0, rotation: choice.cells[0].options[0].rotation };
  const cell = choice.cells.at(selection.cell) ?? choice.cells[0];
  const rotations = cell.options.map((option) => option.rotation);
  const way = Math.max(0, rotations.indexOf(selection.rotation));
  const option = cell.options[way];
  const doors = ghostDoors(ENGINE.catalog, view.board, choice.tile, cell.spot, option.rotation);
  const name = ENGINE.catalog.rooms[choice.tile].name;

  const targets: GhostPlacer["targets"] = choice.cells.flatMap((other, i) =>
    i === selection.cell ? [] : [{ id: cellId(other.spot), kind: "cell" as const, ...other.spot, label: `Put the ${name} here` }],
  );
  targets.push({ id: GHOST, kind: "ghost", ...cell.spot, tile: choice.tile, rotation: option.rotation, doors, label: name });

  return {
    choice,
    cell,
    option,
    way,
    doors,
    targets,
    // From the selection as it now stands, so two turns before the screen redraws are both counted.
    rotate: (step) => {
      setChosen((before) => {
        const now = before?.decision === decision ? before : selection;
        const ways = (choice.cells.at(now.cell) ?? choice.cells[0]).options.map((other) => other.rotation);
        return { ...now, rotation: cycle(ways, now.rotation, step) };
      });
    },
    commit: (id) => {
      if (id === GHOST) {
        act(option.action);
        return true;
      }
      const to = choice.cells.findIndex((other) => cellId(other.spot) === id);
      if (to < 0) return false;
      setChosen({ decision, cell: to, rotation: choice.cells[to].options[0].rotation });
      return true;
    },
    readout: { tile: choice.tile, spot: cell.spot, rotation: option.rotation, rotations, doors, cells: choice.cells.length },
  };
}

const DOORWAY_WORDS: Record<GhostDoorway, (n: number) => string> = {
  joined: (n) => `${n} ${n === 1 ? "door joins" : "doors join"} the house`,
  blind: (n) => `${n} ${n === 1 ? "door faces" : "doors face"} a wall`,
  shut: (n) => `${n} ${n === 1 ? "neighbour's door is" : "neighbours' doors are"} walled off`,
  unexplored: (n) => `${n} ${n === 1 ? "door opens" : "doors open"} onto unexplored space`,
};
const DOORWAY_ORDER: GhostDoorway[] = ["joined", "unexplored", "blind", "shut"];

/** How to turn and place the ghost, for the input the player last used. */
const HINTS: Record<InputKind, string> = {
  "keyboard-mouse": "Q / E or its arrows turn it. Click it or press Enter to place it.",
  pad: "LB / RB or the d-pad's left and right turn it. A places it.",
  touch: "Tap the room, or its arrows, to turn it.",
};

/** The panel while a tile is being placed: the question (asked by the
 *  caller, which names who is asked), which way round it shows, what its
 *  doorways would do, how to turn it, and placing it. */
export function GhostPanel({ ghost, input, act }: { ghost: GhostPlacer; input: InputKind; act: (action: Action) => void }) {
  const counts = countDoors(ghost.doors);
  const ways = ghost.cell.options.length;
  const name = ENGINE.catalog.rooms[ghost.choice.tile].name;
  const stay = ghost.choice.stay;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-(--bt-muted)">
        {ways === 1 ? "It fits only one way round here." : `Way ${ghost.way + 1} of ${ways} it can go.`}
        {ghost.choice.cells.length > 1 && ` ${ghost.choice.cells.length} places it can go: choose a glowing one to move it there.`}
      </p>
      <ul aria-label="Its doorways" className="flex flex-col gap-0.5">
        {DOORWAY_ORDER.filter((doorway) => counts[doorway] > 0).map((doorway) => (
          <li key={doorway} className="flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-4 shrink-0 rounded-sm" style={{ backgroundColor: paletteHex(GHOST_DOORWAY_COLOUR[doorway]) }} />
            {DOORWAY_WORDS[doorway](counts[doorway])}
          </li>
        ))}
      </ul>
      <p className="text-xs text-(--bt-muted)">{HINTS[input]}</p>
      <div className="flex flex-wrap justify-end gap-2">
        {stay && (
          <button type="button" onClick={() => act(stay.action)} className="min-h-11 rounded border border-(--bt-line) bg-(--bt-room) px-3 py-1">
            {stay.label}
          </button>
        )}
        <button type="button" onClick={() => act(ghost.option.action)} className="min-h-11 rounded bg-(--bt-accent) px-4 py-1 font-semibold text-(--bt-bg)">
          Place the {name}
        </button>
      </div>
    </div>
  );
}

/** Arrows round the ghost in the house, for turning it with a pointer or a finger; the scene keeps them on it. */
export function GhostHandles({ handlesRef, ghost }: { handlesRef: RefObject<HTMLDivElement | null>; ghost: GhostPlacer | null }) {
  const many = ghost !== null && ghost.cell.options.length > 1;
  const arrow = "pointer-events-auto flex size-11 items-center justify-center rounded-full border border-(--bt-accent) bg-(--bt-panel) text-lg";
  return (
    <div ref={handlesRef} className="pointer-events-none invisible absolute top-0 left-0 flex gap-6">
      {many && (
        <>
          <button type="button" aria-label="Turn it anticlockwise" className={arrow} onClick={() => ghost.rotate(-1)}>
            ⟲
          </button>
          <button type="button" aria-label="Turn it clockwise" className={arrow} onClick={() => ghost.rotate(1)}>
            ⟳
          </button>
        </>
      )}
    </div>
  );
}
