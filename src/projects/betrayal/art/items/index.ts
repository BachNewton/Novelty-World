import type { FigureParts } from "../figure-parts";
import { ADRENALINE_SHOT } from "./adrenaline-shot";
import { AMULET_OF_THE_AGES } from "./amulet-of-the-ages";
import { ANGEL_FEATHER } from "./angel-feather";
import { ARMOR } from "./armor";
import { AXE } from "./axe";
import { BELL } from "./bell";
import { BLOOD_DAGGER } from "./blood-dagger";
import { BOOK } from "./book";
import { BOTTLE_MODEL } from "./bottle";
import { CANDLE_MODEL } from "./candle";
import { CRYSTAL_BALL } from "./crystal-ball";
import { DARK_DICE } from "./dark-dice";
import { DYNAMITE } from "./dynamite";
import { HEALING_SALVE } from "./healing-salve";
import { HOLY_SYMBOL } from "./holy-symbol";
import { IDOL_MODEL } from "./idol";
import type { HeldModel, ItemModel, WornModel } from "./item";
import { LUCKY_STONE } from "./lucky-stone";
import { MASK } from "./mask";
import { MEDALLION } from "./medallion";
import { MEDICAL_KIT } from "./medical-kit";
import { MUSIC_BOX } from "./music-box";
import { PICKPOKETS_GLOVES } from "./pickpokets-gloves";
import { PUZZLE_BOX } from "./puzzle-box";
import { RABBITS_FOOT } from "./rabbits-foot";
import { REVOLVER } from "./revolver";
import { RING } from "./ring";
import { SACRIFICIAL_DAGGER } from "./sacrificial-dagger";
import { SKULL } from "./skull";
import { SMELLING_SALTS } from "./smelling-salts";
import { SPEAR } from "./spear";
import { SPIRIT_BOARD } from "./spirit-board";

/*
 * Every item and omen card with a model, by the card's id as the engine
 * names it: one file per card in this folder, one line here. A card without
 * one shows its type's stand-in on the floor (`things/looks.ts`).
 */
export const ITEM_MODELS = {
  "adrenaline-shot": ADRENALINE_SHOT,
  "amulet-of-the-ages": AMULET_OF_THE_AGES,
  "angel-feather": ANGEL_FEATHER,
  armor: ARMOR,
  axe: AXE,
  bell: BELL,
  "blood-dagger": BLOOD_DAGGER,
  book: BOOK,
  bottle: BOTTLE_MODEL,
  candle: CANDLE_MODEL,
  "crystal-ball": CRYSTAL_BALL,
  "dark-dice": DARK_DICE,
  dynamite: DYNAMITE,
  "healing-salve": HEALING_SALVE,
  "holy-symbol": HOLY_SYMBOL,
  idol: IDOL_MODEL,
  "lucky-stone": LUCKY_STONE,
  mask: MASK,
  medallion: MEDALLION,
  "medical-kit": MEDICAL_KIT,
  "music-box": MUSIC_BOX,
  "pickpokets-gloves": PICKPOKETS_GLOVES,
  "puzzle-box": PUZZLE_BOX,
  "rabbits-foot": RABBITS_FOOT,
  revolver: REVOLVER,
  ring: RING,
  "sacrificial-dagger": SACRIFICIAL_DAGGER,
  skull: SKULL,
  "smelling-salts": SMELLING_SALTS,
  spear: SPEAR,
  "spirit-board": SPIRIT_BOARD,
} as const satisfies Readonly<Record<string, ItemModel>>;

export type ItemId = keyof typeof ITEM_MODELS;
/** The cards carried in the hand, and those worn on the body. */
export type HeldId = { [K in ItemId]: (typeof ITEM_MODELS)[K] extends HeldModel ? K : never }[ItemId];
export type WornId = { [K in ItemId]: (typeof ITEM_MODELS)[K] extends WornModel ? K : never }[ItemId];

export const ITEM_IDS = Object.keys(ITEM_MODELS) as ItemId[];
export const HELD_IDS = ITEM_IDS.filter((id): id is HeldId => ITEM_MODELS[id].held !== undefined);
export const WORN_IDS = ITEM_IDS.filter((id): id is WornId => ITEM_MODELS[id].worn !== undefined);

/** A card's model, if it has one. */
export function modelOf(card: string): ItemModel | undefined {
  return card in ITEM_MODELS ? ITEM_MODELS[card as ItemId] : undefined;
}

/** Every model's parts, for the figure workers to mesh. */
export const ITEM_PARTS: readonly FigureParts<unknown>[] = [...new Set(Object.values(ITEM_MODELS).flatMap((model) => model.parts))];
