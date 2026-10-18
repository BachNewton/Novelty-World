import type { HelpStory } from "./story";

/** A cold traveller resting on the way north to the sea, warmed by something hot from the pot. */
export const LONG_ROAD: HelpStory = {
  id: "long-road",
  title: "A long road north",
  kind: "help",
  roles: ["traveller"],
  request: { kind: "dish", dish: "warm" },
  meet: {
    pages: [
      { say: "Hello, friend. Don't mind me, just resting my feet. I'm {name}, walking north to the sea. Slowly." },
      {
        say: "I didn't plan for the wind up here. My hands are cold right through my mittens.",
        choices: [
          { tone: "warm", say: "Oh no. Let me help.", reply: "You're kind. I could tell from a long way off." },
          { tone: "curious", say: "How far is the sea?", reply: "Far. Two summers, if I keep stopping to talk. I will." },
          { tone: "playful", say: "Your mittens have betrayed you.", reply: "They have. I knitted them myself, too." },
        ],
      },
      { say: "If you've a fire somewhere, and something hot from the pot, I'd be grateful past words." },
    ],
  },
  waiting: {
    pages: [{ say: "Anything hot from the pot: soup, porridge, tea. I'll be right here, being a little bit cold." }],
  },
  thanks: {
    pages: [
      { say: "Oh, {gave}! Hot, hot. Give me a moment. I'll just hold it." },
      {
        say: "I've walked a long way, and met a lot of folk. Not many as kind as you.",
        choices: [
          { tone: "warm", say: "Everyone should be warm.", reply: "If everyone thought so, the road would be a lot shorter." },
          { tone: "curious", say: "Who else have you met?", reply: "A ferryman with no boat, and a cat who sang. Another time." },
          { tone: "playful", say: "Your mittens forgive you.", reply: "Ha! I'll tell them you said so." },
        ],
      },
      { say: "Here. Sea glass, from the shore where I started. It's been in my pocket all this way. It should go with a walker." },
    ],
    gifts: [{ kind: "keepsake", keepsake: "sea-glass" }],
  },
  friend: {
    greet: {
      warm: "Elliott! Warm right through, thanks to you.",
      curious: "Still here! You'll want to hear about the singing cat, I expect.",
      playful: "My mittens and I are speaking again. All thanks to you.",
    },
    pages: [{ say: "I'll be off north soon. But I wanted to wave you goodbye first. I still think about that {gave}." }],
  },
};
