import { writeFileSync } from "node:fs";
import process from "node:process";
// Offline-only: honours PPO_EXECUTOR (see bots/ppo/offline.ts). A no-op unless
// it is set — nothing under bots/eval/ is reachable from a browser build.
import "../ppo/offline-ort";
import { apply, autoStep, isLegal } from "../../engine";
import { freshGame } from "../../mocks";
import { driveOp } from "../../pacing";
import type { GameState, Intent } from "../../types";
import type { Bot } from "../decision";
import { sha256Hex } from "../ppo/bundle";
import { offlineExecutorMode } from "../ppo/offline";
import { versionBot } from "../versions";

// ---------------------------------------------------------------------------
// `npx tsx …/ort-check-cli.ts` — the evidence that the offline executor plays the
// SHIPPED bot.
//
// A faster executor is worthless if it decides differently: the ladder would then
// be measuring a player nobody plays, and every Elo it produced would be a lie
// told confidently. Numeric parity is not enough on its own either — a
// distribution can agree to 1e-4 everywhere and still cross a near-tie once in
// ten thousand draws, and a game amplifies one crossed tie into a different game.
//
// So this checks the only thing that settles it: play whole games and compare the
// INTENT STREAMS.
//
// THE WEIGHTS QUESTION — is the bundle in `public/bundles/` the artifact it claims
// to be? — holds the executor fixed and moves `PPO_BUNDLE_DIR`. This one MUST come
// back identical; it is the acceptance bar for anything shipped:
//
//   npx tsx …/ort-check-cli.ts --out /tmp/shipped.json
//   PPO_BUNDLE_DIR=… npx tsx …/ort-check-cli.ts --out /tmp/other.json
//   diff /tmp/shipped.json /tmp/other.json && echo IDENTICAL
//
// That is how a float16 re-encoding of these graphs was caught and rejected: it
// diverged on 1 decision in 158 and forked 8 of 12 games. Whole games are the
// only instrument sensitive enough to see it — the recorded parity fixtures
// showed 400/400 argmax agreement on the same pair of graphs.
//
// THE EXECUTOR QUESTION holds the weights fixed and moves `PPO_EXECUTOR`:
//
//   npx tsx …/ort-check-cli.ts --out /tmp/ts.json
//   PPO_EXECUTOR=ort npx tsx …/ort-check-cli.ts --out /tmp/ort.json
//   diff /tmp/ts.json /tmp/ort.json
//
// This one does NOT come back identical and is not expected to: fp32 addition is
// not associative and the two implementations sum in different orders, which
// crosses a near-tie in the trade head often enough that all four default traces
// fork. See the header of `bots/ppo/offline-ort.ts` for the numbers and for what
// that does and does not license ORT to be used for.
//
// The digests it prints are of the trace alone, so a difference is visible
// without diffing the files, and the files say WHERE it diverged.
//
// The seats default to both shipped bundles at once (`landon-v1` and
// `landon-exploiter-v1`), because they are separate graphs and a substitution
// argument that only held for one of them would not be an argument at all.
// ---------------------------------------------------------------------------

interface Args {
  seeds: readonly string[];
  labels: readonly string[];
  /** Driver beats per game. A game is not played to a winner: several full turn
   *  cycles is already thousands of decisions per bundle, and a divergence shows
   *  up in the first one it happens on, not the last. */
  cap: number;
  out: string | null;
}

const DEFAULT_SEEDS: readonly string[] = ["ort-check-1", "ort-check-2", "ort-check-3", "ort-check-4"];
const DEFAULT_LABELS: readonly string[] = ["landon-v1", "landon-exploiter-v1", "landon-v1", "landon-exploiter-v1"];

function parseArgs(argv: readonly string[]): Args {
  let seeds = [...DEFAULT_SEEDS];
  let labels = [...DEFAULT_LABELS];
  let cap = 1_500;
  let out: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--seeds") seeds = (argv[++i] ?? "").split(",").filter((s) => s !== "");
    else if (arg === "--seats") labels = (argv[++i] ?? "").split(",").filter((s) => s !== "");
    else if (arg === "--cap") cap = Number(argv[++i]);
    else if (arg === "--out") out = argv[++i] ?? null;
    else throw new Error(`unknown flag "${arg}"`);
  }
  if (seeds.length === 0) throw new Error("--seeds needs at least one seed");
  if (labels.length !== 2 && labels.length !== 4 && labels.length !== 8) {
    throw new Error(`--seats needs 2, 4 or 8 labels, got ${labels.length}`);
  }
  if (!Number.isInteger(cap) || cap < 1) throw new Error("--cap must be a positive integer");
  return { seeds, labels, cap, out };
}

/** An intent as a stable string. Keys are sorted so the trace records WHAT was
 *  submitted rather than the order a literal happened to be built in. */
function canonical(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`)
    .join(",")}}`;
}

interface Trace {
  seed: string;
  steps: number;
  turns: number;
  status: string;
  intents: string[];
  digest: string;
}

/** Drive one game through the SAME pacer the browser uses, recording every intent
 *  the bots actually submit. Mirrors `ppo/bot.test.ts`'s loop deliberately: that
 *  is the shape a real game has, autoStep beats included. */
function trace(seed: string, seats: readonly Bot[], cap: number): Trace {
  const base = freshGame(seed, undefined, seats.length as 2 | 4 | 8);
  let state: GameState = {
    ...base,
    players: base.players.map((p) => ({ ...p, botStrategy: "dumb" as const })),
  };
  const byId = new Map(state.players.map((p, i) => [p.id, seats[i]]));
  const resolve = (s: GameState, playerId: string): Bot | null => byId.get(playerId) ?? null;

  const intents: string[] = [];
  let steps = 0;
  for (; steps < cap; steps++) {
    if (state.status !== "active") break;
    const op = driveOp(state, true, null, resolve);
    if (op === null) break;
    if (op.kind === "step") {
      const next = autoStep(state).state;
      if (next === state) break;
      state = next;
      continue;
    }
    const intent: Intent = op.intent;
    if (!isLegal(state, intent)) throw new Error(`illegal ${intent.kind} at ${state.turn.phase} (seed ${seed})`);
    intents.push(canonical(intent));
    const result = apply(state, intent);
    if (!result.ok) throw new Error(`apply rejected ${intent.kind}: ${result.reason}`);
    if (result.state === state) break;
    state = result.state;
  }
  return {
    seed,
    steps,
    turns: state.turns.length,
    status: state.status,
    intents,
    digest: sha256Hex(new TextEncoder().encode(intents.join("\n"))),
  };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const mode = offlineExecutorMode();
  const seats = args.labels.map((label) => versionBot(label));

  console.log(`executor: ${mode ?? "shipped pure-TS interpreter"}`);
  console.log(`bundles:  ${process.env.PPO_BUNDLE_DIR ?? "public/bundles (shipped)"}`);
  console.log(`seats:    ${args.labels.join(", ")}`);
  console.log(`seeds:    ${args.seeds.join(", ")} (cap ${args.cap} beats)\n`);

  const traces: Trace[] = [];
  const started = Date.now();
  for (const seed of args.seeds) {
    const t0 = Date.now();
    const t = trace(seed, seats, args.cap);
    traces.push(t);
    console.log(
      `${seed}: ${String(t.intents.length).padStart(5)} intents  ${String(t.steps).padStart(5)} beats  ` +
        `turn ${String(t.turns).padStart(3)}  ${((Date.now() - t0) / 1000).toFixed(1)}s  ${t.digest.slice(0, 16)}`,
    );
  }
  const total = traces.reduce((n, t) => n + t.intents.length, 0);
  const all = sha256Hex(new TextEncoder().encode(traces.map((t) => t.digest).join("\n")));
  console.log(`\n${total} intents over ${traces.length} games in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  console.log(`COMBINED TRACE DIGEST: ${all}`);

  if (args.out !== null) {
    // The trace only — no executor name, no timings. Two runs must produce
    // byte-identical files, so nothing that differs BY DESIGN may be in them.
    /* eslint-disable-next-line security/detect-non-literal-fs-filename -- an
       operator-supplied output path on a developer CLI; never request data. */
    writeFileSync(args.out, `${JSON.stringify({ seats: args.labels, cap: args.cap, traces }, null, 1)}\n`);
    console.log(`wrote ${args.out}`);
  }
}

main();
