import type { Color } from "three";
import { themeColor } from "@/shared/lib/three/theme-color";
import type { ForageKind } from "../engine/regions";
import { brewRecipeOf, charmOf, humbleBrewOf, isForageKind, type BrewForm, type BrewId, type BrewIngredient, type Charm, type RecipeBrewId } from "../gameplay/brews";
import { readDishPalette, toneVar as dishToneVar, type DishPalette, type Tone as DishTone } from "./dish-looks";

/*
 * How every brew looks, as plain data both drawings are made from (the
 * storybook model rising from the cauldron and standing in the gallery, and
 * the little picture in the basket and the brew book), so the two always
 * agree: its vessel (a tea in a stoppered bottle, a salve in a little tin,
 * a charm in a linen pouch tied with red thread), the colour of what is in
 * it, the sprig or berry of what went in, tied at the neck or laid on top,
 * and the colour of the glow its steam gives while it brews. A humble brew
 * is plain, with its first thing from the forest on it. Colours are the
 * forage's, the cooking's and the brewing's tokens.
 */

const BREWING_THINGS = [
  "cauldron",
  "glass",
  "cork",
  "tin",
  "linen",
  "thread",
  "beeswax",
  "salt",
  "crock",
  "yarrow-tea",
  "meadowsweet-tea",
  "juniper-tea",
  "green-salve",
  "rose-salve",
  "humble",
  "glow-gold",
  "glow-rose",
  "glow-green",
  "glow-violet",
  "glow-blue",
  "bloom-pink",
  "bloom-white",
  "bloom-violet",
  "bloom-yellow",
  "bloom-leaf",
  "hush",
  "moon",
  "page",
  "ink",
] as const;
export type BrewingThing = (typeof BREWING_THINGS)[number];
export type BrewTone = DishTone | BrewingThing;
export type BrewPalette = DishPalette & Record<BrewingThing, Color>;

export function readBrewPalette(): BrewPalette {
  const brewing = Object.fromEntries(BREWING_THINGS.map((t) => [t, themeColor(`--color-hearthwood-brewing-${t}`)])) as Record<BrewingThing, Color>;
  return { ...readDishPalette(), ...brewing };
}

/** A tone as the CSS colour the drawings paint it with. */
export function brewToneVar(tone: BrewTone): string {
  return (BREWING_THINGS as readonly string[]).includes(tone) ? `var(--color-hearthwood-brewing-${tone})` : dishToneVar(tone as DishTone);
}

export type BrewVessel = "bottle" | "tin" | "pouch";
export type Glow = Extract<BrewingThing, `glow-${string}`>;

export interface BrewLook {
  vessel: BrewVessel;
  /** What is in it: a tea's colour through the glass, a salve's in its tin, a pouch's linen. */
  tone: BrewTone;
  /** The sprig or berries of what went in, tied at the neck or laid on top. */
  sprig: BrewTone;
  /** The colour the steam glows while it brews. */
  glow: Glow;
}

export const VESSEL_OF: Record<BrewForm, BrewVessel> = { tea: "bottle", salve: "tin", charm: "pouch" };

/** Each thing from the forest's own colour, as it shows in a brew. */
export const FORAGE_TONE: Record<ForageKind, BrewTone> = {
  bilberry: "bilberry",
  lingonberry: "lingonberry",
  "wild-strawberry": "strawberry",
  raspberry: "raspberry",
  cloudberry: "cloudberry",
  chanterelle: "chanterelle",
  porcini: "porcini-cap",
  "funnel-chanterelle": "funnel-cap",
  "fly-agaric": "fly-agaric-cap",
  yarrow: "yarrow-flower",
  meadowsweet: "meadowsweet-flower",
  juniper: "juniper-berry",
};

/** The colour of each thing as it goes into the cauldron. */
export function brewIngredientTone(ingredient: BrewIngredient): BrewTone {
  return isForageKind(ingredient) ? FORAGE_TONE[ingredient] : ingredient;
}

/** The glow each charm gives, here and wherever the world shows it at work. */
export const CHARM_GLOW: Record<Charm, Glow> = { bloom: "glow-green", fireflies: "glow-gold", hush: "glow-violet", clearing: "glow-blue" };

const RECIPE_LOOKS: Record<RecipeBrewId, BrewLook> = {
  "yarrow-tea": { vessel: "bottle", tone: "yarrow-tea", sprig: "yarrow-flower", glow: "glow-gold" },
  "meadowsweet-tea": { vessel: "bottle", tone: "meadowsweet-tea", sprig: "meadowsweet-flower", glow: "glow-gold" },
  "winter-tea": { vessel: "bottle", tone: "juniper-tea", sprig: "juniper-berry", glow: "glow-rose" },
  "yarrow-salve": { vessel: "tin", tone: "green-salve", sprig: "yarrow-flower", glow: "glow-green" },
  "fly-agaric-rub": { vessel: "tin", tone: "rose-salve", sprig: "fly-agaric-cap", glow: "glow-rose" },
  "garland-charm": { vessel: "pouch", tone: "linen", sprig: "meadowsweet-flower", glow: CHARM_GLOW.bloom },
  "lantern-charm": { vessel: "pouch", tone: "linen", sprig: "cloudberry", glow: CHARM_GLOW.fireflies },
  "hush-charm": { vessel: "pouch", tone: "linen", sprig: "meadowsweet-flower", glow: CHARM_GLOW.hush },
  "mist-charm": { vessel: "pouch", tone: "linen", sprig: "juniper-needle", glow: CHARM_GLOW.clearing },
};

export function brewLook(brew: BrewId): BrewLook {
  const recipe = brewRecipeOf(brew);
  if (recipe) return RECIPE_LOOKS[recipe.id];
  const humble = humbleBrewOf(brew);
  if (humble === null) throw new Error(`${brew} is neither a brew nor a humble one`);
  return { vessel: VESSEL_OF[humble.form], tone: humble.form === "charm" ? "linen" : "humble", sprig: FORAGE_TONE[humble.main], glow: "glow-gold" };
}

/** A charm's glow, for a brew that works one. */
export function glowOfCharm(brew: BrewId): Glow | null {
  const charm = charmOf(brew);
  return charm ? CHARM_GLOW[charm] : null;
}
