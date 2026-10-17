import { Shape, type SoundDesign, type SoundLayer } from "@/shared/lib/sound";

/*
 * Risk's sounds: the war table's, made with ZzFX (the shared `sound/`), every one in this file so
 * they are retuned in one place, by ear, on the `?sounds` page. The palette is the war room's:
 * wooden dice and counters on the table, a field drum, brass calls (a saw through a low-pass,
 * which softens it towards a horn) and a gong. Only what carries news has a sound: the moves a
 * seat makes, the board changing hands, and what happens to the viewer. Moving the focus, opening
 * the war room and the steps of a move are silent, and a move needs no "confirm": the move's own
 * sound (the dice, the knock of armies placed, the march) is its confirmation.
 */

export const RISK_SOUND_IDS = [
  "dice",
  "blitz",
  "place",
  "march",
  "capture",
  "taken",
  "lost",
  "continent",
  "trade",
  "card",
  "eliminated",
  "turn",
  "victory",
  "defeat",
  "select",
  "invalid",
] as const;
export type RiskSoundId = (typeof RISK_SOUND_IDS)[number];

/** A die, or a counter, striking the table: a short woody click. */
const click = (at: number, frequency: number, volume: number): SoundLayer => ({
  at,
  zzfx: { volume, frequency, release: 0.03, shape: Shape.triangle, slide: -2, noise: 0.8, filter: 500 },
});

/** A field drum's tap: a low thump falling in pitch, with a little rattle of the snares. */
const drum = (at: number, volume: number): SoundLayer => ({
  at,
  zzfx: { volume, frequency: 95, decay: 0.03, sustain: 0.02, sustainVolume: 0.5, release: 0.16, slide: -0.3, noise: 0.35, filter: -900 },
});

/** A brass note: a saw softened by a low-pass, with a breath of attack; a slide bends it. */
const horn = (at: number, frequency: number, hold: number, release: number, volume = 0.35, slide = 0): SoundLayer => ({
  at,
  zzfx: { volume, frequency, attack: 0.02, sustain: hold, release, shape: Shape.saw, sustainVolume: 0.85, decay: 0.03, slide, filter: -1800 },
});

/** A small bell: a sine with a long ring. */
const bell = (at: number, frequency: number, volume: number): SoundLayer => ({
  at,
  zzfx: { volume, frequency, attack: 0.005, release: 0.3, filter: -5000 },
});

// The notes the brass plays, in hertz.
const C4 = 261.63;
const F4 = 349.23;
const Eb4 = 311.13;
const G4 = 392;
const A3 = 220;
const D4 = 293.66;
const A4 = 440;
const C5 = 523.25;
const E5 = 659.25;
const G5 = 783.99;
const B5 = 987.77;
const D6 = 1174.66;

const noStray = { pitch: 0, volume: 0 };

export const RISK_SOUNDS: Record<RiskSoundId, SoundDesign> = {
  dice: {
    label: "Dice",
    trigger: "A battle's dice are rolled, by any seat.",
    layers: [click(0, 1100, 0.45), click(0.05, 850, 0.4), click(0.09, 1300, 0.35), click(0.16, 950, 0.2)],
    variation: { pitch: 0.08, volume: 0.2 },
    minGap: 0.15,
    busiestEvery: 0.25,
  },
  blitz: {
    label: "Blitz",
    trigger: "A blitz is fought to its end, by any seat: a long roll of the dice, ending on the table.",
    layers: [
      ...[1150, 900, 1250, 1000, 1200, 850, 1100, 950].map((frequency, i) => click(i * 0.055, frequency, 0.42 - i * 0.03)),
      drum(0.46, 0.35),
    ],
    variation: { pitch: 0.06, volume: 0.15 },
    minGap: 0.4,
    busiestEvery: 0.6,
  },
  place: {
    label: "Armies placed",
    trigger: "Armies are placed on a territory, by any seat: a counter knocked down on the board.",
    layers: [
      { at: 0, zzfx: { volume: 0.45, frequency: 160, decay: 0.02, sustain: 0.01, sustainVolume: 0.4, release: 0.08, shape: Shape.triangle, slide: -0.6, noise: 0.4, filter: -1600 } },
      click(0, 1400, 0.15),
    ],
    variation: { pitch: 0.07, volume: 0.2 },
    minGap: 0.08,
    busiestEvery: 0.3,
  },
  march: {
    label: "March",
    trigger: "Armies march: a fortify, or armies moved into a captured territory.",
    layers: [drum(0, 0.5), drum(0.14, 0.4), drum(0.28, 0.5)],
    variation: { pitch: 0.04, volume: 0.15 },
    minGap: 0.5,
    busiestEvery: 0.9,
  },
  capture: {
    label: "Captured",
    trigger: "The viewer takes a territory: a rising brass call.",
    layers: [horn(0, D4, 0.06, 0.1, 0.4), horn(0.09, A4, 0.12, 0.25, 0.45)],
    variation: { pitch: 0.02, volume: 0.1 },
    minGap: 0.2,
    busiestEvery: 0.8,
  },
  taken: {
    label: "Taken",
    trigger: "Another seat takes a territory from a third: a muffled thud, news but not the viewer's.",
    layers: [drum(0, 0.5)],
    variation: { pitch: 0.06, volume: 0.2 },
    minGap: 0.15,
    busiestEvery: 0.8,
  },
  lost: {
    label: "Lost",
    trigger: "A territory of the viewer's falls: a falling brass call over a drum.",
    layers: [horn(0, D4, 0.08, 0.1, 0.35), horn(0.12, A3, 0.1, 0.35, 0.4, -0.2), drum(0.12, 0.3)],
    variation: { pitch: 0.02, volume: 0.1 },
    minGap: 0.3,
    busiestEvery: 0.8,
  },
  continent: {
    label: "Continent",
    trigger: "A seat takes a whole continent: a held brass chord.",
    layers: [horn(0, G4, 0.2, 0.4, 0.22), horn(0, C5, 0.2, 0.4, 0.22), horn(0.02, E5, 0.18, 0.4, 0.2)],
    variation: noStray,
    minGap: 0.5,
    busiestEvery: 1,
  },
  trade: {
    label: "Set traded",
    trigger: "A seat trades a set of cards for armies: three bells climbing.",
    layers: [bell(0, G5, 0.3), bell(0.07, B5, 0.28), bell(0.14, D6, 0.26)],
    variation: { pitch: 0.01, volume: 0.1 },
    minGap: 0.5,
    busiestEvery: 1.3,
  },
  card: {
    label: "Card earned",
    trigger: "The viewer draws a card at the end of a turn that captured: a card flicked onto the table.",
    layers: [
      { at: 0, zzfx: { volume: 0.25, frequency: 2400, attack: 0.005, release: 0.06, shape: Shape.noise, slide: -10, filter: 1500 } },
      { at: 0.05, zzfx: { volume: 0.2, frequency: 1500, release: 0.04, shape: Shape.triangle, filter: -4000 } },
    ],
    variation: { pitch: 0.05, volume: 0.15 },
    minGap: 0.3,
    busiestEvery: 1,
  },
  eliminated: {
    label: "Eliminated",
    trigger: "Another seat is out of the game: a gong.",
    layers: [
      { at: 0, zzfx: { volume: 0.7, frequency: 55, attack: 0.005, decay: 0.1, sustain: 0.2, sustainVolume: 0.6, release: 1.2, slide: -0.05, noise: 0.1, filter: -600 } },
      { at: 0, zzfx: { volume: 0.2, frequency: 196, attack: 0.005, release: 1.2, shape: Shape.triangle, modulation: 47, filter: -1500 } },
    ],
    variation: noStray,
    minGap: 1,
    busiestEvery: 2.4,
  },
  turn: {
    label: "Your turn",
    trigger: "The viewer's turn begins: a bugle's call to arms. It plays in a hidden tab too.",
    layers: [horn(0, G4, 0.06, 0.06, 0.38), horn(0.12, G4, 0.04, 0.06, 0.34), horn(0.22, C5, 0.18, 0.35, 0.4)],
    variation: noStray,
    minGap: 1,
    busiestEvery: 20,
  },
  victory: {
    label: "Victory",
    trigger: "The viewer wins, or a game being watched ends: a fanfare climbing to a held note.",
    layers: [horn(0, G4, 0.08, 0.06), horn(0.13, C5, 0.08, 0.06), horn(0.26, E5, 0.08, 0.06), horn(0.39, G5, 0.35, 0.7, 0.38), drum(0.39, 0.4)],
    variation: noStray,
    minGap: 3,
    busiestEvery: 30,
  },
  defeat: {
    label: "Defeat",
    trigger: "The viewer is out of the game: a slow call falling to the minor.",
    layers: [horn(0, G4, 0.2, 0.1, 0.3), horn(0.32, F4, 0.2, 0.1, 0.3), horn(0.64, Eb4, 0.2, 0.1, 0.3), horn(0.96, C4, 0.5, 0.9, 0.34), drum(0.96, 0.35)],
    variation: noStray,
    minGap: 3,
    busiestEvery: 30,
  },
  select: {
    label: "Select",
    trigger: "The viewer picks a territory on the map that a move starts from or goes to (not one that makes the move).",
    layers: [{ at: 0, zzfx: { volume: 0.22, frequency: 1000, release: 0.03, shape: Shape.triangle, filter: -4000 } }],
    variation: { pitch: 0.04, volume: 0.1 },
    minGap: 0.05,
    busiestEvery: 0.2,
  },
  invalid: {
    label: "Not allowed",
    trigger: "The viewer taps a territory that isn't on offer while picking one, or the server refuses a move.",
    layers: [
      { at: 0, zzfx: { volume: 0.35, frequency: 150, release: 0.06, shape: Shape.triangle, filter: -1000 } },
      { at: 0.09, zzfx: { volume: 0.3, frequency: 140, release: 0.08, shape: Shape.triangle, filter: -1000 } },
    ],
    variation: { pitch: 0.03, volume: 0.1 },
    minGap: 0.3,
    busiestEvery: 0.5,
  },
};
