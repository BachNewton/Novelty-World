import process from "node:process";
import { WorkerPool } from "@/shared/lib/bot-lab/pool";
import { checkBots, commonDefaults, commonFlag, list, number } from "./cli-args";
import { addSums, OPPONENT_MODELS, type OpponentResult, type OpponentSpec, type Sums } from "./opponent-model";

/** `npm run risk:opponents` — how right an opponent model is (`opponent-model.ts`).
 *
 *  Plays games and scores each model's beliefs about every opponent's turn against what the
 *  turn did: the aim (the chance the turn takes a territory of mine) against an even split
 *  among the opponent's neighbours, the cost it prices against the cost the turn caused,
 *  whom each opponent kills, and my chance of being killed before my next turn.
 *
 *  Usage:
 *    npm run risk:opponents -- --field rule-v3                       # every seat v3
 *    npm run risk:opponents -- --field rule-v3,rule-v2,rule-v2       # seat i of game g plays field[(g + i) mod 3]
 *    npm run risk:opponents -- --field rule-v3 --players 3 --games 400 --models v3,v4
 *
 *  Seat i of game g plays `field[(g + i) mod |field|]`, so a field of one is a table of copies
 *  and a mixed field rotates every bot through every seat. */

interface Args {
  field: string[];
  models: string[];
  games: number;
  common: ReturnType<typeof commonDefaults>;
}

function parseArgs(argv: readonly string[]): Args {
  const a: Args = { field: [], models: Object.keys(OPPONENT_MODELS), games: 200, common: commonDefaults("opp") };
  for (let i = 0; i < argv.length; i++) {
    const used = commonFlag(a.common, argv, i);
    if (used > 0) {
      i += used - 1;
      continue;
    }
    const arg = argv[i];
    if (arg === "--field") a.field = list(argv[++i], arg);
    else if (arg === "--models") a.models = list(argv[++i], arg);
    else if (arg === "--games") a.games = number(argv[++i], arg);
    else throw new Error(`unknown argument "${arg}"`);
  }
  if (a.field.length === 0) throw new Error("name the bots with --field. Example: npm run risk:opponents -- --field rule-v3");
  checkBots(a.field);
  for (const m of a.models) {
    if (!Object.hasOwn(OPPONENT_MODELS, m)) throw new Error(`no opponent model "${m}" (known: ${Object.keys(OPPONENT_MODELS).join(", ")})`);
  }
  return a;
}

const CASES = ["all", "leader", "ally", "share", "apart"] as const;

/** The sums under `prefix` (a model and table) whose key, after the opponent's label, starts
 *  with `rest`: over every opponent, or only `label`. */
function over(sums: Sums, prefix: string, rest: string, label?: string): Sums {
  const out = zeros();
  for (const [k, v] of Object.entries(sums)) {
    if (!k.startsWith(prefix)) continue;
    const parts = k.slice(prefix.length).split("|");
    if (label !== undefined && parts[0] !== label) continue;
    const tail = parts.slice(1).join("|");
    if (!tail.startsWith(`${rest}|`)) continue;
    const stat = tail.slice(rest.length + 1);
    out[stat] = (out[stat] ?? 0) + v;
  }
  return out;
}

/** Every statistic a row may lack, at 0. */
function zeros(): Sums {
  const out: Sums = {};
  for (const k of ["n", "takingN", "gone", "unseen", "obs", "err", "pred"]) out[k] = 0;
  return out;
}

const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
const f2 = (x: number) => x.toFixed(2);

function correlation(s: Sums): number {
  const n = s.n;
  const cov = s.predCost / n - (s.pred / n) * (s.cost / n);
  const vp = s.pred2 / n - (s.pred / n) ** 2;
  const vc = s.cost2 / n - (s.cost / n) ** 2;
  return vp > 0 && vc > 0 ? cov / Math.sqrt(vp * vc) : 0;
}

function report(sums: Sums, args: Args): string {
  const out: string[] = [];
  for (const players of args.common.players) {
    for (const model of args.models) {
      const prefix = `${model}|${players.toString()}p|`;
      out.push(`\n== model ${model}, ${players.toString()} players ==`);
      out.push("aim: how likely an opponent's turn goes against me, against the share of its captures taken from me (turns with a capture),");
      out.push("     and against whether it took any territory of mine; skill is against v1's even split among its neighbours");
      out.push("  case    captures  aim   share  sq.err  even  skill |  turns   took any");
      for (const c of CASES) {
        const s = over(sums, prefix, c);
        if (!s.n) continue;
        const t = s.takingN;
        const skill = t > 0 ? 1 - s.shareErr / s.evenShareErr : 0;
        out.push(
          `  ${c.padEnd(7)} ${t.toString().padStart(7)}  ${pct(t ? s.takingAim / t : 0).padStart(6)} ${pct(t ? s.share / t : 0).padStart(6)}  ${(t ? s.shareErr / t : 0).toFixed(3)}  ${(t ? s.evenShareErr / t : 0).toFixed(3)}  ${skill >= 0 ? "+" : ""}${f2(skill)} | ${s.n.toString().padStart(6)}  ${pct(s.hit / s.n).padStart(6)}`,
        );
      }
      const all = over(sums, prefix, "all");
      if (all.n) {
        out.push(
          `loss: priced ${f2(all.pred / all.n)} a turn, caused ${f2(all.cost / all.n)} (caused/priced ${f2(all.cost / all.pred)}), r = ${f2(correlation(all))}, ` +
            `MSE ${f2(all.lossErr / all.n)} (even split's ${f2(all.evenLossErr / all.n)})`,
        );
      }
      const kill = over(sums, prefix, "kill");
      if (kill.n) {
        out.push(
          `kills: ${kill.n.toString()} predicted victims, believed ${pct(kill.pred / kill.n)}, taken ${pct(kill.obs / kill.n)}, Brier ${(kill.err / kill.n).toFixed(4)}; ` +
            `${kill.gone.toString()} victims already dead by its turn, ${kill.unseen.toString()} kills of an unpredicted victim`,
        );
      }
      const ex = zeros();
      for (const [k, v] of Object.entries(sums)) if (k.startsWith(`${prefix}exposure|`)) ex[k.slice(`${prefix}exposure|`.length)] = v;
      if (ex.n) out.push(`my kill exposure: believed ${pct(ex.pred / ex.n)}, killed ${pct(ex.obs / ex.n)}, Brier ${(ex.err / ex.n).toFixed(4)}`);
      const labels = [...new Set(args.field)];
      if (labels.length > 1) {
        out.push("by opponent:     captures   aim   share  skill  priced  caused");
        for (const l of labels) {
          const s = over(sums, prefix, "all", l);
          if (!s.n) continue;
          const t = s.takingN;
          if (t === 0) continue;
          out.push(
            `  ${l.padEnd(15)} ${t.toString().padStart(6)}  ${pct(s.takingAim / t).padStart(6)} ${pct(s.share / t).padStart(6)}  ${f2(1 - s.shareErr / s.evenShareErr).padStart(5)}  ${f2(s.pred / s.n).padStart(6)}  ${f2(s.cost / s.n).padStart(6)}`,
          );
        }
      }
      const bins: string[] = [];
      for (let b = 0; b < 10; b++) {
        const s = over(sums, prefix, `bin${b.toString()}`);
        if (s.n) bins.push(`${pct(s.aim / s.n)}→${pct(s.hit / s.n)} (${s.n.toString()})`);
      }
      if (bins.length > 0) out.push(`share-case reliability, aim → share: ${bins.join(", ")}`);
      for (const who of ["", "me"]) {
        const kbins: string[] = [];
        for (let b = 0; b < 10; b++) {
          const s = over(sums, prefix, `kbin${b.toString()}${who}`);
          if (s.n) kbins.push(`${pct(s.aim / s.n)}→${pct(s.hit / s.n)} (${s.n.toString()})`);
        }
        if (kbins.length > 0) out.push(`kill reliability, ${who === "me" ? "me the victim" : "a third player the victim"}, belief → taken: ${kbins.join(", ")}`);
      }
    }
  }
  return out.join("\n");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const specs: OpponentSpec[] = [];
  for (const players of args.common.players) {
    for (let g = 0; g < args.games; g++) {
      specs.push({
        index: specs.length,
        seed: `${args.common.prefix}-${players.toString()}-${(g + 1).toString()}`,
        labels: Array.from({ length: players }, (_, i) => args.field[(g + i) % args.field.length]),
        models: args.models,
        maxTurns: args.common.maxTurns,
      });
    }
  }
  console.log(
    `\nRisk — opponent models [${args.models.join(", ")}] over ${specs.length.toString()} games, field [${args.field.join(", ")}], ` +
      `${args.common.players.join("/")} players, seeds "${args.common.prefix}-*"`,
  );
  const started = Date.now();
  const pool = new WorkerPool<OpponentSpec, OpponentResult>(new URL("./opponent-model-worker.ts", import.meta.url), args.common.workers);
  try {
    const results = await pool.run(specs);
    const sums: Sums = {};
    let errors = 0;
    for (const r of results) {
      if (r.error !== undefined) {
        errors++;
        console.error(`game ${r.index.toString()}: ${r.error}`);
      } else addSums(sums, r.sums);
    }
    console.log(report(sums, args));
    console.log(`\n${((Date.now() - started) / 1000).toFixed(0)}s, ${errors.toString()} errors`);
    if (errors > 0) process.exitCode = 1;
  } finally {
    await pool.close();
  }
}

main().catch((e: unknown) => {
  console.error((e as Error).message);
  process.exit(1);
});
