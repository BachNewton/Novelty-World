/**
 * Farmer Idle-Front — fullscreen canvas.
 * Plays the 6-frame front-idle strip (sheet row 1) centered on screen
 * via requestAnimationFrame. Auto-resizes with the window.
 */
'use client';

import { useEffect, useRef } from 'react';

const STRIP_SRC = '/sprites/farmer/idle-front-strip.png';
const FRAME_SIZE = 256;
const FRAME_COUNT = 6;
const FRAME_MS = 200;

export default function FarmerIdleCanvas() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sizeRef = useRef({ width: 1, height: 1 });

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (canvas === null || wrapper === null) return;

    const ctx = canvas.getContext('2d');
    if (ctx === null) return;

    const img = new Image();
    img.src = STRIP_SRC;
    let loaded = false;
    img.onload = () => {
      loaded = true;
    };

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

    let rafId = 0;
    const startTime = performance.now();

    const drawFrame = (now: number) => {
      rafId = requestAnimationFrame(drawFrame);
      const { width, height } = sizeRef.current;
      ctx.clearRect(0, 0, width, height);
      if (!loaded) return;

      const frame = Math.floor((now - startTime) / FRAME_MS) % FRAME_COUNT;

      const scale = Math.max(1, Math.floor(Math.min(width, height) / FRAME_SIZE));
      const dw = FRAME_SIZE * scale;
      const dh = FRAME_SIZE * scale;
      const dx = (width - dw) / 2;
      const dy = (height - dh) / 2;
      ctx.drawImage(img, frame * FRAME_SIZE, 0, FRAME_SIZE, FRAME_SIZE, dx, dy, dw, dh);
    };

    rafId = requestAnimationFrame(drawFrame);

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <div ref={wrapperRef} className="h-dvh w-screen overflow-hidden bg-black">
      <canvas ref={canvasRef} className="block" style={{ imageRendering: 'pixelated' }} />
    </div>
  );
}
