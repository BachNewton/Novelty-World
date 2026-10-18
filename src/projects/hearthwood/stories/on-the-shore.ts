import type { ReceiveStory } from "./story";

/** The friend waiting at the lake for the hiker who went walking: met as a story of their own, and given the note. */
export const ON_THE_SHORE: ReceiveStory = {
  id: "on-the-shore",
  title: "Waiting on the shore",
  kind: "receive",
  roles: ["fisher"],
  weight: 0,
  meet: {
    pages: [
      { say: "Hello. I'm {name}. Sorry, I'm a little distracted. My friend {partner} went walking this morning and isn't back." },
      {
        say: "{partner} has no sense of direction at all. None. Got lost in a cupboard, once.",
        choices: [
          { tone: "warm", say: "I'll keep an eye out.", reply: "Thank you. That helps more than you'd think." },
          { tone: "curious", say: "Which way did they go?", reply: "Towards {way}. Then probably every other way too." },
          { tone: "playful", say: "Was it a very big cupboard?", reply: "Medium. That's the worst part." },
        ],
      },
      { say: "I'll keep fishing. It helps me worry more quietly." },
    ],
  },
  waiting: {
    pages: [{ say: "Still no sign of {partner}. I'll keep fishing. The fish don't mind me worrying at them." }],
  },
  delivered: {
    pages: [
      { say: "A note? From {partner}? Oh, thank the stars. 'Safe. On a rock. Eating all our biscuits.' Of course." },
      {
        say: "I've been sat here all day pretending to fish, and not catching a thing.",
        choices: [
          { tone: "warm", say: "They're safe. That's what matters.", reply: "It is. Thank you, truly." },
          { tone: "curious", say: "Will you go to them?", reply: "This minute. With more biscuits." },
          { tone: "playful", say: "The biscuits are lost, though.", reply: "Every one. A brave sacrifice." },
        ],
      },
      { say: "Here's something for your trouble: funnel chanterelles and cream, in the pot. The best soup there is on a cold shore." },
    ],
    gifts: [{ kind: "hint", recipe: "funnel-chanterelle-soup" }],
  },
  friend: {
    greet: {
      warm: "Elliott! Come and sit. No worrying today.",
      curious: "Hello again. {partner}? Fine. On another rock, somewhere.",
      playful: "The biscuit-saviour returns! Hello, hello.",
    },
    pages: [{ say: "{partner} and I fish together now. Well, I fish. {partner} gets lost on the way to the jetty." }],
  },
};
