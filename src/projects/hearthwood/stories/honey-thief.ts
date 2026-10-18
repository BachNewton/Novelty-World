import type { MysteryStory } from "./story";

/** A beekeeper's honey keeps vanishing from the shelf by the hives. Not a badger: a lonely child feeding a fox cub. */
export const HONEY_THIEF: MysteryStory = {
  id: "honey-thief",
  title: "The honey thief",
  kind: "mystery",
  roles: ["beekeeper"],
  mystery: {
    clues: [
      { id: "badger", kind: "said", title: "“A badger, surely”", note: "The beekeeper is certain a badger has been at the jars. Certainty, I find, is not the same as evidence." },
      { id: "lids", kind: "said", title: "Lids set aside", note: "Three jars emptied, their lids unscrewed and laid neatly beside them. Nothing broken, nothing spilt." },
      {
        id: "fox-prints",
        kind: "found",
        mark: "fox-prints",
        title: "Small paw prints",
        note: "Four toes and a neat pad, each print set before the last in one line. A fox walks so; a badger waddles. And small: a young one.",
        at: { from: "hives", near: 3.5, far: 8 },
      },
      {
        id: "fur",
        kind: "found",
        mark: "fur",
        title: "A tuft of russet fur",
        note: "Caught on a twig at knee height. Soft as thistledown: the fur of a cub, not a grown fox.",
        at: { from: "person", near: 8, far: 15 },
      },
      {
        id: "mitten",
        kind: "found",
        mark: "mitten",
        title: "A small red mitten",
        note: "Knitted, much darned, and sized for a hand no bigger than a child's. The palm is sticky. Honey, unless I'm much mistaken.",
        at: { from: "person", near: 10, far: 18 },
      },
      {
        id: "crumbs",
        kind: "found",
        mark: "crumbs",
        title: "Crumbs and honey",
        note: "Bread crumbs, each with a drop of honey, in a trail towards the woods. Someone is carrying a meal to somebody.",
        at: { from: "person", near: 13, far: 22 },
      },
      { id: "farm-child", kind: "said", title: "A shy child nearby", note: "Over the hill is a farm with one girl, Aino: shy as a hare and always on her own, the beekeeper says." },
    ],
    deductions: [
      { id: "not-badger", from: ["badger", "lids"], title: "No badger did this", note: "A badger smashes a jar to lick it clean. These lids were unscrewed and set down: hands did this, not paws." },
      { id: "fox-cub", from: ["fox-prints", "fur"], title: "A fox cub comes here", note: "Small prints in a single line, and a cub's soft fur: a young fox has been close by the hives." },
      { id: "child", from: ["not-badger", "mitten", "farm-child"], title: "A child opened the jars", note: "Small hands, a sticky mitten, and a lonely girl over the hill. The thief is a child." },
      { id: "solved", from: ["child", "fox-cub", "crumbs"], title: "Honey for a fox cub", note: "A lonely child has been carrying bread and honey into the woods to feed a fox cub. A thief, and a friend." },
    ],
    solution: "solved",
  },
  meet: {
    pages: [
      {
        say: "Elliott, is it? I'm {name}. You've come on a strange morning: someone's been at my honey.",
        choices: [
          { tone: "warm", say: "Oh no, are the bees all right?", reply: "The bees are fine. It's the jars on the shelf I mind." },
          { tone: "curious", say: "Someone? Not something?", reply: "Well. Something, surely. A badger, I'd bet my veil on it." },
          { tone: "playful", say: "A honey thief? How bold.", reply: "Bold as a bear, and twice as sticky-pawed." },
        ],
      },
      { say: "Three jars, emptied, the lids set beside them. A badger, I'm sure of it. They dig out the wild bees, you know." },
      { say: "If you've an eye for such things, have a look round the hives. I'd love to know whom to scold." },
    ],
    testimony: ["badger", "lids"],
  },
  waiting: {
    pages: [{ say: "Any sign of my badger? Have a look round the hives, and the bushes towards the woods." }],
  },
  hunch: {
    after: "mitten",
    talk: {
      pages: [
        { say: "A mitten? Let me see. Why, that's a child's, surely." },
        { say: "There's a farm over the hill. Their girl Aino is about that size. Shy as a hare, and always on her own, poor thing." },
      ],
      testimony: ["farm-child"],
    },
  },
  reveal: {
    pages: [
      { lead: "It was never a badger. The lids were set down neatly, and that takes hands.", say: "Hands? Whose hands would steal my honey?" },
      { lead: "Small ones. A child's mitten, sticky with it, and a trail of honey bread into the woods.", say: "Into the woods? Whatever for?" },
      { lead: "A fox cub. Its prints are by your hives and its fur is on the bushes. Aino has been feeding it.", say: "Little Aino! Always alone, and she found a friend, and fed it the only way she knew." },
      {
        say: "I'll ask her to help me with the hives. Honey for her fox, and company for us both.",
        choices: [
          { tone: "warm", say: "She'd love that.", reply: "And I'd love her to. Bees are better shared." },
          { tone: "curious", say: "And the fox cub?", reply: "A fox who likes honey bread will be back. We'll put out a bowl." },
          { tone: "playful", say: "Your new bee-apprentice!", reply: "Paid in mittens. I'll knit her a new pair." },
        ],
      },
      { say: "You've a detective's eye, Elliott. Take this: my grandfather's glass, for reading the frames." },
    ],
    gifts: [{ kind: "keepsake", keepsake: "magnifying-glass" }],
  },
  friend: {
    greet: {
      warm: "Elliott! Aino's here most mornings now. The bees adore her.",
      curious: "Come to see the fox? It eats from Aino's hand now.",
      playful: "Our detective! Not a jar gone since. Well, none unaccounted for.",
    },
    pages: [{ say: "We keep a bowl of honey bread by the hives now. For the fox, and for whoever needs one." }],
  },
};
