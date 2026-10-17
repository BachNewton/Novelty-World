"use client";

import { useCallback, useEffect, useState, useSyncExternalStore, type RefObject } from "react";
import { Hand, ShoppingBasket } from "lucide-react";
import { Prompt, type Binding } from "@/shared/components/prompts";
import type { InputKind } from "@/shared/lib/input";
import { FORAGE_KINDS } from "../../engine/regions";
import { basketTotal } from "../../gameplay/basket";
import { useInteractInput } from "../../input/interact";
import type { ValleyClock } from "./clock";
import { FORAGE_NAMES, ForageIcon } from "./forage-icons";
import { forageDay, pickSpot, setBasketOpen, subscribeForaging, type Foraging } from "./foraging";

/*
 * Foraging over the scene: the prompt to pick what Elliott is looking at (a
 * button of its own on touch), and the basket, a row of what has been
 * picked and how many, which shows for a while after each pick and whenever
 * it is opened (Tab, the controller's Y, or its button on touch).
 */

const INTERACT: Binding = { pad: "X", key: "F", fills: false };
const BASKET: Binding = { pad: "Y", key: "Tab", fills: false };

/** How long the basket stays up after a pick, in ms. */
const SHOWN_AFTER_PICK = 3500;

const INK = "text-(--color-hearthwood-valley-ui-ink)";
const PANEL = "rounded-2xl bg-(--color-hearthwood-valley-ui-shade)/60 backdrop-blur-sm";

export function ForageOverlay({ foraging, clock, surface, input }: { foraging: Foraging; clock: ValleyClock; surface: RefObject<HTMLElement | null>; input: InputKind }) {
  const subscribe = useCallback((listener: () => void) => subscribeForaging(foraging, listener), [foraging]);
  const shown = useSyncExternalStore(subscribe, () => foraging.shown);
  // The picks the basket has finished showing; it lingers while there are newer ones.
  const [shownPicks, setShownPicks] = useState(0);
  const lingering = shown.picks > shownPicks;

  const pickOffered = () => {
    if (foraging.target) pickSpot(foraging, foraging.target, forageDay(foraging, clock));
  };
  useInteractInput(surface, {
    onInteract: pickOffered,
    onTap: ({ x, y }) => {
      const spot = foraging.tapAt?.(x, y) ?? null;
      if (spot) pickSpot(foraging, spot, forageDay(foraging, clock));
    },
    onBasket: () => {
      setBasketOpen(foraging, !foraging.shown.open);
    },
  });

  useEffect(() => {
    if (!lingering) return;
    // How long the basket lingers after a pick is the feature itself.
    const picks = shown.picks;
    const hide = window.setTimeout(() => {
      setShownPicks(picks);
    }, SHOWN_AFTER_PICK);
    return () => {
      window.clearTimeout(hide);
    };
  }, [lingering, shown.picks]);

  const kinds = FORAGE_KINDS.filter((k) => shown.basket[k] > 0);
  return (
    <>
      {(shown.open || lingering) && (
        <div
          aria-label={`Basket: ${basketTotal(shown.basket)} picked`}
          className={`pointer-events-none absolute top-3 left-1/2 flex max-w-[calc(100%-7.5rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-x-3 gap-y-1 px-3 py-2 ${PANEL} ${INK}`}
        >
          <ShoppingBasket aria-hidden className="size-6 text-(--color-hearthwood-forage-basket)" />
          {kinds.map((kind) => (
            <span key={kind} className="flex items-center gap-0.5 text-base font-semibold tabular-nums" title={FORAGE_NAMES[kind]}>
              <span key={kind === shown.lastPicked ? shown.picks : 0} className={kind === shown.lastPicked ? "inline-flex animate-[hearthwood-forage-pop_500ms_ease-out]" : "inline-flex"}>
                <ForageIcon kind={kind} />
              </span>
              {shown.basket[kind]}
            </span>
          ))}
          {shown.open && input !== "touch" && <Prompt binding={BASKET} input={input} className="opacity-70" />}
        </div>
      )}
      {shown.offered &&
        (input === "touch" ? (
          <button
            type="button"
            onClick={pickOffered}
            aria-label={`Pick: ${FORAGE_NAMES[shown.offered]}`}
            title={`Pick: ${FORAGE_NAMES[shown.offered]}`}
            className={`absolute top-[60%] left-1/2 flex -translate-x-1/2 items-center gap-2 px-4 py-2.5 ${PANEL} ${INK}`}
          >
            <Hand aria-hidden className="size-6" />
            <ForageIcon kind={shown.offered} className="size-8" />
          </button>
        ) : (
          <div className="pointer-events-none absolute inset-x-0 top-[58%] flex justify-center">
            <div aria-label={`Pick: ${FORAGE_NAMES[shown.offered]}`} title={`Pick: ${FORAGE_NAMES[shown.offered]}`} className={`flex items-center gap-2 px-3 py-2 text-base ${PANEL} ${INK}`}>
              <Prompt binding={INTERACT} input={input} />
              <Hand aria-hidden className="size-6" />
              <ForageIcon kind={shown.offered} className="size-8" />
            </div>
          </div>
        ))}
      {input === "touch" && (
        <button
          type="button"
          aria-label="Basket"
          title="Basket"
          aria-pressed={shown.open}
          onClick={() => {
            setBasketOpen(foraging, !shown.open);
          }}
          className={`absolute top-3 left-16 flex size-11 items-center justify-center ${PANEL} ${INK}`}
        >
          <ShoppingBasket aria-hidden className="size-6" />
        </button>
      )}
    </>
  );
}
