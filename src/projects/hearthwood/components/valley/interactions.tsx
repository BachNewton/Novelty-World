"use client";

import type { RefObject } from "react";
import { useInteractInput } from "../../input/interact";
import type { ValleyClock } from "./clock";
import { petAnimal, setCompanionsOpen, tapAnimal, treatAnimal, type Companionship } from "./companionship";
import { forageTime, pickSpot, setBasketOpen, type Foraging } from "./foraging";

/*
 * Everything Elliott can use, heard in one place, so one press means one
 * thing: using what is offered picks the berry or pets the animal, whichever
 * the scene offered (they are never both offered); a treat goes to the
 * animal offered; a tap on the scene picks what was tapped, or else pets (or
 * treats) the animal tapped; the basket and the companions row open and
 * close. While the naming card is up, it hears its own keys and buttons.
 */

export function Interactions({ foraging, companionship, clock, surface }: { foraging: Foraging; companionship: Companionship; clock: ValleyClock; surface: RefObject<HTMLElement | null> }) {
  useInteractInput(surface, {
    onInteract: () => {
      // While the naming card is up, the card hears its own keys and buttons.
      if (companionship.shown.naming) return;
      if (foraging.target) {
        pickSpot(foraging, foraging.target, forageTime(clock));
        return;
      }
      const offer = companionship.shown.offer;
      if (offer?.canPet) petAnimal(companionship, offer.key);
    },
    onTreat: () => {
      const offer = companionship.shown.offer;
      if (companionship.shown.naming === null && offer?.treat) treatAnimal(companionship, offer.key);
    },
    onTap: ({ x, y }) => {
      if (companionship.shown.naming) return;
      const spot = foraging.tapAt?.(x, y) ?? null;
      if (spot) {
        pickSpot(foraging, spot, forageTime(clock));
        return;
      }
      const key = companionship.tapAt?.(x, y) ?? null;
      if (key !== null) tapAnimal(companionship, key);
    },
    onBasket: () => {
      setBasketOpen(foraging, !foraging.shown.open);
    },
    onCompanions: () => {
      setCompanionsOpen(companionship, !companionship.shown.open);
    },
  });
  return null;
}
