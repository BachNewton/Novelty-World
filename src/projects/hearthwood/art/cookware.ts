import { type BufferGeometry, CylinderGeometry, IcosahedronGeometry, LatheGeometry, Quaternion, Vector2, Vector3 } from "three";
import { createRng, uniform } from "@/shared/lib/seeded-random";
import { isFood, type Cookware, type Ingredient } from "../gameplay/recipes";
import { ingredientTone, type DishPalette } from "./dish-looks";
import { lumpy, paint, type Piece } from "./painted";

/*
 * What cooks over the camp's fire: a cast-iron pan set on the burning logs,
 * a roasting stick propped over the flames from the ground, and the pot
 * that already hangs from camp's tripod (drawn with the camp). Each is laid
 * out in the fire's own frame (its middle on the ground, +z towards
 * Elliott), drawn a little larger than life, as the forage is. The
 * ingredients chosen go in as soft lumps of their colours.
 */

/** How much larger than life the cookware and what is in it are drawn. */
export const COOKWARE_LARGER = 1.35;

const UP = new Vector3(0, 1, 0);

/** Where the stick is pushed into the ground, and its tip over the flames, in the fire's frame. */
export const STICK_LINE = { butt: new Vector3(0.55, 0, 1.75), tip: new Vector3(-0.03, 0.8, 0.05) } as const;

/** Where each way of cooking sits in the fire's frame: what is in it, and where its steam rises from. */
export const COOKWARE_AT: Record<Cookware, { contents: Vector3; steam: Vector3 }> = {
  pan: { contents: new Vector3(0, 0.6, 0.08), steam: new Vector3(0, 0.66, 0.08) },
  // The pot that hangs from camp's tripod.
  pot: { contents: new Vector3(0, 1.12, 0), steam: new Vector3(0, 1.2, 0) },
  stick: { contents: STICK_LINE.tip.clone(), steam: STICK_LINE.tip.clone().add(new Vector3(0, 0.06, 0)) },
};

/** A cast-iron pan at life size, its floor on the origin and its handle along +x. */
export function panShape(p: DishPalette): BufferGeometry {
  const pan = new LatheGeometry(
    [
      [0, 0],
      [0.11, 0],
      [0.13, 0.008],
      [0.15, 0.04],
      [0.142, 0.042],
      [0.122, 0.012],
      [0, 0.009],
    ].map(([r, y]) => new Vector2(r, y)),
    24,
  );
  const handle = new CylinderGeometry(0.012, 0.014, 0.2, 6);
  handle.rotateZ(Math.PI / 2 - 0.12);
  handle.translate(0.24, 0.045, 0);
  const grip = new CylinderGeometry(0.02, 0.018, 0.12, 8);
  grip.rotateZ(Math.PI / 2 - 0.12);
  grip.translate(0.38, 0.062, 0);
  return paint([
    { geometry: pan, colour: p.iron, shading: 0.5 },
    { geometry: handle, colour: p.iron, shading: 0.2 },
    { geometry: grip, colour: p.grip, shading: 0.3 },
  ]);
}

/** A roasting stick, a peeled green branch, from its butt on the origin along +y for its length. */
export function stickShape(p: DishPalette, length: number): BufferGeometry {
  const stick = new CylinderGeometry(0.008, 0.016, length, 6);
  stick.translate(0, length / 2, 0);
  const twig = new CylinderGeometry(0.003, 0.006, 0.12, 4);
  twig.translate(0, 0.06, 0);
  twig.rotateZ(-0.6);
  twig.translate(0, length * 0.35, 0);
  return paint([
    { geometry: stick, colour: p.stick, shading: 0.25 },
    { geometry: twig, colour: p.stick, shading: 0.2 },
  ]);
}

/** The stick laid from its butt to its tip in the fire's frame: the turn that takes +y along it, and its length. */
export function stickPlacing(): { turn: Quaternion; length: number } {
  const way = STICK_LINE.tip.clone().sub(STICK_LINE.butt);
  return { turn: new Quaternion().setFromUnitVectors(UP, way.clone().normalize()), length: way.length() };
}

/**
 * The ingredients in their cookware, at life size round the origin (the
 * contents' middle): a few lumps of each, spread over the pan, floating in
 * the pot, threaded along the stick's tip. Something from the forest is a
 * few berries or pieces; a staple is a lump, a dollop or a scatter of oats.
 */
export function contentsShape(ingredients: readonly Ingredient[], cookware: Cookware, p: DishPalette): BufferGeometry | null {
  if (ingredients.length === 0) return null;
  const rng = createRng(`hearthwood/contents/${cookware}/${ingredients.join("+")}`);
  const pieces: Piece[] = [];
  const along = STICK_LINE.tip.clone().sub(STICK_LINE.butt).normalize();
  ingredients.forEach((ingredient, i) => {
    const food = isFood(ingredient);
    const count = food ? 5 : ingredient === "oats" ? 7 : 2;
    const radius = food ? 0.018 : ingredient === "oats" ? 0.009 : 0.022;
    for (let k = 0; k < count; k++) {
      let at: Vector3;
      if (cookware === "stick") {
        // Threaded one after another down from the tip.
        const t = -(i * 0.07 + (k / count) * 0.06);
        at = along.clone().multiplyScalar(t);
        at.y += uniform(rng, -0.004, 0.004);
      } else {
        const spread = cookware === "pan" ? 0.11 : 0.12;
        const angle = rng.next() * Math.PI * 2;
        const r = spread * Math.sqrt(rng.next());
        at = new Vector3(Math.cos(angle) * r, radius * 0.4, Math.sin(angle) * r);
      }
      const lump = new IcosahedronGeometry(radius * uniform(rng, 0.85, 1.2), food ? 1 : 0);
      lumpy(lump, () => rng.next(), 0.88, 1.1);
      lump.scale(1, food || cookware === "stick" ? 0.9 : 0.5, 1);
      lump.translate(at.x, at.y, at.z);
      pieces.push({ geometry: lump, colour: p[ingredientTone(ingredient)].clone().multiplyScalar(uniform(rng, 0.9, 1.06)), shading: 0.4 });
    }
  });
  return paint(pieces);
}
