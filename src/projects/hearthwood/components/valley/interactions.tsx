"use client";

import type { RefObject } from "react";
import { useInteractInput } from "../../input/interact";
import type { ValleyClock } from "./clock";
import { petAnimal, setCompanionsOpen, tapAnimal, treatAnimal, type Companionship } from "./companionship";
import { forageTime, pickSpot, setBasketOpen, type Foraging } from "./foraging";
import { openCooking, type Hearth } from "./hearth";
import { setJournalOpen, talkWith, type People } from "./people";

/*
 * Everything Elliott can use, heard in one place, so one press means one
 * thing: using what is offered picks the berry, pets the animal, sits
 * down at the fire to cook or talks with the person, whichever the scene
 * offered (only one is ever offered); a treat goes to the animal offered;
 * a tap on the scene picks what was tapped, or else pets (or treats) the
 * animal tapped, or else talks with the person tapped, or else cooks at
 * the fire tapped; the basket, the companions row and the journal open and
 * close. While the naming card is up, Elliott sits cooking at the fire or
 * talks with someone, that hears its own keys and buttons.
 */

export function Interactions({
  foraging,
  companionship,
  hearth,
  people,
  clock,
  surface,
}: {
  foraging: Foraging;
  companionship: Companionship;
  hearth: Hearth;
  people: People;
  clock: ValleyClock;
  surface: RefObject<HTMLElement | null>;
}) {
  // While the naming card is up, a turn at the fire is on, or a conversation, those hear their own keys and buttons.
  const busy = () => companionship.shown.naming !== null || hearth.shown.session !== null || people.shown.talking !== null;
  const reading = () => people.shown.journal;
  useInteractInput(surface, {
    onInteract: () => {
      if (busy() || reading()) return;
      if (foraging.target) {
        pickSpot(foraging, foraging.target, forageTime(clock));
        return;
      }
      if (hearth.shown.offered) {
        openCooking(hearth);
        return;
      }
      if (people.shown.offer) {
        talkWith(people, people.shown.offer.id);
        return;
      }
      const offer = companionship.shown.offer;
      if (offer?.canPet) petAnimal(companionship, offer.key);
    },
    onTreat: () => {
      const offer = companionship.shown.offer;
      if (!busy() && !reading() && offer?.treat) treatAnimal(companionship, offer.key);
    },
    onTap: ({ x, y }) => {
      if (busy() || reading()) return;
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
      const person = people.tapAt?.(x, y) ?? null;
      if (person !== null) {
        talkWith(people, person);
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
    onJournal: () => {
      if (!busy()) setJournalOpen(people, !people.shown.journal);
    },
  });
  return null;
}
