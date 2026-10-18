import { charmStrength } from "../../gameplay/brewing";
import { BREW_FORMS, CHARMS, isBrew, isBrewStaple, isCharm, isForageKind, type BrewForm, type Charm } from "../../gameplay/brews";
import { brew, brewedNow, brewMore, chooseBrewForm, chooseBrewIngredient, forgetBrewing, holdCooking, setBookOpen, setCraft, stockBrew, workCharmFrom, type Craft, type Hearth } from "./hearth";

/*
 * Brewing's part of the world's probe (`window.__hearthwoodWorld.brewing`),
 * for screenshots and tests, beside cooking's: turning the card to cooking
 * or brewing, choosing, brewing held part-brewed, the brew made, the brew
 * book, the satchel, a brew put in the basket or a charm set to work, how
 * strongly each charm works now, and whether a full moon is up.
 */

export interface BrewingProbe {
  craft: () => Craft;
  setCraft: (craft: Craft) => void;
  /** Chooses these things (and a way, if given) afresh, putting back what was chosen. */
  choose: (ingredients: string[], form?: string) => void;
  brew: () => void;
  state: () => { phase: string; chosen: string[]; form: BrewForm; brew: string | null; discovered: boolean; moonlit: boolean; brewed: number } | null;
  /** Holds a brew at a point (0 to 1), or lets it brew on with null. */
  hold: (at: number | null) => void;
  again: () => void;
  setBookOpen: (open: boolean) => void;
  satchel: () => { brews: Record<string, number>; known: string[]; moonlit: string[]; charms: Record<string, { from: number; until: number; moonlit: boolean }> };
  stock: (brew: string, count?: number, moonlit?: boolean) => void;
  /** Sets a charm to work from `days` (the calendar's game days), or from now. */
  work: (charm: string, days?: number, moonlit?: boolean) => void;
  /** How strongly each charm works now, 0 to 1. */
  strengths: () => Record<Charm, number>;
  fullMoon: () => boolean;
  forget: () => void;
}

export function brewingProbe(hearth: Hearth): BrewingProbe {
  return {
    craft: () => hearth.shown.craft,
    setCraft: (craft) => {
      setCraft(hearth, craft);
    },
    choose: (ingredients, form) => {
      const session = hearth.shown.brewing;
      if (session?.phase !== "choosing") throw new Error("Not choosing at the cauldron");
      for (const i of session.chosen) chooseBrewIngredient(hearth, i);
      if (form !== undefined) {
        if (!(BREW_FORMS as readonly string[]).includes(form)) throw new Error(`${form} is no way to brew`);
        chooseBrewForm(hearth, form as BrewForm);
      }
      for (const i of ingredients) {
        if (!isForageKind(i) && !isBrewStaple(i)) throw new Error(`${i} is never brewed`);
        chooseBrewIngredient(hearth, i);
      }
    },
    brew: () => {
      brew(hearth);
    },
    state: () => {
      const s = hearth.shown.brewing;
      return s && { phase: s.phase, chosen: [...s.chosen], form: s.form, brew: s.phase === "choosing" ? null : s.brew, discovered: s.phase !== "choosing" && s.discovered, moonlit: s.phase !== "choosing" && s.moonlit, brewed: brewedNow(hearth) };
    },
    hold: (at) => {
      holdCooking(hearth, at);
    },
    again: () => {
      brewMore(hearth);
    },
    setBookOpen: (open) => {
      setBookOpen(hearth, open);
    },
    satchel: () => {
      const { brews, known, moonlit, charms } = hearth.shown.satchel;
      return { brews: { ...brews } as Record<string, number>, known: [...known], moonlit: [...moonlit], charms: { ...charms } as Record<string, { from: number; until: number; moonlit: boolean }> };
    },
    stock: (brewId, count = 1, moonlit = false) => {
      if (!isBrew(brewId)) throw new Error(`${brewId} is no brew`);
      stockBrew(hearth, brewId, count, moonlit);
    },
    work: (charm, days, moonlit = false) => {
      if (!isCharm(charm)) throw new Error(`${charm} is no charm`);
      workCharmFrom(hearth, charm, days ?? hearth.days, moonlit);
    },
    strengths: () => Object.fromEntries(CHARMS.map((c) => [c, charmStrength(hearth.shown.satchel, c, hearth.days)])) as Record<Charm, number>,
    fullMoon: () => hearth.shown.fullMoon,
    forget: () => {
      forgetBrewing(hearth);
    },
  };
}
