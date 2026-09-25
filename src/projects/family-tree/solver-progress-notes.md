# Solver progress — design notes

The exact crossing-minimization solve (HiGHS, behind the Optimize button) can
take tens of seconds, and its duration isn't predictable. Waiting isn't the
problem. The problem is that a spinner looks the same whether the solve is
working, stuck, or has crashed. These notes cover what progress signal we can
honestly show and how to get it out of the worker.

## Why there is no percentage

HiGHS solves the crossing problem as a MIP with branch and bound. It can't know
in advance how much of the search tree it has to explore, so nothing can report
"40% done". A progress bar that pretends otherwise would be made up. What the
solver does know at every moment is two numbers:

- **Best found:** the crossing count of the best layout found so far. This only
  goes down.
- **Best bound:** a proven floor, meaning no layout can have fewer crossings
  than this. This only goes up.

The solve is finished when the two meet. The gap between them is real progress.
It just isn't linear in time.

## Where the signal comes from

HiGHS writes a progress log while it solves: a table with a row every few
seconds giving the node count, best bound, best found, gap, and elapsed time.
`highs-js` sends that output through the Emscripten `print` hook, which we can
supply when the module loads. So we can get progress without a callback API:
parse the log rows as they arrive.

A trace from the live 161-person tree (September 2026, HiGHS 1.15.1, one thread):

| elapsed | best bound | best found | note |
|---|---|---|---|
| 0.5s | – | 1770 | presolve done, trivial starting point |
| 1.0s | 0.4 | 873 | |
| 5.0s | 2.9 | 174 | |
| 11.2s | 3.4 | 174 | |
| 16.5s | 3.9 | 174 | |
| 22.8s | 4.9 | 174 | |
| 24.7s | 4.9 | 6.1 | a heuristic finds the real answer |
| 25.5s | 6.1 | 6.1 | bounds meet, proven optimal |

What this shows:

- **The bound is the steady signal.** It climbs throughout, while "best found"
  sits at a useless value and then drops almost all at once near the end.
- **Log rows came about every 5 seconds** during this solve. Larger trees will
  likely space them out further, since each row reports a full round of cut
  generation.
- **The objective isn't a whole number of crossings.** The objective adds a
  small tie-break term (always less than 1 in total) to make the optimum unique,
  so the whole-number part is the crossing count. Display whole numbers.

## What the UI should show

1. **Phase.** The solve is one step in the layout: build the problem, presolve,
   search, then place coordinates. Naming the current phase makes a long wait
   easier to read.
2. **Bounds.** Something like "Best so far: 174 crossings · at least 4 needed",
   updating as rows arrive. Watching the floor rise tells you it's working.
3. **Elapsed time, plus the previous duration if we have one.** "Last optimize
   of this tree took 25s" is an honest estimate. It could be stored next to the
   cached layout, since it's tied to the same topology.
4. **Liveness, reported as a fact rather than a verdict.** Show "last update 8s
   ago" and let the user judge. Don't auto-cancel on silence: row spacing grows
   with tree size, and we have no measured threshold that separates slow from
   stuck.
5. **Failure as an error.** A WASM crash throws inside the solve, and the UI must
   show it as a failed optimize, never as a spinner that keeps spinning.
   **Today that doesn't happen.** The sugiyama wrapper in `logic.ts` catches any
   error and returns null, and the caller then falls back to a flat per-layer
   placement. A solver crash comes out as a bad-looking layout with no error.
   Solver failures need to propagate to the worker's error response instead of
   being absorbed by that fallback.

## Getting progress out of the worker

The `print` hook runs synchronously inside `solve()`, on the worker thread. The
worker can `postMessage` a parsed progress update from inside the hook, and the
main thread receives it because only the worker is blocked. **Not verified
yet:** confirm that browsers deliver those messages while the worker is still
inside the synchronous call, before building the UI on it.

Parse the log defensively. It's human-readable output, not an API, so a
`highs` upgrade can change the columns. A row we can't parse should still count
as a liveness heartbeat. It just shouldn't update the numbers.

## Background: the crash that made this matter

In May, local solves on larger trees failed, and we suspected memory. In
September we reproduced a crash with `highs` 1.8.0 on the live tree in a
Chromium worker: `RuntimeError: null function` after about 133s. The same
problem solved cleanly and repeatedly with 1.15.1 in both Node and Chromium.
The fixture tree (132 people) didn't crash with 1.8.0 in Node. The crash is
reproduced once, and the fix is assumed from the version bump; we haven't
traced it to a specific upstream change. Either way, a progress display with
visible failure is what turns the next surprise like this into a readable error
instead of an endless spinner.
