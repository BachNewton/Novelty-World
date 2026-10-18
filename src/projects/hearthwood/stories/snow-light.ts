import type { HelpStory } from "./story";

/** A reindeer herder on the fells whose proud dog went after a calf, found and brought home again. */
export const SNOW_LIGHT: HelpStory = {
  id: "snow-light",
  title: "The proud dog",
  kind: "help",
  roles: ["herder"],
  request: { kind: "pet", species: "dog" },
  meet: {
    pages: [
      { say: "Hei! Welcome up on the fell. I'm {name}. The herd's down in the birches today, for the shade." },
      {
        say: "My dog {pet} went off towards {way} after a calf yesterday. The calf came back. {pet} didn't.",
        choices: [
          { tone: "warm", say: "You must be so worried.", reply: "A little. {pet} is clever, but the woods aren't home." },
          { tone: "curious", say: "Will {pet} know the way?", reply: "Up here, yes. Down in the trees, everything smells the same." },
          { tone: "playful", say: "Maybe the calf herded {pet}.", reply: "Don't say that near {pet}. Very proud dog." },
        ],
      },
      { say: "Will you look? {pet} is friendly, mostly. Just proud. Be gentle, and {pet} will follow you anywhere." },
    ],
  },
  waiting: {
    pages: [{ say: "Off towards {way}, after a calf. Be gentle with {pet}. Then {pet} will follow you home." }],
  },
  thanks: {
    pages: [
      { say: "{pet}! You silly, wonderful dog! Come here, come here." },
      {
        say: "Look at that, pretending it was all planned. Very proud dog.",
        choices: [
          { tone: "warm", say: "{pet} missed you too.", reply: "Don't tell {pet} you noticed. Very proud." },
          { tone: "curious", say: "Will {pet} stay close now?", reply: "Until the next calf. Then we'll see." },
          { tone: "playful", say: "It was all planned, of course.", reply: "Ha! Now you sound just like {pet}." },
        ],
      },
      { say: "Here, I felted this through the winter dark. A little reindeer, to keep you company now {pet} is home." },
    ],
    gifts: [{ kind: "keepsake", keepsake: "felted-reindeer" }],
  },
  friend: {
    greet: {
      warm: "Elliott! {pet}, look who it is. That's the proud dog's thank you.",
      curious: "Back up the fell! The herd's moved twice since you came.",
      playful: "Hei! {pet} has been bragging about you. In a dog way.",
    },
    pages: [{ say: "{pet} hasn't left my side since. Well, once. But only for a minute, and only for a hare." }],
  },
};
