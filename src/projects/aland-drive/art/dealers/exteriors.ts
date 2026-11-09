import type { CarId } from "../../sim/cars";
import { BRANDS } from "./brands";
import { bannerFlag, barrel, bayLines, bollard, fuelPump, lampPost, planter, postSign, pylon, rollerDoor, tyre, tyreStack, windowFrame } from "./kit";
import { Shell, type Soup, type V3, type Version } from "./shell";
import { stockOf } from "./stock";

/*
 * The buildings from the road, as the game places them on their real plots (`sites.ts`). Each stands on a slab of its
 * own that runs down below the ground, so it sits on real ground that isn't flat, and faces +z, the street; its y 0 is
 * the ground at the middle of its street edge, where it meets the road. A car slot is a place for a real car, drawn by
 * the caller. Each is written once for both versions: what `detail` draws is the near version's alone, gone to a pixel
 * or two by its swap, and everything else, the far version's shape and colour, is the same in both.
 */

export const EXTERIOR_IDS = ["village-garage", "town-dealer", "premium-showroom", "used-lot", "tyre-shop"] as const;
export type ExteriorId = (typeof EXTERIOR_IDS)[number];

/** A rectangle from above in a model's own metres: x0, z0, x1, z1. */
export type Rectangle = readonly [number, number, number, number];

export interface CarSlot {
  car: CarId;
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
  /** The plot from above, west, north, east and south in its own metres (x, z): what it covers, and takes the place of on the map. */
  plot: Rectangle;
  /** What the car can't pass: the buildings, the islands and the signs it would hit. */
  walls: readonly Rectangle[];
  /** Where the street edge meets the road: the point on the ground the model's height is taken from. */
  streetZ: number;
  /** Where a player walks in, on the ground. */
  entrance: { at: V3; radiusM: number };
}

const SINK = -0.7;
const WALL_FOOT: readonly number[] = [0.82, 0.82, 1, 1];

function slab(s: Shell, x0: number, z0: number, x1: number, z1: number, paint: Parameters<Shell["box"]>[2], pattern: "speckle" | "tiles" = "speckle", top = 0.05) {
  s.box([x0, SINK, z0], [x1, top, z1], paint, { pattern });
}

function villageGarage(s: Shell): Omit<Exterior, "soup"> {
  const brand = BRANDS.klippa;
  slab(s, -13, -11, 13, 12, "dealer-gravel");

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

  // Two bays and the office door; the open bay shows the strip lights inside once the lamps are lit.
  s.within({ x: -7.4, z: wz1 + 0.01 }, () => rollerDoor(s, 3.6, 3.3, true));
  s.within({ x: -2.8, z: wz1 + 0.01 }, () => rollerDoor(s, 3.6, 3.3, false));
  s.within({ x: 1.2, z: wz1 + 0.01 }, () => {
    s.box([-0.55, 0, 0], [0.55, 2.2, 0.06], "wall-trim");
    s.quad([-0.45, 0.05, 0.065], [0.45, 0.05, 0.065], [0.45, 2.1, 0.065], [-0.45, 2.1, 0.065], "wall-glass", { gloss: 0.7, lit: 0.6 });
  });
  s.within({ x: 4.2, z: wz1 + 0.01 }, () => windowFrame(s, 2.4, 1.4, 1, "wall-trim", true));
  s.detail(() => {
    for (const z of [-7.5, -1.5]) s.within({ x: wx1 + 0.01, z, yaw: Math.PI / 2 }, () => windowFrame(s, 1.5, 1.1, 1.4, "wall-trim"));
    for (const x of [-8, -3, 3]) s.within({ x, z: wz0 - 0.01, yaw: Math.PI }, () => windowFrame(s, 1.4, 0.9, 2.1, "wall-trim"));
  });

  // Its name along the fascia, a plain board with the old painted letters, clear of the pump's canopy.
  s.box([-10.4, 3.55, wz1 + 0.04], [2.6, 4.12, wz1 + 0.12], "wall-trim");
  s.detail(() => {
    s.within({ x: -3.4, y: 3.63, z: wz1 + 0.125 }, () => s.text("KLIPPA BILVERKSTAD", 0.4, "wall-red"));
    s.within({ x: -9.7, y: 3.84, z: wz1 + 0.125 }, () => s.logo(brand, 0.25));
  });

  // A single pump island, under a flat canopy off to the east of the yard.
  const [canopyX, canopyZ, canopyH] = [7.6, 8, 4.5];
  s.within({ x: canopyX, z: canopyZ }, () => {
    s.box([-3.6, 0, -0.75], [3.6, 0.16, 0.75], "dealer-concrete");
    s.detail(() => {
      for (const x of [-1.6, 1.6]) s.within({ x, y: 0.16 }, () => fuelPump(s, brand));
    });
    for (const x of [-2.9, 2.9]) s.box([x - 0.11, 0, -0.11], [x + 0.11, canopyH, 0.11], "wall-trim");
    s.box([-4.6, canopyH, -2.6], [4.6, canopyH + 0.42, 2.6], brand.colour, {}, []);
    s.quad([-4.5, canopyH - 0.005, -2.5], [4.5, canopyH - 0.005, -2.5], [4.5, canopyH - 0.005, 2.5], [-4.5, canopyH - 0.005, 2.5], "wall-trim");
    for (const x of [-2.4, 2.4]) s.quad([x - 0.5, canopyH - 0.015, -0.3], [x + 0.5, canopyH - 0.015, -0.3], [x + 0.5, canopyH - 0.015, 0.3], [x - 0.5, canopyH - 0.015, 0.3], "dealer-light-warm", { glow: 1 });
    s.detail(() => {
      s.within({ y: canopyH + 0.06, z: 2.605 }, () => s.text(brand.name, 0.3, brand.ink));
      s.within({ x: -3.2, y: canopyH + 0.21, z: 2.606 }, () => s.logo(brand, 0.17));
    });
  });

  // The roadside: a price board at the corner, an air post, the yard's clutter.
  s.within({ x: -12.2, z: 11.2 }, () => postSign(s, [brand.name, "95 1.79", "D 1.72"], 2, 2.3, 1.2, "wall-trim", brand.ink));
  s.detail(() => {
    s.within({ x: 2.2, z: 4.6 }, () => {
      s.box([-0.1, 0, -0.08], [0.1, 1.3, 0.08], "wall-red");
      s.bar([0.1, 1.05, 0], [0.26, 0.45, 0], 0.03, "dealer-rubber");
    });
    s.within({ x: 8.2, z: -1.2 }, () => tyreStack(s, 4));
    s.within({ x: 8.3, z: -2.1 }, () => tyreStack(s, 3));
    s.within({ x: 8.9, z: -0.5 }, () => tyreStack(s, 2));
    s.within({ x: 8.4, z: -4 }, () => barrel(s, "dealer-klippa"));
    s.within({ x: 8.5, z: -4.7 }, () => barrel(s, "wall-plinth"));
  });
  s.within({ x: -12, z: -5 }, () => {
    s.box([-0.7, 0, -1.6], [0.7, 0.9, 1.6], "wall-grey");
    s.box([-0.72, 0.9, -1.62], [0.72, 1.02, 1.62], "dealer-steel-dark", { pattern: "seams" });
  });

  // Klippa's five: one in the open bay, the rest in a row facing the road.
  const [inBay, ...row] = stockOf("village-garage");
  return {
    id: "village-garage",
    slots: [{ car: inBay, at: [-7.4, 0.05, 3.1], yaw: 0 }, ...row.map((car, index) => ({ car, at: [-9.8 + index * 2.75, 0.05, 8.9] as const, yaw: Math.PI }))],
    plot: [-13, -11, 13, 12],
    walls: [[wx0, wz0, wx1, wz1], [canopyX - 3.6, canopyZ - 0.75, canopyX + 3.6, canopyZ + 0.75], [-12.7, -6.6, -11.3, -3.4]],
    streetZ: 12,
    entrance: { at: [1.2, 0, 1], radiusM: 2 },
  };
}

/** The town dealer's name: a firm of the island's own, which no real one is called. */
export const TOWN_DEALER_NAME = "NORRVIND";

function townDealer(s: Shell): Omit<Exterior, "soup"> {
  const brands = [BRANDS.vastan, BRANDS.odmark, BRANDS.norrsken];
  slab(s, -20, -23, 20, 14, "dealer-paving", "tiles");
  s.box([-21, SINK, 14], [21, 0.14, 14.3], "dealer-concrete", {}, ["bottom"]);

  // The body: pale panels, the glass along the forecourt, a band of the house colour over it.
  const [x0, x1, z0, z1, top] = [-17, 17, -20, -2, 7.2];
  const glassTop = 5.6;
  s.box([x0, SINK, z0], [x1, top, z1], "dealer-panel", { pattern: "seams", shade: WALL_FOOT }, ["bottom"]);
  s.box([x0 - 0.2, top, z0 - 0.2], [x1 + 0.2, top + 0.3, z1 + 0.2], "dealer-steel-dark", {}, ["bottom"]);
  s.box([x0 + 3, top + 0.3, -13], [x0 + 8, top + 1.2, -9], "dealer-steel", { pattern: "ribs" });
  s.box([3, top + 0.3, -15], [6, top + 0.9, -12], "dealer-steel", { pattern: "ribs" });

  // The glass, in rows: what it shows through it by day (the lit ceiling, the far wall's band) are rows of their own,
  // so no face lies on another. At night the floor behind it is lit.
  const [gx0, gx1] = [-14, 11];
  const gz = z1 + 0.04;
  const row = (y0: number, y1: number, paint: "dealer-glass" | "dealer-light-cool" | "dealer-house", finish: Parameters<Shell["quad"]>[5]) => s.quad([gx0, y0, gz], [gx1, y0, gz], [gx1, y1, gz], [gx0, y1, gz], paint, finish);
  const night = { lit: 0.85, litTone: "cool" } as const;
  row(0.05, 1.1, "dealer-glass", { gloss: 1, shade: 0.72, ...night });
  row(1.1, 2.6, "dealer-house", { glow: 0.2, shade: 0.5, ...night });
  row(2.6, glassTop - 0.75, "dealer-glass", { gloss: 1, shade: [0.9, 0.9, 1.05, 1.05], ...night });
  row(glassTop - 0.75, glassTop - 0.2, "dealer-light-cool", { glow: 0.55, shade: 0.8, ...night });
  row(glassTop - 0.2, glassTop, "dealer-glass", { gloss: 1, shade: 1.05, ...night });
  for (let x = gx0; x <= gx1 + 0.01; x += 25 / 8) s.box([x - 0.05, 0.05, gz], [x + 0.05, glassTop, gz + 0.12], "dealer-steel-dark");
  s.box([gx0, 2.75, gz + 0.02], [gx1, 2.83, gz + 0.1], "dealer-steel-dark");
  s.box([gx0, glassTop, gz], [gx1, glassTop + 0.1, gz + 0.14], "dealer-steel-dark");

  // The fascia: the dealer's name, and the badges of the three makers it sells.
  s.box([gx0 - 0.2, glassTop + 0.1, gz], [x1 + 0.02, top, gz + 0.1], "dealer-house", { shade: [0.92, 0.92, 1, 1] });
  s.within({ x: -3.5, y: glassTop + 0.4, z: gz + 0.105 }, () => s.text(TOWN_DEALER_NAME, 0.86, "dealer-house-ink", { glow: 0.9 }));
  s.detail(() => {
    s.within({ x: 4.6, y: glassTop + 0.48, z: gz + 0.105 }, () => s.text("BILAR", 0.5, "dealer-house-ink", { glow: 0.9 }));
  });

  // A taller tower at the end, the three badges down it, and a canopy over the door.
  s.box([11.6, SINK, z1 - 1.2], [x1 + 0.3, top + 2.6, z1 + 0.8], "dealer-house", { shade: WALL_FOOT }, ["bottom"]);
  brands.forEach((brand, index) => s.within({ x: 14.4, y: top + 1.2 - index * 2.6, z: z1 + 0.81 }, () => s.logo(brand, 1.05, { glow: 0.85 })));
  s.box([-5.5, 3.1, gz], [-0.5, 3.34, gz + 3], "dealer-steel-dark", {}, []);
  s.quad([-5.2, 3.09, gz + 0.5], [-0.8, 3.09, gz + 0.5], [-0.8, 3.09, gz + 2.5], [-5.2, 3.09, gz + 2.5], "dealer-light-cool", { glow: 0.9 });
  for (const x of [-5.3, -0.7]) s.box([x - 0.05, 0.05, gz + 2.76], [x + 0.05, 3.1, gz + 2.86], "dealer-steel-dark");

  // The workshop round the side.
  s.within({ x: x0 - 0.01, z: -14, yaw: -Math.PI / 2 }, () => rollerDoor(s, 3.8, 3.6, false));
  s.within({ x: x0 - 0.01, z: -8.6, yaw: -Math.PI / 2 }, () => rollerDoor(s, 3.8, 3.6, true));
  s.detail(() => {
    for (let z = -18; z <= -4; z += 3.5) s.within({ x: x1 + 0.01, z, yaw: Math.PI / 2 }, () => windowFrame(s, 2, 1.2, 2.6, "dealer-steel-dark"));
  });

  // The forecourt: a bay for each car the dealer sells, its sign by the road, a flag for each maker.
  const stock = stockOf("town-dealer");
  const front = 11.6;
  const bayWide = 3.1;
  const firstBay = -((stock.length - 1) * bayWide) / 2 - 1.5;
  s.detail(() => {
    stock.forEach((_, bay) => s.within({ x: firstBay + bay * bayWide, y: 0.05, z: front }, () => bayLines(s, bayWide, 5.4)));
    for (const x of [-11, 1, 15]) s.within({ x, y: 0.05, z: -0.3 }, () => planter(s, 3));
    for (let x = -14; x < 3; x += 3.2) s.within({ x, y: 0.05, z: 13.3 }, () => bollard(s, 0.8, "dealer-steel-dark"));
  });
  for (const x of [-18.6, 18.4]) s.within({ x, y: 0.05, z: 8 }, () => lampPost(s, 7));
  s.within({ x: -18, y: 0.05, z: 12.4 }, () => pylon(s, TOWN_DEALER_NAME, brands, 2.2, 8.5, "dealer-house", "dealer-house-ink"));
  brands.forEach((brand, index) => s.within({ x: 18.9, y: 0.05, z: -1 + index * 3.5, yaw: -Math.PI / 2 }, () => bannerFlag(s, brand, 7)));

  return {
    id: "town-dealer",
    slots: stock.map((car, bay) => ({ car, at: [firstBay + bay * bayWide, 0.05, front - 2.7] as const, yaw: Math.PI })),
    plot: [-20, -23, 20, 14.3],
    walls: [[x0, z0, x1, z1], [11.6, z1 - 1.2, x1 + 0.3, z1 + 0.8], [-19.1, 12.18, -16.9, 12.62], ...[-11, 1].map((x): Rectangle => [x - 1.5, -0.6, x + 1.5, 0])],
    streetZ: 14.3,
    entrance: { at: [-3, 0, 1.2], radiusM: 3.5 },
  };
}

/**
 * The premium showroom: a long low pavilion of tarred boards to the street and glass to the sea, one roof tilting up
 * to the water. Sjöpromenaden leaves only a few metres of shore, so it stands on a timber deck on piles, its street
 * edge on the land and its sea half over the water, as the harbour's boathouses do.
 */
function premiumShowroom(s: Shell): Omit<Exterior, "soup"> {
  const [tarna, aurelle] = [BRANDS.tarna, BRANDS.aurelle];
  const [x0, x1, z0, z1] = [-14, 14, -8, 8];
  const [lowH, highH] = [3.9, 6.3];
  const [floorY, deckFoot, pileFoot] = [0.4, -0.3, -4];
  const [deckX, deckBack] = [15.2, -12];
  const heightAt = (z: number) => lowH + ((z1 + 1.8 - z) / (z1 + 1.8 - (z0 - 3))) * (highH - lowH);

  // The apron on the land, the deck it steps up to, and the piles the deck stands on.
  s.box([-16, -3, z1 + 0.2], [16, 0.05, 11.5], "dealer-stone", { pattern: "speckle" }, ["bottom", "north"]);
  s.box([-deckX, deckFoot, deckBack], [deckX, floorY, z1 + 0.2], "dealer-timber", { pattern: "boards" }, []);
  for (let x = -deckX + 0.4; x <= deckX - 0.39; x += (2 * deckX - 0.8) / 7) {
    for (let z = deckBack + 0.4; z <= z1 - 0.39; z += (z1 - deckBack - 0.4) / 4) s.box([x - 0.16, pileFoot, z - 0.16], [x + 0.16, deckFoot, z + 0.16], "wall-plinth", {}, ["top", "bottom"]);
  }
  s.box([-3.5, 0.05, z1 + 0.2], [3.5, 0.22, 9.6], "dealer-stone", {}, ["bottom", "north"]);

  // The street wall of tarred boards, the door a tall slot of light, the two makers' badges either side.
  s.quad([x0, floorY, z1], [x1, floorY, z1], [x1, heightAt(z1), z1], [x0, heightAt(z1), z1], "dealer-timber-dark", { pattern: "boards" });
  for (const [x, yaw] of [[x0, -Math.PI / 2], [x1, Math.PI / 2]] as const) {
    s.quad([x, floorY, z1], [x, floorY, 2], [x, heightAt(2), 2], [x, heightAt(z1), z1], "dealer-timber-dark", { pattern: "boards" });
    s.quad([x, floorY, 2], [x, floorY, z0], [x, heightAt(z0), z0], [x, heightAt(2), 2], "dealer-glass", { gloss: 1, shade: [0.72, 0.72, 1.05, 1.05], lit: 0.8 });
    for (let z = 2; z >= z0 - 0.01; z -= 2.5) s.within({ x, z, yaw }, () => s.box([-0.04, floorY, 0], [0.04, heightAt(z), 0.1], "dealer-rubber"));
  }
  s.quad([x1, floorY, z0], [x0, floorY, z0], [x0, heightAt(z0), z0], [x1, heightAt(z0), z0], "dealer-glass", { gloss: 1, shade: [0.72, 0.72, 1.05, 1.05], lit: 0.8 });
  for (let x = x0; x <= x1 + 0.01; x += 3.5) s.box([x - 0.04, floorY, z0 - 0.1], [x + 0.04, heightAt(z0), z0], "dealer-rubber");

  const doorH = heightAt(z1);
  s.quad([-2.2, floorY, z1 + 0.03], [2.2, floorY, z1 + 0.03], [2.2, doorH - 0.2, z1 + 0.03], [-2.2, doorH - 0.2, z1 + 0.03], "dealer-light-warm", { glow: 0.6, shade: [0.95, 0.95, 0.6, 0.6], lit: 1 });
  for (const x of [-2.2, 0, 2.2]) s.box([x - 0.05, floorY, z1 + 0.04], [x + 0.05, doorH - 0.15, z1 + 0.09], "dealer-tarna");
  s.within({ x: -10.6, y: 2.25, z: z1 + 0.04 }, () => s.logo(tarna, 0.9, { glow: 0.9 }));
  s.within({ x: 10.6, y: 2.25, z: z1 + 0.04 }, () => s.logo(aurelle, 0.9, { glow: 0.9 }));
  s.detail(() => {
    s.within({ x: -6, y: 1.9, z: z1 + 0.04 }, () => s.text(tarna.name, 0.6, "dealer-tarna", { glow: 0.95 }));
    s.within({ x: 6, y: 1.9, z: z1 + 0.04 }, () => s.text(aurelle.name, 0.6, "dealer-aurelle-ink", { glow: 0.95 }));
  });

  // One roof, its eaves lit in Tärna's gold.
  const eave = (z: number, x: number, lift: number): V3 => [x, heightAt(z) + lift, z];
  const [rx0, rx1, rz0, rz1] = [x0 - 1.5, x1 + 1.5, z0 - 3, z1 + 1.8];
  const roofThick = 0.3;
  s.quad(eave(rz1, rx0, roofThick), eave(rz1, rx1, roofThick), eave(rz0, rx1, roofThick), eave(rz0, rx0, roofThick), "dealer-steel-dark", { pattern: "seams" });
  s.quad(eave(rz1, rx0, 0), eave(rz1, rx1, 0), eave(rz0, rx1, 0), eave(rz0, rx0, 0), "dealer-timber", { pattern: "boards" });
  s.quad(eave(rz1, rx0, 0), eave(rz1, rx1, 0), eave(rz1, rx1, roofThick), eave(rz1, rx0, roofThick), tarna.ink, { glow: 0.3 });
  s.quad(eave(rz0, rx1, 0), eave(rz0, rx0, 0), eave(rz0, rx0, roofThick), eave(rz0, rx1, roofThick), tarna.ink, { glow: 0.3 });
  for (const x of [rx0, rx1]) s.quad(eave(rz1, x, 0), eave(rz0, x, 0), eave(rz0, x, roofThick), eave(rz1, x, roofThick), "dealer-steel-dark");
  for (const x of [-15, -7.5, 0, 7.5, 15]) s.bar([x, floorY, -10.6], [x, heightAt(-10.6), -10.6], 0.13, "dealer-rubber");

  // A rail round the deck's sea side, lamps along the apron, a flag for each maker.
  const railH = floorY + 1;
  const rail = (from: V3, to: V3) => {
    s.bar(from, to, 0.05, "dealer-steel");
    s.detail(() => {
      const steps = Math.round(Math.hypot(to[0] - from[0], to[2] - from[2]) / 3);
      for (let step = 0; step <= steps; step++) {
        const share = step / steps;
        const [x, z] = [from[0] + (to[0] - from[0]) * share, from[2] + (to[2] - from[2]) * share];
        s.box([x - 0.03, floorY, z - 0.03], [x + 0.03, from[1], z + 0.03], "dealer-steel");
      }
    });
  };
  rail([-deckX + 0.1, railH, deckBack + 0.1], [deckX - 0.1, railH, deckBack + 0.1]);
  for (const x of [-deckX + 0.1, deckX - 0.1]) rail([x, railH, deckBack + 0.1], [x, railH, z0 - 0.4]);
  s.detail(() => {
    for (let x = -15; x <= 15; x += 5) {
      if (Math.abs(x) < 4) continue;
      s.within({ x, y: 0.05, z: 10.6 }, () => bollard(s, 0.75, "dealer-tarna-ink"));
      s.within({ x, y: 0.8, z: 10.6 }, () => s.box([-0.08, 0, -0.08], [0.08, 0.05, 0.08], "dealer-light-warm", { glow: 1 }));
    }
  });
  s.within({ x: -15.4, y: 0.05, z: 10.4 }, () => bannerFlag(s, tarna, 8));
  s.within({ x: 15.4, y: 0.05, z: 10.4, yaw: Math.PI }, () => bannerFlag(s, aurelle, 8));

  return {
    id: "premium-showroom",
    slots: [],
    plot: [-16, deckBack, 16, 11.5],
    walls: [[-deckX, deckBack, deckX, z1 + 0.2]],
    streetZ: 11.5,
    entrance: { at: [0, 0, 10], radiusM: 3 },
  };
}

function usedLot(s: Shell): Omit<Exterior, "soup"> {
  slab(s, -17, -11, 17, 11, "dealer-asphalt", "speckle", 0.03);

  // A hut by the trade hall behind it, a lit window, a sign on a tall frame.
  s.within({ x: 11, z: -7 }, () => {
    s.box([-3.2, SINK, -1.8], [3.2, 2.7, 1.8], "wall-trim", { pattern: "boards", shade: WALL_FOOT }, ["bottom"]);
    s.box([-3.5, 2.7, -2.1], [3.5, 2.9, 2.2], "dealer-hazard", {}, []);
    s.within({ x: -1, z: 1.81 }, () => windowFrame(s, 2.6, 1.2, 0.9, "wall-red", true));
    s.within({ x: 1.9, z: 1.81 }, () => s.box([-0.5, 0, 0], [0.5, 2.1, 0.05], "wall-red"));
  });
  s.within({ x: -6, y: 0.03, z: 10.4 }, () => postSign(s, ["BEGAGNADE", "BILAR"], 8, 1.7, 3.5, "dealer-hazard", "dealer-klippa-ink"));

  // Rope of bunting between tall poles.
  const poles: V3[] = [[-16.5, 0, -10.5], [-16.5, 0, 10.5], [16.5, 0, 10.5], [16.5, 0, -10.5]];
  const poleH = 5.2;
  for (const [x, , z] of poles) s.box([x - 0.06, 0, z - 0.06], [x + 0.06, poleH, z + 0.06], "dealer-steel");
  const flags = ["wall-red", "dealer-hazard", "dealer-vastan", "wall-trim"] as const;
  s.detail(() => {
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
  });
  // Rows along the two sides: what players have traded in, any make and any age.
  const slots: CarSlot[] = [];
  const cars: [CarId, string?][] = [["ljus", "car-paint-mustard"], ["fjard", "car-paint-silver"], ["kobb"], ["salta"], ["holm", "car-paint-navy"], ["skerry-gt", "car-paint-graphite"], ["sten"], ["strom", "car-paint-white"]];
  cars.forEach(([car, paint], index) => {
    const row = index < 5 ? 0 : 1;
    const bay = row === 0 ? index : index - 5;
    const x = -13.4 + bay * 3.3;
    const z = row === 0 ? -3.8 : 4.8;
    s.detail(() => {
      s.within({ x, y: 0.03, z: row === 0 ? -6.7 : 7.8, yaw: row === 0 ? 0 : Math.PI }, () => s.box([-0.3, 0, -0.05], [0.3, 0.14, 0.05], "dealer-hazard"));
      s.within({ x, y: 1.42, z: z + (row === 0 ? 0.8 : -0.6) }, () => s.quad([-0.17, 0, 0], [0.17, 0, 0], [0.17, 0.05, 0], [-0.17, 0.05, 0], "dealer-hazard", { glow: 0.3 }));
    });
    slots.push({ car, paint, at: [x, 0.03, z], yaw: row === 0 ? 0 : Math.PI });
  });
  return { id: "used-lot", slots, plot: [-17, -11, 17, 11], walls: [[7.8, -8.8, 14.2, -5.2]], streetZ: 11, entrance: { at: [11, 0, -3], radiusM: 3 } };
}

function tyreShop(s: Shell): Omit<Exterior, "soup"> {
  slab(s, -13, -14, 13, 11, "dealer-concrete");

  const [x0, x1, z0, z1, top] = [-11, 11, -12, 0, 5];
  s.box([x0, SINK, z0], [x1, top, z1], "dealer-steel", { pattern: "ribs", shade: WALL_FOOT }, ["bottom"]);
  s.box([x0 - 0.2, top, z0 - 0.2], [x1 + 0.2, top + 0.2, z1 + 0.2], "dealer-rubber", {}, ["bottom"]);
  s.box([x0 - 0.01, 3.9, z1 + 0.01], [x1 + 0.01, top, z1 + 0.08], "dealer-rubber");
  s.within({ y: 4.12, z: z1 + 0.085 }, () => s.text("DÄCK + SERVICE", 0.66, "dealer-hazard", { glow: 0.8 }));
  for (const x of [-8.4, -4.2, 0]) s.within({ x, z: z1 + 0.01 }, () => rollerDoor(s, 3.5, 3.4, x === -4.2));
  s.within({ x: 6.2, z: z1 + 0.01 }, () => {
    s.box([-3.6, 0, 0], [3.6, 3.2, 0.05], "dealer-steel-dark");
    s.quad([-3.5, 0.2, 0.055], [3.5, 0.2, 0.055], [3.5, 3.1, 0.055], [-3.5, 3.1, 0.055], "dealer-glass", { gloss: 0.9, shade: [0.75, 0.75, 1, 1], lit: 0.7, litTone: "cool" });
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
  s.detail(() => {
    const stacks: [number, number, number][] = [[3.6, 1.4, 5], [4.4, 1.3, 4], [5.2, 1.4, 5], [8.6, 1.4, 3], [9.4, 1.3, 5], [10.2, 1.4, 4], [-12.2, -3, 4]];
    for (const [x, z, count] of stacks) s.within({ x, z, y: 0.05 }, () => tyreStack(s, count));
    s.within({ x: 11.4, y: 0.05, z: 9.6, pitch: Math.PI / 2 }, () => tyre(s, -0.2, 0.7, 0.4, 10));
    for (let bay = 0; bay < 3; bay++) s.within({ x: -8.4 + bay * 4.2, y: 0.05, z: 7 }, () => bayLines(s, 3.5, 6));
  });
  s.within({ x: -12, y: 0.05, z: 9.6 }, () => postSign(s, ["DÄCK", "SERVICE"], 2.2, 1.6, 1.1, "dealer-hazard", "dealer-klippa-ink"));

  return {
    id: "tyre-shop",
    slots: [
      { car: "ljus", at: [-4.2, 0.05, 3.2], yaw: 0, paint: "car-paint-teal" },
      { car: "kobb", at: [-8.4, 0.05, 4.2], yaw: Math.PI },
    ],
    plot: [-13, -14, 13, 11],
    walls: [[x0, z0, x1, z1]],
    streetZ: 11,
    entrance: { at: [-4.2, 0, 1], radiusM: 3 },
  };
}

const BUILDERS: Record<ExteriorId, (s: Shell) => Omit<Exterior, "soup">> = {
  "village-garage": villageGarage,
  "town-dealer": townDealer,
  "premium-showroom": premiumShowroom,
  "used-lot": usedLot,
  "tyre-shop": tyreShop,
};

export function buildExterior(id: ExteriorId, version: Version = "near"): Exterior {
  const s = new Shell(version);
  const exterior = BUILDERS[id](s);
  return { ...exterior, soup: s.build() };
}
