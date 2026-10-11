import { beforeAll, describe, expect, it } from "vitest";
import { loadRuleNotes, type RuleNotes } from "../data/rule-notes";
import { viewFor, type GameView } from "../engine/view";
import { NO_HAUNT_ENGINE, simulate } from "../simulation";
import { damageTracks, splitOf, type DamageKind } from "./damage";
import { rollShown, type RollParams } from "./dice";
import { boxPart } from "./panels";
import { due } from "./seat";
import type { FigureId } from "../types";

/** What the device's holder sees at every write of scripted games played
 *  through their exploration, with the haunt held off: the view of the seat
 *  the game waits on, as the play screen shows it. */
function holderViews(seeds: string[]): GameView[] {
  const views: GameView[] = [];
  for (const seed of seeds) {
    simulate(seed, NO_HAUNT_ENGINE, (state) => {
      if (state.status !== "exploring") return;
      const holder = due(viewFor(NO_HAUNT_ENGINE, state, null));
      if (holder !== null) views.push(viewFor(NO_HAUNT_ENGINE, state, holder));
    });
  }
  return views;
}

let notes: RuleNotes;
let views: GameView[];
// Playing whole games takes a few seconds, more on a busy machine.
beforeAll(async () => {
  notes = await loadRuleNotes();
  views = holderViews(["panels-1", "panels-2"]);
}, 60_000);

describe("boxPart", () => {
  it("never needs the old debug panel in a game's exploration", () => {
    const debug = views.filter((view) => boxPart(view) === "debug").map((view) => view.pending);
    expect(debug).toEqual([]);
  });

  it("gives rolls and damage parts of their own, and each shows without failing", () => {
    const parts = new Set<string>();
    for (const view of views) {
      const part = boxPart(view);
      parts.add(part);
      const pending = view.pending;
      if (pending?.type !== "decision" || pending.detail === null) continue;
      if (part === "roll") {
        const shown = rollShown(view, notes, pending.detail.params as unknown as RollParams, pending.kind === "roll-after");
        expect(shown.pool).toBeGreaterThan(0);
      }
      if (part === "damage") {
        const p = pending.detail.params as { figure: FigureId; damage: DamageKind };
        for (const choice of pending.detail.choices) {
          const tracks = damageTracks(NO_HAUNT_ENGINE, view, p.figure, p.damage, pending.kind === "split-damage" ? splitOf(choice.choice) : null);
          expect(tracks).toHaveLength(2);
        }
      }
    }
    expect([...parts]).toEqual(expect.arrayContaining(["turn", "ghost", "damage", "choices"]));
  });
});
