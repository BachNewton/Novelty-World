import { allowsPet, comesToSee, isWon, keepsOff, type Bond, type Temper } from "./befriending";
import { choice, stepBody, type Aim, type Body, type Nature, type Obstacle } from "./behaviour";
import type { WalkGround } from "./walking";
import type { Species } from "../engine/strays";

/*
 * A stray's day, as rules: round its home it idles, wanders, sits, lies or
 * loafs and noses about, each choice seeded and coloured by its nature (a
 * busy one wanders more, a lazy one lies longer). When Elliott comes near it
 * reacts by its temper and how warm it is to them: a shy one keeps its
 * distance and watches, stepping back if they come closer than it likes (and
 * further if they come running); a bold one, or a friendly dog, comes to
 * see, a friendly dog at a bound; once warm enough for a pet, any of them
 * lets Elliott come right up. A fox is warier still, watching from further
 * off and slipping away at a lope; a hedgehog doesn't run from Elliott but
 * curls up into a ball where it is, and stays curled until they have kept
 * still a while or stepped back. It never strays far from home for long.
 */

/** Where Elliott is, as an animal sees them. */
export interface Elliott {
  x: number;
  z: number;
  /** Their pace, metres a second. */
  speed: number;
  /** Walking or still, not running. */
  calm: boolean;
  /** In a hop or on the broom. */
  aloft: boolean;
}

export interface StrayMind {
  /** What it is doing round home, until when, and how many choices it has made (its seed's count). */
  plan: Aim;
  until: number;
  picks: number;
  /** Whether it has noticed Elliott. */
  noticed: boolean;
}

/** How near Elliott must come for a stray to notice them, in metres. */
export const NOTICE: Record<Species, number> = { cat: 20, dog: 28, fox: 30, hedgehog: 9 };

/** Each species' paces round home and about Elliott, in metres a second (`size` the body's scale), and how near it comes to see them. */
const PACES: Record<Species, { wander: (busy: number, size: number) => number; nose: (size: number) => number; flee: (size: number) => number; come: (bold: number, size: number) => number; near: (size: number) => number }> = {
  cat: { wander: (busy) => 0.42 + 0.3 * busy, nose: () => 0.4, flee: () => 3.2, come: (bold) => 0.7 + 0.4 * Math.max(0, bold), near: () => 1.05 },
  dog: { wander: (busy, size) => (0.55 + 0.45 * busy) * size, nose: (size) => 0.7 * size, flee: (size) => 2.6 * size, come: (_, size) => 1.2 * size, near: (size) => 0.75 + 0.35 * size },
  fox: { wander: (busy) => 0.7 + 0.5 * busy, nose: () => 0.6, flee: () => 4.2, come: () => 1.1, near: () => 1.35 },
  hedgehog: { wander: (busy) => 0.32 + 0.18 * busy, nose: () => 0.25, flee: () => 0, come: () => 0.4, near: () => 0.8 },
};
/** A stray that finds itself this many times its roam from home goes back. */
const HOMESICK = 1.9;
/** Running at a shy stray startles it back this much further, in metres. */
const STARTLE = 2.5;
/** Held out, an animal's favourite dish tempts it this much nearer than it would otherwise come. */
const TEMPTED = 0.45;

export function strayMind(): StrayMind {
  return { plan: { stay: "stand" }, until: -Infinity, picks: 0, noticed: false };
}

/** How near a stray comes to see Elliott, in metres from them. */
export const comeTo = (nature: Nature) => PACES[nature.species].near(nature.size);

/** The next thing it does round home, and for how long. */
function idlePlan(nature: Nature, body: Body, home: { x: number; z: number }, roam: number, picks: number): { plan: Aim; seconds: number } {
  const busy = (nature.energy + 1) / 2;
  const lazy = 1 - busy;
  const away = Math.hypot(body.x - home.x, body.z - home.z);
  const roll = choice(nature, 1, picks);
  const weights = { wander: 0.25 + 0.35 * busy, sit: 0.22, lie: 0.12 + 0.38 * lazy, sniff: 0.18 };
  const total = weights.wander + weights.sit + weights.lie + weights.sniff;
  let r = roll * total;
  const length = (low: number, high: number) => low + (high - low) * choice(nature, 2, picks);
  if (away > roam * HOMESICK || (r -= weights.wander) < 0) {
    const angle = choice(nature, 3, picks) * Math.PI * 2;
    const reach = roam * Math.sqrt(choice(nature, 4, picks));
    const pace = PACES[nature.species].wander(busy, nature.size);
    return { plan: { go: { x: home.x + Math.cos(angle) * reach, z: home.z + Math.sin(angle) * reach }, pace }, seconds: length(10, 22) };
  }
  if ((r -= weights.sit) < 0) return { plan: { stay: "sit", face: choice(nature, 5, picks) * Math.PI * 2 }, seconds: length(5, 14) };
  if ((r -= weights.lie) < 0) return { plan: { stay: "lie", face: choice(nature, 5, picks) * Math.PI * 2 }, seconds: length(10, 30) * (0.6 + lazy) };
  // Nosing about: a few steps to somewhere close, and a good sniff there.
  const angle = choice(nature, 3, picks) * Math.PI * 2;
  const step = 1.5 + 2.5 * choice(nature, 4, picks);
  return { plan: { go: { x: body.x + Math.cos(angle) * step, z: body.z + Math.sin(angle) * step }, pace: PACES[nature.species].nose(nature.size) }, seconds: length(4, 9) };
}

/** Where a shy stray steps back to: further off from Elliott than it likes, but not far from home. */
function backAway(body: Body, elliott: Elliott, keep: number, home: { x: number; z: number }, roam: number): { x: number; z: number } {
  const d = Math.max(0.01, Math.hypot(body.x - elliott.x, body.z - elliott.z));
  let x = elliott.x + ((body.x - elliott.x) / d) * (keep + 1.5);
  let z = elliott.z + ((body.z - elliott.z) / d) * (keep + 1.5);
  const fromHome = Math.hypot(x - home.x, z - home.z);
  const limit = roam * HOMESICK;
  if (fromHome > limit) {
    x = home.x + ((x - home.x) / fromHome) * limit;
    z = home.z + ((z - home.z) / fromHome) * limit;
  }
  return { x, z };
}

/** What a stray does about Elliott, near enough to notice them. */
function reaction(body: Body, nature: Nature, temper: Temper, bond: Bond, elliott: Elliott, tempted: boolean, home: { x: number; z: number }, roam: number): Aim {
  const d = Math.hypot(body.x - elliott.x, body.z - elliott.z);
  const face = Math.atan2(elliott.x - body.x, elliott.z - body.z);
  const shy = keepsOff(temper, bond) * (tempted ? TEMPTED : 1);
  const keep = shy + (elliott.calm || shy === 0 ? 0 : STARTLE);
  if (d < keep - 0.4) {
    // A hedgehog doesn't run: it curls up where it is.
    if (nature.species === "hedgehog") return { stay: "lie", face: null };
    return { go: backAway(body, elliott, keep, home, roam), pace: PACES[nature.species].flee(nature.size), arrive: 0.6 };
  }
  const near = comeTo(nature);
  // Coming to see: it goes to stand beside Elliott, short of them, never into them.
  if (comesToSee(temper, bond) && d > near + 0.6 && d > keep) {
    const friendlyDog = temper.species === "dog" && allowsPet(bond, temper) && temper.boldness > -0.25;
    const pace = friendlyDog ? 5 + 2 * Math.max(0, nature.energy) : PACES[nature.species].come(nature.boldness, nature.size);
    return { go: { x: elliott.x + ((body.x - elliott.x) / d) * near, z: elliott.z + ((body.z - elliott.z) / d) * near }, pace, arrive: 0.4 };
  }
  // Watching: a cat sits to watch unless it is shy and Elliott is close, when it stays on its feet; a dog stands or sits.
  const rest = watching(nature, temper, d, keep);
  return { stay: rest, face };
}

/** How a stray holds itself watching Elliott: a cat sits unless it is shy and Elliott close; a fox stands alert, sitting only once at ease; a hedgehog stays curled a while after Elliott comes close; a dog stands or sits. */
function watching(nature: Nature, temper: Temper, d: number, keep: number): "stand" | "sit" | "lie" {
  switch (nature.species) {
    case "cat":
      return temper.boldness < -0.3 && d < keep + 2 ? "stand" : "sit";
    case "fox":
      return d < keep + 4 ? "stand" : "sit";
    case "hedgehog":
      return d < keep + 1.2 ? "lie" : "stand";
    case "dog":
      return choice(nature, 6, 0) < 0.5 ? "sit" : "stand";
  }
}

/**
 * One step of a stray: what it is doing, and its body moved by it. Patience
 * and the bond's warmth are befriending's (see `bePatient`). `tempted` is
 * whether Elliott holds out its favourite dish, which draws it nearer.
 */
export function stepStray(
  body: Body,
  mind: StrayMind,
  nature: Nature,
  temper: Temper,
  bond: Bond,
  home: { x: number; z: number },
  roam: number,
  elliott: Elliott,
  tempted: boolean,
  time: number,
  ground: WalkGround,
  obstacles: readonly Obstacle[],
  seconds: number,
): void {
  const d = Math.hypot(body.x - elliott.x, body.z - elliott.z);
  const noticing = !elliott.aloft && !isWon(bond) && d < NOTICE[nature.species];
  if (noticing !== mind.noticed) {
    mind.noticed = noticing;
    mind.until = -Infinity;
  }
  let aim: Aim;
  if (noticing) {
    aim = reaction(body, nature, temper, bond, elliott, tempted, home, roam);
    // Warm to Elliott and close, it greets them: a cat's tail goes up, a dog's starts going.
    if (d < 3 && (bond.warmth > 0.55 || (temper.species === "dog" && temper.boldness > -0.25))) body.greetUntil = Math.max(body.greetUntil, time + 0.3);
  } else {
    const arrived = "go" in mind.plan && Math.hypot(mind.plan.go.x - body.x, mind.plan.go.z - body.z) < 0.5;
    if (time >= mind.until || arrived) {
      const next = idlePlan(nature, body, home, roam, mind.picks);
      mind.picks++;
      // Having arrived somewhere, it settles there a while before going on.
      mind.plan = arrived && "go" in next.plan ? { stay: "stand" } : next.plan;
      mind.until = time + (arrived && "go" in next.plan ? 2 + 3 * choice(nature, 7, mind.picks) : next.seconds);
    }
    aim = mind.plan;
  }
  stepBody(body, nature, aim, ground, obstacles, seconds);
}
