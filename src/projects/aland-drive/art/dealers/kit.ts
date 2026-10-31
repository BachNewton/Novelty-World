import type { Brand } from "./brands";
import type { Finish, Paint, Shell, V3 } from "./shell";

/*
 * The pieces of a car trade, each at its own origin, on the floor, front to +z, to be stood somewhere with
 * `shell.within`. Each is small: a building or a room wears many.
 */

export function tyre(s: Shell, y: number, radius = 0.33, width = 0.22, sides = 6): void {
  s.lathe([[radius * 0.6, y], [radius, y], [radius, y + width], [radius * 0.6, y + width]], sides, "dealer-rubber");
}

export function tyreStack(s: Shell, count: number): void {
  for (let index = 0; index < count; index++) tyre(s, index * 0.225);
}

export function barrel(s: Shell, paint: Paint): void {
  s.lathe([[0.29, 0], [0.29, 0.86], [0, 0.88]], 8, paint);
}

/** A flat board on two posts, with lettering on the side facing +z. */
export function postSign(s: Shell, lines: readonly string[], wide: number, tall: number, foot: number, face: Paint, ink: Paint, glow = 0): void {
  s.box([-wide / 2, foot, -0.06], [wide / 2, foot + tall, 0.06], face, { glow });
  for (const x of [-wide * 0.35, wide * 0.35]) s.box([x - 0.05, 0, -0.05], [x + 0.05, foot, 0.05], "dealer-steel-dark");
  const size = (tall * 0.8) / lines.length / 1.5;
  lines.forEach((line, index) => {
    s.within({ y: foot + tall - (index + 0.5) * (tall / lines.length) - size / 2, z: 0.065 }, () => s.text(line, size, ink, { glow }));
  });
}

export function fuelPump(s: Shell, brand: Brand): void {
  s.box([-0.45, 0, -0.28], [0.45, 0.14, 0.28], "dealer-concrete");
  s.box([-0.32, 0.14, -0.2], [0.32, 1.85, 0.2], "wall-trim");
  s.box([-0.32, 1.5, -0.205], [0.32, 1.85, 0.205], brand.colour);
  s.box([-0.2, 1.0, 0.2], [0.2, 1.35, 0.215], "wall-glass", { gloss: 0.4 });
  s.bar([0.32, 1.1, 0.1], [0.44, 0.7, 0.1], 0.05, "dealer-rubber");
  s.bar([-0.32, 1.1, 0.1], [-0.44, 0.7, 0.1], 0.05, "dealer-rubber");
}

export function bollard(s: Shell, height: number, paint: Paint, finish: Finish = {}): void {
  s.box([-0.07, 0, -0.07], [0.07, height, 0.07], paint, finish);
}

export function lampPost(s: Shell, height: number): void {
  s.box([-0.07, 0, -0.07], [0.07, height, 0.07], "dealer-steel-dark");
  s.box([-0.07, height - 0.1, 0], [0.07, height, 1.2], "dealer-steel-dark");
  s.box([-0.1, height - 0.14, 0.7], [0.1, height - 0.1, 1.15], "dealer-light-cool", { glow: 1 });
}

/** A pole and a banner flag down its side, the logo on it. */
export function bannerFlag(s: Shell, brand: Brand, height: number): void {
  s.box([-0.04, 0, -0.04], [0.04, height, 0.04], "dealer-steel");
  s.box([0.04, height - 3.4, -0.012], [1, height - 0.2, 0.012], brand.colour);
  s.within({ x: 0.52, y: height - 1, z: 0.02 }, () => s.logo(brand, 0.33));
  s.within({ x: 0.52, y: height - 1, z: -0.02, yaw: Math.PI }, () => s.logo(brand, 0.33));
}

/** A tall brand totem, its logo and name on both broad faces. */
export function pylon(s: Shell, brand: Brand, wide: number, tall: number): void {
  s.box([-wide / 2, 0, -0.22], [wide / 2, tall, 0.22], brand.colour, { shade: [0.9, 0.9, 1, 1] });
  for (const yaw of [0, Math.PI]) {
    s.within({ y: tall - wide * 0.62, z: 0, yaw }, () => {
      s.within({ z: 0.226 }, () => s.logo(brand, wide * 0.36, { glow: 0.8 }));
    });
    s.within({ y: tall - wide * 1.45, yaw }, () => {
      s.within({ z: 0.225 }, () => s.text(brand.name, wide * 0.15, "wall-trim", { glow: 0.85 }));
    });
  }
}

/** A roller door in a wall lying on z 0, facing +z, closed or standing open on a dark bay. */
export function rollerDoor(s: Shell, wide: number, tall: number, open: boolean): void {
  s.box([-wide / 2 - 0.1, 0, 0], [-wide / 2, tall + 0.1, 0.1], "dealer-steel-dark");
  s.box([wide / 2, 0, 0], [wide / 2 + 0.1, tall + 0.1, 0.1], "dealer-steel-dark");
  s.box([-wide / 2, tall, 0], [wide / 2, tall + 0.1, 0.1], "dealer-steel-dark");
  if (open) s.quad([-wide / 2, 0, 0.02], [wide / 2, 0, 0.02], [wide / 2, tall, 0.02], [-wide / 2, tall, 0.02], "dealer-shade", { shade: [1.6, 1.6, 0.8, 0.8] });
  else s.quad([-wide / 2, 0, 0.03], [wide / 2, 0, 0.03], [wide / 2, tall, 0.03], [-wide / 2, tall, 0.03], "dealer-panel", { pattern: "ribs", shade: [0.82, 0.82, 0.95, 0.95] });
}

/** A framed window in a wall lying on z 0, facing +z. */
export function windowFrame(s: Shell, wide: number, tall: number, sill: number, frame: Paint, lit = false): void {
  s.box([-wide / 2 - 0.07, sill - 0.07, 0], [wide / 2 + 0.07, sill + tall + 0.07, 0.05], frame);
  s.quad([-wide / 2, sill, 0.055], [wide / 2, sill, 0.055], [wide / 2, sill + tall, 0.055], [-wide / 2, sill + tall, 0.055], lit ? "dealer-light-warm" : "dealer-glass", lit ? { glow: 0.75 } : { gloss: 0.8 });
  s.box([-0.025, sill, 0.055], [0.025, sill + tall, 0.07], frame);
}

/** Ground paint for a parking bay's two sides. */
export function bayLines(s: Shell, wide: number, long: number, paint: Paint = "road-paint"): void {
  for (const x of [-wide / 2, wide / 2]) s.quad([x - 0.05, 0.005, 0], [x + 0.05, 0.005, 0], [x + 0.05, 0.005, -long], [x - 0.05, 0.005, -long], paint);
}

export function planter(s: Shell, wide: number): void {
  s.box([-wide / 2, 0, -0.3], [wide / 2, 0.5, 0.3], "dealer-stone");
  s.box([-wide / 2 + 0.06, 0.5, -0.24], [wide / 2 - 0.06, 0.58, 0.24], "tree-birch", { pattern: "speckle" });
  for (const x of [-wide / 4, wide / 4]) s.within({ x }, () => s.lathe([[0.26, 0.55], [0.34, 0.8], [0.14, 1.05], [0, 1.1]], 6, "tree-spruce"));
}

/** A car lift: two posts and arms, the arms at `liftM`. */
export function carLift(s: Shell, liftM: number): void {
  for (const side of [-1, 1]) {
    s.box([side * 1.62 - 0.14, 0, -0.14], [side * 1.62 + 0.14, 3.7, 0.14], "dealer-klippa");
    s.box([side * 1.62 - 0.26, 0, -0.26], [side * 1.62 + 0.26, 0.04, 0.26], "dealer-steel-dark");
    for (const z of [-1, 1]) s.bar([side * 1.62, liftM, 0], [side * 0.72, liftM, z * 0.95], 0.1, "dealer-steel-dark");
  }
  s.box([-1.62, 3.7, -0.07], [1.62, 3.82, 0.07], "dealer-klippa");
}

export function workbench(s: Shell, wide: number): void {
  s.box([-wide / 2, 0.82, -0.32], [wide / 2, 0.88, 0.32], "dealer-timber");
  for (const x of [-wide / 2 + 0.1, wide / 2 - 0.1]) s.box([x - 0.04, 0, -0.26], [x + 0.04, 0.82, 0.26], "dealer-steel-dark");
  s.box([-wide / 2 + 0.3, 0, -0.28], [-wide / 2 + 0.9, 0.7, 0.26], "wall-red", { pattern: "ribs" });
  s.box([wide / 2 - 0.9, 0.88, -0.12], [wide / 2 - 0.45, 1.08, 0.12], "wall-red");
  s.box([-wide / 2, 0.9, -0.34], [wide / 2, 2.1, -0.3], "dealer-steel-dark", { pattern: "seams" });
  const tools: V3[] = [[-0.7, 1.7, 0.4], [-0.45, 1.6, 0.5], [-0.2, 1.75, 0.3], [0.1, 1.55, 0.6], [0.4, 1.7, 0.35], [0.7, 1.6, 0.5]];
  for (const [x, y, length] of tools) s.box([x - 0.025, y - length / 2, -0.3], [x + 0.025, y + length / 2, -0.28], "dealer-steel");
}

export function tyreRack(s: Shell, wide: number): void {
  for (const y of [0, 1.05, 2.1]) s.box([-wide / 2, y + 0.12, -0.35], [wide / 2, y + 0.16, 0.35], "dealer-klippa");
  for (const x of [-wide / 2, 0, wide / 2]) s.box([x - 0.04, 0, -0.04], [x + 0.04, 3, 0.04], "dealer-steel-dark");
  for (const y of [0, 1.05, 2.1]) {
    for (let x = -wide / 2 + 0.4; x < wide / 2 - 0.2; x += 0.72) s.within({ x, y: y + 0.5, pitch: Math.PI / 2 }, () => tyre(s, -0.11, 0.33, 0.22, 7));
  }
}

export function chair(s: Shell, paint: Paint): void {
  s.box([-0.23, 0.44, -0.23], [0.23, 0.52, 0.23], paint);
  s.box([-0.23, 0.52, -0.25], [0.23, 0.92, -0.19], paint);
  s.lathe([[0.24, 0], [0.03, 0.03], [0.03, 0.44]], 5, "dealer-steel");
}

export function sofa(s: Shell, wide: number, paint: Paint): void {
  s.box([-wide / 2, 0.14, -0.4], [wide / 2, 0.44, 0.4], paint);
  s.box([-wide / 2, 0.44, -0.42], [wide / 2, 0.86, -0.2], paint, { shade: 0.9 });
  for (const x of [-wide / 2 - 0.1, wide / 2]) s.box([x, 0.14, -0.42], [x + 0.1, 0.62, 0.42], paint, { shade: 0.86 });
  s.box([-wide / 2, 0, -0.36], [wide / 2, 0.14, 0.36], "dealer-steel-dark");
}

export function coffeeTable(s: Shell): void {
  s.lathe([[0.42, 0.38], [0.42, 0.42], [0, 0.42]], 10, "dealer-stone", { gloss: 0.4 });
  s.lathe([[0.2, 0], [0.04, 0.03], [0.04, 0.38]], 6, "dealer-steel-dark");
}

/** A sales desk, the salesman's side to -z, with a screen and two seats facing it. */
export function salesDesk(s: Shell, top: Paint, front: Paint, brand: Brand): void {
  s.box([-1.1, 0, -0.1], [1.1, 0.72, 0.42], front);
  s.box([-1.16, 0.72, -0.46], [1.16, 0.77, 0.46], top, { gloss: 0.4 });
  s.within({ z: 0.425, y: 0.38 }, () => s.logo(brand, 0.2));
  s.box([-0.3, 0.8, -0.23], [0.3, 1.14, -0.2], "dealer-rubber");
  s.quad([0.28, 0.82, -0.235], [-0.28, 0.82, -0.235], [-0.28, 1.12, -0.235], [0.28, 1.12, -0.235], brand.ink === "dealer-vastan-ink" ? "dealer-vastan" : "dealer-light-cool", { glow: 0.8 });
  s.box([-0.06, 0.77, -0.25], [0.06, 0.8, -0.18], "dealer-rubber");
  s.within({ x: 0, z: -0.95, yaw: 0 }, () => chair(s, "dealer-rubber"));
  s.within({ x: -0.6, z: 1.0, yaw: Math.PI }, () => chair(s, "dealer-fabric"));
  s.within({ x: 0.6, z: 1.0, yaw: Math.PI }, () => chair(s, "dealer-fabric"));
}

/** A price stand beside a car: name, price, a line of small print. */
export function priceStand(s: Shell, brand: Brand, car: string, price: string, ground: Paint): void {
  s.lathe([[0.2, 0], [0.02, 0.03], [0.02, 1.2]], 5, "dealer-steel-dark");
  s.within({ y: 1.2, pitch: -0.25 }, () => {
    s.box([-0.28, -0.2, -0.015], [0.28, 0.2, 0.015], ground);
    s.within({ z: 0.018 }, () => {
      s.box([-0.28, 0.13, 0], [0.28, 0.2, 0.002], brand.colour);
      s.within({ y: 0.032 }, () => s.text(car.toUpperCase(), 0.06, brand.ink === "dealer-tarna" ? "dealer-tarna-ink" : "dealer-klippa-ink"));
      s.within({ y: -0.1 }, () => s.text(price, 0.075, "dealer-klippa-ink"));
    });
  });
}

/** A brand banner hanging from a ceiling on two wires, the logo on both sides. */
export function ceilingBanner(s: Shell, brand: Brand, wide: number, tall: number, drop: number): void {
  for (const x of [-wide / 2 + 0.1, wide / 2 - 0.1]) s.box([x - 0.006, -drop, -0.006], [x + 0.006, 0, 0.006], "dealer-steel-dark");
  s.box([-wide / 2, -drop - tall, -0.01], [wide / 2, -drop, 0.01], brand.colour, { glow: 0.2 });
  for (const yaw of [0, Math.PI]) {
    s.within({ y: -drop - tall * 0.42, yaw }, () => {
      s.within({ z: 0.014 }, () => s.logo(brand, Math.min(wide, tall) * 0.3));
    });
    s.within({ y: -drop - tall * 0.92, yaw }, () => {
      s.within({ z: 0.014 }, () => s.text(brand.name, tall * 0.11, brand.ink === "dealer-klippa-ink" ? "dealer-klippa-ink" : "wall-trim"));
    });
  }
}

/** An enamel pendant lamp, hanging from y 0 by `drop`. */
export function pendantLamp(s: Shell, drop: number): void {
  s.box([-0.012, -drop, -0.012], [0.012, 0, 0.012], "dealer-rubber");
  s.lathe([[0.32, -drop - 0.22], [0.08, -drop], [0, -drop + 0.03]], 8, "dealer-klippa");
  s.lathe([[0.3, -drop - 0.22], [0, -drop - 0.21]], 8, "dealer-light-warm", { glow: 1 });
}

export function ceilingPanel(s: Shell, wide: number, long: number, paint: Paint = "dealer-light-cool"): void {
  s.quad([-wide / 2, -0.02, -long / 2], [wide / 2, -0.02, -long / 2], [wide / 2, -0.02, long / 2], [-wide / 2, -0.02, long / 2], paint, { glow: 1 });
}

/** A ring of light overhead, for a turntable: a square-section hoop, its under side shining. */
export function lightHalo(s: Shell, radius: number, paint: Paint, housing: Paint): void {
  s.lathe([[radius + 0.1, 0.12], [radius + 0.1, 0], [radius, 0]], 36, housing);
  s.lathe([[radius - 0.08, 0.12], [radius - 0.08, 0.02], [radius, 0.0]], 36, paint, { glow: 1 });
  for (let spoke = 0; spoke < 3; spoke++) {
    const angle = 0.6 + (spoke * 2 * Math.PI) / 3;
    s.bar([Math.cos(angle) * radius, 0.1, Math.sin(angle) * radius], [Math.cos(angle) * radius, 2.4, Math.sin(angle) * radius], 0.02, "dealer-steel-dark");
  }
}

/** A round deck that turns, its surface at `deckY`: the part a room spins, drawn at its own centre. */
export function turntableDeck(s: Shell, radius: number, deckY: number, top: Paint, rim: Paint, lines: Paint): void {
  s.lathe([[radius, 0.005], [radius, deckY], [radius - 0.03, deckY + 0.01], [radius * 0.5, deckY + 0.01]], 40, rim);
  s.lathe([[radius - 0.03, deckY + 0.01], [0, deckY + 0.012]], 40, top, { gloss: 0.45 });
  for (let index = 0; index < 8; index++) {
    const angle = (index * Math.PI) / 4;
    s.within({ y: deckY + 0.015, yaw: angle }, () => {
      s.quad([-0.018, 0, radius - 0.5], [0.018, 0, radius - 0.5], [0.018, 0, radius - 0.12], [-0.018, 0, radius - 0.12], lines);
    });
  }
}
