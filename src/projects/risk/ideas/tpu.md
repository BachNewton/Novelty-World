# TPUs for the learned bot

An idea to explore, not a plan: nothing here has been measured, and no direction is chosen. It records a question raised while setting up training on Kaggle's free GPUs (`docs/kaggle.md`): could Kaggle's free TPUs help the learned bot toward its goal, and if so, how?

## The goal it would serve

A bot that has mastered Risk and beats any human player (`learned-bot.md`, its brief). What the bot needs from any training hardware is to learn the game's real rules and odds and to play legally. Bit-for-bit agreement between a training engine and the reference engine is one way to prove the rules are right, not a requirement in itself.

## What a TPU is, and what Kaggle offers

A TPU is Google's chip for neural-network work: very fast at large batched matrix multiplication. It is programmed through the XLA compiler, usually from JAX (PyTorch can target it through torch_xla). XLA compiles a fixed computation, so shapes are known ahead of time, and the chips compute natively in 32-bit types; 64-bit integers are emulated.

Kaggle's accelerator list includes TPU v5e-8 and v6e-8 (`TpuV5E8`, `TpuV6E8` to the CLI). Reports put TPU sessions at up to 9 hours. The TPU quota is separate from the GPU quota; its size is shown in the account's settings and hasn't been checked.

## What the code looks like today

- The GPU engine (`gpu/`) is PyTorch, batched over thousands of games, and each step is captured as one CUDA graph. Capture already demands fixed shapes and no round trips to the CPU, which is also what XLA demands, so the engine is written in the style a TPU port would need.
- The engine uses 64-bit integers in many places (its random stream among them), kept so its games match the reference engine's move for move.
- The network is a small transformer (128 wide, 4 layers); PPO trains it on the GPU engine's games, with GD's ported personas in the league.

## Directions to explore

These are not exclusive, and others may turn up.

1. **The whole loop on the TPU.** Port the engine, the bots the league seats, the network and the trainer to JAX. Rules correctness could be checked against the reference engine by giving both engines the same dice and comparing positions, rather than by matching the random stream, which would free the TPU engine to use a 32-bit generator. Open: how much of the engine ports cleanly, how fast it runs there, and what checking it would take.
2. **The network on the TPU, the games elsewhere.** Games are played where they are cheap (GitHub Actions' CPUs, the native Rust engine, the GPU) and the network trains on the TPU from them. This fits loops that train a network on recorded choices: imitation, or expert iteration (a search guided by the current network plays the games, the network learns the search's choices, and the stronger network guides the next round's search, as in AlphaZero). Open: where the search's network calls run while the games are played, how data moves between the two sides, and whether the network is large enough for the TPU's speed to matter.
3. **Something else** a closer look turns up, such as running PyTorch through torch_xla before any port.

## Questions a first look would answer

- How fast is the TPU on this workload compared with the T4 and the RTX 4070: the network's forward and backward pass at the trainer's batch sizes, and one engine step, if direction 1 is in play? A small kernel run in a single Kaggle session would give a first ratio.
- What is the TPU quota, and how do its sessions behave (length, queueing, what a session keeps)?
- Which stage of the learned bot's plan would use the compute (`learned-bot.md`'s stages), and is compute what limits progress there? The machine-learning skill (`.claude/skills/machine-learning/`) is the method for weighing that: its budget arithmetic and its rule that a method is fitted to the budget before it is built.
- What would a port cost, and what would verify that a ported engine plays the rules as written?
