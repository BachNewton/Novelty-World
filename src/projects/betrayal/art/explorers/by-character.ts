import { CHARACTERS } from "../../data/characters";
import { pawn } from "../kit/pawn";
import type { PaletteKey } from "../palette";
import type { ExplorerBuilder } from "../stage";
import { longfellow } from "./longfellow";
import { ox } from "./ox";
import { zoe } from "./zoe";

/** The characters with a figure of their own, by character id. */
const FIGURES: Partial<Record<string, ExplorerBuilder>> = {
  "professor-longfellow": longfellow,
  "ox-bellows": ox,
  "zoe-ingstrom": zoe,
};

/** The pawn standing in for a character without a figure, one per colour, so
 *  the same character always gets the same builder and is never rebuilt. */
const pawns = new Map<PaletteKey, ExplorerBuilder>();

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
