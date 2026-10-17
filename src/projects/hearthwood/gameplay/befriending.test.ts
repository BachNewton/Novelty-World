import { describe, expect, it } from "vitest";
import { generateCat } from "../cats/cat";
import { generateDog } from "../dogs/dog";
import { emptyBasket } from "./basket";
import { allowsPet, bePatient, favouriteTreat, firstBond, giveTreat, isWon, keepsOff, pet, TREATS, treatInHand, type Bond, type Temper } from "./befriending";

const boldCat: Temper = { species: "cat", boldness: 0.7, affection: 0.3 };
const shyCat: Temper = { species: "cat", boldness: -0.8, affection: 0 };
const friendlyDog: Temper = { species: "dog", boldness: 0.4, affection: 0.4 };
const shyDog: Temper = { species: "dog", boldness: -0.7, affection: 0.2 };

/** Elliott standing calmly nearby for some seconds, in steps. */
function wait(bond: Bond, temper: Temper, seconds: number, distance = 5, calm = true): Bond {
  let b = bond;
  for (let t = 0; t < seconds; t += 0.1) b = bePatient(b, temper, distance, calm, 0.1);
  return b;
}

describe("befriending a cat", () => {
  it("starts a stranger, and patience warms it until it allows a pet", () => {
    const start = firstBond(boldCat);
    expect(start.warmth).toBe(0);
    expect(allowsPet(start, boldCat)).toBe(false);
    expect(allowsPet(wait(start, boldCat, 60), boldCat)).toBe(true);
  });

  it("is won slower when shy: a shy cat allows a pet long after a bold one", () => {
    const seconds = (temper: Temper) => {
      let b = firstBond(temper);
      for (let t = 0; t < 2000; t += 1) {
        if (allowsPet(b, temper)) return t;
        b = bePatient(b, temper, 5, true, 1);
      }
      return Infinity;
    };
    expect(seconds(shyCat)).toBeGreaterThan(seconds(boldCat) * 2);
    expect(seconds(shyCat)).toBeLessThan(2000);
  });

  it("is never won by patience alone, nor warmed by running near it or from far off", () => {
    expect(isWon(wait(firstBond(boldCat), boldCat, 3000))).toBe(false);
    expect(wait(firstBond(boldCat), boldCat, 30, 5, false).warmth).toBe(0);
    expect(wait(firstBond(boldCat), boldCat, 30, 20).warmth).toBe(0);
  });

  it("warms slower once it has come a good way in one visit, and a new visit begins once Elliott goes away", () => {
    const visited = wait(firstBond(shyCat), shyCat, 60);
    expect(visited.visit).toBeGreaterThan(0.4);
    const slow = bePatient(visited, shyCat, 5, true, 10).warmth - visited.warmth;
    const away = bePatient(visited, shyCat, 40, true, 1);
    expect(away.visit).toBe(0);
    expect(away.warmth).toBe(visited.warmth);
    const fresh = bePatient(away, shyCat, 5, true, 10).warmth - away.warmth;
    expect(fresh).toBeGreaterThan(slow * 2);
  });

  it("is won at once by its favourite treat, and only warmed by another", () => {
    const favourite = favouriteTreat("a cat");
    const other = TREATS.find((k) => k !== favourite) ?? favourite;
    const loved = giveTreat(firstBond(shyCat), shyCat, favourite, favourite);
    expect(loved.relish).toBe("loved");
    expect(isWon(loved.bond)).toBe(true);
    const liked = giveTreat(firstBond(shyCat), shyCat, other, favourite);
    expect(liked.relish).toBe("liked");
    expect(liked.bond.warmth).toBeGreaterThan(0);
    expect(isWon(liked.bond)).toBe(false);
  });

  it("takes a pet only once it allows one, and is warmed by it", () => {
    expect(() => pet(firstBond(boldCat), boldCat)).toThrow();
    const warm = wait(firstBond(boldCat), boldCat, 60);
    expect(pet(warm, boldCat).warmth).toBeGreaterThan(warm.warmth);
  });

  it("keeps further off the shyer it is, closing in as it warms", () => {
    expect(keepsOff(shyCat, firstBond(shyCat))).toBeGreaterThan(keepsOff(boldCat, firstBond(boldCat)));
    expect(keepsOff(shyCat, wait(firstBond(shyCat), shyCat, 300))).toBeLessThan(keepsOff(shyCat, firstBond(shyCat)));
  });

  it("has a favourite that is a treat, never the fly agaric, and the same every time", () => {
    for (let i = 0; i < 50; i++) {
      const kind = favouriteTreat(`cat ${i}`);
      expect(TREATS).toContain(kind);
      expect(kind).toBe(favouriteTreat(`cat ${i}`));
    }
    expect(() => giveTreat(firstBond(boldCat), boldCat, "fly-agaric", null)).toThrow();
  });
});

describe("befriending a dog", () => {
  it("is won by a pet or a treat at once when friendly, as most dogs are", () => {
    const dogs = Array.from({ length: 200 }, (_, i) => generateDog(`dog ${i}`));
    const won = dogs.filter((dog) => {
      const temper: Temper = { species: "dog", boldness: dog.personality.boldness, affection: dog.personality.affection };
      const bond = firstBond(temper);
      return allowsPet(bond, temper) && isWon(pet(bond, temper));
    });
    expect(won.length / dogs.length).toBeGreaterThan(0.5);
    expect(isWon(giveTreat(firstBond(friendlyDog), friendlyDog, "bilberry", null).bond)).toBe(true);
    expect(keepsOff(friendlyDog, firstBond(friendlyDog))).toBe(0);
  });

  it("needs patience first when shy", () => {
    expect(allowsPet(firstBond(shyDog), shyDog)).toBe(false);
    expect(keepsOff(shyDog, firstBond(shyDog))).toBeGreaterThan(3);
    expect(allowsPet(wait(firstBond(shyDog), shyDog, 120), shyDog)).toBe(true);
  });
});

describe("most cats", () => {
  it("warm to a calm visitor within a few minutes", () => {
    const cats = Array.from({ length: 100 }, (_, i) => generateCat(`cat ${i}`));
    const minutes = cats.map((cat) => {
      const temper: Temper = { species: "cat", boldness: cat.personality.boldness, affection: cat.personality.affection };
      let b = firstBond(temper);
      let t = 0;
      while (!allowsPet(b, temper) && t < 3600) {
        b = bePatient(b, temper, 4, true, 1);
        t++;
      }
      return t / 60;
    });
    minutes.sort((a, b) => a - b);
    expect(minutes[Math.floor(minutes.length / 2)]).toBeLessThan(1.5);
    expect(minutes[minutes.length - 1]).toBeLessThan(15);
  });
});

describe("the treat held out", () => {
  it("goes round the basket's treats, after the last one only liked, and is never the fly agaric", () => {
    const basket = { ...emptyBasket(), bilberry: 2, porcini: 1, "fly-agaric": 4 };
    expect(treatInHand(basket, null)).toBe("bilberry");
    expect(treatInHand(basket, "bilberry")).toBe("porcini");
    expect(treatInHand(basket, "porcini")).toBe("bilberry");
    expect(treatInHand({ ...emptyBasket(), "fly-agaric": 3 }, null)).toBeNull();
  });
});
