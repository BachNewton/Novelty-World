/**
 * Farmer Idle — fullscreen canvas.
 * Plays the 6-frame idle strip for the faced direction (sheet rows:
 * front 0, side 3/4-right 1, back 2; left mirrors side) centered on
 * screen via requestAnimationFrame. WASD switches direction.
 * Auto-resizes with the window.
 */
'use client';

import { useEffect, useRef } from 'react';

const STRIPS = {
  front: '/sprites/farmer/front-idle-strip.png',
  side: '/sprites/farmer/side-idle-strip.png',
  back: '/sprites/farmer/back-idle-strip.png',
} as const;

type Dir = keyof typeof STRIPS;

const FRAME_SIZE = 256;
const FRAME_COUNT = 6;
const FRAME_MS = 200;

const KEY_DIR: Record<string, { dir: Dir; flip: boolean } | undefined> = {
  KeyW: { dir: 'back', flip: false },
  KeyS: { dir: 'front', flip: false },
  KeyA: { dir: 'side', flip: true },
  KeyD: { dir: 'side', flip: false },
};

export default function FarmerIdleCanvas() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sizeRef = useRef({ width: 1, height: 1 });
  const dirRef = useRef<{ dir: Dir; flip: boolean }>({ dir: 'front', flip: false });

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (canvas === null || wrapper === null) return;

    const ctx = canvas.getContext('2d');
    if (ctx === null) return;

    const imgs = (Object.keys(STRIPS) as Dir[]).reduce(
      (acc, dir) => {
        const img = new Image();
        img.src = STRIPS[dir];
        acc[dir] = img;
        return acc;
      },
      {} as Record<Dir, HTMLImageElement>,
    );

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

    const onKeyDown = (e: KeyboardEvent) => {
      const mapped = KEY_DIR[e.code];
      if (mapped !== undefined) dirRef.current = mapped;
    };
    window.addEventListener('keydown', onKeyDown);

    let rafId = 0;
    const startTime = performance.now();

    const drawFrame = (now: number) => {
      rafId = requestAnimationFrame(drawFrame);
      const { width, height } = sizeRef.current;
      ctx.clearRect(0, 0, width, height);
      const { dir, flip } = dirRef.current;
      const img = imgs[dir];
      if (!img.complete || img.naturalWidth === 0) return;

      const frame = Math.floor((now - startTime) / FRAME_MS) % FRAME_COUNT;

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
      ctx.drawImage(img, frame * FRAME_SIZE, 0, FRAME_SIZE, FRAME_SIZE, dx, dy, dw, dh);
      if (flip) ctx.restore();
    };

    rafId = requestAnimationFrame(drawFrame);

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return (
    <div ref={wrapperRef} className="h-dvh w-screen overflow-hidden bg-black">
      <canvas ref={canvasRef} className="block" style={{ imageRendering: 'pixelated' }} />
    </div>
  );
}
