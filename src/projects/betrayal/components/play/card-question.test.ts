import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { HouseScene } from "../../art/house-scene";
import { viewFor, type GameView } from "../../engine/view";
import { ENGINE } from "../../game";
import { playChoices } from "../../play/choices";
import { boxPart, cardQuestion } from "../../play/panels";
import { choose, testGame } from "../../testing";
import { CardBeat, type ShownCard } from "./card-beat";
import { DecisionPart } from "./decision-panel";
import { StatusBox } from "./status-box";

/*
 * One card, one place: a card's question is asked on the card over the room,
 * with its choices there, and the status box shows none of it; a card that
 * asks nothing waits for a press, with a mark and no button to find; and a
 * question's first choice is where the focus lands, so A answers at once.
 */

const noop = () => undefined;
const scene = { setPins: noop, play: () => Promise.resolve() } as unknown as HouseScene;

/** Zoe discovers the Game Room and draws Something Hidden: make a Knowledge roll, or don't. */
function somethingHidden(): GameView {
  return viewFor(ENGINE, choose(choose(testGame({ stack: ["game-room"], decks: { event: ["something-hidden"] } }), "Explore"), "Place"), 0);
}

const box = (view: GameView) =>
  renderToStaticMarkup(
    createElement(StatusBox, {
      boxRef: { current: null },
      view,
      told: null,
      turnUp: null,
      playing: false,
      holder: 0,
      problem: null,
      choices: playChoices(view),
      ghost: null,
      input: "pad",
      act: noop,
      preview: null,
      why: { open: false, toggle: noop, hold: noop },
    }),
  );

const card = (shown: ShownCard) => renderToStaticMarkup(createElement(CardBeat, { scene, card: shown, goOn: noop, act: noop }));

/** The buttons of some markup, in order, as their opening tags and labels. */
const buttons = (markup: string) => [...markup.matchAll(/<button([^>]*)>(.*?)<\/button>/g)].map(([, attributes, label]) => ({ attributes, label: label.replace(/<[^>]+>/g, "").replaceAll("&#x27;", "'") }));

describe("a card's question", () => {
  it("is the card's, asked on it: the box shows neither the card nor its choices", () => {
    const view = somethingHidden();
    expect(boxPart(view)).toBe("card");
    expect(cardQuestion(view)).toBe("something-hidden");
    const markup = box(view);
    expect(markup).not.toContain("Don&#x27;t roll");
    expect(markup).not.toContain("Make a Knowledge roll");
    expect(markup).not.toContain("Something Hidden");
  });

  it("shows its choices on the card, the first the focus lands on", () => {
    const view = somethingHidden();
    const pending = view.pending;
    if (pending?.type !== "decision") throw new Error("No question");
    const markup = card({ card: "something-hidden", room: "game-room", drawn: true, table: null, question: { decision: pending.id, view, prompt: "Something Hidden", panel: playChoices(view).panel } });
    expect(markup).toContain('data-pad-layer="1"');
    const choices = buttons(markup);
    expect(choices.map((choice) => choice.label)).toEqual([expect.stringMatching(/^Make a Knowledge roll/), "Don't roll"]);
    expect(choices[0].attributes).toContain("data-pad-start");
    expect(choices[1].attributes).not.toContain("data-pad-start");
  });

  it("whose every choice is a place is answered in the house, its card not asked again", () => {
    // Secret Stairs asks which room its other token goes in.
    const view = viewFor(ENGINE, choose(testGame({ stack: ["conservatory"], decks: { event: ["secret-stairs"] } }), "Explore"), 0);
    expect(cardQuestion(view)).toBeNull();
    expect(boxPart(view)).toBe("choices");
  });
});

describe("a card that asks nothing", () => {
  it("waits for a press, with a mark to show it waits and no button to reach", () => {
    const markup = card({ card: "ring", room: "abandoned-room", drawn: true, table: null, question: null });
    expect(markup).toContain("data-continue");
    expect(markup).not.toContain("Go on");
    // It takes no layer of its own: any press goes on from it.
    expect(markup).not.toContain("data-pad-layer");
  });
});

describe("a question in the box", () => {
  it("starts the focus on its first answer: a roll's Keep, before the dice to pick", () => {
    // Skeletons: a die of mental damage, which the Lucky Stone may reroll.
    const state = choose(choose(testGame({ stack: ["game-room"], decks: { event: ["skeletons"] }, explorers: [{ seat: 0, cards: ["lucky-stone", "skull"] }] }), "Explore"), "Place");
    const view = viewFor(ENGINE, state, 0);
    expect(boxPart(view)).toBe("roll");
    const markup = renderToStaticMarkup(createElement(DecisionPart, { part: "roll", view, panel: playChoices(view).panel, act: noop, input: "pad", notes: null }));
    const start = buttons(markup).filter((button) => button.attributes.includes("data-pad-start"));
    expect(start.map((button) => button.label)).toEqual([expect.stringMatching(/^Keep the result/)]);
  });
});
