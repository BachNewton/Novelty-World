import { createRng } from "@/shared/lib/seeded-random";
import type { CardId, GameView, Move, Options, Seat } from "../../contract";
import type { Bot, BotInput } from "../bot";
import { forEachTurnEnd, roundsCompleted, turnSoFar, type TurnSoFar } from "../history";
import { Board, GD_ORDER } from "./board";
import { bestCardMatch, bonusTerritoryOf } from "./cards";
import { applyStepVariance, getChoice, iterativeArray, randomRange } from "./choice";
import { Helper } from "./helper";
import { BaseScorer, StackerScorer, type DeployContext, type Scorer } from "./persona";
import { WEIGHTS, type PersonaName } from "./personas";

// GD's Expert AI (`ClassicAI`) for one persona, playing through the seam: each decision is one
// step of GD's phase loops (`ClassicAIDeploy`, `ClassicAIAttack`, `AIFortify`), which pick a
// source, then a target, then an amount, each the top score of the persona's weighing. GD keeps
// per-turn lists (territories captured, attacks made, territories placed on); the bot reads them
// back from the turn's history. Its random draws (a deploy amount's ideal, a fallback pick, an
// amount's jitter) come from its seed.

/** Stacker becomes Aggressive for good once, at the end of one of its turns, it holds more armies
 *  than every other seat together (`StackerAIPersona.EndTurn`). */
function personaNow(start: PersonaName, seat: Seat, history: BotInput["history"]): PersonaName {
  if (start !== "stacker") return start;
  const swapped = forEachTurnEnd(history, (ended, _turn, board) => {
    if (ended !== seat) return false;
    let mine = 0;
    let others = 0;
    for (const t of GD_ORDER) {
      if (board[t].owner === seat) mine += board[t].armies;
      else others += board[t].armies;
    }
    return mine > others;
  });
  return swapped ? "aggressive" : "stacker";
}

interface Turn {
  view: GameView;
  board: Board;
  helper: Helper;
  scorer: Scorer;
  random: () => number;
  so: TurnSoFar;
}

function turnOf(input: BotInput, start: PersonaName): Turn {
  const { seat, view, history, humans } = input;
  const persona = personaNow(start, seat, history);
  const w = WEIGHTS[persona];
  const board = new Board(view, roundsCompleted(history) === 0);
  const so = turnSoFar(history);
  const helper = new Helper({
    board,
    me: seat,
    hand: view.cards.hand ?? [],
    humans,
    conqueredThisTurn: so.captured.length,
    attacksThisTurn: so.attacks.length,
    attackSuccessThreshold: w.attackSuccessThreshold,
  });
  const rng = createRng(input.seed);
  const random = () => rng.next();
  const deploy: DeployContext = { toPlace: view.armiesToPlace, placedOn: so.placedOn, random };
  const scorer = persona === "stacker" ? new StackerScorer(w, helper, deploy) : new BaseScorer(persona, w, helper, deploy);
  return { view, board, helper, scorer, random, so };
}

/** `ClassicAIDeploy.ExecuteAction`: a trade when one is due, otherwise one chunk of armies. */
function reinforce(input: BotInput, turn: Turn, options: Extract<Options, { kind: "reinforce" }>): Move {
  const { seat } = input;
  const { view, board, scorer, random, so } = turn;
  const hand = view.cards.hand ?? [];
  // GD trades at 5 cards or more before every chunk, and otherwise once a round with a set in
  // hand (its persona always says yes). Our engine takes trades before the first placement, the
  // forced ones before any, which is when GD makes them at the start of a turn.
  const tradedThisTurn = so.traded > 0;
  if (options.mustTrade || (options.sets.length > 0 && hand.length >= 3 && !tradedThisTurn)) {
    return trade(hand, seat, board);
  }

  const toPlace = view.armiesToPlace;
  const { amounts, variance } = iterativeArray(1, toPlace);
  const unitsAmount = (amount: number) => (amount === 1 && toPlace === 1 ? 1 : scorer.deployUnitsAmount(amount));
  const chosen = getChoice(amounts, unitsAmount) ?? 0;
  const amount = applyStepVariance(chosen, 1, toPlace, variance, random);
  const countries = board.countries(seat);
  const country = getChoice(countries, (c) => scorer.deployCountry(c, amount)) ?? countries[randomRange(random, 0, countries.length)];
  return { kind: "place", territory: country, armies: amount };
}

function trade(hand: readonly CardId[], seat: Seat, board: Board): Move {
  const set = bestCardMatch(hand, (t) => board.owner(t) === seat);
  if (!set) throw new Error(`GD's AI found no set in ${hand.join(", ")}`);
  const cards = [set[0], set[1], set[2]] as const;
  const bonus = bonusTerritoryOf(set, seat, (t) => board.owner(t));
  return bonus === null ? { kind: "trade", cards } : { kind: "trade", cards, bonusTerritory: bonus };
}

/** `ClassicAIAttack.ExecuteAction`: the best source, then its best target, blitzed to the end.
 *  The attack ends when no source, or the chosen source's best target, scores above 0. */
function attack(turn: Turn): Move {
  const { board, scorer, helper } = turn;
  const source = getChoice(board.countries(helper.me, 2), (c) => scorer.attackSource(c));
  if (source === null) return { kind: "end-attack" };
  const target = getChoice(board.enemies(source), (c) => scorer.attackTarget(source, c));
  if (target === null) return { kind: "end-attack" };
  return { kind: "blitz", from: source, to: target, keepAtLeast: 1 };
}

/** The move-in after a capture (`ClassicAIAttack`'s `moveUnitsAI`). GD asks with the captured
 *  territory already the bot's and every surviving attacker still in the source, and (a reading of
 *  the order of `OnAttack`'s writes) no armies yet in the captured territory; our engine has moved
 *  the minimum in already, so the board is put back that way. */
function occupy(input: BotInput, start: PersonaName, options: Extract<Options, { kind: "occupy" }>): Move {
  const { from, to } = options;
  const view = input.view;
  const u = view.territories[from].armies + view.territories[to].armies;
  const territories = { ...view.territories, [from]: { owner: input.seat, armies: u }, [to]: { owner: input.seat, armies: 0 } };
  const turn = turnOf({ ...input, view: { ...view, territories } }, start);
  const min = Math.min(u - 1, 3);
  const max = Math.max(min, u - 1);
  const { amounts, variance } = iterativeArray(min, max);
  const chosen = getChoice(amounts, (amount) => turn.scorer.attackMoveUnitsAmount(min, max, from, to, amount)) ?? 0;
  const c = applyStepVariance(chosen, min, max, variance, turn.random);
  return { kind: "occupy", armies: c < min || c > max ? max : c };
}

/** `AIFortify.ExecuteAction`: one move, from the best source to the best territory joined to it,
 *  or none when neither scores above 0. */
function fortify(turn: Turn): Move {
  const { board, scorer, helper, random } = turn;
  const source = getChoice(board.countries(helper.me), (c) =>
    board.units(c) <= 1 || board.connected(c).length === 0 ? 0 : scorer.fortifySource(c),
  );
  if (source === null) return { kind: "end-turn" };
  const target = getChoice(board.connected(source), (c) => scorer.fortifyTarget(source, c));
  if (target === null) return { kind: "end-turn" };
  const max = board.units(source) - 1;
  const { amounts, variance } = iterativeArray(1, max);
  const chosen = getChoice(amounts, (amount) => scorer.fortifyMoveUnitsAmount(source, target, amount)) ?? 0;
  return { kind: "fortify", from: source, to: target, armies: applyStepVariance(chosen, 1, max, variance, random) };
}

export function gdBot(persona: PersonaName): Bot {
  return (input) => {
    const { options } = input;
    if (options.kind === "occupy") return occupy(input, persona, options);
    const turn = turnOf(input, persona);
    switch (options.kind) {
      case "reinforce":
        return reinforce(input, turn, options);
      case "attack":
        return attack(turn);
      case "fortify":
        return fortify(turn);
    }
  };
}
