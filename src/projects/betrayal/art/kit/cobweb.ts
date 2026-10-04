import * as THREE from "three";
import type { PaletteKey } from "../palette";
import { pixelPlane } from "../shapes";
import { pixelTexture } from "../textures";

/** Rows of a web slung from the ceiling, sagging to a point, with its hub
 *  high in the middle and a few torn strands. */
function slungRows(width: number, height: number): string[] {
  const rows: string[] = [];
  const hub = { x: width / 2, y: height * 0.3 };
  const spokes = 9;
  for (let y = 0; y < height; y++) {
    let row = "";
    for (let x = 0; x < width; x++) {
      const across = Math.abs(x + 0.5 - width / 2) / (width / 2);
      const inside = y + 0.5 < height * Math.pow(1 - across, 0.7);
      const dx = x + 0.5 - hub.x;
      const dy = y + 0.5 - hub.y;
      const r = Math.hypot(dx, dy);
      const turn = ((Math.atan2(dy, dx) / (Math.PI * 2)) * spokes + spokes) % 1;
      const offSpoke = Math.min(turn, 1 - turn) * ((r * Math.PI * 2) / spokes);
      const torn = (x * 7 + y * 3) % 11 === 0;
      const ring = r > 1.5 && Math.abs((r % 3) - 1.5) < 0.5 && !torn;
      row += inside && (offSpoke < 0.55 || ring) ? "#" : ".";
    }
    rows.push(row);
  }
  return rows;
}

/** Rows of a web filling a corner as one-pixel threads: spokes from the
 *  corner at the top left, and two sagging rings tied to the edges. */
function fanRows(size: number): string[] {
  const grid = Array.from({ length: size }, () => Array.from({ length: size }, () => "."));
  const line = ([x0, y0]: number[], [x1, y1]: number[]) => {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= steps; i++) {
      const x = Math.round(x0 + ((x1 - x0) * i) / steps);
      const y = Math.round(y0 + ((y1 - y0) * i) / steps);
      if (x < size && y < size) grid[y][x] = "#";
    }
  };
  const angles = [0, 0.42, 0.85, 1.22, Math.PI / 2];
  const point = (angle: number, r: number) => [Math.cos(angle) * r, Math.sin(angle) * r];
  for (const angle of angles.slice(1, -1)) line([0, 0], point(angle, size));
  for (const r of [size * 0.42, size * 0.82]) {
    for (let i = 0; i < angles.length - 1; i++) {
      const sag = (j: number) => (j === 0 || j === angles.length - 1 ? 1 : 0.86);
      line(point(angles[i], r * sag(i)), point(angles[i + 1], r * sag(i + 1)));
    }
  }
  return grid.map((row) => row.join(""));
}

/** Pixels across a fan web, which is square. */
export const FAN_WEB_PX = 12;

export type CobwebOptions =
  | {
      /** Slung across a corner, just under the ceiling, to be seen from
       *  either side: the origin is the middle of its top edge. */
      form: "slung";
      colour?: PaletteKey;
      lit?: boolean;
    }
  | {
      /** Filling the corner of a frame, flat against its back: the origin is
       *  the corner, and it hangs down and to the right unless `flip`ped to
       *  hang left. */
      form: "fan";
      flip?: boolean;
      colour?: PaletteKey;
      lit?: boolean;
    };

/** A cobweb of one-pixel threads, facing +z. Pale and unlit by default, so it
 *  catches the eye in the dark the way real webs catch stray light. */
export function cobweb(options: CobwebOptions): THREE.Mesh {
  const { colour = "ash", lit = false } = options;
  const rows = options.form === "slung" ? slungRows(26, 16) : fanRows(FAN_WEB_PX);
  const web = pixelPlane(pixelTexture(rows, { "#": colour }), { lit, alpha: true });
  (web.material as THREE.Material).side = THREE.DoubleSide;
  const { width, height } = (web.geometry as THREE.PlaneGeometry).parameters;
  if (options.form === "slung") {
    web.geometry.translate(0, -height / 2, 0);
  } else {
    web.geometry.translate(width / 2, -height / 2, 0);
    if (options.flip) web.rotation.z = -Math.PI / 2;
  }
  web.userData.noShadow = true;
  return web;
}
