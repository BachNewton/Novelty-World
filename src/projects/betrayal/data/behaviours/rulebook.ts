import { explorerOf, figureOf } from "../../engine/figures";
import { askStructured } from "../../engine/questions";
import { revealedAs } from "../../engine/sides";
import type { BehaviourGroup } from "../../engine/sources";
import type { Engine } from "../../engine/step-loop";
import type { FigureId, GameState, RuleRef } from "../../types";

// The rulebook's own rules that change what other text does, as sources on
// the rulebook layer: cards, rooms and haunts sit above them and may say
// otherwise.

/** Room text, and the text of a token that joins rooms (the Wall Switch,
 *  whose roll the traitor's rule names among room text, p. 17). */
const isRoomText = (rule: RuleRef) =>
  rule.source === "room" || rule.source === "token";

/** The traitor's own explorer, once everyone knows they are the traitor: a
 *  hidden traitor reveals themself to use the new powers (p. 18). */
function isTraitorsExplorer(state: GameState, figure: FigureId): boolean {
  const owner = figureOf(state, figure).owner;
  return (
    owner !== null &&
    explorerOf(state, owner) === figure &&
    revealedAs(state, figure, "traitor")
  );
}

/** An event card, or an omen the traitor may refuse as one (the Bite). */
function isRefusableCard(engine: Engine, rule: RuleRef): boolean {
  if (rule.source !== "card") return false;
  return (
    engine.catalog.cards[rule.card].type === "event" ||
    engine.behaviours.cards[rule.card]?.refusable === true
  );
}

export const RULEBOOK: BehaviourGroup = {
  rulebook: {
    // The traitor may ignore harmful room text, and choose not to be
    // affected by an event card or the Bite (p. 17, ruling harmful-text).
    "traitors-new-powers": {
      page: 17,
      modifiers: [
        {
          question: "bindingText",
          when: (state, { figure, rule }, _source, engine) =>
            isTraitorsExplorer(state, figure) &&
            (isRoomText(rule) || isRefusableCard(engine, rule)),
          change: {
            transform: (_state, _subject, answer) =>
              answer === "binding" ? "optional" : answer,
          },
        },
      ],
    },
    // Monsters ignore harmful room text (p. 19); for a monster it could
    // only stun it or hold it back, so it is never asked (ruling
    // harmful-text).
    "monsters-and-rooms": {
      page: 19,
      modifiers: [
        {
          question: "bindingText",
          when: (state, { figure, rule }, _source, engine) =>
            isRoomText(rule) &&
            askStructured(engine, state, "monsterRules", { figure }),
          change: { transform: () => "ignored" },
        },
      ],
    },
  },
};
