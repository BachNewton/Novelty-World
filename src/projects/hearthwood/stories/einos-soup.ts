import type { HelpStory } from "./story";

/** A cottager who never learnt their late husband's mushroom soup, and would love to taste it once more. */
export const EINOS_SOUP: HelpStory = {
  id: "einos-soup",
  title: "Eino's soup",
  kind: "help",
  roles: ["cottager"],
  request: { kind: "dish", dish: "mushroom-soup" },
  meet: {
    pages: [
      { say: "Come in out of the wind a moment. I'm {name}. Forgive the mess, I've been reading old letters." },
      {
        say: "My Eino made the best mushroom soup in the valley. Porcini and chanterelles, with cream, in the pot. I never learnt it.",
        choices: [
          { tone: "warm", say: "He sounds like a dear man.", reply: "He was. He sang to the soup. Badly." },
          { tone: "curious", say: "Was there a secret to it?", reply: "Patience, he said. And the wrong spoon." },
          { tone: "playful", say: "Did the soup like the singing?", reply: "It never complained. Which is more than I can say." },
        ],
      },
      { say: "If you ever make it, would you bring me a bowl? I'd love to taste it again, just the once." },
    ],
    gifts: [{ kind: "hint", recipe: "mushroom-soup" }],
  },
  waiting: {
    pages: [{ say: "Porcini and chanterelles, cream, in the pot. That was all Eino ever told me. That, and 'patience'." }],
  },
  thanks: {
    pages: [
      { say: "Oh. Oh, that smell. That's it exactly." },
      {
        say: "He stirred it with the porridge spoon, the wrong one, and swore it tasted better that way.",
        choices: [
          { tone: "warm", say: "I'm glad it reached you.", reply: "So am I, dear. So am I." },
          { tone: "curious", say: "Did it? Taste better?", reply: "I never dared try it with the right spoon." },
          { tone: "playful", say: "I used the wrong spoon too.", reply: "Then it's his soup through and through." },
        ],
      },
      { say: "Here: a rowan seedling from his tree by the door. Plant it near your fire. Rowan keeps a home safe, they say." },
    ],
    gifts: [{ kind: "keepsake", keepsake: "rowan-seedling" }],
  },
  friend: {
    greet: {
      warm: "Elliott, dear. Sit, sit. The kettle's on.",
      curious: "You're back! How's that little rowan growing?",
      playful: "If it isn't the best soup-maker in the valley. Don't tell Eino.",
    },
    pages: [{ say: "I still have the bowl you brought, washed and on the shelf. I look at it when the evenings are long." }],
  },
};
