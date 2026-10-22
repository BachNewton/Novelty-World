import type { FigureParts } from "../figure-parts";
import { AXE } from "./axe";
import { BLOOD_DAGGER } from "./blood-dagger";
import { CANDLE_MODEL } from "./candle";
import type { ItemModel } from "./item";
import { REVOLVER } from "./revolver";
import { SACRIFICIAL_DAGGER } from "./sacrificial-dagger";
import { SPEAR } from "./spear";

/*
 * Every item and omen card with a model, by the card's id as the engine
 * names it: one file per card in this folder, one line here. A card without
 * one shows its type's stand-in on the floor (`things/looks.ts`).
 */
export const ITEM_MODELS = {
  axe: AXE,
  "blood-dagger": BLOOD_DAGGER,
  candle: CANDLE_MODEL,
  revolver: REVOLVER,
  "sacrificial-dagger": SACRIFICIAL_DAGGER,
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
