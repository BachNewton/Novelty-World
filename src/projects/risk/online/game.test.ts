import { describe, expect, it } from "vitest";
import { EMPTY_CLIENT, reduce, shown, type SyncEvent } from "@/shared/lib/client-sync";
import { createRng } from "@/shared/lib/seeded-random";
import type { Answer } from "../contract";
import { randomBot } from "../bots/random";
import { botInput } from "./drive-input";
import { ANSWERS_KEPT, applyAnswer, newOnlineGame, pendingSeat, STALE_DECISION, syncRules, tookAnswer, type OnlineGame } from "./game";
import { ENGINE } from "../play-engine";

const RULES = syncRules(ENGINE);

/** A game played from its start by random answers: `games[i]` after `answers[i - 1]`. */
function history(seed: string, length: number): { games: OnlineGame[]; answers: Answer[] } {
  const games = [newOnlineGame(ENGINE, 3, seed)];
  const answers: Answer[] = [];
  for (let i = 0; i < length; i++) {
    const game = games[i];
    const seat = pendingSeat(ENGINE, game);
    if (seat === null) throw new Error("The game ended early");
    const answer = { decision: game.decision, seat, move: randomBot(botInput(ENGINE, game, seat, `${seed}/${i.toString()}`)) };
    const result = applyAnswer(ENGINE, game, answer);
    if (!result.ok) throw new Error(result.reason);
    answers.push(answer);
    games.push(result.game);
  }
  return { games, answers };
}

describe("an online game", () => {
  it("takes an answer only to the pending decision", () => {
    const { games, answers } = history("pending", 2);
    expect(applyAnswer(ENGINE, games[1], answers[0])).toEqual({ ok: false, reason: STALE_DECISION });
    expect(applyAnswer(ENGINE, games[0], { ...answers[0], decision: 1 })).toEqual({ ok: false, reason: STALE_DECISION });
  });

  it("gives every event an id from the decision it answered", () => {
    const { games } = history("ids", 3);
    expect(games[3].lastEvents.every((e) => e.id.startsWith("2:"))).toBe(true);
  });

  it("recognises an answer it took, and keeps a bounded ledger", () => {
    const { games, answers } = history("ledger", ANSWERS_KEPT + 4);
    const last = games[games.length - 1];
    expect(last.answered).toHaveLength(ANSWERS_KEPT);
    expect(tookAnswer(last, answers[answers.length - 1])).toBe(true);
    expect(tookAnswer(last, answers[0])).toBe(false);
  });

  it("recognises an answer it took whatever order the move's keys come back in, as the database returns them", () => {
    const { games, answers } = history("key-order", 1);
    const answer = answers[0];
    const reordered = { ...answer, move: Object.fromEntries(Object.entries(answer.move).reverse()) as typeof answer.move };
    expect(JSON.stringify(reordered.move)).not.toBe(JSON.stringify(answer.move));
    expect(tookAnswer(games[1], reordered)).toBe(true);
  });

  it("computes on a phone the same dice the server will, battles included", () => {
    // Long enough to reach attacks: a phone's local apply and the server's are the same function of the same state.
    const { games, answers } = history("dice", 120);
    expect(games.some((g) => g.lastEvents.some((e) => e.event.kind === "battle"))).toBe(true);
    let client = reduce(RULES, EMPTY_CLIENT, { type: "server-state", version: 0, state: games[0] });
    for (const answer of answers) client = reduce(RULES, client, { type: "local-action", action: answer });
    expect(shown(RULES, client)).toEqual(games[games.length - 1]);
  });
});

describe("Risk's client sync", () => {
  // However answers and echoes arrive (twice, out of order, or not at all), the phone shows
  // exactly the game its own answers make and plays each event once.
  it.each(Array.from({ length: 12 }, (_, i) => `property-${i.toString()}`))("survives duplicated, reordered and dropped updates (%s)", (seed) => {
    const rng = createRng(seed);
    const below = (n: number) => Math.floor(rng.next() * n);
    const length = 6 + below(20);
    const { games, answers } = history(seed, length);
    let client = reduce(RULES, EMPTY_CLIENT, { type: "server-state", version: 0, state: games[0] });
    const pool: SyncEvent<OnlineGame, Answer>[] = [];
    let taken = 0;
    while (taken < length || pool.length > 0) {
      if (taken < length && (pool.length === 0 || rng.next() < 0.5)) {
        const action = answers[taken];
        client = reduce(RULES, client, { type: "local-action", action });
        taken++;
        pool.push({ type: "accepted", action, version: taken, state: games[taken] }, { type: "server-state", version: taken, state: games[taken] });
      } else {
        const event = pool[below(pool.length)];
        const roll = rng.next();
        if (roll < 0.2 || roll >= 0.5) pool.splice(pool.indexOf(event), 1);
        if (roll >= 0.2) client = reduce(RULES, client, event);
      }
      expect(shown(RULES, client)).toEqual(games[taken]);
      const ids = client.feed.map((event) => event.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("drops a queued answer another device of the same seat already gave", () => {
    const { games, answers } = history("other-device", 1);
    let client = reduce(RULES, EMPTY_CLIENT, { type: "server-state", version: 0, state: games[0] });
    client = reduce(RULES, client, { type: "local-action", action: answers[0] });
    const options = ENGINE.options(games[0].engine, answers[0].seat);
    if (options?.kind !== "setup-place") throw new Error("Expected setup");
    const elsewhere = applyAnswer(ENGINE, games[0], { ...answers[0], move: { kind: "place", territory: options.ownTerritories.at(-1) ?? "alaska", armies: 1 } });
    if (!elsewhere.ok) throw new Error(elsewhere.reason);
    client = reduce(RULES, client, { type: "server-state", version: 1, state: elsewhere.game });
    expect(client.queue).toEqual([]);
    expect(shown(RULES, client)).toEqual(elsewhere.game);
  });
});
