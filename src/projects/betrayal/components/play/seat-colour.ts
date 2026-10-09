import type { PaletteKey } from "../../art/palette";
import type { Engine } from "../../engine/step-loop";
import type { CardColour } from "../../types";
import { CARD_BG, CARD_TEXT } from "../theme";

/** A seat's colour is its character card's: on the figure, from the art palette. */
const CARD_PALETTE: Record<CardColour, PaletteKey> = {
  white: "boneLight",
  red: "scarlet",
  yellow: "gold",
  green: "wraithLight",
  blue: "moonLight",
  purple: "violet",
};

function cardOf(engine: Engine, character: string): CardColour {
  if (!(character in engine.catalog.characters)) throw new Error(`No character "${character}"`);
  return engine.catalog.characters[character].card;
}

export const figureColour = (engine: Engine, character: string): PaletteKey => CARD_PALETTE[cardOf(engine, character)];

/** The class colouring a seat's dot on the page. */
export const seatDot = (engine: Engine, character: string): string => CARD_BG[cardOf(engine, character)];

/** The class colouring a seat's name on the page. */
export const seatText = (engine: Engine, character: string): string => CARD_TEXT[cardOf(engine, character)];
