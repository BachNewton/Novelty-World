// ===========================================================================
// v12 — the replay-safe RNG seam (see EVOLUTION.md, bots/CLAUDE.md "Randomness &
// the RNG seam"). The marquee untested axis: the bot is fully deterministic and
// legible, so a modelling opponent reads it perfectly. A MIXED strategy could
// deny that read — but it MUST stay deterministic given the seed, or it breaks
// the engine's hard replay guarantee.
//
// The seam is already in the bot's hand: `Bot` is a pure function of `GameState`,
// and `GameState.rngState` is the live mulberry32 state the engine threads through
// every game. So the bot can draw replay-safe randomness by HASHING `rngState`
// (plus a per-decision salt) — WITHOUT a Bot-contract change and WITHOUT ever
// touching `Math.random`. This is strictly better than threading a live `Rng`
// into the contract (the alternative the docs floated):
//   - It NEVER advances the engine's stream, so it can't consume the dice/draw
//     entropy the engine needs — the games played are byte-identical to v5's in
//     every seat where v12 doesn't actually diverge.
//   - It is STABLE across the pacer's re-consults within one decision window
//     (`rngState` only advances on a roll/draw, so it's constant between the
//     pre-roll arm and the trade-building commit) — a live `Rng` would hand back a
//     *different* value each consult and spin the arm/commit handshake.
//   - It is decorrelated across games (different seeds → different `rngState`
//     trajectories) and across distinct decisions (the salt), which is what a
//     mixed strategy needs.
// ===========================================================================

/** A deterministic pseudo-random value in [0, 1), derived purely from the game's
 *  current `rngState` and a decision `salt`. Same `(rngState, salt)` → same value
 *  (replay-safe, re-consult-stable); different seeds/decisions → independent
 *  draws. An xmur3-style hash (the engine's own seed mixer), seeded by `rngState`
 *  and folded over the salt's char codes — never `Math.random`. */
export function mixUnit(rngState: number, salt: string): number {
  let h = (rngState ^ 0x9e3779b9) >>> 0;
  for (let i = 0; i < salt.length; i++) {
    h = Math.imul(h ^ salt.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Pick one element of `items` by the replay-safe mixed draw `mixUnit(rngState,
 *  salt)`. `items` must be non-empty and in a DETERMINISTIC order (so the index
 *  maps to a stable choice). With a single item this always returns it, so a
 *  no-choice decision reduces exactly to the deterministic policy. */
export function mixPick<T>(items: readonly T[], rngState: number, salt: string): T {
  const u = mixUnit(rngState, salt);
  const idx = Math.min(items.length - 1, Math.floor(u * items.length));
  return items[idx];
}
