import type { MysteryStory } from "./story";

/** A cottager's door bell rings on windless nights. Jackdaws nesting in the eaves: neighbours, all along. */
export const STILL_BELL: MysteryStory = {
  id: "still-bell",
  title: "The bell on still nights",
  kind: "mystery",
  roles: ["cottager"],
  mystery: {
    clues: [
      { id: "still-nights", kind: "said", title: "Rings on still nights", note: "The bell above the door rings on windless nights, at dusk and again before dawn. Never at midnight." },
      { id: "thimble", kind: "said", title: "A lost thimble", note: "A silver thimble vanished from the windowsill. Nothing else in the cottage was touched." },
      {
        id: "twigs",
        kind: "found",
        mark: "twigs",
        title: "Twigs and wool",
        note: "Fallen beneath the eaves: twigs, a tuft of sheep's wool, a pinch of moss. Building stuff, dropped from up high.",
        at: { from: "cottage", near: 5.5, far: 8 },
      },
      {
        id: "feather",
        kind: "found",
        mark: "feather",
        title: "A black feather",
        note: "Black, with a grey sheen at the base, and too small for a raven's. Its owner, I'd wager, has a pale and clever eye.",
        at: { from: "cottage", near: 6, far: 12 },
      },
      {
        id: "button",
        kind: "found",
        mark: "button",
        title: "A dented brass button",
        note: "Bright, and dented on one edge as if dropped from a height. Not the cottager's: there is no brass on anything they wear.",
        at: { from: "cottage", near: 7, far: 14 },
      },
      { id: "bright-things", kind: "said", title: "Bright things go missing", note: "A spoon in spring, a hairpin in May, and now the thimble. Only ever bright things, and always from the sill." },
    ],
    deductions: [
      {
        id: "nest",
        from: ["twigs", "still-nights"],
        title: "Something nests above the door",
        note: "Nest stuff falling from the eaves, and a ring at dusk and at dawn: something comes home at nightfall and leaves at first light.",
      },
      { id: "glint", from: ["thimble", "button", "bright-things"], title: "A thief of bright things", note: "Only bright things go missing, and a bright button falls from above. A bird that loves a glint." },
      { id: "solved", from: ["nest", "glint", "feather"], title: "Jackdaws in the eaves", note: "Jackdaws, nesting above the door, ringing the bell as they come and go and lining the nest with every glint they find." },
    ],
    solution: "solved",
  },
  meet: {
    pages: [
      {
        say: "Hello, dear. I'm {name}. Forgive me, I'm a little jumpy: it's been ringing again.",
        choices: [
          { tone: "warm", say: "Are you all right?", reply: "Oh, I'm fine. Only puzzled, and a little short of sleep." },
          { tone: "curious", say: "What's been ringing?", reply: "The old bell above my door. On nights without a breath of wind." },
          { tone: "playful", say: "A ghost with manners?", reply: "A ghost who knocks! I'd have to put the kettle on." },
        ],
      },
      { say: "It rings at dusk and before dawn, never at midnight. And my silver thimble's gone from the windowsill, too." },
      { say: "Would you look round the cottage for me? You've the eyes for it, I can tell." },
    ],
    testimony: ["still-nights", "thimble"],
  },
  waiting: {
    pages: [{ say: "Still ringing, dear. Have a look round under the eaves, if you would." }],
  },
  hunch: {
    after: "button",
    talk: {
      pages: [
        { say: "Brass? Not mine. Though bright things do go missing here: a spoon in spring, a hairpin in May. Always from the sill." },
        { say: "I'd thought I was only getting forgetful. Do you suppose they're all the one thief?" },
      ],
      testimony: ["bright-things"],
    },
  },
  reveal: {
    pages: [
      { lead: "It isn't the wind, and it isn't a ghost. Something rings it, coming home at dusk.", say: "Coming home? To my cottage?" },
      { lead: "Twigs and wool fall from your eaves. And there's a black feather, grey at the neck.", say: "A jackdaw! Oh, of course. They're as clever as foxes." },
      { lead: "And they love bright things. Your thimble will be lining their nest, beside the spoon and the hairpin.", say: "My thimble, keeping their eggs warm. I haven't the heart to want it back." },
      {
        say: "I've been so lonely since the summer. And all along I've had neighbours, right above my door.",
        choices: [
          { tone: "warm", say: "Good neighbours, too.", reply: "The best. They never stay too long, and they ring when they come in." },
          { tone: "curious", say: "Will they stay?", reply: "Jackdaws keep the same nest for life, they say. So shall I keep them." },
          { tone: "playful", say: "Rather noisy neighbours.", reply: "Chatty ones. I'll chat back." },
        ],
      },
      { say: "My late husband loved his detective stories by the fire. He'd want you to have his cap." },
    ],
    gifts: [{ kind: "keepsake", keepsake: "deerstalker" }],
  },
  friend: {
    greet: {
      warm: "Elliott! The jackdaws have fledged. I've named every one.",
      curious: "Come to hear the bell? It's our supper bell now.",
      playful: "My detective! The case of the chatty neighbours, closed.",
    },
    pages: [{ say: "I leave a bright button on the sill for them now and then. It seems only fair." }],
  },
};
