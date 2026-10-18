import type { Request } from "../stories/story";
import type { Basket } from "./basket";
import { dishCount, type Larder } from "./cooking";
import { COOKWARE, DISHES, FOODS, humbleOf, recipeOf, type DishId, type Food } from "./recipes";

/*
 * Helping someone, as rules: whether what Elliott has with them answers what
 * a person asked for, and what it takes from them when it does. A dish comes
 * out of the basket's larder (a recipe's own, or the first warm one), forage
 * out of the basket (the kinds there are most of first), and a lost animal
 * has to be following Elliott, close by. A carried note is answered when it
 * has been given to the person it was for. Nothing here is lost: what is
 * taken is given.
 */

/** What Elliott has to hand to help with. */
export interface Means {
  basket: Basket;
  larder: Larder;
  /** Whether the person's lost animal follows Elliott, close by. */
  petHere: boolean;
  /** Whether the note this person gave has reached its friend. */
  delivered: boolean;
}

/** What helping takes, once it does. */
export type Taking = { kind: "dish"; dish: DishId } | { kind: "forage"; foods: readonly (readonly [Food, number])[] } | { kind: "pet" } | { kind: "carry" };

/** Anything warm from the pot: the recipes cooked only there (soups, porridge, tea) and every humble stew. */
export const WARM_DISHES: readonly DishId[] = DISHES.filter((dish) => {
  const recipe = recipeOf(dish);
  if (recipe) return recipe.cookware.length === 1 && recipe.cookware[0] === "pot";
  return humbleOf(dish)?.cookware === "pot";
});

const forageCount = (basket: Basket, foods: readonly Food[]) => foods.reduce((sum, f) => sum + basket[f], 0);

/** The dish a request would take from the larder now, or null. */
function dishFor(request: Extract<Request, { kind: "dish" }>, larder: Larder): DishId | null {
  if (request.dish !== "warm") return dishCount(larder, request.dish) > 0 ? request.dish : null;
  return WARM_DISHES.find((d) => dishCount(larder, d) > 0) ?? null;
}

export function canFulfil(request: Request, means: Means): boolean {
  switch (request.kind) {
    case "dish":
      return dishFor(request, means.larder) !== null;
    case "forage":
      return forageCount(means.basket, request.foods) >= request.count;
    case "pet":
      return means.petHere;
    case "carry":
      return means.delivered;
  }
}

/** What answering a request takes from what Elliott has: throws where it can't be answered yet. */
export function takingFor(request: Request, means: Means): Taking {
  if (!canFulfil(request, means)) throw new Error(`Nothing yet answers ${JSON.stringify(request)}`);
  switch (request.kind) {
    case "dish": {
      const dish = dishFor(request, means.larder);
      if (dish === null) throw new Error("No dish to give");
      return { kind: "dish", dish };
    }
    case "forage": {
      const left = { ...means.basket };
      const foods: [Food, number][] = [];
      for (let n = 0; n < request.count; n++) {
        const most = [...request.foods].sort((a, b) => left[b] - left[a])[0];
        left[most]--;
        const taken = foods.find(([f]) => f === most);
        if (taken) taken[1]++;
        else foods.push([most, 1]);
      }
      return { kind: "forage", foods };
    }
    case "pet":
      return { kind: "pet" };
    case "carry":
      return { kind: "carry" };
  }
}

/** Whether a request can ever be answered by what the game has: every food in it grows, every dish can be cooked. */
export function answerable(request: Request): boolean {
  switch (request.kind) {
    case "dish":
      return request.dish === "warm" ? WARM_DISHES.length > 0 : recipeOf(request.dish)?.cookware.some((c) => COOKWARE.includes(c)) === true;
    case "forage":
      return request.count > 0 && request.foods.length > 0 && request.foods.every((f) => FOODS.includes(f));
    case "pet":
    case "carry":
      return true;
  }
}
