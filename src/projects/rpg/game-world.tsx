/**
 * Farmer game world — fullscreen canvas.
 * Walks the tile map stored by the map editor (localStorage
 * `map-editor-v1`, 40x28 cells of 16px). Hold WASD to walk that way
 * (camera follows); release to idle facing it. On touch screens a
 * floating-origin analog stick appears where the thumb lands and feeds the
 * same movement keys. Player stays centered
 * via requestAnimationFrame. Auto-resizes with the window.
 */
'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { CELL_PX, migrateTileSrc } from './tiles';
import { animSrcCol, foldAnimSx, sheetForTileSrc } from './tile-anim';
import { getTileImage } from './tile-variants';
import { getCoopRoomId, getSharedCoopTransport, usePlayMapSync } from './coop/map-sync';
import { MAP_COLS, MAP_ROWS, STORAGE_KEY } from './map-editor';
import type { MapGrid, PlacedTile } from './map-editor';
import {
  STICK_KNOB_PX,
  STICK_RADIUS_PX,
  stickDeflection,
  stickToKeys,
} from './virtual-stick';
import {
  PRESENCE_LERP_RATE,
  advanceRemoteRender,
  usePresence,
} from './coop/presence';
import type { AvatarDir, PosPayload } from './coop/types';
import {
  DEFAULT_CHARACTER_ID,
  idleStripsFor,
  nextCharacterId,
  sanitizeCharacterId,
  walkStripsFor,
  type CharacterId,
} from './characters';

type Dir = AvatarDir;

const FRAME_SIZE = 64;
const FRAME_COUNT = 6;
const IDLE_FRAME_MS = 200;
const WALK_FRAME_MS = 120;
const SPEED_PX_S = 60;
/** Target visible cells on the shorter viewport side; world and sprites share 1x-art-px units. */
const VISIBLE_CELLS = 15;

/**
 * Visually-hidden style for the co-op state badges (`coop-status`,
 * `coop-role`, `coop-peer-count`, `coop-remote-count`). They expose live
 * `usePresence` state to E2E (condition-based waits) without affecting the
 * play canvas pixels.
 */
const COOP_BADGE_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
};

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
  const dprRef = useRef(1);
  const pressedRef = useRef<string[]>([]);
  const lastCodeRef = useRef<string>('KeyS');
  /** Physically-held keyboard codes; merged with touch codes into pressedRef. */
  const kbHeldRef = useRef<string[]>([]);
  /** Synthetic codes derived from the analog stick. */
  const touchCodesRef = useRef<string[]>([]);
  /** Touch tilt magnitude (1 for keyboard-only movement). */
  const speedScaleRef = useRef(1);
  /** Active floating-origin stick in CSS px relative to the canvas. */
  const stickRef = useRef<{
    pointerId: number;
    originX: number;
    originY: number;
    knobX: number;
    knobY: number;
  } | null>(null);
  const posRef = useRef({ x: (MAP_COLS * CELL_PX) / 2, y: (MAP_ROWS * CELL_PX) / 2 });
  // --- CO-OP CHUNK 1: local snapshot read by the 12 Hz pos sampler, plus the
  // remote-avatar map rendered (lerped) in the pass below. Camera stays local.
  const localPosRef = useRef<PosPayload>({
    x: (MAP_COLS * CELL_PX) / 2,
    y: (MAP_ROWS * CELL_PX) / 2,
    dir: 'front',
    flip: false,
    moving: false,
    characterId: DEFAULT_CHARACTER_ID,
  });
  /** Playable sprite directory (`P` cycles the roster). A ref because the
   * rAF loop reads it every frame; `characterBadge` mirrors it for E2E. */
  const characterRef = useRef<CharacterId>(DEFAULT_CHARACTER_ID);
  const [characterBadge, setCharacterBadge] = useState<CharacterId>(DEFAULT_CHARACTER_ID);
  const getLocalPos = useCallback((): PosPayload => localPosRef.current, []);
  // Page's co-op room (`?coop-room=`, default room when absent). Resolved
  // per render (client read, SSR-safe default); the URL is stable for the
  // page lifetime so presence and map-sync always agree on one room.
  const coopRoom = getCoopRoomId();
  const getRoomTransport = useCallback(
    () => getSharedCoopTransport(coopRoom),
    [coopRoom],
  );
  // Share one transport with the map-sync binding below: one PeerJS peer per
  // tab. Presence unsubscribes without destroying it (caller-owned), so the
  // `~` edit/play toggle keeps the same peer id and host.
  const presence = usePresence(getLocalPos, {
    createTransport: getRoomTransport,
  });
  const { remotesRef: remoteAvatarsRef, state: coopState } = presence;
  /**
   * Mount gate for the coop badges below: server HTML and the first client
   * render emit identical static placeholders (`idle` / `""` / `0`), and the
   * live hook state only renders after this event-driven flip — so the
   * transport's async `connecting`/`reconnecting` transitions can never
   * produce a hydration mismatch. Allowed: `useEffect`-gated `setState`,
   * no timers.
   */
  const [coopMounted, setCoopMounted] = useState(false);
  useEffect(() => {
    // Intentional hydration gate (static placeholders pre-mount, no timers).
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-gated badge placeholders must flip post-mount
    setCoopMounted(true);
  }, []);
  /**
   * Mirrors the live remote-avatar count into the `coop-remote-count` badge
   * once per frame (direct DOM write inside the existing rAF loop: 12 Hz net
   * traffic never re-renders React, and no new subscription or timer is added).
   */
  const remoteCountRef = useRef<HTMLSpanElement>(null);
  const lastTimeRef = useRef<number | null>(null);
  const mapRef = useRef<MapGrid>([]);
  const animRef = useRef({ key: 'front:idle', t0: 0 });

  // [coop-map-sync] Chunk 2 live edit→play: inbound tiles/snapshot/clear
  // merge into mapRef through the LWW seq map. The rAF loop below reads
  // mapRef every frame, so remote edits appear live with no reload. Never
  // writes localStorage (the editor persistence effect is the single writer);
  // the existing storage/focus refresh below is untouched.
  usePlayMapSync(mapRef, coopRoom);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (canvas === null || wrapper === null) return;

    const ctx = canvas.getContext('2d');
    if (ctx === null) return;

    const imgs: Record<string, HTMLImageElement | undefined> = {};
    /** Preload one character's strips on demand; the browser cache makes
     * repeat visits cheap. Unknown ids never reach here (sanitized first). */
    const ensureStrips = (id: CharacterId) => {
      for (const src of [...Object.values(idleStripsFor(id)), ...Object.values(walkStripsFor(id))]) {
        if (imgs[src] !== undefined) continue;
        const img = new Image();
        img.src = src;
        imgs[src] = img;
      }
    };
    ensureStrips(DEFAULT_CHARACTER_ID);

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
      dprRef.current = dpr;
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

    const rebuildPressed = () => {
      pressedRef.current = [
        ...kbHeldRef.current,
        ...touchCodesRef.current.filter((c) => !kbHeldRef.current.includes(c)),
      ];
    };

    const press = (code: string) => {
      kbHeldRef.current = [...kbHeldRef.current.filter((c) => c !== code), code];
      rebuildPressed();
      lastCodeRef.current = code;
    };

    const release = (code: string) => {
      kbHeldRef.current = kbHeldRef.current.filter((c) => c !== code);
      rebuildPressed();
    };

    /** Merge stick-derived codes without clobbering physically-held keys. */
    const syncTouch = (codes: string[], mag: number) => {
      touchCodesRef.current = codes;
      speedScaleRef.current = codes.length > 0 ? mag : 1;
      rebuildPressed();
      const dominant = codes.at(-1);
      if (dominant !== undefined) lastCodeRef.current = dominant;
    };

    const updateStick = (clientX: number, clientY: number) => {
      const stick = stickRef.current;
      if (stick === null) return;
      const rect = canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const dx = x - stick.originX;
      const dy = y - stick.originY;
      const len = Math.hypot(dx, dy);
      const clamped = len > STICK_RADIUS_PX ? STICK_RADIUS_PX / len : 1;
      stick.knobX = stick.originX + dx * clamped;
      stick.knobY = stick.originY + dy * clamped;
      const defl = stickDeflection(dx, dy, STICK_RADIUS_PX);
      syncTouch(stickToKeys(defl), defl.mag);
    };

    const endStick = (pointerId: number) => {
      if (stickRef.current?.pointerId !== pointerId) return;
      stickRef.current = null;
      syncTouch([], 1);
    };

    const onPointerDown = (e: PointerEvent) => {
      // Touch only: mouse/pen must never summon the stick. First touch owns it.
      if (e.pointerType !== 'touch' || stickRef.current !== null) return;
      const rect = canvas.getBoundingClientRect();
      stickRef.current = {
        pointerId: e.pointerId,
        originX: e.clientX - rect.left,
        originY: e.clientY - rect.top,
        knobX: e.clientX - rect.left,
        knobY: e.clientY - rect.top,
      };
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // Pointer already released; pointerup/cancel will clean up.
      }
      updateStick(e.clientX, e.clientY);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (stickRef.current?.pointerId !== e.pointerId) return;
      updateStick(e.clientX, e.clientY);
    };
    const onPointerUp = (e: PointerEvent) => endStick(e.pointerId);
    const onPointerCancel = (e: PointerEvent) => endStick(e.pointerId);
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerCancel);

    const onKeyDown = (e: KeyboardEvent) => {
      if (KEY_DIR[e.code] !== undefined) press(e.code);
      // `P` cycles the playable character once per press (repeat guard).
      // No text inputs exist on this page, and WASD/`~` are untouched.
      if (e.code === 'KeyP' && !e.repeat) {
        const next = nextCharacterId(characterRef.current);
        characterRef.current = next;
        setCharacterBadge(next);
      }
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

    const drawTiles = (camX: number, camY: number, scale: number, now: number) => {
      const { width, height } = sizeRef.current;
      const dpr = dprRef.current;
      // Quantize the camera to whole device pixels so tile edges align
      // exactly and the background can't bleed through seams.
      const baseX = Math.round((width / 2 - camX * scale) * dpr) / dpr;
      const baseY = Math.round((height / 2 - camY * scale) * dpr) / dpr;
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
            baseX + c * CELL_PX * scale,
            baseY + r * CELL_PX * scale,
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
        const step = SPEED_PX_S * speedScaleRef.current * dt;
        posRef.current.x += (vx / len) * step;
        posRef.current.y += (vy / len) * step;
      }
      const code = moving ? (pressed[pressed.length - 1] ?? 'KeyS') : lastCodeRef.current;
      const { dir, flip } = facingFor(code);
      // --- CO-OP CHUNK 1: publish the local snapshot for the 12 Hz sampler.
      localPosRef.current = {
        x: posRef.current.x,
        y: posRef.current.y,
        dir,
        flip,
        moving,
        characterId: characterRef.current,
      };
      const character = characterRef.current;
      ensureStrips(character);
      const strips = moving ? walkStripsFor(character) : idleStripsFor(character);
      const img = imgs[strips[dir]];
      if (img === undefined || !img.complete || img.naturalWidth === 0) return;

      const scale = Math.max(1, Math.floor(Math.min(width, height) / (VISIBLE_CELLS * CELL_PX)));

      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, width, height);
      drawTiles(posRef.current.x, posRef.current.y, scale, now);

      const key = `${character}:${dir}:${moving ? 'walk' : 'idle'}`;
      if (animRef.current.key !== key) animRef.current = { key, t0: now };
      const frameMs = moving ? WALK_FRAME_MS : IDLE_FRAME_MS;
      const f = Math.floor((now - animRef.current.t0) / frameMs) % FRAME_COUNT;

      const dw = FRAME_SIZE * scale;
      const dh = FRAME_SIZE * scale;
      const pdpr = dprRef.current;
      const dx = Math.round(((width - dw) / 2) * pdpr) / pdpr;
      const dy = Math.round(((height - dh) / 2) * pdpr) / pdpr;
      if (flip) {
        ctx.save();
        ctx.translate(width, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(img, f * FRAME_SIZE, 0, FRAME_SIZE, FRAME_SIZE, dx, dy, dw, dh);
      if (flip) ctx.restore();

      // --- CO-OP CHUNK 1: remote-avatar render pass. Each avatar renders
      // with the sender's character strips (preloaded on demand above);
      // render positions lerp toward net state so 12 Hz updates look smooth.
      // Camera stays local (centered on posRef).
      for (const avatar of remoteAvatarsRef.current.values()) {
        advanceRemoteRender(avatar, dt, PRESENCE_LERP_RATE);
        const remoteId = sanitizeCharacterId(avatar.characterId);
        ensureStrips(remoteId);
        const remoteStrips = avatar.moving ? walkStripsFor(remoteId) : idleStripsFor(remoteId);
        const remoteImg = imgs[remoteStrips[avatar.dir]];
        if (remoteImg === undefined || !remoteImg.complete || remoteImg.naturalWidth === 0) continue;
        const remoteFrameMs = avatar.moving ? WALK_FRAME_MS : IDLE_FRAME_MS;
        const rf = Math.floor(now / remoteFrameMs) % FRAME_COUNT;
        const centerX = width / 2 + (avatar.renderX - posRef.current.x) * scale;
        const centerY = height / 2 + (avatar.renderY - posRef.current.y) * scale;
        const rdx = Math.round((centerX - dw / 2) * pdpr) / pdpr;
        const rdy = Math.round((centerY - dh / 2) * pdpr) / pdpr;
        if (avatar.flip) {
          ctx.save();
          ctx.translate(2 * centerX, 0);
          ctx.scale(-1, 1);
        }
        ctx.drawImage(remoteImg, rf * FRAME_SIZE, 0, FRAME_SIZE, FRAME_SIZE, rdx, rdy, dw, dh);
        if (avatar.flip) ctx.restore();
      }
      const badge = remoteCountRef.current;
      if (badge !== null) {
        const n = String(remoteAvatarsRef.current.size);
        if (badge.textContent !== n) badge.textContent = n;
      }

      const stick = stickRef.current;
      if (stick !== null) {
        const q = (v: number) => Math.round(v * pdpr) / pdpr;
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

    rafId = requestAnimationFrame(drawFrame);

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerCancel);
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('storage', onMapChange);
      window.removeEventListener('focus', onMapChange);
    };
    // remoteAvatarsRef is a stable presence-hook ref: listed for
    // exhaustive-deps, never re-runs the loop.
  }, [remoteAvatarsRef]);

  return (
    <div ref={wrapperRef} className="h-dvh w-screen overflow-hidden bg-black">
      <canvas ref={canvasRef} data-testid="play-canvas" className="block touch-none select-none" style={{ imageRendering: 'pixelated' }} />
      <span data-testid="coop-status" style={COOP_BADGE_STYLE}>{coopMounted ? coopState.status : 'idle'}</span>
      <span data-testid="coop-role" style={COOP_BADGE_STYLE}>{coopMounted ? (coopState.role ?? '') : ''}</span>
      <span data-testid="coop-peer-count" style={COOP_BADGE_STYLE}>{coopMounted ? coopState.peers.length : 0}</span>
      <span data-testid="coop-remote-count" ref={remoteCountRef} style={COOP_BADGE_STYLE}>0</span>
      <span data-testid="player-character" style={COOP_BADGE_STYLE}>{characterBadge}</span>
    </div>
  );
}
