import type { Bot } from "../../decision";
import { landonBot } from "../../ppo/landon";

// landon-v1 — the LANDON lineage: the first bot in this archive whose behaviour
// was LEARNED rather than written. It is a PPO policy trained by self-play in a
// three-member AlphaStar-style league, exported as an ONNX bundle and executed
// here by a pure-TypeScript synchronous interpreter.
//
// It is a snapshot of the league's MAIN agent. Its sibling `landon-exploiter-v1`
// is the same league's main-exploiter — a distinct policy trained specifically to
// beat the main agent, not a weaker copy of it.
//
// WHAT IS DIFFERENT ABOUT THIS BOT
//
// Every other version in this archive is a hand-written policy: someone reasoned
// about Monopoly and encoded that reasoning as branches over the game state. This
// one has no such reasoning to read. Its "strategy" is 3.39M parameters, and the
// only honest description of what it does is the training procedure that produced
// it plus the measurements in its gauntlet. There is no `params.ts` to tune and no
// heuristic to argue with.
//
// That also means its failure modes do not look like a bug in a rule. The worst
// one found so far was a decision-space artifact rather than a strategic error,
// and it is worth keeping written down because the SHAPE recurs: the action
// vocabulary contains a `RAISE_TO_BUY` token that names a pure phase transition —
// it opens an empty cash-raising window and moves no money — and nothing that
// resolves that window ever stages a mortgage or a sale into it, so a seat short
// of the price cancels straight back out onto a BIT-IDENTICAL board. A policy
// that executes its own argmax then re-picks the token forever: measured at 84%
// of all intents, with one landing absorbing 458 consecutive round trips and the
// game never reaching a winner. The action was legal, faithful to training, and
// provably null.
//
// It is now masked (`bots/ppo/core/action-space.ts`), which is the general answer:
// an action a policy must not take is removed from its LEGALITY MASK, where the
// training rig sees the same rule. It is not answered by making the decode
// stochastic so the bad action is merely improbable — that trades a wedge for an
// unmeasured second policy, and `v12` already measured drawing off the argmax as
// a pure value leak.
//
// HOW IT EXECUTES
//
// The weights ship WITH the repo, under `public/bundles/landon-v1/` — 13.6 MB of
// float32, byte for byte the graph the training rig exported. Halving that with a
// float16 conversion was tried and REJECTED: the narrowed graph picks the same
// action on every recorded parity fixture but differs on about 1 decision in 158
// over whole games, almost all on the trade-candidate head, where the top two
// generated offers are routinely within fp16 error of each other. What ships has
// to BE the trained policy, not a re-encoding that usually agrees with it
// (`bots/ppo/README.md`). They load from that directory off disk in Node (sim
// CLIs, gauntlet workers) and over HTTP into IndexedDB in the browser, verified
// against the sha256 of every entry in the bundle manifest. Until they are
// resident the bot returns `null`, which the pacer answers with the phase
// default, so a bundle that has not landed degrades to "plays the default"
// rather than crashing a game.
//
// Inference is a hand-written synchronous ONNX interpreter, not onnxruntime. That
// is forced, not preferred: `Bot` is synchronous and `conformance.test.ts` asserts
// it, while every ORT JavaScript backend's `run()` returns a Promise. ORT is ~20x
// faster and stays the right tool for offline batch work.
//
// DETERMINISM
//
// Every head is decoded by ARGMAX: what the policy selects is what gets played.
// There is no draw and no seed anywhere on this path, so `Bot` purity is
// structural rather than arranged — repeated calls agree because a forward pass
// over one board has one answer, and a decision the pacer spreads over several
// consultations (arm a manage boundary, then commit the plan) recomputes that
// same answer at each one.
//
// Constraining WHICH actions the policy may pick is the legality mask's job
// (`bots/ppo/core/action-space.ts`), which the training rig reads from the same
// source — not a decode-time draw that leaves a bad action reachable at whatever
// probability the net happens to assign it.

/** The bundle this label downloads. Exported so the lobby can PREFETCH it (see
 *  `versions/index.ts` `LEARNED_BUNDLES`) without a second copy of the string
 *  that could drift from the one the bot actually requests. */
export const LANDON_V1_BUNDLE = "landon-v1";

export const landonV1Bot: Bot = landonBot({ bundle: LANDON_V1_BUNDLE });
