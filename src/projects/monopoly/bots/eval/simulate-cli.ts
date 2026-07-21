import process from "node:process";
import { botFor } from "../registry";
import {
  formatResult,
  simulateGame,
  type Contender,
  type SimOptions,
} from "./simulate";
import { DEFAULT_BOT_VERSION } from "../roles";
import { valueNetStubBot } from "../rl/value-net-stub";
import { valuePolicyStubBot } from "../rl/value-policy";
import { tokenStubBot } from "../rl/token-bot";
import { VERSIONS } from "../versions";
import { renderHighlight } from "./render-log";

/** Seat tokens the sim accepts that AREN'T registry strategies: the learned-bot
 *  prototypes, fielded via the head-to-head `seats` API so they need no
 *  registry/route wiring (they're prototypes, not fieldable bots).
 *  - `value-stub`: the minimal reactive loop (`value-net-stub.ts`).
 *  - `value-policy`: the full-capability agent (`value-policy.ts`). */
const VALUE_STUB_TOKEN = "value-stub";
const VALUE_POLICY_TOKEN = "value-policy";
/** `token-stub`: the atomic-vocabulary greedy bot (`token-bot.ts`) — the Phase-3
 *  wiring proof that the fixed action vocabulary drives a full legal game. */
const TOKEN_STUB_TOKEN = "token-stub";
/** `rl-net:<checkpoint-dir>`: the LEARNED bot — MCTS over a trained net loaded
 *  from a `train:rl` checkpoint. Lazily loaded (tfjs only when actually fielded),
 *  so a normal sim stays fast. */
const RL_NET_PREFIX = "rl-net:";

/** `npm run sim` — an on-demand script that plays a full, headless Monopoly game
 *  between bots and prints the outcome. No UI, pure CPU, deterministic by seed.
 *  Its job is to let you WATCH how the bots actually behave over a real game (and
 *  surface where the policy can improve), not to assert anything — so it lives
 *  here as a script, not in the test suite.
 *
 *  Usage:
 *    npm run sim                                  # 4 overall-best bots, default seed
 *    npm run sim -- claude-v35 jane-v2 dumb dumb  # custom roster (2, 4, or 8 seats)
 *    npm run sim -- value-policy claude-v2 claude-v2 claude-v2  # full-capability learned-bot prototype
 *    npm run sim -- value-stub claude-v2 claude-v2 claude-v2    # minimal reactive prototype
 *    npm run sim -- --seed my-seed                # pick the RNG seed
 *    npm run sim -- --turns 4000                  # raise the safety cap
 *    npm run sim -- --log                         # stream the per-decision play-by-play
 *
 *  A seat is `dumb` (the reactive baseline), `value-policy` / `value-stub` (the
 *  learned-bot prototypes — `value-policy.ts` / `value-net-stub.ts`), or any
 *  version label in the archive (`bots/versions/index.ts`, e.g. `claude-v35`).
 */

interface Args {
  seed: string;
  /** Raw seat tokens in order: a version label, `dumb`, or `value-stub`. */
  seats: string[];
  maxTurns: number;
  log: boolean;
}

function parseArgs(argv: readonly string[]): Args {
  const seats: string[] = [];
  let seed = "table-1";
  let maxTurns = 2000;
  let log = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--seed") {
      if (i + 1 < argv.length) {
        seed = argv[i + 1];
        i += 1;
      }
    } else if (arg === "--turns") {
      if (i + 1 < argv.length) {
        const n = Number(argv[i + 1]);
        if (!Number.isNaN(n)) maxTurns = n;
        i += 1;
      }
    } else if (arg === "--log") {
      log = true;
    } else if (
      arg === "dumb" ||
      arg === VALUE_STUB_TOKEN ||
      arg === VALUE_POLICY_TOKEN ||
      arg === TOKEN_STUB_TOKEN ||
      arg.startsWith(RL_NET_PREFIX) ||
      arg in VERSIONS
    ) {
      seats.push(arg);
    } else {
      throw new Error(
        `unknown argument "${arg}" (expected dumb, ${VALUE_STUB_TOKEN}, ` +
          `${VALUE_POLICY_TOKEN}, ${TOKEN_STUB_TOKEN}, ${RL_NET_PREFIX}<dir>, a ` +
          `version label like claude-v35, or --seed | --turns | --log)`,
      );
    }
  }

  return {
    seed,
    seats:
      seats.length > 0
        ? seats
        : [
            DEFAULT_BOT_VERSION,
            DEFAULT_BOT_VERSION,
            DEFAULT_BOT_VERSION,
            DEFAULT_BOT_VERSION,
          ],
    maxTurns,
    log,
  };
}

/** Resolve a seat token to a `Contender`. The registry handles `dumb` + version
 *  labels; `value-stub` resolves to the prototype `Bot` directly (it isn't a
 *  registry strategy). */
function toContender(token: string): Contender {
  if (token === VALUE_STUB_TOKEN) return { label: VALUE_STUB_TOKEN, bot: valueNetStubBot };
  if (token === VALUE_POLICY_TOKEN) {
    return { label: VALUE_POLICY_TOKEN, bot: valuePolicyStubBot };
  }
  if (token === TOKEN_STUB_TOKEN) return { label: TOKEN_STUB_TOKEN, bot: tokenStubBot };
  return { label: token, bot: botFor(token) };
}

/** Resolve a seat token, loading a learned-bot checkpoint for `rl-net:<dir>`. The
 *  net + MCTS (and the heavy tfjs-node runtime) are imported LAZILY here, so a
 *  normal sim never pays for tfjs. */
async function toContenderAsync(token: string): Promise<Contender> {
  if (!token.startsWith(RL_NET_PREFIX)) return toContender(token);
  const dir = token.slice(RL_NET_PREFIX.length);
  // tfjs-node's node-pre-gyp parses process.argv at import (nopt abbreviation-
  // matches our flags, e.g. --turns); args are already parsed, so shield them.
  process.argv = process.argv.slice(0, 2);
  const [{ MonoNet }, { mctsBot }] = await Promise.all([import("../rl/net"), import("../rl/mcts")]);
  const net = await MonoNet.load(dir);
  return { label: token, bot: mctsBot(net) };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const count = args.seats.length;
  if (count !== 2 && count !== 4 && count !== 8) {
    console.error(
      `Need 2, 4, or 8 seats (got ${count}). ` +
        `Example: npm run sim -- claude-v2 claude-v2 claude-v2 claude-v2`,
    );
    process.exit(1);
  }

  console.log("\nMonopoly — headless bot self-play");
  console.log(
    `Seats: ${args.seats.join(", ")}   ` +
      `Seed: "${args.seed}"   Max turns: ${args.maxTurns}\n`,
  );

  // Always seat via the `Contender` path so a registry strategy and the
  // value-stub prototype share one code path.
  const opts: SimOptions = {
    seed: args.seed,
    seats: await Promise.all(args.seats.map(toContenderAsync)),
    maxTurns: args.maxTurns,
    includeLog: args.log,
  };
  const result = simulateGame(opts);

  if (args.log) {
    const names = new Map(result.standings.map((s) => [s.id, s.name]));
    const nameOf = (id: string | null): string =>
      id === null ? "the bank" : (names.get(id) ?? id);
    for (const h of result.highlights) console.log(renderHighlight(h, nameOf));
    console.log("");
  }

  console.log(formatResult(result));
  console.log("");
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
