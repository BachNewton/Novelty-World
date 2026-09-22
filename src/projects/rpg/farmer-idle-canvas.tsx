/**
 * Farmer — fullscreen canvas.
 * Hold WASD to play the walking animation for that direction;
 * release to idle facing it. Rows: front 0/3, side 1/4 (faces left,
 * flipped for right), back 2/5. Centered via requestAnimationFrame.
 * Auto-resizes with the window.
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

    const drawFrame = (now: number) => {
      rafId = requestAnimationFrame(drawFrame);
      const { width, height } = sizeRef.current;
      ctx.clearRect(0, 0, width, height);
      const pressed = pressedRef.current;
      const moving = pressed.length > 0;
      const code = moving ? (pressed[pressed.length - 1] ?? 'KeyS') : lastCodeRef.current;
      const { dir, flip } = facingFor(code);
      const strips = moving ? WALK_STRIPS : IDLE_STRIPS;
      const img = imgs[strips[dir]];
      if (img === undefined || !img.complete || img.naturalWidth === 0) return;

      const key = `${dir}:${moving ? 'walk' : 'idle'}`;
      if (animRef.current.key !== key) animRef.current = { key, t0: now };
      const frameMs = moving ? WALK_FRAME_MS : IDLE_FRAME_MS;
      const f = Math.floor((now - animRef.current.t0) / frameMs) % FRAME_COUNT;

      const scale = Math.max(1, Math.floor(Math.min(width, height) / FRAME_SIZE));
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
