/**
 * Farmer game world — fullscreen canvas.
 * Walks the tile map stored by the map editor (localStorage
 * `map-editor-v1`, 40x28 cells of 16px). Hold WASD to walk that way
 * (camera follows); release to idle facing it. Player stays centered
 * via requestAnimationFrame. Auto-resizes with the window.
 */
'use client';

import { useEffect, useRef } from 'react';
import { CELL_PX, migrateTileSrc } from './tiles';
import { animSrcCol, foldAnimSx, sheetForTileSrc } from './tile-anim';
import { getTileImage } from './tile-variants';
import { MAP_COLS, MAP_ROWS, STORAGE_KEY } from './map-editor';
import type { MapGrid, PlacedTile } from './map-editor';

const IDLE_STRIPS = {
  front: '/rpg/sprites/farmer/front-idle.png',
  side: '/rpg/sprites/farmer/side-idle.png',
  back: '/rpg/sprites/farmer/back-idle.png',
} as const;

const WALK_STRIPS = {
  front: '/rpg/sprites/farmer/front-walk.png',
  side: '/rpg/sprites/farmer/side-walk.png',
  back: '/rpg/sprites/farmer/back-walk.png',
} as const;

type Dir = keyof typeof IDLE_STRIPS;

const FRAME_SIZE = 64;
const FRAME_COUNT = 6;
const IDLE_FRAME_MS = 200;
const WALK_FRAME_MS = 120;
const SPEED_PX_S = 60;
/** Target visible cells on the shorter viewport side; world and sprites share 1x-art-px units. */
const VISIBLE_CELLS = 15;

function isPlacedTile(value: unknown): value is PlacedTile {
  if (typeof value !== 'object' || value === null) return false;
  const t = value as Record<string, unknown>;
  return (
    typeof t.src === 'string' &&
    typeof t.sx === 'number' &&
    typeof t.sy === 'number'
  );
}

function loadMap(): MapGrid {
  const empty: MapGrid = Array.from({ length: MAP_ROWS }, () =>
    Array.from({ length: MAP_COLS }, () => null),
  );
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return empty;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length !== MAP_ROWS) return empty;
    return parsed.map((row: unknown) => {
      if (!Array.isArray(row) || row.length !== MAP_COLS) return Array.from({ length: MAP_COLS }, () => null);
      return row.map((cell: unknown) => {
        if (!isPlacedTile(cell)) return null;
        const src = migrateTileSrc(cell.src);
        // Back-compat: cells picked from later animation frames fold into frame 0.
        return { ...cell, src, sx: foldAnimSx(sheetForTileSrc(src), cell.sx) };
      });
    });
  } catch {
    return empty;
  }
}

interface Facing {
  dir: Dir;
  flip: boolean;
}

const KEY_DIR: Record<string, Dir | undefined> = {
  KeyW: 'back',
  KeyS: 'front',
  KeyA: 'side',
  KeyD: 'side',
};

const KEY_VEC: Record<string, { x: number; y: number } | undefined> = {
  KeyW: { x: 0, y: -1 },
  KeyS: { x: 0, y: 1 },
  KeyA: { x: -1, y: 0 },
  KeyD: { x: 1, y: 0 },
};

/** Side rows face right natively (rows 1 and 4); flip for left. */
function facingFor(code: string): Facing {
  const dir = KEY_DIR[code] ?? 'front';
  const flip = dir === 'side' && code === 'KeyA';
  return { dir, flip };
}

export default function GameWorld() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sizeRef = useRef({ width: 1, height: 1 });
  const pressedRef = useRef<string[]>([]);
  const lastCodeRef = useRef<string>('KeyS');
  const posRef = useRef({ x: (MAP_COLS * CELL_PX) / 2, y: (MAP_ROWS * CELL_PX) / 2 });
  const lastTimeRef = useRef<number | null>(null);
  const mapRef = useRef<MapGrid>([]);
  const animRef = useRef({ key: 'front:idle', t0: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (canvas === null || wrapper === null) return;

    const ctx = canvas.getContext('2d');
    if (ctx === null) return;

    const imgs: Record<string, HTMLImageElement | undefined> = {};
    for (const src of [...Object.values(IDLE_STRIPS), ...Object.values(WALK_STRIPS)]) {
      const img = new Image();
      img.src = src;
      imgs[src] = img;
    }

    const refreshMap = () => {
      mapRef.current = loadMap();
    };
    refreshMap();

    const resize = () => {
      const rect = wrapper.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const cssWidth = Math.max(1, Math.floor(rect.width));
      const cssHeight = Math.max(1, Math.floor(rect.height));
      sizeRef.current = { width: cssWidth, height: cssHeight };
      canvas.width = Math.floor(cssWidth * dpr);
      canvas.height = Math.floor(cssHeight * dpr);
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
    };

    resize();

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(wrapper);
    window.addEventListener('resize', resize);

    const press = (code: string) => {
      pressedRef.current = [...pressedRef.current.filter((c) => c !== code), code];
      lastCodeRef.current = code;
    };

    const release = (code: string) => {
      pressedRef.current = pressedRef.current.filter((c) => c !== code);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (KEY_DIR[e.code] !== undefined) press(e.code);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (KEY_DIR[e.code] !== undefined) release(e.code);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    const onMapChange = () => refreshMap();
    window.addEventListener('storage', onMapChange);
    window.addEventListener('focus', onMapChange);

    let rafId = 0;

    const drawGrid = (camX: number, camY: number, scale: number) => {
      const { width, height } = sizeRef.current;
      const toX = (wx: number) => width / 2 + (wx - camX) * scale;
      const toY = (wy: number) => height / 2 + (wy - camY) * scale;
      const kMinX = Math.floor((camX - width / 2 / scale) / CELL_PX);
      const kMaxX = Math.ceil((camX + width / 2 / scale) / CELL_PX);
      const kMinY = Math.floor((camY - height / 2 / scale) / CELL_PX);
      const kMaxY = Math.ceil((camY + height / 2 / scale) / CELL_PX);
      ctx.lineWidth = 1;
      for (let k = kMinX; k <= kMaxX; k += 1) {
        ctx.strokeStyle = k === 0 ? '#475569' : '#1e293b';
        ctx.beginPath();
        ctx.moveTo(toX(k * CELL_PX), 0);
        ctx.lineTo(toX(k * CELL_PX), height);
        ctx.stroke();
      }
      for (let k = kMinY; k <= kMaxY; k += 1) {
        ctx.strokeStyle = k === 0 ? '#475569' : '#1e293b';
        ctx.beginPath();
        ctx.moveTo(0, toY(k * CELL_PX));
        ctx.lineTo(width, toY(k * CELL_PX));
        ctx.stroke();
      }
    };

    const drawTiles = (camX: number, camY: number, scale: number, now: number) => {
      const { width, height } = sizeRef.current;
      const c0 = Math.max(0, Math.floor((camX - width / 2 / scale) / CELL_PX));
      const c1 = Math.min(MAP_COLS - 1, Math.ceil((camX + width / 2 / scale) / CELL_PX));
      const r0 = Math.max(0, Math.floor((camY - height / 2 / scale) / CELL_PX));
      const r1 = Math.min(MAP_ROWS - 1, Math.ceil((camY + height / 2 / scale) / CELL_PX));
      const s = CELL_PX * scale;
      for (let r = r0; r <= r1; r += 1) {
        const row = mapRef.current.at(r);
        if (row === undefined) continue;
        for (let c = c0; c <= c1; c += 1) {
          const cell = row.at(c);
          if (cell === undefined || cell === null) continue;
          const img = getTileImage(cell.src);
          if (!img.complete || img.naturalWidth === 0) continue;
          const sheet = sheetForTileSrc(cell.src);
          const srcCol =
            sheet?.anim === undefined
              ? cell.sx
              : animSrcCol(sheet, cell.sx, now, c, r);
          ctx.drawImage(
            img,
            srcCol * CELL_PX,
            cell.sy * CELL_PX,
            CELL_PX,
            CELL_PX,
            width / 2 + (c * CELL_PX - camX) * scale,
            height / 2 + (r * CELL_PX - camY) * scale,
            s,
            s,
          );
        }
      }
    };

    const drawFrame = (now: number) => {
      rafId = requestAnimationFrame(drawFrame);
      const { width, height } = sizeRef.current;
      const last = lastTimeRef.current;
      lastTimeRef.current = now;
      const dt = last === null ? 0 : Math.min((now - last) / 1000, 0.05);
      const pressed = pressedRef.current;
      const moving = pressed.length > 0;
      let vx = 0;
      let vy = 0;
      for (const code of pressed) {
        const vec = KEY_VEC[code];
        if (vec !== undefined) {
          vx += vec.x;
          vy += vec.y;
        }
      }
      const len = Math.hypot(vx, vy);
      if (len > 0) {
        posRef.current.x += (vx / len) * SPEED_PX_S * dt;
        posRef.current.y += (vy / len) * SPEED_PX_S * dt;
      }
      const code = moving ? (pressed[pressed.length - 1] ?? 'KeyS') : lastCodeRef.current;
      const { dir, flip } = facingFor(code);
      const strips = moving ? WALK_STRIPS : IDLE_STRIPS;
      const img = imgs[strips[dir]];
      if (img === undefined || !img.complete || img.naturalWidth === 0) return;

      const scale = Math.max(1, Math.floor(Math.min(width, height) / (VISIBLE_CELLS * CELL_PX)));

      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, width, height);
      drawGrid(posRef.current.x, posRef.current.y, scale);
      drawTiles(posRef.current.x, posRef.current.y, scale, now);

      const key = `${dir}:${moving ? 'walk' : 'idle'}`;
      if (animRef.current.key !== key) animRef.current = { key, t0: now };
      const frameMs = moving ? WALK_FRAME_MS : IDLE_FRAME_MS;
      const f = Math.floor((now - animRef.current.t0) / frameMs) % FRAME_COUNT;

      const dw = FRAME_SIZE * scale;
      const dh = FRAME_SIZE * scale;
      const dx = (width - dw) / 2;
      const dy = (height - dh) / 2;
      if (flip) {
        ctx.save();
        ctx.translate(width, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(img, f * FRAME_SIZE, 0, FRAME_SIZE, FRAME_SIZE, dx, dy, dw, dh);
      if (flip) ctx.restore();
    };

    rafId = requestAnimationFrame(drawFrame);

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('storage', onMapChange);
      window.removeEventListener('focus', onMapChange);
    };
  }, []);

  return (
    <div ref={wrapperRef} className="h-dvh w-screen overflow-hidden bg-black">
      <canvas ref={canvasRef} className="block" style={{ imageRendering: 'pixelated' }} />
    </div>
  );
}
