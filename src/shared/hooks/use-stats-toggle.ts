"use client";

import { useEffect } from "react";
import type Stats from "three/examples/jsm/libs/stats.module.js";
import { isTextEntryTarget } from "@/shared/lib/utils";

// Toggles a stats.js frame meter with the ~ key (the physical key left of 1,
// whatever the layout). Click the meter to cycle FPS / frame ms / memory.
// It measures any page, not just WebGL ones: each animation frame calls
// `update()`, so the ms graph is the time between frames and a hitch is a
// spike. The library loads on first toggle, so the page pays nothing until then.
export function useStatsToggle(): void {
  useEffect(() => {
    let stats: Stats | null = null;
    let raf: number | null = null;
    let visible = false;

    const tick = (): void => {
      stats?.update();
      raf = requestAnimationFrame(tick);
    };

    const sync = (): void => {
      if (stats === null) return;
      if (visible && raf === null) {
        document.body.appendChild(stats.dom);
        raf = requestAnimationFrame(tick);
      } else if (!visible && raf !== null) {
        cancelAnimationFrame(raf);
        raf = null;
        stats.dom.remove();
      }
    };

    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.code !== "Backquote" || e.repeat) return;
      if (e.metaKey || e.ctrlKey || e.altKey || isTextEntryTarget(e.target)) return;
      e.preventDefault();
      visible = !visible;
      if (stats !== null) {
        sync();
        return;
      }
      void import("three/examples/jsm/libs/stats.module.js").then((m) => {
        stats ??= new m.default();
        sync();
      });
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      visible = false;
      sync();
    };
  }, []);
}
