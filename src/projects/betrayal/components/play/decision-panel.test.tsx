import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { viewFor } from "../../engine/view";
import { ENGINE } from "../../game";
import { playChoices } from "../../play/choices";
import { choose, ready, testGame, waitingOn } from "../../testing";
import { DecisionPart } from "./decision-panel";

/** Haunt 13 begun, and Father Rhinehardt beating Ox, on high Might and Speed, by 7 with the Angel Feather. */
function splitPending() {
  let state = testGame({
    seed: "s27",
    first: 0,
    haunt: { number: 13, revealer: 0 },
    explorers: [
      { seat: 0, room: "entrance-hall" },
      { seat: 1, room: "entrance-hall", clips: { might: 7, speed: 7 } },
      { seat: 2, room: "entrance-hall", cards: ["angel-feather"] },
    ],
  });
  state = state.seats.reduce((s, _seat, i) => ready(s, i), state);
  for (const label of ["Add the Balcony", "Put the Balcony on the upper floor, north", "Attack Ox Bellows", "the result is 8"]) state = choose(state, label);
  return viewFor(ENGINE, state, waitingOn(state));
}

describe("damage to split", () => {
  it("is one control between its two tracks, however many ways there are to take it", () => {
    const view = splitPending();
    expect(view.pending?.type === "decision" && view.pending.kind).toBe("split-damage");
    const panel = playChoices(view).panel;
    expect(panel.length).toBeGreaterThan(4);
    const html = renderToStaticMarkup(<DecisionPart part="damage" view={view} panel={panel} act={() => {}} input="keyboard-mouse" notes={null} />);
    expect(html.match(/role="slider"/g)).toHaveLength(1);
    expect(html.match(/aria-label="(Might|Speed) track"/g)).toEqual(['aria-label="Might track"', 'aria-label="Speed track"']);
    // Of the engine's ways, only the one the control is on is named: on the button that takes it.
    expect(panel.filter((choice) => html.includes(`>${choice.label}<`))).toHaveLength(1);
  });
});
