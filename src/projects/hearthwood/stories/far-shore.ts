import type { MysteryStory } from "./story";

/** A fisher's boat is on the far shore some mornings. An old friend rows across for cloudberries, and leaves jam by way of sorry. */
export const FAR_SHORE: MysteryStory = {
  id: "far-shore",
  title: "The boat on the far shore",
  kind: "mystery",
  roles: ["fisher"],
  mystery: {
    clues: [
      { id: "wrong-shore", kind: "said", title: "On the far shore", note: "Some mornings the boat is across the lake, though it was tied up here the night before." },
      { id: "jam", kind: "said", title: "Jam on the step", note: "On those same mornings, a jar of cloudberry jam on the fisher's step, and no name on it." },
      {
        id: "rope",
        kind: "found",
        mark: "rope",
        title: "A neat coil of rope",
        note: "The mooring rope, untied rather than snapped, and coiled the way an old sailor coils it. Someone who knows boats.",
        at: { from: "person", near: 2.5, far: 6 },
      },
      {
        id: "cane-prints",
        kind: "found",
        mark: "cane-prints",
        title: "Boot prints and a cane",
        note: "Heavy boots, a short, slow stride, and a small round hole beside every other step. Someone old, who walks with a cane.",
        at: { from: "person", near: 5, far: 11 },
      },
      {
        id: "cloudberry-leaf",
        kind: "found",
        mark: "cloudberry-leaf",
        title: "A cloudberry leaf",
        note: "Fresh, and still wet. Cloudberries grow only out on the bog, and the bog here lies across the water.",
        at: { from: "person", near: 8, far: 16 },
      },
      { id: "old-friend", kind: "said", title: "An old friend", note: "Halvard fished this lake with the fisher for forty years. He walks with a cane now. They quarrelled, and haven't spoken since." },
    ],
    deductions: [
      { id: "borrowed", from: ["wrong-shore", "rope"], title: "Borrowed, not drifted", note: "A drifting boat snaps or slips its rope. This one was untied and the rope coiled: someone rowed it across." },
      { id: "who", from: ["borrowed", "cane-prints", "old-friend"], title: "Halvard rows it", note: "Someone old, with a cane, who coils a rope like a sailor: Halvard, the fisher's old friend." },
      { id: "why", from: ["cloudberry-leaf", "jam"], title: "Cloudberries for jam", note: "Someone crosses to the bog to pick cloudberries, and the jam turns up on the step." },
      { id: "solved", from: ["who", "why"], title: "A quiet sorry", note: "Halvard rows across for cloudberries and leaves the fisher jam: an old friend saying sorry the only way he knows how." },
    ],
    solution: "solved",
  },
  meet: {
    pages: [
      {
        say: "Morning! I'm {name}. You've found me in a muddle: my boat's gone wandering again.",
        choices: [
          { tone: "warm", say: "Oh dear, again?", reply: "Again. It's a patient lake, but it's a long walk round." },
          { tone: "curious", say: "Wandering where?", reply: "To the far shore. Tied up here at night, over there by morning." },
          { tone: "playful", say: "A boat with itchy feet?", reply: "Itchy oars, maybe. It never asks my leave." },
        ],
      },
      { say: "And on those mornings there's a jar of cloudberry jam on my step. No name. I can't make head nor tail of it." },
      { say: "You've a sharp look about you. Would you have a look round the boat? I'd dearly like to know." },
    ],
    testimony: ["wrong-shore", "jam"],
  },
  waiting: {
    pages: [{ say: "Any thoughts? The boat's there by the shore, if you'd like another look." }],
  },
  hunch: {
    after: "cane-prints",
    talk: {
      pages: [
        { say: "A cane? Only one old fellow round here walks with a cane: Halvard. We fished together forty years." },
        { say: "Till we quarrelled over a net. Such a silly thing. We haven't spoken since." },
      ],
      testimony: ["old-friend"],
    },
  },
  reveal: {
    pages: [
      { lead: "Your boat doesn't drift. Its rope was untied, and coiled like a sailor's.", say: "Coiled? Nobody coils a rope like that any more. Nobody but..." },
      { lead: "Someone old, with a cane, whose prints are by your boat.", say: "Halvard. It's Halvard. But why ever would he take my boat?" },
      { lead: "To cross to the bog for cloudberries. The jam on your step is his.", say: "All this time, the jam. Every Sunday. Oh, the stubborn old goose." },
      {
        say: "He's been saying sorry all summer, and I never knew how to hear it.",
        choices: [
          { tone: "warm", say: "It's not too late.", reply: "No. No, it isn't. I'll row over to him myself." },
          { tone: "curious", say: "What will you do?", reply: "Row across, and pick cloudberries with him. Two fill a pail faster." },
          { tone: "playful", say: "Bring the jam?", reply: "I'll bring the bread. He always brought the jam." },
        ],
      },
      { say: "Thank you, Elliott. Here's how Halvard eats it: on pancakes, with flour and eggs, in the pan." },
    ],
    gifts: [{ kind: "hint", recipe: "cloudberry-pancakes" }],
  },
  friend: {
    greet: {
      warm: "Elliott! Halvard and I were out on the lake at dawn.",
      curious: "Come to see the boat? It stays put now. Mostly.",
      playful: "My detective! The boat still wanders, but now I'm in it.",
    },
    pages: [{ say: "Jam every Sunday still. Only now we eat it together, on the shore." }],
  },
};
