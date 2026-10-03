import { FROG_LOOKS, FROG_VARIANTS } from "../frog/look";
import { cellKey, frogCells, pieceSize } from "../logic";
import { toSeconds } from "../ticks";
import { gateLanes } from "../traffic";
import type { Gate, Solid } from "../types";
import type { Proof, ProofResult, RowProof } from "./solver";
import { endSlot, planShape, type PlanStep, type TeamPose } from "./team-plan";

// A proof as a person reads it: per row, the route as steps in words ("Sprout
// hops; Splash slides left"), each stage drawn as the row's face in ASCII,
// and the inputs that play it.

export const FACE_LEGEND =
  "Faces: # a vehicle, . open, : a gate's lanes, 1 and 2 the frogs (P1 and P2), x a frog's cell inside a vehicle (fine until the row arrives).";

export function playerName(player: number): string {
  const variant = FROG_VARIANTS[player] as (typeof FROG_VARIANTS)[number] | undefined;
  if (variant === undefined) throw new Error(`No name for player ${String(player)}`);
  return FROG_LOOKS[variant].name;
}

// The row's face with the team on it, top row first, as many rows as the
// face has or the frogs reach.
export function drawFace(pose: TeamPose, solids: readonly Solid[], gates: readonly Gate[], lanes: number, wallRows: number): string[] {
  const vehicles = new Set(solids.flatMap((solid) => ("cells" in solid ? solid.cells.map(cellKey) : [])));
  const frogs = new Map<string, number>();
  pose.forEach((frog, player) => {
    for (const cell of frogCells(planShape(frog))) frogs.set(cellKey(cell), player);
  });
  const top = Math.max(wallRows, ...[...frogs.keys()].map((key) => Number(key.split(",")[1]) + 1));
  const inGate = (col: number): boolean => gates.some((gate) => col >= gateLanes(gate).first && col <= gateLanes(gate).last);
  const lines: string[] = [];
  for (let row = top - 1; row >= 0; row--) {
    let line = "";
    for (let col = 0; col < lanes; col++) {
      const key = cellKey({ col, row });
      const player = frogs.get(key);
      if (player !== undefined) line += vehicles.has(key) ? "x" : String(player + 1);
      else if (row >= wallRows) line += " ";
      else line += vehicles.has(key) ? "#" : inGate(col) ? ":" : ".";
    }
    lines.push(line);
  }
  return lines;
}

const TURNS = { rotateCw: "clockwise", rotateCcw: "anticlockwise" } as const;

// How far a turn was kicked sideways from where the turned piece is centred.
function kickOf(before: TeamPose, after: TeamPose, player: number, turn: 1 | -1): number {
  const from = before[player];
  const to = after[player];
  const shift = (pieceSize(from.kind, from.rotation).width - pieceSize(to.kind, to.rotation).width) / 2;
  return to.col - (from.col + (turn === 1 ? Math.floor(shift) : Math.ceil(shift)));
}

function lanesWord(n: number): string {
  return n === 1 ? "1 lane" : `${String(n)} lanes`;
}

// What a slot does, in words, from the team at the slot's start.
export function describeStep(before: TeamPose, step: PlanStep): string {
  const { move, pose } = step;
  const said: string[] = [];
  if (move.kind === "wait") {
    said.push("wait");
  } else {
    const name = playerName(move.player);
    switch (move.action) {
      case "left":
      case "right":
        said.push(`${name} slides ${move.action}`);
        break;
      case "hop":
        said.push(`${name} hops`);
        break;
      case "rotateCw":
      case "rotateCcw": {
        const kick = kickOf(before, pose, move.player, move.action === "rotateCw" ? 1 : -1);
        const kicked = kick === 0 ? "" : `, kicking ${lanesWord(Math.abs(kick))} ${kick > 0 ? "right" : "left"}`;
        said.push(`${name} turns ${TURNS[move.action]}${kicked}`);
        break;
      }
    }
  }
  pose.forEach((frog, player) => {
    if (before[player].air !== null && frog.air === null) said.push(`${playerName(player)} lands`);
  });
  return said.join("; ");
}

// What happens between slots: hops whose airtime runs out land, or stand on
// a partner.
function describeSlotEnd(mid: TeamPose, after: TeamPose): string[] {
  const said: string[] = [];
  after.forEach((frog, player) => {
    const was = mid[player].air;
    if (was !== null && frog.air === null) said.push(`${playerName(player)} lands`);
    else if (was !== null && was > 0 && frog.air === 0) {
      const partner = after.findIndex((_, i) => i !== player);
      said.push(`${playerName(player)}'s hop is over: it stands on ${partner === -1 ? "its partner" : playerName(partner)}`);
    }
  });
  return said;
}

// The frames side by side, wrapped to a readable width.
function sideBySide(frames: { caption: string; lines: string[] }[], width: number): string[] {
  const cell = Math.max(...frames.map((f) => Math.max(f.caption.length, ...f.lines.map((l) => l.length)))) + 2;
  const perLine = Math.max(1, Math.floor(width / cell));
  const out: string[] = [];
  for (let at = 0; at < frames.length; at += perLine) {
    const group = frames.slice(at, at + perLine);
    const height = Math.max(...group.map((f) => f.lines.length));
    out.push(group.map((f) => f.caption.padEnd(cell)).join("").trimEnd());
    for (let row = 0; row < height; row++) {
      const pad = (f: (typeof group)[number]): string[] => [...Array<string>(height - f.lines.length).fill(""), ...f.lines];
      out.push(group.map((f) => (pad(f)[row] ?? "").padEnd(cell)).join("").trimEnd());
    }
  }
  return out;
}

function gateWords(row: RowProof): string {
  const through = row.gates
    .map((gate, player) => (gate === null ? null : `${playerName(player)} goes through the gate, becoming ${gate.kind === "I" || gate.kind === "O" ? "an" : "a"} ${gate.kind}`))
    .filter((said) => said !== null);
  return through.length === 0 ? "" : ` ${through.join("; ")}.`;
}

function inputWords(row: RowProof): string {
  return row.inputs
    .map(({ tick, player, input }) => (input.kind === "act" ? `${input.action}@${String(tick)} P${String(player + 1)}` : `${input.kind}@${String(tick)}`))
    .join(" ");
}

// One row's route: the steps in words, the faces at each stage, the inputs.
export function describeRow(row: RowProof, lanes: number, wallRows: number, number: number): string[] {
  const draw = (pose: TeamPose): string[] => drawFace(pose, row.wall.solids, row.wall.gates, lanes, wallRows);
  const jumps = row.jumps === 0 ? "" : `after ${String(row.jumps)} jump${row.jumps === 1 ? "" : "s"} forward, `;
  const out = [
    `Row ${String(number)} (course row ${String(row.index)}): passed at ${toSeconds(row.passedAt).toFixed(2)} s, ${jumps}${row.steps.length === 0 ? "already in a passing pose" : `${String(row.steps.length)} step${row.steps.length === 1 ? "" : "s"}`}.${gateWords(row)}`,
  ];
  const frames = [{ caption: "start", lines: draw(row.start) }];
  let before = row.start;
  row.steps.forEach((step, i) => {
    out.push(`  ${String(i + 1)}. ${describeStep(before, step)}`);
    frames.push({ caption: String(i + 1), lines: draw(step.pose) });
    const after = endSlot(step.pose);
    const between = i + 1 < row.steps.length ? describeSlotEnd(step.pose, after) : [];
    if (between.length > 0) out.push(`     then ${between.join("; ")}`);
    before = after;
  });
  out.push("  The row arrives, and passes the team.");
  out.push(...sideBySide(frames, 96).map((line) => `    ${line}`));
  out.push(`  inputs: ${inputWords(row)}`);
  return out;
}

// The whole proof, or where the search got stuck, as a report.
export function describeProof(result: ProofResult, lanes: number, wallRows: number): string {
  const rows = result.ok ? result.proof.rows : result.rows;
  const out = [FACE_LEGEND, ""];
  rows.forEach((row, i) => {
    out.push(...describeRow(row, lanes, wallRows, i + 1), "");
  });
  if (result.ok) out.push(summary(result.proof));
  else out.push(`STUCK at course row ${String(result.stuck.index)}: ${result.stuck.reason}. (${String(result.searches)} row searches.)`);
  return out.join("\n");
}

export function summary(proof: Proof): string {
  const end = proof.finished ? "crossed the finish" : "stopped as asked";
  return `PROVED: ${String(proof.rows.length)} rows passed with no bonk, ${end}; ${String(proof.log.length)} inputs, ${toSeconds(proof.until).toFixed(1)} s; replayed in the real rules from the start.`;
}
