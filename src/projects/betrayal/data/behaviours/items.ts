import { adjacent } from "../../engine/board";
import {
  chooseOne,
  defineStep,
  discardCard,
  drawCard,
  gain,
  relocate,
  roll,
  table,
  type Option,
} from "../../engine/effects";
import { explorerAt, MENTAL, PHYSICAL, TRAITS } from "../../engine/explorers";
import {
  eventData,
  local,
  type Behaviour,
  type BehaviourGroup,
  type Reaction,
} from "../../engine/sources";
import type { Explorer, GameState, RuleRef, Step, Trait } from "../../types";
import { CATALOG } from "..";

const card = (id: string): RuleRef => ({ source: "card", card: id });

const capitalised = (trait: Trait) =>
  `${trait[0].toUpperCase()}${trait.slice(1)}`;

const explorerName = (explorer: Explorer) =>
  CATALOG.characters[explorer.character].name;

const roomName = (room: string) => CATALOG.rooms[room].name;

/** "Discard this item after you use it." */
function discardAfterUse(id: string): Reaction {
  return {
    event: "card-used",
    when: (_state, event) => eventData<{ card: string }>(event).card === id,
    steps: (_state, _event, source) =>
      source.holder === null ? [] : [discardCard(source.holder, id)],
  };
}

/** You, and the other explorers in your room. */
function yourselfAndRoommates(state: GameState, seat: number): Explorer[] {
  const you = explorerAt(state, seat);
  return [
    you,
    ...state.explorers.filter((e) => e.seat !== seat && e.room === you.room),
  ];
}

// A trait's starting value is a marked space on its track, and traits move by
// spaces, so "below its starting value" means below that space.
const spacesBelowStart = (explorer: Explorer, trait: Trait) =>
  Math.max(
    CATALOG.characters[explorer.character].start[trait] - explorer.clips[trait],
    0,
  );

/** Options to raise any one or more of the traits below their starting value back to it. */
function restoreOptions(
  explorer: Explorer,
  traits: readonly Trait[],
  id: string,
): Option[] {
  const low = traits.filter((t) => spacesBelowStart(explorer, t) > 0);
  const subsets = low.flatMap((first, i) => [
    [first],
    ...low.slice(i + 1).map((second) => [first, second]),
  ]);
  return subsets.map((subset) => ({
    label: `Raise ${explorerName(explorer)}'s ${subset.map(capitalised).join(" and ")} to ${subset.length > 1 ? "their starting values" : "its starting value"}`,
    steps: subset.map((t) =>
      gain(explorer.seat, t, spacesBelowStart(explorer, t), card(id)),
    ),
  }));
}

/** An item that raises traits of yourself or a roommate back to their starting value, then is discarded. */
function restorer(
  id: string,
  label: string,
  traits: readonly Trait[],
): Behaviour {
  const options = (state: GameState, seat: number) =>
    yourselfAndRoommates(state, seat).flatMap((e) =>
      restoreOptions(e, traits, id),
    );
  return {
    actions: {
      use: {
        label,
        available: (state, seat) => options(state, seat).length > 0,
        steps: (state, seat) => [
          chooseOne(seat, options(state, seat), card(id)),
          discardCard(seat, id),
        ],
      },
    },
  };
}

function chooseTrait(
  seat: number,
  traits: readonly Trait[],
  rule: RuleRef,
): Step {
  return chooseOne(
    seat,
    traits.map((t) => ({
      label: `Gain 1 ${capitalised(t)}`,
      steps: [gain(seat, t, 1, rule)],
    })),
    rule,
  );
}

/** Item cards, from content/cards/items.md. */
export const ITEMS: BehaviourGroup = {
  cards: {
    "adrenaline-shot": {
      rollOptions: [
        {
          timing: "before",
          applies: (_state, _seat, roll) => roll.spec.kind === "trait",
          effect: { kind: "add", amount: 4 },
        },
      ],
      reactions: [discardAfterUse("adrenaline-shot")],
    },

    "amulet-of-the-ages": {
      onGain: (_state, seat) =>
        TRAITS.map((trait) =>
          gain(
            seat,
            trait,
            1,
            card("amulet-of-the-ages"),
            "amulet-of-the-ages",
          ),
        ),
      onLose: (_state, seat) =>
        TRAITS.map((trait) =>
          gain(
            seat,
            trait,
            -3,
            card("amulet-of-the-ages"),
            "amulet-of-the-ages",
          ),
        ),
    },

    "angel-feather": {
      rollOptions: [
        {
          timing: "before",
          applies: () => true,
          effect: { kind: "name", min: 0, max: 8 },
        },
      ],
      reactions: [discardAfterUse("angel-feather")],
    },

    armor: {
      modifiers: [
        {
          question: "damageAmount",
          when: (_state, subject, source) =>
            subject.seat === source.holder && subject.damage === "physical",
          change: { add: -1 },
        },
      ],
    },

    bell: {
      onGain: (_state, seat) => [gain(seat, "sanity", 1, card("bell"), "bell")],
      onLose: (_state, seat) => [
        gain(seat, "sanity", -1, card("bell"), "bell"),
      ],
    },

    bottle: {
      actions: {
        drink: {
          label: "Drink from the Bottle",
          available: (state) => state.status === "haunt",
          steps: (_state, seat) => {
            const rule = card("bottle");
            const both = (traits: Trait[], amount: number) =>
              traits.map((t) => gain(seat, t, amount, rule));
            return [
              roll(
                seat,
                { kind: "dice", count: 3 },
                rule,
                table([
                  {
                    min: 6,
                    max: 6,
                    steps: [local("bottle", "anywhere", { seat })],
                  },
                  { min: 5, max: 5, steps: both(["might", "speed"], 2) },
                  { min: 4, max: 4, steps: both(["knowledge", "sanity"], 2) },
                  {
                    min: 3,
                    max: 3,
                    steps: [
                      gain(seat, "knowledge", 1, rule),
                      gain(seat, "might", -1, rule),
                    ],
                  },
                  { min: 2, max: 2, steps: both(["knowledge", "sanity"], -2) },
                  { min: 1, max: 1, steps: both(["might", "speed"], -2) },
                  { min: 0, max: 0, steps: both([...TRAITS], -2) },
                ]),
              ),
              discardCard(seat, "bottle"),
            ];
          },
        },
      },
      steps: {
        anywhere: defineStep<{ seat: number }>((state, p, ctx) => {
          const here = explorerAt(state, p.seat).room;
          ctx.push(
            chooseOne(
              p.seat,
              state.board.tiles
                .filter((t) => t.tile !== here)
                .map((t) => ({
                  label: `Put your explorer in the ${roomName(t.tile)}`,
                  steps: [relocate(p.seat, t.tile, card("bottle"))],
                })),
              card("bottle"),
            ),
          );
        }),
      },
    },

    "dark-dice": {
      actions: {
        roll: {
          label: "Roll the Dark Dice",
          available: () => true,
          steps: (_state, seat) => {
            const rule = card("dark-dice");
            return [
              roll(
                seat,
                { kind: "dice", count: 3 },
                rule,
                table([
                  {
                    min: 6,
                    max: 6,
                    steps: [local("dark-dice", "join", { seat })],
                  },
                  {
                    min: 5,
                    max: 5,
                    steps: [local("dark-dice", "push", { seat })],
                  },
                  {
                    min: 4,
                    max: 4,
                    steps: [chooseTrait(seat, PHYSICAL, rule)],
                  },
                  {
                    min: 3,
                    max: 3,
                    steps: [local("dark-dice", "step", { seat })],
                  },
                  { min: 2, max: 2, steps: [chooseTrait(seat, MENTAL, rule)] },
                  { min: 1, max: 1, steps: [drawCard(seat, "event", rule)] },
                  {
                    min: 0,
                    max: 0,
                    steps: [
                      local("dark-dice", "bottom-out", { seat }),
                      discardCard(seat, "dark-dice"),
                    ],
                  },
                ]),
              ),
            ];
          },
        },
      },
      steps: {
        join: defineStep<{ seat: number }>((state, p, ctx) => {
          if (state.status !== "exploring")
            throw new Error(
              "The Dark Dice's 6 excludes the traitor, and the haunt doesn't record one yet",
            );
          const here = explorerAt(state, p.seat).room;
          const options = state.explorers
            .filter((e) => e.seat !== p.seat && e.room !== here)
            .map((e) => ({
              label: `Move to ${explorerName(e)} in the ${roomName(e.room)}`,
              steps: [relocate(p.seat, e.room, card("dark-dice"))],
            }));
          if (options.length > 0)
            ctx.push(chooseOne(p.seat, options, card("dark-dice")));
        }),
        push: defineStep<{ seat: number }>((state, p, ctx) => {
          const here = explorerAt(state, p.seat).room;
          const options = state.explorers
            .filter((e) => e.seat !== p.seat && e.room === here)
            .flatMap((e) =>
              adjacent(state.board, here).map((room) => ({
                label: `Move ${explorerName(e)} into the ${roomName(room)}`,
                steps: [relocate(e.seat, room, card("dark-dice"))],
              })),
            );
          if (options.length > 0)
            ctx.push(chooseOne(p.seat, options, card("dark-dice")));
        }),
        step: defineStep<{ seat: number }>((state, p, ctx) => {
          const options = adjacent(
            state.board,
            explorerAt(state, p.seat).room,
          ).map((room) => ({
            label: `Move into the ${roomName(room)}`,
            steps: [relocate(p.seat, room, card("dark-dice"))],
          }));
          if (options.length > 0)
            ctx.push(chooseOne(p.seat, options, card("dark-dice")));
        }),
        "bottom-out": defineStep<{ seat: number }>((state, p, ctx) => {
          const explorer = explorerAt(state, p.seat);
          ctx.push(
            ...TRAITS.map((t) =>
              gain(p.seat, t, -explorer.clips[t], card("dark-dice")),
            ),
          );
        }),
      },
    },

    "healing-salve": restorer(
      "healing-salve",
      "Apply the Healing Salve",
      PHYSICAL,
    ),

    "lucky-stone": {
      rollOptions: [
        {
          timing: "after",
          applies: () => true,
          effect: { kind: "reroll", max: null },
        },
      ],
      reactions: [discardAfterUse("lucky-stone")],
    },

    "medical-kit": {
      actions: {
        heal: {
          label: "Use the Medical Kit",
          available: (state, seat) =>
            yourselfAndRoommates(state, seat).some((e) =>
              PHYSICAL.some((t) => spacesBelowStart(e, t) > 0),
            ),
          steps: (state, seat) => {
            const rule = card("medical-kit");
            const heal = (target: number, points: number) => [
              local("medical-kit", "heal", { seat, target, points }),
            ];
            return [
              chooseOne(
                seat,
                yourselfAndRoommates(state, seat)
                  .filter((e) =>
                    PHYSICAL.some((t) => spacesBelowStart(e, t) > 0),
                  )
                  .map((e) => ({
                    label: `Heal ${explorerName(e)}`,
                    steps: [
                      roll(
                        seat,
                        { kind: "trait", trait: "knowledge" },
                        rule,
                        table([
                          { min: 8, max: null, steps: heal(e.seat, 3) },
                          { min: 6, max: 7, steps: heal(e.seat, 2) },
                          { min: 4, max: 5, steps: heal(e.seat, 1) },
                          { min: 0, max: 3, steps: [] },
                        ]),
                      ),
                    ],
                  })),
                rule,
              ),
            ];
          },
        },
      },
      steps: {
        heal: defineStep<{ seat: number; target: number; points: number }>(
          (state, p, ctx) => {
            const rule = card("medical-kit");
            const target = explorerAt(state, p.target);
            const might = spacesBelowStart(target, "might");
            const speed = spacesBelowStart(target, "speed");
            const options: Option[] = [];
            for (let m = Math.min(might, p.points); m >= 0; m--)
              for (let s = Math.min(speed, p.points - m); s >= 0; s--) {
                if (m + s === 0) continue;
                const parts = [
                  ...(m > 0 ? [`${m} Might`] : []),
                  ...(s > 0 ? [`${s} Speed`] : []),
                ];
                options.push({
                  label: `${explorerName(target)} gains ${parts.join(" and ")}`,
                  steps: [
                    ...(m > 0 ? [gain(p.target, "might", m, rule)] : []),
                    ...(s > 0 ? [gain(p.target, "speed", s, rule)] : []),
                  ],
                });
              }
            if (options.length > 0) ctx.push(chooseOne(p.seat, options, rule));
          },
        ),
      },
    },

    "puzzle-box": {
      actions: {
        open: {
          label: "Try to open the Puzzle Box",
          available: () => true,
          steps: (_state, seat) => {
            const rule = card("puzzle-box");
            return [
              roll(
                seat,
                { kind: "trait", trait: "knowledge" },
                rule,
                table([
                  {
                    min: 6,
                    max: null,
                    steps: [
                      drawCard(seat, "item", rule),
                      drawCard(seat, "item", rule),
                      discardCard(seat, "puzzle-box"),
                    ],
                  },
                  { min: 0, max: 5, steps: [] },
                ]),
              ),
            ];
          },
        },
      },
    },

    "rabbits-foot": {
      rollOptions: [
        {
          timing: "after",
          applies: (state, seat) => state.turn?.seat === seat,
          effect: { kind: "reroll", max: 1 },
        },
      ],
    },

    "smelling-salts": restorer("smelling-salts", "Use the Smelling Salts", [
      "knowledge",
    ]),
  },
};
