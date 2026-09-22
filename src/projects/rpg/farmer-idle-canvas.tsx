/**
 * Farmer — fullscreen canvas world.
 * Hold WASD to walk that way (camera follows, grid scrolls);
 * release to idle facing it. Rows: front 0/3, side 1/4 (face right
 * natively, flipped for left), back 2/5. Player stays centered via
 * requestAnimationFrame. Auto-resizes with the window.
 */
'use client';

import { useEffect, useRef } from 'react';

const IDLE_STRIPS = {
  front: '/sprites/farmer/front-idle-strip.png',
  side: '/sprites/farmer/side-idle-strip.png',
  back: '/sprites/farmer/back-idle-strip.png',
} as const;

const WALK_STRIPS = {
  front: '/sprites/farmer/front-walk-strip.png',
  side: '/sprites/farmer/side-walk-strip.png',
  back: '/sprites/farmer/back-walk-strip.png',
} as const;

type Dir = keyof typeof IDLE_STRIPS;

const FRAME_SIZE = 256;
const FRAME_COUNT = 6;
const IDLE_FRAME_MS = 200;
const WALK_FRAME_MS = 120;
const SPEED_PX_S = 200;
const GRID_PX = 64;

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

export default function FarmerIdleCanvas() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sizeRef = useRef({ width: 1, height: 1 });
  const pressedRef = useRef<string[]>([]);
  const lastCodeRef = useRef<string>('KeyS');
  const posRef = useRef({ x: 0, y: 0 });
  const lastTimeRef = useRef<number | null>(null);
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

    let rafId = 0;

    const drawGrid = (camX: number, camY: number, scale: number) => {
      const { width, height } = sizeRef.current;
      const toX = (wx: number) => width / 2 + (wx - camX) * scale;
      const toY = (wy: number) => height / 2 + (wy - camY) * scale;
      const kMinX = Math.floor((camX - width / 2 / scale) / GRID_PX);
      const kMaxX = Math.ceil((camX + width / 2 / scale) / GRID_PX);
      const kMinY = Math.floor((camY - height / 2 / scale) / GRID_PX);
      const kMaxY = Math.ceil((camY + height / 2 / scale) / GRID_PX);
      ctx.lineWidth = 1;
      for (let k = kMinX; k <= kMaxX; k += 1) {
        ctx.strokeStyle = k === 0 ? '#475569' : '#1e293b';
        ctx.beginPath();
        ctx.moveTo(toX(k * GRID_PX), 0);
        ctx.lineTo(toX(k * GRID_PX), height);
        ctx.stroke();
      }
      for (let k = kMinY; k <= kMaxY; k += 1) {
        ctx.strokeStyle = k === 0 ? '#475569' : '#1e293b';
        ctx.beginPath();
        ctx.moveTo(0, toY(k * GRID_PX));
        ctx.lineTo(width, toY(k * GRID_PX));
        ctx.stroke();
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

      const scale = Math.max(1, Math.floor(Math.min(width, height) / FRAME_SIZE));

      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, width, height);
      drawGrid(posRef.current.x, posRef.current.y, scale);

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
    };
  }, []);

  return (
    <div ref={wrapperRef} className="h-dvh w-screen overflow-hidden bg-black">
      <canvas ref={canvasRef} className="block" style={{ imageRendering: 'pixelated' }} />
    </div>
  );
}
