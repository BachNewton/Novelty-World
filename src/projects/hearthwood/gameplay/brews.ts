import { FORAGE_KINDS, type ForageKind } from "../engine/regions";

/*
 * What can be brewed at the fire, as rules: the witch's own craft beside
 * cooking, in the iron cauldron. A brew is a few things from the basket
 * (the herbs, the fly agaric, anything the forest gave) with a staple or
 * two the witch carries (honey, beeswax, salt), made one of three ways: a
 * tea, steeped and bottled; a salve, melted into beeswax in a little tin;
 * or a charm, dried and tied up in a linen pouch with red thread.
 *
 * The brews are real-ish folk preparations, written warmly: yarrow tea for
 * a chill, meadowsweet for aches, an old fly agaric rub for sore joints
 * (on the skin only: the fly agaric is never drunk, so it never goes into a
 * tea). A charm does something gentle the world shows: flowers round camp,
 * fireflies tonight, a hush that lets shy animals warm sooner, the mist
 * parting round Elliott. Brewing never fails: a mix no brew has makes a
 * humble one of its own, named for its first thing from the forest and its
 * way (a simple bilberry tea, a little chanterelle charm), which does no
 * more than be made.
 */

/** What Elliott carries for brewing: always to hand, never used up. Honey is cooking's too. */
export const BREW_STAPLES = ["honey", "beeswax", "salt"] as const;
export type BrewStaple = (typeof BREW_STAPLES)[number];

export type BrewIngredient = ForageKind | BrewStaple;

export const BREW_FORMS = ["tea", "salve", "charm"] as const;
export type BrewForm = (typeof BREW_FORMS)[number];

/** How many things go into one brew, at most. */
export const MOST_IN_A_BREW = 3;

/** What a charm brings about, each something the world can show. */
export const CHARMS = ["bloom", "fireflies", "hush", "clearing"] as const;
export type Charm = (typeof CHARMS)[number];

export interface Brew {
  id: string;
  name: string;
  /** What it is for, in a line: shown as its tooltip in the book. */
  lore: string;
  ingredients: readonly BrewIngredient[];
  form: BrewForm;
  /** What a charm brings about. */
  charm?: Charm;
}

export const BREWS = [
  { id: "yarrow-tea", name: "Yarrow tea", lore: "For a chill: sipped hot under a blanket, it sends the cold out with a good sweat.", ingredients: ["yarrow", "honey"], form: "tea" },
  { id: "meadowsweet-tea", name: "Meadowsweet tea", lore: "Sweet as almonds, for aching bones and an unsettled tummy.", ingredients: ["meadowsweet", "honey"], form: "tea" },
  { id: "winter-tea", name: "Juniper winter tea", lore: "Juniper and lingonberry: a warming cup for the long dark.", ingredients: ["juniper", "lingonberry", "honey"], form: "tea" },
  { id: "yarrow-salve", name: "Yarrow salve", lore: "Woundwort, the old name says: for scrapes, nettle stings and sore paws.", ingredients: ["yarrow", "beeswax"], form: "salve" },
  { id: "fly-agaric-rub", name: "Fly agaric rub", lore: "An old northern rub for stiff joints. For the skin only, never the mouth.", ingredients: ["fly-agaric", "beeswax"], form: "salve" },
  { id: "garland-charm", name: "Garland charm", lore: "Midsummer's own: tied up, it sets flowers blooming all round camp for a few days.", ingredients: ["meadowsweet", "yarrow"], form: "charm", charm: "bloom" },
  { id: "lantern-charm", name: "Lantern charm", lore: "Red cap and amber berry: the fireflies come to camp tonight.", ingredients: ["fly-agaric", "cloudberry"], form: "charm", charm: "fireflies" },
  { id: "hush-charm", name: "Hush charm", lore: "A pinch of salt and sweet meadowsweet, for a quiet heart: shy animals warm to Elliott sooner for a day.", ingredients: ["meadowsweet", "salt"], form: "charm", charm: "hush" },
  { id: "mist-charm", name: "Mist-parting charm", lore: "Juniper smoke and salt, as the saunas are cleared: the mist thins round Elliott for a while.", ingredients: ["juniper", "salt"], form: "charm", charm: "clearing" },
] as const satisfies readonly Brew[];

export type RecipeBrewId = (typeof BREWS)[number]["id"];
export const BREW_IDS: readonly RecipeBrewId[] = BREWS.map((b) => b.id);

/** A brew no recipe has: the way it was made and its first thing from the forest. */
export type HumbleBrewId = `humble-${BrewForm}-${ForageKind}`;
export type BrewId = RecipeBrewId | HumbleBrewId;

export const humbleBrewId = (form: BrewForm, main: ForageKind): HumbleBrewId => `humble-${form}-${main}`;

/** Whether a thing may go into a brew made this way: the fly agaric is never drunk. */
export const fitsForm = (ingredient: BrewIngredient, form: BrewForm) => !(form === "tea" && ingredient === "fly-agaric");

/** Every brew there is, in the order the book and the basket show them: the recipes, then the humble ones by way and ingredient. */
export const ALL_BREWS: readonly BrewId[] = [...BREW_IDS, ...BREW_FORMS.flatMap((form) => FORAGE_KINDS.filter((k) => fitsForm(k, form)).map((k) => humbleBrewId(form, k)))];

const BREW_SET: ReadonlySet<string> = new Set(ALL_BREWS);
export const isBrew = (thing: string): thing is BrewId => BREW_SET.has(thing);
export const isForageKind = (thing: string): thing is ForageKind => (FORAGE_KINDS as readonly string[]).includes(thing);
export const isBrewStaple = (thing: string): thing is BrewStaple => (BREW_STAPLES as readonly string[]).includes(thing);
export const isCharm = (thing: string): thing is Charm => (CHARMS as readonly string[]).includes(thing);

export function brewRecipeOf(brew: BrewId): (typeof BREWS)[number] | null {
  return BREWS.find((b) => b.id === brew) ?? null;
}

/** A humble brew's way and main ingredient, or null for a recipe's brew. */
export function humbleBrewOf(brew: BrewId): { form: BrewForm; main: ForageKind } | null {
  if (brewRecipeOf(brew) !== null) return null;
  const [, form, ...main] = brew.split("-");
  return { form: form as BrewForm, main: main.join("-") as ForageKind };
}

/** The way a brew is made. */
export function formOf(brew: BrewId): BrewForm {
  const recipe = brewRecipeOf(brew);
  if (recipe) return recipe.form;
  const humble = humbleBrewOf(brew);
  if (humble === null) throw new Error(`${brew} is no brew`);
  return humble.form;
}

/** What a brew's charm brings about, or null for a tea, a salve or a humble charm. */
export function charmOf(brew: BrewId): Charm | null {
  const recipe = brewRecipeOf(brew);
  return recipe && "charm" in recipe ? recipe.charm : null;
}

/** The brew whose charm brings this about. */
export function brewOfCharm(charm: Charm): RecipeBrewId {
  const brew = BREWS.find((b) => "charm" in b && b.charm === charm);
  if (!brew) throw new Error(`No brew works the ${charm} charm`);
  return brew.id;
}

/** Throws on a choice that can't go into the cauldron: none, too many, the same thing twice, nothing from the forest, or the fly agaric in a tea. */
export function checkBrewChoice(ingredients: readonly string[], form: BrewForm): asserts ingredients is readonly BrewIngredient[] {
  if (ingredients.length === 0 || ingredients.length > MOST_IN_A_BREW) throw new Error(`A brew takes 1 to ${MOST_IN_A_BREW} things, not ${ingredients.length}`);
  if (new Set(ingredients).size !== ingredients.length) throw new Error(`Something is chosen twice: ${ingredients.join(", ")}`);
  for (const i of ingredients) {
    if (!isForageKind(i) && !isBrewStaple(i)) throw new Error(`${i} is never brewed`);
    if (!fitsForm(i, form)) throw new Error(`${i} never goes into a ${form}`);
  }
  if (!ingredients.some(isForageKind)) throw new Error(`A brew needs something from the forest: ${ingredients.join(", ")}`);
}

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x));

/** What some things brewed one way make: the brew they are, or else the humble brew of the first thing from the forest chosen. */
export function brewOf(ingredients: readonly BrewIngredient[], form: BrewForm): BrewId {
  checkBrewChoice(ingredients, form);
  const recipe = BREWS.find((b) => b.form === form && sameSet(b.ingredients, ingredients));
  if (recipe) return recipe.id;
  const main = ingredients.find(isForageKind);
  if (main === undefined) throw new Error("A brew needs something from the forest");
  return humbleBrewId(form, main);
}
