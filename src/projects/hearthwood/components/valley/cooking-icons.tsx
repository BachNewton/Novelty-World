import type { ReactNode } from "react";
import { createRng, uniform } from "@/shared/lib/seeded-random";
import type { Treat } from "../../gameplay/befriending";
import { humbleOf, isDish, isFood, recipeOf, type Cookware, type DishId, type Ingredient, type Staple } from "../../gameplay/recipes";
import { dishLook, toneVar, type DishLook, type Tone, type Topping } from "../../art/dish-looks";
import { FORAGE_NAMES, ForageIcon } from "./forage-icons";

/*
 * Little pictures for cooking, drawn in the cooking's and the forage's
 * tokens so a picture and the thing at the fire are the same colours: each
 * dish from the very look its model is made from, the staples Elliott
 * carries, and the three ways of cooking. Names are for tooltips and for
 * whoever can't see the picture.
 */

const RIM = "var(--color-hearthwood-valley-ui-shade)";
const t = (tone: Tone) => toneVar(tone);

export const STAPLE_NAMES: Record<Staple, string> = { oats: "Oats", flour: "Flour", butter: "Butter", honey: "Honey", cream: "Cream", eggs: "Eggs" };
export const COOKWARE_NAMES: Record<Cookware, string> = { pan: "The pan", pot: "The pot", stick: "A stick over the flames" };

const HUMBLE_WAY: Record<Cookware, string> = { pan: "Fried", pot: "Stewed", stick: "Toasted" };

/** A dish's name: its recipe's, or a humble dish's from its way and its main ingredient. */
export function dishName(dish: DishId): string {
  const recipe = recipeOf(dish);
  if (recipe) return recipe.name;
  const humble = humbleOf(dish);
  if (humble === null) throw new Error(`${dish} has no name`);
  return `${HUMBLE_WAY[humble.cookware]} ${FORAGE_NAMES[humble.food].toLowerCase()}`;
}

export const ingredientName = (ingredient: Ingredient) => (isFood(ingredient) ? FORAGE_NAMES[ingredient] : STAPLE_NAMES[ingredient]);
export const treatName = (treat: Treat) => (isDish(treat) ? dishName(treat) : FORAGE_NAMES[treat]);

/** Where a dish's top lies in its picture, for its toppings: an ellipse, or a stretch of stick. */
type Top = { kind: "ellipse"; cx: number; cy: number; rx: number; ry: number } | { kind: "line"; x0: number; y0: number; x1: number; y1: number };

const STICK = { x0: 3, y0: 28, x1: 29, y1: 9 } as const;
const onStick = (f: number) => ({ x: STICK.x0 + (STICK.x1 - STICK.x0) * f, y: STICK.y0 + (STICK.y1 - STICK.y0) * f });

function vessel(look: DishLook): ReactNode {
  switch (look.vessel) {
    case "plate":
      return (
        <>
          <ellipse cx={16} cy={23} rx={14.5} ry={5.2} fill={t("birch")} stroke={RIM} strokeWidth={0.9} />
          <ellipse cx={16} cy={22.4} rx={10} ry={3.2} fill={t("birch")} stroke={RIM} strokeWidth={0.4} opacity={0.6} />
        </>
      );
    case "bowl":
      return <path d="M3 15.5 C3 25 9 29 16 29 C23 29 29 25 29 15.5 Z" fill={t("birch")} stroke={RIM} strokeWidth={0.9} />;
    case "cup":
      return (
        <>
          <path d="M24 15 C28.5 14 30 17.5 27.5 19.5 L24.5 19.5" fill="none" stroke={t("kuksa")} strokeWidth={2.6} strokeLinecap="round" />
          <path d="M6 13 C6 23 9.5 28 15.5 28 C21.5 28 25 23 25 13 Z" fill={t("kuksa")} stroke={RIM} strokeWidth={0.9} />
        </>
      );
    case "board":
      return (
        <>
          <rect x={25} y={20} width={6} height={4} rx={1.5} fill={t("birch")} stroke={RIM} strokeWidth={0.8} />
          <ellipse cx={15} cy={23} rx={13.5} ry={5.5} fill={t("birch")} stroke={RIM} strokeWidth={0.9} />
        </>
      );
    case "stick":
      return <line x1={STICK.x0} y1={STICK.y0} x2={STICK.x1} y2={STICK.y1} stroke={t("stick")} strokeWidth={1.8} strokeLinecap="round" />;
  }
}

function body(look: DishLook, rng: ReturnType<typeof createRng>): { drawing: ReactNode; top: Top } {
  const heap = look.heap;
  switch (heap.form) {
    case "fill": {
      const cup = look.vessel === "cup";
      const e = cup ? { cx: 15.5, cy: 13, rx: 9.5, ry: 2.8 } : { cx: 16, cy: 15.5, rx: 13, ry: 3.8 };
      return { drawing: <ellipse {...e} fill={t(heap.tone)} stroke={RIM} strokeWidth={0.7} />, top: { kind: "ellipse", ...e, rx: e.rx * 0.7, ry: e.ry * 0.55 } };
    }
    case "stack": {
      const cakes = Array.from({ length: heap.layers }, (_, l) => <ellipse key={l} cx={16 + uniform(rng, -0.6, 0.6)} cy={21 - l * 2.3} rx={9.5} ry={3} fill={t(heap.tone)} stroke={RIM} strokeWidth={0.7} />);
      return { drawing: <>{cakes}</>, top: { kind: "ellipse", cx: 16, cy: 21 - (heap.layers - 1) * 2.3, rx: 6, ry: 1.6 } };
    }
    case "pie":
      return {
        drawing: (
          <>
            <path d="M3.5 18.5 L3.5 21 C3.5 24 9 26 15 26 C21 26 26.5 24 26.5 21 L26.5 18.5 Z" fill={t(heap.crust)} stroke={RIM} strokeWidth={0.8} />
            <ellipse cx={15} cy={18.5} rx={11.5} ry={4.4} fill={t(heap.crust)} stroke={RIM} strokeWidth={0.8} />
            <ellipse cx={15} cy={18.5} rx={9.4} ry={3.3} fill={t(heap.top)} />
          </>
        ),
        top: { kind: "ellipse", cx: 15, cy: 18.5, rx: 7.6, ry: 2.4 },
      };
    case "slice":
      return {
        drawing: <path d="M6 20.5 L11 15 L27 16.5 L23 22.5 Z" fill={t(heap.tone)} stroke={RIM} strokeWidth={0.9} strokeLinejoin="round" />,
        top: { kind: "ellipse", cx: 16.5, cy: 18.7, rx: 6, ry: 1.8 },
      };
    case "pile": {
      const lumps = [
        [10.5, 20.5, 4.2],
        [21, 20.5, 4.2],
        [16, 21.5, 4.6],
        [13, 17.5, 4.2],
        [19, 17.5, 4.2],
      ].map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} fill={t(heap.tone)} stroke={RIM} strokeWidth={0.6} />);
      return { drawing: <>{lumps}</>, top: { kind: "ellipse", cx: 16, cy: 18.5, rx: 6, ry: 2.5 } };
    }
    case "dough": {
      const twists = [0.6, 0.68, 0.76, 0.84, 0.92].map((f, i) => {
        const p = onStick(f);
        return <ellipse key={i} cx={p.x} cy={p.y} rx={3.4} ry={2.4} transform={`rotate(-36 ${p.x} ${p.y})`} fill={t(heap.tone)} stroke={RIM} strokeWidth={0.6} />;
      });
      const a = onStick(0.58);
      const b = onStick(0.94);
      return { drawing: <>{twists}</>, top: { kind: "line", x0: a.x, y0: a.y, x1: b.x, y1: b.y } };
    }
    case "skewer": {
      const pieces = heap.tones.map((tone, i) => {
        const p = onStick(0.5 + (i + 0.5) * (0.45 / heap.tones.length));
        return <circle key={i} cx={p.x} cy={p.y} r={2.7} fill={t(tone)} stroke={RIM} strokeWidth={0.6} />;
      });
      const a = onStick(0.5);
      const b = onStick(0.95);
      return { drawing: <>{pieces}</>, top: { kind: "line", x0: a.x, y0: a.y, x1: b.x, y1: b.y } };
    }
  }
}

function at(top: Top, rng: ReturnType<typeof createRng>): { x: number; y: number } {
  if (top.kind === "line") {
    const f = rng.next();
    return { x: top.x0 + (top.x1 - top.x0) * f + uniform(rng, -1, 1), y: top.y0 + (top.y1 - top.y0) * f - uniform(rng, 1.2, 2.6) };
  }
  const angle = rng.next() * Math.PI * 2;
  const r = Math.sqrt(rng.next());
  return { x: top.cx + Math.cos(angle) * r * top.rx, y: top.cy + Math.sin(angle) * r * top.ry };
}

function toppings({ tone, shape, count }: Topping, top: Top, rng: ReturnType<typeof createRng>, key: number): ReactNode {
  return Array.from({ length: count }, (_, i) => {
    const p = shape === "dollop" && i === 0 && top.kind === "ellipse" ? { x: top.cx, y: top.cy - 0.4 } : at(top, rng);
    const k = `${key}-${i}`;
    switch (shape) {
      case "berry":
        return <circle key={k} cx={p.x} cy={p.y} r={1.55} fill={t(tone)} stroke={RIM} strokeWidth={0.4} />;
      case "chunk":
        return <ellipse key={k} cx={p.x} cy={p.y} rx={2} ry={1.3} fill={t(tone)} stroke={RIM} strokeWidth={0.4} />;
      case "dollop":
        return <ellipse key={k} cx={p.x} cy={p.y} rx={2.8} ry={1.7} fill={t(tone)} stroke={RIM} strokeWidth={0.4} />;
      case "sprig":
        return <ellipse key={k} cx={p.x} cy={p.y} rx={1.8} ry={0.7} transform={`rotate(${uniform(rng, -50, 50)} ${p.x} ${p.y})`} fill={t(tone)} />;
      case "crumb":
        return <circle key={k} cx={p.x} cy={p.y} r={0.75} fill={t(tone)} />;
    }
  });
}

/** A dish's picture; `unknown`, a recipe not yet found, is its shape in shadow. */
export function DishIcon({ dish, unknown = false, className = "size-8" }: { dish: DishId; unknown?: boolean; className?: string }) {
  const look = dishLook(dish);
  const rng = createRng(`hearthwood/dish-icon/${dish}`);
  const { drawing, top } = body(look, rng);
  const name = unknown ? "A recipe not yet found" : dishName(dish);
  return (
    <svg viewBox="0 0 32 32" className={className} role="img" aria-label={name}>
      <title>{name}</title>
      <g style={unknown ? { filter: "brightness(0)", opacity: 0.22 } : undefined}>
        {vessel(look)}
        {drawing}
        {look.toppings.map((topping, i) => toppings(topping, top, rng, i))}
      </g>
    </svg>
  );
}

const STAPLE_DRAWINGS: Record<Staple, ReactNode> = {
  oats: (
    <>
      <path d="M5 21 C4 13 7 9 12 8 L12 6 L20 6 L20 8 C25 9 28 13 27 21 C27 26 22 28 16 28 C10 28 5 26 5 21 Z" fill={t("sack")} stroke={RIM} strokeWidth={0.9} />
      <path d="M11 8.5 L21 8.5" stroke={RIM} strokeWidth={1.2} />
      {[[11, 17], [15, 15], [19, 17.5], [13, 21], [18, 21.5], [22, 20]].map(([x, y], i) => (
        <ellipse key={i} cx={x} cy={y} rx={1.6} ry={0.9} transform={`rotate(${i * 40} ${x} ${y})`} fill={t("oats")} stroke={RIM} strokeWidth={0.3} />
      ))}
    </>
  ),
  flour: (
    <>
      <path d="M5 21 C4 13 7 9 12 8 L12 6 L20 6 L20 8 C25 9 28 13 27 21 C27 26 22 28 16 28 C10 28 5 26 5 21 Z" fill={t("flour")} stroke={RIM} strokeWidth={0.9} />
      <path d="M11 8.5 L21 8.5" stroke={RIM} strokeWidth={1.2} />
      <path d="M12 19 L16 14 L20 19 M16 14 L16 24" stroke={t("sack")} strokeWidth={1.4} fill="none" strokeLinecap="round" />
    </>
  ),
  butter: (
    <>
      <path d="M5 17 L12 13 L27 15 L27 21 L20 26 L5 23 Z" fill={t("butter")} stroke={RIM} strokeWidth={0.9} strokeLinejoin="round" />
      <path d="M5 17 L20 19.5 L27 15 M20 19.5 L20 26" fill="none" stroke={RIM} strokeWidth={0.6} />
    </>
  ),
  honey: (
    <>
      <path d="M9 11 L23 11 L24 15 C26 18 26 24 23 27 L9 27 C6 24 6 18 8 15 Z" fill={t("jar")} stroke={RIM} strokeWidth={0.9} />
      <path d="M8 17 C8 22 8.5 25 10 26.5 L22 26.5 C23.5 25 24 22 24 17 Z" fill={t("honey")} />
      <rect x={8} y={6.5} width={16} height={5} rx={1.5} fill={t("grip")} stroke={RIM} strokeWidth={0.8} />
    </>
  ),
  cream: (
    <>
      <path d="M22 12 C27 12 28 19 22.5 21" fill="none" stroke={t("jug")} strokeWidth={2.4} />
      <path d="M8 7 L22 7 L22 9 C24 13 24 22 22 27 L9 27 C7 22 7 13 9 10 L6 8.5 Z" fill={t("jug")} stroke={RIM} strokeWidth={0.9} strokeLinejoin="round" />
      <ellipse cx={15} cy={8} rx={6.5} ry={1.5} fill={t("cream")} />
    </>
  ),
  eggs: (
    <>
      <ellipse cx={11.5} cy={19} rx={6} ry={7.5} fill={t("egg")} stroke={RIM} strokeWidth={0.9} />
      <ellipse cx={21} cy={20.5} rx={5.5} ry={7} fill={t("egg")} stroke={RIM} strokeWidth={0.9} />
      <ellipse cx={9.5} cy={15.5} rx={1.5} ry={2.2} fill="var(--color-hearthwood-valley-ui-ink)" opacity={0.5} />
    </>
  ),
};

export function StapleIcon({ staple, className = "size-8" }: { staple: Staple; className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} role="img" aria-label={STAPLE_NAMES[staple]}>
      <title>{STAPLE_NAMES[staple]}</title>
      {STAPLE_DRAWINGS[staple]}
    </svg>
  );
}

export function IngredientIcon({ ingredient, className = "size-8" }: { ingredient: Ingredient; className?: string }) {
  return isFood(ingredient) ? <ForageIcon kind={ingredient} className={className} /> : <StapleIcon staple={ingredient} className={className} />;
}

const COOKWARE_DRAWINGS: Record<Cookware, ReactNode> = {
  pan: (
    <>
      <path d="M19 17 L30 13" stroke={t("iron")} strokeWidth={2.4} strokeLinecap="round" />
      <path d="M26 14.4 L30 13" stroke={t("grip")} strokeWidth={3.4} strokeLinecap="round" />
      <path d="M2 16 C2 23 6 25 11 25 C16 25 20 23 20 16 Z" fill={t("iron")} stroke={RIM} strokeWidth={0.8} />
      <ellipse cx={11} cy={16} rx={9} ry={2.6} fill={t("iron")} stroke="var(--color-hearthwood-valley-ui-ink)" strokeWidth={0.6} opacity={0.95} />
    </>
  ),
  pot: (
    <>
      <path d="M16 2 L16 8 M9 9 Q16 3 23 9" stroke={t("iron")} strokeWidth={1.4} fill="none" />
      <path d="M5 12 C5 24 9 28 16 28 C23 28 27 24 27 12 Z" fill={t("iron")} stroke={RIM} strokeWidth={0.8} />
      <ellipse cx={16} cy={12} rx={11} ry={2.8} fill={t("iron")} stroke="var(--color-hearthwood-valley-ui-ink)" strokeWidth={0.6} />
      <path d="M12 6 C11 4 13 3 12 1 M20 6 C19 4 21 3 20 1" stroke={t("steam")} strokeWidth={1.1} fill="none" strokeLinecap="round" opacity={0.85} />
    </>
  ),
  stick: (
    <>
      <path d="M3 29 L27 7" stroke={t("stick")} strokeWidth={2} strokeLinecap="round" />
      <circle cx={22.5} cy={11.5} r={3.2} fill={t("dough")} stroke={RIM} strokeWidth={0.6} />
      <circle cx={18.5} cy={15} r={3} fill={t("toast")} stroke={RIM} strokeWidth={0.6} />
      <path d="M9 30 C8 26 11 25 10.5 21 C13 23 14 26 12.5 30 Z" fill="var(--color-hearthwood-valley-fire-flame)" />
    </>
  ),
};

export function CookwareIcon({ cookware, className = "size-8" }: { cookware: Cookware; className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} role="img" aria-label={COOKWARE_NAMES[cookware]}>
      <title>{COOKWARE_NAMES[cookware]}</title>
      {COOKWARE_DRAWINGS[cookware]}
    </svg>
  );
}

/** A treat held out: a dish's picture, or the forage's. */
export function TreatIcon({ treat, className = "size-8" }: { treat: Treat; className?: string }) {
  return isDish(treat) ? <DishIcon dish={treat} className={className} /> : <ForageIcon kind={treat} className={className} />;
}
