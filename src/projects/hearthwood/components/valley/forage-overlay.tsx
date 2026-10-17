"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Hand, ShoppingBasket } from "lucide-react";
import { Prompt, type Binding } from "@/shared/components/prompts";
import type { InputKind } from "@/shared/lib/input";
import { FORAGE_KINDS } from "../../engine/regions";
import { basketTotal } from "../../gameplay/basket";
import { dishCount, dishesIn } from "../../gameplay/cooking";
import type { ValleyClock } from "./clock";
import { DishIcon, dishName } from "./cooking-icons";
import { FORAGE_NAMES, ForageIcon } from "./forage-icons";
import { forageTime, pickSpot, setBasketOpen, subscribeForaging, type Foraging } from "./foraging";
import { subscribeHearth, type Hearth } from "./hearth";

/*
 * Foraging over the scene: the prompt to pick what Elliott is looking at (a
 * button of its own on touch), and the basket, a row of what has been
 * picked and how many, and the dishes cooked at the fire after them, which
 * shows for a while after each pick or dish and whenever it is opened (Tab, the controller's Y, or its button on touch). The keys,
 * buttons and taps that pick are heard with everything else Elliott can use
 * (see `interactions.tsx`).
 */

const INTERACT: Binding = { pad: "X", key: "F", fills: false };
const BASKET: Binding = { pad: "Y", key: "Tab", fills: false };

/** How long the basket stays up after a pick, in ms. */
const SHOWN_AFTER_PICK = 3500;

const INK = "text-(--color-hearthwood-valley-ui-ink)";
const PANEL = "rounded-2xl bg-(--color-hearthwood-valley-ui-shade)/60 backdrop-blur-sm";

export function ForageOverlay({ foraging, hearth, clock, input }: { foraging: Foraging; hearth: Hearth; clock: ValleyClock; input: InputKind }) {
  const subscribe = useCallback((listener: () => void) => subscribeForaging(foraging, listener), [foraging]);
  const shown = useSyncExternalStore(subscribe, () => foraging.shown);
  const subscribeDishes = useCallback((listener: () => void) => subscribeHearth(hearth, listener), [hearth]);
  const { larder, served, lastServed } = useSyncExternalStore(subscribeDishes, () => hearth.shown);
  // The picks and dishes the basket has finished showing; it lingers while there are newer ones.
  const [shownPicks, setShownPicks] = useState(0);
  const arrivals = shown.picks + served;
  const lingering = arrivals > shownPicks;

  const pickOffered = () => {
    if (foraging.target) pickSpot(foraging, foraging.target, forageTime(clock));
  };
  useEffect(() => {
    if (!lingering) return;
    // How long the basket lingers after a pick is the feature itself.
    const hide = window.setTimeout(() => {
      setShownPicks(arrivals);
    }, SHOWN_AFTER_PICK);
    return () => {
      window.clearTimeout(hide);
    };
  }, [lingering, arrivals]);

  const kinds = FORAGE_KINDS.filter((k) => shown.basket[k] > 0);
  const dishes = dishesIn(larder);
  return (
    <>
      {(shown.open || lingering) && (
        <div
          aria-label={`Basket: ${basketTotal(shown.basket)} picked, ${dishes.length} kinds of dish`}
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
          {dishes.map((dish) => (
            <span key={dish} className="flex items-center gap-0.5 text-base font-semibold tabular-nums" title={dishName(dish)}>
              <span key={dish === lastServed ? served : 0} className={dish === lastServed ? "inline-flex animate-[hearthwood-forage-pop_500ms_ease-out]" : "inline-flex"}>
                <DishIcon dish={dish} className="size-8" />
              </span>
              {dishCount(larder, dish)}
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
