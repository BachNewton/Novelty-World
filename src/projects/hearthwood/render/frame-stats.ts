"use client";

import { useEffect } from "react";
import Stats from "three/examples/jsm/libs/stats.module.js";

// The stats.js frame meter, always shown in the top right while the valley is
// open. Click it to cycle FPS / frame ms / memory. Its own animation frame
// loop is the feature: each frame's update is what it measures.
export function useFrameStats(): void {
  useEffect(() => {
    const stats = new Stats();
    Object.assign(stats.dom.style, { left: "auto", right: "0", top: "0", zIndex: "50" });
    document.body.appendChild(stats.dom);
    let raf = requestAnimationFrame(function tick() {
      stats.update();
      raf = requestAnimationFrame(tick);
    });
    return () => {
      cancelAnimationFrame(raf);
      stats.dom.remove();
    };
  }, []);
}
