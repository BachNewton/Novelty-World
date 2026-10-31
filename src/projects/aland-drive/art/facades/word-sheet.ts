import { CanvasTexture, LinearFilter, LinearMipmapLinearFilter } from "three/webgpu";
import IDS from "./facade-ids.json";

/*
 * The words on signs, drawn once on a canvas: white letters on black, one cell a word, read by the facade shader as a
 * mask. A chain's name here is invented and an independent's is its trade: see `sign_word` in `assign.py`.
 */

const COLUMNS = 4;
const CELL_WIDE = 512;
const CELL_TALL = 96;
const PAD = 14;

export interface WordSheet {
  texture: CanvasTexture;
  columns: number;
  rows: number;
  /** A word's width over its height. */
  aspect: number;
  /** Texture pixels across a word. */
  pixelsWide: number;
}

export function createWordSheet(): WordSheet {
  const rows = Math.ceil(IDS.words.length / COLUMNS);
  const canvas = document.createElement("canvas");
  canvas.width = COLUMNS * CELL_WIDE;
  canvas.height = rows * CELL_TALL;
  const pen = canvas.getContext("2d");
  if (!pen) throw new Error("word sheet: no 2D canvas");
  pen.textAlign = "center";
  pen.textBaseline = "middle";
  pen.fillStyle = "#fff";
  pen.font = `700 ${CELL_TALL * 0.74}px "Segoe UI", Arial, sans-serif`;
  IDS.words.forEach((word, at) => {
    const measured = pen.measureText(word).width;
    const squeeze = Math.min(1, (CELL_WIDE - PAD * 2) / measured);
    pen.save();
    pen.translate(((at % COLUMNS) + 0.5) * CELL_WIDE, (Math.floor(at / COLUMNS) + 0.5) * CELL_TALL);
    pen.scale(squeeze, 1);
    pen.fillText(word, 0, 2);
    pen.restore();
  });
  const texture = new CanvasTexture(canvas);
  texture.generateMipmaps = true;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.flipY = false;
  return { texture, columns: COLUMNS, rows, aspect: CELL_WIDE / CELL_TALL, pixelsWide: CELL_WIDE };
}
