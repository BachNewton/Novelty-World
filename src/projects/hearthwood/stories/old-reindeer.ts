import type { HelpStory } from "./story";

/** A herder's old lead reindeer, stiff in the knees in the fell's cold, eased with the old fly agaric rub (on the skin only). */
export const OLD_REINDEER: HelpStory = {
  id: "old-reindeer",
  title: "The old reindeer",
  kind: "help",
  roles: ["herder"],
  request: { kind: "brew", brew: "fly-agaric-rub" },
  meet: {
    pages: [
      { say: "Hei, welcome up! I'm {name}. Don't mind old Kuura there. She still leads the herd, only slowly these days." },
      {
        say: "The cold gets into her knees up here. She's stiff in the mornings, and she groans when she lies down, like my grandad did.",
        choices: [
          { tone: "warm", say: "Oh, the poor old dear.", reply: "She is a dear. Twelve winters, and she still knows every path on the fell." },
          { tone: "curious", say: "What eases old knees?", reply: "The old herders rubbed them with fly agaric in beeswax. On the skin only. Never, ever eaten." },
          { tone: "playful", say: "Maybe she groans for pity.", reply: "Maybe! She's very good at getting her ears scratched." },
        ],
      },
      { say: "The red ones with white spots, from under the birches, set in beeswax as a rub. Could you make her some? Only for rubbing in, mind." },
    ],
    gifts: [{ kind: "brew-hint", brew: "fly-agaric-rub" }],
  },
  waiting: {
    pages: [{ say: "Fly agaric and beeswax, for her knees. They come up under the birches from late summer into autumn. Kuura's in no hurry. She never is." }],
  },
  thanks: {
    pages: [
      { say: "You made the rub! Come here, Kuura. Hold still, old girl. Into the knees it goes, gently now." },
      {
        say: "There. Look at her ears go soft. She knows it's helping.",
        choices: [
          { tone: "warm", say: "She looks so content.", reply: "She does. Like a cat by the fire, if a cat had antlers." },
          { tone: "curious", say: "Will she lead all winter?", reply: "With that rub? She'll lead till spring, and argue about it after." },
          { tone: "playful", say: "Next, a tiny scarf.", reply: "Don't tempt me. I've plenty of wool, and she's plenty of neck." },
        ],
      },
      { say: "Here's a herder's trick for you: meadowsweet and a pinch of salt, tied up as a charm, and the shy calves come right up. Shy cats too, I'd guess." },
    ],
    gifts: [{ kind: "brew-hint", brew: "hush-charm" }],
  },
  friend: {
    greet: {
      warm: "Elliott! Kuura's been walking like a yearling. A careful yearling.",
      curious: "Come to see the herd? Kuura's at the front again, where she likes it.",
      playful: "Hei! Kuura's started groaning on purpose, to get more rubs.",
    },
    pages: [{ say: "She found the warm patch by my tent this morning and lay right down without a single groan. I nearly cried. Thank you." }],
  },
};
