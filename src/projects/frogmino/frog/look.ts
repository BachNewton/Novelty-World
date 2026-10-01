// How each frog looks: the player's frog in solo, the pair of partners in
// co-op, and a sleepy unclaimed frog. The two players are a
// matched pair of real frogs, not one frog recoloured: a leaf-green tree frog
// with orange feet, round spots and round pupils, and an azure dart frog
// with pink feet, freckles and bar pupils. Their skins differ in hue and in
// lightness, and their markings in shape, so they tell apart at a glance even
// for a colour-blind player.

export const FROG_VARIANTS = ["p1", "p2", "unclaimed"] as const;
export type FrogVariant = (typeof FROG_VARIANTS)[number];

// What a part of the frog is painted as.
export const FROG_ROLES = ["skin", "mark", "belly", "foot", "eye", "pupil"] as const;
export type FrogRole = (typeof FROG_ROLES)[number];

// The same marks on every cell, so the cells count: one big round spot, or
// two small freckles on a diagonal.
export type Markings = "spots" | "freckles";
export type Pupil = "round" | "bar";

export interface FrogLook {
  name: string;
  markings: Markings;
  pupil: Pupil;
  // Eyes shut and breathing slow: a frog waiting to be taken.
  sleepy: boolean;
  // The design token each role is painted from.
  tokens: Record<FrogRole, string>;
}

const token = (name: string): string => `--color-frogmino-frog-${name}`;

function tokensFor(variant: FrogVariant): Record<FrogRole, string> {
  return {
    skin: token(`${variant}-skin`),
    mark: token(`${variant}-mark`),
    belly: token(`${variant}-belly`),
    foot: token(`${variant}-foot`),
    eye: token("eye"),
    pupil: token("pupil"),
  };
}

export const FROG_LOOKS: Record<FrogVariant, FrogLook> = {
  p1: { name: "Sprout", markings: "spots", pupil: "round", sleepy: false, tokens: tokensFor("p1") },
  p2: { name: "Splash", markings: "freckles", pupil: "bar", sleepy: false, tokens: tokensFor("p2") },
  unclaimed: { name: "Snooze", markings: "spots", pupil: "round", sleepy: true, tokens: tokensFor("unclaimed") },
};
