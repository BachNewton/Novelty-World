"use client";

import { useEffect, useRef } from "react";
import { subscribeGamepads, type PadSnapshot } from "@/shared/lib/gamepad";
import { padDevice, type InputSink } from "./devices";
import { PAD_AT_REST, padArrival, padStep, type PadHold } from "./gamepad";

// Every connected controller as an input source, each its own device. The
// gamepad library reads the pads once per animation frame, as the game loop
// does; each frame's snapshot becomes inputs through `padStep`. A pad that
// disconnects lets go of whatever it held. While `enabled` is off (a menu
// over the game has the pads) every pad lets go, and on again each starts
// from what it holds then (`padArrival`), so the press that closed the menu
// isn't also a hop.
export function useGamepadSource(sink: InputSink, enabled = true): void {
  const sinkRef = useRef(sink);
  useEffect(() => {
    sinkRef.current = sink;
  }, [sink]);

  useEffect(() => {
    if (!enabled) return;
    const holds = new Map<number, PadHold>();
    const read = (pads: readonly PadSnapshot[]): void => {
      const seen = new Set(pads.map((pad) => pad.index));
      const gone = [...holds.keys()].filter((index) => !seen.has(index));
      const frame: [number, PadSnapshot | null][] = [...pads.map((pad) => [pad.index, pad] as [number, PadSnapshot]), ...gone.map((index) => [index, null] as [number, null])];
      for (const [index, pad] of frame) {
        const prev = holds.get(index) ?? (pad === null ? PAD_AT_REST : padArrival(pad));
        const step = padStep(prev, pad);
        if (pad === null) holds.delete(index);
        else holds.set(index, step.hold);
        for (const input of step.inputs) sinkRef.current.input(padDevice(index), input);
        if (step.restart) sinkRef.current.restart();
      }
    };
    const unsubscribe = subscribeGamepads({
      onFrame: (pads, changed) => {
        if (changed) read(pads);
      },
      onConnectionChange: read,
    });
    // Leaving the game, or a menu taking the pads, lets go of every pad's held keys.
    return () => {
      unsubscribe();
      read([]);
    };
  }, [enabled]);
}
