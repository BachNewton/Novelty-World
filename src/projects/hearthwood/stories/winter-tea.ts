import type { HelpStory } from "./story";

/** A traveller resting on the way home before the snow, who wants their mother's juniper winter tea for the long dark. */
export const WINTER_TEA: HelpStory = {
  id: "winter-tea",
  title: "For the long dark",
  kind: "help",
  roles: ["traveller"],
  request: { kind: "brew", brew: "winter-tea" },
  meet: {
    pages: [
      { say: "Hello, friend! I'm {name}. I'm walking home before the snow comes, and resting my legs on the way." },
      {
        say: "Home's far north, where the sun hardly rises in winter. My mother made juniper winter tea for the dark. I've never got it right.",
        choices: [
          { tone: "warm", say: "I'd love to try it.", reply: "Then we'll share a cup, once there's tea to share." },
          { tone: "curious", say: "What goes into it?", reply: "Juniper berries and lingonberries, with honey. The blue and the red, she used to say." },
          { tone: "playful", say: "Just pack more socks.", reply: "I've four pairs on already. It's the dark I mind, not the cold." },
        ],
      },
      { say: "Juniper and lingonberry and honey, steeped. Both ripen as summer turns to autumn. Would you brew me some for the dark months?" },
    ],
    gifts: [{ kind: "brew-hint", brew: "winter-tea" }],
  },
  waiting: {
    pages: [{ say: "Juniper and lingonberry, with honey, steeped. Late summer into autumn is the time for both. I'll rest here a good while yet." }],
  },
  thanks: {
    pages: [
      { say: "Juniper winter tea! Let me smell it. Oh, that's it. That's exactly my mother's." },
      {
        say: "You've brought a lot of winters back, there. Good ones, with snow up to the windows and a lamp in each.",
        choices: [
          { tone: "warm", say: "Share a cup with me?", reply: "Of course. That's what it's for. Sit, sit." },
          { tone: "curious", say: "What was she like?", reply: "Loud at the sauna, quiet in the snow. She'd have liked you." },
          { tone: "playful", say: "The blue and the red!", reply: "Ha! You were listening. She'd be so pleased." },
        ],
      },
      { say: "Drink yours from this, now. A kuksa, carved from a birch burl. Every walker ought to have one, and I have two." },
    ],
    gifts: [{ kind: "keepsake", keepsake: "kuksa" }],
  },
  friend: {
    greet: {
      warm: "Elliott! I'm off north soon. I hope you're drinking from that kuksa.",
      curious: "Still here! I've been making that tea last: one cup each evening, at dusk.",
      playful: "Back again! This is our resting spot now, I think.",
    },
    pages: [{ say: "Every cup I pour, I think of my mother, and of you. That's two people in one cup. A good cup." }],
  },
};
