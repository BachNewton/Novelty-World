import type { Color } from "three";
import { themeColor } from "@/shared/lib/three/theme-color";
import { humbleOf, isFood, recipeOf, type DishId, type Food, type Ingredient, type RecipeId } from "../gameplay/recipes";
import { readForagePalette, type ForageThing } from "./forage-shapes";

/*
 * How every dish looks, as plain data both drawings are made from (the
 * storybook model at the fire and in the gallery, and the little picture in
 * the basket and the recipe book), so the two always agree: what it is
 * served in, the body of it (a bowl filled, a stack of pancakes, a pie, a
 * slice of toast, a heap, dough wound round a stick, pieces on a skewer)
 * and what lies on top. A humble dish looks like what it was made of,
 * served as its way of cooking serves it: fried on a plate, stewed in a
 * bowl, toasted on a stick. Colours are the forage's and the cooking's
 * tokens.
 */

const COOKING_THINGS = [
  "iron",
  "grip",
  "stick",
  "birch",
  "kuksa",
  "oats",
  "flour",
  "sack",
  "butter",
  "honey",
  "jar",
  "cream",
  "jug",
  "egg",
  "yolk",
  "pastry",
  "crumb",
  "pancake",
  "toast",
  "dough",
  "porridge",
  "pink-porridge",
  "soup",
  "sauce",
  "berry-soup",
  "tea",
  "dill",
  "steam",
  "sizzle",
] as const;
export type CookingThing = (typeof COOKING_THINGS)[number];
export type Tone = ForageThing | CookingThing;
export type DishPalette = Record<Tone, Color>;

export function readDishPalette(): DishPalette {
  const cooking = Object.fromEntries(COOKING_THINGS.map((t) => [t, themeColor(`--color-hearthwood-cooking-${t}`)])) as Record<CookingThing, Color>;
  return { ...readForagePalette(), ...cooking };
}

/** A tone as the CSS colour the drawings paint it with. */
export function toneVar(tone: Tone): string {
  return (COOKING_THINGS as readonly string[]).includes(tone) ? `var(--color-hearthwood-cooking-${tone})` : `var(--color-hearthwood-forage-${tone})`;
}

export type Vessel = "plate" | "bowl" | "cup" | "board" | "stick";

export type Heap =
  | { form: "fill"; tone: Tone }
  | { form: "stack"; tone: Tone; layers: number }
  | { form: "pie"; crust: Tone; top: Tone }
  | { form: "slice"; tone: Tone }
  | { form: "pile"; tone: Tone }
  | { form: "dough"; tone: Tone }
  | { form: "skewer"; tones: Tone[] };

export type ToppingShape = "berry" | "chunk" | "dollop" | "sprig" | "crumb";

export interface Topping {
  tone: Tone;
  shape: ToppingShape;
  count: number;
}

export interface DishLook {
  vessel: Vessel;
  heap: Heap;
  toppings: Topping[];
}

/** Each food's own colour, and the shape its pieces take. */
export const FOOD_LOOK: Record<Food, { tone: Tone; shape: ToppingShape }> = {
  bilberry: { tone: "bilberry", shape: "berry" },
  lingonberry: { tone: "lingonberry", shape: "berry" },
  "wild-strawberry": { tone: "strawberry", shape: "berry" },
  raspberry: { tone: "raspberry", shape: "berry" },
  cloudberry: { tone: "cloudberry", shape: "berry" },
  chanterelle: { tone: "chanterelle", shape: "chunk" },
  porcini: { tone: "porcini-cap", shape: "chunk" },
  "funnel-chanterelle": { tone: "funnel-cap", shape: "chunk" },
};

/** The colour of each ingredient as it goes into the pan. */
export function ingredientTone(ingredient: Ingredient): Tone {
  if (isFood(ingredient)) return FOOD_LOOK[ingredient].tone;
  const staples: Record<Exclude<Ingredient, Food>, Tone> = { oats: "oats", flour: "flour", butter: "butter", honey: "honey", cream: "cream", eggs: "yolk" };
  return staples[ingredient];
}

const RECIPE_LOOKS: Record<RecipeId, DishLook> = {
  "blueberry-pie": { vessel: "board", heap: { form: "pie", crust: "pastry", top: "bilberry" }, toppings: [{ tone: "bilberry", shape: "berry", count: 14 }, { tone: "crumb", shape: "crumb", count: 8 }] },
  "bilberry-soup": { vessel: "cup", heap: { form: "fill", tone: "berry-soup" }, toppings: [{ tone: "bilberry", shape: "berry", count: 3 }] },
  "lingonberry-porridge": { vessel: "bowl", heap: { form: "fill", tone: "pink-porridge" }, toppings: [{ tone: "lingonberry", shape: "berry", count: 7 }, { tone: "butter", shape: "dollop", count: 1 }] },
  "lingonberry-stick-bread": { vessel: "stick", heap: { form: "dough", tone: "dough" }, toppings: [{ tone: "lingonberry", shape: "berry", count: 6 }, { tone: "honey", shape: "dollop", count: 1 }] },
  "strawberries-and-cream": { vessel: "bowl", heap: { form: "fill", tone: "cream" }, toppings: [{ tone: "strawberry", shape: "berry", count: 7 }, { tone: "strawberry-leaf", shape: "sprig", count: 1 }] },
  "raspberry-crumble": { vessel: "board", heap: { form: "pie", crust: "pastry", top: "raspberry" }, toppings: [{ tone: "crumb", shape: "crumb", count: 22 }, { tone: "raspberry", shape: "berry", count: 5 }] },
  "berry-tea": { vessel: "cup", heap: { form: "fill", tone: "tea" }, toppings: [{ tone: "raspberry", shape: "berry", count: 2 }, { tone: "raspberry-leaf", shape: "sprig", count: 1 }] },
  "cloudberry-pancakes": { vessel: "plate", heap: { form: "stack", tone: "pancake", layers: 4 }, toppings: [{ tone: "cloudberry", shape: "dollop", count: 1 }, { tone: "cloudberry", shape: "berry", count: 4 }, { tone: "cream", shape: "dollop", count: 1 }] },
  "chanterelle-toast": { vessel: "plate", heap: { form: "slice", tone: "toast" }, toppings: [{ tone: "chanterelle", shape: "chunk", count: 7 }, { tone: "dill", shape: "sprig", count: 2 }] },
  "chanterelle-sauce": { vessel: "bowl", heap: { form: "fill", tone: "sauce" }, toppings: [{ tone: "chanterelle", shape: "chunk", count: 6 }, { tone: "dill", shape: "sprig", count: 2 }] },
  "mushroom-soup": { vessel: "bowl", heap: { form: "fill", tone: "soup" }, toppings: [{ tone: "porcini-cap", shape: "chunk", count: 3 }, { tone: "chanterelle", shape: "chunk", count: 3 }, { tone: "cream", shape: "dollop", count: 1 }] },
  "porcini-saute": { vessel: "plate", heap: { form: "pile", tone: "porcini-stem" }, toppings: [{ tone: "porcini-cap", shape: "chunk", count: 7 }, { tone: "butter", shape: "dollop", count: 1 }, { tone: "dill", shape: "sprig", count: 2 }] },
  "mushroom-skewers": { vessel: "stick", heap: { form: "skewer", tones: ["porcini-cap", "chanterelle", "porcini-stem", "chanterelle", "porcini-cap"] }, toppings: [] },
  "funnel-chanterelle-soup": { vessel: "bowl", heap: { form: "fill", tone: "soup" }, toppings: [{ tone: "funnel-cap", shape: "chunk", count: 6 }, { tone: "dill", shape: "sprig", count: 2 }] },
};

export function dishLook(dish: DishId): DishLook {
  const recipe = recipeOf(dish);
  if (recipe) return RECIPE_LOOKS[recipe.id];
  const humble = humbleOf(dish);
  if (humble === null) throw new Error(`${dish} is neither a recipe nor a humble dish`);
  const { tone, shape } = FOOD_LOOK[humble.food];
  const berry = shape === "berry";
  switch (humble.cookware) {
    case "pan":
      return { vessel: "plate", heap: { form: "pile", tone: berry ? tone : "soup" }, toppings: [{ tone, shape, count: berry ? 9 : 6 }] };
    case "pot":
      return { vessel: "bowl", heap: { form: "fill", tone: berry ? tone : "soup" }, toppings: [{ tone, shape, count: berry ? 4 : 5 }] };
    case "stick":
      return { vessel: "stick", heap: { form: "skewer", tones: [tone, tone, tone, tone] }, toppings: [] };
  }
}
