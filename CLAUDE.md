# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Novelty World is a Next.js 16 monorepo-style platform hosting multiple games and tools under a single dark-themed UI. Each "project" (game/tool) lives in `src/projects/<slug>/` and is lazy-loaded via `next/dynamic` in the catch-all route `src/app/[...slug]/page.tsx`. The homepage (`src/app/page.tsx`) renders a categorized directory of all projects.

**Hosting:** the app is deployed on **Vercel**. Server-side code (route handlers, server actions) runs in Vercel's environment, so any server env var — e.g. `SUPABASE_SERVICE_ROLE_KEY` — must be set in **Vercel → Project Settings → Environment Variables**, not just in local `.env.local`. Env var changes only take effect on the next deployment.

## Commands

| Task | Command |
|---|---|
| Dev server | `npm run dev` (port 3001) |
| Build | `npm run build` |
| Lint | `npm run lint` |
| Type-check | `npm run typecheck` |
| Unit tests | `npm run test` |
| Single test file | `npx vitest run src/projects/euchre/logic.test.ts` |
| Watch mode | `npm run test:watch` |
| E2E tests | `npm run test:e2e` |
| All tests | `npm run test:all` |

E2E tests (Playwright) expect the dev server on port 3001 and a WS relay on port 3002 (started automatically via `e2e/global-setup.ts`).

## Principles

- **Simplicity first.** Keep code clean and straightforward. Complexity needs a good justification.
- **Code is its own documentation.** Good code is obvious by reading it. Only add comments when the *why* isn't clear from the code itself — workarounds for framework bugs, environment quirks, or browser behavior are the main case: the reason lives outside the codebase, so it always needs the comment.
- **Share code aggressively.** This platform has many projects and will keep growing. When patterns repeat across projects, refactor them into `src/shared/`. Look for reuse opportunities proactively.
- **Responsive everywhere.** All layouts must work from 360px wide (the practical floor — ~5-year-old Android devices like Galaxy S21/S22 report 360px CSS width in portrait) through ultrawide desktop. Use a single fluid layout when possible, or build distinct mobile/desktop layouts when the UX demands it.
- **Sanity-check the approach.** If a request or direction is far outside industry-standard practice, or if there's a significantly simpler way to achieve the same result, flag it before implementing. Push back with a brief explanation — don't just go along with an overcomplicated approach.
- **Consistency, but not with bad code.** Observe and follow existing patterns where they're sound — consistency makes a codebase easier to read and maintain. But don't double down on bad design just to match what's already there. If the current pattern is poor, do the new work the better way and flag the existing code as a refactor target so it can be brought in line.

## Architecture

### Project structure pattern

Each project in `src/projects/<slug>/` follows this convention:
- `index.tsx` — re-exports the root component (the named export registered in the `PROJECT_COMPONENTS` map in `src/app/[...slug]/page.tsx`)
- `logic.ts` — pure game logic functions, no React or side effects
- `logic.test.ts` — unit tests for logic (Vitest)
- `store.ts` — Zustand store with `"use client"` directive; host validates moves via logic functions, guests receive authoritative state via `applyStateUpdate`
- `types.ts` — TypeScript types for the project
- `components/` — React components; the top-level component (e.g., `euchre.tsx`) orchestrates lobby/game phases

To add a new project: create the folder, add an entry to `PROJECTS` in `src/shared/lib/constants.ts` (which determines routing and homepage display), and register a lazy `dynamic()` import in `src/app/[...slug]/page.tsx`. Projects without a registered component render a "Coming soon" placeholder.

### Routing

A catch-all route (`src/app/[...slug]/page.tsx`) handles all project URLs using category/project slug segments. Projects are registered in `src/shared/lib/constants.ts`.

### Multiplayer

There is a shared multiplayer library built on WebRTC with Supabase Realtime for signaling (`src/shared/lib/webrtc/` and `src/shared/lib/multiplayer/`). It provides two room models: `useLobbyRoom` (host/guest with explicit start) and `useWorldRoom` (open mesh). The host is always authoritative — validates moves and broadcasts state, guests submit actions and apply updates.

### Shared code

Reusable components, hooks, and utilities live in `src/shared/`. Check there before building something new — use and extend what exists.

### Database / Supabase SQL

This project does **not** use a migrations folder or the Supabase CLI. SQL lives as flat, idempotent files in `supabase/*.sql` (one per feature, e.g. `monopoly.sql`), written to be safely re-runnable (`create table if not exists`, `add column if not exists`, `drop policy if exists` before `create policy`).

To apply a SQL change to the remote project, run the file through `psql` against the **`aws-1-eu-north-1` pooler** (the only host that works on this network):

```bash
set -a && . ./.env.local && set +a && PGPASSWORD="$SUPABASE_DB_PASSWORD" psql "postgresql://postgres.${SUPABASE_PROJECT_REF}@aws-1-eu-north-1.pooler.supabase.com:5432/postgres" -f supabase/<file>.sql
```

Verify with `... -c "\d public.<table>"`. Editing a `supabase/*.sql` file is not enough — you must re-run it for the change to hit the database. Do **not** use the direct `db.<ref>.supabase.co` host (IPv6-only, DNS fails here), the `aws-0-` pooler, or `supabase db push` (CLI auth conflicts) — they don't work on this setup.

**Authoritative server writes:** game tables are locked read-only at the RLS layer (a `select` policy only, no write policy). The single writer is a Next.js route handler (e.g. `src/app/api/monopoly/route.ts`) using the service-role client (`src/shared/lib/supabase/server-admin.ts`, keyed by `SUPABASE_SERVICE_ROLE_KEY`), which bypasses RLS. Clients read and subscribe via the anon key but cannot write directly.

### Styling

Tailwind CSS v4. Novelty World's visual identity is colorful, bold, fun, and quirky — lean into that when designing UI. The design system tokens (brand colors, surfaces, text, borders) are defined in `globals.css`.

**Rule: Never use raw Tailwind color classes (e.g. `text-sky-400`, `bg-red-500`) or hardcoded hex values.** All colors must come from the semantic tokens defined in `globals.css` (`text-text`, `bg-surface`, etc.). This keeps the design system as a single source of truth for brand identity.

## Code Style

### Lint must be clean — treat warnings as design signals

**Rule: `npm run lint` must produce zero errors and zero warnings.** Our lint config is strict on purpose (no `any`, no unnecessary conditions, etc.). When lint flags a line, resist the urge to silence it with a one-line patch (a cast, a disable comment, a throwaway rename). Stop and ask: *why* is the linter unhappy? The flagged line is usually a symptom — the real problem is often a design issue one or two levels up (wrong type at the boundary, a function doing two things, state living in the wrong place, a missing abstraction). Fix the underlying cause so the warning goes away naturally.

**Rule: Suppressing a lint rule (`eslint-disable`, `// @ts-expect-error`, etc.) requires strong justification and an inline `--` description explaining it.** Suppression is a last resort, not a shortcut. Only suppress when you've concluded the rule genuinely does not apply to this specific case (e.g. `<img>` inside `next/og`'s `ImageResponse`, which Satori requires) — and write *why* directly next to the disable comment in the form `// eslint-disable-next-line some-rule -- reason here`. "Lint was noisy" is not a justification. This is mechanically enforced by `@eslint-community/eslint-comments/require-description` — an undescribed disable will fail lint.

### Fail loudly — don't guard around bugs you don't understand

**Rule: never add a guard, catch, or fallback that mitigates an issue whose root cause isn't fully understood.** Mitigation written on partial understanding is how sloppy code accumulates: it mutes the signal, hides the bug from the next investigation, and outlives its justification once the real cause is fixed. When something breaks, do one of two things: **fail loudly**, or add **diagnosis tooling** (targeted logging, state capture, tagging) that isolates the root cause — then land the proper fix and clean the diagnostics up once you're confident the issue is solved. Never ship the workaround to the user (e.g. "reload the page" for a bug in our code) — a broken experience caused by our code is ours to fix, not the user's to route around.

### Docs describe concepts — references must fail loudly

**Rule: docs and CLAUDE.md explain concepts and invariants; they never duplicate code.** Never cite line numbers, and never paste real code into prose — a copied snippet forks the truth and rots silently, and so does prose that narrates today's implementation detail. When an example helps, make it generic and inline (shaped like code, referencing nothing real). Naming real things follows stability: file/module names are the routing map and are encouraged; exported symbol names are fine where routing matters, because a rename makes the reference fail a grep — staleness that announces itself. When renaming or moving anything, grep the docs for the old name in the same change.
