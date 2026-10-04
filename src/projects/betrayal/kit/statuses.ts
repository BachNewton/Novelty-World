import type { Behaviour } from "../engine/sources";

// Statuses several haunts put on figures. Each is one shared entry, so two
// haunts that both use one register it once.

/** Asleep (haunt 13's dreamer): the figure chooses and does nothing, but
 *  things still happen to it. It takes no actions, so it neither moves,
 *  explores, attacks nor handles cards, and nothing can be handed to it; no
 *  effect can move it out of its room; and, like a stunned monster, it gets
 *  in no one's way. It still defends, makes the rolls an effect forces on
 *  it, and takes damage, and its seat still makes every choice the rules
 *  give that seat. */
export const ASLEEP: Behaviour = {
  name: "asleep",
  modifiers: [
    {
      question: "canAct",
      when: (_state, { figure }, source) => figure === source.holder,
      change: { deny: true },
    },
    {
      question: "canCarry",
      when: (_state, { figure }, source) => figure === source.holder,
      change: { deny: true },
    },
    {
      question: "canBeMoved",
      when: (_state, { figure }, source) => figure === source.holder,
      change: { deny: true },
    },
    {
      question: "hinders",
      when: (_state, { hinderer }, source) => hinderer === source.holder,
      change: { transform: () => false },
    },
  ],
};
