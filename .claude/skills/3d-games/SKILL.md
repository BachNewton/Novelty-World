---
name: 3d-games
description: The playbook for building a 3D game in the browser here, in any project, including games not yet in the repo. It holds what the 3D games have learned, as principles with their reasons: facts about the platform (WebGPU, WebGL, three.js, GPUs, the browser), methods for building and verifying, and the tradeoffs a game settles by its own goals. Use it when starting a 3D game, and whenever a task touches rendering, shaders, lighting, performance, level of detail, streaming, models and animation, the camera, input in 3D, or checking how a frame looks or what it costs. Read it before the first design decision, and add to it when a game proves something new.
---

# 3D games here

## What this is

Every 3D game here starts fresh: its own architecture, its own look, chosen for its own goals by the best model of the day. What carries from one game to the next is not code but understanding: why something worked, why something failed, what forces pull a decision each way. This skill holds that understanding.

It is a playbook, not an engine. Nothing here is a rule a game obeys. Each entry is a principle with the mechanism that makes it true, so a game reasons from it, and a later model can judge whether the mechanism still holds. Entries never name a project, a file or a past example: a principle stands on its reasoning, not on where it was learnt, and an example goes stale while a mechanism doesn't.

## The four kinds of entry

- **Platform facts** (`references/platform.md`): how the browser, the GPU, WebGPU, WebGL and three.js behave. True whatever the game looks like, until the platform changes. Facts that depend on a renderer or library version say so, and are checked again after an upgrade.
- **Methods** (`references/methods.md`): how to structure, build, measure and verify a 3D game so its claims are exact and its work is checkable.
- **Tradeoffs** (`references/tradeoffs.md`): decisions where sound reasons pull opposite ways. Each names the forces on each side and the goal that tips them. The playbook never settles a tradeoff; the game does.
- **Open questions** (`references/open.md`): what isn't known yet, and what would settle it.

Each entry says how it is known: **measured** (a count or a pixel diff), **hit** (it broke, and the mechanism was found), **judged** (the owner judged the result by eye) or **reasoned** (argued, not yet tested). Reasoned entries carry less weight, and a game that tests one promotes or corrects it.

## Starting a 3D game

1. **Write the game's goals first**, in its own `CLAUDE.md`, before any architecture: who it is for, the floor device and the inputs, the look (stylised or realistic, built in code or from asset packs), the world's scale and whether it streams, real-time or turn-based, solo or multiplayer, how long the game is meant to live. These are what every tradeoff is settled by.
2. **Read the platform facts and methods.** They apply unless the game's situation removes their mechanism.
3. **Settle each tradeoff the game meets** by its goals, and write the choice and its reason into the game's `CLAUDE.md`. Two games choosing opposite sides of a tradeoff can both be right.
4. **Disagree openly.** A game that finds a principle wrong, or wrong for its situation, says why in its own doc and corrects the playbook in the same change (below).

## Keeping the playbook true

- **Add what a game proves**, when a slice of work finishes: a fact that broke something, a method that made a claim exact, a tradeoff whose forces became clear. Write it as a principle: the mechanism, then how it is known. No project names, file names, dates or specific numbers, unless a number is a durable fact about the platform.
- **When lessons disagree**, find out which case it is. Usually they serve different goals: then it is a tradeoff, written with both sides. If they share a goal and still disagree, one is wrong: settle it by measurement and keep the survivor, or record it as an open question with what would settle it. A platform fact that stops holding usually means the platform changed: check its mechanism again.
- **Delete what turns out wrong**, and narrow what turns out to hold only in some situations. Git keeps the history; the playbook keeps only what is believed now.
- **Only lasting understanding belongs here.** A game's own decisions stay in its own `CLAUDE.md`. A one-off fix, or a convention picked for convenience, is not a lesson.
