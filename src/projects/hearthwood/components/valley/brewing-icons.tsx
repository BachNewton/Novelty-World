import type { ReactNode } from "react";
import { createRng, uniform } from "@/shared/lib/seeded-random";
import type { ForageKind } from "../../engine/regions";
import { brewRecipeOf, humbleBrewOf, isForageKind, type BrewForm, type BrewId, type BrewIngredient, type BrewStaple, type Charm } from "../../gameplay/brews";
import { brewLook, brewToneVar, CHARM_GLOW, VESSEL_OF, type BrewLook, type BrewTone, type BrewVessel } from "../../art/brew-looks";
import { StapleIcon } from "./cooking-icons";
import { FORAGE_NAMES, ForageIcon } from "./forage-icons";

/*
 * Little pictures for brewing, drawn in the brewing's, the cooking's and
 * the forage's tokens so a picture and the thing at the fire are the same
 * colours: each brew from the very look its model is made from, the
 * cauldron, the three ways of brewing, the staples, what each charm brings
 * about, and the full moon. Names are for tooltips and for whoever can't
 * see the picture.
 */

const RIM = "var(--color-hearthwood-valley-ui-shade)";
const t = (tone: BrewTone) => brewToneVar(tone);

export const BREW_STAPLE_NAMES: Record<BrewStaple, string> = { honey: "Honey", beeswax: "Beeswax", salt: "Salt" };
export const BREW_FORM_NAMES: Record<BrewForm, string> = { tea: "A tea, steeped and bottled", salve: "A salve, set in its tin", charm: "A charm, tied up in linen" };
export const CHARM_NAMES: Record<Charm, string> = {
  bloom: "Flowers bloom round camp",
  fireflies: "Fireflies gather at camp tonight",
  hush: "Shy animals warm to Elliott sooner",
  clearing: "The mist thins round Elliott",
};

/** Each thing from the forest as one of it is named in a brew's name. */
const ONE_OF: Record<ForageKind, string> = {
  bilberry: "bilberry",
  lingonberry: "lingonberry",
  "wild-strawberry": "wild strawberry",
  raspberry: "raspberry",
  cloudberry: "cloudberry",
  chanterelle: "chanterelle",
  porcini: "porcini",
  "funnel-chanterelle": "funnel chanterelle",
  "fly-agaric": "fly agaric",
  yarrow: "yarrow",
  meadowsweet: "meadowsweet",
  juniper: "juniper",
};
const HUMBLE_FORM: Record<BrewForm, (main: string) => string> = { tea: (m) => `Simple ${m} tea`, salve: (m) => `Simple ${m} salve`, charm: (m) => `Little ${m} charm` };

/** A brew's name: its recipe's, or a humble one's from its way and its first thing from the forest. */
export function brewName(brew: BrewId): string {
  const recipe = brewRecipeOf(brew);
  if (recipe) return recipe.name;
  const humble = humbleBrewOf(brew);
  if (humble === null) throw new Error(`${brew} has no name`);
  return HUMBLE_FORM[humble.form](ONE_OF[humble.main]);
}

/** What a brew is for, in a line, or what a humble one is. */
export function brewLore(brew: BrewId): string {
  return brewRecipeOf(brew)?.lore ?? "A humble brew of its own: it does no more than smell lovely.";
}

/** The sprig of what went in: a few small round heads and a leaf. */
function sprig(tone: BrewTone, x: number, y: number, rng: ReturnType<typeof createRng>): ReactNode {
  return (
    <g>
      <ellipse cx={x + 1.8} cy={y + 1.2} rx={2.4} ry={0.9} transform={`rotate(-30 ${x + 1.8} ${y + 1.2})`} fill={t("bloom-leaf")} />
      {Array.from({ length: 4 }, (_, i) => (
        <circle key={i} cx={x + uniform(rng, -1.6, 1.6)} cy={y + uniform(rng, -1.4, 0.6)} r={1.15} fill={t(tone)} stroke={RIM} strokeWidth={0.35} />
      ))}
    </g>
  );
}

function vessel(look: Pick<BrewLook, "vessel" | "tone">): ReactNode {
  switch (look.vessel) {
    case "bottle":
      return (
        <>
          <path d="M13 6 L19 6 L19 11 C24 12.5 25 15.5 25 19 L25 26 C25 28 23.5 29 21.5 29 L10.5 29 C8.5 29 7 28 7 26 L7 19 C7 15.5 8 12.5 13 11 Z" fill={t("glass")} stroke={RIM} strokeWidth={0.9} strokeLinejoin="round" />
          <path d="M8.2 18 C8.5 16 10 14.5 12 14 L20 14 C22 14.5 23.5 16 23.8 18 L23.8 26 C23.8 27.2 23 27.8 21.5 27.8 L10.5 27.8 C9 27.8 8.2 27.2 8.2 26 Z" fill={t(look.tone)} />
          <rect x={12.5} y={2.5} width={7} height={4.5} rx={1.2} fill={t("cork")} stroke={RIM} strokeWidth={0.8} />
          <path d="M12.6 9.5 L19.4 9.5" stroke={t("thread")} strokeWidth={1.3} strokeLinecap="round" />
          <ellipse cx={11} cy={19} rx={1.2} ry={3} fill="var(--color-hearthwood-valley-ui-ink)" opacity={0.35} />
        </>
      );
    case "tin":
      return (
        <>
          <ellipse cx={22} cy={14} rx={8} ry={3} transform="rotate(-62 22 14)" fill={t("tin")} stroke={RIM} strokeWidth={0.8} />
          <path d="M4 19 L4 25 C4 27.5 9 29 15 29 C21 29 26 27.5 26 25 L26 19 Z" fill={t("tin")} stroke={RIM} strokeWidth={0.9} />
          <ellipse cx={15} cy={19} rx={11} ry={3.6} fill={t("tin")} stroke={RIM} strokeWidth={0.9} />
          <ellipse cx={15} cy={19.2} rx={9.6} ry={2.8} fill={t(look.tone)} />
        </>
      );
    case "pouch":
      return (
        <>
          <path d="M11.5 12 C6 14 4 19 5 23.5 C6 27.5 10 29.5 16 29.5 C22 29.5 26 27.5 27 23.5 C28 19 26 14 20.5 12 Z" fill={t(look.tone)} stroke={RIM} strokeWidth={0.9} strokeLinejoin="round" />
          <path d="M11.5 12 C10 10 10.5 8 12.5 7 L16 9 L19.5 7 C21.5 8 22 10 20.5 12" fill={t(look.tone)} stroke={RIM} strokeWidth={0.8} strokeLinejoin="round" />
          <path d="M11 12.2 C14 13.4 18 13.4 21 12.2" stroke={t("thread")} strokeWidth={1.6} fill="none" strokeLinecap="round" />
          <path d="M20.5 12.6 C22.5 14 23 16 22 18" stroke={t("thread")} strokeWidth={1} fill="none" strokeLinecap="round" />
          <path d="M9 21 L23 21" stroke={RIM} strokeWidth={0.5} opacity={0.35} strokeDasharray="1.2 1.4" />
        </>
      );
  }
}

const SPRIG_AT: Record<BrewVessel, readonly [number, number]> = { bottle: [20, 9.5], tin: [15, 17.5], pouch: [16, 6.5] };

/** A brew's picture; `unknown`, a brew not yet found, is its shape in shadow. */
export function BrewIcon({ brew, unknown = false, className = "size-8" }: { brew: BrewId; unknown?: boolean; className?: string }) {
  const look = brewLook(brew);
  const rng = createRng(`hearthwood/brew-icon/${brew}`);
  const name = unknown ? "A brew not yet found" : brewName(brew);
  const [sx, sy] = SPRIG_AT[look.vessel];
  return (
    <svg viewBox="0 0 32 32" className={className} role="img" aria-label={name}>
      <title>{name}</title>
      <g style={unknown ? { filter: "brightness(0)", opacity: 0.22 } : undefined}>
        {vessel(look)}
        {sprig(look.sprig, sx, sy, rng)}
      </g>
    </svg>
  );
}

/** A way of brewing as its empty vessel. */
export function BrewFormIcon({ form, className = "size-8" }: { form: BrewForm; className?: string }) {
  const tone: BrewTone = form === "tea" ? "yarrow-tea" : form === "salve" ? "green-salve" : "linen";
  return (
    <svg viewBox="0 0 32 32" className={className} role="img" aria-label={BREW_FORM_NAMES[form]}>
      <title>{BREW_FORM_NAMES[form]}</title>
      {vessel({ vessel: VESSEL_OF[form], tone })}
    </svg>
  );
}

/** The iron cauldron on its legs, with a wisp of steam: brewing's own mark. */
export function CauldronIcon({ className = "size-8", glow = "glow-violet" }: { className?: string; glow?: BrewTone }) {
  return (
    <svg viewBox="0 0 32 32" className={className} role="img" aria-label="The cauldron">
      <title>The cauldron</title>
      <path d="M12 9 C11 7 13 6 12 3.5 M19 9 C18 7 20 6 19 3.5" stroke={t(glow)} strokeWidth={1.4} fill="none" strokeLinecap="round" />
      <path d="M8 26 L6.5 29.5 M24 26 L25.5 29.5 M16 27.5 L16 30" stroke={t("cauldron")} strokeWidth={2} strokeLinecap="round" />
      <path d="M5 13.5 C3 19 5 27 16 27.5 C27 27 29 19 27 13.5 Z" fill={t("cauldron")} stroke={RIM} strokeWidth={0.8} />
      <ellipse cx={16} cy={13} rx={12} ry={2.8} fill={t("cauldron")} stroke="var(--color-hearthwood-valley-ui-ink)" strokeWidth={0.6} />
      <ellipse cx={16} cy={13.2} rx={9.5} ry={1.8} fill={t(glow)} opacity={0.85} />
    </svg>
  );
}

const BREW_STAPLE_DRAWINGS: Record<Exclude<BrewStaple, "honey">, ReactNode> = {
  beeswax: (
    <>
      <path d="M5 15 L16 10 L27 15 L27 21 L16 26 L5 21 Z" fill={t("beeswax")} stroke={RIM} strokeWidth={0.9} strokeLinejoin="round" />
      <path d="M5 15 L16 20 L27 15 M16 20 L16 26" stroke={RIM} strokeWidth={0.6} fill="none" />
      {[[11, 14.5], [16, 13], [21, 14.5], [16, 16]].map(([x, y], i) => (
        <path key={i} d={`M${x - 1.6} ${y} l0.8 -1 l1.6 0 l0.8 1 l-0.8 1 l-1.6 0 Z`} fill="none" stroke={RIM} strokeWidth={0.4} opacity={0.6} />
      ))}
    </>
  ),
  salt: (
    <>
      <path d="M7 14 L25 14 L23.5 27 C23.3 28.3 22 29 20.5 29 L11.5 29 C10 29 8.7 28.3 8.5 27 Z" fill={t("crock")} stroke={RIM} strokeWidth={0.9} strokeLinejoin="round" />
      <path d="M8 14 C9 9.5 12 8 16 8 C20 8 23 9.5 24 14 Z" fill={t("salt")} stroke={RIM} strokeWidth={0.8} />
      {[[12, 11.5], [16, 10], [19.5, 12], [14, 12.6]].map(([x, y], i) => (
        <rect key={i} x={x} y={y} width={1} height={1} fill={RIM} opacity={0.3} />
      ))}
    </>
  ),
};

export function BrewIngredientIcon({ ingredient, className = "size-8" }: { ingredient: BrewIngredient; className?: string }) {
  if (isForageKind(ingredient)) return <ForageIcon kind={ingredient} className={className} />;
  if (ingredient === "honey") return <StapleIcon staple="honey" className={className} />;
  return (
    <svg viewBox="0 0 32 32" className={className} role="img" aria-label={BREW_STAPLE_NAMES[ingredient]}>
      <title>{BREW_STAPLE_NAMES[ingredient]}</title>
      {BREW_STAPLE_DRAWINGS[ingredient]}
    </svg>
  );
}

export const brewIngredientName = (ingredient: BrewIngredient) => (isForageKind(ingredient) ? FORAGE_NAMES[ingredient] : BREW_STAPLE_NAMES[ingredient]);

const CHARM_DRAWINGS: Record<Charm, ReactNode> = {
  bloom: (
    <>
      {[0, 72, 144, 216, 288].map((a) => (
        <ellipse key={a} cx={16} cy={9.5} rx={3.6} ry={6} transform={`rotate(${a} 16 16)`} fill={t("bloom-pink")} stroke={RIM} strokeWidth={0.7} />
      ))}
      <circle cx={16} cy={16} r={3.4} fill={t("bloom-yellow")} stroke={RIM} strokeWidth={0.7} />
    </>
  ),
  fireflies: (
    <>
      {[[10, 11, 4.5], [21, 9, 3.5], [19, 21, 5], [9, 23, 3]].map(([x, y, r], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r={r} fill="var(--color-hearthwood-valley-firefly)" opacity={0.35} />
          <circle cx={x} cy={y} r={r * 0.38} fill="var(--color-hearthwood-valley-firefly)" />
        </g>
      ))}
    </>
  ),
  hush: (
    <>
      <ellipse cx={16} cy={21} rx={6} ry={5} fill={t("hush")} stroke={RIM} strokeWidth={0.8} />
      {[[8.5, 13.5], [13.5, 9.5], [18.5, 9.5], [23.5, 13.5]].map(([x, y], i) => (
        <ellipse key={i} cx={x} cy={y} rx={2.6} ry={3.2} fill={t("hush")} stroke={RIM} strokeWidth={0.8} />
      ))}
    </>
  ),
  clearing: (
    <>
      <path d="M3 10 C8 7 12 13 17 10 C21 7.5 25 9 29 11" stroke={t("glow-blue")} strokeWidth={2.2} fill="none" strokeLinecap="round" opacity={0.55} />
      <path d="M3 22 C8 19 12 25 17 22 C21 19.5 25 21 29 23" stroke={t("glow-blue")} strokeWidth={2.2} fill="none" strokeLinecap="round" opacity={0.55} />
      <circle cx={16} cy={16} r={4.2} fill={t("glow-gold")} stroke={RIM} strokeWidth={0.7} />
    </>
  ),
};

/** What a charm brings about, as a picture in its glow's colour. */
export function CharmIcon({ charm, className = "size-6" }: { charm: Charm; className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} role="img" aria-label={CHARM_NAMES[charm]}>
      <title>{CHARM_NAMES[charm]}</title>
      <circle cx={16} cy={16} r={15} fill={t(CHARM_GLOW[charm])} opacity={0.22} />
      {CHARM_DRAWINGS[charm]}
    </svg>
  );
}

/** The full moon: bright while it is up, pale and dashed while it isn't. */
export function FullMoonIcon({ up, className = "size-6", label }: { up: boolean; className?: string; label: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} role="img" aria-label={label}>
      <title>{label}</title>
      {up && <circle cx={16} cy={16} r={15} fill={t("glow-gold")} opacity={0.35} />}
      <circle cx={16} cy={16} r={10} fill={up ? t("moon") : "none"} stroke={t("ink")} strokeWidth={up ? 1.4 : 1.8} strokeDasharray={up ? undefined : "2.6 2.2"} opacity={up ? 1 : 0.55} />
      {up && (
        <>
          <circle cx={13} cy={13.5} r={2} fill={RIM} opacity={0.12} />
          <circle cx={19} cy={18.5} r={2.6} fill={RIM} opacity={0.12} />
        </>
      )}
    </svg>
  );
}
