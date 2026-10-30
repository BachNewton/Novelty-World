"use client";

import { useEffect, useRef } from "react";

// Sheet music, engraved by abcjs from ABC text.
export function SheetMusic({ abc }: { abc: string }) {
  const paper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const target = paper.current;
    if (target === null) return;
    let live = true;
    void import("abcjs").then(({ default: abcjs }) => {
      if (!live) return;
      abcjs.renderAbc(target, abc, {
        responsive: "resize",
        foregroundColor: getComputedStyle(target).color,
        paddingtop: 8,
        paddingbottom: 8,
        paddingleft: 4,
        paddingright: 4,
      });
    });
    return () => {
      live = false;
    };
  }, [abc]);

  return <div ref={paper} data-testid="sheet-music" className="rounded-lg bg-surface-secondary p-2 text-text-primary" />;
}
