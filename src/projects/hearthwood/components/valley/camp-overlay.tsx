"use client";

import { useCallback, useSyncExternalStore } from "react";
import { Hand } from "lucide-react";
import { Prompt, type Binding } from "@/shared/components/prompts";
import type { InputKind } from "@/shared/lib/input";
import { BedrollIcon, CampIcon } from "./camp-icons";
import { pitchCamp, subscribeCamping, type Camping } from "./camping";

/*
 * Camp over the scene: while it is carried, the bedroll at the top right,
 * under the frame meter (so Elliott knows camp is on their back, in either
 * view), and the
 * prompt to pitch it where the ghost stands on good ground (a button of its
 * own on touch). The keys and buttons that pitch are heard with everything
 * else Elliott can use (see `interactions.tsx`).
 */

const INTERACT: Binding = { pad: "X", key: "F", fills: false };

const INK = "text-(--color-hearthwood-valley-ui-ink)";
const PANEL = "rounded-2xl bg-(--color-hearthwood-valley-ui-shade)/60 backdrop-blur-sm";

export function CampOverlay({ camping, input }: { camping: Camping; input: InputKind }) {
  const subscribe = useCallback((listener: () => void) => subscribeCamping(camping, listener), [camping]);
  const { camp, offered } = useSyncExternalStore(subscribe, () => camping.shown);
  if (!camp.carried) return null;
  return (
    <>
      <div aria-label="Carrying camp" title="Carrying camp" className={`pointer-events-none absolute top-16 right-3 flex size-11 items-center justify-center ${PANEL}`}>
        <BedrollIcon className="size-8" />
      </div>
      {offered &&
        (input === "touch" ? (
          <button
            type="button"
            onClick={() => {
              pitchCamp(camping);
            }}
            aria-label="Pitch camp here"
            title="Pitch camp here"
            className={`absolute top-[60%] left-1/2 flex -translate-x-1/2 items-center gap-2 px-4 py-2.5 ${PANEL} ${INK}`}
          >
            <Hand aria-hidden className="size-6" />
            <CampIcon className="size-8" />
          </button>
        ) : (
          <div className="pointer-events-none absolute inset-x-0 top-[58%] flex justify-center">
            <div aria-label="Pitch camp here" title="Pitch camp here" className={`flex items-center gap-2 px-3 py-2 text-base ${PANEL} ${INK}`}>
              <Prompt binding={INTERACT} input={input} />
              <Hand aria-hidden className="size-6" />
              <CampIcon className="size-8" />
            </div>
          </div>
        ))}
    </>
  );
}
