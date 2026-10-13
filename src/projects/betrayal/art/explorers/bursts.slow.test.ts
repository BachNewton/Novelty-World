import type * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";
import { animationOf, type Animation } from "../animate";
import { stubCanvas } from "../headless";
import { banshee, spider } from "../monsters";
import { batchParts } from "../part-batch";
import type { ExplorerBuilder } from "../stage";
import { brandon } from "./brandon";
import { burstsOf, CUE_REST, cueBurst, STANDING, type Gait } from "./figure";
import { flash } from "./flash";
import { jenny } from "./jenny";
import { onTheSpot } from "./line-up";
import { longfellow } from "./longfellow";
import { ox } from "./ox";
import { peter } from "./peter";
import { rhinehardt } from "./rhinehardt";
import { zoe } from "./zoe";

beforeAll(stubCanvas);

/*
 * Every figure's every named burst, played under a part batch that syncs each
 * frame, as the house, the bench and the figure viewer draw a figure. A part
 * that leaves the figure's tree as a burst plays (a coin taken out of the
 * hand) breaks the batch, whenever in the burst the batch was made.
 */

const FIGURES: Record<string, ExplorerBuilder> = {
  longfellow,
  ox,
  flash,
  brandon,
  peter,
  jenny,
  rhinehardt,
  zoe,
  banshee: (seed, gait) => banshee(seed, gait),
  spider: (seed, gait) => spider(seed, gait),
};

/**
 * A check plays its burst through twice, syncing the batch every frame: up to
 * about 1.5 s alone (Father Rhinehardt's, the slowest; most take well under
 * one), measured on its own. Under a full slow run's load the slowest pass
 * vitest's 5 s default, so this allows ten times the measurement.
 */
const LIMIT = { timeout: 15_000 };

function animationsIn(root: THREE.Object3D): Animation[] {
  const found: Animation[] = [];
  root.traverse((object) => {
    const animation = animationOf(object);
    if (animation) found.push(animation);
  });
  return found;
}

describe.each(Object.entries(FIGURES))("%s's bursts under a part batch", (name, build) => {
  const names = burstsOf(build(name, STANDING)).map((burst) => burst.name);

  it("names its bursts", () => {
    expect(names.length).toBeGreaterThan(0);
  });

  it.each(names.flatMap((burst) => (["idle", "walk"] as const).flatMap((pace) => [0, 0.5].map((batchAt) => [burst, pace, batchAt] as const))))(
    "%s, %s, batched %s of the way in",
    LIMIT,
    (burst, pace, batchAt) => {
      const figure = pace === "idle" ? build(`${name}:${burst}`, STANDING as Gait) : onTheSpot(build, `${name}:${burst}`, pace);
      const lasts = burstsOf(figure).find((one) => one.name === burst)?.lasts ?? 0;
      cueBurst(figure, { name: burst, at: 0, repeat: true });
      const animations = animationsIn(figure);
      for (const animation of animations) animation(lasts * batchAt);
      const batch = batchParts(figure);
      for (let t = 0; t < (lasts + CUE_REST) * 2; t += 1 / 30) {
        for (const animation of animations) animation(t);
        batch.sync();
      }
    },
  );
});
