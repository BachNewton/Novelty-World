/**
 * Farmer game world — fullscreen canvas.
 * Walks the shared tile map (40x28 cells of 16px). Hold WASD to walk that
 * way (camera follows); release to idle facing it. On touch screens a
 * floating-origin analog stick appears where the thumb lands and feeds the
 * same movement keys. `P` cycles the playable character. Other co-op
 * players draw at their eased network positions.
 */
'use client';

import { useEffect, useRef, type CSSProperties } from 'react';
import { CELL_PX } from './tiles';
import { MAP_COLS, MAP_ROWS } from './world-map';
import { AVATAR_FRAME_PX, drawAvatar, drawTile } from './draw';
import {
  STICK_KNOB_PX,
  STICK_RADIUS_PX,
  stickDeflection,
  stickToKeys,
} from './virtual-stick';
import { nextCharacterId, type AvatarDir, type CharacterId } from './characters';
import { advanceRemoteRender, type CoopSession } from './coop/session';

const SPEED_PX_S = 60;
/** Target visible cells on the shorter viewport side; world and sprites share 1x-art-px units. */
const VISIBLE_CELLS = 15;

const KEY_DIR: Record<string, AvatarDir | undefined> = {
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

/** Side rows face right natively; flip for left. */
function facingFor(code: string): { dir: AvatarDir; flip: boolean } {
  const dir = KEY_DIR[code] ?? 'front';
  const flip = dir === 'side' && code === 'KeyA';
  return { dir, flip };
}

/** The key whose facing reproduces a stored pose. */
function codeForFacing(dir: AvatarDir, flip: boolean): string {
  if (dir === 'back') return 'KeyW';
  if (dir === 'side') return flip ? 'KeyA' : 'KeyD';
  return 'KeyS';
}

interface Stick {
  pointerId: number;
  originX: number;
  originY: number;
  knobX: number;
  knobY: number;
}

const PIXELATED: CSSProperties = { imageRendering: 'pixelated' };

export default function GameWorld({ session }: { session: CoopSession }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (canvas === null || wrapper === null) return;
    const ctx = canvas.getContext('2d');
    if (ctx === null) return;

    let width = 1;
    let height = 1;
    let dpr = 1;
    // Resume where the player stood before the last mode toggle.
    const resume = session.localAvatar();
    const pos = { x: resume.x, y: resume.y };
    let characterId: CharacterId = resume.characterId;
    let lastCode = codeForFacing(resume.dir, resume.flip);
    /** Held codes, newest last: physical keys merged with stick-derived keys. */
    let kbHeld: string[] = [];
    let touchCodes: string[] = [];
    let pressed: string[] = [];
    /** Touch tilt magnitude (1 for keyboard-only movement). */
    let speedScale = 1;
    /** Active floating-origin stick in CSS px relative to the canvas. */
    let stick: Stick | null = null;
    let lastTime: number | null = null;
    let anim = { key: '', t0: 0 };

    const resize = () => {
      const rect = wrapper.getBoundingClientRect();
      dpr = window.devicePixelRatio || 1;
      width = Math.max(1, Math.floor(rect.width));
      height = Math.max(1, Math.floor(rect.height));
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(wrapper);
    window.addEventListener('resize', resize);

    const rebuildPressed = () => {
      pressed = [...kbHeld, ...touchCodes.filter((c) => !kbHeld.includes(c))];
    };

    const syncTouch = (codes: string[], mag: number) => {
      touchCodes = codes;
      speedScale = codes.length > 0 ? mag : 1;
      rebuildPressed();
      const dominant = codes.at(-1);
      if (dominant !== undefined) lastCode = dominant;
    };

    const updateStick = (s: Stick, clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const dx = clientX - rect.left - s.originX;
      const dy = clientY - rect.top - s.originY;
      const len = Math.hypot(dx, dy);
      const clamped = len > STICK_RADIUS_PX ? STICK_RADIUS_PX / len : 1;
      s.knobX = s.originX + dx * clamped;
      s.knobY = s.originY + dy * clamped;
      const defl = stickDeflection(dx, dy, STICK_RADIUS_PX);
      syncTouch(stickToKeys(defl), defl.mag);
    };

    const onPointerDown = (e: PointerEvent) => {
      // Touch only: mouse/pen must never summon the stick. First touch owns it.
      if (e.pointerType !== 'touch' || stick !== null) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      stick = { pointerId: e.pointerId, originX: x, originY: y, knobX: x, knobY: y };
      canvas.setPointerCapture(e.pointerId);
      updateStick(stick, e.clientX, e.clientY);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (stick?.pointerId === e.pointerId) updateStick(stick, e.clientX, e.clientY);
    };
    const onPointerEnd = (e: PointerEvent) => {
      if (stick?.pointerId !== e.pointerId) return;
      stick = null;
      syncTouch([], 1);
    };
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerEnd);
    canvas.addEventListener('pointercancel', onPointerEnd);

    const onKeyDown = (e: KeyboardEvent) => {
      if (KEY_DIR[e.code] !== undefined) {
        kbHeld = [...kbHeld.filter((c) => c !== e.code), e.code];
        rebuildPressed();
        lastCode = e.code;
      }
      if (e.code === 'KeyP' && !e.repeat) characterId = nextCharacterId(characterId);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (KEY_DIR[e.code] === undefined) return;
      kbHeld = kbHeld.filter((c) => c !== e.code);
      rebuildPressed();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    const drawTiles = (scale: number, now: number) => {
      // Quantize the camera to whole device pixels so tile edges align
      // exactly and the background can't bleed through seams.
      const baseX = Math.round((width / 2 - pos.x * scale) * dpr) / dpr;
      const baseY = Math.round((height / 2 - pos.y * scale) * dpr) / dpr;
      const c0 = Math.max(0, Math.floor((pos.x - width / 2 / scale) / CELL_PX));
      const c1 = Math.min(MAP_COLS - 1, Math.ceil((pos.x + width / 2 / scale) / CELL_PX));
      const r0 = Math.max(0, Math.floor((pos.y - height / 2 / scale) / CELL_PX));
      const r1 = Math.min(MAP_ROWS - 1, Math.ceil((pos.y + height / 2 / scale) / CELL_PX));
      const size = CELL_PX * scale;
      const grid = session.map.grid();
      for (let r = r0; r <= r1; r += 1) {
        for (let c = c0; c <= c1; c += 1) {
          const tile = grid[r][c];
          if (tile !== null) drawTile(ctx, tile, c, r, baseX + c * size, baseY + r * size, size, now);
        }
      }
    };

    const drawFrame = (now: number) => {
      rafId = requestAnimationFrame(drawFrame);
      const dt = lastTime === null ? 0 : Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

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
        const step = SPEED_PX_S * speedScale * dt;
        pos.x += (vx / len) * step;
        pos.y += (vy / len) * step;
      }
      const moving = pressed.length > 0;
      const { dir, flip } = facingFor(pressed.at(-1) ?? lastCode);
      const local = { x: pos.x, y: pos.y, dir, flip, moving, characterId };
      session.setLocalAvatar(local);

      const scale = Math.max(1, Math.floor(Math.min(width, height) / (VISIBLE_CELLS * CELL_PX)));
      const avatarSize = AVATAR_FRAME_PX * scale;

      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, width, height);
      drawTiles(scale, now);

      const key = `${characterId}:${dir}:${moving ? 'walk' : 'idle'}`;
      if (anim.key !== key) anim = { key, t0: now };
      drawAvatar(ctx, local, width / 2, height / 2, avatarSize, now - anim.t0);

      // The camera follows the local player; remotes draw relative to it.
      for (const avatar of session.remotes.values()) {
        advanceRemoteRender(avatar, dt);
        const centerX = width / 2 + (avatar.renderX - pos.x) * scale;
        const centerY = height / 2 + (avatar.renderY - pos.y) * scale;
        drawAvatar(ctx, avatar, centerX, centerY, avatarSize, now);
      }

      if (stick !== null) {
        const q = (v: number) => Math.round(v * dpr) / dpr;
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(q(stick.originX), q(stick.originY), STICK_RADIUS_PX, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.arc(q(stick.knobX), q(stick.knobY), STICK_KNOB_PX, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    };
    let rafId = requestAnimationFrame(drawFrame);

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerEnd);
      canvas.removeEventListener('pointercancel', onPointerEnd);
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [session]);

  return (
    <div ref={wrapperRef} className="h-dvh w-screen overflow-hidden bg-black">
      <canvas ref={canvasRef} data-testid="play-canvas" className="block touch-none select-none" style={PIXELATED} />
    </div>
  );
}
