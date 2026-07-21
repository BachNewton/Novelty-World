// Fable-in-the-loop stepped game runner — lets a MODEL (or any external agent)
// play one seat against bot opponents, one decision at a time, with the game
// state persisted between invocations. The played seat gets the SAME decision
// surface a bot policy has: it is consulted wherever the pacer would consult a
// bot (reactive phases, its own pre-roll for proactive arms, intermissions it
// opened), and its reasoning rides along as bot-note events so the transcript
// reads like a reviewed game (`game:review` style).
//
// This is an L5 instrument (see bots/LEAPS.md): it generates human-SHAPED
// adversarial games on demand — a probe, not a training-data generator. The
// full probe METHODOLOGY (the lessons of probe games 1–9, the player-agent
// prompt template, the triage discipline) is the `/monopoly-probe` command.
//
// Usage (state lives in a JSON file you pass around):
//   npx tsx src/projects/monopoly/bots/played-cli.ts new  <file> [seed] [oppLabel]
//   npx tsx src/projects/monopoly/bots/played-cli.ts show <file>
//   npx tsx src/projects/monopoly/bots/played-cli.ts act  <file> pass [note ...]
//   npx tsx src/projects/monopoly/bots/played-cli.ts act  <file> '<intent JSON>' [note ...]
//
// `pass` is only meaningful where a bot returning null lets the pacer proceed
// (own pre-roll → roll; jail-decision → roll for doubles). Everywhere else the
// runner pauses again and asks for a real intent. A rejected intent does NOT
// advance the game — the reason is printed and the same decision reprompts.
import { readFileSync, writeFileSync } from "node:fs";
import { apply, autoStep, netWorth } from "../../engine";
import { spaceName } from "../../logic";
import { freshGame } from "../../mocks";
import { driveOp, type BotResolver } from "../../pacing";
import type { Bot } from "../decision";
import type { GameState, Intent } from "../../types";
import { renderHighlight } from "./render-log";
import { versionBot } from "../versions";

const HIGHLIGHT_KINDS = new Set([
  "bot-note",
  "buy",
  "auction",
  "build",
  "sell-building",
  "mortgage",
  "unmortgage",
  "trade",
  "trade-declined",
  "bankrupt",
  "winner",
  "rent",
  "go-to-jail",
]);

/** Thrown by the played seat's sentinel bot when the agent must decide. */
class NeedsInput extends Error {}

interface SavedGame {
  playedId: string;
  oppLabel: string;
  seed: string;
  state: GameState;
}

function save(file: string, game: SavedGame): void {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- operator-supplied state file for an offline dev tool, not a server input.
  writeFileSync(file, JSON.stringify(game));
}

function load(file: string): SavedGame {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- operator-supplied state file for an offline dev tool, not a server input.
  return JSON.parse(readFileSync(file, "utf8")) as SavedGame;
}

/** Drive the game forward until the played seat must decide, the game ends, or
 *  the loop stalls. `passOnce` makes the sentinel answer null exactly once (the
 *  agent chose "pass" at its own pre-roll / jail decision). */
function drive(
  game: SavedGame,
  passOnce: boolean,
): { state: GameState; paused: boolean; stalled: string | null } {
  const opp = versionBot(game.oppLabel);
  let allowPass = passOnce;
  const sentinel: Bot = (s, pid) => {
    if (s.turn.phase === "pre-roll" && s.turn.playerId !== pid) return null;
    if (allowPass) {
      allowPass = false;
      return null;
    }
    throw new NeedsInput();
  };
  const resolver: BotResolver = (_s, pid) => (pid === game.playedId ? sentinel : opp);

  let state = game.state;
  let steps = 0;
  while (state.status === "active" && steps < 200_000) {
    let op;
    try {
      op = driveOp(state, true, null, resolver);
    } catch (e) {
      if (e instanceof NeedsInput) return { state, paused: true, stalled: null };
      throw e;
    }
    if (op === null) {
      // A null drive op is the HUMAN-marked seat's decision point (driveOp
      // doesn't proxy a null-marker seat). "pass" plays the mechanical beat
      // the human's own client would drive (roll / jail roll) via autoStep.
      if (allowPass) {
        allowPass = false;
        const next = autoStep(state).state;
        if (next === state) {
          return { state, paused: true, stalled: `no-op step at phase "${state.turn.phase}"` };
        }
        state = next;
        steps++;
        continue;
      }
      return { state, paused: true, stalled: null };
    }
    if (op.kind === "step") {
      const next = autoStep(state).state;
      if (next === state) {
        return { state, paused: true, stalled: `no-op step at phase "${state.turn.phase}"` };
      }
      state = next;
    } else {
      if (op.note !== undefined) {
        const noted = apply(state, {
          kind: "bot-note",
          playerId: op.intent.playerId,
          text: op.note,
        });
        if (noted.ok) state = noted.state;
      }
      const applied = apply(state, op.intent);
      if (!applied.ok) {
        return {
          state,
          paused: true,
          stalled: `bot intent "${op.intent.kind}" rejected: ${applied.reason}`,
        };
      }
      state = applied.state;
    }
    steps++;
  }
  return { state, paused: false, stalled: null };
}

function nameOf(state: GameState): (id: string | null) => string {
  const names = new Map(state.players.map((p) => [p.id, p.name]));
  return (id) => (id === null ? "bank" : (names.get(id) ?? id));
}

function holdings(state: GameState, pid: string): string {
  const lots: string[] = [];
  for (const [posStr, owner] of Object.entries(state.ownership)) {
    if (owner !== pid) continue;
    const pos = Number(posStr);
    const dev = state.houses[pos] ?? 0;
    const tags = [
      state.mortgaged[pos] ? "MORTGAGED" : "",
      dev === 5 ? "HOTEL" : dev > 0 ? `${dev.toString()}h` : "",
    ]
      .filter(Boolean)
      .join(",");
    lots.push(`${spaceName(pos)} (#${posStr}${tags.length > 0 ? ` ${tags}` : ""})`);
  }
  return lots.length > 0 ? lots.join(", ") : "(none)";
}

const PHASE_HINTS: Readonly<Partial<Record<string, string>>> = {
  "pre-roll":
    'your pre-roll: "pass" to roll, or arm {"kind":"set-queue","playerId":ME,"queue":"trade"|"manage","armed":true}',
  "buy-decision":
    '{"kind":"buy","playerId":ME} | {"kind":"decline-buy","playerId":ME} | {"kind":"raise-cash","playerId":ME} (then stage sells/mortgages, commit with buy)',
  auction: '{"kind":"bid","playerId":ME,"amount":N} (absolute) | {"kind":"pass-bid","playerId":ME}',
  "jail-decision":
    '"pass" to roll for doubles | {"kind":"pay-to-leave-jail","playerId":ME} | {"kind":"use-jail-card","playerId":ME}',
  "trade-pending":
    '{"kind":"accept-trade","playerId":ME,"tradeId":ID} | {"kind":"decline-trade","playerId":ME,"tradeId":ID}',
  "trade-building":
    '{"kind":"update-trade-draft","playerId":ME,"terms":{propertyTo,gojfTo,cashDelta}} then {"kind":"propose-trade","playerId":ME} | {"kind":"cancel-trade","playerId":ME}',
  managing:
    '{"kind":"update-manage-staging","playerId":ME,"staged":{build,mortgage}} then {"kind":"manage","playerId":ME,"build":{pos:level},"mortgage":{pos:bool}} | {"kind":"cancel-manage","playerId":ME}',
  "must-raise-cash":
    'stage then {"kind":"manage","playerId":ME,...} or single {"kind":"mortgage","playerId":ME,"position":N} until cash ≥ 0',
  "raising-cash":
    '{"kind":"update-manage-staging",...} then {"kind":"buy","playerId":ME} | {"kind":"cancel-manage","playerId":ME}',
};

function printContext(game: SavedGame, stalled: string | null): void {
  const { state, playedId } = game;
  const nm = nameOf(state);
  console.log("=".repeat(72));
  if (state.status !== "active") {
    const winner = state.players.find((p) => !p.bankrupt);
    console.log(`GAME OVER — winner: ${winner ? `${winner.name} (${winner.id})` : "none"}`);
  } else {
    const t = state.turn;
    console.log(
      `phase: ${t.phase}   active: ${nm(t.playerId)} (${t.playerId})   you: ${nm(playedId)} (${playedId})`,
    );
    if (stalled !== null) console.log(`NOTE: paused on stall — ${stalled}`);
  }
  console.log(`turn ${state.turns[state.turns.length - 1].turn.toString()}`);
  for (const p of state.players) {
    const you = p.id === playedId ? "  <== YOU" : "";
    const dead = p.bankrupt ? " BANKRUPT" : "";
    console.log(
      `  ${p.name.padEnd(8)} (${p.id}) cash $${p.cash.toString()} net $${netWorth(state, p.id).toString()} @${spaceName(p.position)}${p.inJail ? " [JAIL]" : ""}${dead}${you}`,
    );
    console.log(`    ${holdings(state, p.id)}`);
  }
  if (state.turn.pendingTrade) {
    console.log(`pending trade: ${JSON.stringify(state.turn.pendingTrade)}`);
  }
  if (state.turn.auction) {
    console.log(`auction: ${JSON.stringify(state.turn.auction)}`);
  }
  if (state.turn.manageStaged) {
    console.log(`manage staging: ${JSON.stringify(state.turn.manageStaged)}`);
  }
  const recent = state.turns
    .flatMap((g) => g.events.filter((e) => HIGHLIGHT_KINDS.has(e.kind)).map((e) => ({ turn: g.turn, actorId: g.playerId, event: e })))
    .slice(-25);
  console.log("--- recent events ---");
  for (const h of recent) console.log(renderHighlight(h, nm));
  if (state.status === "active") {
    const hint = PHASE_HINTS[state.turn.phase];
    if (hint !== undefined) console.log(`--- your options (ME = "${playedId}") ---\n${hint}`);
  }
  console.log("=".repeat(72));
}

function main(): void {
  const [cmd, file, ...rest] = process.argv.slice(2);
  if (cmd === "new") {
    // --human marks the played seat as a REAL human (`botStrategy: null`), so
    // policies with human-counterparty gates (fable-v11+) treat it as one.
    // Without it the seat carries a bot marker (the pre-v11 probe behavior).
    // A null-marker seat is not proxied by driveOp, so the runner pauses on
    // the null drive op instead of the sentinel throw — same surface.
    const human = rest.includes("--human");
    const args = rest.filter((a) => a !== "--human");
    const seed = args[0] ?? `played-${Math.floor(Date.now() / 1000).toString()}`;
    const oppLabel = args[1] ?? "fable-v2";
    versionBot(oppLabel); // fail loud on a typo before creating the file
    const base = freshGame(seed, undefined, 4);
    const players = base.players.map((p, i) => ({
      ...p,
      botStrategy: human && i === 0 ? null : oppLabel,
    }));
    const game: SavedGame = {
      playedId: players[0].id,
      oppLabel,
      seed,
      state: { ...base, players },
    };
    const driven = drive(game, false);
    game.state = driven.state;
    save(file, game);
    printContext(game, driven.stalled);
    return;
  }
  if (cmd === "show") {
    const game = load(file);
    printContext(game, null);
    return;
  }
  if (cmd === "act") {
    const game = load(file);
    const action = rest[0];
    const note = rest.slice(1).join(" ");
    if (note.length > 0) {
      const noted = apply(game.state, { kind: "bot-note", playerId: game.playedId, text: note });
      if (noted.ok) game.state = noted.state;
    }
    let passOnce = false;
    if (action === "pass") {
      passOnce = true;
    } else {
      const intent = JSON.parse(action) as Intent;
      const applied = apply(game.state, intent);
      if (!applied.ok) {
        console.log(`REJECTED: intent "${intent.kind}" — ${applied.reason}`);
        printContext(game, null);
        process.exitCode = 1;
        return;
      }
      game.state = applied.state;
    }
    const driven = drive(game, passOnce);
    game.state = driven.state;
    save(file, game);
    printContext(game, driven.stalled);
    return;
  }
  console.log(
    "usage: played-cli.ts new <file> [seed] [oppLabel] | show <file> | act <file> <pass|intentJSON> [note ...]",
  );
  process.exitCode = 1;
}

main();
