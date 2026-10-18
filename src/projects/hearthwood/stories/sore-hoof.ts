import type { HelpStory } from "./story";

/** A shepherd's old ewe with a cut hoof, eased with yarrow salve, the way the shepherd's gran made it. */
export const SORE_HOOF: HelpStory = {
  id: "sore-hoof",
  title: "The ewe with the sore hoof",
  kind: "help",
  roles: ["shepherd"],
  request: { kind: "brew", brew: "yarrow-salve" },
  meet: {
    pages: [
      { say: "Oh, hello! Mind the gate, it sticks. I'm {name}. This is Pilvi, my oldest ewe. She's lying down, which she never does." },
      {
        say: "She cut her hoof on the scree. It isn't bad, but she won't put it down, and she's very cross about it.",
        choices: [
          { tone: "warm", say: "Oh, poor Pilvi.", reply: "Say it again, she likes it. I think she's enjoying the fuss." },
          { tone: "curious", say: "What helps a sore hoof?", reply: "Yarrow, the old shepherds say. Woundwort, they called it. Good for sore feet of every kind." },
          { tone: "playful", say: "She looks very dignified.", reply: "She's practising. She wants the whole flock to know she's been through something." },
        ],
      },
      { say: "My gran made yarrow salve: the white flowers set in beeswax, warmed at the fire. Could you make some? Pilvi would be so grateful." },
    ],
    gifts: [{ kind: "brew-hint", brew: "yarrow-salve" }],
  },
  waiting: {
    pages: [{ say: "Yarrow and beeswax, in a little tin. Its white flowers grow on sunny meadows and verges in summer. Pilvi's good at lying down now." }],
  },
  thanks: {
    pages: [
      { say: "Is that yarrow salve? Oh, it smells just like Gran's. Hold still, Pilvi. There we are." },
      {
        say: "Look at her. Up already, and pretending she never lay down at all.",
        choices: [
          { tone: "warm", say: "She's so brave.", reply: "She is. Don't tell her, though. She's vain enough already." },
          { tone: "curious", say: "Will it heal quickly?", reply: "A few days, with yarrow. She'll lead the flock up the fell by the weekend." },
          { tone: "playful", say: "A miraculous recovery!", reply: "Ha! She'll want salve every time she stubs a hoof now." },
        ],
      },
      { say: "Here. Pilvi's old bell, from before she had her new one. It rang her home through a hundred fogs. It should go with someone kind." },
    ],
    gifts: [{ kind: "keepsake", keepsake: "sheep-bell" }],
  },
  friend: {
    greet: {
      warm: "Elliott! Pilvi's hoof is good as new. She trots to the gate when she hears you.",
      curious: "Back again! I keep a tin of your salve by the gate now, just in case.",
      playful: "Pilvi has forgiven the scree. Mostly. She still glares at it.",
    },
    pages: [{ say: "Every scrape now, she comes and lies down in front of me, very pointedly. You've spoiled her, you know. I don't mind a bit." }],
  },
};
