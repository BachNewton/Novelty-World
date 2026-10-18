"use client";

import { useCallback, useSyncExternalStore } from "react";
import { Hand } from "lucide-react";
import { Prompt, type Binding } from "@/shared/components/prompts";
import type { InputKind } from "@/shared/lib/input";
import { pickUpOffered, subscribeFetching, throwHeld, type Fetching } from "./fetching";

/*
 * Fetch over the scene: the prompt to pick up the stick offered (a button
 * of its own on touch), and, while Elliott holds a stick, the throw's
 * prompt (G, the controller's left trigger, or a round button beside jump
 * on touch). The keys and buttons are heard with everything else Elliott
 * can use (see `interactions.tsx`).
 */

const INTERACT: Binding = { pad: "X", key: "F", fills: false };
const THROW: Binding = { pad: "LT", key: "G", fills: false };

const INK = "text-(--color-hearthwood-valley-ui-ink)";
const PANEL = "rounded-2xl bg-(--color-hearthwood-valley-ui-shade)/60 backdrop-blur-sm";

/** A forked stick, as the prompts draw it. */
export function StickIcon({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 19.5 20.5 5" strokeWidth={2.6} />
      <path d="M9.5 14.5 8.6 8.2" strokeWidth={1.8} />
      <path d="M15.5 9.4 18.6 11" strokeWidth={1.4} />
    </svg>
  );
}

/** A stick flying off along an arc, for throwing. */
function ThrowIcon({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 20c2.5-9 9-13.5 17-12" strokeWidth={1.6} strokeDasharray="1.5 2.6" />
      <path d="M15.5 4.5 21.5 10" strokeWidth={2.4} />
      <path d="M18.4 7.3 20.6 5.8" strokeWidth={1.5} />
    </svg>
  );
}

export function FetchOverlay({ fetching, input }: { fetching: Fetching; input: InputKind }) {
  const subscribe = useCallback((listener: () => void) => subscribeFetching(fetching, listener), [fetching]);
  const shown = useSyncExternalStore(subscribe, () => fetching.shown);
  const touch = input === "touch";
  return (
    <>
      {shown.offered &&
        (touch ? (
          <button
            type="button"
            onClick={() => {
              if (fetching.shown.offered) pickUpOffered(fetching);
            }}
            aria-label="Pick up the stick"
            title="Pick up the stick"
            className={`absolute top-[60%] left-1/2 flex -translate-x-1/2 items-center gap-2 px-4 py-2.5 ${PANEL} ${INK}`}
          >
            <Hand aria-hidden className="size-6" />
            <StickIcon className="size-8" />
          </button>
        ) : (
          <div className="pointer-events-none absolute inset-x-0 top-[58%] flex justify-center">
            <div aria-label="Pick up the stick" title="Pick up the stick" className={`flex items-center gap-2 px-3 py-2 text-base ${PANEL} ${INK}`}>
              <Prompt binding={INTERACT} input={input} />
              <Hand aria-hidden className="size-6" />
              <StickIcon className="size-8" />
            </div>
          </div>
        ))}
      {shown.holding &&
        (touch ? (
          <button
            type="button"
            aria-label="Throw the stick"
            title="Throw the stick"
            // On the press, as jump is: a throw is felt the moment the thumb lands.
            onPointerDown={(event) => {
              event.preventDefault();
              if (fetching.shown.holding && fetching.hand) throwHeld(fetching);
            }}
            className={`absolute right-[7rem] bottom-9 flex size-16 touch-none items-center justify-center rounded-full border-2 border-(--color-hearthwood-valley-ui-ink)/45 bg-(--color-hearthwood-valley-ui-shade)/45 backdrop-blur-sm ${INK}`}
          >
            <ThrowIcon className="size-9" />
          </button>
        ) : (
          <div className="pointer-events-none absolute inset-x-0 top-[78%] flex justify-center">
            <div aria-label="Throw the stick" title="Throw the stick" className={`flex items-center gap-2 px-3 py-2 text-base ${PANEL} ${INK}`}>
              <Prompt binding={THROW} input={input} />
              <ThrowIcon className="size-7" />
            </div>
          </div>
        ))}
    </>
  );
}
