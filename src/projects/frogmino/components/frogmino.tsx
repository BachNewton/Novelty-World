"use client";

import dynamic from "next/dynamic";

// The scene reads its colours from the live stylesheet, so it only renders in
// the browser.
const FrogminoScene = dynamic(() => import("./scene").then((m) => m.FrogminoScene), {
  ssr: false,
});

export function Frogmino() {
  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-surface-primary">
      <div className="absolute inset-0">
        <FrogminoScene />
      </div>
      <h1 className="pointer-events-none absolute left-4 top-4 text-xl font-bold text-brand-green">
        Frogmino
      </h1>
    </div>
  );
}
