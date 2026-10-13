import { CHARACTERS } from "../../data/characters";
import { pawn } from "../kit/pawn";
import type { PaletteKey } from "../palette";
import type { ExplorerBuilder } from "../stage";
import type { CardColour } from "../../types";
import { flash } from "./flash";
import { longfellow } from "./longfellow";
import { missy } from "./missy";
import { ox } from "./ox";
import { peter } from "./peter";
import { rhinehardt } from "./rhinehardt";
import { brandon } from "./brandon";
import { zoe } from "./zoe";

/** A seat's colour is its character card's: on the figure, from the art palette. */
export const CARD_PALETTE: Record<CardColour, PaletteKey> = {
  white: "boneLight",
  red: "scarlet",
  yellow: "gold",
  green: "wraithLight",
  blue: "moonLight",
  purple: "violet",
};

/** The characters with a figure of their own, by character id. */
const FIGURES: Partial<Record<string, ExplorerBuilder>> = {
  "professor-longfellow": longfellow,
  "ox-bellows": ox,
  "darrin-flash-williams": flash,
  "zoe-ingstrom": zoe,
  "missy-dubourde": missy,
  "peter-akimoto": peter,
  "brandon-jaspers": brandon,
  "father-rhinehardt": rhinehardt,
};

/** The pawn standing in for a character without a figure, one per colour, so
 *  the same character always gets the same builder and is never rebuilt. */
const pawns = new Map<PaletteKey, ExplorerBuilder>();

/** Whether a character has a figure of their own, rather than the pawn. */
export function hasFigure(character: string): boolean {
  return FIGURES[character] !== undefined;
}

/** The figure a character is shown as: their own, or the scale pawn in their seat's colour. */
export function figureFor(character: string, seatColour: PaletteKey): ExplorerBuilder {
  if (!CHARACTERS.some((candidate) => candidate.id === character)) throw new Error(`No character "${character}"`);
  const own = FIGURES[character];
  if (own) return own;
  const known = pawns.get(seatColour);
  if (known) return known;
  const build: ExplorerBuilder = () => pawn({ colour: seatColour });
  pawns.set(seatColour, build);
  return build;
}
