import type { TalkStory } from "./story";

/** A traveller who walks between the wayside shrines keeping their candles lit, and the midsummer fires. */
export const CANDLE_KEEPER: TalkStory = {
  id: "candle-keeper",
  title: "The candle-keeper",
  kind: "talk",
  roles: ["traveller"],
  places: ["shrine"],
  meet: {
    pages: [
      { say: "Good day! I'm {name}. I walk between the shrines and keep their candles lit. This one was nearly out." },
      {
        say: "At midsummer every shrine burns all night, and the night hardly comes anyway. The sun just dips, and rises again.",
        choices: [
          { tone: "warm", say: "That sounds beautiful.", reply: "It is. Everyone stays up. Even the birds." },
          { tone: "curious", say: "Who lit them first?", reply: "Nobody knows. Someone who wanted the way to feel kinder." },
          { tone: "playful", say: "Do the candles get tired?", reply: "The candles, never. The candle-keeper, very." },
        ],
      },
      { say: "We bake stick bread at the midsummer fires: lingonberries, flour and honey, twisted round a stick. Try it at yours." },
    ],
    gifts: [{ kind: "hint", recipe: "lingonberry-stick-bread" }],
  },
  friend: {
    greet: {
      warm: "Elliott! The candle burns brighter for company, I'm sure.",
      curious: "Back again! This one hasn't gone out once since you came.",
      playful: "Hello! I've been talking to the candle. It agrees you're lovely.",
    },
    pages: [
      { say: "If you pass another shrine, look at its candle for me. If it's low, say a kind word to it. It helps." },
      { say: "And at midsummer we tie meadowsweet and yarrow up in linen for a garland charm. Hang one by your fire and see what blooms." },
    ],
    gifts: [{ kind: "brew-hint", brew: "garland-charm" }],
  },
};
