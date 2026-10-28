# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Novelty World is a Next.js 16 monorepo-style platform hosting multiple games and tools under a single dark-themed UI. Each "project" (game/tool) lives in `src/projects/<slug>/` and is lazy-loaded via `next/dynamic` in the catch-all route `src/app/[...slug]/page.tsx`. The homepage (`src/app/page.tsx`) renders a categorized directory of all projects.

Next.js's own docs for the installed version are bundled in `node_modules/next/dist/docs/`; check them before using a Next.js API.

**Hosting:** the app is deployed on **Vercel**. Server-side code (route handlers, server actions) runs in Vercel's environment, so any server env var — e.g. `SUPABASE_SERVICE_ROLE_KEY` — must be set in **Vercel → Project Settings → Environment Variables**, not just in local `.env.local`. Env var changes only take effect on the next deployment.

**The server:** Vercel only runs short-lived functions, so anything that needs a long-lived server runs on Novelty World's own Oracle Cloud machine, which Claude manages from the command line. `infra/oracle/README.md` covers the machine, how to reach it, its firewalls, and the rules for changing it.

## Commands

| Task | Command |
|---|---|
| Dev server | `npm run dev` (port 3001) |
| Build | `npm run build` |
| Lint | `npm run lint` |
| Type-check | `npm run typecheck` |
| Unit tests | `npm run test` (the tests the change reaches, see "Checking a change"; skips `*.slow.test.ts`) |
| Slow unit tests | `npm run test:slow` (the same, for only `*.slow.test.ts`: heavy geometry, simulations, production-sized fixtures) |
| Every unit or slow test | `npx vitest run`, or `npx vitest run --config vitest.slow.config.ts` |
| Single test file | `npx vitest run src/projects/euchre/logic.test.ts` |
| Single slow test file | `npx vitest run --config vitest.slow.config.ts src/projects/betrayal/art/lighting.slow.test.ts` |
| Watch mode | `npm run test:watch` |
| E2E tests | `npm run test:e2e` (builds its own server each run; `--workers=N` overrides the worker count) |
| E2E against the dev server | `E2E_BASE_URL=http://localhost:3001 npm run test:e2e` |
| All tests | `npm run test:all` (every unit, slow and e2e test, unscoped) |
| Machine load | `npm run load` (CPU use and the test runs in progress, by checkout: read before blaming a timeout on the test) |

E2E tests (Playwright) are self-contained: each run builds the app (a snapshot of the code when the run starts) and serves it, along with a local multiplayer relay, on ports the OS picks, so a run never touches the dev server and any number can run at once. `E2E_BASE_URL` points a run at a server that is already up instead. Workers default to half the logical cores, and every test page reports a fair share of the cores as `navigator.hardwareConcurrency`, so specs import `test` and `expect` from `e2e/test.ts`, not from Playwright. Multiplayer pages opt into the local relay with `?relay=local:<port>` (`e2e/relay.ts`), so the suites never touch the real one.

### Checking a change

A green check runs what the change can reach:

- **Lint and typecheck** always run whole: they are fast, and catch a broken import anywhere.
- **Unit and slow tests** are scoped by their scripts: `npm run test` and `npm run test:slow` run only the tests whose imports reach a file changed against `main`, committed or not (Vitest's `--changed main`), and pass with nothing to run. A change to a file every test depends on without importing it (`package.json`, the lockfile, `tsconfig*.json`, either vitest config) runs them all: those are the `forceRerunTriggers` in `vitest.config.ts`.
- **E2E** runs the specs of the project changed: `npx playwright test e2e/<project>`. Specs are named for their project (`e2e/<project>-<topic>.spec.ts`, or `e2e/<project>.spec.ts` for a single one), except `lobby-games.spec.ts`, which plays the room-code games (Tic-Tac-Toe and Euchre). Playwright's `--only-changed` doesn't fit: specs load the app by URL, not by import. Every spec runs when the change reaches `src/shared/`, the dependencies (`package.json`, the lockfile), or test, build or TypeScript config.
- After a failure, rerun only the failing files, never the whole suite.

The one gap: the graph sees only imports. A test that reaches something by another route, a file read by path or a Python process (the family tree's layout tests run `layout/solver/`), isn't selected when that changes. A test imports what it uses wherever it can, and a change to something reached another way runs its tests by name.

## Principles

- **The owner works at the level of architecture, not implementation.** The owner doesn't read implementation code and is language-agnostic; engineering discussions are about software engineering principles, repo conventions and product decisions. Choose languages, tools, patterns and workflows on technical merit and on how well Claude, as a language model, can build and maintain them, never on whether the owner can read them. Explain tradeoffs in those terms, not in code.
- **A board game here is a digital adaptation, not a recreation of the physical table.** Rules that exist because of the table (rolling to pick who goes first, announcing dice, finite pieces, remembering public information, choices no player would rationally make that only pace the table) are replaced by whatever serves the game best. Rules that express the designers' intent are kept as written. When a rule's text is ambiguous, tell the two kinds apart before ruling on it.
- **Simplicity first.** Keep code clean and straightforward. Complexity needs a good justification.
- **Code is its own documentation.** Good code is obvious by reading it. Only add comments when the *why* isn't clear from the code itself — workarounds for framework bugs, environment quirks, or browser behavior are the main case: the reason lives outside the codebase, so it always needs the comment.
- **Share code aggressively.** This platform has many projects and will keep growing. When patterns repeat across projects, refactor them into `src/shared/`. Look for reuse opportunities proactively.
- **Phones up to 4 years old.** Mobile layouts and performance target phones released in the last 4 years, counted from release date and rolling forward; older phones aren't optimized for. That sets the floor at 360×640 CSS pixels in portrait: base Galaxy models (S23 onward) are 360px wide, and the shortest browser views in that window are about 650px tall (an iPhone in Safari with its toolbars, a Galaxy in Chrome). Recheck the floor as the window moves.
- **Responsive everywhere.** All layouts must work from the 360px floor through ultrawide desktop. Use a single fluid layout when possible, or build distinct mobile/desktop layouts when the UX demands it.
- **Tests are for moving fast, not for safety.** Novelty World is a hobby: no customers, no real users, nothing at risk when code breaks but time and annoyance. A test exists to let Claude check its own work and change code with confidence, so each one must catch a mistake that is likely and costly to find by hand: an invariant that is easy to break (a move that must never be legal, two copies of state that must agree), a rule with fiddly cases, a regression that has happened. No test for testing's sake: not one that restates the code, checks a pure function returns the same thing twice, sweeps what targeted tests already pin down, or exists to fill coverage. A test that no longer earns its keep is deleted.
- **A slow test earns its time.** A test's run time is paid on every run, so a long-running test or suite must return value to match: say what it catches that a faster test can't, and size it by measurement, never by a round number. A sweep that only re-confirms what targeted tests already pin down is cut or made opt-in.
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

### Ideas before a project

`ideas/` at the repo root holds investigations, research and plans for something not yet committed to: no project folder, no direction chosen. Each doc opens by saying what it is and how settled it is. When an idea becomes a project, its doc moves into that project's own `ideas/` folder (or its decided parts into the project's `CLAUDE.md`); an idea that is dropped is deleted, since git keeps it.

### Share images (Open Graph)

Every page's link preview carries the project's own name and tagline, and a 1200×630 share image. The site's card (`src/app/opengraph-image.tsx`) is the default. A project gets its own by adding an `og-image.tsx` to its folder, exporting its card and alt text, and registering it in `PROJECT_OG_IMAGES` (`src/app/og/project-og-images.ts`); the catch-all route's metadata then points its pages at `/og/<slug>`, drawn once at build time. Next.js can't put an `opengraph-image` file under a catch-all segment, hence the separate route. The cards are drawn by Satori (`next/og`) from the shared pieces in `src/shared/lib/og/`: the site's fonts, its wordmark, sea and brand bars, and `ProjectOgCard`, a frame with the project's name and tagline beside its own art. A project with a style of its own may draw the whole card instead. Satori can't read CSS variables, so the cards take colours from `OG_COLORS`, which mirrors the design tokens in `globals.css` (a test holds them equal) and is the one place a share image's colours come from. Social sites cache a preview by URL, so a changed card may take a while to show on a link that was already shared.

### Routing

A catch-all route (`src/app/[...slug]/page.tsx`) handles all project URLs using category/project slug segments. Projects are registered in `src/shared/lib/constants.ts`.

### Multiplayer

Real-time multiplayer runs through **the relay**, Novelty World's own WebSocket server (`relay/`), on the Oracle machine (`infra/oracle/README.md`), and the small shared module `src/shared/lib/peer/` in the browser. Every player holds one WebSocket to the relay, which keeps the rooms and forwards each room's messages without reading them, so play works on any network that can load the site. A room is a **star**: one host, and guests that talk to the host only. A room is named by a short code, namespaced per game. There are three ways in: **host** a fresh code, **join** by code, or **claim** a fixed code, where the first to ask hosts and everyone after joins them (the RPG's single shared world; its guests re-elect a host the same way when the host leaves). The wire protocol both sides share is the module's `protocol.ts`; `npm run relay:deploy` builds the relay and installs it on the server.

The module owns **connection bookkeeping only**: codes, the relay's address, the star, the player list (profile id, name and peer id, kept by the host and shared with every guest), join/leave, host loss, connection status, typed send/broadcast, and React-safe setup and teardown (`useRoom` for components, `createRoom` for code outside React). It deliberately owns **no game semantics**: no state-sync engine, no action framework, no authority logic. Each game decides what its messages mean. The usual pattern is host-authoritative: guests send intents up, and the host validates them, applies them and sends the result down. A helper only one game needs stays in that game.

Everything in the browser is event-driven (the socket's `open` / `message` / `close`); there are no timers. The relay notices a player whose connection died without closing (a closed laptop lid, a phone that lost signal) by pinging every socket on a heartbeat and dropping one that missed a ping, which frees its room or its seat. The heartbeat is the liveness check itself, not a guard against a race.

The relay has no room discovery. A game that lists its open rooms, rather than asking for a typed code, uses the separate shared room list (`src/shared/lib/room-list/`, `useRoomList`): hosts advertise a listing over Supabase Realtime presence on a per-game lobby channel, and the lobby renders the live list with `GameLobby`'s `openRooms`. Frogmino and Connection Test use it. E2E runs never reach Supabase for it: the run's own relay also serves a local stand-in for that presence (`relay/room-list.ts`, only where `ROOM_LIST=local`, as the e2e run sets; the production relay has none), and `?room-list=local:<name>` (with `?relay=local:<port>`) puts a page's list there, on a list of the test's own, so no two tests see each other's rooms.

Monopoly is the exception: it is turn-based on one authoritative Supabase row, not on the relay.

### Shared code

Reusable components, hooks, and utilities live in `src/shared/`. Check there before building something new — use and extend what exists.

**Game controllers** go through `src/shared/lib/gamepad/`, on the browser Gamepad API. It is input-level only: it names the buttons and sticks of the W3C "standard" layout (Xbox names: A, LB, RT, View, Menu…), applies a radial stick deadzone, reports press/release edges, handles several pads by slot index, and rumbles where the browser can. Each game maps buttons to its own actions. A pad without the standard layout is exposed raw by index, never guessed at. Buttons fire no events in the Gamepad API, so the library reads the pads once per animation frame: that loop is the feature, not a race-condition timer, and it runs only while something listens and a pad is connected. Its pure core (snapshots in, readings and edges out) is unit-tested; the Controller Tester tool (`src/projects/controller-tester/`) shows everything it reports, live.

The library also gives **menus to controllers**: `usePadNavigation` moves a real DOM focus round the buttons and links under a screen's root, spatially (the d-pad or left stick, a held way repeating on the frame reads), with A pressing the one focused, B the screen's `data-pad-back` control and Menu its `data-pad-menu` one; a screen starts on its `data-pad-start` control. Text fields are passed by: a controller can't type. The focus shows only while a pad was the last thing used (the document's `data-pad-nav` mark, styled in `globals.css` from `--color-pad-focus`, which a project with its own style sets to one of its tokens), and the first press with it hidden only shows it. A screen whose buttons mean something of their own on a pad (a join screen) intercepts presses before the navigation sees them; a game turns it off while the pads are playing. `GameLobby` uses it, so every lobby built on it is a controller's, and `PadHints` (`src/shared/components/`) shows a screen's buttons while a pad is connected. A press is never heard by a screen it opened: listeners added mid-frame hear from the next frame, and what the pads hold is kept when the last listener leaves, so a button held into the next screen isn't a press there.

**Sound** goes through `src/shared/lib/sound/`, on ZzFX (Frank Force's MIT micro-synth, the `zzfx` package): sounds are designs of ZzFX parameters by name (one or more layers, a variation in pitch and volume, and a minimum gap so none machine-guns), rendered once into buffers and played through the page's one AudioContext, which the first key press, click or tap unlocks (the browser's autoplay policy; a controller's buttons don't count). Each game keeps its designs in one file, its own cues for when they play, its own sound board (`createSoundBoard`) and its mute and volume (`createSoundSettings`, kept per game in this browser), and a `?sounds` audition on the shared `SoundLab` (`src/shared/components/sound-lab.tsx`), where the owner judges them by ear. Frogmino and Risk use it; Frogmino's settings, with the music's own volume, are still its own.

**Input beside the controller** lives in `src/shared/lib/input/`, pure and shared by games that play on all three input methods (a controller, touch, and keyboard + mouse): the `InputKind` a screen tracks as the last one used, reading a hand (`gestures.ts`: tap or drag, two fingers' pinch, turn and tilt) and picking a choice under a pointer or the next one along (`navigate.ts`). **Button prompts** are `src/shared/components/prompts.tsx`: our own glyphs for keys, pad buttons and the mouse, and `PromptButton`. A game keeps its own map from a meaning to a control on each input, and paints the glyphs in its own tokens through the `--prompt-*` properties.

**Bot measurement** goes through `src/shared/lib/bot-lab/`, the game-agnostic core every game's bot gauntlet is built on (Monopoly's, Risk's). It holds a worker-thread pool generic over a game's runner module (games are pure functions of their spec, so a parallel run is bit-identical to a single-threaded one, and each game proves it with its own check); every call in flight feeds one queue of small chunks, so a tool plays all its pairings or matchups at once and no worker waits on one batch's slowest game, while each pairing still reads only its own results, in order, so playing at once changes nothing but wall time. It also holds the SPRT as a pair of one-sided tests (better / worse / even, never a symmetric test that promotes coin flips), with the table format's par mapped into Elo so one margin means the same edge at any player count, a Bradley–Terry Elo fit across a field (pairwise wins, or a multiplayer finishing order broken into pairs), and the gauntlet's pairing loop and crown gate (improves on its base and regresses against no one in the field). Each game keeps its own side: its runner, how a pairing's seats are filled, its bots, its field and its CLI. Monopoly's `bots/docs/METHOD.md` is the reasoning behind the method.

A measuring run can also play on other machines (`remote.ts`), such as GitHub Actions' runners: in rounds, each planned from the games played so far and split over the machines, and then the game's own tool is run once more, answering every game from the kept results instead of playing it, so the report is exactly a local run's. Risk's `docs/actions.md` is the one that does.

Every measuring run leaves a record in its game's committed run log (`run-log.ts`: what ran, on which commit, its wall time, games and decisions per second, the machine, and its CPU and peak memory sampled while it played), so the timeline shows how fast the bots, the engine and the tooling were. A run told to stop (Ctrl-C, a closed console) tears its worker pool down and exits. A run killed outright gets no signal, and its workers die only if its own process is killed: **an agent starts a long measuring run in the background from PowerShell, never Git Bash.** Stopping a PowerShell task kills the run's whole process tree; stopping a Git Bash task kills only a shell that Windows doesn't count as the run's parent, so the run plays on, on every core, with nobody reading.

**Ask before taking the owner's CPU.** Before starting anything that will hold most of the CPU for more than about ten minutes (bot gauntlets, ratings, tuning runs, big simulations), ask the owner first, saying what it is and roughly how long it takes. Permission given when a task starts ("overnight run", "you can use the whole machine") covers every heavy run that task needs, so don't stop to ask again; when delegating, write that permission into the agent's prompt in so many words, so no agent waits on an approval already given. Without permission, don't stall: do all the work that doesn't need the machine, then stop with the heavy run queued, its exact command ready and what it will tell us.

Every measuring run is also shown live on the **Bot Lab** page (`src/projects/bot-lab/`, in Tools), so a long run can be watched from a phone. The run's CLI publishes it through the reporter (`live.ts`): a row per run in `bot_lab_runs` (`supabase/bot-lab.sql`), written with the service-role key from `.env.local` and read by the page over Supabase Realtime, carrying a heartbeat, its steps (a gauntlet's pairings with their SPRTs, a ladder's matchups, a check's tables) as they change, and at the end its result and run-log record. The row's shape and the page's pure readings of it (stale detection among them) are `live-row.ts`. The sink is an interface, so tests keep rows in memory; without the keys a run plays unpublished and says so. A run told to stop publishes that before it exits (`onRunStop`); a run killed outright can't, so the page shows a running row whose heartbeat has gone quiet as lost.

### Credits

The site-wide credits page (`/credits`, linked quietly from the home page) lists third-party work the site shows: art, photos, fonts, icons, textures, sounds and data sets. Code libraries aren't listed. The `Credit` shape and site-wide credits live in `src/shared/lib/credits.ts`; each project that uses someone else's work keeps its own list in its `credits.ts`, registered in `src/app/credits/credit-groups.ts`. **Any change that adds a third-party asset must add its credit in the same change**, with the licence, the source and, when the licence requires a credit, its credit line (a test enforces that). Derive a project's credits from its own asset records where it has them, as Family Tree does from its symbol art, rather than keeping a second list.

### Database / Supabase SQL

This project does **not** use a migrations folder or the Supabase CLI. SQL lives as flat, idempotent files in `supabase/*.sql` (one per feature, e.g. `monopoly.sql`), written to be safely re-runnable (`create table if not exists`, `add column if not exists`, `drop policy if exists` before `create policy`).

To apply a SQL change to the remote project, run the file through `psql` against the **`aws-1-eu-north-1` pooler** (the only host that works on this network):

```bash
set -a && . ./.env.local && set +a && PGPASSWORD="$SUPABASE_DB_PASSWORD" psql "postgresql://postgres.${SUPABASE_PROJECT_REF}@aws-1-eu-north-1.pooler.supabase.com:5432/postgres" -f supabase/<file>.sql
```

Verify with `... -c "\d public.<table>"`. Editing a `supabase/*.sql` file is not enough — you must re-run it for the change to hit the database. Do **not** use the direct `db.<ref>.supabase.co` host (IPv6-only, DNS fails here), the `aws-0-` pooler, or `supabase db push` (CLI auth conflicts) — they don't work on this setup.

**Authoritative server writes:** game tables are locked read-only at the RLS layer (a `select` policy only, no write policy). The single writer is a Next.js route handler (e.g. `src/app/api/monopoly/route.ts`) using the service-role client (`src/shared/lib/supabase/server-admin.ts`, keyed by `SUPABASE_SERVICE_ROLE_KEY`), which bypasses RLS. Clients read and subscribe via the anon key but cannot write directly.

### Styling

Tailwind CSS v4. Novelty World's own visual identity, the home page, shared UI and site chrome, is colorful, bold, fun, and quirky; lean into that there. The design system tokens (brand colors, surfaces, text, borders) are defined in `globals.css`.

**Show, don't tell.** The owner would rather see information than read it: prefer icons, symbols, colour with a second cue, bars, counts and position over words. Text is for what only text can say (names, a rule's explanation behind a "why"), and a label that repeats what a symbol already shows is cut. Every symbol still needs an accessible name, and a meaning that isn't obvious gets a tooltip or a "why", not a caption.

**Games animate regardless of the OS's reduced-motion setting.** In a game, motion carries information (a roll, a capture, an army on the move), so a game ignores `prefers-reduced-motion`; if a player ever needs less motion, the game offers its own setting. Tools and the site's chrome still honour the OS preference.

**A project may have its own style.** When a project's goals are better served by its own visual direction, its style overrides the repo's within that project. For example, a game with an identifiable aesthetic of its own gets its own style. A tool or idea that doesn't need to carry its own aesthetic reuses the repo's style.

**Rule: Never use raw Tailwind color classes (e.g. `text-sky-400`, `bg-red-500`) or hardcoded hex values.** All colors come from semantic tokens: the ones defined in `globals.css` (`text-text`, `bg-surface`, etc.), or, for a project with its own style, that project's own tokens, defined once and scoped to the project. This keeps each design system a single source of truth.

## Code Style

### Lint must be clean — treat warnings as design signals

**Rule: `npm run lint` must produce zero errors and zero warnings.** Our lint config is strict on purpose (no `any`, no unnecessary conditions, etc.). When lint flags a line, resist the urge to silence it with a one-line patch (a cast, a disable comment, a throwaway rename). Stop and ask: *why* is the linter unhappy? The flagged line is usually a symptom — the real problem is often a design issue one or two levels up (wrong type at the boundary, a function doing two things, state living in the wrong place, a missing abstraction). Fix the underlying cause so the warning goes away naturally.

**Rule: Suppressing a lint rule (`eslint-disable`, `// @ts-expect-error`, etc.) requires strong justification and an inline `--` description explaining it.** Suppression is a last resort, not a shortcut. Only suppress when you've concluded the rule genuinely does not apply to this specific case (e.g. `<img>` inside `next/og`'s `ImageResponse`, which Satori requires) — and write *why* directly next to the disable comment in the form `// eslint-disable-next-line some-rule -- reason here`. "Lint was noisy" is not a justification. This is mechanically enforced by `@eslint-community/eslint-comments/require-description` — an undescribed disable will fail lint.

### Fail loudly — don't guard around bugs you don't understand

**Rule: never add a guard, catch, or fallback that mitigates an issue whose root cause isn't fully understood.** Mitigation written on partial understanding is how sloppy code accumulates: it mutes the signal, hides the bug from the next investigation, and outlives its justification once the real cause is fixed. When something breaks, do one of two things: **fail loudly**, or add **diagnosis tooling** (targeted logging, state capture, tagging) that isolates the root cause — then land the proper fix and clean the diagnostics up once you're confident the issue is solved. Never ship the workaround to the user (e.g. "reload the page" for a bug in our code) — a broken experience caused by our code is ours to fix, not the user's to route around.

### Docs describe concepts — references must fail loudly

**Rule: docs and CLAUDE.md explain concepts and invariants; they never duplicate code.** Never cite line numbers, and never paste real code into prose — a copied snippet forks the truth and rots silently, and so does prose that narrates today's implementation detail. When an example helps, make it generic and inline (shaped like code, referencing nothing real). Naming real things follows stability: file/module names are the routing map and are encouraged; exported symbol names are fine where routing matters, because a rename makes the reference fail a grep — staleness that announces itself. When renaming or moving anything, grep the docs for the old name in the same change.

**Rule: docs state what is decided, not when.** No decision dates, "as of" stamps or change logs in CLAUDE.md, skills, commands or design docs: what's decided is decided, and git history holds the when. Dates stay only where the date is the data: a measurement's context, a record's `asOf`, or a log whose whole point is the timeline.

### Speed is measured by counting work, not by a clock

**Rule: never decide whether something is faster from timings on a shared machine.** The laptop is shared, and it throttles as it heats. A GitHub Actions runner shares hardware with strangers and is a different CPU from job to job. A timing measures the machine as much as the code, and checking the load or the temperature first can't make it proof. So:

- **Count the work.** Use the code's own counts of what it does: items processed, draw calls and triangles in a frame, allocations, steps of a simulation. For native code, use the instructions executed under a deterministic counter (Valgrind's Cachegrind or Callgrind, which run in WSL). These repeat exactly, or to a fraction of a percent, so a 2% change shows and no result needs a rerun.
- **Where only time can answer**, measure a ratio, never a time. This covers JIT-compiled code, where an instruction count means little, and comparisons across languages or runtimes. Run both sides alternated in pairs, on one machine, in one sitting, many pairs, and report the ratio with its spread. A time from one run is never compared with a time from another.
- **A wall-clock time may be reported as context**, with the machine it ran on, never as the evidence for a decision.

### Tests never rely on a network connection

**Rule: no test, unit or e2e, may depend on anything outside this machine.** A test that reaches the live database, the production relay or any internet service fails when the network does, writes into real data, and measures someone else's server. Servers a test run starts for itself on localhost (the e2e app server, the local relay) are fine; external services are replaced by local stand-ins the run controls. The shared room list is one: e2e runs list rooms on the local relay's stand-in for Supabase presence (see Multiplayer).

### Code, tests and tools wait for EVENTS, not clocks

**Rule: never use a timer, delay, clock-based retry or polling loop to handle a race condition or a flaky test, in app logic or in tests.** This matters most in networking and async code. A race is an ordering bug, and the fix is correct ordering: register handlers before starting what fires them, queue work until the event that makes it valid (a connection's `open`, a promise resolving), and derive "ready" from events, never from elapsed time. Timers that are the feature itself (a game's countdown, an animation frame loop) are fine; a timer whose job is to let something else "probably finish first" never is.

**Rule: never wait an arbitrary duration (`waitForTimeout`, `sleep`, `setTimeout`-as-delay) in tests or automated tools.** A fixed sleep hides race conditions (it passes until the machine is slow, then flakes) and makes every run slower than it needs to be. Whatever you're waiting *for* has an observable event — wait on that instead: a readiness predicate (`waitForFunction` on an `isReady()`), a frame counter advancing (Shipwright exposes `__shipwright.frameCount()` because "a rendered frame" is the real event a screenshot needs), an element appearing, a promise resolving, a message arriving. A test never waits for a state that lasts only a moment: it freezes the clock first. If a wait target genuinely doesn't exist yet, expose one from the app rather than guessing a number — that's what `isReady()` replacements of hardcoded sleeps are. (Some older Shipwright perf tools still carry settle-sleeps; they're a refactor target, not a pattern to copy.)

### There are no flaky tests

**Rule: a test that fails intermittently is a broken test, and it is fixed.** Passing on a rerun or in isolation proves nothing about the ordering that failed: the intermittence is a real non-determinism (an effect racing an assertion, state shared across cases, a timer leaking from a neighbour), and the fix is its root cause, in the test or in the code, never a retry, a longer timeout, a skip, or a note that it is "unrelated to this branch". It is found by reasoning about the code to a named cause, and fixed on the branch that saw it fail, before that branch lands. Repeated runs are a last resort for testing one specific hypothesis, never the proof: a pass on repetition shows only that the race didn't fire that time.

**Rule: a timeout is a claim about speed, so first rule out a machine without capacity.** Several agents and sessions often test at once on this machine, and when they saturate it, correct tests miss their timeouts. Before treating a timeout as a defect, run `npm run load`: it reports CPU use and the test runs in progress, and in which checkout. If other runs have the machine saturated, the timeout says nothing about the test yet. Don't rerun it in a loop, which only adds load: wait for capacity, or agree with the other agents and sessions who runs what, then rerun that one file once. A timeout that repeats on a machine with capacity is a real failure.
