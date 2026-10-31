/*
 * A sea light's characteristic as what it does through one period: the real sequence where the data has one, and the
 * IALA definitions where it has only a letter. OSM holds some cardinals with a single flash's period, so a group that
 * can't fit the period it was given takes the period IALA gives that mark.
 */

export interface LightCharacteristic {
  character: string;
  periodS: number;
  group?: string;
  sequence?: string;
}

export interface Rhythm {
  periodS: number;
  /** Each stretch of light, in seconds from the period's start. */
  flashes: readonly { fromS: number; toS: number }[];
}

const QUICK = { onS: 0.25, cycleS: 1 };
const VERY_QUICK = { onS: 0.2, cycleS: 0.5 };
const FLASH_S = 0.5;
const FLASH_CYCLE_S = 1.5;
const LONG_FLASH_S = 2;
const LONG_FLASH_GAP_S = 0.5;
/** The cardinals' groups: Q(3) 10 s, VQ(6)+LFl 10 s and so on. */
const CARDINAL_PERIOD_S: Record<string, number> = { VQ3: 5, VQ6: 10, VQ9: 10, Q3: 10, Q6: 15, Q9: 15 };
/** A sequence's sum may miss the tag by rounding: within this it's the same period. */
const SAME_PERIOD_S = 0.11;

function fromSequence(sequence: string): number[] | null {
  const parts = sequence.split(/[^0-9.]+/).filter((part) => part !== "").map(Number);
  return parts.length >= 2 && parts.length % 2 === 0 ? parts : null;
}

/** From on, off, on, off, ... */
function rhythmOf(stretches: readonly number[], periodS: number): Rhythm {
  const flashes: { fromS: number; toS: number }[] = [];
  let at = 0;
  stretches.forEach((seconds, index) => {
    if (index % 2 === 0) flashes.push({ fromS: at, toS: at + seconds });
    at += seconds;
  });
  return { periodS, flashes };
}

/** `count` flashes, then what follows them, the last gap stretched to fill the period. */
function grouped(onS: number, cycleS: number, count: number, after: readonly number[], periodS: number): number[] {
  const stretches: number[] = [];
  for (let flash = 0; flash < count; flash++) stretches.push(onS, cycleS - onS);
  stretches.push(...after);
  const used = stretches.reduce((sum, seconds) => sum + seconds, 0);
  stretches[stretches.length - 1] += periodS - used;
  return stretches;
}

export function rhythm({ character, periodS, group, sequence }: LightCharacteristic): Rhythm {
  const [first, second] = character.split("+");
  const count = Number.parseInt(group ?? "1", 10) || 1;
  const stretches = sequence === undefined ? null : fromSequence(sequence);
  if (stretches) {
    const sum = stretches.reduce((total, seconds) => total + seconds, 0);
    return rhythmOf(stretches, Math.abs(sum - periodS) < SAME_PERIOD_S ? periodS : sum);
  }
  if (first === "Iso") return rhythmOf([periodS / 2, periodS / 2], periodS);
  if (first === "LFl") return rhythmOf([LONG_FLASH_S, periodS - LONG_FLASH_S], periodS);
  if (first === "Fl") return rhythmOf(grouped(FLASH_S, FLASH_CYCLE_S, count, [], periodS), periodS);

  const pulse = first === "VQ" ? VERY_QUICK : QUICK;
  const after = second === "LFl" ? [LONG_FLASH_S, LONG_FLASH_GAP_S] : [];
  const needs = pulse.cycleS * count + after.reduce((sum, seconds) => sum + seconds, 0);
  if (count === 1 && after.length === 0) return rhythmOf([pulse.onS, pulse.cycleS - pulse.onS], pulse.cycleS);
  const period = needs > periodS + SAME_PERIOD_S ? (CARDINAL_PERIOD_S[`${first}${count}`] ?? needs) : periodS;
  return rhythmOf(grouped(pulse.onS, pulse.cycleS, count, after, period), period);
}

/** One period as `samples` values of 0 or 255, for a row of a texture. A stretch of light shorter than a sample still marks one. */
export function rhythmRow({ periodS, flashes }: Rhythm, samples: number): Uint8Array {
  const row = new Uint8Array(samples);
  for (const { fromS, toS } of flashes) {
    const from = Math.floor((fromS / periodS) * samples);
    const to = Math.max(from + 1, Math.round((toS / periodS) * samples));
    row.fill(255, from, Math.min(to, samples));
  }
  return row;
}
