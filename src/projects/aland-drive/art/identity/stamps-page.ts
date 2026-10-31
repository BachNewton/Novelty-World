import { albumPages, renderAlbumPage, renderStamp } from "./album";
import { readInks, STAMPS, STAMP_HEIGHT, STAMP_WIDTH, type Canvas2D } from "./stamps";

/* The stamps on sheets, for the gallery's --stamps run. It draws on a plain canvas, so it needs no GPU. */

const COLUMNS = 6;
const CELL = 300;
const inks = readInks();

function sheet(page: number): HTMLCanvasElement {
  const perSheet = 12;
  const stamps = STAMPS.slice(page * perSheet, (page + 1) * perSheet);
  const tall = Math.round((CELL * STAMP_HEIGHT) / STAMP_WIDTH);
  const canvas = document.createElement("canvas");
  canvas.width = COLUMNS * (CELL + 24) + 24;
  canvas.height = 2 * (tall + 24) + 24;
  const ctx = canvas.getContext("2d") as Canvas2D;
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--color-aland-drive-album-page");
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  stamps.forEach((design, index) => ctx.drawImage(renderStamp(design, CELL, inks), 24 + (index % COLUMNS) * (CELL + 24), 24 + Math.floor(index / COLUMNS) * (tall + 24)));
  return canvas;
}

const everyId = new Set(STAMPS.map(({ id }) => id));
const someIds = new Set(STAMPS.filter((_, index) => index % 3 !== 1).map(({ id }) => id));
const sheets: Record<string, () => HTMLCanvasElement> = {
  "stamps-1": () => sheet(0),
  "stamps-2": () => sheet(1),
  "album-page-1": () => renderAlbumPage(1500, { found: someIds, page: 1 }),
  "album-page-2-full": () => renderAlbumPage(1500, { found: everyId, page: albumPages() }),
};

declare global {
  interface Window {
    __identityStamps: { sheets: string[]; png: (name: string) => string; ready: boolean };
  }
}

window.__identityStamps = { sheets: Object.keys(sheets), png: (name) => sheets[name]().toDataURL("image/png"), ready: true };
