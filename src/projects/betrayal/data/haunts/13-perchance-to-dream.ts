import { addToCounter, hauntRule, type RoomMatch } from "../../engine/haunt";
import type { HauntDefinition } from "../../kit/haunt";
import {
  carriedHere,
  dealsDamageAs,
  escapeTheHouse,
  killedWhenBeatenBy,
  replaceWhenLost,
  SETUP_CANT_KILL,
  supplyOf,
  taskRoll,
  withExplorerOf,
} from "../../kit/rules";
import { ASLEEP } from "../../kit/statuses";
import type { FigureDefinition, RuleRef } from "../../types";
import TEXTS from "../haunt-texts/13-perchance-to-dream.json";

// Haunt 13, Perchance to Dream (content/haunts/13-perchance-to-dream.md).
// The traitor's explorer sleeps where the haunt began, and Nightmares, one
// per player, pour out of the body. The traitor wins when as many escape
// from the house as there were escape rooms, a number only the traitor
// knows; the heroes win by waking the dreamer with the Holy Symbol.

const NUMBER = 13;

const rule = (section: string, ruling: string): RuleRef => ({
  ...hauntRule(NUMBER, section),
  ruling,
});

/** Every room with windows, every outside room, and the Entrance Hall
 *  (ruling h13-escape-rooms). */
const ESCAPE_ROOMS: RoomMatch = {
  windows: true,
  outside: true,
  rooms: ["entrance-hall"],
};

const NIGHTMARE: FigureDefinition = {
  id: "nightmare",
  name: "Nightmare",
  kind: "monster",
  traits: { kind: "fixed", values: { speed: 5, might: 4, sanity: 4 } },
  token: "monster-purple",
  explores: false,
  carries: false,
};

const ESCAPE = rule("How Nightmares Escape", "h13-escape");
const UNLEASH = rule("How Nightmares Escape", "h13-unleash");
const WAKE = rule("How to Wake the Dreamer", "h13-wake");

export const PERCHANCE_TO_DREAM: HauntDefinition = {
  number: NUMBER,
  name: "Perchance to Dream",
  set: "base",
  content: "13-perchance-to-dream.md",
  texts: TEXTS,
  figures: [NIGHTMARE],
  statuses: { asleep: ASLEEP },
  counters: {
    escapes: { name: "escapes" },
    wakes: { name: "wake tokens" },
  },
  secrets: { "escape-rooms": { name: "number of escape rooms" } },
  setup: {
    traitor: [
      { part: "status", who: "traitor", status: "asleep", ruling: "h13-asleep" },
      { part: "drop-items", who: "traitor", ruling: "h13-drop-items" },
      {
        part: "set-aside-companions",
        who: "traitor",
        ruling: "h13-companions",
      },
      {
        part: "spawn",
        figure: "nightmare",
        count: { of: "players" },
        at: "traitor",
        owner: "traitor",
      },
      {
        part: "rooms",
        match: ESCAPE_ROOMS,
        atLeast: { of: "players" },
        chooser: "traitor",
        ruling: "h13-top-up",
      },
      {
        part: "secret",
        secret: "escape-rooms",
        value: { of: "rooms", match: ESCAPE_ROOMS },
        knownBy: "traitor",
        ruling: "h13-escape-rooms",
      },
      { part: "counter", counter: "escapes", start: 0 },
    ],
    heroes: [{ part: "counter", counter: "wakes", start: 0 }],
  },
  modifiers: [
    // Neither dropping the items nor setting the companions aside can kill
    // the dreamer (rulings h13-drop-items, h13-companions).
    SETUP_CANT_KILL,
    dealsDamageAs(
      "nightmare",
      "mental",
      rule("Special Attack Rules", "h13-mental-damage"),
    ),
    killedWhenBeatenBy(
      "nightmare",
      "heroes",
      rule("Special Attack Rules", "h13-killed"),
    ),
    // Each kill or escape lets in one replacement, so the Nightmares in
    // play never outnumber the players (ruling h13-unleash).
    supplyOf("nightmare", { of: "players" }),
  ],
  reactions: replaceWhenLost({
    figure: "nightmare",
    at: "traitor",
    owner: "traitor",
    rule: UNLEASH,
  }),
  actions: {
    escape: escapeTheHouse({
      label: "Escape from the house",
      definition: "nightmare",
      rooms: ESCAPE_ROOMS,
      marker: "item",
      counter: { id: "escapes", of: "escape-rooms" },
      rule: ESCAPE,
    }),
    // Any hero in the dreamer's room, while a hero there carries the Holy
    // Symbol; the roll isn't a use of it. The Smelling Salts wake no one:
    // only this roll does.
    ...taskRoll({
      id: "haunt-13-wake",
      task: "wake the dreamer",
      traits: ["sanity", "might"],
      target: 5,
      side: "heroes",
      available: (state, figure, engine) =>
        withExplorerOf(state, figure, "traitor") &&
        carriedHere(engine, state, figure, "holy-symbol", "heroes"),
      success: (trait) => ({
        token: trait === "sanity" ? "sanity-roll" : "might-roll",
        steps: [addToCounter("wakes", 1, WAKE)],
      }),
      rule: WAKE,
    }),
  },
  goals: [
    {
      id: "escaped",
      side: "traitor",
      when: {
        counter: "escapes",
        atLeast: { of: "secret", secret: "escape-rooms" },
      },
      reveals: ["escape-rooms"],
    },
    {
      id: "woken",
      side: "heroes",
      when: { counter: "wakes", atLeast: { of: "players" } },
      ruling: "h13-wake",
    },
    {
      id: "dreamer-dead",
      side: "traitor",
      when: { explorerDead: "traitor" },
      ruling: "h13-game-end",
    },
    {
      id: "holy-symbol-lost",
      side: "traitor",
      when: { cardOutOfGame: "holy-symbol" },
      ruling: "h13-game-end",
    },
  ],
  rulings: [
    "h13-asleep",
    "h13-drop-items",
    "h13-companions",
    "h13-escape-rooms",
    "h13-top-up",
    "h13-nightmare-moves",
    "h13-escape",
    "h13-unleash",
    "h13-mental-damage",
    "h13-killed",
    "h13-game-end",
    "h13-wake",
  ],
};
