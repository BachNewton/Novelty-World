import {
  attackSpent,
  attackWith,
  beaten,
  mayAttackNow,
} from "../../engine/combat";
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
  allFigures,
  figureOf,
  MENTAL,
  PHYSICAL,
  placeOf,
  roomOf,
  takesDamage,
  together,
  trackTraits,
  TRAITS,
} from "../../engine/figures";
import { pullMonsters } from "../../engine/monsters";
import { distanceTo, moveCloser } from "../../engine/movement";
import { askPermission, askSet, hasTrait } from "../../engine/questions";
import { heroes, inPlay, revealedAs } from "../../engine/sides";
import {
  eventData,
  local,
  turnFigure,
  type Behaviour,
  type BehaviourGroup,
  type Reaction,
  type Source,
} from "../../engine/sources";
import type { Engine } from "../../engine/step-loop";
import type {
  Figure,
  FigureId,
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

const explorerName = (explorer: Figure) =>
  CATALOG.figures[explorer.definition].name;

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
  figure: FigureId,
): Place[] {
  const from = placeOf(state, figure);
  const beside = askSet(engine, state, "adjacency", { room: from.room });
  return askSet(engine, state, "connections", {
    mover: { kind: "figure", figure },
    from,
  }).filter((place) => beside.includes(place.room));
}

/** What the Pickpocket's Gloves can take: anything an explorer in your room
 *  could lose to a steal. */
function glovesTakes(
  engine: Engine,
  state: GameState,
  figure: FigureId,
): { from: FigureId; item: string }[] {
  const you = figureOf(state, figure);
  return allFigures(state)
    .filter((e) => e.id !== figure && together(e, you))
    .flatMap((e) =>
      e.cards
        .filter((c) => stealable(engine, state, c))
        .map((item) => ({ from: e.id, item })),
    );
}

/** You, and the other explorers in your room. */
function yourselfAndRoommates(state: GameState, figure: FigureId): Figure[] {
  const you = figureOf(state, figure);
  return [
    you,
    ...allFigures(state).filter((e) => e.id !== figure && together(e, you)),
  ];
}

// A trait's starting value is a marked space on its track, and traits move by
// spaces, so "below its starting value" means below that space.
function spacesBelowStart(state: GameState, explorer: Figure, trait: Trait) {
  const { start, live } = trackTraits(CATALOG, state, explorer.id);
  return Math.max(start[trait] - live.clips[trait], 0);
}

/** Options to raise any one or more of the traits below their starting value back to it. */
function restoreOptions(
  state: GameState,
  explorer: Figure,
  traits: readonly Trait[],
  id: string,
): Option[] {
  const low = traits.filter((t) => spacesBelowStart(state, explorer, t) > 0);
  const subsets = low.flatMap((first, i) => [
    [first],
    ...low.slice(i + 1).map((second) => [first, second]),
  ]);
  return subsets.map((subset) => ({
    label: `Raise ${explorerName(explorer)}'s ${subset.map(capitalised).join(" and ")} to ${subset.length > 1 ? "their starting values" : "its starting value"}`,
    steps: subset.map((t) =>
      gain(explorer.id, t, spacesBelowStart(state, explorer, t), card(id)),
    ),
  }));
}

/** An item that raises traits of yourself or a roommate back to their starting value, then is discarded. */
function restorer(
  id: string,
  label: string,
  traits: readonly Trait[],
): Behaviour {
  const options = (state: GameState, figure: FigureId) =>
    yourselfAndRoommates(state, figure).flatMap((e) =>
      restoreOptions(state, e, traits, id),
    );
  return {
    actions: {
      use: {
        label,
        available: (state, figure) => options(state, figure).length > 0,
        steps: (state, figure) => [
          chooseOne(figure, options(state, figure), card(id)),
          discardCard(figure, id),
        ],
      },
    },
  };
}

function chooseTrait(
  figure: FigureId,
  traits: readonly Trait[],
  rule: RuleRef,
): Step {
  return chooseOne(
    figure,
    traits.map((t) => ({
      label: `Gain 1 ${capitalised(t)}`,
      steps: [gain(figure, t, 1, rule)],
    })),
    rule,
  );
}

/** The Bell, the Book (the omen: see the Candle's note) and the Candle. */
const SET = ["bell", "book", "candle"];
const SET_BONUS = "set-bonus";

/** The figure holding a card source that only acts while held. */
function holder(source: Source): FigureId {
  if (source.holder === null) throw new Error(`${source.id} isn't held`);
  return source.holder;
}

/** Gain 2 in each trait for the full set, or lose them again. */
function setBonus(figure: FigureId, sign: 1 | -1): Step[] {
  const rule = card("candle");
  return [
    ...TRAITS.map((t) => gain(figure, t, 2 * sign, rule, "candle")),
    markCard("candle", SET_BONUS, sign > 0, "holder", rule),
  ];
}

/** The room the Music Box is in: its holder's, or the room it lies in. */
function musicBoxRoom(state: GameState, source: Source): string | null {
  if (source.holder !== null) return roomOf(state, source.holder);
  return source.room;
}

/** Whether a figure, if there is one, is in the Music Box's room. */
function hearsMusicBox(
  state: GameState,
  figure: FigureId | null,
  source: Source,
): boolean {
  return (
    figure !== null &&
    figureOf(state, figure).place?.room === musicBoxRoom(state, source)
  );
}

/** A figure in the open Music Box's room makes a Sanity roll of 4+, or is mesmerized. */
function hearMusicBox(figure: FigureId): Step {
  return roll(
    figure,
    { kind: "trait", trait: "sanity" },
    card("music-box"),
    table([
      { min: 4, max: null, steps: [] },
      { min: 0, max: 3, steps: [local("music-box", "mesmerized", { figure })] },
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
      onGain: (_state, figure) =>
        TRAITS.map((trait) =>
          gain(
            figure,
            trait,
            1,
            card("amulet-of-the-ages"),
            "amulet-of-the-ages",
          ),
        ),
      onLose: (_state, figure) =>
        TRAITS.map((trait) =>
          gain(
            figure,
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
            subject.figure === source.holder && subject.damage === "physical",
          change: { add: -1 },
        },
      ],
    },

    axe: { modifiers: attackWith("axe", "might", 1) },

    bell: {
      onGain: (_state, figure) => [gain(figure, "sanity", 1, card("bell"), "bell")],
      onLose: (_state, figure) => [
        gain(figure, "sanity", -1, card("bell"), "bell"),
      ],
      actions: {
        ring: {
          label: "Ring the Bell (Sanity roll)",
          available: (state) =>
            state.status === "haunt" && !state.turn?.rolls.includes("bell"),
          steps: (_state, figure) => [
            roll(
              figure,
              { kind: "trait", trait: "sanity" },
              card("bell"),
              table([
                {
                  min: 5,
                  max: null,
                  steps: [local("bell", "call-heroes", { figure })],
                },
                {
                  min: 0,
                  max: 4,
                  steps: [local("bell", "call-monsters", { figure })],
                },
              ]),
              { id: "bell" },
            ),
          ],
        },
      },
      steps: {
        // The ringer picks which unimpeded heroes come, each 1 space closer
        // to them: those who could move on their own (the card's ruling),
        // and who have a way closer.
        "call-heroes": defineStep<{ figure: FigureId }>((state, p, ctx) => {
          const rule = card("bell");
          const here = roomOf(state, p.figure);
          const callable = heroes(ctx.engine, state).filter((hero) => {
            const away = distanceTo(
              ctx.engine,
              state,
              { kind: "figure", figure: hero.id },
              placeOf(state, hero.id),
              here,
            );
            return (
              hero.id !== p.figure &&
              away !== null &&
              away > 0 &&
              askPermission(ctx.engine, state, "canAct", { figure: hero.id })
                .allowed
            );
          });
          ctx.push(
            ...callable.map((hero) =>
              chooseOne(
                p.figure,
                [
                  {
                    label: `Call ${explorerName(hero)} 1 space closer`,
                    steps: [moveCloser(hero.id, here, p.figure, rule)],
                  },
                  { label: `Leave ${explorerName(hero)} be`, steps: [] },
                ],
                rule,
              ),
            ),
          );
        }),
        // The traitor may pull any number of monsters 1 space closer to
        // the ringer; a traitor ringing it pulls none; with no traitor,
        // every monster comes.
        "call-monsters": defineStep<{ figure: FigureId }>((_state, p, ctx) => {
          ctx.push(pullMonsters(p.figure, card("bell"), { skipOwn: true }));
        }),
      },
    },

    "blood-dagger": {
      modifiers: attackWith("blood-dagger", "might", 3),
      beforeAttack: (_state, figure, go) => [
        gain(figure, "speed", -1, card("blood-dagger")),
        go,
      ],
      onLose: (_state, figure, destination) =>
        destination.to === "figure" && destination.by === "stolen"
          ? [damage(figure, "physical", { dice: 2 }, card("blood-dagger"))]
          : [],
    },

    bottle: {
      actions: {
        drink: {
          label: "Drink from the Bottle",
          available: (state) => state.status === "haunt",
          steps: (_state, figure) => {
            const rule = card("bottle");
            const both = (traits: Trait[], amount: number) =>
              traits.map((t) => gain(figure, t, amount, rule));
            return [
              roll(
                figure,
                { kind: "dice", count: 3 },
                rule,
                table([
                  {
                    min: 6,
                    max: 6,
                    steps: [local("bottle", "anywhere", { figure })],
                  },
                  { min: 5, max: 5, steps: both(["might", "speed"], 2) },
                  { min: 4, max: 4, steps: both(["knowledge", "sanity"], 2) },
                  {
                    min: 3,
                    max: 3,
                    steps: [
                      gain(figure, "knowledge", 1, rule),
                      gain(figure, "might", -1, rule),
                    ],
                  },
                  { min: 2, max: 2, steps: both(["knowledge", "sanity"], -2) },
                  { min: 1, max: 1, steps: both(["might", "speed"], -2) },
                  { min: 0, max: 0, steps: both([...TRAITS], -2) },
                ]),
              ),
              discardCard(figure, "bottle"),
            ];
          },
        },
      },
      steps: {
        // Any room, your own included: choosing it leaves you where you are.
        anywhere: defineStep<{ figure: FigureId }>((state, p, ctx) => {
          const here = roomOf(state, p.figure);
          ctx.push(
            chooseOne(
              p.figure,
              state.board.tiles.map((t) =>
                t.tile === here
                  ? { label: `Stay in the ${roomName(t.tile)}`, steps: [] }
                  : {
                      label: `Put your explorer in the ${roomName(t.tile)}`,
                      steps: [relocate(p.figure, t.tile, card("bottle"))],
                    },
              ),
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
          when: (state, { figure, roll }, source) =>
            figure === source.holder &&
            roll.spec.kind === "trait" &&
            drawnBy(state, roll.rule) === figure,
          change: { add: 1 },
        },
      ],
      reactions: [
        {
          event: "card-gained",
          when: (state, event, source) =>
            eventData<{ figure: FigureId }>(event).figure === source.holder &&
            !cardFlag(state, "candle", SET_BONUS) &&
            SET.every((c) =>
              figureOf(state, holder(source)).cards.includes(c),
            ),
          steps: (_state, _event, source) => setBonus(holder(source), 1),
        },
        {
          event: "card-lost",
          when: (state, event, source) => {
            const lost = eventData<{ figure: FigureId; card: string }>(event);
            return (
              lost.figure === source.holder &&
              SET.includes(lost.card) &&
              cardFlag(state, "candle", SET_BONUS)
            );
          },
          steps: (_state, _event, source) => setBonus(holder(source), -1),
        },
      ],
      onLose: (state, figure) =>
        cardFlag(state, "candle", SET_BONUS) ? setBonus(figure, -1) : [],
    },

    "dark-dice": {
      actions: {
        roll: {
          label: "Roll the Dark Dice",
          available: () => true,
          steps: (_state, figure) => {
            const rule = card("dark-dice");
            return [
              roll(
                figure,
                { kind: "dice", count: 3 },
                rule,
                table([
                  {
                    min: 6,
                    max: 6,
                    steps: [local("dark-dice", "join", { figure })],
                  },
                  {
                    min: 5,
                    max: 5,
                    steps: [local("dark-dice", "push", { figure })],
                  },
                  {
                    min: 4,
                    max: 4,
                    steps: [chooseTrait(figure, PHYSICAL, rule)],
                  },
                  {
                    min: 3,
                    max: 3,
                    steps: [local("dark-dice", "step", { figure })],
                  },
                  { min: 2, max: 2, steps: [chooseTrait(figure, MENTAL, rule)] },
                  { min: 1, max: 1, steps: [drawCard(figure, "event", rule)] },
                  {
                    min: 0,
                    max: 0,
                    steps: [
                      local("dark-dice", "bottom-out", { figure }),
                      discardCard(figure, "dark-dice"),
                    ],
                  },
                ]),
              ),
            ];
          },
        },
      },
      steps: {
        // Any explorer still in play who isn't a revealed traitor: a hidden
        // traitor can be joined, since no one knows.
        join: defineStep<{ figure: FigureId }>((state, p, ctx) => {
          const you = figureOf(state, p.figure);
          const options = allFigures(state)
            .filter(
              (e) =>
                e.kind === "explorer" &&
                inPlay(e) &&
                e.id !== p.figure &&
                !together(e, you) &&
                !revealedAs(state, e.id, "traitor"),
            )
            .map((e) => ({
              label: `Move to ${explorerName(e)} in the ${roomName(placeOf(state, e.id).room)}`,
              steps: [
                relocate(
                  p.figure,
                  placeOf(state, e.id).room,
                  card("dark-dice"),
                  placeOf(state, e.id).side,
                ),
              ],
            }));
          if (options.length > 0)
            ctx.push(chooseOne(p.figure, options, card("dark-dice")));
        }),
        push: defineStep<{ figure: FigureId }>((state, p, ctx) => {
          const you = figureOf(state, p.figure);
          const options = allFigures(state)
            .filter((e) => e.id !== p.figure && together(e, you))
            .flatMap((e) =>
              askSet(ctx.engine, state, "adjacency", {
                room: roomOf(state, p.figure),
              }).map((room) => ({
                label: `Move ${explorerName(e)} into the ${roomName(room)}`,
                steps: [relocate(e.id, room, card("dark-dice"))],
              })),
            );
          if (options.length > 0)
            ctx.push(chooseOne(p.figure, options, card("dark-dice")));
        }),
        step: defineStep<{ figure: FigureId }>((state, p, ctx) => {
          const options = askSet(ctx.engine, state, "adjacency", {
            room: roomOf(state, p.figure),
          }).map((room) => ({
            label: `Move into the ${roomName(room)}`,
            steps: [relocate(p.figure, room, card("dark-dice"))],
          }));
          if (options.length > 0)
            ctx.push(chooseOne(p.figure, options, card("dark-dice")));
        }),
        "bottom-out": defineStep<{ figure: FigureId }>((state, p, ctx) => {
          const { clips } = trackTraits(ctx.catalog, state, p.figure).live;
          ctx.push(
            ...TRAITS.map((t) =>
              gain(p.figure, t, -clips[t], card("dark-dice")),
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
          available: (state, figure, _source, engine) =>
            mayAttackNow(engine, state, figure) &&
            dynamiteTargets(engine, state, figure).length > 0,
          steps: (_state, figure) => [local("dynamite", "aim", { figure })],
        },
      },
      steps: {
        aim: defineStep<{ figure: FigureId }>((state, p, ctx) => {
          const rule = card("dynamite");
          if (state.turn) state.turn.attacked.push(p.figure);
          ctx.push(
            chooseOne(
              p.figure,
              dynamiteTargets(ctx.engine, state, p.figure).map((place) => ({
                label: `Throw the Dynamite into the ${roomName(place.room)}`,
                steps: [
                  local("dynamite", "blast", { place, thrower: p.figure }),
                ],
              })),
              rule,
            ),
            discardCard(p.figure, "dynamite"),
          );
        }),
        // Only a figure with both Might and Speed rolls, and one that can't
        // be attacked is untouched. A monster that fails is beaten as if in
        // physical combat by the thrower (the card's official ruling).
        blast: defineStep<{ place: Place; thrower: FigureId }>(
          (state, { place, thrower }, ctx) => {
            const rule = card("dynamite");
            const caught = allFigures(state).filter((e) => {
              const at = e.place;
              return (
                at !== null &&
                at.room === place.room &&
                (place.side === null || at.side === place.side) &&
                hasTrait(ctx.engine, state, e.id, "might") &&
                hasTrait(ctx.engine, state, e.id, "speed") &&
                askPermission(ctx.engine, state, "canAttack", {
                  attacker: thrower,
                  target: { kind: "figure", figure: e.id },
                }).allowed
              );
            });
            ctx.push(
              ...caught.map((e) =>
                roll(
                  e.id,
                  { kind: "trait", trait: "speed" },
                  rule,
                  table([
                    { min: 5, max: null, steps: [] },
                    {
                      min: 0,
                      max: 4,
                      steps: [
                        takesDamage(ctx.catalog, state, e.id)
                          ? damage(e.id, "physical", { points: 4 }, rule, thrower)
                          : beaten(thrower, e.id, 4, rule),
                      ],
                    },
                  ]),
                ),
              ),
            );
          },
        ),
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
              eventData<{ figure: FigureId }>(event).figure,
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
          available: (state, figure) =>
            yourselfAndRoommates(state, figure).some((e) =>
              PHYSICAL.some((t) => spacesBelowStart(state, e, t) > 0),
            ),
          steps: (state, figure) => {
            const rule = card("medical-kit");
            const heal = (target: FigureId, points: number) => [
              local("medical-kit", "heal", { figure, target, points }),
            ];
            return [
              chooseOne(
                figure,
                yourselfAndRoommates(state, figure)
                  .filter((e) =>
                    PHYSICAL.some((t) => spacesBelowStart(state, e, t) > 0),
                  )
                  .map((e) => ({
                    label: `Heal ${explorerName(e)}`,
                    steps: [
                      roll(
                        figure,
                        { kind: "trait", trait: "knowledge" },
                        rule,
                        table([
                          { min: 8, max: null, steps: heal(e.id, 3) },
                          { min: 6, max: 7, steps: heal(e.id, 2) },
                          { min: 4, max: 5, steps: heal(e.id, 1) },
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
        heal: defineStep<{ figure: FigureId; target: FigureId; points: number }>(
          (state, p, ctx) => {
            const rule = card("medical-kit");
            const target = figureOf(state, p.target);
            const might = spacesBelowStart(state, target, "might");
            const speed = spacesBelowStart(state, target, "speed");
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
            if (options.length > 0) ctx.push(chooseOne(p.figure, options, rule));
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
            hearMusicBox(eventData<{ figure: FigureId }>(event).figure),
          ],
        },
        {
          event: "turn-started",
          when: (state, event, source) =>
            cardFlag(state, "music-box", "open") &&
            hearsMusicBox(state, turnFigure(event), source),
          steps: (_state, event) => {
            const figure = turnFigure(event);
            return figure === null ? [] : [hearMusicBox(figure)];
          },
        },
      ],
      steps: {
        mesmerized: defineStep<{ figure: FigureId }>((state, { figure }, ctx) => {
          const rule = card("music-box");
          const explorer = figureOf(state, figure);
          ctx.push(
            ...(explorer.cards.includes("music-box")
              ? [
                  loseCard(
                    figure,
                    "music-box",
                    { to: "room", room: roomOf(state, figure) },
                    rule,
                  ),
                ]
              : []),
            endTurnNow(figure, rule),
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
          available: (state, figure, _source, engine) =>
            glovesTakes(engine, state, figure).length > 0,
          steps: (_state, figure) => [
            local("pickpokets-gloves", "take", { figure }),
          ],
        },
      },
      steps: {
        // Taking is stealing without an attack (the card's project ruling).
        take: defineStep<{ figure: FigureId }>((state, p, ctx) => {
          const rule = card("pickpokets-gloves");
          ctx.push(
            chooseOne(
              p.figure,
              glovesTakes(ctx.engine, state, p.figure).map(({ from, item }) => ({
                label: `Take ${explorerName(figureOf(state, from))}'s ${CATALOG.cards[item].name}`,
                steps: [
                  discardCard(p.figure, "pickpokets-gloves"),
                  steal(from, p.figure, item, rule),
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
          steps: (_state, figure) => {
            const rule = card("puzzle-box");
            return [
              roll(
                figure,
                { kind: "trait", trait: "knowledge" },
                rule,
                table([
                  {
                    min: 6,
                    max: null,
                    steps: [
                      drawCard(figure, "item", rule),
                      drawCard(figure, "item", rule),
                      discardCard(figure, "puzzle-box"),
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

    revolver: { modifiers: attackWith("revolver", "speed", 1, "sight") },

    "sacrificial-dagger": {
      modifiers: attackWith("sacrificial-dagger", "might", 3),
      beforeAttack: (_state, figure, go) => {
        const rule = card("sacrificial-dagger");
        return [
          roll(
            figure,
            { kind: "trait", trait: "knowledge" },
            rule,
            table([
              { min: 6, max: null, steps: [go] },
              {
                min: 3,
                max: 5,
                steps: [
                  chooseOne(
                    figure,
                    MENTAL.map((t) => ({
                      label: `Lose 1 ${capitalised(t)}`,
                      steps: [gain(figure, t, -1, rule)],
                    })),
                    rule,
                  ),
                  go,
                ],
              },
              // The dagger twists in your hand: the attack is off, and no
              // other can be made this turn.
              {
                min: 0,
                max: 2,
                steps: [
                  attackSpent(figure),
                  damage(figure, "physical", { dice: 2 }, rule),
                ],
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
