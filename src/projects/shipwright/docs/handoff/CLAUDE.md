# Handoff docs

This directory holds **handoff documents** — one per unfinished effort, written so a *fresh session*
(no memory of the work) can pick it up from the document plus the code alone.

## When to write one
When work is paused mid-stream: a feature prototyped but not finished, a decision reached but not yet
applied, a plan agreed but not executed, a wishlist half-done. If the next session would otherwise have
to reconstruct context we already built up, capture it here before stopping.

## What goes in one
- **Goal** — what we're trying to achieve, and why.
- **Where it stands** — what's DONE (and *where* in the code), what works, what's left.
- **Next step** — the concrete thing to do next, specific enough to start on immediately.
- **Decisions + rationale** — what we chose and why, so a new session doesn't relitigate settled calls.
- **Gotchas** — traps, constraints, and things that already bit us.

Write enough that someone cold can resume without re-deriving it. Outbound links to the permanent docs
(`../FIDELITY.md`, `../PERFORMANCE.md`, …) are encouraged — put durable facts there and point to them.

## Rules
- **One file per effort**, kebab-case named for the work (e.g. `water-chop.md`).
- **Self-contained, no inbound pointers.** Nothing — not the project `CLAUDE.md`, not the permanent
  docs, not memory — should link *to* a handoff doc. It is found by looking in THIS directory, not by
  a reference that would rot after the doc is deleted. (Standing preference.)
- **Ephemeral — DELETE it when the work is complete.** A handoff doc is transient "resume here" state,
  not a permanent record. As the work lands, migrate any durable knowledge (how the system works, why
  a value was chosen) into the permanent docs or the code, then remove the handoff doc.
- **Not a substitute for the permanent docs.** If a fact will outlive the task, it belongs in
  `FIDELITY.md` / `PERFORMANCE.md` / the code — not here.
