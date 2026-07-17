import os from "node:os";
import { Worker } from "node:worker_threads";
import { packParams, type ParamVector } from "./params";
import {
  CANDIDATE,
  type OptBatchMessage,
  type OptGameResult,
  type OptGameSpec,
} from "./protocol";

// ---------------------------------------------------------------------------
// The ES FITNESS HARNESS: candidate win-share vs the ANCHOR PANEL, over a fixed
// TRAIN seed set, on the parallel worker pool.
//
// Fitness = (candidate wins) / (decisive games), with 2 candidate seats and 2
// panel-opponent seats per game (mirroring the gauntlet/tournament metric). The
// panel opponents and seatings are a FIXED function of the seed list, so every
// candidate in a generation plays the EXACT same games (common random numbers) —
// the variance-reduction that lets the ES rank candidates on a few hundred games.
//
// NON-TRANSITIVITY GUARD (METHOD.md "the jane-v3 RPS cycle"): the opponent
// field is the diverse RATING_PANEL, not a single opponent — so the ES optimizes
// general strength, not a counter to one bot. The frozen winner is then validated
// by the real crown gauntlet (`--panel`, both streams).
// ---------------------------------------------------------------------------

function defaultWorkerCount(): number {
  return Math.max(1, os.cpus().length - 2);
}

/** Build the FIXED game stream for one fitness evaluation: `gamesPerEval` games,
 *  each a 2-candidate / 2-panel seating. The candidate seats and the panel pair
 *  cycle deterministically so the candidate is spread evenly over seats and faces
 *  every panel member; the seed is `${prefix}-${k+1}`. The same stream is replayed
 *  for every candidate (CRN). */
export function buildEvalSpecs(
  panel: readonly string[],
  prefix: string,
  gamesPerEval: number,
  maxTurns: number,
): OptGameSpec[] {
  // The six distinct ways to seat 2 candidate seats among 4 (same as tournament).
  const candSeatings: readonly (readonly number[])[] = [
    [0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3],
  ];
  // All ordered panel pairs (the two opponent seats), spanning the panel evenly.
  const panelPairs: [string, string][] = [];
  for (let i = 0; i < panel.length; i++) {
    for (let j = 0; j < panel.length; j++) {
      if (i !== j) panelPairs.push([panel[i], panel[j]]);
    }
  }
  const specs: OptGameSpec[] = [];
  for (let k = 0; k < gamesPerEval; k++) {
    const candSet = new Set(candSeatings[k % candSeatings.length]);
    const [pa, pb] = panelPairs[k % panelPairs.length];
    const panelSeats = [pa, pb];
    let pi = 0;
    const seats = [0, 1, 2, 3].map((s) => (candSet.has(s) ? CANDIDATE : panelSeats[pi++]));
    specs.push({ index: k, seed: `${prefix}-${(k + 1).toString()}`, seats, maxTurns });
  }
  return specs;
}

/** Build a PER-MEMBER eval stream: for each panel member, a `gamesPerMember`-game
 *  stream of 2-candidate / 2-MEMBER seatings — the candidate facing TWO seats of
 *  the SAME member, exactly the crown-gauntlet pairing shape (`parallel.ts`
 *  `pairingSpecs`: 2 of A among 4, cycling the six `A_SEATINGS`). This is what the
 *  `maximin` fitness scores: the candidate's win-share vs each single member,
 *  MINIMISED over members — so the ES fights its hardest matchup, mirroring the
 *  crown's per-member no-regression gate (which the AGGREGATE stream, a mixed
 *  two-member field, does not). Each member's stream is seed-namespaced
 *  (`${prefix}:${member}-${k+1}`) so it's distinct per member but the SAME games
 *  for every candidate (CRN). */
export function buildPerMemberEvalSpecs(
  panel: readonly string[],
  prefix: string,
  gamesPerMember: number,
  maxTurns: number,
): { member: string; specs: OptGameSpec[] }[] {
  // The six distinct ways to seat the 2 candidate seats among 4 (the member takes
  // the other two) — identical to `parallel.ts` A_SEATINGS, so the pairing shape
  // matches the gauntlet exactly.
  const candSeatings: readonly (readonly number[])[] = [
    [0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3],
  ];
  return panel.map((member) => {
    const specs: OptGameSpec[] = [];
    for (let k = 0; k < gamesPerMember; k++) {
      const candSet = new Set(candSeatings[k % candSeatings.length]);
      const seats = [0, 1, 2, 3].map((s) => (candSet.has(s) ? CANDIDATE : member));
      specs.push({ index: k, seed: `${prefix}:${member}-${(k + 1).toString()}`, seats, maxTurns });
    }
    return { member, specs };
  });
}

/** A reusable pool that evaluates a candidate VECTOR against a fixed spec stream
 *  and returns its win-share. Spawn once, call `evaluate` per candidate, `close`
 *  at the end (keeps the workers and their imported engine warm). */
export class FitnessPool {
  private readonly workers: Worker[];
  readonly size: number;

  constructor(size: number = defaultWorkerCount()) {
    this.size = Math.max(1, size);
    this.workers = Array.from(
      { length: this.size },
      () => new Worker(new URL("./worker.ts", import.meta.url)),
    );
  }

  /** Play `specs` for `vector` across the pool; resolve with the raw results. */
  private runSpecs(vector: number[], specs: readonly OptGameSpec[]): Promise<OptGameResult[]> {
    if (specs.length === 0) return Promise.resolve([]);
    const chunksPerWorker = 4;
    const chunkSize = Math.max(1, Math.ceil(specs.length / (this.size * chunksPerWorker)));
    const chunks: OptGameSpec[][] = [];
    for (let i = 0; i < specs.length; i += chunkSize) chunks.push(specs.slice(i, i + chunkSize));

    const out: OptGameResult[] = [];
    let nextChunk = 0;
    let active = 0;
    return new Promise<OptGameResult[]>((resolve, reject) => {
      const assign = (w: Worker): void => {
        if (nextChunk >= chunks.length) return;
        const chunk = chunks[nextChunk++];
        active++;
        const onMessage = (m: { results: OptGameResult[] }): void => {
          w.off("message", onMessage);
          w.off("error", onError);
          out.push(...m.results);
          active--;
          if (nextChunk < chunks.length) assign(w);
          else if (active === 0) resolve(out);
        };
        const onError = (err: Error): void => {
          w.off("message", onMessage);
          w.off("error", onError);
          reject(err);
        };
        w.on("message", onMessage);
        w.on("error", onError);
        const msg: OptBatchMessage = { vector, specs: chunk };
        w.postMessage(msg);
      };
      for (const w of this.workers) assign(w);
    });
  }

  /** Candidate win-share over the spec stream: wins / decisive. A run with no
   *  decisive games scores 0 (a candidate that can't close out is no good). */
  async evaluate(params: ParamVector, specs: readonly OptGameSpec[]): Promise<EvalOutcome> {
    const results = await this.runSpecs(packParams(params), specs);
    let wins = 0;
    let panelWins = 0;
    let draws = 0;
    let errors = 0;
    for (const r of results) {
      if (r.error !== undefined) errors++;
      else if (r.candidateWon) wins++;
      else if (r.panelWon) panelWins++;
      else draws++;
    }
    const decisive = wins + panelWins;
    return {
      winShare: decisive === 0 ? 0 : wins / decisive,
      wins,
      panelWins,
      draws,
      errors,
      decisive,
      games: results.length,
    };
  }

  /** MAXIMIN fitness: evaluate the candidate vs EACH panel member separately (the
   *  per-member 2v2 streams from `buildPerMemberEvalSpecs`) and return the MINIMUM
   *  win-share across members — the candidate's worst single matchup. This is the
   *  crown-aligned objective: the crown requires beating the base with NO regression
   *  vs any member, so lifting the floor (the hardest matchup) is what the gate
   *  rewards, whereas the aggregate stream can be won by crushing weak members. The
   *  per-member breakdown rides along for the CLI to print. */
  async evaluateMaximin(
    params: ParamVector,
    perMember: readonly { member: string; specs: readonly OptGameSpec[] }[],
  ): Promise<MaximinOutcome> {
    const members: MemberOutcome[] = [];
    for (const { member, specs } of perMember) {
      const o = await this.evaluate(params, specs);
      members.push({ member, ...o });
    }
    const minWinShare = members.reduce((m, o) => Math.min(m, o.winShare), Infinity);
    const worst = members.reduce((w, o) => (o.winShare < w.winShare ? o : w), members[0]);
    return { fitness: minWinShare, worstMember: worst.member, members };
  }

  async close(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.terminate()));
  }
}

export interface EvalOutcome {
  /** Candidate's share of decisive games — the fitness. */
  winShare: number;
  wins: number;
  panelWins: number;
  draws: number;
  errors: number;
  decisive: number;
  games: number;
}

/** One member's leg of a maximin evaluation: its `EvalOutcome` plus the member. */
export interface MemberOutcome extends EvalOutcome {
  member: string;
}

export interface MaximinOutcome {
  /** The MINIMUM per-member win-share — the maximin fitness. */
  fitness: number;
  /** The member the candidate scored worst against (the binding matchup). */
  worstMember: string;
  /** Per-member breakdown, in panel order. */
  members: MemberOutcome[];
}
