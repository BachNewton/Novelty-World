import { type BufferGeometry, type Color, CylinderGeometry, IcosahedronGeometry, SphereGeometry, TorusGeometry } from "three";
import { createRng, type Rng } from "@/shared/lib/seeded-random";
import { themeColor } from "@/shared/lib/three/theme-color";
import type { ClueMark } from "../stories/story";
import { paint, type Piece } from "./painted";

/*
 * The clues of the mysteries, as small storybook objects and marks on the
 * ground: soft simple forms with their colours in their vertices, from the
 * clue tokens, each at its own origin on the ground facing +z. Paw prints
 * in a patch of mud, a tuft of russet fur caught on a twig, a small red
 * mitten, a trail of crumbs and honey drops, fallen twigs and wool, a black
 * feather, a brass button, a coil of rope, boot prints with a cane's holes
 * beside them, and a cloudberry leaf with its berry. They are drawn larger
 * than life, as the forage is, so they read from a few steps off.
 */

const CLUE_TONES = ["mud", "print", "fox", "fox-light", "twig", "mitten", "cuff", "crumb", "honey", "wool", "moss", "feather", "sheen", "brass", "rope", "leaf", "berry", "glint"] as const;
export type ClueTone = (typeof CLUE_TONES)[number];
export type CluePalette = Record<ClueTone, Color>;

export function readCluePalette(): CluePalette {
  return Object.fromEntries(CLUE_TONES.map((t) => [t, themeColor(`--color-hearthwood-clue-${t}`)])) as CluePalette;
}

/** How much larger than life a clue is drawn. */
export const CLUE_LARGER = 1.6;
/** How high over its spot a clue's glint twinkles, before it is drawn larger. */
export const GLINT_HEIGHT = 0.16;

const at = (g: BufferGeometry, x: number, y: number, z: number) => g.translate(x, y, z);
const between = (rng: Rng, low: number, high: number) => low + rng.next() * (high - low);

/** A flat, gently domed patch of mud, sunk a little so it sits into a slope. */
function mud(p: CluePalette, width: number, length: number): Piece {
  const patch = new SphereGeometry(1, 18, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  patch.scale(width / 2, 0.025, length / 2);
  return { geometry: at(patch, 0, -0.008, 0), colour: p.mud, shading: 0.2 };
}

function pawPrint(p: CluePalette, x: number, z: number): Piece[] {
  const pad = new SphereGeometry(0.024, 8, 4);
  pad.scale(1, 0.3, 1.1);
  const pieces: Piece[] = [{ geometry: at(pad, x, 0.014, z), colour: p.print }];
  for (const [tx, tz] of [
    [-0.022, 0.03],
    [-0.008, 0.042],
    [0.008, 0.042],
    [0.022, 0.03],
  ]) {
    const toe = new SphereGeometry(0.009, 6, 3);
    toe.scale(1, 0.4, 1.2);
    pieces.push({ geometry: at(toe, x + tx, 0.014, z + tz), colour: p.print });
  }
  return pieces;
}

function bootPrint(p: CluePalette, x: number, z: number): Piece[] {
  const sole = new SphereGeometry(0.04, 10, 4);
  sole.scale(0.8, 0.22, 1.7);
  const heel = new SphereGeometry(0.03, 8, 4);
  heel.scale(0.95, 0.22, 0.9);
  return [
    { geometry: at(sole, x, 0.013, z + 0.02), colour: p.print },
    { geometry: at(heel, x, 0.013, z - 0.07), colour: p.print },
  ];
}

function cluePieces(mark: ClueMark, p: CluePalette, rng: Rng): Piece[] {
  switch (mark) {
    case "fox-prints": {
      const pieces = [mud(p, 0.34, 0.62)];
      for (let k = 0; k < 4; k++) pieces.push(...pawPrint(p, (k % 2 === 0 ? -1 : 1) * 0.012, -0.21 + k * 0.14));
      return pieces;
    }
    case "fur": {
      const pieces: Piece[] = [];
      for (let k = 0; k < 3; k++) {
        const stem = new CylinderGeometry(0.007, 0.012, 0.3, 5);
        stem.translate(0, 0.15, 0);
        stem.rotateZ((k - 1) * 0.35);
        stem.rotateY(k * 2.1);
        pieces.push({ geometry: stem, colour: p.twig, shading: 0.3 });
      }
      for (let k = 0; k < 7; k++) {
        const puff = new SphereGeometry(between(rng, 0.032, 0.046), 8, 6);
        pieces.push({ geometry: at(puff, between(rng, -0.05, 0.05), 0.2 + between(rng, -0.03, 0.03), between(rng, -0.03, 0.03)), colour: k >= 5 ? p["fox-light"] : p.fox, shading: 0.25 });
      }
      return pieces;
    }
    case "mitten": {
      const hand = new SphereGeometry(1, 12, 8);
      hand.scale(0.06, 0.022, 0.085);
      const thumb = new SphereGeometry(1, 8, 6);
      thumb.scale(0.022, 0.018, 0.04);
      thumb.rotateY(-0.6);
      const cuff = new CylinderGeometry(0.055, 0.058, 0.04, 12);
      cuff.rotateX(Math.PI / 2);
      cuff.scale(1, 0.42, 1);
      return [
        { geometry: at(hand, 0, 0.022, 0.03), colour: p.mitten, shading: 0.3 },
        { geometry: at(thumb, 0.06, 0.02, -0.005), colour: p.mitten },
        { geometry: at(cuff, 0, 0.022, -0.065), colour: p.cuff },
        { geometry: at(new SphereGeometry(0.012, 6, 4), 0, 0.044, 0.04), colour: p.cuff },
      ];
    }
    case "crumbs": {
      const pieces: Piece[] = [];
      for (let k = 0; k < 9; k++) {
        const crumb = new IcosahedronGeometry(between(rng, 0.011, 0.018), 0);
        pieces.push({ geometry: at(crumb, Math.sin(k * 1.3) * 0.05 + between(rng, -0.015, 0.015), 0.012, -0.3 + k * 0.075), colour: p.crumb, shading: 0.3 });
      }
      for (let k = 0; k < 4; k++) {
        const drop = new SphereGeometry(0.016, 8, 4);
        drop.scale(1.2, 0.45, 1.4);
        pieces.push({ geometry: at(drop, Math.sin(k * 2.1 + 0.6) * 0.05, 0.008, -0.25 + k * 0.16), colour: p.honey });
      }
      return pieces;
    }
    case "twigs": {
      const pieces: Piece[] = [];
      for (let k = 0; k < 7; k++) {
        const twig = new CylinderGeometry(0.006, 0.008, between(rng, 0.18, 0.28), 4);
        twig.rotateZ(Math.PI / 2);
        twig.rotateY(between(rng, 0, Math.PI));
        pieces.push({ geometry: at(twig, between(rng, -0.05, 0.05), 0.01 + k * 0.004, between(rng, -0.05, 0.05)), colour: p.twig });
      }
      for (let k = 0; k < 3; k++) pieces.push({ geometry: at(new SphereGeometry(between(rng, 0.026, 0.034), 8, 6), between(rng, -0.07, 0.07), 0.03, between(rng, -0.06, 0.06)), colour: p.wool, shading: 0.2 });
      const moss = new SphereGeometry(0.03, 8, 4);
      moss.scale(1.3, 0.45, 1);
      pieces.push({ geometry: at(moss, 0.08, 0.012, -0.04), colour: p.moss });
      return pieces;
    }
    case "feather": {
      const vane = new SphereGeometry(1, 12, 6);
      vane.scale(0.032, 0.006, 0.13);
      const downy = new SphereGeometry(1, 8, 4);
      downy.scale(0.026, 0.008, 0.03);
      const quill = new CylinderGeometry(0.003, 0.004, 0.3, 4);
      quill.rotateX(Math.PI / 2);
      const pieces: Piece[] = [
        { geometry: at(vane, 0, 0.012, 0.02), colour: p.feather },
        { geometry: at(downy, 0, 0.012, -0.1), colour: p.sheen },
        { geometry: at(quill, 0, 0.018, 0), colour: p.sheen },
      ];
      for (const piece of pieces) piece.geometry.rotateZ(0.12);
      return pieces;
    }
    case "button": {
      const disc = new CylinderGeometry(0.045, 0.045, 0.014, 16);
      disc.rotateX(0.18);
      const rim = new TorusGeometry(0.04, 0.007, 5, 18);
      rim.rotateX(Math.PI / 2 + 0.18);
      const pieces: Piece[] = [
        { geometry: at(disc, 0, 0.014, 0), colour: p.brass, shading: 0.25 },
        { geometry: at(rim, 0, 0.022, 0), colour: p.brass.clone().multiplyScalar(0.85) },
      ];
      for (const [x, z] of [
        [-0.011, -0.011],
        [0.011, -0.011],
        [-0.011, 0.011],
        [0.011, 0.011],
      ]) {
        pieces.push({ geometry: at(new SphereGeometry(0.0065, 5, 3), x, 0.022 + z * 0.18, z), colour: p.print });
      }
      return pieces;
    }
    case "rope": {
      const pieces: Piece[] = [];
      [0.1, 0.082, 0.064].forEach((radius, k) => {
        const coil = new TorusGeometry(radius, 0.015, 6, 22);
        coil.rotateX(Math.PI / 2);
        pieces.push({ geometry: at(coil, 0, 0.015 + k * 0.022, 0), colour: k === 1 ? p.rope.clone().multiplyScalar(0.92) : p.rope, shading: 0.3 });
      });
      const end = new CylinderGeometry(0.014, 0.014, 0.26, 6);
      end.rotateX(Math.PI / 2);
      end.rotateY(0.5);
      pieces.push({ geometry: at(end, 0.1, 0.015, 0.16), colour: p.rope });
      return pieces;
    }
    case "cane-prints": {
      const pieces = [mud(p, 0.4, 0.78)];
      for (let k = 0; k < 4; k++) {
        const side = k % 2 === 0 ? -1 : 1;
        const z = -0.26 + k * 0.17;
        pieces.push(...bootPrint(p, side * 0.06, z));
        if (k % 2 === 0) {
          const hole = new CylinderGeometry(0.013, 0.013, 0.012, 8);
          pieces.push({ geometry: at(hole, side * 0.15, 0.012, z + 0.02), colour: p.print });
        }
      }
      return pieces;
    }
    case "cloudberry-leaf": {
      const pieces: Piece[] = [];
      for (let k = 0; k < 5; k++) {
        const angle = (k / 5) * Math.PI * 2 + 0.3;
        const lobe = new SphereGeometry(0.06, 10, 4);
        lobe.scale(1, 0.12, 1);
        pieces.push({ geometry: at(lobe, Math.cos(angle) * 0.045, 0.012, Math.sin(angle) * 0.045), colour: k % 2 === 0 ? p.leaf : p.leaf.clone().multiplyScalar(0.9), shading: 0.2 });
      }
      const stalk = new CylinderGeometry(0.005, 0.006, 0.1, 4);
      stalk.rotateX(Math.PI / 2);
      pieces.push({ geometry: at(stalk, 0, 0.014, -0.13), colour: p.twig });
      for (let k = 0; k < 6; k++) {
        const angle = (k / 6) * Math.PI * 2;
        pieces.push({ geometry: at(new SphereGeometry(0.016, 6, 5), 0.13 + Math.cos(angle) * 0.016, 0.028 + (k % 2) * 0.008, 0.06 + Math.sin(angle) * 0.016), colour: p.berry, shading: 0.25 });
      }
      pieces.push({ geometry: at(new SphereGeometry(0.016, 6, 5), 0.13, 0.042, 0.06), colour: p.berry });
      return pieces;
    }
  }
}

/** A clue's model, at its own origin on the ground, life-sized: whoever places it draws it `CLUE_LARGER`. */
export function clueShape(mark: ClueMark, palette: CluePalette): BufferGeometry {
  return paint(cluePieces(mark, palette, createRng(`hearthwood/clue/${mark}`)));
}
