"use client";

import { useEffect, useRef, type RefObject } from "react";
import { subscribeGamepads } from "@/shared/lib/gamepad";
import type { InputKind } from "../../input/controls";
import { enterLayer, padFocused, padPress, topLayer } from "./pad-focus";

/*
 * Setting up with the pads: any pad's d-pad moves the focus round the page's
 * buttons (the seats' characters and pads, the haunt, Start, Resume), A
 * presses the one focused and B closes what is open (the character grid).
 * A seat is taken by pressing its pad on its pad picker. Menu does nothing
 * here: Start is a button like any other.
 *
 * The focus shows the moment a pad is noticed: when the browser first shows
 * the page a pad, or on any press while the focus is hidden. A press that
 * only brings the focus into view does nothing else, so a player never acts
 * on a button they haven't seen picked.
 */

/** Wires every pad to the page under `root`, and reports each input used, so the pad's focus and prompts show while it was the last. */
export function useSetupPads(root: RefObject<HTMLElement | null>, input: InputKind, onInput: (kind: InputKind) => void): void {
  const last = useRef(input);
  useEffect(() => {
    last.current = input;
  });

  useEffect(() => {
    const reveal = () => {
      last.current = "pad";
      onInput("pad");
      const layer = root.current && topLayer(root.current);
      if (layer && !padFocused(layer)) enterLayer(layer);
    };
    // Coming back to setup from a game played on a pad, the focus shows at once.
    if (last.current === "pad") reveal();

    const pointer = (event: PointerEvent) => {
      onInput(event.pointerType === "touch" ? "touch" : "keyboard-mouse");
    };
    const key = () => {
      onInput("keyboard-mouse");
    };
    window.addEventListener("pointerdown", pointer);
    window.addEventListener("keydown", key);

    let pads = 0;
    let subscribing = true;
    // The press that made the browser show a pad arrives on the frame after;
    // the pad's arrival already brought the focus into view, so it is not also a press.
    let waking = false;
    const unsubscribe = subscribeGamepads({
      onConnectionChange: (connected) => {
        // Pads the page already knew of when setup opened arrived earlier, under whatever input was in use then.
        if (!subscribing && connected.length > pads) {
          waking = true;
          reveal();
        }
        pads = connected.length;
      },
      onButton: ({ name, pressed }) => {
        if (!pressed || name === null || waking) return;
        const layer = root.current && topLayer(root.current);
        if (!layer) return;
        if (last.current !== "pad" || !padFocused(layer)) {
          reveal();
          return;
        }
        padPress(layer, name);
      },
      onFrame: () => {
        waking = false;
      },
    });
    subscribing = false;
    return () => {
      window.removeEventListener("pointerdown", pointer);
      window.removeEventListener("keydown", key);
      unsubscribe();
    };
  }, [root, onInput]);
}
