import { FORAGE_KINDS, type ForageKind } from "../engine/regions";

/*
 * What can be cooked at the fire, as rules: the ingredients (what the
 * forest gives, and the few staples a wandering witch carries), the three
 * ways of cooking over the flames, and the recipes, real Nordic dishes.
 *
 * A recipe is a set of ingredients cooked one of its ways. Cooking can't
 * fail: a combination no recipe has makes a humble dish of its own, named
 * for its main ingredient (the first thing from the forest chosen) and the
 * way it was cooked, so fried chanterelles or stewed bilberries are dishes
 * too. Every dish needs something from the forest: the staples alone are
 * not a meal. The fly agaric is never food.
 */

/** What Elliott carries everywhere: always to hand, never used up. */
export const STAPLES = ["oats", "flour", "butter", "honey", "cream", "eggs"] as const;
export type Staple = (typeof STAPLES)[number];

/** What the forest gives that can be eaten: everything foraged but the fly agaric. */
export type Food = Exclude<ForageKind, "fly-agaric">;
export const FOODS: readonly Food[] = FORAGE_KINDS.filter((kind): kind is Food => kind !== "fly-agaric");

export type Ingredient = Food | Staple;

export const COOKWARE = ["pan", "pot", "stick"] as const;
export type Cookware = (typeof COOKWARE)[number];

/** How many ingredients go into one dish, at most. */
export const MOST_INGREDIENTS = 3;

export interface Recipe {
  id: string;
  name: string;
  /** What it is called where it comes from. */
  native: string;
  ingredients: readonly Ingredient[];
  /** The ways it can be cooked. */
  cookware: readonly Cookware[];
}

export const RECIPES = [
  { id: "blueberry-pie", name: "Blueberry pie", native: "mustikkapiirakka", ingredients: ["bilberry", "flour", "butter"], cookware: ["pan"] },
  { id: "bilberry-soup", name: "Bilberry soup", native: "blåbärssoppa", ingredients: ["bilberry", "honey"], cookware: ["pot"] },
  { id: "lingonberry-porridge", name: "Lingonberry porridge", native: "puolukkapuuro", ingredients: ["lingonberry", "oats"], cookware: ["pot"] },
  { id: "lingonberry-stick-bread", name: "Stick bread with lingonberries", native: "tikkupulla", ingredients: ["lingonberry", "flour", "honey"], cookware: ["stick"] },
  { id: "strawberries-and-cream", name: "Wild strawberries and cream", native: "mansikat ja kerma", ingredients: ["wild-strawberry", "cream"], cookware: ["pan", "pot", "stick"] },
  { id: "raspberry-crumble", name: "Raspberry crumble pie", native: "hallonpaj", ingredients: ["raspberry", "oats", "butter"], cookware: ["pan"] },
  { id: "berry-tea", name: "Berry tea", native: "marjatee", ingredients: ["raspberry", "honey"], cookware: ["pot"] },
  { id: "cloudberry-pancakes", name: "Pancakes with cloudberry jam", native: "lettuja ja lakkahilloa", ingredients: ["cloudberry", "flour", "eggs"], cookware: ["pan"] },
  { id: "chanterelle-toast", name: "Chanterelle toast", native: "kantarellitoast", ingredients: ["chanterelle", "flour", "butter"], cookware: ["pan"] },
  { id: "chanterelle-sauce", name: "Creamy chanterelle sauce", native: "kantarellikastike", ingredients: ["chanterelle", "cream", "butter"], cookware: ["pan"] },
  { id: "mushroom-soup", name: "Creamy mushroom soup", native: "sienikeitto", ingredients: ["porcini", "chanterelle", "cream"], cookware: ["pot"] },
  { id: "porcini-saute", name: "Porcini sauté", native: "paistetut herkkutatit", ingredients: ["porcini", "butter"], cookware: ["pan"] },
  { id: "mushroom-skewers", name: "Mushroom skewers", native: "sienivartaat", ingredients: ["porcini", "chanterelle"], cookware: ["stick"] },
  { id: "funnel-chanterelle-soup", name: "Funnel chanterelle soup", native: "suppilovahverokeitto", ingredients: ["funnel-chanterelle", "cream"], cookware: ["pot"] },
] as const satisfies readonly Recipe[];

export type RecipeId = (typeof RECIPES)[number]["id"];
export const RECIPE_IDS: readonly RecipeId[] = RECIPES.map((r) => r.id);

/** A dish no recipe has: the way it was cooked and its main ingredient. */
export type HumbleId = `humble-${Cookware}-${Food}`;
export type DishId = RecipeId | HumbleId;

export const humbleId = (cookware: Cookware, food: Food): HumbleId => `humble-${cookware}-${food}`;

/** Every dish there is, in the order the recipe book and the basket show them: the recipes, then the humble dishes by way and ingredient. */
export const DISHES: readonly DishId[] = [...RECIPE_IDS, ...COOKWARE.flatMap((c) => FOODS.map((f) => humbleId(c, f)))];

const DISH_SET: ReadonlySet<string> = new Set(DISHES);
export const isDish = (thing: string): thing is DishId => DISH_SET.has(thing);
export const isFood = (thing: string): thing is Food => (FOODS as readonly string[]).includes(thing);
export const isStaple = (thing: string): thing is Staple => (STAPLES as readonly string[]).includes(thing);

export function recipeOf(dish: DishId): (typeof RECIPES)[number] | null {
  return RECIPES.find((r) => r.id === dish) ?? null;
}

/** A humble dish's way and main ingredient, or null for a recipe's dish. */
export function humbleOf(dish: DishId): { cookware: Cookware; food: Food } | null {
  if (recipeOf(dish) !== null) return null;
  const [, cookware, ...food] = dish.split("-");
  return { cookware: cookware as Cookware, food: food.join("-") as Food };
}

/** Throws on a choice that can't go into the pan: none, too many, the same thing twice, or nothing from the forest. */
export function checkChoice(ingredients: readonly string[]): asserts ingredients is readonly Ingredient[] {
  if (ingredients.length === 0 || ingredients.length > MOST_INGREDIENTS) throw new Error(`A dish takes 1 to ${MOST_INGREDIENTS} ingredients, not ${ingredients.length}`);
  if (new Set(ingredients).size !== ingredients.length) throw new Error(`An ingredient is chosen twice: ${ingredients.join(", ")}`);
  for (const i of ingredients) if (!isFood(i) && !isStaple(i)) throw new Error(`${i} is never cooked`);
  if (!ingredients.some(isFood)) throw new Error(`A dish needs something from the forest: ${ingredients.join(", ")}`);
}

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x));

/** What some ingredients cooked one way make: the recipe they are, or else the humble dish of the first thing from the forest chosen. */
export function dishOf(ingredients: readonly Ingredient[], cookware: Cookware): DishId {
  checkChoice(ingredients);
  const recipe = RECIPES.find((r) => sameSet(r.ingredients, ingredients) && (r.cookware as readonly Cookware[]).includes(cookware));
  if (recipe) return recipe.id;
  const main = ingredients.find(isFood);
  if (main === undefined) throw new Error("A dish needs something from the forest");
  return humbleId(cookware, main);
}
