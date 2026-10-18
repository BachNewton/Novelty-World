import type { TalkStory } from "./story";

/** A sauna keeper by the lake, and the little sauna elf who must always have the last steam of the night. */
export const SAUNA_ELF: TalkStory = {
  id: "sauna-elf",
  title: "The sauna elf",
  kind: "talk",
  roles: ["sauna-keeper"],
  meet: {
    pages: [
      { say: "Welcome, welcome! The stones are just warming. I'm {name}. This little sauna was here long before me." },
      {
        say: "You know of the saunatonttu? The sauna elf. Lives under the benches, minds the fire, keeps everyone safe.",
        choices: [
          { tone: "warm", say: "I'd like to meet them.", reply: "Oh, you won't. But you'll feel them: the steam goes soft and kind." },
          { tone: "curious", say: "What does an elf want?", reply: "Quiet voices, and the last steam of the night, left just for them." },
          { tone: "playful", say: "Do they bring a towel?", reply: "They're very modest. They bring their own." },
        ],
      },
      { say: "So always leave the last throw of water for the elf. Then go and sit by the lake and watch the evening turn pink." },
      { say: "And after, berry tea: raspberries and honey in the pot. My grandmother swore the elf liked the smell of it." },
    ],
    gifts: [{ kind: "hint", recipe: "berry-tea" }],
  },
  friend: {
    greet: {
      warm: "Elliott! The steam's lovely today. The elf must like you.",
      curious: "Back again! I've been listening for the elf. Nothing yet.",
      playful: "Hello! I saved you a bench. The elf is sulking about it.",
    },
    pages: [
      { say: "I left the last steam for the elf last night. In the morning the stones were swept. Make of that what you will." },
      { say: "Before a bath I smoke the sauna with juniper and a pinch of salt. Tie the same up in linen and even the mist steps aside." },
    ],
    gifts: [{ kind: "brew-hint", brew: "mist-charm" }],
  },
};
