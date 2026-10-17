"use client";

import type { RefObject } from "react";
import { useInteractInput } from "../../input/interact";
import type { ValleyClock } from "./clock";
import { petAnimal, setCompanionsOpen, tapAnimal, treatAnimal, type Companionship } from "./companionship";
import { forageTime, pickSpot, setBasketOpen, type Foraging } from "./foraging";
import { openCooking, type Hearth } from "./hearth";

/*
 * Everything Elliott can use, heard in one place, so one press means one
 * thing: using what is offered picks the berry, pets the animal or sits
 * down at the fire to cook, whichever the scene offered (only one is ever
 * offered); a treat goes to the animal offered; a tap on the scene picks
 * what was tapped, or else pets (or treats) the animal tapped, or else
 * cooks at the fire tapped; the basket and the companions row open and
 * close. While the naming card is up, or Elliott sits cooking at the fire,
 * that hears its own keys and buttons.
 */

export function Interactions({ foraging, companionship, hearth, clock, surface }: { foraging: Foraging; companionship: Companionship; hearth: Hearth; clock: ValleyClock; surface: RefObject<HTMLElement | null> }) {
  // While the naming card is up, or a turn at the fire is on, those hear their own keys and buttons.
  const busy = () => companionship.shown.naming !== null || hearth.shown.session !== null;
  useInteractInput(surface, {
    onInteract: () => {
      if (busy()) return;
      if (foraging.target) {
        pickSpot(foraging, foraging.target, forageTime(clock));
        return;
      }
      if (hearth.shown.offered) {
        openCooking(hearth);
        return;
      }
      const offer = companionship.shown.offer;
      if (offer?.canPet) petAnimal(companionship, offer.key);
    },
    onTreat: () => {
      const offer = companionship.shown.offer;
      if (!busy() && offer?.treat) treatAnimal(companionship, offer.key);
    },
    onTap: ({ x, y }) => {
      if (busy()) return;
      const spot = foraging.tapAt?.(x, y) ?? null;
      if (spot) {
        pickSpot(foraging, spot, forageTime(clock));
        return;
      }
      const key = companionship.tapAt?.(x, y) ?? null;
      if (key !== null) {
        tapAnimal(companionship, key);
        return;
      }
      if (hearth.tapAt?.(x, y)) openCooking(hearth);
    },
    onBasket: () => {
      if (hearth.shown.session === null) setBasketOpen(foraging, !foraging.shown.open);
    },
    onCompanions: () => {
      if (hearth.shown.session === null) setCompanionsOpen(companionship, !companionship.shown.open);
    },
  });
  return null;
}
