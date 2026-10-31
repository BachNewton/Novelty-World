import { seeded } from "../roadside/mesh";
import { drawStamp, readInks, STAMP_FONT, STAMP_HEIGHT, STAMP_WIDTH, STAMPS, type Canvas2D, type InkSet, type StampDesign } from "./stamps";

/*
 * An album page as an image: mounts in a grid, each with a stamp once it's found and
 * its faint outline and name until then. No React: a caller gets a canvas it can show,
 * upload as a texture or save.
 */

export interface AlbumOptions {
  /** Ids of the stamps found. */
  found: ReadonlySet<string>;
  /** The page, from 1, of a book of `columns` by `rows`. */
  page: number;
  columns?: number;
  rows?: number;
  inks?: InkSet;
}

const PAGE_RATIO = 1.17;
const TILT_RAD = 0.016;

const albumInk = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(`--color-aland-drive-album-${name}`).trim();

/** How many pages a book of this layout runs to. */
export const albumPages = (columns = 4, rows = 3) => Math.ceil(STAMPS.length / (columns * rows));

/** The stamps on a page. */
export function stampsOnPage(page: number, columns = 4, rows = 3): readonly StampDesign[] {
  return STAMPS.slice((page - 1) * columns * rows, page * columns * rows);
}

/** Draws a page in a rectangle of the canvas from its top left. */
export function drawAlbumPage(ctx: Canvas2D, width: number, { found, page, columns = 4, rows = 3, inks = readInks() }: AlbumOptions) {
  const height = width * PAGE_RATIO;
  const unit = width / 1000;
  ctx.save();
  ctx.fillStyle = albumInk("page");
  ctx.fillRect(0, 0, width, height);

  const margin = 62 * unit;
  ctx.strokeStyle = albumInk("line");
  ctx.lineWidth = 2 * unit;
  ctx.strokeRect(margin * 0.55, margin * 0.55, width - margin * 1.1, height - margin * 1.1);

  ctx.fillStyle = albumInk("ink");
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = `700 ${40 * unit}px ${STAMP_FONT}`;
  ctx.fillText("Åland", width / 2, margin + 62 * unit);
  ctx.font = `${20 * unit}px ${STAMP_FONT}`;
  const onPage = stampsOnPage(page, columns, rows);
  const foundHere = onPage.filter(({ id }) => found.has(id)).length;
  ctx.fillText(`${foundHere} / ${onPage.length}`, width / 2, margin + 96 * unit);

  const top = margin + 126 * unit;
  const cellWide = (width - margin * 2) / columns;
  const cellTall = (height - top - margin * 0.9) / rows;
  const stampWide = Math.min(cellWide * 0.76, ((cellTall - 46 * unit) * STAMP_WIDTH) / STAMP_HEIGHT);
  const stampTall = (stampWide * STAMP_HEIGHT) / STAMP_WIDTH;
  const random = seeded(page * 97 + 3);

  onPage.forEach((design, index) => {
    const [column, row] = [index % columns, Math.floor(index / columns)];
    const x = margin + cellWide * column + (cellWide - stampWide) / 2;
    const y = top + cellTall * row + 6 * unit;
    const [mountX, mountY] = [x - 9 * unit, y - 9 * unit];
    const [mountWide, mountTall] = [stampWide + 18 * unit, stampTall + 18 * unit];
    ctx.fillStyle = albumInk("mount");
    ctx.fillRect(mountX, mountY, mountWide, mountTall);
    ctx.strokeStyle = albumInk("line");
    ctx.lineWidth = 1.5 * unit;
    ctx.strokeRect(mountX, mountY, mountWide, mountTall);
    const roll = random();
    if (found.has(design.id)) {
      drawStamp(ctx, design, inks, { x, y, width: stampWide, turn: (roll - 0.5) * 2 * TILT_RAD, shadow: { colour: albumInk("ink"), blur: 8 * unit, drop: 3 * unit } });
    } else {
      ctx.fillStyle = albumInk("line");
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `700 ${44 * unit}px ${STAMP_FONT}`;
      ctx.fillText(String(STAMPS.indexOf(design) + 1), x + stampWide / 2, y + stampTall / 2);
    }
    ctx.fillStyle = albumInk("ink");
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.font = `600 ${15 * unit}px ${STAMP_FONT}`;
    ctx.fillText(found.has(design.id) ? design.name : design.finds, x + stampWide / 2, y + stampTall + 16 * unit, cellWide - 8 * unit);
  });
  ctx.restore();
}

/** A page as its own canvas, `width` pixels across. */
export function renderAlbumPage(width: number, options: AlbumOptions): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = Math.round(width * PAGE_RATIO);
  const ctx = canvas.getContext("2d");
  if (ctx === null) throw new Error("no 2D canvas");
  drawAlbumPage(ctx, width, options);
  return canvas;
}

/** One stamp as its own canvas, transparent past its perforations. */
export function renderStamp(design: StampDesign, width: number, inks: InkSet = readInks()): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = Math.round((width * STAMP_HEIGHT) / STAMP_WIDTH);
  const ctx = canvas.getContext("2d");
  if (ctx === null) throw new Error("no 2D canvas");
  drawStamp(ctx, design, inks, { x: 0, y: 0, width });
  return canvas;
}
