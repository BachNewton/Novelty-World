import { FLOORS, placed } from "../../engine/board";
import {
  chooseOne,
  damage,
  defineStep,
  discardCard,
  drawCard,
  gain,
  keepCard,
  markCard,
  placeToken,
  relocate,
  removeToken,
  returnToDeck,
  roll,
  table,
  type TableRow,
} from "../../engine/effects";
import { attack, canBeAttacked, cardAttack } from "../../engine/combat";
import {
  allFigures,
  explorersFrom,
  figureName,
  figureOf,
  placeOf,
  roomOf,
  together,
  TRAITS,
} from "../../engine/figures";
import { distanceTo } from "../../engine/movement";
import { sideOf } from "../../engine/sides";
import {
  askNumber,
  askSet,
  onTurn,
  traitValue,
  type CombatOutcome,
} from "../../engine/questions";
import {
  eventData,
  local,
  type Behaviour,
  type BehaviourGroup,
  type Reaction,
} from "../../engine/sources";
import type { StepHandler } from "../../engine/step-loop";
import { drawRoomTile, enterNewRoom } from "../../engine/tiles";
import type {
  CardType,
  FigureId,
  GameState,
  RuleRef,
  Step,
  Trait,
} from "../../types";
import { CATALOG } from "..";
import { trap } from "./trapped";

const card = (id: string): RuleRef => ({ source: "card", card: id });

const traitName = (trait: Trait) =>
  `${trait[0].toUpperCase()}${trait.slice(1)}`;

const explorerName = (state: GameState, figure: FigureId) =>
  figureName(CATALOG, state, figure);

function traitRoll(
  figure: FigureId,
  trait: Trait,
  cardId: string,
  rows: TableRow[],
): Step {
  return roll(figure, { kind: "trait", trait }, card(cardId), table(rows));
}

/** A kept card can be told to go by several triggers in one write; only the first discards it. */
function discardIfHeld(cardId: string): StepHandler {
  return defineStep<{ figure: FigureId }>((state, p, ctx) => {
    if (figureOf(state, p.figure).cards.includes(cardId))
      ctx.push(discardCard(p.figure, cardId));
  });
}

/** A turn-ended reaction for the card's holder, in one of these rooms or meeting a condition. */
function holderTurnEnded(
  when: (state: GameState, figure: FigureId, room: string) => boolean,
  cardId: string,
): Reaction[] {
  return [
    {
      event: "turn-ended",
      when: (state, event, source) => {
        const { figure, room } = eventData<{
          figure: FigureId | null;
          room: string | null;
        }>(event);
        return (
          figure !== null &&
          room !== null &&
          figure === source.holder &&
          when(state, figure, room)
        );
      },
      steps: (_state, event) => [
        local(cardId, "discard", {
          figure: eventData<{ figure: FigureId }>(event).figure,
        }),
      ],
    },
  ];
}

/** A token's once-a-turn roll, offered to an explorer in its room. */
function tokenRoll(
  label: string,
  rollId: string,
  makeRoll: (figure: FigureId, room: string) => Step,
): Behaviour {
  return {
    actions: {
      open: {
        label,
        available: (state) => !(state.turn?.rolls.includes(rollId) ?? true),
        steps: (_state, figure, source) => {
          if (source.room === null) throw new Error(`${rollId} has no room`);
          return [makeRoll(figure, source.room)];
        },
      },
    },
  };
}

const MEANT = "it-is-meant-to-be";
const RECORDED = "recorded";

/** The total It Is Meant to Be recorded, while its holder keeps it. */
function recorded(state: GameState): number | null {
  const value = state.cardMarks[MEANT]?.[RECORDED]?.value;
  return typeof value === "number" ? value : null;
}

type Stack = "room" | CardType;
const STACK_NAMES: Record<Stack, string> = {
  room: "room stack",
  event: "event stack",
  item: "item stack",
  omen: "omen stack",
};

/** A stack's undrawn tiles or cards, top first. */
function stackOf(state: GameState, stack: Stack): string[] {
  return stack === "room" ? state.board.stack : state.decks[stack].draw;
}

function stacks(state: GameState): Stack[] {
  return (["room", "event", "item", "omen"] as const).filter(
    (stack) => stackOf(state, stack).length > 0,
  );
}

function stackItemName(stack: Stack, id: string): string {
  return stack === "room" ? CATALOG.rooms[id].name : CATALOG.cards[id].name;
}

/** Every order of a few things. */
function permutations(items: string[]): string[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((first, i) =>
    permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [
      first,
      ...rest,
    ]),
  );
}

const GRAVE_DIRT_ROOMS = [
  "balcony",
  "gardens",
  "graveyard",
  "gymnasium",
  "larder",
  "patio",
  "tower",
];

const SLIDE = "mystic-slide";

function floorOf(state: GameState, room: string) {
  const tile = placed(state.board, room);
  if (!tile) throw new Error(`${room} is not on the board`);
  return tile.floor;
}

/** Using the Slide in a room: a Might roll, the same roll each time, so it
 *  is made once a turn (p. 12). On 5+ you choose where you land below it;
 *  otherwise you fall to a new basement room. Off your turn, you don't draw
 *  for that room. */
function slideRoll(
  state: GameState,
  figure: FigureId,
  room: string,
  draws: boolean,
): Step {
  const rule = card(SLIDE);
  // The card's own roll on drawing it is made even when a Slide was already
  // used this turn; it then has nothing new to record.
  const id = state.turn?.rolls.includes(SLIDE) ? undefined : SLIDE;
  return roll(
    figure,
    { kind: "trait", trait: "might" },
    rule,
    table([
      { min: 5, max: null, steps: [local(SLIDE, "control", { figure, room })] },
      {
        min: 0,
        max: 4,
        steps: [
          drawRoomTile(
            figure,
            { kind: "doorways", floors: ["basement"], except: null },
            rule,
            {
              then: enterNewRoom(figure, null, rule, {
                draws,
                after: [damage(figure, "physical", { dice: 1 }, rule)],
              }),
              otherwise: [local(SLIDE, "fall-to-basement", { figure })],
            },
          ),
        ],
      },
    ]),
    { id },
  );
}

/** Event cards A of the base game, from content/cards/events.md. */
export const EVENTS_A: BehaviourGroup = {
  cards: {
    "a-moment-of-hope": {
      onDraw: (state, figure) => [
        placeToken(
          "blessing",
          roomOf(state, figure),
          card("a-moment-of-hope"),
        ),
      ],
    },

    "bloody-vision": {
      onDraw: (_state, figure) => [
        traitRoll(figure, "sanity", "bloody-vision", [
          {
            min: 4,
            max: null,
            steps: [gain(figure, "sanity", 1, card("bloody-vision"))],
          },
          {
            min: 2,
            max: 3,
            steps: [gain(figure, "sanity", -1, card("bloody-vision"))],
          },
          {
            min: 0,
            max: 1,
            steps: [local("bloody-vision", "attack", { figure })],
          },
        ]),
      ],
      steps: {
        // An explorer comes first, the one with the lowest Might, a fellow
        // hero or the sleeping traitor included; only with no explorer in
        // reach is a monster attacked, of your choice. "If you can" is a
        // target you are able to attack. The attack is the card's, outside
        // your one attack of the turn (the card's project rulings).
        attack: defineStep<{ figure: FigureId }>((state, p, ctx) => {
          const rule = card("bloody-vision");
          const you = figureOf(state, p.figure);
          const adjacent = askSet(ctx.engine, state, "adjacency", {
            room: roomOf(state, p.figure),
          });
          const inReach = allFigures(state).filter(
            (e) =>
              (together(e, you) ||
                (e.place !== null && adjacent.includes(e.place.room))) &&
              canBeAttacked(ctx.engine, state, p.figure, e.id),
          );
          const explorers = inReach.filter((e) => e.kind === "explorer");
          const might = (figure: FigureId) =>
            traitValue(ctx.engine, state, figure, "might");
          const lowest = Math.min(...explorers.map((e) => might(e.id)));
          const targets =
            explorers.length > 0
              ? explorers.filter((e) => might(e.id) === lowest)
              : inReach.filter((e) => e.kind === "monster");
          if (targets.length === 0) return;
          const attackOn = (figure: FigureId) =>
            attack({ kind: "figure", figure: p.figure }, figure, rule);
          ctx.push(
            targets.length === 1
              ? attackOn(targets[0].id)
              : chooseOne(
                  p.figure,
                  targets.map((e) => ({
                    label: `Attack ${figureName(CATALOG, state, e.id)}`,
                    steps: [attackOn(e.id)],
                  })),
                  rule,
                ),
          );
        }),
      },
    },

    "burning-man": {
      onDraw: (_state, figure) => {
        const rule = card("burning-man");
        return [
          traitRoll(figure, "sanity", "burning-man", [
            { min: 4, max: null, steps: [gain(figure, "sanity", 1, rule)] },
            {
              min: 2,
              max: 3,
              steps: [relocate(figure, "entrance-hall", rule)],
            },
            {
              min: 0,
              max: 1,
              steps: [
                damage(figure, "physical", { dice: 1 }, rule),
                damage(figure, "mental", { dice: 1 }, rule),
              ],
            },
          ]),
        ];
      },
    },

    "closet-door": {
      onDraw: (state, figure) => [
        placeToken("closet", roomOf(state, figure), card("closet-door")),
      ],
    },

    "creepy-puppet": {
      onDraw: (state, figure) => [
        cardAttack(
          figure,
          "might",
          4,
          card("creepy-puppet"),
          local("creepy-puppet", "spear", { figure }),
        ),
      ],
      steps: {
        // The Spear's holder gains only if the attack dealt the drawer
        // damage; with no holder the gain lapses (the card's project ruling).
        spear: defineStep<{ figure: FigureId; outcome: CombatOutcome }>(
          (state, p, ctx) => {
            const rule = card("creepy-puppet");
            const { loser, harm } = p.outcome;
            const hurt =
              loser === "defender" &&
              harm?.kind === "damage" &&
              askNumber(ctx.engine, state, "damageAmount", {
                figure: p.figure,
                damage: harm.damage,
                amount: harm.points,
                rule,
              }) > 0;
            const spear = allFigures(state).find((e) =>
              e.cards.includes("spear"),
            );
            if (hurt && spear && spear.id !== p.figure)
              ctx.push(gain(spear.id, "might", 2, rule));
          },
        ),
      },
    },

    "creepy-crawlies": {
      onDraw: (_state, figure) => {
        const rule = card("creepy-crawlies");
        return [
          traitRoll(figure, "sanity", "creepy-crawlies", [
            { min: 5, max: null, steps: [gain(figure, "sanity", 1, rule)] },
            { min: 1, max: 4, steps: [gain(figure, "sanity", -1, rule)] },
            { min: 0, max: 0, steps: [gain(figure, "sanity", -2, rule)] },
          ]),
        ];
      },
    },

    debris: {
      onDraw: (_state, figure) => [
        traitRoll(figure, "speed", "debris", [
          {
            min: 3,
            max: null,
            steps: [gain(figure, "speed", 1, card("debris"))],
          },
          {
            min: 1,
            max: 2,
            steps: [
              keepCard(figure, "debris"),
              damage(figure, "physical", { dice: 1 }, card("debris")),
            ],
          },
          {
            min: 0,
            max: 0,
            steps: [
              keepCard(figure, "debris"),
              damage(figure, "physical", { dice: 2 }, card("debris")),
            ],
          },
        ]),
      ],
      // The Speed roll on drawing isn't an attempt to free you: those are the
      // Might rolls (the card's resolution).
      ...trap("debris", "Make a Might roll to dig out the buried explorer", () => []),
    },

    "disquieting-sounds": {
      onDraw: (state, figure) => {
        const rule = card("disquieting-sounds");
        const omens = state.omensDrawn;
        const rows: TableRow[] = [
          { min: omens, max: null, steps: [gain(figure, "sanity", 1, rule)] },
        ];
        if (omens > 0)
          rows.push({
            min: 0,
            max: omens - 1,
            steps: [damage(figure, "mental", { dice: 1 }, rule)],
          });
        return [roll(figure, { kind: "dice", count: 6 }, rule, table(rows))];
      },
    },

    "drip-drip-drip": {
      onDraw: (state, figure) => [
        placeToken(
          "drip",
          roomOf(state, figure),
          card("drip-drip-drip"),
        ),
      ],
    },

    footsteps: {
      onDraw: (state, figure) => {
        const rule = card("footsteps");
        const inChapel = roomOf(state, figure) === "chapel";
        const nearest = (trait: Trait, amount: number) =>
          local("footsteps", "nearest", { figure, trait, amount });
        return [
          roll(
            figure,
            { kind: "dice", count: inChapel ? 2 : 1 },
            rule,
            table([
              {
                min: 4,
                max: 4,
                steps: [gain(figure, "might", 1, rule), nearest("might", 1)],
              },
              {
                min: 3,
                max: 3,
                steps: [gain(figure, "might", 1, rule), nearest("sanity", -1)],
              },
              { min: 2, max: 2, steps: [gain(figure, "sanity", -1, rule)] },
              { min: 1, max: 1, steps: [gain(figure, "speed", -1, rule)] },
              {
                min: 0,
                max: 0,
                steps: explorersFrom(state, figure).map((each) =>
                  chooseOne(
                    each,
                    TRAITS.map((trait) => ({
                      label: `Lose 1 ${traitName(trait)}`,
                      steps: [gain(each, trait, -1, rule)],
                    })),
                    rule,
                  ),
                ),
              },
            ]),
          ),
        ];
      },
      steps: {
        // Nearest is the fewest rooms along a route; the drawer breaks a tie.
        nearest: defineStep<{ figure: FigureId; trait: Trait; amount: number }>(
          (state, p, ctx) => {
            const rule = card("footsteps");
            const from = placeOf(state, p.figure);
            const others = allFigures(state).flatMap((e) => {
              if (e.id === p.figure || e.place === null) return [];
              const distance = distanceTo(
                ctx.engine,
                state,
                { kind: "figure", figure: p.figure },
                from,
                roomOf(state, e.id),
              );
              return distance === null ? [] : [{ e, distance }];
            });
            // With no explorer reachable by any route, no one is nearest
            // (the card's project ruling).
            if (others.length === 0) return;
            const closest = Math.min(...others.map((o) => o.distance));
            ctx.push(
              chooseOne(
                p.figure,
                others
                  .filter((o) => o.distance === closest)
                  .map(({ e }) => ({
                    label: `${explorerName(state, e.id)} is the nearest explorer`,
                    steps: [gain(e.id, p.trait, p.amount, rule)],
                  })),
                rule,
              ),
            );
          },
        ),
      },
    },

    funeral: {
      onDraw: (state, figure) => {
        const rule = card("funeral");
        const here = roomOf(state, figure);
        const rooms = ["graveyard", "crypt"].filter((room) =>
          placed(state.board, room),
        );
        const putIn =
          rooms.length === 0
            ? []
            : [
                chooseOne(
                  figure,
                  rooms.map((room) => ({
                    label: `Go to the ${CATALOG.rooms[room].name}`,
                    steps: room === here ? [] : [relocate(figure, room, rule)],
                  })),
                  rule,
                ),
              ];
        return [
          traitRoll(figure, "sanity", "funeral", [
            { min: 4, max: null, steps: [gain(figure, "sanity", 1, rule)] },
            { min: 2, max: 3, steps: [gain(figure, "sanity", -1, rule)] },
            {
              min: 0,
              max: 1,
              steps: [
                gain(figure, "sanity", -1, rule),
                gain(figure, "might", -1, rule),
                ...putIn,
              ],
            },
          ]),
        ];
      },
    },

    "grave-dirt": {
      impedes: true,
      onDraw: (_state, figure) => [
        traitRoll(figure, "might", "grave-dirt", [
          {
            min: 4,
            max: null,
            steps: [gain(figure, "might", 1, card("grave-dirt"))],
          },
          { min: 0, max: 3, steps: [keepCard(figure, "grave-dirt")] },
        ]),
      ],
      reactions: [
        {
          event: "turn-started",
          when: (_state, event, source) =>
            eventData<{ figure: FigureId }>(event).figure === source.holder,
          steps: (_state, event) => [
            damage(
              eventData<{ figure: FigureId }>(event).figure,
              "physical",
              { points: 1 },
              card("grave-dirt"),
            ),
          ],
        },
        {
          event: "trait-changed",
          when: (_state, event, source) => {
            const { figure, spaces } = eventData<{
              figure: FigureId;
              spaces: number;
            }>(event);
            return (
              figure === source.holder &&
              spaces > 0 &&
              event.rule.source === "card" &&
              CATALOG.cards[event.rule.card].type === "item"
            );
          },
          steps: (_state, event) => [
            local("grave-dirt", "discard", {
              figure: eventData<{ figure: FigureId }>(event).figure,
            }),
          ],
        },
        ...holderTurnEnded(
          (_state, _seat, room) => GRAVE_DIRT_ROOMS.includes(room),
          "grave-dirt",
        ),
      ],
      steps: { discard: discardIfHeld("grave-dirt") },
    },

    groundskeeper: {
      onDraw: (state, figure) => {
        const rule = card("groundskeeper");
        return [
          roll(
            figure,
            { kind: "trait", trait: "knowledge" },
            rule,
            table([
              { min: 4, max: null, steps: [drawCard(figure, "item", rule)] },
              {
                min: 0,
                max: 3,
                steps: [
                  cardAttack(figure, "might", 4, card("groundskeeper")),
                ],
              },
            ]),
            {
              extraDice: roomOf(state, figure) === "gardens" ? -2 : 0,
            },
          ),
        ];
      },
    },

    "hanged-men": {
      onDraw: (_state, figure) => [
        local("hanged-men", "next", {
          figure,
          traits: [...TRAITS],
          passed: true,
        }),
      ],
      steps: {
        next: defineStep<{ figure: FigureId; traits: Trait[]; passed: boolean }>(
          (_state, p, ctx) => {
            const rule = card("hanged-men");
            if (p.traits.length > 0) {
              ctx.push(
                roll(
                  p.figure,
                  { kind: "trait", trait: p.traits[0] },
                  rule,
                  local("hanged-men", "rolled", p),
                ),
              );
            } else if (p.passed) {
              ctx.push(
                chooseOne(
                  p.figure,
                  TRAITS.map((trait) => ({
                    label: `Gain 1 ${traitName(trait)}`,
                    steps: [gain(p.figure, trait, 1, rule)],
                  })),
                  rule,
                ),
              );
            }
          },
        ),
        rolled: defineStep<{
          figure: FigureId;
          traits: Trait[];
          passed: boolean;
          result: number;
        }>((_state, p, ctx) => {
          const [trait, ...rest] = p.traits;
          if (p.result <= 1)
            ctx.push(gain(p.figure, trait, -1, card("hanged-men")));
          ctx.push(
            local("hanged-men", "next", {
              figure: p.figure,
              traits: rest,
              passed: p.passed && p.result >= 2,
            }),
          );
        }),
      },
    },

    "hideous-shriek": {
      onDraw: (state, figure) => {
        const rule = card("hideous-shriek");
        return explorersFrom(state, figure).map((each) =>
          traitRoll(each, "sanity", "hideous-shriek", [
            { min: 4, max: null, steps: [] },
            {
              min: 1,
              max: 3,
              steps: [damage(each, "mental", { dice: 1 }, rule)],
            },
            {
              min: 0,
              max: 0,
              steps: [damage(each, "mental", { dice: 2 }, rule)],
            },
          ]),
        );
      },
    },

    "image-in-the-mirror-give": {
      onDraw: (state, figure) => {
        const rule = card("image-in-the-mirror-give");
        const items = (each: FigureId) =>
          figureOf(state, each).cards.filter(
            (c) => CATALOG.cards[c].type === "item",
          );
        const affected = explorersFrom(state, figure).find((s) => items(s).length > 0);
        if (affected === undefined) return [];
        return [
          chooseOne(
            affected,
            items(affected).map((item) => ({
              label: `Put the ${CATALOG.cards[item].name} back in the item stack`,
              steps: [returnToDeck(affected, item, rule)],
            })),
            rule,
          ),
          gain(affected, "knowledge", 1, rule),
        ];
      },
    },

    "image-in-the-mirror-take": {
      onDraw: (_state, figure) => [
        drawCard(figure, "item", card("image-in-the-mirror-take")),
      ],
    },

    "it-is-meant-to-be": {
      onDraw: (state, figure) => {
        const rule = card(MEANT);
        return [
          chooseOne(
            figure,
            [
              ...(stacks(state).length > 0
                ? [
                    {
                      label:
                        "Look at the top 3 tiles or cards of a stack and put them back in any order",
                      steps: [local(MEANT, "pick-stack", { figure })],
                    },
                  ]
                : []),
              {
                label: "Roll 4 dice and record the total for a later roll",
                steps: [
                  roll(
                    figure,
                    { kind: "dice", count: 4 },
                    rule,
                    local(MEANT, "record", { figure }),
                  ),
                ],
              },
            ],
            rule,
          ),
        ];
      },
      rollOptions: [
        {
          timing: "before",
          applies: (state) => recorded(state) !== null,
          effect: { kind: "number", value: (state) => recorded(state) ?? 0 },
        },
      ],
      reactions: [
        {
          event: "card-used",
          when: (_state, event) =>
            eventData<{ card: string }>(event).card === MEANT,
          steps: (_state, event) => [
            discardCard(eventData<{ figure: FigureId }>(event).figure, MEANT),
          ],
        },
      ],
      steps: {
        "pick-stack": defineStep<{ figure: FigureId }>((state, { figure }, ctx) => {
          ctx.push(
            chooseOne(
              figure,
              stacks(state).map((stack) => ({
                label: `Look at the top of the ${STACK_NAMES[stack]}`,
                steps: [local(MEANT, "look", { figure, stack })],
              })),
              card(MEANT),
            ),
          );
        }),
        look: defineStep<{ figure: FigureId; stack: Stack }>((state, p, ctx) => {
          const orders = permutations(stackOf(state, p.stack).slice(0, 3));
          const putBack = (order: string[]) =>
            local(MEANT, "put-back", { ...p, order });
          if (orders.length === 1) {
            ctx.push(putBack(orders[0]));
            return;
          }
          ctx.push(
            chooseOne(
              p.figure,
              orders.map((order) => ({
                label: `Put them back, top first: ${order.map((id) => stackItemName(p.stack, id)).join(", ")}`,
                steps: [putBack(order)],
              })),
              card(MEANT),
            ),
          );
        }),
        "put-back": defineStep<{ figure: FigureId; stack: Stack; order: string[] }>(
          (state, p, ctx) => {
            const pile = stackOf(state, p.stack);
            const top = pile.slice(0, p.order.length);
            if ([...top].sort().join() !== [...p.order].sort().join())
              throw new Error(`The top of the ${p.stack} stack has changed`);
            pile.splice(0, p.order.length, ...p.order);
            ctx.emit("stack-reordered", card(MEANT), {
              figure: p.figure,
              stack: p.stack,
            });
          },
        ),
        record: defineStep<{ figure: FigureId; result: number }>(
          (_state, p, ctx) => {
            ctx.push(
              keepCard(p.figure, MEANT),
              markCard(MEANT, RECORDED, p.result, "holder", card(MEANT)),
            );
          },
        ),
      },
      describe: {
        "card-marked": (event) =>
          `The total ${String(eventData<{ value: number }>(event).value)} is recorded for a later roll`,
        "stack-reordered": (event, words) => {
          const d = eventData<{ figure: FigureId; stack: Stack }>(event);
          return `${words.figure(d.figure)} looks at the top of the ${STACK_NAMES[d.stack]} and puts them back in an order only they know`;
        },
      },
    },

    "jonahs-turn": {
      onDraw: (state, figure) => {
        const rule = card("jonahs-turn");
        const holder = allFigures(state).find((e) =>
          e.cards.includes("puzzle-box"),
        );
        if (!holder) return [damage(figure, "mental", { dice: 1 }, rule)];
        return [
          discardCard(holder.id, "puzzle-box"),
          drawCard(holder.id, "item", rule),
          gain(figure, "sanity", 1, rule),
        ];
      },
    },

    "lights-out": {
      impedes: true,
      onDraw: (state, figure) =>
        figureOf(state, figure).cards.includes("candle")
          ? []
          : [keepCard(figure, "lights-out")],
      modifiers: [
        {
          question: "movement",
          when: (_state, subject, source) => subject.figure === source.holder,
          change: { atMost: 1 },
        },
      ],
      reactions: [
        ...holderTurnEnded(
          (state, figure, room) =>
            room === "furnace-room" ||
            allFigures(state).some(
              (e) => e.id !== figure && together(e, figureOf(state, figure)),
            ),
          "lights-out",
        ),
        {
          event: "card-gained",
          when: (_state, event, source) => {
            const gained = eventData<{ figure: FigureId; card: string }>(event);
            return gained.card === "candle" && gained.figure === source.holder;
          },
          steps: (_state, _event, source) => [
            local("lights-out", "discard", { figure: source.holder }),
          ],
        },
      ],
      steps: { discard: discardIfHeld("lights-out") },
    },

    "locked-safe": {
      onDraw: (state, figure) => [
        placeToken("safe", roomOf(state, figure), card("locked-safe")),
      ],
    },

    "mists-from-the-walls": {
      onDraw: (state, figure) => {
        const rule = card("mists-from-the-walls");
        return explorersFrom(state, figure)
          .filter(
            (each) =>
              placed(state.board, roomOf(state, each))?.floor ===
              "basement",
          )
          .map((each) => {
            const room = roomOf(state, each);
            const extra = CATALOG.rooms[room].symbols.includes("event") ? 1 : 0;
            return traitRoll(each, "sanity", "mists-from-the-walls", [
              { min: 4, max: null, steps: [] },
              {
                min: 1,
                max: 3,
                steps: [damage(each, "mental", { dice: 1 + extra }, rule)],
              },
              {
                min: 0,
                max: 0,
                steps: [damage(each, "mental", { dice: 1 + 2 * extra }, rule)],
              },
            ]);
          });
      },
    },

    "mystic-slide": {
      onDraw: (state, figure, engine) => {
        // In the basement, the event passes left to the first explorer who isn't.
        const affected = explorersFrom(state, figure).find(
          (each) => floorOf(state, roomOf(state, each)) !== "basement",
        );
        if (affected === undefined) return [];
        const room = roomOf(state, affected);
        return [
          placeToken("slide", room, card(SLIDE)),
          slideRoll(state, affected, room, onTurn(engine, state, affected)),
        ];
      },
      steps: {
        control: defineStep<{ figure: FigureId; room: string }>((state, p, ctx) => {
          const below = FLOORS.slice(0, FLOORS.indexOf(floorOf(state, p.room)));
          ctx.push(
            chooseOne(
              p.figure,
              state.board.tiles
                .filter((t) => below.includes(t.floor))
                .map((t) => ({
                  label: `Slide down to the ${ctx.catalog.rooms[t.tile].name}`,
                  steps: [relocate(p.figure, t.tile, card(SLIDE))],
                })),
              card(SLIDE),
            ),
          );
        }),
        "fall-to-basement": defineStep<{ figure: FigureId }>((state, p, ctx) => {
          const rule = card(SLIDE);
          ctx.push(
            chooseOne(
              p.figure,
              state.board.tiles
                .filter((t) => t.floor === "basement")
                .map((t) => ({
                  label: `Fall to the ${ctx.catalog.rooms[t.tile].name}`,
                  steps: [
                    relocate(p.figure, t.tile, rule, null, [
                      damage(p.figure, "physical", { dice: 1 }, rule),
                    ]),
                  ],
                })),
              rule,
            ),
          );
        }),
      },
    },
  },

  tokens: {
    // Only heroes get the die, and before the haunt every explorer counts
    // as one (the card's rulings); attacks aren't trait rolls, so they get
    // no die.
    blessing: {
      modifiers: [
        {
          question: "dicePool",
          when: (state, { figure, roll: r }, source, engine) =>
            r.spec.kind === "trait" &&
            roomOf(state, figure) === source.room &&
            (state.status === "exploring" ||
              sideOf(engine, state, figure) === "heroes"),
          change: { add: 1 },
        },
      ],
    },

    slide: {
      actions: {
        use: {
          label: "Use the Slide (Might roll)",
          available: (state) => !(state.turn?.rolls.includes(SLIDE) ?? true),
          steps: (state, figure, source) => {
            if (source.room === null) throw new Error("The Slide has no room");
            return [slideRoll(state, figure, source.room, true)];
          },
        },
      },
    },

    // You must be in the Closet's room to roll (project ruling, cards/events.md).
    closet: tokenRoll(
      "Open the Closet (roll 2 dice)",
      "closet",
      (figure, room) => {
        const rule = card("closet-door");
        return roll(
          figure,
          { kind: "dice", count: 2 },
          rule,
          table([
            { min: 4, max: null, steps: [drawCard(figure, "item", rule)] },
            { min: 2, max: 3, steps: [drawCard(figure, "event", rule)] },
            {
              min: 0,
              max: 1,
              steps: [
                drawCard(figure, "event", rule),
                removeToken("closet", room, rule),
              ],
            },
          ]),
          { id: "closet" },
        );
      },
    ),

    drip: {
      modifiers: [
        {
          question: "dicePool",
          when: (state, { figure, roll: r }, source) =>
            r.spec.kind === "trait" &&
            roomOf(state, figure) === source.room,
          change: { fewer: 1, minimum: 1 },
        },
      ],
    },

    // You must be in the Safe's room to roll (project ruling, cards/events.md).
    safe: tokenRoll("Open the Safe (Knowledge roll)", "safe", (figure, room) => {
      const rule = card("locked-safe");
      return roll(
        figure,
        { kind: "trait", trait: "knowledge" },
        rule,
        table([
          {
            min: 5,
            max: null,
            steps: [
              drawCard(figure, "item", rule),
              drawCard(figure, "item", rule),
              removeToken("safe", room, rule),
            ],
          },
          {
            min: 2,
            max: 4,
            steps: [damage(figure, "physical", { dice: 1 }, rule)],
          },
          {
            min: 0,
            max: 1,
            steps: [damage(figure, "physical", { dice: 2 }, rule)],
          },
        ]),
        { id: "safe" },
      );
    }),
  },
};
