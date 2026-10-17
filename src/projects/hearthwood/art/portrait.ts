import type { Cat } from "../cats/cat";
import type { Dog, EarType } from "../dogs/dog";
import type { Fox } from "../foxes/fox";
import type { Hedgehog } from "../hedgehogs/hedgehog";

/*
 * A companion's portrait, as plain data for a small drawn head: the colour
 * tokens of its coat where a glance reads them (the coat, a second colour in
 * patches, stripes, the darker cap and ears of a sable, the points of a
 * colourpoint, the white of a blaze and muzzle) and its eyes, from the same
 * genetics the coat shader draws, so the face in the corner is the animal's.
 */

export interface Portrait {
  species: "cat" | "dog" | "fox" | "hedgehog";
  /** The coat over the head. */
  coat: string;
  /** A second colour in patches (a tortoiseshell's, a merle's), or null. */
  patch: string | null;
  /** Stripes over the brow (a tabby's), or null. */
  stripes: string | null;
  /** The ears and the top of the head when darker than the rest (a sable, a wolf grey, a colourpoint's points), or null. */
  cap: string | null;
  /** The muzzle and cheeks when another colour (a black and tan's tan, a colourpoint's mask), or null. */
  muzzle: string | null;
  /** White on the face: 0 none, 1 a broad blaze and a white muzzle. */
  white: number;
  eye: string;
  nose: string;
  ears: EarType | "cat" | "wild";
}

const CAT = (name: string) => `--color-hearthwood-cat-${name}`;
const DOG = (name: string) => `--color-hearthwood-dog-${name}`;

export function catPortrait(cat: Cat): Portrait {
  const { coat } = cat;
  const orange = coat.orange === "all";
  const base = orange ? coat.phaeomelanin : coat.eumelanin;
  const tabby = orange || coat.agouti;
  return {
    species: "cat",
    coat: coat.pointed ? CAT("point-body") : tabby ? CAT(`${base}-ground`) : CAT(base),
    patch: coat.orange === "patches" ? CAT(coat.phaeomelanin) : null,
    stripes: tabby && !coat.pointed ? CAT(base) : null,
    cap: coat.pointed ? CAT(coat.eumelanin) : null,
    muzzle: coat.pointed ? CAT(coat.eumelanin) : null,
    white: Math.min(1, coat.white * 1.6),
    eye: CAT(`eye-${coat.eyes[0]}`),
    nose: CAT(`nose-${coat.nose}`),
    ears: "cat",
  };
}

export function dogPortrait(dog: Dog): Portrait {
  const { coat } = dog;
  const eu = DOG(coat.eumelanin);
  const phaeo = DOG(coat.phaeomelanin);
  const looks: Record<typeof coat.pattern, Pick<Portrait, "coat" | "cap" | "muzzle">> = {
    solid: { coat: eu, cap: null, muzzle: null },
    clear: { coat: phaeo, cap: null, muzzle: coat.mask ? eu : null },
    sable: { coat: phaeo, cap: coat.shading > 0.35 ? eu : null, muzzle: coat.mask ? eu : null },
    agouti: { coat: DOG(`${coat.eumelanin}-merle`), cap: eu, muzzle: null },
    tan: { coat: eu, cap: null, muzzle: phaeo },
    saddle: { coat: phaeo, cap: null, muzzle: coat.mask ? eu : null },
  };
  const look = looks[coat.pattern];
  // Merle thins the eumelanin to its pale ground, leaving torn patches of the full colour.
  const merled = coat.merle && look.coat === eu;
  return {
    species: "dog",
    ...look,
    coat: merled ? DOG(`${coat.eumelanin}-merle`) : look.coat,
    patch: merled || coat.brindle ? eu : null,
    stripes: null,
    white: Math.min(1, coat.white * 2.2),
    eye: DOG(`eye-${coat.eyes[0]}`),
    nose: DOG(`nose-${coat.nose}`),
    ears: dog.ears,
  };
}

const FOX = (name: string) => `--color-hearthwood-fox-${name}`;
const HEDGEHOG = (name: string) => `--color-hearthwood-hedgehog-${name}`;

/** A fox's face: its red (or a silver fox's black), the white of its cheeks, and the dark backs of its ears. */
export function foxPortrait(fox: Fox): Portrait {
  const silver = fox.coat.phase === "silver";
  return {
    species: "fox",
    coat: silver ? FOX("silver") : FOX("red"),
    patch: null,
    stripes: null,
    cap: FOX(silver ? "silver" : "dark"),
    muzzle: silver ? FOX("frost") : FOX("white"),
    white: silver ? 0 : 1,
    eye: FOX("eye"),
    nose: FOX("nose"),
    ears: "wild",
  };
}

/** A hedgehog's face: the pale fur of its face under the dark cap of its spines. */
export function hedgehogPortrait(hedgehog: Hedgehog): Portrait {
  return {
    species: "hedgehog",
    coat: hedgehog.coat.face > 0.5 ? HEDGEHOG("fur-pale") : HEDGEHOG("fur"),
    patch: null,
    stripes: HEDGEHOG("tip"),
    cap: HEDGEHOG("band"),
    muzzle: HEDGEHOG("mask"),
    white: 0,
    eye: HEDGEHOG("eye"),
    nose: HEDGEHOG("nose"),
    ears: "wild",
  };
}
