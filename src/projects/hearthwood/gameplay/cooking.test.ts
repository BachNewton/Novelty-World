import { describe, expect, it } from "vitest";
import { emptyBasket } from "./basket";
import { addDish, beginSession, canCook, chooseCookware, COOKING_SECONDS, cookAgain, cooked, dishesIn, emptyLarder, startCooking, stepSession, takeDish, toggleIngredient } from "./cooking";
import { checkChoice, COOKWARE, DISHES, dishOf, FOODS, humbleId, humbleOf, isDish, MOST_INGREDIENTS, RECIPES, STAPLES, type Ingredient } from "./recipes";

describe("the recipes", () => {
  it("are each a few ingredients with something from the forest, cooked some way, and none two of them alike", () => {
    expect(RECIPES.length).toBeGreaterThanOrEqual(10);
    expect(RECIPES.length).toBeLessThanOrEqual(14);
    for (const recipe of RECIPES) {
      expect(() => {
        checkChoice(recipe.ingredients);
      }).not.toThrow();
      expect(recipe.cookware.length).toBeGreaterThan(0);
      for (const way of recipe.cookware) expect(dishOf(recipe.ingredients, way)).toBe(recipe.id);
      // The order they go into the pan never matters.
      expect(dishOf([...recipe.ingredients].reverse(), recipe.cookware[0])).toBe(recipe.id);
    }
    expect(new Set(RECIPES.map((r) => r.id)).size).toBe(RECIPES.length);
  });

  it("use everything the forest gives that can be eaten, and every staple", () => {
    const used = new Set<string>(RECIPES.flatMap((r) => r.ingredients));
    for (const food of FOODS) expect(used).toContain(food);
    for (const staple of STAPLES) expect(used).toContain(staple);
    expect(used).not.toContain("fly-agaric");
  });

  it("make a humble dish of the first thing from the forest chosen, cooked the way it was, from anything no recipe has", () => {
    expect(dishOf(["oats", "porcini", "bilberry"], "stick")).toBe(humbleId("stick", "porcini"));
    expect(dishOf(["bilberry"], "pot")).toBe(humbleId("pot", "bilberry"));
    // A recipe's ingredients cooked another way are still a dish, never a failure.
    expect(dishOf(["bilberry", "flour", "butter"], "pot")).toBe(humbleId("pot", "bilberry"));
    expect(humbleOf(humbleId("pan", "wild-strawberry"))).toEqual({ cookware: "pan", food: "wild-strawberry" });
    expect(humbleOf("blueberry-pie")).toBeNull();
  });

  it("make some dish of every choice there can be", () => {
    const pool: Ingredient[] = [...FOODS, ...STAPLES];
    for (const a of pool) {
      for (const b of pool) {
        if (a === b) continue;
        const chosen = [a, b];
        if (!chosen.some((i) => (FOODS as readonly string[]).includes(i))) continue;
        for (const way of COOKWARE) expect(isDish(dishOf(chosen, way))).toBe(true);
      }
    }
  });

  it("never take the fly agaric, staples alone, nothing, too much, or the same thing twice", () => {
    expect(() => {
      checkChoice(["fly-agaric", "butter"]);
    }).toThrow();
    expect(() => {
      checkChoice(["oats", "honey"]);
    }).toThrow();
    expect(() => {
      checkChoice([]);
    }).toThrow();
    expect(() => {
      checkChoice(["bilberry", "oats", "honey", "cream"]);
    }).toThrow();
    expect(() => {
      checkChoice(["bilberry", "bilberry"]);
    }).toThrow();
  });

  it("list every dish once", () => {
    expect(new Set(DISHES).size).toBe(DISHES.length);
    expect(DISHES.length).toBe(RECIPES.length + COOKWARE.length * FOODS.length);
  });
});

describe("a turn at the fire", () => {
  const basket = { ...emptyBasket(), bilberry: 1, porcini: 2 };

  it("chooses what is to hand, up to a few, and puts back what is tapped again", () => {
    let s = beginSession();
    s = toggleIngredient(s, "raspberry", basket);
    expect(s.chosen).toEqual([]);
    s = toggleIngredient(s, "bilberry", basket);
    s = toggleIngredient(s, "flour", basket);
    s = toggleIngredient(s, "butter", basket);
    s = toggleIngredient(s, "honey", basket);
    expect(s.chosen).toEqual(["bilberry", "flour", "butter"]);
    expect(s.chosen.length).toBe(MOST_INGREDIENTS);
    s = toggleIngredient(s, "flour", basket);
    expect(s.chosen).toEqual(["bilberry", "butter"]);
  });

  it("cooks only with something from the forest", () => {
    let s = toggleIngredient(beginSession(), "oats", basket);
    expect(canCook(s, basket)).toBe(false);
    s = toggleIngredient(s, "porcini", basket);
    expect(canCook(s, basket)).toBe(true);
  });

  it("puts the dish in the larder as it starts, cooks a short while, and serves it, a new one marked as found", () => {
    let s = beginSession();
    for (const i of ["bilberry", "flour", "butter"] as const) s = toggleIngredient(s, i, basket);
    s = chooseCookware(s, "pan");
    const started = startCooking(s, basket, emptyLarder(), 10);
    expect(started.larder.dishes["blueberry-pie"]).toBe(1);
    expect(started.larder.known).toEqual(["blueberry-pie"]);
    expect(started.session.phase).toBe("cooking");
    expect(cooked(started.session, 10 + COOKING_SECONDS / 2)).toBeCloseTo(0.5);
    expect(stepSession(started.session, 10 + COOKING_SECONDS / 2).phase).toBe("cooking");
    const served = stepSession(started.session, 10 + COOKING_SECONDS);
    expect(served).toMatchObject({ phase: "served", dish: "blueberry-pie", discovered: true });
    const again = startCooking({ ...s }, basket, started.larder, 20);
    expect(again.session).toMatchObject({ discovered: false });
    expect(again.larder.dishes["blueberry-pie"]).toBe(2);
    expect(again.larder.known).toEqual(["blueberry-pie"]);
  });

  it("refuses to start without something from the forest to hand", () => {
    const s = toggleIngredient(beginSession(), "honey", basket);
    expect(() => startCooking(s, basket, emptyLarder(), 0)).toThrow();
  });

  it("goes again with the same way of cooking and what is still to hand", () => {
    const served = { phase: "served", chosen: ["bilberry", "honey"], cookware: "pot", dish: "bilberry-soup", discovered: false } as const;
    const again = cookAgain({ ...served, chosen: [...served.chosen] }, { ...emptyBasket(), bilberry: 0 });
    expect(again).toEqual({ phase: "choosing", cookware: "pot", chosen: ["honey"] });
  });
});

describe("the larder", () => {
  it("gives dishes out one at a time, in the book's order", () => {
    let larder = addDish(emptyLarder(), humbleId("stick", "porcini")).larder;
    larder = addDish(larder, "berry-tea").larder;
    larder = addDish(larder, "berry-tea").larder;
    expect(dishesIn(larder)).toEqual(["berry-tea", humbleId("stick", "porcini")]);
    larder = takeDish(larder, "berry-tea");
    larder = takeDish(larder, "berry-tea");
    expect(dishesIn(larder)).toEqual([humbleId("stick", "porcini")]);
    expect(() => takeDish(larder, "berry-tea")).toThrow();
    // The book remembers a dish after it is given away.
    expect(larder.known).toEqual([humbleId("stick", "porcini"), "berry-tea"]);
  });

});
