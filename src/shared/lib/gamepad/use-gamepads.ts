"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { subscribeGamepads } from "./gamepads";
import { readPad, type ButtonEdge, type PadReading, type PadSnapshot, type ReadOptions } from "./state";

export interface UseGamepadsOptions extends ReadOptions {
  onButton?: (edge: ButtonEdge) => void;
}

/** Every connected pad, read with the given options, re-rendering whenever a
 *  button or stick moves. For UI that shows the pads; a game loop should
 *  `subscribeGamepads` and read the pads in its own frame instead. */
export function useGamepads({ deadzone, onButton }: UseGamepadsOptions = {}): PadReading[] {
  const [snapshots, setSnapshots] = useState<readonly PadSnapshot[]>([]);
  const onButtonRef = useRef(onButton);

  useEffect(() => {
    onButtonRef.current = onButton;
  }, [onButton]);

  useEffect(
    () =>
      subscribeGamepads({
        onConnectionChange: setSnapshots,
        onFrame(pads, changed) {
          if (changed) setSnapshots(pads);
        },
        onButton: (edge) => onButtonRef.current?.(edge),
      }),
    [],
  );

  return useMemo(() => snapshots.map((s) => readPad(s, { deadzone })), [snapshots, deadzone]);
}
