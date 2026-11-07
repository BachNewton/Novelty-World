import { create } from "zustand";
import { getProjectStorage } from "@/shared/lib/storage";

/*
 * The player's graphics settings, kept in this browser like the sound's.
 *
 * Render scale is the share of the screen's physical pixels the 3D world is
 * drawn at, each way: 100% is one rendered pixel per device pixel, the full
 * devicePixelRatio. It is the player's choice and only theirs. The game never
 * lowers it for them, by default, by device or on the fly: performance comes
 * from making the rendering cheaper, never from quietly drawing fewer pixels.
 */

export const RENDER_SCALES = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1] as const;
export type RenderScale = (typeof RENDER_SCALES)[number];

export interface GraphicsSettings {
  renderScale: RenderScale;
}

export const DEFAULT_GRAPHICS: GraphicsSettings = { renderScale: 1 };

const PROJECT = "aland-drive";
const KEY = "graphics";

const isRenderScale = (value: unknown): value is RenderScale => RENDER_SCALES.includes(value as RenderScale);

function load(): GraphicsSettings {
  const saved = getProjectStorage(PROJECT).get<unknown>(KEY);
  if (typeof saved !== "object" || saved === null) return DEFAULT_GRAPHICS;
  const { renderScale } = saved as Record<string, unknown>;
  return isRenderScale(renderScale) ? { renderScale } : DEFAULT_GRAPHICS;
}

function save(settings: GraphicsSettings): void {
  // Storage can refuse a write (a private window, a full quota, blocked site
  // data). The setting still holds for this visit; it just isn't remembered.
  try {
    getProjectStorage(PROJECT).set(KEY, settings);
  } catch {
    return;
  }
}

interface GraphicsStore {
  settings: GraphicsSettings;
  /** Moves the render scale by whole steps, held to the ends. */
  stepRenderScale: (steps: number) => void;
}

export const useDriveGraphics = create<GraphicsStore>()((set) => ({
  settings: typeof window === "undefined" ? DEFAULT_GRAPHICS : load(),
  stepRenderScale: (steps) =>
    set(({ settings }) => {
      const at = RENDER_SCALES.indexOf(settings.renderScale) + steps;
      const next = { ...settings, renderScale: RENDER_SCALES[Math.min(Math.max(at, 0), RENDER_SCALES.length - 1)] };
      save(next);
      return { settings: next };
    }),
}));

/** The pixel ratio a renderer draws at: the screen's own, times the player's render scale. */
export const pixelRatio = () => window.devicePixelRatio * useDriveGraphics.getState().settings.renderScale;
