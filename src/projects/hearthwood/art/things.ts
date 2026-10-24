import { DoubleSide } from "three";
import type { AtmosphereUniforms } from "./atmosphere";
import { diorama, type DioramaMaterial } from "./materials";

/*
 * The shared materials things are drawn with: every vertex-coloured solid
 * thing in a scene (camp, Elliott, the people, forage, clues, dishes,
 * brews, places) is one graph, so one pipeline, per world's air, and so is
 * every berry bush (foliage, which sways). Whoever draws a thing takes the
 * material from here and never disposes it: it lives as long as the air.
 */

function perAir<T>(build: (air: AtmosphereUniforms) => T): (air: AtmosphereUniforms) => T {
  const made = new WeakMap<AtmosphereUniforms, T>();
  return (air) => {
    let value = made.get(air);
    if (value === undefined) {
      value = build(air);
      made.set(air, value);
    }
    return value;
  };
}

/** Solid things coloured in their vertices. */
export const thingMaterial = perAir((air): DioramaMaterial => diorama("solid", air, { vertexColors: true }));

/** Solid things coloured in their vertices, seen from either face (thin sheets: a cloak, a wing of a shrine's roof). */
export const sheetMaterial = perAir((air): DioramaMaterial => diorama("solid", air, { vertexColors: true, side: DoubleSide }));

/** Low plants coloured in their vertices, which sway and part as the plants do (the berry bushes and herbs). */
export const bushMaterial = perAir((air): DioramaMaterial => diorama("foliage", air, { vertexColors: true }));
