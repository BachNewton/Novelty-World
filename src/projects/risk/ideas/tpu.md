# TPUs for the learned bot

An idea being tried: the probe has measured what a TPU session is worth ("The probe's result"), and the first direction, the network trained on the TPU from games played elsewhere, is built and trusted after its first session ("The network on the TPU"). The second, the whole loop on the TPU, is being built: the engine first ("The engine on the TPU"). It records a question raised while setting up training on Kaggle's free GPUs (`docs/kaggle.md`): could Kaggle's free TPUs help the learned bot toward its goal, and if so, how?

## The goal it would serve

A bot that has mastered Risk and beats any human player (`learned-bot.md`, its brief). What the bot needs from any training hardware is to learn the game's real rules and odds and to play legally. Bit-for-bit agreement between a training engine and the reference engine is one way to prove the rules are right, not a requirement in itself.

**The owner's ruling: a TPU engine need not match the reference engine move for move.** No shared random stream, no bit-identical hashes. What it must do is play legal Risk, and what it trains must be playable by people, which it is by construction: a trained net is exported and plays on the reference engine, where every move is validated, so nothing a training engine gets wrong can reach a real game as an illegal move. Float differences and a different random generator average out over games. What does not average out is a rule or an odds table that is wrong the same way every time: a net trained on it learns a slightly different game and plays the real one worse. So a TPU engine is checked for that and nothing more:

- **The rules, with the dice taken out.** Both engines are given the same position, the same move and the same dice, and must reach the same position; every move one accepts the other accepts. This is a test of rules, deterministic and cheap, not a test of the random stream.
- **The odds, as distributions.** Its dice and its blitz outcomes are sampled and compared with the reference's tables within sampling error.
- **The harness is the backstop.** A net trained there is measured on the reference engine like any other; a training engine that taught the wrong game shows as strength lost there.

## What a TPU is, and what Kaggle offers

A TPU is Google's chip for neural-network work: very fast at large batched matrix multiplication. It is programmed through the XLA compiler, usually from JAX (PyTorch can target it through torch_xla). XLA compiles a fixed computation, so shapes are known ahead of time, and the chips compute natively in 32-bit types; 64-bit integers are emulated.

Kaggle's accelerator list includes TPU v5e-8 and v6e-8 (`TpuV5E8`, `TpuV6E8` to the CLI). Reports put TPU sessions at up to 9 hours. The TPU quota is separate from the GPU quota: 20 hours a week, refreshed with it, which `kaggle quota` shows.

## What the code looks like today

- The GPU engine (`gpu/`) is PyTorch, batched over thousands of games, and each step is captured as one CUDA graph. Capture already demands fixed shapes and no round trips to the CPU, which is also what XLA demands, so the engine is written in the style a TPU port would need.
- The engine uses 64-bit integers in many places (its random stream among them), kept so its games match the reference engine's move for move.
- The network is a small transformer (128 wide, 4 layers); PPO trains it on the GPU engine's games, with GD's ported personas in the league.

## Directions to explore

These are not exclusive, and others may turn up.

1. **The whole loop on the TPU.** Port the engine, the bots the league seats, the network and the trainer to JAX. Rules correctness could be checked against the reference engine by giving both engines the same dice and comparing positions, rather than by matching the random stream, which would free the TPU engine to use a 32-bit generator. Open: how much of the engine ports cleanly, how fast it runs there, and what checking it would take.
2. **The network on the TPU, the games elsewhere.** Games are played where they are cheap (GitHub Actions' CPUs, the native Rust engine, the GPU) and the network trains on the TPU from them. This fits loops that train a network on recorded choices: imitation, or expert iteration (a search guided by the current network plays the games, the network learns the search's choices, and the stronger network guides the next round's search, as in AlphaZero). Open: where the search's network calls run while the games are played, how data moves between the two sides, and whether the network is large enough for the TPU's speed to matter.
3. **Something else** a closer look turns up, such as running PyTorch through torch_xla before any port.

## The probe

A first ratio comes from one Kaggle session running `gpu/riskgpu/tpu/bench.py`, a JAX script that needs nothing but JAX, so it runs in Kaggle's TPU image as shipped. It measures two workloads, each on one chip and on every chip of the session, and prints one JSON document:

- **The network**: the learned bot's transformer re-expressed in JAX (its 49 tokens, the border bias, the same heads) at 128×4, 256×6, 384×8 and 512×12, with random weights and inputs of the real shapes. Its training step (a cross-entropy and value loss with an Adam update) and its inference (the forward pass and a masked choice, as a search spends its time) are each timed at several batches per chip, in bfloat16 and in full-precision float32.
- **An engine-shaped kernel**: not the engine, a proxy of one batched step (random draws, a legality mask from the borders, a blitz read from tables the size of the real ones by gather, the results written back by scatter), 64 steps in one scan, at 16,384 and 65,536 games a chip. Its variants price 64-bit work: the reference stream's generator in native 32-bit arithmetic, the same generator in emulated 64-bit integers as the GPU engine writes it, and that with the tables and draws in float64 as an exact port would keep them.

Its numbers are rates on a dedicated device, meant as ratios against the same script run elsewhere (a T4 under JAX's CUDA build, or a CPU), never against the PyTorch trainer's own rates. Compile time is reported apart from the steady-state rate, and each measurement says how many iterations it timed.

`gpu/riskgpu/tpu/launch.py` pushes it, run from `src/projects/risk/gpu/`: `push <name>` (with `--dry-run` to stage it and check the quota without pushing, `--accelerator` to choose the TPU, or a T4 for the GPU side of the ratio, and the probe's own arguments after `--`), then `status <name>` and `fetch <name>`, which brings the document into `runs/tpu/<name>/` and prints the rates. It prints the TPU quota before pushing and refuses a session longer than the hours left or than Kaggle's session limit. A session that finds no TPU fails at once instead of measuring the CPU, and `fetch` says that Kaggle ran it without its device.

**Kaggle has so far given this account no TPU through the API.** Every TPU push (script or notebook, TpuV5E8 or TpuV6E8, internet on or off, the image left unpinned as Kaggle's maintainers advise in Kaggle/kaggle-cli#1197, a notebook carrying the editor's own accelerator metadata) and an interactive session requested on the TPU machine shape started at once, without queueing, on a 4-core CPU machine in Kaggle's standard image (Python 3.13, no libtpu), and drew nothing from the TPU quota, which still reports the TPU as never used. A GPU push of the same check queues for a real T4, as the training sessions do. So the push is accepted and the accelerator silently dropped on Kaggle's side. What remains untried is the notebook editor itself: running a notebook once on TPU v5e-8 from Kaggle's web page, which the issue's reporter found does get a TPU, and then pushing again, in case the account needs a first TPU session from the editor. Until a push gets a TPU, the probe isn't worth another session.

## The probe's result: a TPU session is about 24 T4 sessions of network work

probe-3 ran on a real TPU once the account's identity was verified, after a day in Kaggle's queue: a TPU v5 lite, 8 chips of 16 GB, 224 host cores, 40 minutes of the quota. probe-t4 is the same script on a Kaggle T4 session (2 T4s), cut to the 128x4 net by the week's last GPU minutes. Rates are samples a second in bf16 at the best batch measured.

| Workload | One TPU chip | Eight chips | One T4 | Two T4s |
|---|---|---|---|---|
| 128x4 training | 37,300 | 297,300 | 6,860 | 12,500 |
| 128x4 inference | 114,900 | 919,100 | 21,300 | 37,500 |
| 256x6 training | 16,500 | 132,400 | not measured | |
| 256x6 inference | 52,600 | 420,500 | not measured | |
| 512x12 training | 4,900 | about 39,000 | not measured | |
| Engine-shaped step, game-steps | 403,000 | about 3.2 million | not measured | |

- **Chip for chip the TPU is 5.4 times a T4** on the current net, training and inference alike, and it scales across its eight chips without loss, where the T4 pair loses about 10%. **Session for session it is about 24 times.** The week's 20 TPU hours hold about 16 times the network work of the week's 30 GPU hours.
- **bf16 is what the TPU is fast at**: full precision trains the 128x4 net at 60% of the bf16 rate and the 512x12 net at 30%. A T4 gains nothing from bf16.
- **Memory bounds the batch** at 16 GB a chip: 16,384 a chip trains only the 128x4 net, and the larger nets stop at 1,024 to 4,096.
- **The engine-shaped kernel runs** at 403,000 game-steps a second a chip in 32-bit and 64-bit integers alike, and a quarter of that with 64-bit floats, so the engine's arithmetic is not what a port would lose on. No T4 figure exists for it yet, and a kernel is not the engine.
- **What it means for the plan.** Network work is where the TPU's advantage is measured, and the learned bot's next stage is network work on recorded choices: distilling a recorded search (`learned-bot.md`, stage 3) and imitation. That is direction 2 above, the network on the TPU and the games elsewhere, and it needs the net and the supervised trainer in JAX, not the engine. The larger nets the capacity gate asks for (256x6 and up) train on the TPU at rates a T4 can't reach. The recording itself is search rollouts, which are network inference fed by engine steps: it moves to the TPU only with the engine (direction 1), and that port is weighed after the first distillation shows what a recording is worth.

## The network on the TPU: built, its first session a check against a known answer

`gpu/riskgpu/tpu/` holds the network in JAX (`net.py`), checkpoint conversion both ways (`convert.py`), and a supervised trainer for what `imitate.py` and `distil.py` train (`train.py`), on every chip of the session in bf16. On b1-100's weights the JAX net's outputs sit within 8e-6 of PyTorch's with the same choice everywhere, and a checkpoint converted there and back is bit-identical, so a net trained on the TPU loads into every existing tool, the TypeScript export included.

The observation and the rules stay in one place. A **prepare** step runs the PyTorch rebuild on the session's host cores, over the compact states the trainers already keep, and writes plain arrays the JAX trainer streams; nothing of the engine is ported. `launch.py train <name> --task imitate|distil --source <folder>` pushes a session that prepares, trains and writes a PyTorch checkpoint, resumable across sessions; `--data-dataset` reads the source from a Kaggle dataset already uploaded.

A distillation's source is a recording: a search's (`selfplay/record.py`), or a net's own play with no search (`selfplay/own.py`: every decision of every kind and every seat, the positions from its sampled play, the target its most likely move), so a net is copied into a larger one. Its net is `--init`'s or a fresh one of the trainer's `--width` and `--layers`, from random weights; `--clock` prepares the set with the clock, counted down to the recording's cap, and the net reads it, as a clock net is fed in training and on the panel.

**Kaggle runs one batch TPU session at a time for an account**: a push while another is queued or running is refused ("Maximum batch TPU session count of 1 reached"), even a new version of the queued kernel, and the launcher fails on it. The CLI can't cancel a queued run; its Kaggle page can. Sessions are pushed one after another, each a day in the queue, so work meant for the same day goes into one session: `launch.py train <name> <name> …` trains several nets in turn on one prepared set, each in its own process and its own `runs/tpu/<name>/` with its own arguments (`--run-args`), checkpoints, read and log, and each fetched by its own name. A net is given its share (`--run-share`) of the hours left when it starts, after every net still to go has kept its finish time, so a net that ends early leaves its time to the next and the last always has its share; one that fails doesn't stop the ones after it. The cheap nets go first, so they are safe if the largest runs long.

What the TPU buys here is imitation and larger nets: 100 million samples of a 256x6 net is under half an hour by the probe's rates, against about nine hours on a T4. A distillation of the current net is minutes on either, since its recording, which needs a GPU, is the cost.

**big-tpu-1, the first session**: the 256x6 imitation of native-v2 in the bucket space, on big-256x6's recipe, whose answer is known (68.2% of held-out decisions copied, on Modal's A10). No real TPU session has run this path, so the first prediction is about the path.

| # | Prediction | Confidence |
|---|---|---|
| 1 | The session prepares, trains and returns a checkpoint the PyTorch tools load, without a fix | 40% |
| 2 | Once it runs: held-out agreement within one point of big-256x6's 68.2% | 75% |
| 3 | It trains at 60,000 samples a second or more over the eight chips | 60% |

What follows: 2 holds, the path is trusted, and the hours go to what a T4 can't train: 384x8 and 512x12 on the exact space, read by the same held-out agreement, as the base the next stage starts from. 2 fails with the session clean: the two trainers differ somewhere the tests didn't reach, found before anything else trains there.

**big-tpu-1 read: all three held, and the path is trusted.** One session, never restarted, after about a day in Kaggle's queue. 1 held: it prepared the 15.5 million decisions in 518 s on the host's CPUs (33,800 a second), trained, and returned a checkpoint the PyTorch loader reads. 2 held: 68.1% [67.9, 68.3] of 3.1 million held-out decisions copied, big-256x6's 68.2%. 3 held: 100 million samples in 913 s, 109,500 a second over the eight chips, against the 132,400 the probe measured for the network alone, so the loader costs about a sixth. A 256x6 imitation is a quarter of an hour of a TPU session where it was nine hours of a T4. The queue is the cost: a session waits about a day, so what trains there is planned a day ahead and can't sit inside a loop that needs its answer the same night.

## The engine on the TPU: the plan

Direction 1, started so that the TPU can play games and not only train on recorded ones: the search's rollouts, a raw net's own play, and in the end PPO. The JAX engine is built **beside** the PyTorch one, never in its place: the eGPU, Kaggle's T4s and the borrowed machines keep the PyTorch engine, and checkpoints already move both ways (`convert.py`), so a net trained on either side plays on the other.

**Where it lives.** `gpu/riskgpu/jaxengine/`, reading the same board data (`data/board.json`) and blitz tables as the PyTorch engine; nothing in the PyTorch engine, its search or its runner changes.

**The design.**

- **The state** is the PyTorch engine's structure of arrays field for field, in 32-bit integers and booleans, so any state converts to the PyTorch `State` and to the canonical hash.
- **The random stream is the reference's own.** The ruling frees the TPU engine from it, but it costs nothing to keep: mulberry32 is 32-bit arithmetic, `Math.imul` is exactly a 32-bit multiplication's wraparound, and `Math.floor(r * n)` for a draw r = t / 2^32 is ⌊t·n / 2^32⌋, computed exactly in 32-bit integers by halves. The probe priced a 32-bit generator at the same rate as no generator at all. So the rules check can be the strongest one there is, lockstep on the reference engine's own games, rather than only the minimum the ruling asks for.
- **The blitz is the table's, compared in integers.** A blitz compares its float64 draw with float64 running totals. Each comparison, as a function of the 32-bit t behind the draw, is true for a prefix of t (the totals' own, and the defender's against the draw less the capture chance, rounded as float64 rounds it), so at load the table becomes 32-bit thresholds on t, found by binary search on the host in float64, and the step compares integers: exact, inside the table, to the last bit. The first outcome reached is found by binary search over the thresholds' running maximum (about nine gathers a side, not one per outcome). A fight past the table is the training engine's scaled approximation (`scaled_oversize`), flagged.
- **The step** is the PyTorch step's shape: one move per game, every phase's rule under a mask, the forced chain as three masked passes, the options computed inside it, no host round trip, `jit`-compiled over a fixed batch. Fortify's reach is six squarings of the own-borders matrix, as on the GPU. Legality is a mask (`legal_move`), never an exception, so nothing syncs to the host; the tests read it.
- **The setup** deals fresh games on the device from a seed's state, the same draws in the same order as `newGame`, its loops run to their bound and masked.

**The checks, as the ruling asks and one stronger.**

- **Lockstep** (the strongest): every committed fixture game (reference games of every seating) replayed on the JAX engine, its options' hash before each move and its state's hash after it equal to the record's, as `lockstep.py` holds the PyTorch engine.
- **The rules with the dice taken out**: the legality mask equal to the PyTorch engine's `validate` on fuzzed moves (legal and illegal) from positions of random-bot games, and the same position, move and stream reaching the same position.
- **The odds as distributions**: dice and blitz outcomes sampled on the JAX engine and compared with their exact probabilities (the dice enumerated, the blitz read from the table) by a chi-square test.
- **The harness is the backstop**, as always: a net trained there is measured on the reference engine.

**The play loop.** A batch of games playing a net's raw moves (sampled, or its most likely move), the observation (`obs.py`), the legal choices and the decoding of a choice into a move (`actions.py`'s bucket space, the space every net so far plays) ported to JAX, and the network the JAX one already in `tpu/net.py`. Checked against PyTorch on the same states: the same observation, the same legal choices and moves, the same most likely choice. It plays the panel's net-against-net readings (one-in and one-out against an anchor, five argmax copies for the stall) on fixed deals; GD's personas, the panel's floor, are not ported yet. Every net runs over every row in this first version, so a reading with two nets pays twice; serving each net only its own rows, as the PyTorch environment does, comes later.

**What is measured.** Game-steps (decisions) a second, the engine alone (a uniformly random legal choice) and with the 128x4 net, at several batches: on the CPU here, and on a Kaggle TPU v5e-8 session when the quota allows. A rate is a count of work on one machine, read as a ratio to the probe's engine-shaped kernel (403,000 game-steps a second a chip), not compared with a time taken elsewhere.

| # | Prediction | Confidence |
|---|---|---|
| 1 | Lockstep exact on every committed fixture game, after the obvious fixes | 85% |
| 2 | The engine alone on a TPU chip runs within a factor of 3 of the probe's kernel (130,000 game-steps a second or more) | 50% |
| 3 | With the 128x4 net, a chip plays 40,000 decisions a second or more (the net's inference at 115,000 a second bounds it) | 50% |

**Later, planned and not built yet**, each its own step: the exact action space's candidates (for an exact net); the search in fixed shapes (its rollouts are this loop); GD's four personas, the league's and the panel's fixed opponents (a port of their graphable form, the largest piece); the PPO trainer on the JAX loop; and a Kaggle launcher for a session that plays rather than trains.

## Questions a first look would answer

- How fast is the TPU on this workload compared with the T4 and the RTX 4070: the network's forward and backward pass at the trainer's batch sizes, and one engine step, if direction 1 is in play? A small kernel run in a single Kaggle session would give a first ratio.
- What is the TPU quota, and how do its sessions behave (length, queueing, what a session keeps)?
- Which stage of the learned bot's plan would use the compute (`learned-bot.md`'s stages), and is compute what limits progress there? The machine-learning skill (`.claude/skills/machine-learning/`) is the method for weighing that: its budget arithmetic and its rule that a method is fitted to the budget before it is built.
- What would a port cost, and what would verify that a ported engine plays the rules as written?

**Why the API gave no TPU.** Kaggle gives a TPU only to an account whose identity is verified (its editor says so when the accelerator is chosen: "Scarce resources such as TPU v5e-8 also require identity verification"), and a push through the API from an unverified account is accepted and run on an ordinary machine without a word. The owner's account is verified now; a push since then queues for a TPU where the earlier ones started at once on a CPU.
