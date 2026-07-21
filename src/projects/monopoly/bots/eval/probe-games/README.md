# Probe games — saved adversarial transcripts

Full `played-cli.ts` game records from `/monopoly-probe` fleet runs: a human-marked
seat (`botStrategy: null`) played by an agent against three bot seats, every decision
persisted. They are kept because a probe game is the archive's **discovery engine** —
five shipped versions including a strict crown trace back to one — and because a
finished transcript is re-readable evidence long after the agent's summary is gone.

Read one with the ordinary review renderer:

    npm run sim -- --log            # (for self-play games)
    node -e "…"                     # or just open the JSON — it is a plain GameState

Each file is a complete `{ state }` snapshot: `status`, `players`, `ownership`,
`houses`, `mortgaged`, and the full `turns` event log including every `bot-note`.

## 2026-07-21 — fleet vs `jane-v20` (the newly crowned champion)

Nine games, three agents, three games each. Each agent carried a distinct attack lens;
exactly one was **black-box** (forbidden from reading any bot policy source), so its
findings are separable as behaviorally discoverable by any human with no code access.

| File | Agent / lens | Turns | Winner | Human result |
|---|---|---|---|---|
| `probe-a1-1.json` | 1 — white-box, J-stack opponent model | 117 | Sam (bot) | loss |
| `probe-a1-2.json` | 1 | 127 | Sam (bot) | loss |
| `probe-a1-3.json` | 1 | 158 | Jordan (bot) | loss |
| `probe-a2-1.json` | 2 — **black-box** (control) | 139 | Jordan (bot) | loss |
| `probe-a2-2.json` | 2 | 173 | Jordan (bot) | loss |
| `probe-a2-3.json` | 2 | 116 | Jordan (bot) | loss |
| `probe-a3-1.json` | 3 — trade extraction / human-model gap | 62 | **Kyle (human)** | **win** |
| `probe-a3-2.json` | 3 | 187 | **Kyle (human)** | **win** |
| `probe-a3-3.json` | 3 | 130 | Alex (bot) | loss |

**Fleet scoreboard: 2–7 (22.2%)** — the tracked benchmark future versions get measured
against, recorded with its target label (`jane-v20`).

**Read that number before reading any finding.** The four-player baseline is 25%, so
three pro-level agents — two of them reading the source — finished at or below chance.
The fleet documented a wallet X-ray at slope 1.00, completers sold at 0.43–2.2× book,
and a 77% discount bought with a $100 throw-in; **those leaks are real, repeatable, and
mostly did not convert to wins.** They are fair-pricing and legibility findings, not a
win-rate claim. Writing them up as the latter is the easiest way to mislead the next
session.

`findings-agent1-whitebox-jstack.md` is agent 1's own notes (the only findings file that
survived — the other two agents' writes did not land, so their ladder detail lives in the
session write-up rather than here). The full synthesis, ranked and deduped across all
three agents, is in `../../docs/EVOLUTION.md` under **"As of 2026-07-21"**, together with
the standing leads it produced.
