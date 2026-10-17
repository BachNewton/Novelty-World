import { BoxGeometry, type BufferGeometry, CapsuleGeometry, CylinderGeometry, IcosahedronGeometry, LatheGeometry, Quaternion, SphereGeometry, TorusGeometry, Vector2, Vector3 } from "three";
import { createRng, uniform, type Rng } from "@/shared/lib/seeded-random";
import type { DishId } from "../gameplay/recipes";
import { dishLook, type DishLook, type DishPalette, type Heap, type Topping } from "./dish-looks";
import { lumpy, paint, type Piece } from "./painted";

/*
 * Every dish as a small storybook model: soft simple forms with their
 * colours in their vertices, served in birch wood (a plate, a bowl, a
 * board, a kuksa cup) or on a stick, from its look (see `dish-looks.ts`).
 * Shapes are in metres at life size, standing on the origin; whoever shows
 * one scales it up to read, as the forage is.
 */

const UP = new Vector3(0, 1, 0);

/** Where a dish's top is, for laying its toppings: a disc at a height, or a line along a stick. */
type Top = { kind: "disc"; y: number; radius: number } | { kind: "line"; from: Vector3; to: Vector3; radius: number };

function lathe(profile: readonly (readonly [number, number])[], segments = 20): BufferGeometry {
  return new LatheGeometry(
    profile.map(([r, y]) => new Vector2(r, y)),
    segments,
  );
}

function ball(radius: number, at: Vector3, squash = 1, detail = 1, rng?: Rng): BufferGeometry {
  const g = new IcosahedronGeometry(radius, detail);
  if (rng) lumpy(g, () => rng.next(), 0.85, 1.12);
  g.scale(1, squash, 1);
  g.translate(at.x, at.y, at.z);
  return g;
}

/** A round rod from one point to another. */
function rod(from: Vector3, to: Vector3, radius: number, sides = 6): BufferGeometry {
  const way = to.clone().sub(from);
  const g = new CylinderGeometry(radius, radius, way.length(), sides);
  g.translate(0, way.length() / 2, 0);
  g.applyQuaternion(new Quaternion().setFromUnitVectors(UP, way.clone().normalize()));
  g.translate(from.x, from.y, from.z);
  return g;
}

/** The stick a dish is served on, lying with its handle end down: from its butt to its tip. */
const STICK = { from: new Vector3(-0.24, 0.008, 0), to: new Vector3(0.2, 0.07, 0) } as const;
const along = (t: number) => STICK.from.clone().lerp(STICK.to, t);

/** The vessel, and where its body sits. */
function vessel(look: DishLook, p: DishPalette, pieces: Piece[]): number {
  switch (look.vessel) {
    case "plate": {
      pieces.push({ geometry: lathe([[0, 0], [0.09, 0], [0.11, 0.008], [0.135, 0.018], [0.13, 0.021], [0.1, 0.012], [0, 0.011]], 24), colour: p.birch, shading: 0.25 });
      return 0.012;
    }
    case "bowl": {
      pieces.push({ geometry: lathe([[0, 0], [0.04, 0], [0.045, 0.008], [0.08, 0.03], [0.1, 0.062], [0.094, 0.066], [0.082, 0.04], [0.05, 0.02], [0, 0.017]], 22), colour: p.birch, shading: 0.35 });
      return 0.017;
    }
    case "cup": {
      // A kuksa: a deep birch cup with a stubby handle.
      pieces.push({ geometry: lathe([[0, 0], [0.04, 0], [0.05, 0.012], [0.062, 0.05], [0.066, 0.075], [0.06, 0.077], [0.056, 0.05], [0.045, 0.018], [0, 0.014]], 20), colour: p.kuksa, shading: 0.35 });
      const handle = new BoxGeometry(0.05, 0.018, 0.03);
      handle.translate(0.085, 0.066, 0);
      pieces.push({ geometry: handle, colour: p.kuksa, shading: 0.3 });
      return 0.014;
    }
    case "board": {
      const board = new CylinderGeometry(0.14, 0.142, 0.022, 26);
      board.translate(0, 0.011, 0);
      const tab = new BoxGeometry(0.08, 0.02, 0.05);
      tab.translate(0.17, 0.011, 0);
      pieces.push({ geometry: board, colour: p.birch, shading: 0.3 }, { geometry: tab, colour: p.birch, shading: 0.3 });
      return 0.022;
    }
    case "stick": {
      pieces.push({ geometry: rod(STICK.from, STICK.to, 0.006, 6), colour: p.stick, shading: 0.2 });
      return 0;
    }
  }
}

/** The body of the dish on its vessel, and where its toppings lie. */
function body(heap: Heap, base: number, look: DishLook, p: DishPalette, rng: Rng, pieces: Piece[]): Top {
  switch (heap.form) {
    case "fill": {
      const cup = look.vessel === "cup";
      const radius = cup ? 0.055 : 0.088;
      const y = cup ? 0.06 : 0.052;
      const surface = new CylinderGeometry(radius, radius * 0.6, y - base, 22);
      surface.translate(0, base + (y - base) / 2, 0);
      pieces.push({ geometry: surface, colour: p[heap.tone], shading: 0.15 });
      return { kind: "disc", y, radius: radius * 0.72 };
    }
    case "stack": {
      let y = base;
      for (let l = 0; l < heap.layers; l++) {
        const radius = uniform(rng, 0.072, 0.082);
        const cake = new CylinderGeometry(radius, radius * 0.97, 0.011, 22);
        cake.translate(uniform(rng, -0.005, 0.005), y + 0.0055, uniform(rng, -0.005, 0.005));
        pieces.push({ geometry: cake, colour: p[heap.tone].clone().multiplyScalar(uniform(rng, 0.92, 1.04)), shading: 0.5 });
        y += 0.011;
      }
      return { kind: "disc", y, radius: 0.05 };
    }
    case "pie": {
      const crust = new CylinderGeometry(0.112, 0.105, 0.026, 26);
      crust.translate(0, base + 0.013, 0);
      const top = new CylinderGeometry(0.098, 0.098, 0.004, 26);
      top.translate(0, base + 0.026, 0);
      const rim = new TorusGeometry(0.103, 0.011, 6, 26);
      rim.rotateX(Math.PI / 2);
      rim.translate(0, base + 0.027, 0);
      pieces.push({ geometry: crust, colour: p[heap.crust], shading: 0.4 }, { geometry: top, colour: p[heap.top] }, { geometry: rim, colour: p[heap.crust], shading: 0.3 });
      return { kind: "disc", y: base + 0.029, radius: 0.08 };
    }
    case "slice": {
      const bread = new BoxGeometry(0.15, 0.02, 0.11, 2, 1, 2);
      bread.translate(0, base + 0.01, 0);
      const crust = new BoxGeometry(0.156, 0.016, 0.116);
      crust.translate(0, base + 0.008, 0);
      pieces.push({ geometry: crust, colour: p[heap.tone].clone().multiplyScalar(0.8), shading: 0.3 }, { geometry: bread, colour: p[heap.tone], shading: 0.3 });
      return { kind: "disc", y: base + 0.022, radius: 0.05 };
    }
    case "pile": {
      for (let k = 0; k < 6; k++) {
        const angle = (k / 6) * Math.PI * 2;
        pieces.push({ geometry: ball(0.034, new Vector3(Math.cos(angle) * 0.04, base + 0.014, Math.sin(angle) * 0.04), 0.5, 1, rng), colour: p[heap.tone].clone().multiplyScalar(uniform(rng, 0.9, 1.05)), shading: 0.4 });
      }
      pieces.push({ geometry: ball(0.04, new Vector3(0, base + 0.022, 0), 0.55, 1, rng), colour: p[heap.tone], shading: 0.4 });
      return { kind: "disc", y: base + 0.036, radius: 0.06 };
    }
    case "dough": {
      // Dough wound round the stick's end, in a few fat twists.
      for (let k = 0; k < 5; k++) {
        const at = along(0.62 + k * 0.08);
        const twist = new CapsuleGeometry(0.018, 0.022, 4, 10);
        twist.rotateZ(Math.PI / 2 + 0.5);
        twist.rotateX(k * 1.1);
        twist.translate(at.x, at.y, at.z);
        pieces.push({ geometry: twist, colour: p[heap.tone].clone().multiplyScalar(k % 2 === 0 ? 1 : 0.88), shading: 0.4 });
      }
      return { kind: "line", from: along(0.62), to: along(0.95), radius: 0.022 };
    }
    case "skewer": {
      heap.tones.forEach((tone, k) => {
        const at = along(0.55 + k * (0.4 / heap.tones.length));
        pieces.push({ geometry: ball(0.021, at, 0.8, 0, rng), colour: p[tone].clone().multiplyScalar(uniform(rng, 0.88, 1.05)), shading: 0.45 });
      });
      return { kind: "line", from: along(0.55), to: along(0.95), radius: 0.02 };
    }
  }
}

/** A point on the top for a topping: on a disc, more of them towards the middle, or round a stick. */
function onTop(top: Top, rng: Rng, lift: number): Vector3 {
  if (top.kind === "disc") {
    const angle = rng.next() * Math.PI * 2;
    const r = top.radius * Math.sqrt(rng.next());
    return new Vector3(Math.cos(angle) * r, top.y + lift, Math.sin(angle) * r);
  }
  const at = top.from.clone().lerp(top.to, rng.next());
  const angle = uniform(rng, -0.4, 1.8);
  return at.add(new Vector3(0, Math.cos(angle) * top.radius, Math.sin(angle) * top.radius));
}

const TOPPING_SIZE = { berry: 0.011, chunk: 0.014, dollop: 0.022, sprig: 0.012, crumb: 0.007 } as const;

function topping({ tone, shape, count }: Topping, top: Top, p: DishPalette, rng: Rng, pieces: Piece[]): void {
  const size = TOPPING_SIZE[shape];
  for (let k = 0; k < count; k++) {
    const colour = p[tone].clone().multiplyScalar(uniform(rng, 0.9, 1.08));
    switch (shape) {
      case "berry":
        pieces.push({ geometry: ball(size * uniform(rng, 0.9, 1.15), onTop(top, rng, size * 0.6), 1, 1), colour, shading: 0.5 });
        break;
      case "chunk":
        pieces.push({ geometry: ball(size * uniform(rng, 0.85, 1.2), onTop(top, rng, size * 0.4), 0.55, 0, rng), colour, shading: 0.4 });
        break;
      case "dollop": {
        const at = top.kind === "disc" && k === 0 ? new Vector3(0, top.y + size * 0.35, 0) : onTop(top, rng, size * 0.35);
        pieces.push({ geometry: ball(size, at, 0.55, 2), colour, shading: 0.25 });
        break;
      }
      case "sprig": {
        const leaf = new SphereGeometry(size, 6, 4);
        leaf.scale(1.6, 0.25, 0.6);
        leaf.rotateY(rng.next() * Math.PI);
        const at = onTop(top, rng, size * 0.3);
        leaf.translate(at.x, at.y, at.z);
        pieces.push({ geometry: leaf, colour });
        break;
      }
      case "crumb":
        pieces.push({ geometry: ball(size * uniform(rng, 0.8, 1.3), onTop(top, rng, size * 0.3), 0.7, 0, rng), colour, shading: 0.3 });
        break;
    }
  }
}

/** A dish's model, at life size on the origin. */
export function dishShape(dish: DishId, palette: DishPalette): BufferGeometry {
  const look = dishLook(dish);
  const rng = createRng(`hearthwood/dish/${dish}`);
  const pieces: Piece[] = [];
  const base = vessel(look, palette, pieces);
  const top = body(look.heap, base, look, palette, rng, pieces);
  for (const t of look.toppings) topping(t, top, palette, rng, pieces);
  return paint(pieces);
}

/** How wide a dish's model reaches from its middle, in metres at life size, for spacing and framing it. */
export function dishRadius(dish: DishId): number {
  return dishLook(dish).vessel === "stick" ? 0.24 : 0.15;
}

