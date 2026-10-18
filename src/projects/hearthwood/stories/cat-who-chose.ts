import type { HelpStory } from "./story";

/** An old cottager near camp whose wandering cat comes back at Elliott's heel, and is given to them to keep. */
export const CAT_WHO_CHOSE: HelpStory = {
  id: "cat-who-chose",
  title: "The cat who chose",
  kind: "help",
  roles: ["cottager"],
  request: { kind: "pet", species: "cat" },
  meet: {
    pages: [
      { say: "Oh, hello, dear! You must be the one camping in the meadow. I saw your smoke. I'm {name}." },
      {
        say: "You haven't seen my cat? {pet}. Soft as a mitten. Gone three days now, off towards {way}, the way {pet} always goes.",
        choices: [
          { tone: "warm", say: "I'll look for {pet}.", reply: "Bless you. {pet} likes a quiet sort. You'll do very well." },
          { tone: "curious", say: "Does {pet} wander often?", reply: "Every spring. Comes home with burrs and opinions." },
          { tone: "playful", say: "Off on an adventure?", reply: "Oh, certainly. {pet} has a much busier life than I do." },
        ],
      },
      { say: "Cats come to patient folk. Sit quiet near {pet}, and in time {pet} will come to you." },
    ],
  },
  waiting: {
    pages: [{ say: "No {pet} yet? Off towards {way}, I'd guess. Sit quiet, dear. {pet} always comes round to quiet." }],
  },
  thanks: {
    pages: [
      { say: "{pet}! Oh, you wanderer. Look at you, all burrs. And look how close {pet} keeps to Elliott." },
      {
        say: "Three days, and not a mouse brought home for me. I suppose you got the mice.",
        choices: [
          { tone: "warm", say: "{pet} was waiting for a friend.", reply: "And found one. I can see it plain as day." },
          { tone: "curious", say: "Where does {pet} go?", reply: "Everywhere. That's the trouble with a cat who loves the world." },
          { tone: "playful", say: "No mice. Only opinions.", reply: "Ha! That's {pet} all over." },
        ],
      },
      { say: "My knees can't follow {pet} any more, and {pet} so loves to wander. I think {pet} has chosen you." },
      { say: "Take {pet} along, and come by for pie: bilberries, flour and butter, in the pan. Just as my mother made it." },
    ],
    gifts: [{ kind: "companion" }, { kind: "hint", recipe: "blueberry-pie" }],
  },
  friend: {
    greet: {
      warm: "There's my dear neighbour! Come in, come in.",
      curious: "Elliott! Tell me everything {pet} has been up to.",
      playful: "Ah, the cat-thief returns! I'm only teasing, dear.",
    },
    pages: [{ say: "Bring {pet} round sometime. I've saved the crusts, and {pet} always did like the crusts best." }],
  },
};
