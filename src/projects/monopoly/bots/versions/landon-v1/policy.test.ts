import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { freshGame } from "../../../mocks";
import { botFor } from "../../registry";
import { LEARNED_BUNDLES, VERSIONS } from "../index";
import { LANDON_V1_BUNDLE, landonV1Bot } from "./index";

// landon-v1 wiring — the claims that hold WITHOUT its weights, which is the one
// state `conformance.test.ts` cannot say anything about.
//
// Conformance tables over `VERSIONS` and asserts "non-null decisions are legal"
// plus "repeated calls agree". The bundles are committed, so it now exercises the
// real policy — but a bot with no bundle resident answers `null` everywhere, and
// `null` satisfies both contracts trivially. So the degraded path stays exactly as
// invisible to conformance as it always was, and it is a path this bot really
// takes: every browser seat is in it until the download lands. These are the
// claims that hold there: the label resolves, the prefetch map addresses the
// bundle the bot itself requests, and an absent bundle degrades to `null` rather
// than throwing.

/** A bundle root that cannot exist, so the Node loader's synchronous read fails
 *  and the bot takes its no-weights path regardless of what is committed under
 *  `public/bundles/`. */
const ABSENT_BUNDLE_DIR = "/nonexistent/landon-v1-policy-test/bundles";
let previousBundleDir: string | undefined;

beforeAll(() => {
  previousBundleDir = process.env["PPO_BUNDLE_DIR"];
  process.env["PPO_BUNDLE_DIR"] = ABSENT_BUNDLE_DIR;
});

afterAll(() => {
  if (previousBundleDir === undefined) delete process.env["PPO_BUNDLE_DIR"];
  else process.env["PPO_BUNDLE_DIR"] = previousBundleDir;
});

describe("landon-v1 is registered and addressable", () => {
  it("resolves through the registry to its own policy", () => {
    expect(VERSIONS["landon-v1"]).toBe(landonV1Bot);
    expect(botFor("landon-v1")).toBe(landonV1Bot);
  });

  it("the prefetch map names the bundle the bot itself requests", () => {
    // `landon-v1/index.ts` passes this same constant to `landonBot`, so the two
    // cannot drift; what CAN drift is the lobby's copy in `versions/index.ts`,
    // which would silently prefetch a bundle nobody loads.
    expect(LANDON_V1_BUNDLE).toBe("landon-v1");
    expect(LEARNED_BUNDLES["landon-v1"]).toBe(LANDON_V1_BUNDLE);
  });
});

describe("landon-v1 without its weights", () => {
  it("answers null for every seat instead of throwing", () => {
    const state = freshGame("landon-v1-no-bundle");
    for (const player of state.players) {
      expect(landonV1Bot(state, player.id)).toBeNull();
    }
  });

  it("stays null on repeated consultations", () => {
    const state = freshGame("landon-v1-no-bundle-repeat");
    const seat = state.turn.playerId;
    expect(landonV1Bot(state, seat)).toBeNull();
    expect(landonV1Bot(state, seat)).toBeNull();
  });
});
