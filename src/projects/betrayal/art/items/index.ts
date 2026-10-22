import type { FigureParts } from "../figure-parts";
import { ADRENALINE_SHOT } from "./adrenaline-shot";
import { AXE } from "./axe";
import { BLOOD_DAGGER } from "./blood-dagger";
import { BOTTLE_MODEL } from "./bottle";
import { CANDLE_MODEL } from "./candle";
import { DARK_DICE } from "./dark-dice";
import { DYNAMITE } from "./dynamite";
import { HEALING_SALVE } from "./healing-salve";
import type { ItemModel } from "./item";
import { LUCKY_STONE } from "./lucky-stone";
import { MEDICAL_KIT } from "./medical-kit";
import { MUSIC_BOX } from "./music-box";
import { PUZZLE_BOX } from "./puzzle-box";
import { RABBITS_FOOT } from "./rabbits-foot";
import { REVOLVER } from "./revolver";
import { SACRIFICIAL_DAGGER } from "./sacrificial-dagger";
import { SMELLING_SALTS } from "./smelling-salts";
import { SPEAR } from "./spear";

/*
 * Every item and omen card with a model, by the card's id as the engine
 * names it: one file per card in this folder, one line here. A card without
 * one shows its type's stand-in on the floor (`things/looks.ts`).
 */
export const ITEM_MODELS = {
  "adrenaline-shot": ADRENALINE_SHOT,
  axe: AXE,
  "blood-dagger": BLOOD_DAGGER,
  bottle: BOTTLE_MODEL,
  candle: CANDLE_MODEL,
  "dark-dice": DARK_DICE,
  dynamite: DYNAMITE,
  "healing-salve": HEALING_SALVE,
  "lucky-stone": LUCKY_STONE,
  "medical-kit": MEDICAL_KIT,
  "music-box": MUSIC_BOX,
  "puzzle-box": PUZZLE_BOX,
  "rabbits-foot": RABBITS_FOOT,
  revolver: REVOLVER,
  "sacrificial-dagger": SACRIFICIAL_DAGGER,
  "smelling-salts": SMELLING_SALTS,
  spear: SPEAR,
} as const satisfies Readonly<Record<string, ItemModel>>;

export type ItemId = keyof typeof ITEM_MODELS;

export const ITEM_IDS = Object.keys(ITEM_MODELS) as ItemId[];

/** A card's model, if it has one. */
export function modelOf(card: string): ItemModel | undefined {
  return card in ITEM_MODELS ? ITEM_MODELS[card as ItemId] : undefined;
}

/** Every model's parts, for the figure workers to mesh. */
export const ITEM_PARTS: readonly FigureParts<unknown>[] = [...new Set(Object.values(ITEM_MODELS).flatMap((model) => model.parts))];
