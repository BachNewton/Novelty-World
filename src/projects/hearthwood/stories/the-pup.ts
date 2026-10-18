import type { HelpStory } from "./story";

/** A shepherd's young dog who would rather wander than herd, found and brought back, and given to Elliott to keep. */
export const THE_PUP: HelpStory = {
  id: "the-pup",
  title: "The pup who wouldn't herd",
  kind: "help",
  roles: ["shepherd"],
  request: { kind: "pet", species: "dog" },
  meet: {
    pages: [
      { say: "Hello there! You haven't seen a young dog, have you? All legs and ears. {pet}, I call them. I'm {name}." },
      {
        say: "I hoped {pet} would learn the sheep. But {pet} only wants to chase butterflies and lie in the sun.",
        choices: [
          { tone: "warm", say: "That sounds like a happy dog.", reply: "Oh, the happiest. Just not the most useful." },
          { tone: "curious", say: "Not a herding sort, then?", reply: "{pet} herded a goose once. By accident. The goose was not pleased." },
          { tone: "playful", say: "Butterflies need herding too.", reply: "Ha! Then {pet} is the finest butterfly-dog in the valley." },
        ],
      },
      { say: "Off towards {way} this morning, after a hare that wasn't there. Would you look? Dogs come to kind folk." },
    ],
  },
  waiting: {
    pages: [{ say: "No {pet} yet? Off towards {way}, last I saw. Asleep in a patch of sun, I'd bet, the rascal." }],
  },
  thanks: {
    pages: [
      { say: "{pet}! There you are, you daft thing. And look at you, walking at Elliott's heel like you were born to it." },
      {
        say: "I've never seen that tail go like that. Not for me, not for the sheep.",
        choices: [
          { tone: "warm", say: "We've become good friends.", reply: "I can see it. Anyone could." },
          { tone: "curious", say: "Was there ever a hare?", reply: "No. There was no hare. There's never a hare." },
          { tone: "playful", say: "{pet} herded me, a little.", reply: "Then {pet} found the right flock at last." },
        ],
      },
      { say: "Here's the truth of it: {pet} isn't a sheepdog. {pet} is a walking dog. A wandering dog. Like you." },
      { say: "Will you keep {pet}? Bring them by when you pass. And fry porcini in butter, in the pan, the way we do up here." },
    ],
    gifts: [{ kind: "companion" }, { kind: "hint", recipe: "porcini-saute" }],
  },
  friend: {
    greet: {
      warm: "Elliott! Come and sit a while. How's my old butterfly-dog?",
      curious: "Back again! Has {pet} caught a hare yet? No? Good.",
      playful: "Look who it is: the finest flock-leader in the valley.",
    },
    pages: [{ say: "The ewes miss {pet}, I think. They had nobody to ignore. Give {pet} a scratch from me." }],
  },
};
