import type { HelpStory } from "./story";

/** A beekeeper making berries-in-honey for the dark months, who can't climb the berry slopes this year. */
export const PRESERVES: HelpStory = {
  id: "preserves",
  title: "Summer in a jar",
  kind: "help",
  roles: ["beekeeper"],
  request: { kind: "forage", foods: ["bilberry", "lingonberry", "wild-strawberry", "raspberry", "cloudberry"], count: 4 },
  meet: {
    pages: [
      {
        say: "Shh, slowly now. The bees are sleepy in the warm. I'm {name}. I keep them, or they keep me.",
        choices: [
          { tone: "warm", say: "They sound so happy.", reply: "They are. Listen: that hum is a happy one." },
          { tone: "curious", say: "What do they make here?", reply: "Heather honey, dark as tea. And clover, earlier, pale as butter." },
          { tone: "playful", say: "Do they keep you well?", reply: "They pay me in honey and stings. Mostly honey." },
        ],
      },
      { say: "I'm making preserves for the dark months. Berries in honey taste like summer when it's January outside." },
      { say: "My knees won't take the berry slopes this year. Four berries of any kind would fill a jar. Would you?" },
    ],
  },
  waiting: {
    pages: [{ say: "Four berries would fill a jar, any kind the forest gives you. The bees and I are very patient." }],
  },
  thanks: {
    pages: [
      { say: "Oh, look at them! {gave}, sweet as anything. Into the honey they go." },
      {
        say: "There. A whole jar of summer, for the long dark.",
        choices: [
          { tone: "warm", say: "Summer in a jar.", reply: "Exactly that. You'll have the first spoonful." },
          { tone: "curious", say: "How long will it keep?", reply: "Till the darkest day, if I hide it from myself." },
          { tone: "playful", say: "Save some for the bees?", reply: "They'd only say it needs more honey." },
        ],
      },
      { say: "Take this, it's the heather honey. And a trick of mine: cloudberries, flour and eggs, in the pan. Pancakes like sunshine." },
    ],
    gifts: [
      { kind: "keepsake", keepsake: "honey-jar" },
      { kind: "hint", recipe: "cloudberry-pancakes" },
    ],
  },
  friend: {
    greet: {
      warm: "Elliott! The bees know your step now, I'm sure of it.",
      curious: "Come to see how the honey's getting on? Beautifully.",
      playful: "My favourite berry-finder! The jar's nearly gone. I may have eaten it.",
    },
    pages: [{ say: "Every spoonful tastes of {gave} and that slope you climbed. Thank you again, truly." }],
  },
};
