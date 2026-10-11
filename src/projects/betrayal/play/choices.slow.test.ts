import { describe, expect, it } from "vitest";
import { ENGINE } from "../game";
import { placed } from "../engine/board";
import { apply } from "../engine/step-loop";
import { viewFor } from "../engine/view";
import { simulate } from "../simulation";
import { playChoices } from "./choices";
import { due } from "./seat";

// Whole games, every listed choice of every write applied: a long game runs to thousands of applies.
describe("playChoices over whole games", () => {
  it.each(["choices-1", "choices-2", "choices-3"])("splits every decision, each listed choice once, and the engine accepts every one (%s)", (seed) => {
    let checked = 0;
    simulate(seed, ENGINE, (state) => {
      if (state.pending?.type !== "decision") return;
      const seat = due(viewFor(ENGINE, state, null));
      if (seat === null) throw new Error("A decision is pending but no seat is due");
      const view = viewFor(ENGINE, state, seat);
      const { targets, panel, end, ghost } = playChoices(view);
      const placings = ghost ? [...ghost.cells.flatMap((cell) => cell.options.map((option, i) => ({ ...option, id: `ghost:${cell.spot.floor}:${cell.spot.x}:${cell.spot.y}:${i}` }))), ...(ghost.stay ? [ghost.stay] : [])] : [];
      const all = [...targets, ...panel, ...(end ? [end] : []), ...placings];
      const listed = view.pending?.type === "decision" ? (view.pending.detail?.choices ?? []) : [];
      const actionOf = (c: (typeof all)[number]) => ("actions" in c ? c.actions[0] : c.action);
      for (const target of targets) expect(target.actions).toHaveLength(1);
      expect(all.map((c) => actionOf(c).kind === "choose" && JSON.stringify((actionOf(c) as { choice: unknown }).choice)).sort()).toEqual(listed.map((c) => JSON.stringify(c.choice)).sort());
      expect(new Set(all.map((c) => c.id)).size).toBe(all.length);
      for (const choice of all) {
        const result = apply(ENGINE, state, actionOf(choice));
        if (!result.ok) throw new Error(`${choice.id} (${choice.label}) was rejected: ${result.reason}`);
      }
      for (const target of targets) if (target.kind === "room") expect(placed(state.board, target.room)).toBeDefined();
      checked++;
    }, { checks: false });
    expect(checked).toBeGreaterThan(20);
  }, 60_000);
});
