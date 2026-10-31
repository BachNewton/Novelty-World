import { seeded } from "../roadside/mesh";
import { CLOTHS, HAIRS, SHOES, SKINS, type Cloth, type Hair, type Shoe, type Skin } from "./parts";

/*
 * Who a person is: numbers and choices from a seed, with no geometry in it. The
 * same seed is the same person. Nothing here says how they stand.
 */

export type Age = "adult" | "older" | "child";
export type HairStyle = "short" | "receding" | "bob" | "long" | "ponytail" | "bun";
export type Hat = "none" | "cap" | "sun-hat" | "helmet";
/** What they wear, which sets the shape of their clothes: colours are `Colours`. */
export type Outfit = "tee-shorts" | "shirt-trousers" | "jacket-trousers" | "summer-dress" | "blouse-skirt" | "sailing-jacket" | "overalls" | "cyclist";

export interface Colours {
  top: Cloth;
  /** A sailing jacket's yoke, a cyclist's band, an overall's shirt. */
  accent: Cloth;
  bottom: Cloth;
  shoes: Shoe;
  hat: Cloth;
}

export interface FigureSpec {
  age: Age;
  heightM: number;
  /** 0 slim, 1 heavy. */
  build: number;
  /** 0 a typically male frame, 1 a typically female one, with everything between. */
  frame: number;
  skin: Skin;
  hairColour: Hair;
  hair: HairStyle;
  outfit: Outfit;
  hat: Hat;
  colours: Colours;
  /** Left for right, so one pose has two versions. */
  mirrored: boolean;
}

const pick = <T>(random: () => number, from: readonly T[]): T => from[Math.floor(random() * from.length)];

const LIGHT: readonly Cloth[] = ["cloth-white", "cloth-linen", "cloth-sky", "cloth-sand", "cloth-rose"];
const STRONG: readonly Cloth[] = ["cloth-navy", "cloth-sea", "cloth-forest", "cloth-red", "cloth-coral", "cloth-mustard", "cloth-lilac", "cloth-denim"];
const TROUSERS: readonly Cloth[] = ["cloth-denim", "cloth-navy", "cloth-sand", "cloth-khaki", "cloth-charcoal", "cloth-grey"];
const SHORTS: readonly Cloth[] = ["cloth-navy", "cloth-sand", "cloth-khaki", "cloth-denim", "cloth-white"];
const SAILING: readonly [Cloth, Cloth][] = [["cloth-red", "cloth-charcoal"], ["cloth-navy", "cloth-signal"], ["cloth-mustard", "cloth-navy"], ["cloth-white", "cloth-navy"]];
const CYCLING: readonly [Cloth, Cloth][] = [["cloth-signal", "cloth-charcoal"], ["cloth-sky", "cloth-white"], ["cloth-mustard", "cloth-charcoal"], ["cloth-sea", "cloth-white"]];

const MALE_HEIGHTS = [1.7, 1.92] as const;
const FEMALE_HEIGHTS = [1.56, 1.76] as const;
const OUTFITS: readonly Outfit[] = ["tee-shorts", "tee-shorts", "shirt-trousers", "shirt-trousers", "jacket-trousers"];
const DRESSED: readonly Outfit[] = ["summer-dress", "summer-dress", "blouse-skirt"];
const CHILD_OUTFITS: readonly Outfit[] = ["tee-shorts", "tee-shorts", "summer-dress"];

/** Who a seed is. Anything in `fixed` overrides what's rolled: a cast member, or a fisher's jacket. */
export function rollFigure(seed: number, fixed: Partial<FigureSpec> = {}): FigureSpec {
  // The generator's first steps follow a small seed closely, so the seed is spread out first.
  const random = seeded((Math.imul(seed + 1, 2654435761) ^ 0x5bd1e995) >>> 0);
  for (let burn = 0; burn < 3; burn++) random();

  const age: Age = fixed.age ?? (random() < 0.26 ? "older" : "adult");
  const feminine = random() < 0.5;
  const frame = Math.min(1, Math.max(0, (feminine ? 0.8 : 0.16) + (random() - 0.5) * 0.36));
  const [short, tall] = feminine ? FEMALE_HEIGHTS : MALE_HEIGHTS;
  const stature = (random() + random()) / 2;
  const heightM = age === "child" ? 1.05 + random() * 0.32 : (short + (tall - short) * stature) * (age === "older" ? 0.975 : 1);
  const build = age === "child" ? 0.3 : Math.min(1, random() ** 1.4 + (age === "older" ? 0.14 : 0));

  const skin = random() < 0.72 ? pick(random, SKINS.slice(0, 3)) : pick(random, SKINS);
  const hairColour: Hair = age === "older" ? pick(random, ["hair-grey", "hair-white", "hair-grey", "hair-ash"] as const) : pick(random, skin === "skin-5" || skin === "skin-6" ? (["hair-black", "hair-brown"] as const) : HAIRS.slice(0, 6));
  const hair: HairStyle = age === "older" && !feminine && random() < 0.5 ? "receding" : feminine ? pick(random, ["bob", "long", "ponytail", "bun", "short"] as const) : pick(random, ["short", "short", "short", "ponytail"] as const);

  const roll = random();
  const outfit: Outfit = age === "child" ? pick(random, CHILD_OUTFITS) : feminine && roll < 0.42 ? pick(random, DRESSED) : pick(random, OUTFITS);
  const top = random() < 0.6 ? pick(random, LIGHT) : pick(random, STRONG);
  const legs = outfit === "tee-shorts" ? SHORTS : TROUSERS;
  const hat: Hat = random() < 0.2 ? "cap" : feminine && random() < 0.16 ? "sun-hat" : "none";
  const colours: Colours = {
    top,
    accent: pick(random, CLOTHS.slice(4)),
    bottom: outfit === "blouse-skirt" ? pick(random, STRONG) : pick(random, legs),
    shoes: pick(random, SHOES),
    hat: pick(random, ["cloth-navy", "cloth-white", "cloth-sea", "cloth-red"] as const),
  };
  const mirrored = random() < 0.5;
  return { age, heightM, build, frame, skin, hairColour, hair, outfit, hat, colours, mirrored, ...fixed };
}

/** A sailor: a jacket with a high collar and a contrasting yoke. */
export function sailor(seed: number): Partial<FigureSpec> {
  const [top, accent] = SAILING[seed % SAILING.length];
  return { outfit: "sailing-jacket", colours: { ...rollFigure(seed).colours, top, accent, bottom: "cloth-navy", shoes: "shoe-white" } };
}

/** A cyclist: a jersey with a band, dark shorts, a helmet. */
export function cyclist(seed: number): Partial<FigureSpec> {
  const [top, accent] = CYCLING[seed % CYCLING.length];
  return { outfit: "cyclist", hat: "helmet", colours: { ...rollFigure(seed).colours, top, accent, bottom: "cloth-charcoal", shoes: "shoe-white", hat: "cloth-white" } };
}

/** Someone at work: blue overalls over a pale shirt, sturdy boots. */
export function worker(seed: number): Partial<FigureSpec> {
  return { outfit: "overalls", colours: { ...rollFigure(seed).colours, top: "cloth-work", bottom: "cloth-work", accent: LIGHT[seed % LIGHT.length], shoes: "shoe-brown" } };
}
