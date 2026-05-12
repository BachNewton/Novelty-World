# Remote-solve notes

The decross IP for the sugiyama crossing-minimization step runs against a
hosted native HiGHS instance instead of the WASM build that ships with the
`highs` npm package. See `decross-highs.ts` — `solveRemote()` POSTs the LP
to a Cloudflare-tunneled endpoint via synchronous XHR.

## Why Node tests/benches are broken

`XMLHttpRequest` is a browser/worker global. Node 22 doesn't expose it, so
anything that runs `computeLayout` under vitest now throws
`ReferenceError: XMLHttpRequest is not defined` the moment sugiyama hits
its decross callback.

Affected:

- `layout-invariants.test.ts`
- `layout-invariants.slow.test.ts`
- `layout-snapshot.slow.test.ts`
- `layout.bench.ts`
- `layout-phases.bench.ts` (also: the monkey-patch on `highs.solve` is
  now a no-op since we don't call it anymore)

Unaffected: `logic.test.ts` — only exercises pure logic helpers, not
`computeLayout`.

## Options to restore tests

1. **`xhr2` shim in a vitest setup file.** Add `xhr2` as a devDependency,
   set `globalThis.XMLHttpRequest = require('xhr2')` in a setup file
   referenced by `vitest.config.ts`. Smallest change; tests keep running
   against the live remote endpoint, which means they depend on the
   tunnel being up. Good for local iteration, bad for CI.

2. **Node-only WASM fallback.** In `solveRemote`, detect Node
   (`typeof XMLHttpRequest === 'undefined'`) and route through the
   existing `highs.solve(lpText)` path instead. Tests stay fast,
   hermetic, and free; production still uses the remote API. The WASM
   call is already wired in (`_highs` is passed all the way through),
   so this is a ~5-line addition.

3. **Drop the remote dependency for tests.** Replace `solveRemote` with
   the WASM call permanently and use the remote endpoint only as a
   manually-invoked benchmark. Best if the remote solve never pays for
   itself.

Recommended: (2) — keeps the remote integration as the production path
while restoring hermetic Node tests.
