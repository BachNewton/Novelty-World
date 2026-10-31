import { BRANDS } from "./brands";
import { bannerFlag, barrel, bayLines, bollard, fuelPump, lampPost, planter, postSign, pylon, rollerDoor, tyre, tyreStack, windowFrame } from "./kit";
import { Shell, type Soup, type V3 } from "./shell";

/*
 * The buildings from the road. Each stands on a slab of its own that runs down below the ground, so it sits on real
 * ground that isn't flat, and faces +z, the street. A car slot is a place for a real car, drawn by the caller.
 */

export const EXTERIOR_IDS = ["village-garage", "town-dealer", "waterfront-showroom", "used-lot", "tyre-shop"] as const;
export type ExteriorId = (typeof EXTERIOR_IDS)[number];

export interface CarSlot {
  /** A `CarSpec` name. */
  car: string;
  /** A paint token, for another colour than the car's own. */
  paint?: string;
  /** The ground under the car's middle. */
  at: V3;
  yaw: number;
}

export interface Exterior {
  id: ExteriorId;
  soup: Soup;
  slots: readonly CarSlot[];
  /** Half the plot, x and z, about the origin. Nothing in the model leaves it, by much. */
  plotHalf: readonly [number, number];
  /** Where a car drives in to enter the building: its point on the ground, and how close counts. */
  entrance: { at: V3; radiusM: number };
}

const SINK = -0.7;
const WALL_FOOT: readonly number[] = [0.82, 0.82, 1, 1];

function slab(s: Shell, x0: number, z0: number, x1: number, z1: number, paint: Parameters<Shell["box"]>[2], pattern: "speckle" | "tiles" = "speckle", top = 0.05) {
  s.box([x0, SINK, z0], [x1, top, z1], paint, { pattern });
}

function villageGarage(): Exterior {
  const s = new Shell();
  const brand = BRANDS.klippa;
  slab(s, -13, -11, 12, 12, "dealer-gravel");

  // The workshop: Åland red boards, white trim, a tin roof, the ridge along the street.
  const [wx0, wx1, wz0, wz1, eave, ridge] = [-11, 7, -9, 0, 4.3, 6.4];
  const midZ = (wz0 + wz1) / 2;
  s.box([wx0, SINK, wz0], [wx1, eave, wz1], "wall-red", { pattern: "boards", shade: WALL_FOOT }, ["bottom", "top"]);
  s.tri([wx0, eave, wz1], [wx0, ridge, midZ], [wx0, eave, wz0], "wall-red", { pattern: "boards" });
  s.tri([wx1, eave, wz0], [wx1, ridge, midZ], [wx1, eave, wz1], "wall-red", { pattern: "boards" });
  for (const [front, back] of [[wz1 + 0.45, midZ], [wz0 - 0.45, midZ]]) {
    const low = eave - 0.2;
    s.quad([wx0 - 0.35, low, front], [wx1 + 0.35, low, front], [wx1 + 0.35, ridge + 0.02, back], [wx0 - 0.35, ridge + 0.02, back], "dealer-steel-dark", { pattern: "seams" });
    s.box([wx0 - 0.35, low - 0.18, Math.min(front, front + 0.05)], [wx1 + 0.35, low, Math.max(front, front + 0.05)], "wall-trim");
  }
  for (const x of [wx0, wx1]) s.box([x - 0.06, 0, wz1 - 0.06], [x + 0.06, eave, wz1 + 0.06], "wall-trim");
  s.box([wx1 - 3.2, 5.2, midZ - 0.25], [wx1 - 2.7, 7.1, midZ + 0.25], "wall-plinth");

  s.within({ x: -7.4, z: wz1 + 0.01 }, () => rollerDoor(s, 3.6, 3.3, true));
  s.within({ x: -2.8, z: wz1 + 0.01 }, () => rollerDoor(s, 3.6, 3.3, false));
  s.within({ x: 2, z: wz1 + 0.01 }, () => {
    s.box([-0.55, 0, 0], [0.55, 2.2, 0.06], "wall-trim");
    s.quad([-0.45, 0.05, 0.065], [0.45, 0.05, 0.065], [0.45, 2.1, 0.065], [-0.45, 2.1, 0.065], "wall-glass", { gloss: 0.7 });
  });
  s.within({ x: 4.9, z: wz1 + 0.01 }, () => windowFrame(s, 2.4, 1.4, 1, "wall-trim", true));
  for (const x of [-7, -1]) s.within({ x: wx1 + 0.01 + 0, z: -4.5 + x / 2, yaw: Math.PI / 2 }, () => windowFrame(s, 1.5, 1.1, 1.4, "wall-trim"));
  for (const x of [-8, -3, 3]) s.within({ x, z: wz0 - 0.01, yaw: Math.PI }, () => windowFrame(s, 1.4, 0.9, 2.1, "wall-trim"));

  // Its sign along the fascia, a plain board with the old painted name.
  s.box([-10, 3.55, wz1 + 0.04], [0.8, 4.12, wz1 + 0.12], "wall-trim");
  s.within({ x: -3.2, y: 3.63, z: wz1 + 0.125 }, () => s.text(brand.line, 0.4, "wall-red"));
  s.within({ x: -9.2, y: 3.84, z: wz1 + 0.125 }, () => s.logo(brand, 0.25));
  s.within({ x: 4.5, y: 3.05, z: wz1 + 0.06 }, () => {
    s.box([-1.8, 0, 0], [1.8, 0.8, 0.08], brand.colour);
    s.within({ y: 0.2, z: 0.085 }, () => s.text(brand.name, 0.4, brand.ink));
  });
  s.within({ x: -5, y: 3.4, z: wz1 + 0.3 }, () => s.box([-0.2, 0, -0.3], [0.2, 0.06, 0.1], "dealer-steel-dark"));

  // A single pump island, under a flat canopy.
  const [canopyZ, canopyH] = [6.5, 4.5];
  s.within({ x: 3.5, z: canopyZ }, () => {
    s.box([-3.6, 0, -0.75], [3.6, 0.16, 0.75], "dealer-concrete");
    for (const x of [-1.6, 1.6]) s.within({ x, y: 0.16 }, () => fuelPump(s, brand));
    for (const x of [-2.9, 2.9]) s.box([x - 0.11, 0, -0.11], [x + 0.11, canopyH, 0.11], "wall-trim");
    s.box([-4.6, canopyH, -2.6], [4.6, canopyH + 0.42, 2.6], brand.colour, {}, []);
    s.quad([-4.5, canopyH - 0.005, -2.5], [4.5, canopyH - 0.005, -2.5], [4.5, canopyH - 0.005, 2.5], [-4.5, canopyH - 0.005, 2.5], "wall-trim");
    for (const x of [-2.4, 2.4]) s.quad([x - 0.5, canopyH - 0.01, -0.3], [x + 0.5, canopyH - 0.01, -0.3], [x + 0.5, canopyH - 0.01, 0.3], [x - 0.5, canopyH - 0.01, 0.3], "dealer-light-warm", { glow: 1 });
    s.within({ y: canopyH + 0.06, z: 2.605 }, () => s.text(brand.name, 0.3, brand.ink));
    s.within({ x: -3.2, y: canopyH + 0.21, z: 2.606 }, () => s.logo(brand, 0.17));
  });

  // The roadside: a price board, an air post, the yard's clutter.
  s.within({ x: -10, z: 10.3 }, () => {
    postSign(s, [brand.name, "95 1.79", "D  1.72"], 2, 2.3, 1.2, "wall-trim", brand.ink);
  });
  s.within({ x: -1.4, z: 7 }, () => {
    s.box([-0.1, 0, -0.08], [0.1, 1.3, 0.08], "wall-red");
    s.bar([0.1, 1.05, 0], [0.26, 0.45, 0], 0.03, "dealer-rubber");
  });
  s.within({ x: 8.2, z: -1.2 }, () => tyreStack(s, 4));
  s.within({ x: 8.3, z: -2.1 }, () => tyreStack(s, 3));
  s.within({ x: 8.9, z: -0.5 }, () => tyreStack(s, 2));
  s.within({ x: 8.4, z: -4 }, () => barrel(s, "dealer-klippa"));
  s.within({ x: 8.5, z: -4.7 }, () => barrel(s, "wall-plinth"));
  s.within({ x: -12, z: -5 }, () => {
    s.box([-0.7, 0, -1.6], [0.7, 0.9, 1.6], "wall-grey");
    s.box([-0.72, 0.9, -1.62], [0.72, 1.02, 1.62], "dealer-steel-dark", { pattern: "seams" });
  });

  return {
    id: "village-garage",
    soup: s.build(),
    slots: [
      { car: "Holm", at: [-7.4, 0.05, 3.6], yaw: 0 },
      { car: "Kobb", at: [-11, 0.05, 6.5], yaw: 0.3, paint: "car-paint-silver" },
    ],
    plotHalf: [13, 12],
    entrance: { at: [-7.4, 0, 0.8], radiusM: 3 },
  };
}

function townDealer(): Exterior {
  const s = new Shell();
  const brand = BRANDS.vastan;
  slab(s, -20, -23, 20, 14, "dealer-paving", "tiles");
  s.box([-21, SINK, 14], [21, 0.14, 14.3], "dealer-concrete", {}, ["bottom"]);

  // The body: pale panels, the glass along the forecourt, a band of brand colour over it.
  const [x0, x1, z0, z1, top] = [-17, 17, -20, -2, 7.2];
  const glassTop = 5.6;
  s.box([x0, SINK, z0], [x1, top, z1], "dealer-panel", { pattern: "seams", shade: WALL_FOOT }, ["bottom"]);
  s.box([x0 - 0.2, top, z0 - 0.2], [x1 + 0.2, top + 0.3, z1 + 0.2], "dealer-steel-dark", {}, ["bottom"]);
  s.box([x0 + 3, top + 0.3, -13], [x0 + 8, top + 1.2, -9], "dealer-steel", { pattern: "ribs" });
  s.box([3, top + 0.3, -15], [6, top + 0.9, -12], "dealer-steel", { pattern: "ribs" });

  const [gx0, gx1] = [-14, 11];
  const gz = z1 + 0.04;
  s.quad([gx0, 0.05, gz], [gx1, 0.05, gz], [gx1, glassTop, gz], [gx0, glassTop, gz], "dealer-glass", { gloss: 1, shade: [0.72, 0.72, 1.05, 1.05] });
  // What the glass shows: the lit ceiling, the far wall's band of colour.
  s.quad([gx0, glassTop - 0.75, gz + 0.005], [gx1, glassTop - 0.75, gz + 0.005], [gx1, glassTop - 0.2, gz + 0.005], [gx0, glassTop - 0.2, gz + 0.005], "dealer-light-cool", { glow: 0.55, shade: 0.8 });
  s.quad([gx0, 1.1, gz + 0.004], [gx1, 1.1, gz + 0.004], [gx1, 2.6, gz + 0.004], [gx0, 2.6, gz + 0.004], "dealer-vastan", { glow: 0.2, shade: 0.5 });
  for (let x = gx0; x <= gx1 + 0.01; x += 25 / 8) s.box([x - 0.05, 0.05, gz], [x + 0.05, glassTop, gz + 0.12], "dealer-steel-dark");
  s.box([gx0, 2.75, gz], [gx1, 2.83, gz + 0.08], "dealer-steel-dark");
  s.box([gx0, glassTop, gz], [gx1, glassTop + 0.1, gz + 0.14], "dealer-steel-dark");

  s.box([gx0 - 0.2, glassTop + 0.1, gz], [x1 + 0.02, top, gz + 0.1], brand.colour, { shade: [0.92, 0.92, 1, 1] });
  s.within({ x: -1.5, y: glassTop + 0.4, z: gz + 0.105 }, () => s.text(brand.name, 0.86, brand.ink, { glow: 0.9 }));
  s.within({ x: 6.4, y: glassTop + 0.48, z: gz + 0.105 }, () => s.text(brand.line, 0.5, brand.ink, { glow: 0.9 }));
  s.within({ x: -7.6, y: glassTop + 0.83, z: gz + 0.105 }, () => s.logo(brand, 0.58, { glow: 0.9 }));

  // A taller tower at the end, and a canopy over the door.
  s.box([11.6, SINK, z1 - 1.2], [x1 + 0.3, top + 2.6, z1 + 0.8], brand.colour, { shade: WALL_FOOT }, ["bottom"]);
  s.within({ x: 14.4, y: top - 0.2, z: z1 + 0.81 }, () => s.logo(brand, 1.8, { glow: 0.85 }));
  s.within({ x: 14.4, y: 3.2, z: z1 + 0.81 }, () => s.text(brand.line, 0.5, brand.ink, { glow: 0.85 }));
  s.box([-5.5, 3.1, gz], [-0.5, 3.34, gz + 3], "dealer-steel-dark", {}, []);
  s.quad([-5.2, 3.09, gz + 0.5], [-0.8, 3.09, gz + 0.5], [-0.8, 3.09, gz + 2.5], [-5.2, 3.09, gz + 2.5], "dealer-light-cool", { glow: 0.9 });
  for (const x of [-5.3, -0.7]) s.box([x - 0.05, 0.05, gz + 2.76], [x + 0.05, 3.1, gz + 2.86], "dealer-steel-dark");

  // The workshop round the side.
  s.within({ x: x0 - 0.01, z: -14, yaw: -Math.PI / 2 }, () => rollerDoor(s, 3.8, 3.6, false));
  s.within({ x: x0 - 0.01, z: -8.6, yaw: -Math.PI / 2 }, () => rollerDoor(s, 3.8, 3.6, true));
  for (let z = -18; z <= -4; z += 3.5) s.within({ x: x1 + 0.01, z, yaw: Math.PI / 2 }, () => windowFrame(s, 2, 1.2, 2.6, "dealer-steel-dark"));

  // The forecourt.
  const front = 11.6;
  for (let bay = 0; bay < 8; bay++) s.within({ x: -13.2 + bay * 3.1, y: 0.05, z: front }, () => bayLines(s, 3.1, 5.4));
  for (const x of [-18.6, 18.4]) s.within({ x, y: 0.05, z: 8 }, () => lampPost(s, 7));
  s.within({ x: 18.4, y: 0.05, z: 2, yaw: Math.PI }, () => lampPost(s, 7));
  s.within({ x: -18, y: 0.05, z: 12.4 }, () => pylon(s, brand, 2.2, 8.5));
  for (const x of [5, 8, 11]) s.within({ x, y: 0.05, z: 13.1 }, () => bannerFlag(s, brand, 7));
  for (const x of [-11, 1, 15]) s.within({ x, y: 0.05, z: -0.3 }, () => planter(s, 3));
  for (let x = -14; x < 3; x += 3.2) s.within({ x, y: 0.05, z: 13.3 }, () => bollard(s, 0.8, "dealer-steel-dark"));

  const cars: [string, string?][] = [["Fjärd"], ["Ljus", "car-paint-silver"], ["Ljus"], ["Fjärd", "car-paint-white"], ["Ljus", "car-paint-graphite"], ["Fjärd", "car-paint-teal"]];
  return {
    id: "town-dealer",
    soup: s.build(),
    slots: cars.map(([car, paint], bay) => ({ car, paint, at: [-13.2 + bay * 3.1, 0.05, front - 2.7] as const, yaw: Math.PI })),
    plotHalf: [20, 23],
    entrance: { at: [-3, 0, 1.2], radiusM: 3.5 },
  };
}

function waterfrontShowroom(): Exterior {
  const s = new Shell();
  const brand = BRANDS.tarna;
  slab(s, -18, -9, 18, 20, "dealer-paving-dark", "tiles");

  // A long low pavilion: stone plinth, tarred boards to the street, all glass to the sea, one roof tilting up to the water.
  const [x0, x1, z0, z1] = [-14, 14, -8, 8];
  const [lowH, highH] = [3.9, 6.3];
  const heightAt = (z: number) => lowH + ((z1 + 1.8 - z) / (z1 + 1.8 - (z0 - 3))) * (highH - lowH);
  s.box([x0 - 0.2, SINK, z0], [x1 + 0.2, 0.4, z1 + 0.2], "dealer-stone", {}, ["bottom"]);
  s.quad([x0, 0.4, z1], [x1, 0.4, z1], [x1, heightAt(z1), z1], [x0, heightAt(z1), z1], "dealer-timber-dark", { pattern: "boards" });
  // The end walls, tall glass with boards at the street's end.
  for (const [x, yaw] of [[x0, -Math.PI / 2], [x1, Math.PI / 2]] as const) {
    s.quad([x, 0.4, z1], [x, 0.4, 2], [x, heightAt(2), 2], [x, heightAt(z1), z1], "dealer-timber-dark", { pattern: "boards" });
    s.quad([x, 0.4, 2], [x, 0.4, z0], [x, heightAt(z0), z0], [x, heightAt(2), 2], "dealer-glass", { gloss: 1, shade: [0.72, 0.72, 1.05, 1.05] });
    for (let z = 2; z >= z0 - 0.01; z -= 2.5) s.within({ x, z, yaw }, () => s.box([-0.04, 0.4, 0], [0.04, heightAt(z), 0.1], "dealer-rubber"));
  }
  s.quad([x1, 0.4, z0], [x0, 0.4, z0], [x0, heightAt(z0), z0], [x1, heightAt(z0), z0], "dealer-glass", { gloss: 1, shade: [0.72, 0.72, 1.05, 1.05] });
  for (let x = x0; x <= x1 + 0.01; x += 3.5) s.box([x - 0.04, 0.4, z0 - 0.1], [x + 0.04, heightAt(z0), z0], "dealer-rubber");

  const eave = (z: number, x: number, lift: number): V3 => [x, heightAt(z) + lift, z];
  const [rx0, rx1, rz0, rz1] = [x0 - 1.5, x1 + 1.5, z0 - 3, z1 + 1.8];
  const roofThick = 0.3;
  s.quad(eave(rz1, rx0, roofThick), eave(rz1, rx1, roofThick), eave(rz0, rx1, roofThick), eave(rz0, rx0, roofThick), "dealer-steel-dark", { pattern: "seams" });
  s.quad(eave(rz1, rx0, 0), eave(rz1, rx1, 0), eave(rz0, rx1, 0), eave(rz0, rx0, 0), "dealer-timber", { pattern: "boards" });
  s.quad(eave(rz1, rx0, 0), eave(rz1, rx1, 0), eave(rz1, rx1, roofThick), eave(rz1, rx0, roofThick), brand.ink, { glow: 0.3 });
  s.quad(eave(rz0, rx1, 0), eave(rz0, rx0, 0), eave(rz0, rx0, roofThick), eave(rz0, rx1, roofThick), brand.ink, { glow: 0.3 });
  for (const x of [rx0, rx1]) s.quad(eave(rz1, x, 0), eave(rz0, x, 0), eave(rz0, x, roofThick), eave(rz1, x, roofThick), "dealer-steel-dark");
  for (const x of [-15, -7.5, 0, 7.5, 15]) s.bar([x, 0.05, -10.6], [x, heightAt(-10.6), -10.6], 0.13, "dealer-rubber");

  // The way in: a tall slot of glass with the logo in light beside it.
  const doorH = heightAt(z1);
  s.quad([-2.2, 0.4, z1 + 0.03], [2.2, 0.4, z1 + 0.03], [2.2, doorH - 0.2, z1 + 0.03], [-2.2, doorH - 0.2, z1 + 0.03], "dealer-light-warm", { glow: 0.6 });
  for (const x of [-2.2, 0, 2.2]) s.box([x - 0.05, 0.4, z1], [x + 0.05, doorH - 0.15, z1 + 0.09], "dealer-tarna");
  s.within({ x: -6.5, y: 2.2, z: z1 + 0.04 }, () => s.logo(brand, 0.9, { glow: 0.9 }));
  s.within({ x: 6.5, y: 1.9, z: z1 + 0.04 }, () => s.text(brand.name, 0.74, "dealer-tarna", { glow: 0.95 }));
  s.within({ y: 0.05, z: z1 + 3.6 }, () => {
    s.box([-3.5, 0, -2], [3.5, 0.36, 2], "dealer-stone");
    s.box([-3.5, 0, 2], [-2, 0.2, 3], "dealer-stone");
  });
  s.within({ y: 0.05, z: z1 + 1.1 }, () => s.box([-3.5, 0, -1.2], [3.5, 0.2, 0.2], "dealer-stone"));

  // Street side: a low wall with the name, lights along the walk, a car on a disc of stone.
  s.within({ x: 10, y: 0.05, z: 18.4 }, () => {
    s.box([-5.5, 0, -0.28], [5.5, 1.2, 0.28], "dealer-stone");
    s.within({ y: 0.32, z: 0.285 }, () => s.text(brand.name, 0.54, brand.ink));
    s.within({ x: -4.2, y: 0.6, z: 0.285 }, () => s.logo(brand, 0.42));
  });
  s.within({ x: -9, y: 0.05, z: 14 }, () => s.lathe([[3.2, 0], [3.2, 0.24], [3.05, 0.27], [0, 0.27]], 20, "dealer-stone"));
  for (let x = -15; x <= 15; x += 5) s.within({ x, y: 0.05, z: 10.4 }, () => bollard(s, 0.75, "dealer-tarna-ink"));
  for (let x = -15; x <= 15; x += 5) s.within({ x, y: 0.75, z: 10.4 }, () => s.box([-0.08, 0, -0.08], [0.08, 0.05, 0.08], "dealer-light-warm", { glow: 1 }));
  for (const x of [-16, 16]) s.within({ x, y: 0.05, z: 16 }, () => bannerFlag(s, brand, 8));

  // The sea side: a deck on piles, a pier with a place for a car, a ladder of railing.
  const [deckTop, seaFoot] = [0.32, -2.2];
  s.box([-17, -0.05, -15], [17, deckTop, -9], "dealer-timber", { pattern: "boards" }, ["bottom"]);
  s.box([-3, -0.05, -30], [3, deckTop, -15], "dealer-timber", { pattern: "boards" }, ["bottom"]);
  for (let x = -16; x <= 16; x += 4) s.bar([x, seaFoot, -14.8], [x, 0, -14.8], 0.2, "wall-plinth");
  for (const [x, z] of [[-2.8, -21], [2.8, -21], [-2.8, -29.8], [2.8, -29.8]]) s.bar([x, seaFoot, z], [x, 0, z], 0.2, "wall-plinth");
  const rail = (from: V3, to: V3) => {
    s.bar(from, to, 0.05, "dealer-steel");
    const steps = Math.round(Math.hypot(to[0] - from[0], to[2] - from[2]) / 3);
    for (let step = 0; step <= steps; step++) {
      const share = step / steps;
      const x = from[0] + (to[0] - from[0]) * share;
      const z = from[2] + (to[2] - from[2]) * share;
      s.box([x - 0.03, deckTop, z - 0.03], [x + 0.03, from[1], z + 0.03], "dealer-steel");
    }
  };
  const railH = deckTop + 1;
  rail([-17, railH, -15], [-3, railH, -15]);
  rail([3, railH, -15], [17, railH, -15]);
  rail([-3, railH, -15], [-3, railH, -30]);
  rail([3, railH, -15], [3, railH, -30]);
  rail([-3, railH, -30], [3, railH, -30]);

  return {
    id: "waterfront-showroom",
    soup: s.build(),
    slots: [
      { car: "Skerry GT", at: [-9, 0.32, 14], yaw: 2.4 },
      { car: "Sund", at: [0, deckTop, -24], yaw: 0.5, paint: "car-paint-white" },
    ],
    plotHalf: [18, 30],
    entrance: { at: [0, 0, 12], radiusM: 4 },
  };
}

function usedLot(): Exterior {
  const s = new Shell();
  slab(s, -17, -11, 17, 11, "dealer-asphalt", "speckle", 0.03);

  // A hut, a lit window, a sign on a tall frame.
  s.within({ x: 11, z: -7 }, () => {
    s.box([-3.2, SINK, -1.8], [3.2, 2.7, 1.8], "wall-trim", { pattern: "boards", shade: WALL_FOOT }, ["bottom"]);
    s.box([-3.5, 2.7, -2.1], [3.5, 2.9, 2.2], "dealer-hazard", {}, []);
    s.within({ x: -1, z: 1.81 }, () => windowFrame(s, 2.6, 1.2, 0.9, "wall-red", true));
    s.within({ x: 1.9, z: 1.81 }, () => {
      s.box([-0.5, 0, 0], [0.5, 2.1, 0.05], "wall-red");
    });
  });
  s.within({ x: -6, y: 0.03, z: 10.4 }, () => {
    postSign(s, ["BEGAGNADE", "BILAR"], 8, 1.7, 3.5, "dealer-hazard", "dealer-klippa-ink");
  });

  // Rope of bunting between tall poles.
  const poles: V3[] = [[-16.5, 0, -10.5], [-16.5, 0, 10.5], [16.5, 0, 10.5], [16.5, 0, -10.5]];
  const poleH = 5.2;
  for (const [x, , z] of poles) s.box([x - 0.06, 0, z - 0.06], [x + 0.06, poleH, z + 0.06], "dealer-steel");
  const flags = ["wall-red", "dealer-hazard", "dealer-vastan", "wall-trim"] as const;
  for (let span = 0; span < 3; span++) {
    const [from, to] = [poles[span], poles[span + 1]];
    const count = 12;
    for (let index = 0; index < count; index++) {
      const share = (index + 0.5) / count;
      const across = 2.2 * Math.pow(share - 0.5, 2) * 4;
      const x = from[0] + (to[0] - from[0]) * share;
      const z = from[2] + (to[2] - from[2]) * share;
      const [dx, dz] = [(to[0] - from[0]) / 66, (to[2] - from[2]) / 66];
      const y = poleH - 2.2 + across;
      s.tri([x - dx, y, z - dz], [x + dx, y, z + dz], [x, y - 0.42, z], flags[index % flags.length]);
    }
  }
  // Rows along the two sides.
  const slots: CarSlot[] = [];
  const cars: [string, string?][] = [["Ljus", "car-paint-mustard"], ["Fjärd", "car-paint-silver"], ["Kobb"], ["Ljus"], ["Holm", "car-paint-navy"], ["Skerry GT", "car-paint-graphite"], ["Fjärd"], ["Ljus", "car-paint-white"]];
  cars.forEach(([car, paint], index) => {
    const row = index < 5 ? 0 : 1;
    const bay = row === 0 ? index : index - 5;
    const x = -13.4 + bay * 3.3;
    const z = row === 0 ? -3.8 : 4.8;
    s.within({ x, y: 0.03, z: row === 0 ? -6.7 : 7.8, yaw: row === 0 ? 0 : Math.PI }, () => {
      s.box([-0.3, 0, -0.05], [0.3, 0.14, 0.05], "dealer-hazard");
    });
    s.within({ x, y: 1.42, z: z + (row === 0 ? 0.8 : -0.6) }, () => {
      s.quad([-0.17, 0, 0], [0.17, 0, 0], [0.17, 0.05, 0], [-0.17, 0.05, 0], "dealer-hazard", { glow: 0.3 });
    });
    slots.push({ car, paint, at: [x, 0.03, z], yaw: row === 0 ? 0 : Math.PI });
  });
  return { id: "used-lot", soup: s.build(), slots, plotHalf: [17, 11], entrance: { at: [11, 0, -3], radiusM: 3 } };
}

function tyreShop(): Exterior {
  const s = new Shell();
  slab(s, -13, -14, 13, 11, "dealer-concrete");

  const [x0, x1, z0, z1, top] = [-11, 11, -12, 0, 5];
  s.box([x0, SINK, z0], [x1, top, z1], "dealer-steel", { pattern: "ribs", shade: WALL_FOOT }, ["bottom"]);
  s.box([x0 - 0.2, top, z0 - 0.2], [x1 + 0.2, top + 0.2, z1 + 0.2], "dealer-rubber", {}, ["bottom"]);
  s.box([x0 - 0.01, 3.9, z1], [x1 + 0.01, top, z1 + 0.08], "dealer-rubber");
  s.within({ y: 4.12, z: z1 + 0.085 }, () => s.text("DÄCK + SERVICE", 0.66, "dealer-hazard", { glow: 0.8 }));
  for (const x of [-8.4, -4.2, 0]) s.within({ x, z: z1 + 0.01 }, () => rollerDoor(s, 3.5, 3.4, x === -4.2));
  s.within({ x: 6.2, z: z1 + 0.01 }, () => {
    s.box([-3.6, 0, 0], [3.6, 3.2, 0.05], "dealer-steel-dark");
    s.quad([-3.5, 0.2, 0.055], [3.5, 0.2, 0.055], [3.5, 3.1, 0.055], [-3.5, 3.1, 0.055], "dealer-glass", { gloss: 0.9, shade: [0.75, 0.75, 1, 1] });
    for (const x of [-1.2, 1.2]) s.box([x - 0.03, 0.2, 0.055], [x + 0.03, 3.1, 0.08], "dealer-steel-dark");
  });
  // The big tyre on the roof, the thing you remember the place by.
  s.within({ x: 7, y: top + 0.2 + 1.9, z: -4, pitch: Math.PI / 2 }, () => {
    const [radius, width] = [1.9, 0.9];
    s.lathe([[radius * 0.6, -width / 2], [radius * 0.9, -width / 2 - 0.02], [radius, -width / 2 + 0.12], [radius, width / 2 - 0.12], [radius * 0.9, width / 2 + 0.02], [radius * 0.6, width / 2], [radius * 0.56, 0], [radius * 0.6, -width / 2]], 12, "dealer-rubber");
    s.lathe([[radius * 0.6, -width * 0.15], [0, -width * 0.15]], 12, "dealer-steel");
    s.lathe([[radius * 0.6, width * 0.15], [0, width * 0.15]], 12, "dealer-steel");
  });
  s.box([6, top + 0.2, -4.5], [8, top + 0.5, -3.5], "dealer-steel-dark");

  // Stacks along the front, a low pile round the side.
  const stacks: [number, number, number][] = [[3.6, 1.4, 5], [4.4, 1.3, 4], [5.2, 1.4, 5], [8.6, 1.4, 3], [9.4, 1.3, 5], [10.2, 1.4, 4], [-12.2, -3, 4]];
  for (const [x, z, count] of stacks) s.within({ x, z, y: 0.05 }, () => tyreStack(s, count));
  s.within({ x: -12, y: 0.05, z: 9.6 }, () => postSign(s, ["DÄCK", "SERVICE"], 2.2, 1.6, 1.1, "dealer-hazard", "dealer-klippa-ink"));
  s.within({ x: 11.4, y: 0.05, z: 9.6, pitch: Math.PI / 2 }, () => tyre(s, -0.2, 0.7, 0.4, 10));
  for (let bay = 0; bay < 3; bay++) s.within({ x: -8.4 + bay * 4.2, y: 0.05, z: 7 }, () => bayLines(s, 3.5, 6));

  return {
    id: "tyre-shop",
    soup: s.build(),
    slots: [
      { car: "Ljus", at: [-4.2, 0.05, 3.2], yaw: 0, paint: "car-paint-teal" },
      { car: "Kobb", at: [-8.4, 0.05, 4.2], yaw: Math.PI },
    ],
    plotHalf: [13, 14],
    entrance: { at: [-4.2, 0, 1], radiusM: 3 },
  };
}

export function buildExterior(id: ExteriorId): Exterior {
  switch (id) {
    case "village-garage":
      return villageGarage();
    case "town-dealer":
      return townDealer();
    case "waterfront-showroom":
      return waterfrontShowroom();
    case "used-lot":
      return usedLot();
    case "tyre-shop":
      return tyreShop();
  }
}
