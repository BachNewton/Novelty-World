import type { TalkStory } from "./story";

/** A shepherd at a seter, and the old ewe whose bell brings the flock home through the fog. */
export const BELL_EWE: TalkStory = {
  id: "bell-ewe",
  title: "The bell-ewe",
  kind: "talk",
  roles: ["shepherd"],
  meet: {
    pages: [
      {
        say: "Oh! A walker, up here. I'm {name}. Mind the ewes, they think everyone is carrying bread.",
        choices: [
          { tone: "warm", say: "They're lovely. Hello, ewes.", reply: "Now they'll love you forever. Sheep are easily won." },
          { tone: "curious", say: "How many do you keep?", reply: "Twenty-three, and one bell. The bell matters most." },
          { tone: "playful", say: "I might be carrying bread.", reply: "Then you'll never leave. That's how I came to be a shepherd." },
        ],
      },
      { say: "See the old one with the bell? Kello. When the fog comes down off the fell, I can't see my own boots." },
      {
        say: "But Kello walks home ringing, and every sheep follows the song. Twenty-three shadows in the white, trotting after one little bell.",
        choices: [
          { tone: "warm", say: "She sounds very wise.", reply: "Wiser than me. Most days I just follow her too." },
          { tone: "curious", say: "Who taught her the way?", reply: "Her mother, and hers before. The way home is older than the farm." },
          { tone: "playful", say: "Does she take requests?", reply: "Only the one song. But she's very committed to it." },
        ],
      },
      { say: "When you cook tonight, put lingonberries in your oats, in the pot. It's what we eat up here, waiting on the fog." },
    ],
    gifts: [{ kind: "hint", recipe: "lingonberry-porridge" }],
  },
  friend: {
    greet: {
      warm: "Elliott! Kello rang when she saw you coming. I'm sure of it.",
      curious: "Back again! Still thinking about that bell? It's still ringing.",
      playful: "Look who it is. The ewes have been asking after your bread.",
    },
    pages: [{ say: "The fog came down twice since you were here. Everyone got home: one bell, and twenty-three shadows behind her." }],
  },
};
