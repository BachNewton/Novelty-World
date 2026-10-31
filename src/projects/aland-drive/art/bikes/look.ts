/*
 * A rider's colours and hair, from a seed: the same seed is the same person,
 * which a cyclist on a road or another player can be sent as one number. Tokens
 * are without the `--color-aland-drive-` prefix.
 */

export interface RiderLook {
  skin: string;
  hair: string;
  top: string;
  bottom: string;
  shoe: string;
  helmetColour: string;
  hairStyle: "short" | "long";
  helmet: boolean;
}

function dice(seed: number) {
  let state = (Math.imul(seed + 1, 2654435761) ^ 0x9e3779b9) >>> 0;
  return (below: number) => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) % below;
  };
}

/** `helmet` overrides the seed's own choice, which gives one rider in three a helmet. */
export function riderLook(seed: number, helmet?: boolean): RiderLook {
  const pick = dice(seed);
  const of = (kind: string, count: number) => `rider-${kind}-${pick(count) + 1}`;
  return {
    skin: of("skin", 4),
    hair: of("hair", 5),
    top: of("top", 7),
    bottom: of("bottom", 5),
    shoe: of("shoe", 4),
    helmetColour: of("helmet", 5),
    hairStyle: pick(2) === 0 ? "short" : "long",
    helmet: helmet ?? pick(3) === 0,
  };
}
