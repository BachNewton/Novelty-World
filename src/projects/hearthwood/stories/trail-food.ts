import type { TalkStory } from "./story";

/** A hiker who walks the long way round on purpose, and knows the best food for a trail. */
export const TRAIL_FOOD: TalkStory = {
  id: "trail-food",
  title: "The long way round",
  kind: "talk",
  roles: ["hiker"],
  meet: {
    pages: [
      { say: "Hello! I'm {name}, out walking the long way round. It's the only way I know, really." },
      {
        say: "From up on the ridge you can see three valleys at once. I pick one and walk until my legs say stop.",
        choices: [
          { tone: "warm", say: "That sounds wonderful.", reply: "It is. Every valley's a little different. Like people." },
          { tone: "curious", say: "Which one did you pick today?", reply: "This one. Because it had you in it, as it turns out." },
          { tone: "playful", say: "Have your legs said stop yet?", reply: "Twice. I'm ignoring them politely." },
        ],
      },
      { say: "Best trail food there is: porcini and chanterelles on a stick, over the flames. Smoky and good." },
    ],
    gifts: [{ kind: "hint", recipe: "mushroom-skewers" }],
  },
  friend: {
    greet: {
      warm: "Elliott! Picked this valley again, did you? Good choice.",
      curious: "Back! I've found a fourth valley. Don't tell the other three.",
      playful: "Hello! My legs said stop, so here I am. Stopped.",
    },
    pages: [{ say: "Did you try the skewers? Smoke in your hair for a day. Worth it." }],
  },
};
