import { describe, expect, it } from "vitest";
import { CAST } from "./cast";
import { homeOf } from "./level";
import type { Animal, World } from "./types";
import { awaitingName, finished, namePair, newWorld, pickUp, putDown } from "./world";

function lostAt(animal: Animal) {
  if (animal.where.kind !== "lost") throw new Error(`${animal.id} isn't lost`);
  return animal.where.at;
}

function bringHome(world: World, animal: Animal, player: string) {
  const held = pickUp(world, player, animal.id, lostAt(animal));
  return putDown(held, player, homeOf(animal.species));
}

describe("bringing pairs home", () => {
  it("is together only once both are home, and asks whoever brought the second for a name", () => {
    const world = newWorld();
    const [a, b] = world.animals.filter((x) => x.species === CAST[0].id);
    const first = bringHome(world, a, "elliott");
    expect(first.outcome).toBe("home");
    const second = bringHome(first.world, b, "sonja");
    expect(second.outcome).toBe("reunited");
    expect(awaitingName(second.world, "sonja")?.species).toBe(CAST[0].id);
    expect(awaitingName(second.world, "elliott")).toBeUndefined();
  });

  it("keeps an animal in the player's arms at another pair's home", () => {
    const world = newWorld();
    const animal = world.animals[0];
    const other = CAST.find((p) => p.id !== animal.species);
    if (other === undefined) throw new Error("only one pair");
    const held = pickUp(world, "elliott", animal.id, lostAt(animal));
    expect(putDown(held, "elliott", homeOf(other.id))).toEqual({ world: held, outcome: "wrong-home" });
  });

  it("is over once every pair is home and named", () => {
    let world = newWorld();
    for (const animal of world.animals) world = bringHome(world, animal, "sonja").world;
    expect(finished(world)).toBe(false);
    for (const pair of CAST) world = namePair(world, pair.id, "Pip and Pop", "Sonja");
    expect(finished(world)).toBe(true);
  });
});
