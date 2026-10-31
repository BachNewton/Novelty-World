import { BRANDS, type Brand } from "./brands";
import type { CarSlot } from "./exteriors";
import { carLift, ceilingBanner, ceilingPanel, chair, coffeeTable, lightHalo, pendantLamp, planter, priceStand, salesDesk, sofa, turntableDeck, tyreRack, tyreStack, workbench, barrel } from "./kit";
import type { Lighting, RoomLight } from "./material";
import { Shell, type Paint, type Soup, type V3 } from "./shell";

/*
 * Inside the three dealerships, loaded only when a car enters: nothing imports this file but the dynamic import in
 * `index.ts`. A room is its own small world at the origin, for a scene of its own: what shows through its windows is
 * painted on a backdrop outside them, unlit, so the sky and sea cost two quads and never need the real world loaded.
 *
 * The turntable's deck is its own mesh, centred on its axis, so a page spins it and the car on it together.
 */

export const INTERIOR_IDS = ["village-garage", "town-dealer", "waterfront-showroom"] as const;
export type InteriorId = (typeof INTERIOR_IDS)[number];

export type CameraKind = "floor" | "desk" | "turntable";

export interface FixedCamera {
  name: string;
  kind: CameraKind;
  position: V3;
  target: V3;
  fovDeg: number;
}

export interface Turntable {
  soup: Soup;
  /** Its axis, on the floor. */
  centre: V3;
  /** The height of a car's wheels above the floor. */
  deckY: number;
  radiusM: number;
  /** What it spins by default: a car turning once in this time. */
  turnSeconds: number;
}

export interface Interior {
  id: InteriorId;
  brand: Brand;
  soup: Soup;
  turntable: Turntable;
  /** The car on the turntable when the room opens, standing at yaw 0 relative to the deck. */
  onTurntable: Omit<CarSlot, "at" | "yaw">;
  displays: readonly CarSlot[];
  /** The room's own light, for `dealerMaterial`. */
  lighting: Extract<Lighting, { kind: "room" }>;
  cameras: readonly FixedCamera[];
  /** The floor's plan and the height under the lowest ceiling, for cameras and cars to stay inside. */
  room: { x: readonly [number, number]; z: readonly [number, number]; height: number };
  background: Paint;
}

/** A vertical wash of two tokens on a quad, shining by itself. */
function backdrop(s: Shell, a: V3, b: V3, low: Paint, high: Paint, shades: readonly [number, number] = [1, 1]) {
  s.tri(a, b, [b[0], b[1] === a[1] ? b[1] + 1 : b[1], b[2]], low, { glow: 1, shade: shades[0] });
  s.tri(a, [a[0], a[1] + 1, a[2]], [b[0], b[1] + 1, b[2]], high, { glow: 1, shade: shades[1] });
}

const WALL_SHADE: readonly number[] = [0.78, 0.78, 1, 1];

function villageGarage(): Interior {
  const s = new Shell();
  const brand = BRANDS.klippa;
  const [x0, x1, z0, z1, eave, ridge] = [-13, 7, -9, 0, 4.3, 6.2];
  const midZ = (z0 + z1) / 2;
  const heightAt = (z: number) => eave + (1 - Math.abs(z - midZ) / (midZ - z0)) * (ridge - eave);

  s.quad([x0, 0, z1], [x1, 0, z1], [x1, 0, z0], [x0, 0, z0], "dealer-concrete", { pattern: "speckle" });
  for (const [from, to] of [[z1, midZ], [z0, midZ]] as const) {
    s.quad([x0, heightAt(from), from], [x1, heightAt(from), from], [x1, ridge, to], [x0, ridge, to], "dealer-timber", { pattern: "boards", shade: 0.72 });
  }
  s.quad([x0, 0, z0], [x1, 0, z0], [x1, eave, z0], [x0, eave, z0], "wall-trim", { pattern: "boards", shade: WALL_SHADE });
  for (const [x, far] of [[x0, z0], [x1, z1]] as const) {
    const near = far === z0 ? z1 : z0;
    s.quad([x, 0, near], [x, 0, far], [x, eave, far], [x, eave, near], "wall-trim", { pattern: "boards", shade: WALL_SHADE });
    s.tri([x, eave, near], [x, eave, far], [x, ridge, midZ], "wall-trim", { pattern: "boards" });
  }
  // The street wall, with its doors standing open on the yard and the sky.
  const doors: [number, number][] = [[-11.6, -7.6], [-5.6, -1.6]];
  const wallTo: [number, number][] = [[x0, -11.6], [-7.6, -5.6], [-1.6, x1]];
  for (const [from, to] of wallTo) s.quad([from, 0, z1], [to, 0, z1], [to, eave, z1], [from, eave, z1], "wall-trim", { pattern: "boards", shade: WALL_SHADE });
  for (const [from, to] of doors) {
    s.quad([from, 3.4, z1], [to, 3.4, z1], [to, eave, z1], [from, eave, z1], "wall-trim", { pattern: "boards" });
    s.box([from - 0.08, 0, z1 - 0.1], [from, 3.4, z1], "dealer-steel-dark", {}, []);
    s.box([to, 0, z1 - 0.1], [to + 0.08, 3.4, z1], "dealer-steel-dark", {}, []);
    s.box([from, 3.3, z1 - 0.14], [to, 3.42, z1], "dealer-steel-dark", {}, []);
  }
  // The yard beyond them.
  s.quad([x0 - 10, 0, 4], [x1 + 10, 0, 4], [x1 + 10, 0, z1], [x0 - 10, 0, z1], "dealer-gravel", { glow: 1, shade: 1.05 });
  s.quad([x0 - 10, 0, 4], [x1 + 10, 0, 4], [x1 + 10, 1.8, 40], [x0 - 10, 1.8, 40], "ground", { glow: 1, shade: 1.1 });
  backdrop(s, [x0 - 60, 0, 40], [x1 + 60, 0, 40], "sky", "sky");
  s.quad([x0 - 60, 1.8, 39], [x1 + 60, 1.8, 39], [x1 + 60, 9, 39], [x0 - 60, 9, 39], "tree-spruce", { glow: 1, shade: 1.35 });
  s.quad([x0 - 60, 9, 39], [x1 + 60, 9, 39], [x1 + 60, 40, 39], [x0 - 60, 40, 39], "sky", { glow: 1 });

  // Roof trusses, tie and rafters.
  for (let x = -12; x <= 6; x += 3) {
    s.bar([x, eave, z0], [x, eave, z1], 0.14, "dealer-timber-dark");
    s.bar([x, eave, z0], [x, ridge - 0.1, midZ], 0.14, "dealer-timber-dark");
    s.bar([x, eave, z1], [x, ridge - 0.1, midZ], 0.14, "dealer-timber-dark");
    s.bar([x, eave, midZ], [x, ridge - 0.1, midZ], 0.1, "dealer-timber-dark");
  }

  // The lamps.
  const lamps: V3[] = [[-9.5, 4.3, -4.5], [-4.8, 4.3, -4.5], [-1.4, 4.3, -4.5], [4.6, 4.3, -4.5]];
  for (const [x, y, z] of lamps) s.within({ x, y: y + 0.0, z }, () => pendantLamp(s, 0.6));

  // A display car, a lift, and the workshop along the walls.
  s.within({ x: -1.4, z: -4.2 }, () => carLift(s, 1.5));
  s.within({ x: -1.4, z: -8.45 }, () => workbench(s, 3.8));
  s.within({ x: -5, z: -8.5 }, () => tyreRack(s, 4));
  s.within({ x: -12.5, z: -8.5 }, () => barrel(s, "dealer-klippa"));
  s.within({ x: -11.8, z: -8.6 }, () => barrel(s, "wall-plinth"));
  s.within({ x: -12.4, z: -1.2 }, () => tyreStack(s, 5));
  s.within({ x: -12.4, z: -2 }, () => tyreStack(s, 3));
  s.within({ x: -3.6, z: -0.8, yaw: 0 }, () => {
    s.box([-0.3, 0, -0.2], [0.3, 0.8, 0.2], "wall-red", { pattern: "ribs" });
    s.lathe([[0.08, 0.8], [0.08, 1.05], [0, 1.06]], 5, "dealer-steel");
  });
  s.within({ x: -9.5, y: 2.6, z: z0 + 0.03 }, () => {
    s.box([-2.6, -1.2, -0.02], [2.6, 1.2, 0.01], brand.colour);
    s.within({ x: -1.5, z: 0.02 }, () => s.logo(brand, 0.9));
    s.within({ x: 0.9, y: 0.1, z: 0.02 }, () => s.text(brand.name, 0.56, brand.ink));
    s.within({ x: 0.9, y: -0.55, z: 0.02 }, () => s.text("HOLM  KOBB", 0.32, brand.ink));
  });

  // The office: a half wall with glass over it, a counter, a price board, a coffee maker.
  const officeX = 2.6;
  s.box([officeX - 0.08, 0, -9], [officeX + 0.08, 1.1, -1.4], "wall-trim", { pattern: "boards", shade: [0.8, 0.8, 1, 1] }, []);
  for (let z = -9; z <= -1.4; z += 1.9) s.box([officeX - 0.05, 1.1, z - 0.04], [officeX + 0.05, 2.5, z + 0.04], "wall-trim");
  s.box([officeX - 0.05, 2.5, -9], [officeX + 0.05, 2.6, -1.4], "wall-trim", {}, []);
  s.within({ x: 5, z: -3, yaw: Math.PI / 2 + 0.25 }, () => salesDesk(s, "dealer-timber", "wall-trim", brand));
  s.within({ x: 6.9, y: 2.2, z: -6, yaw: -Math.PI / 2 }, () => {
    s.box([-1.5, -0.8, -0.02], [1.5, 0.8, 0.01], "wall-trim");
    s.within({ y: 0.45, z: 0.02 }, () => s.text("PRISER", 0.22, brand.colour));
    s.within({ y: 0.08, z: 0.02 }, () => s.text("HOLM 34 900", 0.17, brand.ink));
    s.within({ y: -0.22, z: 0.02 }, () => s.text("KOBB 27 400", 0.17, brand.ink));
    s.within({ y: -0.52, z: 0.02 }, () => s.text("SERVICE 89 PER H", 0.13, brand.ink));
  });
  s.within({ x: 4.8, z: -8.6 }, () => {
    s.box([-0.9, 0, -0.3], [0.9, 0.9, 0.3], "dealer-timber-dark");
    s.box([-0.5, 0.9, -0.15], [-0.2, 1.3, 0.15], "dealer-rubber");
  });

  // The turntable: a steel plate let into the floor, with a pit ring round it.
  const centre: V3 = [-9.5, 0, -4.5];
  const radius = 3.1;
  s.within({ x: centre[0], y: 0.004, z: centre[2] }, () => {
    s.lathe([[radius + 0.3, 0], [radius, 0]], 40, "dealer-hazard");
    s.lathe([[radius + 0.05, 0.001], [radius, 0.001]], 40, "dealer-rubber");
  });
  s.within({ x: centre[0], y: eave - 0.3, z: centre[2] }, () => lightHalo(s, 3.2, "dealer-light-warm", "dealer-rubber"));

  const deck = new Shell();
  turntableDeck(deck, radius, 0.08, "dealer-steel-dark", "dealer-steel", "dealer-hazard");

  const near = (slotX: number, slotZ: number, car: string, price: string) => s.within({ x: slotX, z: slotZ, yaw: 0.2 }, () => priceStand(s, brand, car, price, "wall-trim"));
  near(-3.2, -1.7, "Kobb", "27 400 €");
  near(centre[0] + 3.4, centre[2] - 3.7, "Holm", "34 900 €");

  const lights: RoomLight[] = [
    { at: [centre[0], 3.4, centre[2]], paint: "dealer-light-warm", power: 0.8, reachM: 5 },
    { at: [-4.8, 3.3, -4.5], paint: "dealer-light-warm", power: 0.5, reachM: 4 },
    { at: [-1.4, 3.3, -4.5], paint: "dealer-light-warm", power: 0.4, reachM: 4 },
    { at: [4.6, 3.3, -4.5], paint: "dealer-light-warm", power: 0.5, reachM: 4 },
    { at: [-9.6, 2.6, 2], paint: "dealer-light-cool", power: 0.5, reachM: 7 },
  ];

  return {
    id: "village-garage",
    brand,
    soup: s.build(),
    turntable: { soup: deck.build(), centre, deckY: 0.08, radiusM: radius, turnSeconds: 28 },
    onTurntable: { car: "Holm" },
    displays: [
      { car: "Kobb", at: [-4.9, 0, -4.4], yaw: 0, paint: "car-paint-white" },
      { car: "Holm", at: [-1.4, 1.46, -4.2], yaw: Math.PI, paint: "car-paint-graphite" },
    ],
    lighting: { kind: "room", lights, mirrors: ["dealer-concrete", "dealer-timber"] },
    cameras: [
      { name: "floor", kind: "floor", position: [-12.4, 1.7, -0.5], target: [-1, 1.2, -5], fovDeg: 62 },
      { name: "desk", kind: "desk", position: [6.3, 1.5, -0.6], target: [-3, 1.3, -5.5], fovDeg: 60 },
      { name: "turntable", kind: "turntable", position: [-6.5, 1.15, -0.5], target: [centre[0], 0.8, centre[2]], fovDeg: 50 },
    ],
    room: { x: [x0, x1], z: [z0, z1], height: eave },
    background: "sky",
  };
}

function townDealer(): Interior {
  const s = new Shell();
  const brand = BRANDS.vastan;
  const [x0, x1, z0, z1, height] = [-17, 17, -15, 0, 5.4];

  s.quad([x0, 0, z1], [x1, 0, z1], [x1, 0, z0], [x0, 0, z0], "dealer-tile", { pattern: "tiles", gloss: 0.5 });
  s.quad([x0, height, z1], [x1, height, z1], [x1, height, z0], [x0, height, z0], "dealer-ceiling", { pattern: "seams" });
  s.quad([x0, 0, z0], [x1, 0, z0], [x1, height, z0], [x0, height, z0], "dealer-panel", { shade: WALL_SHADE });
  s.quad([x0, 0, z1], [x0, 0, z0], [x0, height, z0], [x0, height, z1], "dealer-panel", { pattern: "seams", shade: WALL_SHADE });
  s.quad([x1, 0, z0], [x1, 0, z1], [x1, height, z1], [x1, height, z0], "dealer-panel", { pattern: "seams", shade: WALL_SHADE });

  // The brand wall behind the turntable.
  s.box([-9, 0, z0], [9, height, z0 + 0.25], brand.colour, { shade: [0.8, 0.8, 1, 1] }, ["bottom", "top"]);
  s.within({ y: 3.2, z: z0 + 0.26 }, () => s.logo(brand, 1.15, { glow: 0.92 }));
  s.within({ y: 1.2, z: z0 + 0.26 }, () => s.text(brand.name, 0.56, brand.ink, { glow: 0.92 }));

  // The glass front: posts and rails, no pane. Past it the forecourt, the road, the trees.
  const postsX: number[] = [];
  for (let x = x0; x <= x1 + 0.01; x += 3.4) postsX.push(x);
  for (const x of postsX) s.box([x - 0.06, 0, z1 - 0.06], [x + 0.06, height, z1 + 0.06], "dealer-steel-dark", {}, []);
  s.box([x0, 2.75, z1 - 0.04], [x1, 2.83, z1 + 0.04], "dealer-steel-dark", {}, []);
  s.box([x0, 4.3, z1 - 0.3], [x1, height, z1], "dealer-panel", {}, ["top"]);
  s.quad([x0 - 60, 0, 60], [x1 + 60, 0, 60], [x1 + 60, 0, z1], [x0 - 60, 0, z1], "dealer-paving", { glow: 1, shade: 1.05 });
  s.quad([x0 - 60, 0.01, 22], [x1 + 60, 0.01, 22], [x1 + 60, 0.01, 14], [x0 - 60, 0.01, 14], "dealer-asphalt", { glow: 1, shade: 1.1 });
  s.quad([x0 - 60, 0, 60], [x1 + 60, 0, 60], [x1 + 60, 16, 60], [x0 - 60, 16, 60], "tree-spruce", { glow: 1, shade: 1.3 });
  s.quad([x0 - 60, 16, 60], [x1 + 60, 16, 60], [x1 + 60, 70, 60], [x0 - 60, 70, 60], "sky", { glow: 1 });
  s.within({ x: 11, y: 0, z: 14 }, () => s.box([-1, 0, -0.2], [1, 8, 0.2], brand.colour, { glow: 0.5 }));
  for (const x of [-11, -2, 7]) s.within({ x, z: 9 }, () => s.box([-1, 0.2, -2.4], [1, 1.5, 2.4], "dealer-steel", { glow: 0.5, shade: 0.8 }));

  // Light: long panels in the ceiling, a ring over the turntable.
  const panels: V3[] = [];
  for (const x of [-12.5, -6, 6, 12.5]) for (const z of [-3, -11]) panels.push([x, height, z]);
  for (const [x, y, z] of panels) s.within({ x, y, z }, () => ceilingPanel(s, 3.6, 1));
  for (let x = -15; x <= 15; x += 30 / 4) s.within({ x: 0 + x, y: height - 0.12, z: z1 - 0.7 }, () => s.box([-0.5, 0, -0.02], [0.5, 0.05, 0.02], "dealer-light-cool", { glow: 0.8 }));

  // The turntable.
  const centre: V3 = [0, 0, -6.6];
  const radius = 3.2;
  s.within({ x: centre[0], z: centre[2] }, () => {
    s.lathe([[radius + 0.45, 0.003], [radius + 0.45, 0.06], [radius + 0.02, 0.06]], 40, "dealer-steel-dark", { gloss: 0.3 });
    s.lathe([[radius + 0.28, 0.062], [radius + 0.22, 0.062]], 40, "dealer-vastan-ink", { glow: 1 });
  });
  s.within({ x: centre[0], y: height - 1.1, z: centre[2] }, () => lightHalo(s, 3.3, "dealer-light-cool", "dealer-steel-dark"));
  const deck = new Shell();
  turntableDeck(deck, radius, 0.1, "dealer-polish", "dealer-steel-dark", "dealer-vastan");

  // Cars, stands, banners.
  const slot = (x: number, z: number, yaw: number, car: string, paint: string | undefined, price: string): CarSlot => {
    s.within({ x: x + (x < 0 ? 2.1 : -2.1), z: z + 2.5 * Math.sign(z + 7.5), yaw: x < 0 ? 0.4 : -0.4 }, () => priceStand(s, brand, car, price, "wall-trim"));
    return { car, paint, at: [x, 0, z], yaw };
  };
  const displays = [
    slot(-12, -3.8, 0.55, "Ljus", "car-paint-teal", "21 900 €"),
    slot(-12, -10.8, 2.5, "Fjärd", "car-paint-navy", "32 500 €"),
    slot(12, -3.8, -0.55, "Fjärd", "car-paint-silver", "32 500 €"),
    slot(12, -10.8, -2.5, "Ljus", "car-paint-mustard", "21 900 €"),
  ];
  for (const x of [-6.4, 6.4]) s.within({ x, y: height, z: -2 }, () => ceilingBanner(s, brand, 1.8, 2.2, 0.4));

  // Desks by the brand wall, a place to sit, plants.
  s.within({ x: -6.2, z: -12.8, yaw: 0.0 }, () => salesDesk(s, "dealer-tile", "dealer-steel-dark", brand));
  s.within({ x: 6.2, z: -12.8, yaw: 0.0 }, () => salesDesk(s, "dealer-tile", "dealer-steel-dark", brand));
  s.within({ x: 15.6, z: -7.3, yaw: -Math.PI / 2 }, () => sofa(s, 2.4, "dealer-fabric"));
  s.within({ x: 14.3, z: -7.3 }, () => coffeeTable(s));
  s.within({ x: -16.2, z: -7.3, yaw: Math.PI / 2 }, () => planter(s, 3));
  s.within({ x: 15.9, y: 2.7, z: -14.97 }, () => s.box([-0.9, -1.6, 0], [0.9, 1.6, 0.03], brand.colour));

  const lights: RoomLight[] = [
    { at: [centre[0], 4.2, centre[2]], paint: "dealer-light-cool", power: 0.75, reachM: 5 },
    { at: [-12, 4.6, -3.8], paint: "dealer-light-cool", power: 0.4, reachM: 6 },
    { at: [-12, 4.6, -10.8], paint: "dealer-light-cool", power: 0.4, reachM: 6 },
    { at: [12, 4.6, -3.8], paint: "dealer-light-cool", power: 0.4, reachM: 6 },
    { at: [12, 4.6, -10.8], paint: "dealer-light-cool", power: 0.4, reachM: 6 },
  ];

  return {
    id: "town-dealer",
    brand,
    soup: s.build(),
    turntable: { soup: deck.build(), centre, deckY: 0.1, radiusM: radius, turnSeconds: 24 },
    onTurntable: { car: "Fjärd", paint: "car-paint-teal" },
    displays,
    lighting: { kind: "room", lights, mirrors: ["dealer-tile", "dealer-light-cool"] },
    cameras: [
      { name: "floor", kind: "floor", position: [-15.6, 2.1, -0.9], target: [1, 1, -8], fovDeg: 68 },
      { name: "desk", kind: "desk", position: [6.9, 1.25, -10.4], target: [5.2, 1.15, -15], fovDeg: 62 },
      { name: "turntable", kind: "turntable", position: [5.4, 1.2, -1.5], target: [centre[0], 0.75, centre[2]], fovDeg: 42 },
    ],
    room: { x: [x0, x1], z: [z0, z1], height: 4.3 },
    background: "sky",
  };
}

function waterfrontShowroom(): Interior {
  const s = new Shell();
  const brand = BRANDS.tarna;
  const [x0, x1, z0, z1] = [-14, 14, -8, 8];
  const [lowH, highH] = [3.9, 5.7];
  const heightAt = (z: number) => lowH + ((z1 - z) / (z1 - z0)) * (highH - lowH);

  s.quad([x0, 0, z1], [x1, 0, z1], [x1, 0, z0], [x0, 0, z0], "dealer-polish", { gloss: 0.85 });
  s.quad([x0, heightAt(z1), z1], [x1, heightAt(z1), z1], [x1, heightAt(z0), z0], [x0, heightAt(z0), z0], "dealer-timber", { pattern: "boards", shade: 0.9 });
  // Dark beams under the boards, rising to the sea.
  for (let x = x0 + 2.8; x < x1; x += 2.8) s.bar([x, heightAt(z1) - 0.1, z1], [x, heightAt(z0) - 0.1, z0], 0.16, "dealer-timber-dark");
  s.quad([x0, 0, z1], [x1, 0, z1], [x1, lowH, z1], [x0, lowH, z1], "dealer-timber-dark", { pattern: "boards", shade: WALL_SHADE });
  for (const [x, a, b] of [[x0, z1, 2], [x1, 2, z1]] as const) {
    s.quad([x, 0, a], [x, 0, b], [x, heightAt(b), b], [x, heightAt(a), a], "dealer-timber-dark", { pattern: "boards", shade: WALL_SHADE });
  }

  // The glass: mullions only. Past them the deck, the rail, the skerries, the sea.
  for (let x = x0; x <= x1 + 0.01; x += 3.5) s.box([x - 0.05, 0, z0 - 0.05], [x + 0.05, heightAt(z0), z0 + 0.05], "dealer-rubber", {}, []);
  for (const x of [x0, x1]) for (let z = z0; z <= 2; z += 2.5) s.box([x - 0.05, 0, z - 0.05], [x + 0.05, heightAt(z), z + 0.05], "dealer-rubber", {}, []);
  s.quad([x0 - 3, 0, z0], [x1 + 3, 0, z0], [x1 + 3, 0, -15], [x0 - 3, 0, -15], "dealer-timber", { glow: 1, shade: 0.95, pattern: "boards" });
  for (const x of [x0, x1]) s.quad([x, 0, z0 - 7], [x, 0, 2], [x + (x < 0 ? -3 : 3), 0, 2], [x + (x < 0 ? -3 : 3), 0, z0 - 7], "dealer-timber", { glow: 1, shade: 0.95, pattern: "boards" });
  s.bar([x0 - 3, 1, -15], [x1 + 3, 1, -15], 0.05, "dealer-rubber", { glow: 1 });
  for (let x = x0 - 3; x <= x1 + 3; x += 3) s.bar([x, 0, -15], [x, 1, -15], 0.05, "dealer-rubber", { glow: 1 });
  const horizon = 900;
  const far = 3000;
  s.quad([-far, -1, horizon], [far, -1, horizon], [far, -1, -horizon], [-far, -1, -horizon], "water", { glow: 1, shade: 1.05 });
  s.quad([-far, -1, -horizon], [far, -1, -horizon], [far, 900, -horizon], [-far, 900, -horizon], "sky", { glow: 1, shade: [1.0, 1.0, 0.9, 0.9] });
  for (const [x, z, span, top] of [[-300, -500, 120, 16], [-190, -440, 50, 8], [260, -520, 160, 20], [130, -600, 70, 10], [40, -260, 30, 4], [-420, -300, 90, 11], [500, -300, 140, 15]] as const) {
    s.tri([x - span, -1, z], [x + span, -1, z], [x + span * 0.2, top, z], "tree-spruce", { glow: 1, shade: 1.5 });
    s.tri([x - span * 1.1, -1, z + 2], [x + span * 0.4, -1, z + 2], [x - span * 0.3, top * 0.6, z + 2], "dealer-stone", { glow: 1, shade: 0.75 });
  }

  // The brand wall and a stone desk.
  s.box([-5.5, 0, z1 - 0.15], [5.5, lowH, z1], brand.colour, {}, ["bottom", "top"]);
  s.within({ y: 2.5, z: z1 - 0.16, yaw: Math.PI }, () => s.logo(brand, 0.82, { glow: 0.95 }));
  s.within({ y: 1.05, z: z1 - 0.16, yaw: Math.PI }, () => s.text(brand.name, 0.42, "dealer-tarna", { glow: 0.95 }));
  s.within({ z: 5.4, yaw: Math.PI }, () => {
    s.box([-3, 0, -0.5], [3, 1.08, 0.5], "dealer-stone");
    s.box([-3.1, 1.08, -0.56], [3.1, 1.14, 0.56], "dealer-tarna-ink", { gloss: 0.8 });
    s.box([1.9, 1.17, 0.1], [2.56, 1.5, 0.13], "dealer-rubber");
    s.within({ x: -1.6, z: -1.3 }, () => chair(s, "dealer-leather"));
    s.within({ x: 1.6, z: -1.3 }, () => chair(s, "dealer-leather"));
    s.within({ y: 0.56, z: 0.505 }, () => s.logo(brand, 0.26));
    s.within({ y: 0.56, z: -0.505, yaw: Math.PI }, () => s.logo(brand, 0.26));
  });

  // The lounge in the corner, the sea in front of it.
  s.within({ x: -10.6, z: 4.8, yaw: Math.PI }, () => sofa(s, 2.6, "dealer-leather"));
  s.within({ x: -7.3, z: 3.3, yaw: -Math.PI / 2 }, () => sofa(s, 1.5, "dealer-leather"));
  s.within({ x: -10.4, z: 2.9 }, () => coffeeTable(s));
  s.within({ x: 11, z: 5.5, yaw: 0 }, () => {
    s.box([-1.7, 0, -0.6], [1.7, 0.9, 0.6], "dealer-tarna-ink", { gloss: 0.5 });
    s.within({ y: 1.0 }, () => {
      s.lathe([[0.05, 0], [0.05, 0.3], [0, 0.31]], 5, "dealer-tarna");
    });
    // A hull on a stand: this firm's other trade, and the point of the place.
    s.within({ y: 1.25 }, () => {
      s.quad([-1.3, 0.14, 0], [0, 0.26, -0.28], [1.3, 0.14, 0], [0, 0.26, 0.28], "wall-trim");
      s.tri([-1.3, 0.14, 0], [0, 0.26, 0.28], [0, -0.12, 0], "dealer-tarna-ink");
      s.tri([1.3, 0.14, 0], [0, -0.12, 0], [0, 0.26, 0.28], "dealer-tarna-ink");
      s.tri([-1.3, 0.14, 0], [0, -0.12, 0], [0, 0.26, -0.28], "dealer-tarna-ink");
      s.tri([1.3, 0.14, 0], [0, 0.26, -0.28], [0, -0.12, 0], "dealer-tarna-ink");
    });
  });

  // Discs of pale stone under the cars on show, a ring of light on each.
  const slots: { x: number; z: number; yaw: number; car: string; paint?: string; price: string }[] = [
    { x: -9.6, z: -3.4, yaw: 0.75, car: "Sund", paint: "car-paint-mustard", price: "68 900 €" },
    { x: 9.6, z: -3.4, yaw: -0.75, car: "Skerry GT", paint: "car-paint-silver", price: "74 500 €" },
  ];
  const plinth = 0.16;
  for (const { x, z, car, price } of slots) {
    s.within({ x, z }, () => {
      s.lathe([[3.05, 0], [3.05, plinth], [2.98, plinth + 0.015], [0, plinth + 0.015]], 28, "dealer-stone", { gloss: 0.35 });
    });
    s.within({ x: x + (x < 0 ? 3.1 : -3.1), z: z + 2.8, yaw: x < 0 ? -0.5 : 0.5 }, () => priceStand(s, brand, car, price, "wall-trim"));
  }

  // The turntable, in the middle of the sea window, under a hoop of warm light.
  const centre: V3 = [0, 0, -1.8];
  const radius = 3.25;
  s.within({ x: centre[0], z: centre[2] }, () => {
    s.lathe([[radius + 0.3, 0.003], [radius + 0.3, 0.07], [radius + 0.02, 0.07]], 44, "dealer-tarna-ink", { gloss: 0.5 });
    s.lathe([[radius + 0.17, 0.072], [radius + 0.12, 0.072]], 44, "dealer-tarna", { glow: 1 });
  });
  s.within({ x: centre[0], y: heightAt(centre[2]) - 1.3, z: centre[2] }, () => lightHalo(s, 3.4, "dealer-light-warm", "dealer-tarna-ink"));
  const deck = new Shell();
  turntableDeck(deck, radius, 0.11, "dealer-tarna-ink", "dealer-tarna", "dealer-tarna");

  // Spots along the beams.
  for (let x = -12; x <= 12; x += 4) {
    for (const z of [5, -5]) s.within({ x, y: heightAt(z) - 0.04, z }, () => s.lathe([[0.1, -0.1], [0.1, 0], [0, 0.01]], 6, "dealer-rubber"));
    for (const z of [5, -5]) s.within({ x, y: heightAt(z) - 0.11, z }, () => s.lathe([[0.08, 0], [0, 0]], 6, "dealer-light-warm", { glow: 1 }));
  }

  const lights: RoomLight[] = [
    { at: [centre[0], 3.8, centre[2]], paint: "dealer-light-warm", power: 0.8, reachM: 4.5 },
    { at: [-9.6, 3.7, -3.4], paint: "dealer-light-warm", power: 0.45, reachM: 5 },
    { at: [9.6, 3.7, -3.4], paint: "dealer-light-warm", power: 0.45, reachM: 5 },
    { at: [0, 3.2, 5.5], paint: "dealer-light-warm", power: 0.4, reachM: 6 },
    { at: [0, 3, -12], paint: "dealer-light-cool", power: 0.7, reachM: 11 },
  ];

  return {
    id: "waterfront-showroom",
    brand,
    soup: s.build(),
    turntable: { soup: deck.build(), centre, deckY: 0.11, radiusM: radius, turnSeconds: 32 },
    onTurntable: { car: "Skerry GT" },
    displays: slots.map(({ x, z, yaw, car, paint }) => ({ car, paint, at: [x, plinth + 0.015, z], yaw })),
    lighting: { kind: "room", lights, mirrors: ["dealer-polish", "sky"] },
    cameras: [
      { name: "floor", kind: "floor", position: [-1.5, 1.7, 4.2], target: [1, 1, -8], fovDeg: 72 },
      { name: "desk", kind: "desk", position: [1.4, 1.35, 2.3], target: [-0.4, 1.25, 8], fovDeg: 62 },
      { name: "turntable", kind: "turntable", position: [-5, 1, 2.9], target: [centre[0], 0.8, centre[2]], fovDeg: 42 },
    ],
    room: { x: [x0, x1], z: [z0, z1], height: lowH },
    background: "sky",
  };
}

export function buildInterior(id: InteriorId): Interior {
  switch (id) {
    case "village-garage":
      return villageGarage();
    case "town-dealer":
      return townDealer();
    case "waterfront-showroom":
      return waterfrontShowroom();
  }
}
