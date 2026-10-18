import type { HelpStory } from "./story";

/** A cottager with a chill and an empty kettle, cheered by any tea at all from Elliott's cauldron. */
export const A_CHILL: HelpStory = {
  id: "a-chill",
  title: "A chill in the cottage",
  kind: "help",
  roles: ["cottager"],
  request: { kind: "brew", brew: "tea" },
  meet: {
    pages: [
      { say: "Oh, hello, dear. Excuse the shawl and the sniffles. I'm {name}. I've caught a chill, and it's caught me right back." },
      {
        say: "I'd make myself a tea, but the kettle's empty, and my knees say the herb patch is too far today.",
        choices: [
          { tone: "warm", say: "Let me bring you one.", reply: "Would you? Oh, you're a treasure." },
          { tone: "curious", say: "Which tea do you like?", reply: "Any at all, dear. Yarrow and honey's best for a chill, but a warm cup is a warm cup." },
          { tone: "playful", say: "What a rude chill.", reply: "Very rude. It came in without knocking, and it won't leave." },
        ],
      },
      { say: "Any tea from your cauldron would do me good. Yarrow and honey, if you can. My grandmother swore by it, and she was never wrong." },
    ],
    gifts: [{ kind: "brew-hint", brew: "yarrow-tea" }],
  },
  waiting: {
    pages: [{ say: "Any tea at all, dear, steeped and bottled. I'll be right here in my shawl, sniffling bravely." }],
  },
  thanks: {
    pages: [
      { say: "Oh, {gave}! Still warm. Let me wrap my hands round it before I even sip." },
      {
        say: "There. I can feel it right down to my toes. That chill is packing its bags.",
        choices: [
          { tone: "warm", say: "You sound better already.", reply: "I feel it. A kind face does as much good as the tea." },
          { tone: "curious", say: "Who taught you about teas?", reply: "My grandmother, who learnt from hers. Cottages remember things." },
          { tone: "playful", say: "Off you go, rude chill!", reply: "And don't come back! Ha, oh, that made me cough." },
        ],
      },
      { say: "Something for you, in thanks: bilberries and honey, in the pot. A soup my grandmother made for anyone who needed cheering." },
    ],
    gifts: [{ kind: "hint", recipe: "bilberry-soup" }],
  },
  friend: {
    greet: {
      warm: "Elliott, dear! Not a sniffle since. Come and say hello.",
      curious: "Back to see the patient? Fully recovered, and very pleased about it.",
      playful: "The chill hasn't been back. I think you frightened it off.",
    },
    pages: [{ say: "I kept the bottle from that {gave}. It's on my windowsill with a sprig of heather in it, catching the morning sun." }],
  },
};
