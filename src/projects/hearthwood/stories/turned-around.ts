import type { HelpStory } from "./story";

/** A hiker who has lost the path, not lost exactly, asking Elliott to carry a note to the friend waiting by the water. */
export const TURNED_AROUND: HelpStory = {
  id: "turned-around",
  title: "Turned around",
  kind: "help",
  roles: ["hiker"],
  request: { kind: "carry", parcel: "note", to: "on-the-shore" },
  meet: {
    pages: [
      {
        say: "Oh, thank goodness, a person! I'm {name}. I'm not lost, exactly. I just don't know where anything is.",
        choices: [
          { tone: "warm", say: "You're safe now. Sit a moment.", reply: "I've been sitting for an hour. But thank you." },
          { tone: "curious", say: "Where were you going?", reply: "Back. Which is a direction, I'm told." },
          { tone: "playful", say: "Everything is right here.", reply: "Ha! Then I'm the least lost person alive." },
        ],
      },
      { say: "My friend {partner} is fishing by the water, towards {way}. I said I'd be back by noon. I didn't say which noon." },
      { say: "Would you take this note to {partner}? It says I'm safe, sitting on a rock, eating all our biscuits." },
    ],
  },
  waiting: {
    pages: [{ say: "Did you find {partner}? Towards {way}, by the water. Big hat. Very patient. Unlike me." }],
  },
  thanks: {
    pages: [
      { say: "You found {partner}! Coming with more biscuits, you say? Then all is well." },
      {
        say: "I'll make a map next time. Or just follow the smoke from your fire.",
        choices: [
          { tone: "warm", say: "You're always welcome at it.", reply: "Careful. I'll take you up on that." },
          { tone: "curious", say: "Will you walk again?", reply: "Tomorrow! With {partner}, who knows where north is." },
          { tone: "playful", say: "The smoke goes up, mostly.", reply: "Then I'll go up. Can't miss." },
        ],
      },
      { say: "Here, take my compass. I clearly don't need it. I've never once looked at it." },
    ],
    gifts: [{ kind: "keepsake", keepsake: "compass" }],
  },
  friend: {
    greet: {
      warm: "Elliott! My rescuer. Biscuit?",
      curious: "Hello again! Yes, I know which way north is now. Mostly.",
      playful: "Still on my rock. It's a good rock. I've grown fond of it.",
    },
    pages: [{ say: "{partner} says I should wear a bell, like a sheep. I'm considering it." }],
  },
};
