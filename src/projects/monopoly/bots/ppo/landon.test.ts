import { afterEach, describe, expect, it } from "vitest";
import { freshGame } from "../../mocks";
import type { GameState } from "../../types";
import { bundlePath, readAsset } from "./assets";
import { DEFAULT_BUNDLE_PREFIX, landonBot, landonBotAsync, prefetchLandonBundle } from "./landon";

// ---------------------------------------------------------------------------
// WHERE THE WEIGHTS COME FROM, per runtime.
//
// These bots execute in the PLAYER'S BROWSER — the API route is a pure CAS writer
// that never invokes a policy — and they are resolved SYNCHRONOUSLY, by
// `botFor(p.botStrategy)` inside the pacer, with nowhere to await a load. Those
// two facts together are the whole difficulty, and the failure they produced was
// silent: the registry entry was the FILESYSTEM loader, its one impossible
// synchronous attempt in a browser latched `failed`, and the seat then answered
// `null` on every decision for the rest of the session. `null` is a legal answer
// (the pacer substitutes the phase default), so a seat set to `landon-v1` was
// indistinguishable from a seat playing defaults — no error, no log line, no
// crash. A Playwright run measured it as "answered on NONE of 12 consultations".
//
// So the contract this file pins is not "the bot plays" — `bot.test.ts` covers
// that. It is:
//
//   * a browser closure answers `null` while the weights are in flight, and PLAYS
//     THEM once they land, including when some OTHER caller did the loading;
//   * a load that cannot succeed is latched, so a broken bundle is not refetched
//     on every consultation (a bot is consulted several times per second);
//   * a load that merely failed this time is NOT latched;
//   * Node still loads synchronously on call one, because `sim:gauntlet` resolves
//     bots inside worker threads and has no seam to await anything in.
//
// The browser is simulated by removing the only thing that distinguishes it: a
// synchronous filesystem. See `BUNDLER_PROCESS` — the point is that `process`
// stays PRESENT, because in a real client bundle it is.
// ---------------------------------------------------------------------------

const BUNDLE = "landon-v1";

// ---------------------------------------------------------------------------
// A browser, made out of the absence of Node.
// ---------------------------------------------------------------------------

const REAL_PROCESS = globalThis.process;
const REAL_FETCH = globalThis.fetch;

/** The `process` a client bundler injects. Webpack — and therefore Next —
 *  supplies exactly this so a dependency reading `process.env.X` at module scope
 *  does not explode, and the e2e harness has to inject the same shim because an
 *  archived bot statically imports `node:process`. It has `env`, and it does NOT
 *  have `getBuiltinModule`. Anything branching on `typeof process` reads this as
 *  Node and loses; that is precisely what this stands in for. */
const BUNDLER_PROCESS = { env: {}, argv: [], platform: "browser" };

interface Net {
  /** Every URL the page asked for, in order. */
  readonly urls: string[];
  serve(url: string): Promise<Response>;
}

/** A `fetch` that serves bundles out of the asset tree, with a hook to fail. The
 *  last two path segments are `<bundle>/<entry>`, whatever prefix precedes them —
 *  which is what lets each test key its own cache slot by using its own prefix. */
function assetNet(status: () => number = () => 200): Net {
  const urls: string[] = [];
  return {
    urls,
    serve(url) {
      urls.push(url);
      const code = status();
      if (code !== 200) {
        return Promise.resolve(new Response(null, { status: code, statusText: `simulated ${String(code)}` }));
      }
      const parts = url.split("/");
      const bytes = readAsset(bundlePath(parts[parts.length - 2], parts[parts.length - 1]));
      // Re-wrapped rather than passed straight through: `readAsset` hands back a
      // `Uint8Array<ArrayBufferLike>`, and a `Response` body has to be backed by a
      // plain `ArrayBuffer`. Copying is also closer to a real download, which
      // never shares memory with the source.
      return Promise.resolve(new Response(new Uint8Array(bytes)));
    },
  };
}

function enterBrowser(net: Net): void {
  Object.defineProperty(globalThis, "process", {
    value: BUNDLER_PROCESS,
    configurable: true,
    writable: true,
  });
  globalThis.fetch = ((input: URL | RequestInfo) => net.serve(String(input))) as typeof fetch;
}

function leaveBrowser(): void {
  Object.defineProperty(globalThis, "process", {
    value: REAL_PROCESS,
    configurable: true,
    writable: true,
  });
  globalThis.fetch = REAL_FETCH;
}

afterEach(leaveBrowser);

/** How many bundle loads were STARTED under a prefix. Counted by manifest
 *  requests: every load reads the manifest exactly once, and it is the one entry
 *  the content-addressed cache never answers — a payload file can legitimately be
 *  served out of the cache a previous test warmed, since the key is its own
 *  digest and the prefix it arrived over is irrelevant. */
function loadsStarted(net: Net, prefix: string): number {
  return net.urls.filter((u) => u.startsWith(`${prefix}/`) && u.endsWith("manifest.json")).length;
}

/** A board where the policy has a real choice and a definite answer: the turn
 *  seat is being offered a lot that completes nothing, with two of the oranges
 *  already owned. A phase where a loaded bot answering `null` would itself be a
 *  finding is what makes "answered / did not answer" a clean signal. */
function buyDecision(): GameState {
  const base = freshGame("landon-loader");
  return {
    ...base,
    ownership: { 16: "p1", 18: "p1" },
    turn: { ...base.turn, phase: "buy-decision", pendingBuy: 19 },
  };
}

describe("where the learned bot gets its weights", () => {
  // -------------------------------------------------------------------------
  // The defect itself.
  // -------------------------------------------------------------------------

  it("browser: a closure that answered null starts playing once the weights land", async () => {
    enterBrowser(assetNet());
    const bot = landonBot({ bundle: BUNDLE });
    const board = buyDecision();
    const seat = board.turn.playerId;

    // Nothing is resident yet, so the contract's escape hatch: the pacer plays
    // this seat's phase default. Correct, and the only thing a synchronous `Bot`
    // can do with a 13.6 MB bundle.
    expect(bot(board, seat), "no weights yet").toBeNull();

    // The bundle now lands by a route this closure did not drive — the awaitable
    // loader a lobby can call. That is the interesting case: the closure has to
    // notice a load it did not itself perform.
    const awaited = await landonBotAsync(DEFAULT_BUNDLE_PREFIX, { bundle: BUNDLE });
    const reference = awaited(board, seat);
    expect(reference, "the weights themselves are fine").not.toBeNull();

    // THE ASSERTION. The shipped loader failed here: one impossible synchronous
    // attempt set `failed`, and this closure answered `null` for the rest of the
    // session no matter what else succeeded.
    expect(bot(board, seat), "the same closure, after the bundle landed").toEqual(reference);
  });

  // -------------------------------------------------------------------------
  // What it does while it waits.
  // -------------------------------------------------------------------------

  it("browser: it answers null while its own fetch is in flight, and downloads once", async () => {
    const net = assetNet();
    enterBrowser(net);
    const prefix = "/inflight";
    const bot = landonBot({ bundle: BUNDLE, prefix });
    const board = buyDecision();
    const seat = board.turn.playerId;

    // Two consultations on ONE board — the purity contract `conformance.test.ts`
    // asserts — while the download runs. Both `null`, and the second must join
    // the first's fetch rather than start a second 13.6 MB download.
    expect(bot(board, seat)).toBeNull();
    expect(bot(board, seat)).toBeNull();

    // A prefetch joins the same in-flight load; this is the call the app makes at
    // seat selection so the download overlaps lobby time instead of the first turn.
    expect(await prefetchLandonBundle({ bundle: BUNDLE, prefix }), "prefetch resolved").toBe(true);
    expect(bot(board, seat), "plays once resident").not.toBeNull();
    expect(loadsStarted(net, prefix), "one load for three consultations").toBe(1);
  });

  // -------------------------------------------------------------------------
  // Latch the hopeless, retry the unlucky.
  // -------------------------------------------------------------------------

  it("browser: a bundle the origin does not have is not refetched on every decision", async () => {
    const net = assetNet(() => 404);
    enterBrowser(net);
    const prefix = "/absent";
    const bot = landonBot({ bundle: BUNDLE, prefix });
    const board = buyDecision();
    const seat = board.turn.playerId;

    expect(bot(board, seat)).toBeNull();
    expect(await prefetchLandonBundle({ bundle: BUNDLE, prefix }), "404 is not recoverable").toBe(false);

    // A whole game's worth of consultations against a bundle that is not there.
    for (let i = 0; i < 50; i++) expect(bot(board, seat)).toBeNull();
    expect(net.urls.length, "requests made for a bundle the origin does not have").toBe(1);
  });

  it("browser: a transient failure is retried rather than latched", async () => {
    let down = true;
    const net = assetNet(() => (down ? 503 : 200));
    enterBrowser(net);
    const prefix = "/flaky";
    const bot = landonBot({ bundle: BUNDLE, prefix });
    const board = buyDecision();
    const seat = board.turn.playerId;

    expect(await prefetchLandonBundle({ bundle: BUNDLE, prefix }), "origin is down").toBe(false);
    expect(bot(board, seat)).toBeNull();

    // The 503 said "ask again" — unlike the 404 above — so the slot must not have
    // been latched, and a later attempt must be allowed to succeed.
    down = false;
    expect(await prefetchLandonBundle({ bundle: BUNDLE, prefix }), "origin came back").toBe(true);
    expect(bot(board, seat), "plays after the recovery").not.toBeNull();
  });

  // -------------------------------------------------------------------------
  // Node, unchanged.
  // -------------------------------------------------------------------------

  it("node: the first consultation loads synchronously and answers", () => {
    // No shim: this is the `sim:gauntlet` path, where bots are resolved inside
    // worker threads and there is nowhere to await a warmup. Call one must play.
    const bot = landonBot({ bundle: BUNDLE });
    const board = buyDecision();
    expect(bot(board, board.turn.playerId)).not.toBeNull();
  });

  it("node: a bundle that is not on disk degrades to the phase default", () => {
    const bot = landonBot({ bundle: "no-such-bundle-here" });
    const board = buyDecision();
    // A directory absent at the first consultation will not appear by the second,
    // and there is no network to blame — so this one IS latched, and the bot
    // simply defers to the engine forever.
    expect(bot(board, board.turn.playerId)).toBeNull();
    expect(bot(board, board.turn.playerId)).toBeNull();
  });
});
