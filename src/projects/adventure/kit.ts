import { FANTASY_TOWN_PIECES, pieceUrl, type TownPiece } from "./fantasy-town";
import { NATURE_KIT_PIECES, naturePieceUrl, type NaturePiece } from "./nature-kit";

/** A piece from any of the kits the world is built from: their names never clash, so a name says which kit it is. */
export type KitPiece = TownPiece | NaturePiece;

const NATURE: ReadonlySet<string> = new Set(NATURE_KIT_PIECES);
const EVERY: ReadonlySet<string> = new Set([...FANTASY_TOWN_PIECES, ...NATURE_KIT_PIECES]);

/** Whether a name is a piece of one of the kits: a name read from a file is only text until it is. */
export function isKitPiece(name: string): name is KitPiece {
  return EVERY.has(name);
}

export function isNaturePiece(piece: KitPiece): piece is NaturePiece {
  return NATURE.has(piece);
}

export function kitPieceUrl(piece: KitPiece): string {
  return isNaturePiece(piece) ? naturePieceUrl(piece) : pieceUrl(piece);
}

/** Every kit's pieces, for the bench. */
export const KITS = { town: FANTASY_TOWN_PIECES, nature: NATURE_KIT_PIECES } as const;
export type Kit = keyof typeof KITS;
