import * as THREE from "three";
import { roundBox, sculpt } from "../forms";
import { figureParts } from "../figure-parts";
import { itemModel, piece } from "./item";

/*
 * The Puzzle Box (item): a secret box of pale inlaid woods, every face a
 * marquetry of light and dark diamonds, its edges banded dark, with no lid
 * to be seen: only its end panel, slid partway open, shows it opens at all.
 * It reads by the busy pale pattern on a plain block, and the step of the
 * slid panel, apart from the Music Box's polished dark wood and gilt key.
 * Gripped round the box, standing on end; on the floor it stands.
 */

/** The box's half-sizes across the hand (x) and along it (z), its foot and top along the grip, how round its edges are. */
const BOX = { x: 0.029, z: 0.037, foot: -0.026, top: 0.072, round: 0.004 };
/** The end panel at the top: how deep it is, and how far it has slid out along z. */
const PANEL = { deep: 0.016, slid: 0.013 };
/** The diamonds' size, and the width of the dark bands at the edges. */
const PATTERN = { every: 0.0115, band: 0.0042 };

/** How far a point lies inside the box's banded edges: negative within a band's width of two faces at once. */
function banded(half: readonly [number, number, number], at: readonly [number, number, number]): number {
  const inFrom = half.map((h, i) => h - Math.abs(at[i])).sort((a, b) => a - b);
  return inFrom[1] - PATTERN.band;
}

/**
 * Which of three woods the marquetry shows at a point: diamonds on a grid
 * turned 45° across whichever face the point lies on (the face its
 * coordinate nearest the box's own size names), 0, 1 or 2.
 */
function woodAt(x: number, y: number, z: number): number {
  const out = [Math.abs(x) / BOX.x, Math.abs(y - (BOX.foot + BOX.top) / 2) / ((BOX.top - BOX.foot) / 2), Math.abs(z) / BOX.z];
  const face = out.indexOf(Math.max(...out));
  const [u, v] = face === 0 ? [z, y] : face === 1 ? [x, z] : [x, y];
  const across = Math.floor((u + v) / PATTERN.every);
  const along = Math.floor((u - v) / PATTERN.every);
  return (((across + 2 * along) % 3) + 3) % 3;
}

function boxGeometry(): THREE.BufferGeometry {
  const { x, z, foot, top, round } = BOX;
  const seam = top - PANEL.deep;
  const middle = (foot + seam) / 2;
  const body: [number, number, number] = [x, (seam - foot) / 2, z];
  const panelMiddle = seam + PANEL.deep / 2 - 0.0008;
  const panel: [number, number, number] = [x - 0.0012, PANEL.deep / 2, z - 0.0012];
  return sculpt()
    .add(roundBox([0, middle, 0], body, round), "woodLight")
    .add(roundBox([0, panelMiddle, PANEL.slid], panel, round), "woodLight")
    // The marquetry: diamonds of three woods, on every face.
    .paint((px, py, pz) => (woodAt(px, py, pz) === 1 ? -1 : 1), "boneLight")
    .paint((px, py, pz) => (woodAt(px, py, pz) === 2 ? -1 : 1), "woodMid")
    // The dark bands round each block's edges.
    .paint((px, py, pz) => (py > seam ? 1 : banded(body, [px, py - middle, pz])), "woodDark")
    .paint((px, py, pz) => (py < seam ? 1 : banded(panel, [px, py - panelMiddle, pz - PANEL.slid])), "woodDark")
    .geometry(0.0011);
}

const PARTS = figureParts("item:puzzle-box", () => ({ box: boxGeometry() }));

/** The box, forward in the fist towards the fingertips, so its back clears the wrist as a running arm bends it. */
function puzzleBox(): THREE.Mesh {
  const box = piece(PARTS.get().box, "puzzle box");
  box.position.z = 0.006;
  return box;
}

export const PUZZLE_BOX = itemModel({
  card: "puzzle-box",
  parts: [PARTS],
  held: () => ({ object: puzzleBox(), handle: 0.032, carry: "upright" }),
  plate: { lie: new THREE.Euler(), spin: 0.7 },
});
