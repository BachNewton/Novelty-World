import { attackWith } from "../../engine/combat";
import {
  cardFlag,
  chooseOne,
  damage,
  defineStep,
  discardCard,
  drawCard,
  drawnBy,
  endTurnNow,
  gain,
  loseCard,
  markCard,
  relocate,
  roll,
  steal,
  stealable,
  table,
  type Option,
} from "../../engine/effects";
import {
  explorerAt,
  MENTAL,
  PHYSICAL,
  placeOf,
  together,
  TRAITS,
} from "../../engine/explorers";
import { moveCloser } from "../../engine/movement";
import { askSet } from "../../engine/questions";
import {
  eventData,
  local,
  type Behaviour,
  type BehaviourGroup,
  type Reaction,
  type Source,
} from "../../engine/sources";
import type { Engine } from "../../engine/step-loop";
import type {
  Explorer,
  GameState,
  Place,
  RuleRef,
  Step,
  Trait,
} from "../../types";
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

/** The places the Dynamite can be thrown into: through a connecting door
 *  into an adjacent room. */
function dynamiteTargets(
  engine: Engine,
  state: GameState,
  seat: number,
): Place[] {
  const from = placeOf(state, seat);
  const beside = askSet(engine, state, "adjacency", { room: from.room });
  return askSet(engine, state, "connections", {
    mover: { kind: "explorer", seat },
    from,
  }).filter((place) => beside.includes(place.room));
}

/** What the Pickpocket's Gloves can take: anything an explorer in your room
 *  could lose to a steal. */
function glovesTakes(
  engine: Engine,
  state: GameState,
  seat: number,
): { from: number; item: string }[] {
  const you = explorerAt(state, seat);
  return state.explorers
    .filter((e) => e.seat !== seat && together(e, you))
    .flatMap((e) =>
      e.cards
        .filter((c) => stealable(engine, state, c))
        .map((item) => ({ from: e.seat, item })),
    );
}

/** The heroes, once the haunt gives the explorers sides. */
function heroes(_state: GameState): Explorer[] {
  throw new Error(
    "Heroes are a side, and the engine doesn't give explorers sides yet",
  );
}

/** You, and the other explorers in your room. */
function yourselfAndRoommates(state: GameState, seat: number): Explorer[] {
  const you = explorerAt(state, seat);
  return [
    you,
    ...state.explorers.filter((e) => e.seat !== seat && together(e, you)),
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

/** The Bell, the Book (the omen: see the Candle's note) and the Candle. */
const SET = ["bell", "book", "candle"];
const SET_BONUS = "set-bonus";

/** The seat holding a card source that only acts while held. */
function holder(source: Source): number {
  if (source.holder === null) throw new Error(`${source.id} isn't held`);
  return source.holder;
}

/** Gain 2 in each trait for the full set, or lose them again. */
function setBonus(seat: number, sign: 1 | -1): Step[] {
  const rule = card("candle");
  return [
    ...TRAITS.map((t) => gain(seat, t, 2 * sign, rule, "candle")),
    markCard("candle", SET_BONUS, sign > 0, "holder", rule),
  ];
}

/** The room the Music Box is in: its holder's, or the room it lies in. */
function musicBoxRoom(state: GameState, source: Source): string | null {
  if (source.holder !== null) return explorerAt(state, source.holder).room;
  return source.room;
}

/** An explorer in the open Music Box's room makes a Sanity roll of 4+, or is mesmerized. */
function hearMusicBox(seat: number): Step {
  return roll(
    seat,
    { kind: "trait", trait: "sanity" },
    card("music-box"),
    table([
      { min: 4, max: null, steps: [] },
      { min: 0, max: 3, steps: [local("music-box", "mesmerized", { seat })] },
    ]),
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
          offTurn: true,
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

    axe: { modifiers: attackWith("axe", "might", 1) },

    bell: {
      onGain: (_state, seat) => [gain(seat, "sanity", 1, card("bell"), "bell")],
      onLose: (_state, seat) => [
        gain(seat, "sanity", -1, card("bell"), "bell"),
      ],
      actions: {
        ring: {
          label: "Ring the Bell (Sanity roll)",
          available: (state) =>
            state.status === "haunt" && !state.turn?.rolls.includes("bell"),
          steps: (_state, seat) => [
            roll(
              seat,
              { kind: "trait", trait: "sanity" },
              card("bell"),
              table([
                {
                  min: 5,
                  max: null,
                  steps: [local("bell", "call-heroes", { seat })],
                },
                {
                  min: 0,
                  max: 4,
                  steps: [local("bell", "call-monsters", { seat })],
                },
              ]),
              { id: "bell" },
            ),
          ],
        },
      },
      steps: {
        // The ringer picks which heroes come, each 1 space closer to them.
        "call-heroes": defineStep<{ seat: number }>((state, p, ctx) => {
          const rule = card("bell");
          const here = explorerAt(state, p.seat).room;
          ctx.push(
            ...heroes(state).map((hero) =>
              chooseOne(
                p.seat,
                [
                  {
                    label: `Call ${explorerName(hero)} 1 space closer`,
                    steps: [moveCloser(hero.seat, here, p.seat, rule)],
                  },
                  { label: `Leave ${explorerName(hero)} be`, steps: [] },
                ],
                rule,
              ),
            ),
          );
        }),
        "call-monsters": () => {
          throw new Error(
            "The Bell's 0-4 moves monsters, which the engine doesn't have yet",
          );
        },
      },
    },

    "blood-dagger": {
      modifiers: attackWith("blood-dagger", "might", 3),
      beforeAttack: (_state, seat, go) => [
        gain(seat, "speed", -1, card("blood-dagger")),
        go,
      ],
      onLose: (_state, seat, destination) =>
        destination.to === "explorer" && destination.by === "stolen"
          ? [damage(seat, "physical", { dice: 2 }, card("blood-dagger"))]
          : [],
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

    candle: {
      modifiers: [
        {
          question: "dicePool",
          when: (state, { seat, roll }, source) =>
            seat === source.holder &&
            roll.spec.kind === "trait" &&
            drawnBy(state, roll.rule) === seat,
          change: { add: 1 },
        },
      ],
      reactions: [
        {
          event: "card-gained",
          when: (state, event, source) =>
            eventData<{ seat: number }>(event).seat === source.holder &&
            !cardFlag(state, "candle", SET_BONUS) &&
            SET.every((c) =>
              explorerAt(state, holder(source)).cards.includes(c),
            ),
          steps: (_state, _event, source) => setBonus(holder(source), 1),
        },
        {
          event: "card-lost",
          when: (state, event, source) => {
            const lost = eventData<{ seat: number; card: string }>(event);
            return (
              lost.seat === source.holder &&
              SET.includes(lost.card) &&
              cardFlag(state, "candle", SET_BONUS)
            );
          },
          steps: (_state, _event, source) => setBonus(holder(source), -1),
        },
      ],
      onLose: (state, seat) =>
        cardFlag(state, "candle", SET_BONUS) ? setBonus(seat, -1) : [],
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
              steps: [
                relocate(p.seat, e.room, card("dark-dice"), e.side ?? null),
              ],
            }));
          if (options.length > 0)
            ctx.push(chooseOne(p.seat, options, card("dark-dice")));
        }),
        push: defineStep<{ seat: number }>((state, p, ctx) => {
          const you = explorerAt(state, p.seat);
          const options = state.explorers
            .filter((e) => e.seat !== p.seat && together(e, you))
            .flatMap((e) =>
              askSet(ctx.engine, state, "adjacency", {
                room: you.room,
              }).map((room) => ({
                label: `Move ${explorerName(e)} into the ${roomName(room)}`,
                steps: [relocate(e.seat, room, card("dark-dice"))],
              })),
            );
          if (options.length > 0)
            ctx.push(chooseOne(p.seat, options, card("dark-dice")));
        }),
        step: defineStep<{ seat: number }>((state, p, ctx) => {
          const options = askSet(ctx.engine, state, "adjacency", {
            room: explorerAt(state, p.seat).room,
          }).map((room) => ({
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

    dynamite: {
      actions: {
        throw: {
          label:
            "Throw the Dynamite into an adjacent room, instead of attacking",
          available: (state, seat, _source, engine) =>
            state.status === "haunt" &&
            state.turn?.attacked === false &&
            dynamiteTargets(engine, state, seat).length > 0,
          steps: (_state, seat) => [local("dynamite", "aim", { seat })],
        },
      },
      steps: {
        aim: defineStep<{ seat: number }>((state, p, ctx) => {
          const rule = card("dynamite");
          if (state.turn) state.turn.attacked = true;
          ctx.push(
            chooseOne(
              p.seat,
              dynamiteTargets(ctx.engine, state, p.seat).map((place) => ({
                label: `Throw the Dynamite into the ${roomName(place.room)}`,
                steps: [local("dynamite", "blast", place)],
              })),
              rule,
            ),
            discardCard(p.seat, "dynamite"),
          );
        }),
        // Monsters join the blast once the haunt brings them.
        blast: defineStep<Place>((state, place, ctx) => {
          const rule = card("dynamite");
          ctx.push(
            ...state.explorers
              .filter((e) => {
                const at = placeOf(state, e.seat);
                return (
                  at.room === place.room &&
                  (place.side === null || at.side === place.side)
                );
              })
              .map((e) =>
                roll(
                  e.seat,
                  { kind: "trait", trait: "speed" },
                  rule,
                  table([
                    { min: 5, max: null, steps: [] },
                    {
                      min: 0,
                      max: 4,
                      steps: [damage(e.seat, "physical", { points: 4 }, rule)],
                    },
                  ]),
                ),
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

    idol: {
      rollOptions: [
        {
          timing: "before",
          // Defence rolls too: it isn't a weapon (the card's resolution).
          offTurn: true,
          applies: (_state, _seat, roll) =>
            roll.spec.kind === "trait" ||
            roll.spec.kind === "attack" ||
            (roll.rule.source === "card" &&
              CATALOG.cards[roll.rule.card].type === "event"),
          effect: { kind: "dice", amount: 2 },
        },
      ],
      reactions: [
        {
          event: "card-used",
          when: (_state, event) =>
            eventData<{ card: string }>(event).card === "idol",
          steps: (_state, event) => [
            gain(
              eventData<{ seat: number }>(event).seat,
              "sanity",
              -1,
              card("idol"),
            ),
          ],
        },
      ],
    },

    "lucky-stone": {
      rollOptions: [
        {
          timing: "after",
          offTurn: true,
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

    "music-box": {
      actsFromRoom: true,
      actions: {
        open: {
          label: "Open the Music Box",
          available: (state) => !cardFlag(state, "music-box", "open"),
          steps: () => [
            markCard("music-box", "open", true, "play", card("music-box")),
          ],
        },
        close: {
          label: "Close the Music Box",
          available: (state) => cardFlag(state, "music-box", "open"),
          steps: () => [
            markCard("music-box", "open", false, "play", card("music-box")),
          ],
        },
      },
      reactions: [
        {
          event: "entered",
          when: (state, event, source) =>
            cardFlag(state, "music-box", "open") &&
            eventData<{ room: string }>(event).room ===
              musicBoxRoom(state, source),
          steps: (_state, event) => [
            hearMusicBox(eventData<{ seat: number }>(event).seat),
          ],
        },
        {
          event: "turn-started",
          when: (state, event, source) =>
            cardFlag(state, "music-box", "open") &&
            explorerAt(state, eventData<{ seat: number }>(event).seat).room ===
              musicBoxRoom(state, source),
          steps: (_state, event) => [
            hearMusicBox(eventData<{ seat: number }>(event).seat),
          ],
        },
      ],
      steps: {
        mesmerized: defineStep<{ seat: number }>((state, { seat }, ctx) => {
          const rule = card("music-box");
          const explorer = explorerAt(state, seat);
          ctx.push(
            ...(explorer.cards.includes("music-box")
              ? [
                  loseCard(
                    seat,
                    "music-box",
                    { to: "room", room: explorer.room },
                    rule,
                  ),
                ]
              : []),
            endTurnNow(seat, rule),
          );
        }),
      },
      describe: {
        "card-marked": (event) =>
          eventData<{ value: boolean }>(event).value
            ? "The Music Box is opened"
            : "The Music Box is closed",
      },
    },

    "pickpokets-gloves": {
      actions: {
        take: {
          label:
            "Discard the Pickpocket's Gloves to take an item from an explorer in your room",
          available: (state, seat, _source, engine) =>
            glovesTakes(engine, state, seat).length > 0,
          steps: (_state, seat) => [
            local("pickpokets-gloves", "take", { seat }),
          ],
        },
      },
      steps: {
        // Taking is stealing without an attack (the card's project ruling).
        take: defineStep<{ seat: number }>((state, p, ctx) => {
          const rule = card("pickpokets-gloves");
          ctx.push(
            chooseOne(
              p.seat,
              glovesTakes(ctx.engine, state, p.seat).map(({ from, item }) => ({
                label: `Take ${explorerName(explorerAt(state, from))}'s ${CATALOG.cards[item].name}`,
                steps: [
                  discardCard(p.seat, "pickpokets-gloves"),
                  steal(from, p.seat, item, rule),
                ],
              })),
              rule,
            ),
          );
        }),
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
          applies: () => true,
          effect: { kind: "reroll", max: 1 },
        },
      ],
    },

    revolver: { modifiers: attackWith("revolver", "speed", 1) },

    "sacrificial-dagger": {
      modifiers: attackWith("sacrificial-dagger", "might", 3),
      beforeAttack: (_state, seat, go) => {
        const rule = card("sacrificial-dagger");
        return [
          roll(
            seat,
            { kind: "trait", trait: "knowledge" },
            rule,
            table([
              { min: 6, max: null, steps: [go] },
              {
                min: 3,
                max: 5,
                steps: [
                  chooseOne(
                    seat,
                    MENTAL.map((t) => ({
                      label: `Lose 1 ${capitalised(t)}`,
                      steps: [gain(seat, t, -1, rule)],
                    })),
                    rule,
                  ),
                  go,
                ],
              },
              // The dagger twists in your hand, and the attack is off.
              {
                min: 0,
                max: 2,
                steps: [damage(seat, "physical", { dice: 2 }, rule)],
              },
            ]),
          ),
        ];
      },
    },

    "smelling-salts": restorer("smelling-salts", "Use the Smelling Salts", [
      "knowledge",
    ]),
  },
};
