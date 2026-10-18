"use client";

import type { RefObject } from "react";
import { useInteractInput } from "../../input/interact";
import type { ValleyClock } from "./clock";
import { petAnimal, setCompanionsOpen, tapAnimal, treatAnimal, type Companionship } from "./companionship";
import { pickUpOffered, pickUpStick, throwHeld, type Fetching } from "./fetching";
import { forageTime, pickSpot, setBasketOpen, type Foraging } from "./foraging";
import { pitchCamp } from "./camping";
import { openCooking, type Hearth } from "./hearth";
import { examineClue, setCasebookPage, type Mysteries } from "./mysteries";
import { setJournalOpen, talkWith, type People } from "./people";

/*
 * Everything Elliott can use, heard in one place, so one press means one
 * thing: using what is offered picks the berry, pets the animal, sits
 * down at the fire to cook or talks with the person, whichever the scene
 * offered (only one is ever offered); a treat goes to the animal offered;
 * a tap on the scene picks what was tapped, or else pets (or treats) the
 * animal tapped, or else talks with the person tapped, or else cooks at
 * the fire tapped; the basket, the companions row and the journal open and
 * close; a stick offered is picked up like anything else, a tap on one
 * picks it up, and the throw throws the stick in hand. While the naming card is up, Elliott sits cooking at the fire or
 * talks with someone, that hears its own keys and buttons. A clue offered
 * is examined like anything else, and K opens the journal on its casebook.
 * Carrying camp, using what is offered pitches it, when nothing else is.
 */

export function Interactions({
  foraging,
  companionship,
  hearth,
  people,
  fetching,
  mysteries,
  clock,
  surface,
}: {
  foraging: Foraging;
  companionship: Companionship;
  hearth: Hearth;
  people: People;
  fetching: Fetching;
  mysteries: Mysteries;
  clock: ValleyClock;
  surface: RefObject<HTMLElement | null>;
}) {
  // While the naming card is up, a turn at the fire is on, or a conversation, those hear their own keys and buttons.
  const busy = () => companionship.shown.naming !== null || hearth.shown.session !== null || people.shown.talking !== null || mysteries.shown.examining !== null;
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
      if (mysteries.shown.offer) {
        examineClue(mysteries, mysteries.shown.offer.key);
        return;
      }
      if (fetching.shown.offered) {
        pickUpOffered(fetching);
        return;
      }
      const offer = companionship.shown.offer;
      if (offer?.canPet) {
        petAnimal(companionship, offer.key);
        return;
      }
      // Pitching camp is offered only when nothing else is.
      if (hearth.camping.shown.offered) pitchCamp(hearth.camping);
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
      const stick = fetching.tapAt?.(x, y) ?? null;
      if (stick) {
        pickUpStick(fetching, stick);
        return;
      }
      const key = companionship.tapAt?.(x, y) ?? null;
      if (key !== null) {
        tapAnimal(companionship, key);
        return;
      }
      const clue = mysteries.tapAt?.(x, y) ?? null;
      if (clue !== null) {
        examineClue(mysteries, clue);
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
    onThrow: () => {
      if (!busy() && !reading() && fetching.shown.holding && fetching.hand) throwHeld(fetching);
    },
    onCasebook: () => {
      if (busy() || Object.keys(mysteries.shown.book.cases).length === 0) return;
      const open = !(people.shown.journal && mysteries.shown.casebook);
      setCasebookPage(mysteries, open);
      setJournalOpen(people, open);
    },
  });
  return null;
}
