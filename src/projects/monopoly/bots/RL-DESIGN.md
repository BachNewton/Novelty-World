# Learned Monopoly Bot — Design & Handoff

Read this before touching the `value-*`, `features`, `candidates`, or `trade-search`
modules, or starting any ML/training work. It is the **single source of truth for
the learned-bot effort** and is written so a fresh session with no prior context
can pick up the work. It captures the *why*, the architecture decision, what's
already built, and the exact next steps.

Companion docs: `monopoly/CLAUDE.md` ("Bots" — the `Bot` contract, registry,
pacer, engine entry points) and `bots/CLAUDE.md` (the rule-based `claude` policy
+ the Elo/SPRT measurement system). Read the "Bots" section of
`monopoly/CLAUDE.md` first if you haven't — it explains the engine seam every
learned bot plugs into.

---

## 1. Goal

A **machine-learned bot that can beat the strongest rule-based bots** (the
`claude-vN` / `jane-vN` / `gemini-vN` archive — 35+ SPRT-tuned generations), and
that is **fully capable**: nothing in its design structurally prevents it from
making any legal move needed to win. The ambition is self-play RL that *discovers*
strategy the hand-written heuristics never found.

"Fully capable" has a precise meaning in our design (see §4): the action
representation can express any legal move, the features contain the information
needed to value any position, and there's a training loop + a judge. If any of
those is missing, no amount of training reaches the bots.

### Decisions already locked (do not relitigate without reason)

- **All-TypeScript.** Rollouts run on the existing pure TS engine; the net trains
  + infers in TS (`tfjs-node-gpu` for the GPU step). Rationale: one language, no
  second copy of the engine, the model drops straight into the `Bot` contract.
  (Python/PyTorch for the *training step only*, with TS rollouts, is the fallback
  if `tfjs-node-gpu` proves flaky — but TS is the default.)
- **Target architecture: AlphaZero-style policy + value + MCTS** (see §3). The
  1-ply "value + search" agent already built (`value-policy.ts`) is a working
  scaffold, a bootstrap baseline, and proof the primitives compose — but its
  hand-written action generators are a capability ceiling, so the production
  learner moves to a learned policy + tree search.
- **The GPU trains the net; the environment (self-play rollouts) runs on CPU.**
  Standard RL split. Our pure, fast engine is ideal for CPU rollouts; the likely
  throughput bottleneck is rollouts, not the GPU.

---

## 2. What's already built (Phase 1 + the value+search agent)

All of these are **pure, deterministic, tested, lint-clean**. They are the reusable
substrate for the MCTS path — none of it is throwaway.

### How the existing work relates to the MCTS target (read this first)

The MCTS design is **not a separate track and not a redirection** — it's the
planned graduation, built in three layers:

- **Layer 1 — Foundation (reused unchanged):** the pure engine, `encode`
  (features), `applyCandidate` (transition/lookahead primitive), the Elo/SPRT
  judge. MCTS uses these as-is. Purely additive.
- **Layer 2 — The value+search agent (`value-net-stub`, `value-policy`,
  `trade-search`): a SCAFFOLD, not the final bot.** It proved the primitives
  compose and plays full legal games, and it becomes (a) the **bootstrap source**
  (warm-starts the net so training isn't random) and (b) the parts that get
  **reshaped** into the atomic action layer. `value-policy.ts`'s 1-ply
  `argmax`-over-candidates is *replaced* by MCTS; it is not the production
  policy.
- **Layer 3 — Policy + value + MCTS (net-new, on top):** the network (policy +
  value heads), the tree search, the self-play trainer.

So exactly **two things change** (everything else is reuse):
1. **Action layer:** whole-action enumeration (`legalCandidates` / `trade-search`)
   → a fixed **atomic token vocabulary + mask** (§3.1, §5 step 2).
2. **Move chooser:** 1-ply `argmax over candidates` → **MCTS** guided by a learned
   policy (§3.2).

| File | What it is | Status |
|---|---|---|
| `features.ts` | `encode(state, playerId): Float32Array` — fixed-width (`FEATURE_COUNT`), **seat-relative** (encoded player is always slot 0) state encoder; the model input. `FEATURE_NAMES` for debugging. | ✅ built/tested — **but pools opponents** (see §4.B; needs per-opponent ownership) |
| `candidates.ts` | `legalCandidates(state, pid): Candidate[]` (legal moves at the current decision) + `applyCandidate(state, op): GameState` (the transition / lookahead primitive). `CandidateOp` = `{kind:"intent",intent}` or `{kind:"step"}`. | ✅ reactive phases + **build commits** in `managing`; trade-building/raising-cash are terminal-only |
| `value-net-stub.ts` | `ValueFn = (state, pid) => number`; `heuristicValue` (hand value: cash + deeds + buildings + monopoly bonus + capitalized rent); `valueNetBot(value)` = the 1-ply argmax loop (`legalCandidates` → score by `value(applyCandidate(...))` → best); `valueNetStubBot`. | ✅ built/tested |
| `value-policy.ts` | `valuePolicyBot(value)` / `valuePolicyStubBot` — the **full-capability-so-far agent**: `valueNetBot` + opening intermissions (arm `trade` → drive `trade-search` → propose; arm `manage` → build). `developmentImproves` gates the build window by running the real generator on a hypothetical managing state. | ✅ built/tested |
| `trade-search.ts` | `bestTrade(state, pid, value)` — value-guided trade construction (mutual-completion swap / cash purchase; sweetener solved by binary search on the opponent's value; re-pitch guards). Same search the rule-based bots do, scored by any `ValueFn`. | ✅ built/tested (completion-buy side only) |
| `simulate-cli.ts` | `npm run sim -- value-policy claude-v2 claude-v2 claude-v2 [--log]` fields the prototypes via the `Contender` seats API (`value-policy` / `value-stub` tokens). | ✅ |

Tests: `features.test.ts`, `candidates.test.ts`, `value-net-stub.test.ts`,
`value-policy.test.ts` — all green.

**Known pre-existing failure (NOT ours):** `ratings.test.ts` fails because
`claude-v3..v36` lack Elo (needs `npm run sim:ratings`, part of the separate v36
workflow). Ignore it; it's unrelated to the learned-bot work.

### The hybrid loop, end to end (already working)

```
candidates = legalCandidates(state, me)         // the action surface
pick c maximizing value(applyCandidate(state,c)) // 1-ply lookahead
```
`valuePolicyBot(heuristicValue)` plays full legal games vs `claude-v2`, votes on
trades, constructs+proposes+executes its own completion trades, and develops
monopolies progressively. It **loses** to `claude-v2` — expected: the hand value
is weak (e.g. no rival-threat term). Strength is supposed to come from a trained
value/policy, not the stand-in.

### Reused engine helpers (all exported, pure)

`apply`, `autoStep` (the two engine entry points — both default RNG from
`state.rngState`), `isLegal`, `netWorth`, `firstNegativePlayer`,
`maxRaisableCash`, `projectTrade` (pure trade what-if → `{ownership,
jailFreeCards, cashById, feesById}`), `tradeParticipants`, `planDevelopment`
(pure build planner), `bankSupply`, `groupPositions`, `hasMonopoly`. The engine
is **pure with injected RNG** — the precondition for fast deterministic rollouts
and tree search.

---

## 3. Target architecture: policy + value + MCTS

The primitives we built (`encode` / `legalCandidates` / `applyCandidate` /
`value`) are exactly a search substrate:

- `legalCandidates` = **expand** a node's children
- `applyCandidate` = **transition**
- `encode` + net = **leaf evaluation** (and policy prior)

1-ply is just depth-1. The production learner uses MCTS over the same calls.

### 3.1 Factored action encoding (the crux)

**Do not try to emit whole trades/builds as one action** — that space is
unbounded. Instead: a **fixed atomic action vocabulary**, legality-masked, one
token per decision point. Complex actions emerge as *sequences* of atomic tokens
across the engine's existing multi-step intermissions (arm → edit draft →
propose). The engine already atomizes actions; we lean on that as the
"autoregression," so the net needs no recurrent decoder.

Vocabulary (≈250–300 fixed slots, mostly board-position-indexed like chess
from×to):

```
ROLL · BUY · DECLINE · RAISE_TO_BUY · END_TURN
BID_PASS · BID[k]            (k≈4 buckets incl. an indifference-price bucket)
JAIL_PAY · JAIL_CARD
ACCEPT_TRADE · DECLINE_TRADE
ARM_TRADE · ARM_MANAGE
MORTGAGE[pos] · UNMORTGAGE[pos]   (28 each)
BUILD[pos] · SELL[pos]            (28 each — one even tier, masked)
PICK_COUNTERPARTY[seat]
ASSIGN_PROP[pos]                  (toggle a lot to the counterparty; 2-party first)
TRADE_CASH[bucket]
PROPOSE · CANCEL
```

- Fixed-width vocabulary ⇒ fixed-size policy head (trainable). Richness is in
  token *sequences*, each intermediate a real encodable engine state.
- A trade: `ARM_TRADE → PICK_COUNTERPARTY → ASSIGN_PROP… → TRADE_CASH → PROPOSE`.
  Each `ASSIGN_PROP`/`TRADE_CASH` maps to an `update-trade-draft` snapshot. This is
  **uncapped** — any draft reachable by toggles is reachable.
- Start **2-party** trades; N-party is `ASSIGN_PROP[pos][seat]` later.

### 3.2 MCTS over the primitives

```
select : descend by PUCT(P=policy prior, Q=mean value, U=exploration)
expand : leaf → ONE batched net forward → (masked policy logits, value vector)
         transition via applyCandidate(state, intentFor(token))
chance : token==ROLL (dice/card) → CHANCE node: autoStep(state, rngSeededFromNode)
         sample; MCTS averages over simulations. NO engine change.
backup : propagate value per node's acting player (N-player credit)
play   : most-visited root action; policy target = visit dist; value target = outcome
```

**Determinism (non-negotiable):** seed the search's internal RNG from
`state.rngState` so the *played* move is a deterministic function of (state, net,
seed) — preserves replay and lets the bot stay a pure `Bot`.

### 3.3 The network

- Input: `encode(state, me)` (seat-relative, **after** the per-opponent fix).
- Trunk: MLP / small ResNet.
- **Policy head**: logits over the fixed vocabulary (~300), legality-masked.
- **Value head**: a **win-probability vector over seat-relative players**
  (length `MAX_SEATS`, softmax) — handles N-player credit, not just 2-player
  zero-sum. Backup uses each node's acting-player component.
- Played greedily (argmax visits) at inference ⇒ deterministic; drops into the
  `Bot` contract unchanged. Stochastic exploration is **offline (training) only**.

### 3.4 Self-play training loop

1. **Rollouts (CPU)** via `parallel.ts`: each move chosen by MCTS-with-net;
   record `(encode(state), visit distribution, acting seat)`.
2. **Label** every recorded state at game end with the outcome → value target.
3. **Train (GPU)**: policy → cross-entropy to visit distributions; value →
   cross-entropy to outcomes (`tfjs-node-gpu`).
4. **Iterate**: new net → more self-play → retrain (policy iteration).
5. **Bootstrap**: warm-start on rule-bot games (states→outcomes for value,
   rule-bot moves→policy) so gen-0 isn't random — this is what makes "enough
   time" sane against 35-gen bots.
6. **Gate** each generation through the existing **Elo/SPRT gauntlet** vs the
   rule-bot field — that's how you *know* it crossed the bar.

---

## 4. Capability checklist — what "fully capable" requires

In value+search the **generators are the hard ceiling** (the agent can only play
what some generator emits). The atomic vocabulary (§3.1) is what removes that
ceiling — but until the net+MCTS exist, the value+search agent's generators still
define what it can do. Either way, these gaps must close:

### A. Action coverage (the capability cap)
- ✅ Reactive (buy/decline, jail, trade votes, must-raise liquidation)
- ✅ Development (build commits, even tiers)
- ✅ Trade construction — **completion-buy side only**
- ⬜ **Sell-side / premium trades** (sell a spare/completer to a one-short rival)
- ⬜ **General value-improving exchanges** (property-for-property + cash, all opponents)
- ⬜ **Raise-to-buy** (mortgage other lots to afford a buy; the `raising-cash` phase)
- ⬜ **Auction willingness-to-pay** (currently drops out — 1-ply is blind to
  deferred payment; fix = evaluate `V(own-at-price)` vs `V(not-own)` and bid to
  the indifference price)
- ⬜ **Full managing ops**: voluntary mortgage/unmortgage/sell, mortgage-to-fund a
  build, unmortgage-and-redeploy idle capital

### B. Feature sufficiency
- ⬜ **Per-opponent ownership** in `encode`: each square's owner as a seat-relative
  one-hot (me, opp1, opp2, …, unowned), NOT the current pooled mine/opp. Pooling
  erases which opponent holds what — needed to value threats and target trades.
- Optional/minor: GOJF holdings, doubles streak. (Outcome-based search means you
  do NOT need to encode in-flight auctions/trade drafts — you evaluate resulting
  boards.)

### C. The net + training stack (all new)
- ⬜ Network (policy+value heads), **batched inference** (search calls the net
  thousands of times/decision — must batch encoded candidate states into one
  forward pass or it's too slow)
- ⬜ Self-play recorder + GPU trainer
- ⬜ Bootstrap pipeline (imitate/regress rule-bot games)

### D. The judge (mostly exists)
- ✅ Elo ladder (`sim:ratings`) + SPRT gauntlet — policy-agnostic
- ⬜ Minor wiring to field the learned bot as a `Contender` in the gauntlet/ratings

---

## 5. START HERE — next concrete steps, in order

The foundation both the net and MCTS build on is the **atomic action layer**. Do
this before any ML.

1. **Per-opponent ownership in `features.ts`** (§4.B). Small, isolated, and every
   downstream net depends on it. Update `features.test.ts`.
2. **Atomic action vocabulary + `legalActions(state, pid)`** — extend/refactor
   `candidates.ts` from whole-action enumeration to the fixed atomic vocabulary
   (§3.1) + a boolean legality mask + a `token → CandidateOp` mapping (incl.
   draft-toggle → `update-trade-draft` snapshot). This subsumes the current
   `legalCandidates`; keep `applyCandidate` as-is. Test: every unmasked token is
   legal across a driven game; the vocabulary is fixed-width.
3. **A token-driven `Bot`** that plays via the atomic vocabulary (greedy over a
   value, reusing `heuristicValue`) — proves the atomic layer end-to-end before
   the net exists, same way `value-policy.ts` proved the whole-action layer.
4. **The net** (policy+value heads) + **batched inference** over `encode`.
5. **MCTS** (§3.2) over `applyCandidate` + seeded chance sampling.
6. **Self-play recorder + GPU trainer** (§3.4) + **bootstrap**.
7. **Judge wiring** (field the learned bot as a `Contender`).

While building the atomic layer you can also close the §4.A action gaps
(raise-to-buy, auction willingness, full managing ops, sell-side trades) — they
become atomic tokens rather than whole-action generators, so do them *as* tokens
in step 2 rather than extending the whole-action generators separately.

---

## 6. Invariants & gotchas (read before coding)

- **Purity / determinism is sacred.** No `Math.random`, no `Date`. All randomness
  flows through `state.rngState` (injected). The bot's played move must be a
  deterministic function of state (+ net + a state-seeded search RNG). This is
  what keeps replay/regression tests valid and self-play reproducible.
- **A bot can be bad but never illegal/game-breaking.** The pacer substitutes a
  legal default for a null/illegal decision (`pacing.ts`). Still, emit legal
  moves — the headless sim's `applyOrThrow` throws on illegal.
- **Lint is zero-warning and strict.** Notable: `noUncheckedIndexedAccess` is OFF,
  so indexed access (`state.ownership[pos]`) is typed non-`undefined` — compare
  with **truthiness** (`if (!owner)`), never `=== undefined` (lint: "no overlap"),
  and don't `?? 0` a type that's already non-nullable unless the codebase already
  does (it does for `houses[pos]`). Run `npm run lint` + `npm run typecheck`.
- **The engine atomizes complex actions across decision points** — a trade is
  arm → `update-trade-draft`(×n) → `propose-trade` → opponents vote → execute; a
  build is arm → `manage` commit. The pacer (`pacing.ts`) drives a bot through
  these intermissions one decision at a time. The atomic vocabulary mirrors this.
- **N-player, one winner.** Value is a per-seat win-prob vector, not a 2-player
  scalar. Seat-relative encoding (slot 0 = me) keeps it symmetric.
- **`projectTrade` is the exact trade what-if** (matches real execution incl.
  mortgage interest) — use it for trade scoring, not a hand-rolled projection.
- **Bootstrapping matters.** From-scratch self-play vs 35-gen SPRT-tuned bots can
  be slow/unstable; warm-start from rule-bot games.
- **Capability ≠ guarantee.** Even fully capable, beating the bots via self-play
  is genuinely hard and uncertain — may need deeper search / more training. The
  design removes the *structural* caps; the rest is training reality.

### Commands
- Run a prototype game: `npm run sim -- value-policy claude-v2 claude-v2 claude-v2 [--log]`
- Typecheck / lint: `npm run typecheck` · `npm run lint`
- A test file: `npx vitest run src/projects/monopoly/bots/<file>.test.ts`
- Field the learned bot in the sim via the `Contender` seats API
  (`simulate.ts`) — it never needs a registry/route entry (it's not a fieldable
  online strategy until/unless you choose to add one).

---

## 7. Open decisions a future session may revisit

- **Atomic vs hybrid trade construction.** Atomic (token-by-token) is purest/uncapped
  but makes trade assembly many MCTS-searched steps (more compute). A hybrid keeps
  the bounded `trade-search.ts` *proposer* and uses MCTS/policy elsewhere — cheaper,
  slightly capped on trade creativity. Recommendation: start atomic; fall back to
  hybrid only if throughput hurts.
- **Search depth / budget.** Start shallow MCTS; increase simulations as the value
  matures.
- **tfjs-node-gpu vs Python training.** All-TS is the default; revisit only if GPU
  training maturity becomes a real blocker (TS rollouts + Python training is the
  hybrid).

---

## 8. STATUS — the learner was BUILT (branch `monopoly-rl-bot`)

The §5 roadmap was executed end-to-end as an all-TypeScript, CPU-trained learner
(Kyle's call: full capability, "turn it on and walk away"). Each phase is runnable,
tested (vitest), typecheck-clean, and lint-clean. The pieces:

| Phase | Module(s) | What it is |
|---|---|---|
| 1 | `features.ts` | Per-opponent ownership: a seat-relative owner one-hot per square (replaces the pooled mine/opp bit). |
| 2 | `actions.ts` | The **atomic action vocabulary** + `legalActions`/`legalMask`: a fixed token set (ROLL/BUY/bid buckets/jail/votes/arm, build-to-level, per-lot mortgage/unmortgage, per-lot/seat trade ASSIGN, cash buckets, propose). Mask sound by construction (`isLegal === apply().ok`). Full capability — proven by a complete atomic trade assembly in `actions.test.ts`. |
| 3 | `token-bot.ts` | Greedy-over-`heuristicValue` bot on the atomic layer (sim token `token-stub`) — the wiring proof. |
| 4 | `net.ts` | `MonoNet`: tfjs-node MLP → softmax policy head (vocabulary) + softmax value head (`MAX_SEATS` seat-relative win-probs). Batched `predict`, `train`, disk save/load, `maskPolicy`. |
| 5 | `mcts.ts` | PUCT MCTS over `applyCandidate`; deterministic intent edges (cached) + chance ROLL edges that reseed dice per visit; N-player backup in an absolute frame. Pure in (state, net) → replay-safe `mctsBot`. |
| 6 | `selfplay.ts`, `train-cli.ts` | Self-play recorder (visit-distribution policy targets, seat-relative outcome value targets) + value bootstrap on rule-bot games + the **`npm run train:rl`** loop: self-play → train → checkpoint → eval, resumable, Ctrl-C-safe. |
| 7 | `simulate-cli.ts` | Field a checkpoint via the `rl-net:<dir>` sim token (lazy tfjs load). `train:rl` also self-evaluates vs a rule bot each cycle. |

**Stack / how to run.** All-TS on tfjs-node (CPU). The worktree pins **Node 22**
(`.node-version`) because tfjs-node 4.22 calls `util.isNullOrUndefined`, removed in
Node 23+. `scripts/fix-tfjs-windows.mjs` (postinstall) + `tfjs-setup.ts` place the
Windows `tensorflow.dll` next to the native binding and shield `process.argv` from
node-pre-gyp's nopt. Run: `npm run train:rl -- --dir rl-checkpoints/run1`. Resume by
re-running the same `--dir`. The eGPU (RTX 4070) is an OPTIONAL later accelerator
(`tfjs-node-gpu`) — CPU self-play is the bottleneck, not the net.

**What remains / known limits (honest):**
- **Throughput is the lever.** Correctness-first MCTS: one net eval per expansion
  (not batched across the tree) and `legalActions` recomputed per node (~hundreds
  of `apply`s). Batching leaf evals + memoizing the mask is the biggest speedup, and
  self-play speed is what gates "enough time to beat the bots."
- **Bootstrap is VALUE-only.** Rule-bot outcomes warm-start the value head; policy
  starts uniform-legal (rule-bot whole-actions don't map 1:1 to atomic tokens).
  Policy imitation is a future add.
- **Self-play models on-turn decisions only** (off-turn trade arming isn't explored
  in self-play, though the bot CAN arm on its own turn and the capability exists).
- **Gauntlet/ratings fielding** (a frozen `Contender`) isn't wired — the net is a
  live checkpoint, not a frozen version. `rl-net:<dir>` in `npm run sim` +
  `train:rl`'s built-in win-rate eval are the judges for now.
- **Capability ≠ a win.** Beating the SPRT-tuned archive via self-play is the
  genuinely uncertain part; the wiring is complete and fully capable, the rest is
  training reality (and throughput).
