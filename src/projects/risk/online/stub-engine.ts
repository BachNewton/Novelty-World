import { createRng } from "@/shared/lib/seeded-random";
import type {
  ApplyResult,
  CardId,
  GameEvent,
  GameState,
  GameView,
  Move,
  Options,
  Phase,
  RiskEngine,
  Seat,
  TerritoryView,
} from "../contract";
import { ADJACENCY, TERRITORIES, type TerritoryId } from "../map";

/*
 * A stand-in for the reference engine, so online play can be built and tested
 * before it lands: a small Risk behind the real `RiskEngine` contract, with
 * hidden information (a shuffled deck, hands) and dice from a random source in
 * the state, but not the rules. Its simplifications: a short
 * setup of two extra armies a seat, no card trades, fortifying only between
 * neighbours, and reinforcements of max(3, territories / 3). `engine.ts`
 * swaps it for the reference engine in one line.
 */

interface Stub {
  players: number;
  order: Seat[];
  owners: Record<TerritoryId, Seat>;
  armies: Record<TerritoryId, number>;
  active: Seat;
  phase: Phase;
  turn: number;
  armiesToPlace: number;
  setupLeft: number[];
  deck: CardId[];
  hands: CardId[][];
  discard: CardId[];
  occupying: { from: TerritoryId; to: TerritoryId; min: number; max: number } | null;
  captured: boolean;
  winner: Seat | null;
  rng: number;
}

const IDS: readonly TerritoryId[] = TERRITORIES.map((t) => t.id);
const SETUP_EXTRA = 2;

const wrap = (stub: Stub): GameState => ({ engineState: stub });
// The stub only ever reads states it wrote itself.
const unwrap = (state: GameState) => structuredClone(state.engineState as Stub);

function random(stub: Stub): number {
  const rng = createRng(stub.rng);
  const value = rng.next();
  stub.rng = rng.getState();
  return value;
}

function shuffle<T>(stub: Stub, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random(stub) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const die = (stub: Stub) => 1 + Math.floor(random(stub) * 6);
const owned = (stub: Stub, seat: Seat) => IDS.filter((id) => stub.owners[id] === seat);
const alive = (stub: Stub, seat: Seat) => owned(stub, seat).length > 0;
const reinforcements = (stub: Stub, seat: Seat) => Math.max(3, Math.floor(owned(stub, seat).length / 3));

function nextSeat(stub: Stub, from: Seat, eligible: (seat: Seat) => boolean): Seat {
  const at = stub.order.indexOf(from);
  for (let step = 1; step <= stub.order.length; step++) {
    const seat = stub.order[(at + step) % stub.order.length];
    if (eligible(seat)) return seat;
  }
  throw new Error("No seat can take the next turn");
}

function startTurn(stub: Stub, seat: Seat, events: GameEvent[]) {
  stub.active = seat;
  stub.turn++;
  stub.phase = "reinforce";
  stub.captured = false;
  stub.armiesToPlace = reinforcements(stub, seat);
  events.push(
    { rule: "TURN-1", kind: "turn-started", seat, turn: stub.turn },
    { rule: "REINF-1", kind: "reinforcements", seat, fromTerritories: stub.armiesToPlace, fromContinents: [] },
    { rule: "TURN-1", kind: "phase", phase: "reinforce" },
  );
}

function newGame(config: { players: number }, seed: string) {
  if (config.players < 3 || config.players > 6) throw new Error(`A game is for 3 to 6 players, not ${config.players.toString()}`);
  const players = config.players;
  const stub: Stub = {
    players,
    order: [],
    owners: {} as Record<TerritoryId, Seat>,
    armies: {} as Record<TerritoryId, number>,
    active: 0,
    phase: "setup-place",
    turn: 0,
    armiesToPlace: SETUP_EXTRA,
    setupLeft: Array.from({ length: players }, () => SETUP_EXTRA),
    deck: [],
    hands: Array.from({ length: players }, () => []),
    discard: [],
    occupying: null,
    captured: false,
    winner: null,
    rng: createRng(seed).getState(),
  };
  stub.order = shuffle(stub, Array.from({ length: players }, (_, i) => i));
  shuffle(stub, IDS).forEach((id, i) => {
    stub.owners[id] = stub.order[i % players];
    stub.armies[id] = 1;
  });
  stub.deck = shuffle(stub, [...IDS, "wild-1", "wild-2"]);
  stub.active = stub.order[0];
  const events: GameEvent[] = [
    { rule: "SETUP-3", kind: "turn-order", order: stub.order },
    { rule: "SETUP-4", kind: "dealt", owners: { ...stub.owners } },
    { rule: "SETUP-5", kind: "phase", phase: "setup-place" },
  ];
  return { state: wrap(stub), events };
}

function battle(stub: Stub, from: TerritoryId, to: TerritoryId, dice: number, events: GameEvent[]) {
  const attackerDice = Array.from({ length: dice }, () => die(stub)).sort((a, b) => b - a);
  const defenderDice = Array.from({ length: Math.min(2, stub.armies[to]) }, () => die(stub)).sort((a, b) => b - a);
  let attackerLosses = 0;
  let defenderLosses = 0;
  for (let i = 0; i < Math.min(attackerDice.length, defenderDice.length); i++) {
    if (attackerDice[i] > defenderDice[i]) defenderLosses++;
    else attackerLosses++;
  }
  stub.armies[from] -= attackerLosses;
  stub.armies[to] -= defenderLosses;
  events.push({ rule: "COMBAT-4", kind: "battle", from, to, attackerDice, defenderDice, attackerLosses, defenderLosses });
  if (stub.armies[to] > 0) return;
  const loser = stub.owners[to];
  stub.owners[to] = stub.active;
  stub.captured = true;
  events.push({ rule: "COMBAT-6", kind: "captured", seat: stub.active, territory: to, from: loser });
  if (!alive(stub, loser)) {
    const taken = stub.hands[loser];
    stub.hands[stub.active].push(...taken);
    stub.hands[loser] = [];
    events.push({ rule: "ELIM-1", kind: "eliminated", seat: loser, by: stub.active, cardsTaken: taken.length });
  }
  if (IDS.every((id) => stub.owners[id] === stub.active)) {
    stub.winner = stub.active;
    stub.phase = "game-over";
    events.push({ rule: "WIN-1", kind: "game-over", winner: stub.active });
    return;
  }
  const min = dice;
  const max = stub.armies[from] - 1;
  if (min >= max) occupy(stub, from, to, max, events);
  else stub.occupying = { from, to, min, max };
}

function occupy(stub: Stub, from: TerritoryId, to: TerritoryId, armies: number, events: GameEvent[]) {
  stub.armies[from] -= armies;
  stub.armies[to] = armies;
  stub.occupying = null;
  events.push({ rule: "COMBAT-6", kind: "occupied", from, to, armies });
}

function endTurn(stub: Stub, events: GameEvent[]) {
  if (stub.captured) {
    if (stub.deck.length === 0) {
      stub.deck = shuffle(stub, stub.discard);
      stub.discard = [];
      events.push({ rule: "CARDS-4", kind: "deck-reshuffled" });
    }
    const card = stub.deck.pop();
    if (card !== undefined) {
      stub.hands[stub.active].push(card);
      events.push({ rule: "CARDS-3", kind: "card-drawn", seat: stub.active, card });
    }
  }
  startTurn(stub, nextSeat(stub, stub.active, (seat) => alive(stub, seat)), events);
}

const reject = (reason: string): ApplyResult => ({ ok: false, reason });

function apply(state: GameState, seat: Seat, move: Move): ApplyResult {
  const stub = unwrap(state);
  if (stub.phase === "game-over") return reject("The game is over");
  if (seat !== stub.active) return reject("It isn't your turn");
  const events: GameEvent[] = [];
  const mine = (id: TerritoryId) => stub.owners[id] === seat;
  const adjacent = (from: TerritoryId, to: TerritoryId) => ADJACENCY[from].includes(to);

  if (stub.occupying) {
    if (move.kind !== "occupy") return reject("Move armies into the captured territory first");
    const { from, to, min, max } = stub.occupying;
    if (move.armies < min || move.armies > max) return reject(`Move between ${min.toString()} and ${max.toString()} armies`);
    occupy(stub, from, to, move.armies, events);
    return { ok: true, state: wrap(stub), events };
  }

  switch (move.kind) {
    case "place": {
      if (stub.phase !== "setup-place" && stub.phase !== "reinforce") return reject("There is nothing to place");
      if (!mine(move.territory)) return reject("Place on your own territory");
      if (stub.phase === "setup-place") {
        if (move.armies !== 1) return reject("Setup places one army at a time");
        stub.armies[move.territory]++;
        stub.setupLeft[seat]--;
        events.push({ rule: "SETUP-5", kind: "placed", owner: seat, territory: move.territory, armies: 1 });
        if (stub.setupLeft.every((left) => left === 0)) {
          stub.turn = 0;
          startTurn(stub, stub.order[0], events);
        } else {
          stub.active = nextSeat(stub, seat, (s) => stub.setupLeft[s] > 0);
          stub.armiesToPlace = stub.setupLeft[stub.active];
        }
        return { ok: true, state: wrap(stub), events };
      }
      if (!Number.isInteger(move.armies) || move.armies < 1 || move.armies > stub.armiesToPlace) return reject("Not that many armies to place");
      stub.armies[move.territory] += move.armies;
      stub.armiesToPlace -= move.armies;
      events.push({ rule: "REINF-4", kind: "placed", owner: seat, territory: move.territory, armies: move.armies });
      if (stub.armiesToPlace === 0) {
        stub.phase = "attack";
        events.push({ rule: "TURN-1", kind: "phase", phase: "attack" });
      }
      return { ok: true, state: wrap(stub), events };
    }
    case "attack":
    case "blitz": {
      if (stub.phase !== "attack") return reject("It isn't time to attack");
      const { from, to } = move;
      if (!mine(from) || mine(to) || !adjacent(from, to)) return reject("Attack a neighbouring enemy territory from your own");
      if (stub.armies[from] < 2) return reject("Attacking needs at least 2 armies");
      if (move.kind === "attack") {
        if (move.dice > Math.min(3, stub.armies[from] - 1)) return reject("Too many dice");
        battle(stub, from, to, move.dice, events);
      } else {
        const keep = Math.max(1, move.keepAtLeast);
        while (stub.owners[to] !== seat && stub.armies[from] > keep && stub.armies[from] >= 2) {
          battle(stub, from, to, Math.min(3, stub.armies[from] - 1), events);
        }
      }
      return { ok: true, state: wrap(stub), events };
    }
    case "end-attack": {
      if (stub.phase !== "attack") return reject("It isn't time to attack");
      stub.phase = "fortify";
      events.push({ rule: "TURN-1", kind: "phase", phase: "fortify" });
      return { ok: true, state: wrap(stub), events };
    }
    case "fortify": {
      if (stub.phase !== "fortify") return reject("It isn't time to fortify");
      if (!mine(move.from) || !mine(move.to) || !adjacent(move.from, move.to)) return reject("Fortify between neighbouring territories of your own");
      if (move.armies < 1 || move.armies > stub.armies[move.from] - 1) return reject("Leave at least one army behind");
      stub.armies[move.from] -= move.armies;
      stub.armies[move.to] += move.armies;
      events.push({ rule: "FORT-1", kind: "fortified", from: move.from, to: move.to, armies: move.armies });
      endTurn(stub, events);
      return { ok: true, state: wrap(stub), events };
    }
    case "end-turn": {
      if (stub.phase !== "fortify") return reject("End the attack first");
      endTurn(stub, events);
      return { ok: true, state: wrap(stub), events };
    }
    case "trade":
    case "occupy":
      return reject(`The stand-in engine doesn't take a ${move.kind} move now`);
  }
}

function options(state: GameState, seat: Seat): Options | null {
  const stub = unwrap(state);
  if (stub.phase === "game-over" || seat !== stub.active) return null;
  if (stub.occupying) return { kind: "occupy", ...stub.occupying };
  const own = owned(stub, seat);
  switch (stub.phase) {
    case "setup-place":
      return { kind: "setup-place", ownTerritories: own, ownArmiesLeft: stub.setupLeft[seat] };
    case "reinforce":
      return { kind: "reinforce", armiesToPlace: stub.armiesToPlace, mayPlace: true, ownTerritories: own, mustTrade: false, sets: [] };
    case "attack":
      return {
        kind: "attack",
        attacks: own
          .filter((from) => stub.armies[from] >= 2)
          .flatMap((from) =>
            ADJACENCY[from]
              .filter((to) => stub.owners[to] !== seat)
              .map((to) => ({ from, to, maxDice: Math.min(3, stub.armies[from] - 1) as 1 | 2 | 3 })),
          ),
      };
    case "fortify":
      return {
        kind: "fortify",
        moves: own
          .filter((from) => stub.armies[from] >= 2)
          .flatMap((from) => ADJACENCY[from].filter((to) => stub.owners[to] === seat).map((to) => ({ from, to, maxArmies: stub.armies[from] - 1 }))),
      };
  }
}

function view(state: GameState, viewer: Seat | null): GameView {
  const stub = unwrap(state);
  const territories = Object.fromEntries(IDS.map((id): [TerritoryId, TerritoryView] => [id, { owner: stub.owners[id], armies: stub.armies[id] }])) as Record<
    TerritoryId,
    TerritoryView
  >;
  return {
    viewer,
    turnOrder: stub.order,
    seats: Array.from({ length: stub.players }, (_, seat) => ({
      seat,
      eliminated: stub.phase !== "setup-place" && !alive(stub, seat),
      territories: owned(stub, seat).length,
      armies: owned(stub, seat).reduce((sum, id) => sum + stub.armies[id], 0),
      handSize: stub.hands[seat].length,
    })),
    territories,
    turn: stub.turn,
    active: stub.active,
    phase: stub.phase,
    armiesToPlace: stub.phase === "setup-place" ? stub.setupLeft[stub.active] : stub.armiesToPlace,
    cards: {
      drawPile: stub.deck.length,
      discardPile: stub.discard,
      setsTraded: 0,
      nextSetValue: 4,
      hand: viewer === null ? null : stub.hands[viewer],
    },
    occupying: stub.occupying,
    winner: stub.winner,
  };
}

function redact(events: readonly GameEvent[], viewer: Seat | null): readonly GameEvent[] {
  return events.map((event) => (event.kind === "card-drawn" && event.seat !== viewer ? { rule: event.rule, kind: event.kind, seat: event.seat } : event));
}

export const stubEngine: RiskEngine = { newGame, apply, options, view, redact };
