import type { TalkStory } from "./story";

/** A fisher at the water's edge, and the old pike under the lilies that winks at good-hearted folk. */
export const WINKING_PIKE: TalkStory = {
  id: "winking-pike",
  title: "The winking pike",
  kind: "talk",
  roles: ["fisher"],
  meet: {
    pages: [
      { say: "Ah, hello. Sit if you like, the fish won't mind. I'm {name}. They never bite while I'm talking anyway." },
      {
        say: "Have you heard of the old pike? Big as a rowing boat, older than the church. Lives right out there, under the lilies.",
        choices: [
          { tone: "warm", say: "I'd love to see it.", reply: "Then be kind to the water. That's the only bait it takes." },
          { tone: "curious", say: "Have you seen it yourself?", reply: "Once, long ago. It looked at me with one gold eye, and winked." },
          { tone: "playful", say: "Bigger than your boat?", reply: "My boat is very small. But yes. Much bigger." },
        ],
      },
      { say: "They say it winks at good-hearted folk. I like to think it winked at me, and not at the sandwich I was holding." },
      { say: "Here. I carve these while I wait. A little pike, for luck. Put it where it can see the water." },
    ],
    gifts: [{ kind: "keepsake", keepsake: "carved-fish" }],
  },
  friend: {
    greet: {
      warm: "Elliott! Come, sit. The water's been quiet without you.",
      curious: "You're back! And no, I haven't seen it again. Not quite.",
      playful: "Hello, hello. Still no bites. I blame you, from afar.",
    },
    pages: [{ say: "I saw a ripple out by the lilies this morning. Big and slow. Could have been a wink." }],
  },
};
