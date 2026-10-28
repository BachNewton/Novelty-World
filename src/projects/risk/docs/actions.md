# Measuring bots on GitHub Actions

Risk's gauntlet and ratings ladder can run on GitHub Actions' runners instead of the owner's laptop. The repo is public, so the runners cost nothing, and twenty of them play at once. A run takes the same arguments as the local tool and reports exactly what the local tool reports. The workflow is `.github/workflows/risk-measure.yml`, with one round of it in `risk-round.yml`.

`risk:tune` doesn't run there yet (see "Not yet" at the end).

## Starting a run

The workflow file must be on `main` before GitHub will start it. From then on, a run can start from any branch, and plays the code of the commit it starts on.

From GitHub: the repo's **Actions** tab, **Risk measure**, **Run workflow**. Pick the branch, the tool, and type the arguments as they'd follow `npm run risk:<tool> --` on the laptop.

From the command line, with `gh` on the owner's account (`BachNewton`):

```bash
gh workflow run risk-measure.yml --ref main -f tool=gauntlet -f args="rule-v5 --base rule-v4 --field rule-v4 --players 6 --prefix holdout"
```

The inputs:

- **tool**: `gauntlet` or `ratings`.
- **args**: the tool's own arguments. `--workers` makes no difference here: each machine uses all its cores.
- **shards**: the most machines a round is split across. 20 by default, which is as many jobs as GitHub runs at once on a free account.
- **min_round**: the fewest games an undecided gauntlet pairing plays in a round. 0 by default, which leaves every round's size to the evidence (below); a floor only makes rounds bigger, never changes a result.
- **max_parallel**: the most machines this run plays on at once. 20 by default, which is all of them. GitHub's twenty are shared by every run on the account, so a run started while another is playing waits behind all of that run's jobs. With two runs, give each 10 and both keep moving: together they take about as long, but a gauntlet's next round no longer waits out a whole ladder. A capped run's shards beyond the cap wait their turn inside the run, so the cap changes only when games play, never what they are.

Every run of the same arguments plays the same games, so a run can be repeated, or its result checked against a local run, at any time.

## What comes back

- **The run's page** shows the report at the bottom of its summary: the same text the tool prints at the end of a local run, gate and Elo included.
- **The Bot Lab page** shows the run live while it plays, when the repo has the Supabase secrets (see "Live page").
- **The `risk-results` artifact** holds what goes into the repo: the report (`summary.txt`), the run's run-log record (`runs.jsonl`), the ladder cache as the run left it (`ratings-cache.json`), and, for a `--seatable` ratings run, `ratings.json`. It is kept for 90 days.

To bring a run's results into a checkout, then commit them:

```bash
gh run download <run id> --name risk-results --dir results
```

```bash
npm run risk:import -- results
```

`risk:import` appends the record to `eval/runs.jsonl`, merges the run's new ladder matchups into `eval/ratings-cache.json` (keeping only records whose code this checkout still has), and copies a seatable run's Elo into `bots/ratings.json`. It prints the report. The bot log entry is written from that, as for a local run.

**Why an artifact, not a commit from the workflow.** The results need a person or an agent anyway: the report is read, judged and written up in `ideas/bot-log.md`, and committed with that entry. A workflow that pushed its own commit would race the owner's pushes, need write access to the repo, and land on whatever branch the run started from, which may since have moved. Downloading the artifact is one command, and nothing reaches the repo without being looked at.

## How a run plays

A run plays in **rounds**. Each round has a **plan** job and up to twenty **play** jobs:

1. The plan job reads every game the run's earlier rounds played, and works out which games the run still needs. A gauntlet's pairings each run their SPRT over the games played so far: a decided pairing needs no more, and an undecided one plays what its test is expected to need. Before any decisive game, that is the fewest games that could possibly decide it (an unbroken run of wins or of losses). After, it is Wald's estimate of the games left at the win share seen so far, never more than as many again as it has played, so one early, noisy share can't commit a round to thousands of games, and never fewer than could decide. A ladder (the ratings tool's, or a gauntlet's field) reads its matchups a seed group at a time, as the report will, until each pair's gap is known to the ladder's precision (the project's CLAUDE.md, "Measuring bots"); each undecided pair then plays the groups its gap is expected to need, at the strengths fitted so far (before any games, all equal), never more than as many again as it has played.
2. The play jobs split that round's games between them, each taking every twentieth game, so every machine gets the same mix of cheap and costly tables. Each keeps its games, and its own run-log figures, in one file.
3. The next round starts once every play job has finished. A round whose plan needs no games ends the run.

   A play job that fails (GitHub occasionally loses a runner mid-job, or one runs past the six-hour limit) doesn't stop the others or the run: the round's other machines play on, and the next round's plan finds that machine's games missing and plays them again. Every game is a pure function of its spec, so a game played twice gives the same result. Only cancelling the run stops it.
4. The **report** job runs the tool itself, with the same arguments, over every game the rounds played. Instead of playing a game, it looks up the kept result. The output is the tool's own report and run-log record.

Every plan, play and report job builds the native crate's release binary first (its dependencies cached between runs), so a run's tables may seat Rust bots, as a local mixed table does (`ideas/native-port.md`).

**Why the rounds are sized from the evidence.** A round's games are bought before the test reads them, and the test stops at its first group across a bound, so everything a round plays past that point is paid for and thrown away. Rounds of a fixed 600 games threw away most of what v7 played: its pairings decided in 85 to 270 games. Sized to what the test expects to need, simulated pairings waste about a tenth instead, from a strong candidate to one on its margin, at the price of more rounds: typically 3 to 8, at most 13 in 2,000 simulated pairings. A round's start-up is minutes, so for a bot whose games cost minutes each that trade is easy; for a bot of greedy's cost the extra rounds cost more than the games they save, and such a gauntlet plays faster on the laptop anyway. The size only moves where a round ends, never the result. The workflow has sixteen rounds. A run that needed more fails loudly in its report, naming a game that was never played. The tools can also run this loop by hand: `--games-from <dir>` reads kept games, `--plan <file>` writes the next round's plan, and `npm run risk:shard` plays one machine's share of a plan.

**Why the rounds are chained inside one workflow run.** The workflow calls the round workflow sixteen times, each call depending on the one before and skipped once a plan finds the run decided. The alternative was a round that starts the next run of the workflow itself. That works, but it splits one measurement over many runs, and each would have to find the previous runs' games, a cross-run download that needs extra permissions. Chained calls keep a run in one place: one page to watch, one button to cancel it, its games all in that run's own artifacts, and one report at the end. The cost is the fixed limit of sixteen rounds, which the round sizing makes enough. GitHub allows 50 workflow calls from one file, and a run may last 35 days.

**Why a single pairing can be split.** A pairing's SPRT on one 4-core runner could outlast GitHub's 6-hour job limit: v5 against v4 at 6 players took most of a 3.4-hour run on 16 cores. A game is a pure function of its seed and seating, so who plays it makes no difference. Splitting a pairing's games across machines changes nothing as long as the test reads them in the same order, which the report does.

## Why the result is the local one

A local run and an Actions run of the same arguments give the same report, and the tests hold them to it: `eval/remote.test.ts` plays a gauntlet and a ladder in rounds over several machines, through the same files the workflow passes, and checks the reports against the same runs played at once on one thread. `eval/remote.slow.test.ts` does the same with real games. Four things make it hold:

- **The games are the same.** They come from the same seeds and seatings, on the same Node version: Risk's pin, `eval/node-version`, which the workflows read and which is the laptop's Node (the machine's one Node; the repo pins none). The version is part of the game: the same seed and seats played on Node 22 and on Node 24 diverge within a few turns, since V8's `Math.pow` changed, and the battle odds and some bots use it. When the machine's Node moves, the pin moves with it. Nothing checks the version yet, so a laptop run replays an Actions run only while the laptop's Node matches the pin. Even then Windows and Linux can differ: since Node 24 `Math.pow` is the C runtime's, and the two disagree in the last bit on about 1 input in 3,000, so a rare game may diverge between the laptop and the runners. The same holds for the ladder cache below.
- **The test reads them the same.** The SPRT stops at the first group of games that crosses a bound. That point depends only on the games, never on how they were batched. The report job reads a pairing a group at a time, so it never asks for a game past the stop point. Those are the games a round may not have played.
- **A ladder stops where its games say.** Its pairs stop at the first seed group at which the Elo fit over every group read so far knows their gap well enough, and which groups those are depends only on the games. The report reads a group at a time, never past a stop point, and the ladder cache only saves playing: it holds each matchup's first groups, so a ladder that finds them there reads exactly what it would have played.
- **Only what crosses the stop point is counted.** A pairing's draws and failed games are counted up to its stop point, as its wins and losses are. The one figure that differs is a pairing's `generated`: the games it played in all, past the stop point included. That depends on how the run was cut, as it does between batch sizes locally. The report doesn't print it.

The ladder cache's code hashes ignore line endings and paths' separators, so a ladder on Actions finds the matchups the laptop already played, and the laptop finds the ones Actions played.

## Recording positions

The same workflow records positions for fitting an evaluation (`risk:record`, `eval/positions.ts`): pick the tool `record` and type the recorder's arguments. It isn't a measurement, so there are no rounds, plan or report: its games are fixed in number, and each of `shards` machines records its own consecutive run of them (`--shard`) into a gzipped file. A last job gathers the files into one artifact, `risk-positions`, kept for 90 days. The files are read together as they are, with nothing to merge:

```bash
gh run download <run id> --name risk-positions --dir src/projects/risk/eval/positions
```

A teacher recording (`risk:record -- --teacher rule-v7 ...`, `eval/distill.ts`) runs the same way, with the same tool and its arguments typed after it.

The positions are data, never committed: `eval/positions/` is ignored.

## The run's record

The report job writes the run-log record, as a local run does, but the figures are the play jobs' own. Games, decisions and speed are summed over every machine. The machine is one runner. CPU is each machine's load, averaged over all of them. Memory is the largest any one machine used. The wall time runs from the first round's plan to the report. The record's `remote` field says how many shards played the run, over how many rounds, so the timeline can tell a laptop's run from an Actions run. Its arguments are the tool's own, without the flags that only say where the games came from.

## Live page

With the repo secrets `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` set, the run shows on the Bot Lab page as one run, under one row, from the first plan to the report. Each round's plan publishes every pairing's SPRT as it stands. The play jobs keep that row alive while they play. Between rounds, while the next machines start, the row says it may be quiet for up to fifteen minutes, so the page doesn't call it lost. A run whose workflow died shows as lost once that quiet has passed. Without the secrets, a run plays unpublished, as a local run without keys does.

Within a round, the page shows the round's starting point, not each game: the machines don't share their progress until the round ends.

## Limits

- **Twenty machines at once, 4 virtual cores each, across every run on the account.** That is 80 workers against the laptop's 15, though a runner's core may be slower than the laptop's. Each run's record shows the speed it got. Every runner label (other Ubuntu versions, ARM, Windows) draws on the same twenty, so changing the label adds none.
- **Six hours per job.** A round's share per machine must fit, and a machine plays a `shards`-th of a round. For bots of v6's cost that is well within it: even the largest round of a pairing at its cap, about 22,000 6-player games of v5, takes well under that. A searching bot is another matter: v7 at 8 replies, with four v7s at a table, ran some machines of a 20-shard ladder past the limit, and the job stopped with its games lost. For such a bot, raise `shards` (60 for that ladder) so each machine's share takes a couple of hours; `max_parallel` still keeps it to twenty machines at once, and the extra shards wait their turn.
- **Each round costs a few minutes of start-up**: installing the packages and moving the games between jobs. A gauntlet of fast bots plays quicker on the laptop. Actions pays off on long runs.

## Not yet

- **`risk:tune`.** Each SNES generation depends on the one before, so a tuning run is a chain of short rounds, one per generation, typically twenty. Each round's start-up would cost more than its games. It would need the round loop to carry the tuner's state from round to round, a different shape from a gauntlet's. It stays on the laptop until a tuning run is long enough to be worth that.
