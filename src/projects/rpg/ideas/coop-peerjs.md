# Online Co-op via PeerJS (2–4 players) — remaining work

Status: core implemented / E2E written, not yet green.
Date: 2026-09-24 (revised; original idea 2026-09-22).

Done and out of scope for this doc: PeerJS transport (claim-or-join
`novelty-rpg-world`, star rebroadcast, event-chained re-election),
presence + lerp avatars both directions (play ↔ edit), LWW map sync +
clear broadcast + sparse join snapshot, shared-transport singleton,
`?coop-room=` isolation for testing. Implementation lives in
`src/projects/rpg/coop/` with unit tests (`transport`, `presence`,
`map-sync`); no waits/timers in coop networking or tests by rule.

Production rule: one global room, no codes/lobby/invites. `?coop-room=`
exists for testing/dev isolation only.

## 1. E2E green (`e2e/rpg-coop.spec.ts`, 8 tests, serial)

Cases: join/move/leave, edit→play live, play→edit live, same-cell
convergence, Clear All no-resurrection, late-joiner snapshot, host-close
re-elect, 4-player smoke. Run: `npx playwright test e2e/rpg-coop.spec.ts`.

Status: test 1 passes; tests 2–8 blocked until the in-flight character
stream (`characters.ts`, per-character sprites, `characterId` on the pos
wire) lands and the tree is quiet — the last run raced Turbopack HMR
mid-test. Rerun on a quiet tree, then keep green.

## 2. Visible "reconnecting…" indicator

Transport already publishes `reconnecting` (asserted via hidden
`coop-status` testid). Still missing: user-visible indicator in both
`game-world.tsx` and `map-editor.tsx`. Accept: host tab closes →
survivors show the indicator until re-elect completes, then it clears.

## 3. Names/colors on avatars

Polish item, not implemented. Coordinate with the character stream:
decide whether coop identity rides on `characterId` (already on the wire)
or needs a separate name/color field, then render it on remote avatars in
both play and edit overlay. Accept: each remote avatar is identifiable
at a glance in both modes.

## 4. TURN verdict

PeerJS cloud is STUN-only; symmetric-NAT users (~10–20%) may fail to
connect. Fix if it bites (one-line TURN provider via PeerJS `config`,
no architecture impact). Accept: record the decision once E2E is green —
either "STUN sufficient, verified by passing E2E" or add the TURN config.
