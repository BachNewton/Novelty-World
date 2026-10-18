import type { HelpStory } from "./story";

/** A beekeeper whose hands ache from lifting the honey frames, soothed with meadowsweet tea. */
export const ACHING_HANDS: HelpStory = {
  id: "aching-hands",
  title: "The beekeeper's hands",
  kind: "help",
  roles: ["beekeeper"],
  request: { kind: "brew", brew: "meadowsweet-tea" },
  meet: {
    pages: [
      { say: "Hello, hello. Gently, the bees are counting flowers. I'm {name}. Forgive me if I don't wave: my hands ache today." },
      {
        say: "It's all the lifting of the frames. Honey's heavy, and my fingers are older than they used to be.",
        choices: [
          { tone: "warm", say: "That sounds so sore.", reply: "It is, a bit. But the bees are worth every ache." },
          { tone: "curious", say: "Does anything help?", reply: "Meadowsweet tea. The bees love its flowers too. It's like they're looking after me twice." },
          { tone: "playful", say: "Have the bees helped?", reply: "They offered to sting it better. I said no, thank you." },
        ],
      },
      { say: "Meadowsweet grows in damp meadows and by the water in high summer, all cream and froth. Steeped with honey, it eases aches. Would you?" },
    ],
    gifts: [{ kind: "brew-hint", brew: "meadowsweet-tea" }],
  },
  waiting: {
    pages: [{ say: "Meadowsweet and honey, steeped: the creamy flowers from damp meadows and banks, in high summer. My hands and I will wait." }],
  },
  thanks: {
    pages: [
      { say: "Meadowsweet tea! It smells of almonds and summer. And warm right through the bottle. Thank you." },
      {
        say: "My fingers feel looser already. Or I'm imagining it. Either way, it's lovely.",
        choices: [
          { tone: "warm", say: "You deserve looking after.", reply: "So do you, you know. Don't forget it." },
          { tone: "curious", say: "Will it help for long?", reply: "A cup each evening, and I'll be lifting frames like a youngster." },
          { tone: "playful", say: "The bees will be jealous.", reply: "They've had all the meadowsweet's nectar. They can share." },
        ],
      },
      { say: "One from my grandmother, who kept bees too: fly agaric and a cloudberry, tied up as a charm, and the fireflies come to camp that night." },
    ],
    gifts: [{ kind: "brew-hint", brew: "lantern-charm" }],
  },
  friend: {
    greet: {
      warm: "Elliott! My hands are so much better. Look, I can wave properly now.",
      curious: "Come to see the hives? The bees have been extra busy lately.",
      playful: "My favourite tea-maker! The bees have been asking after you.",
    },
    pages: [{ say: "I drink a cup every evening by the hives as they settle. The bees hum, my hands rest. It's the best part of the day." }],
  },
};
