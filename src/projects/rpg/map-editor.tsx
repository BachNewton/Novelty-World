"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CELL_PX } from "./tiles";
import { MAP_COLS, MAP_ROWS } from "./world-map";
import { AVATAR_FRAME_PX, drawAvatar, drawTile } from "./draw";
import { advanceRemoteRender, type CoopSession } from "./coop/session";
import {
  EYEDROPPER_CURSOR,
  cellFromPoint,
  isAltModifierCode,
  resolveEyedropperActive,
  resolveMouseDownIntent,
  resolveMouseMoveIntent,
} from "./editor-logic";
import { useTileSelection, type SelectedTile } from "./tile-selection";
import { TilePalette } from "./tile-palette";
import { SelectedTileSummary } from "./tile-preview";

export function MapEditor({ session }: { session: CoopSession }) {
  const selection = useTileSelection();
  const { selected, pick } = selection;

  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const selectedRef = useRef<SelectedTile | null>(selected);
  /** Hovered map cell for the 1-cell highlight, written by mouse handlers and
   * read by the rAF loop (ref, not state: hover must never re-render). */
  const hoverRef = useRef<{ c: number; r: number } | null>(null);
  /** Alt-held eyedropper indicator state; drives the canvas cursor only. */
  const [altHeld, setAltHeld] = useState(false);
  const scaleRef = useRef(1);
  const sizeRef = useRef({ width: 1, height: 1 });
  const offsetRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  // Alt hygiene: the eyedropper cursor follows the physical Alt keys only
  // (`code`-based; AltGr reports Ctrl+Alt and must not trigger it). Alt
  // keydown is swallowed so the browser never focuses the menu bar, and blur
  // clears a stuck Alt when the key is released outside the window.
  useEffect(() => {
    const syncAlt = (e: KeyboardEvent) => {
      setAltHeld(
        resolveEyedropperActive({
          alt: e.getModifierState("Alt"),
          ctrl: e.getModifierState("Control") || e.ctrlKey,
          meta: e.getModifierState("Meta") || e.metaKey,
          altGraph: e.getModifierState("AltGraph"),
        }),
      );
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (!isAltModifierCode(e.code)) return;
      e.preventDefault();
      syncAlt(e);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (isAltModifierCode(e.code)) syncAlt(e);
    };
    const onBlur = () => setAltHeld(false);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (canvas === null || wrapper === null) return;

    const ctx = canvas.getContext("2d");
    if (ctx === null) return;

    const resize = () => {
      const rect = wrapper.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const cssWidth = Math.max(1, Math.floor(rect.width));
      const cssHeight = Math.max(1, Math.floor(rect.height));
      sizeRef.current = { width: cssWidth, height: cssHeight };
      const scale = Math.max(
        0.25,
        Math.min(
          cssWidth / (MAP_COLS * CELL_PX),
          cssHeight / (MAP_ROWS * CELL_PX),
        ),
      );
      scaleRef.current = scale;
      offsetRef.current = {
        x: Math.max(0, Math.floor((cssWidth - MAP_COLS * CELL_PX * scale) / 2)),
        y: Math.max(0, Math.floor((cssHeight - MAP_ROWS * CELL_PX * scale) / 2)),
      };
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
    window.addEventListener("resize", resize);

    let rafId = 0;
    let lastTime: number | null = null;
    const drawFrame = (now: number) => {
      rafId = requestAnimationFrame(drawFrame);
      const dt = lastTime === null ? 0 : Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      const { width, height } = sizeRef.current;
      const scale = scaleRef.current;
      const { x: offsetX, y: offsetY } = offsetRef.current;
      const mapWidth = MAP_COLS * CELL_PX * scale;
      const mapHeight = MAP_ROWS * CELL_PX * scale;

      ctx.fillStyle = "#0a0a0a";
      ctx.fillRect(0, 0, width, height);

      const grid = session.map.grid();
      const cellSize = CELL_PX * scale;
      for (let r = 0; r < MAP_ROWS; r += 1) {
        for (let c = 0; c < MAP_COLS; c += 1) {
          const tile = grid[r][c];
          if (tile !== null) {
            drawTile(ctx, tile, c, r, offsetX + c * cellSize, offsetY + r * cellSize, cellSize, now);
          }
        }
      }

      ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let c = 0; c <= MAP_COLS; c += 1) {
        const x = offsetX + c * CELL_PX * scale + 0.5;
        ctx.moveTo(x, offsetY);
        ctx.lineTo(x, offsetY + mapHeight);
      }
      for (let r = 0; r <= MAP_ROWS; r += 1) {
        const y = offsetY + r * CELL_PX * scale + 0.5;
        ctx.moveTo(offsetX, y);
        ctx.lineTo(offsetX + mapWidth, y);
      }
      ctx.stroke();

      // Hover highlight: a subtle 1-cell border tracking the mouse, drawn
      // from the handler-written ref so it works in every mode (paint, erase,
      // pick) without touching hit-testing or persistence.
      const hover = hoverRef.current;
      if (hover !== null) {
        ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
        ctx.lineWidth = 2;
        ctx.strokeRect(
          offsetX + hover.c * CELL_PX * scale + 0.5,
          offsetY + hover.r * CELL_PX * scale + 0.5,
          CELL_PX * scale - 1,
          CELL_PX * scale - 1,
        );
      }

      // Every player's avatar, ours included, at its world position.
      const avatarSize = AVATAR_FRAME_PX * scale;
      const local = session.localAvatar();
      drawAvatar(ctx, local, offsetX + local.x * scale, offsetY + local.y * scale, avatarSize, now);
      for (const avatar of session.remotes.values()) {
        advanceRemoteRender(avatar, dt);
        drawAvatar(ctx, avatar, offsetX + avatar.renderX * scale, offsetY + avatar.renderY * scale, avatarSize, now);
      }
    };

    rafId = requestAnimationFrame(drawFrame);

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, [session]);

  const cellFromEvent = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (canvas === null) return null;
    const rect = canvas.getBoundingClientRect();
    const size = sizeRef.current;
    const scale = scaleRef.current;
    const { x: offsetX, y: offsetY } = offsetRef.current;
    const scaleX = size.width <= 0 ? 1 : rect.width / size.width;
    const scaleY = size.height <= 0 ? 1 : rect.height / size.height;
    const x = (e.clientX - rect.left) / scaleX;
    const y = (e.clientY - rect.top) / scaleY;
    return cellFromPoint(x, y, scale, offsetX, offsetY);
  }, []);

  const paintAt = useCallback(
    (c: number, r: number, erase: boolean) => {
      const sel = selectedRef.current;
      if (erase) {
        session.paint([{ c, r, tile: null }]);
      } else if (sel !== null) {
        session.paint([{ c, r, tile: { src: sel.src, sx: sel.sx, sy: sel.sy } }]);
      }
    },
    [session],
  );

  const syncAltFromMouse = useCallback((e: React.MouseEvent) => {
    const eyedropper = resolveEyedropperActive({
      alt: e.altKey,
      ctrl: e.ctrlKey,
      meta: e.metaKey,
      altGraph: e.getModifierState("AltGraph"),
    });
    setAltHeld((prev) => (prev === eyedropper ? prev : eyedropper));
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      hoverRef.current = cellFromEvent(e);
      // Covers Alt pressed before the window focused (no keydown seen).
      syncAltFromMouse(e);
      const intent = resolveMouseDownIntent(e.button, e.altKey);
      if (intent === "ignore") return;
      const cell = cellFromEvent(e);
      if (cell === null) return;
      if (intent === "pick") {
        // Alt+click can steal menu focus or start a drag in some
        // browsers — swallow it so picking never paints.
        e.preventDefault();
        pick(session.map.grid()[cell.r][cell.c]);
        return;
      }
      paintAt(cell.c, cell.r, intent === "erase");
    },
    [cellFromEvent, syncAltFromMouse, paintAt, pick, session],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      // Hover tracks on every move — including button-free moves — so the
      // highlight works in all modes and never gates painting.
      hoverRef.current = cellFromEvent(e);
      syncAltFromMouse(e);
      const intent = resolveMouseMoveIntent(e.buttons, e.altKey);
      if (intent === "none") return;
      const cell = cellFromEvent(e);
      if (cell === null) return;
      if (intent === "pick") {
        // Alt+drag would otherwise select text or start a native drag.
        e.preventDefault();
        pick(session.map.grid()[cell.r][cell.c]);
        return;
      }
      paintAt(cell.c, cell.r, intent === "erase");
    },
    [cellFromEvent, syncAltFromMouse, paintAt, pick, session],
  );

  const handleMouseLeave = useCallback(() => {
    hoverRef.current = null;
  }, []);

  const handleClear = useCallback(() => {
    session.clear();
  }, [session]);

  return (
    <div className="flex min-h-dvh flex-col bg-surface-primary text-text-primary">
      <header className="flex flex-wrap items-center gap-3 border-b border-border-default px-4 py-3">
        <h1 className="text-xl font-bold">Tile Map Editor</h1>
        <span className="text-sm text-text-muted">
          {MAP_COLS}×{MAP_ROWS} cells · left-click paints · Alt+click picks · right-click erases
        </span>
        <div className="ml-auto flex items-center gap-2">
          <SelectedTileSummary selected={selected} />
          <button
            type="button"
            onClick={handleClear}
            className="rounded-md border border-border-default bg-surface-tertiary px-3 py-1.5 text-sm hover:border-border-hover"
          >
            Clear All
          </button>
        </div>
      </header>
      <div className="flex flex-1 flex-col gap-4 p-4 lg:flex-row">
        <div
          ref={wrapperRef}
          className="relative flex min-h-[50dvh] min-w-0 flex-1 items-center justify-center overflow-hidden rounded-lg border border-border-default bg-surface-secondary"
        >
          <canvas
            ref={canvasRef}
            data-testid="map-canvas"
            data-alt-held={altHeld ? "true" : "false"}
            className="absolute inset-0 block"
            style={{
              imageRendering: "pixelated",
              cursor: altHeld ? EYEDROPPER_CURSOR : "crosshair",
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            onContextMenu={(e) => e.preventDefault()}
          />
        </div>
        <TilePalette selection={selection} />
      </div>
    </div>
  );
}
