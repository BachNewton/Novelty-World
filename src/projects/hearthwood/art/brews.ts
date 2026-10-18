import { type BufferGeometry, Color, CylinderGeometry, IcosahedronGeometry, LatheGeometry, SphereGeometry, TorusGeometry, Vector2, Vector3 } from "three";
import { createRng, uniform, type Rng } from "@/shared/lib/seeded-random";
import type { BrewId, BrewIngredient } from "../gameplay/brews";
import { brewIngredientTone, brewLook, type BrewLook, type BrewPalette, type BrewTone } from "./brew-looks";
import { lumpy, paint, type Piece } from "./painted";

/*
 * The brewing's storybook models: the iron cauldron that stands on its
 * three legs in the embers, what floats in it, and every brew in its
 * vessel (a stoppered bottle, a little salve tin, a linen charm pouch tied
 * with red thread), from its look (see `brew-looks.ts`). Soft simple forms
 * with their colours in their vertices; in metres at life size, standing
 * on the origin, scaled up to read by whoever shows them.
 */

function lathe(profile: readonly (readonly [number, number])[], segments = 20): BufferGeometry {
  return new LatheGeometry(
    profile.map(([r, y]) => new Vector2(r, y)),
    segments,
  );
}

function ball(radius: number, at: Vector3, squash = 1, detail = 1, rng?: Rng): BufferGeometry {
  const g = new IcosahedronGeometry(radius, detail);
  if (rng) lumpy(g, () => rng.next(), 0.88, 1.12);
  g.scale(1, squash, 1);
  g.translate(at.x, at.y, at.z);
  return g;
}

/** The cauldron's height at its rim, at life size, and how wide its mouth is: where the brew's surface lies. */
export const CAULDRON = { rim: 0.3, mouth: 0.15, surface: 0.255 } as const;

/** A round-bellied iron cauldron on three stubby legs, its rim at `CAULDRON.rim`, with a bail to lift it by. */
export function cauldronShape(p: BrewPalette): BufferGeometry {
  const body = lathe(
    [
      [0.0001, 0.06],
      [0.08, 0.062],
      [0.15, 0.09],
      [0.19, 0.15],
      [0.19, 0.21],
      [0.165, 0.27],
      [0.15, 0.285],
      [0.168, 0.3],
      [0.172, 0.31],
      [0.15, 0.305],
      [0.14, 0.29],
      [0.17, 0.21],
      [0.0001, 0.08],
    ],
    24,
  );
  const pieces: Piece[] = [{ geometry: body, colour: p.cauldron, shading: 0.55 }];
  for (let leg = 0; leg < 3; leg++) {
    const angle = (leg / 3) * Math.PI * 2 + 0.5;
    const g = new CylinderGeometry(0.018, 0.012, 0.09, 6);
    g.rotateZ(0.25);
    g.rotateY(-angle);
    g.translate(Math.cos(angle) * 0.12, 0.045, Math.sin(angle) * 0.12);
    pieces.push({ geometry: g, colour: p.cauldron, shading: 0.3 });
  }
  for (const side of [-1, 1]) {
    const lug = new TorusGeometry(0.022, 0.007, 5, 10);
    lug.rotateY(Math.PI / 2);
    lug.translate(side * 0.172, 0.27, 0);
    pieces.push({ geometry: lug, colour: p.cauldron });
  }
  const bail = new TorusGeometry(0.175, 0.006, 4, 24, Math.PI);
  bail.rotateZ(0);
  bail.translate(0, 0.27, 0);
  bail.rotateX(-0.9);
  pieces.push({ geometry: bail, colour: p.cauldron });
  return paint(pieces);
}

/** The brew's surface in the cauldron, at life size round the origin: a white disc, its colour its material's, which the scene turns as it brews. */
export function brewSurfaceShape(): BufferGeometry {
  const disc = new CylinderGeometry(CAULDRON.mouth, CAULDRON.mouth, 0.004, 24);
  return paint([{ geometry: disc, colour: new Color(1, 1, 1) }]);
}

/** What floats in the cauldron, at life size round the surface's middle: a few sprigs and berries of each thing chosen, a lump of wax, a scatter of salt. */
export function brewContentsShape(ingredients: readonly BrewIngredient[], p: BrewPalette): BufferGeometry | null {
  if (ingredients.length === 0) return null;
  const rng = createRng(`hearthwood/brew-contents/${ingredients.join("+")}`);
  const pieces: Piece[] = [];
  ingredients.forEach((ingredient) => {
    const staple = ingredient === "honey" || ingredient === "beeswax" || ingredient === "salt";
    const count = ingredient === "salt" ? 7 : staple ? 1 : 5;
    const radius = ingredient === "salt" ? 0.006 : staple ? 0.03 : 0.016;
    for (let k = 0; k < count; k++) {
      const angle = rng.next() * Math.PI * 2;
      const r = (CAULDRON.mouth - 0.03) * Math.sqrt(rng.next());
      const lump = ball(radius * uniform(rng, 0.85, 1.2), new Vector3(Math.cos(angle) * r, radius * 0.2, Math.sin(angle) * r), staple ? 0.45 : 0.8, staple ? 1 : 0, rng);
      pieces.push({ geometry: lump, colour: p[brewIngredientTone(ingredient)].clone().multiplyScalar(uniform(rng, 0.9, 1.06)), shading: 0.3 });
    }
  });
  return paint(pieces);
}

/** A sprig or a few berries of what went in, small and round, about a point. */
function sprig(tone: BrewTone, at: Vector3, p: BrewPalette, rng: Rng, pieces: Piece[], spread = 0.012): void {
  for (let k = 0; k < 5; k++) {
    const g = ball(uniform(rng, 0.006, 0.009), at.clone().add(new Vector3(uniform(rng, -spread, spread), uniform(rng, 0, spread), uniform(rng, -spread, spread))), 0.9, 0);
    pieces.push({ geometry: g, colour: p[tone].clone().multiplyScalar(uniform(rng, 0.92, 1.06)), shading: 0.3 });
  }
  const leaf = new SphereGeometry(0.012, 6, 3);
  leaf.scale(1.5, 0.25, 0.5);
  leaf.rotateY(rng.next() * Math.PI);
  leaf.translate(at.x, at.y - 0.004, at.z);
  pieces.push({ geometry: leaf, colour: p["bloom-leaf"] });
}

function bottle(look: BrewLook, p: BrewPalette, rng: Rng, pieces: Piece[]): void {
  // The tea's colour is the glass's: what shows through it.
  const body = lathe([[0.0001, 0], [0.034, 0], [0.04, 0.008], [0.042, 0.06], [0.036, 0.08], [0.0001, 0.08]], 18);
  const neck = lathe([[0.03, 0.078], [0.016, 0.098], [0.013, 0.118], [0.016, 0.122], [0.0001, 0.122]], 14);
  const cork = new CylinderGeometry(0.012, 0.01, 0.022, 10);
  cork.translate(0, 0.129, 0);
  const thread = new TorusGeometry(0.015, 0.0025, 4, 14);
  thread.rotateX(Math.PI / 2);
  thread.translate(0, 0.106, 0);
  pieces.push(
    { geometry: body, colour: p[look.tone], shading: 0.45 },
    { geometry: neck, colour: p.glass, shading: 0.2 },
    { geometry: cork, colour: p.cork, shading: 0.3 },
    { geometry: thread, colour: p.thread },
  );
  sprig(look.sprig, new Vector3(0.018, 0.106, 0.008), p, rng, pieces, 0.01);
}

function tin(look: BrewLook, p: BrewPalette, rng: Rng, pieces: Piece[]): void {
  const pot = new CylinderGeometry(0.045, 0.045, 0.03, 22);
  pot.translate(0, 0.015, 0);
  const salve = new CylinderGeometry(0.041, 0.041, 0.004, 22);
  salve.translate(0, 0.03, 0);
  // The lid leant against its tin.
  const lid = new CylinderGeometry(0.047, 0.047, 0.008, 22);
  lid.rotateX(1.25);
  lid.translate(0, 0.035, -0.058);
  pieces.push({ geometry: pot, colour: p.tin, shading: 0.4 }, { geometry: salve, colour: p[look.tone] }, { geometry: lid, colour: p.tin, shading: 0.3 });
  sprig(look.sprig, new Vector3(0.008, 0.036, 0.006), p, rng, pieces, 0.014);
}

function pouch(look: BrewLook, p: BrewPalette, rng: Rng, pieces: Piece[]): void {
  const bag = lathe([[0.0001, 0], [0.03, 0.004], [0.045, 0.025], [0.043, 0.05], [0.026, 0.07], [0.014, 0.078], [0.018, 0.088], [0.024, 0.098], [0.0001, 0.094]], 14);
  lumpy(bag, () => rng.next(), 0.94, 1.06);
  const tie = new TorusGeometry(0.015, 0.003, 4, 14);
  tie.rotateX(Math.PI / 2);
  tie.translate(0, 0.078, 0);
  const tail = new CylinderGeometry(0.0022, 0.0022, 0.045, 4);
  tail.rotateZ(0.9);
  tail.translate(0.024, 0.066, 0.01);
  pieces.push({ geometry: bag, colour: p[look.tone], shading: 0.4 }, { geometry: tie, colour: p.thread }, { geometry: tail, colour: p.thread });
  sprig(look.sprig, new Vector3(0, 0.104, 0), p, rng, pieces, 0.012);
}

/** A brew's model, at life size on the origin. */
export function brewShape(brew: BrewId, palette: BrewPalette): BufferGeometry {
  const look = brewLook(brew);
  const rng = createRng(`hearthwood/brew/${brew}`);
  const pieces: Piece[] = [];
  if (look.vessel === "bottle") bottle(look, palette, rng, pieces);
  else if (look.vessel === "tin") tin(look, palette, rng, pieces);
  else pouch(look, palette, rng, pieces);
  return paint(pieces);
}
