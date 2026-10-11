"use client";

import { useEffect, useState, type RefObject } from "react";
import { subscribeGamepads } from "@/shared/lib/gamepad";
import { padPress, topLayer } from "./pad-focus";

/*
 * Setting up with the pads: any pad's d-pad moves the focus round the page's
 * buttons (the seats' characters and pads, the haunt, Start, Resume), A
 * presses the one focused and B closes what is open (the character grid).
 * A seat is taken by pressing its pad on its pad picker. Menu does nothing
 * here: Start is a button like any other. Names keep their defaults on a pad.
 */

/** Wires every pad to the page under `root`, and says whether a pad was the last input, so its focus shows. */
export function useSetupPads(root: RefObject<HTMLElement | null>): boolean {
  const [active, setActive] = useState(false);
  useEffect(() => {
    const other = () => {
      setActive(false);
    };
    window.addEventListener("pointerdown", other);
    window.addEventListener("keydown", other);
    const unsubscribe = subscribeGamepads({
      onButton: ({ name, pressed }) => {
        if (!pressed || name === null) return;
        setActive(true);
        const layer = root.current && topLayer(root.current);
        if (layer) padPress(layer, name);
      },
    });
    return () => {
      window.removeEventListener("pointerdown", other);
      window.removeEventListener("keydown", other);
      unsubscribe();
    };
  }, [root]);
  return active;
}
