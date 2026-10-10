import type {
  Action,
  Catalog,
  Decision,
  FigureId,
  GameEvent,
  GameState,
  Json,
  RuleRef,
  Step,
} from "../types";
import { checkConditions, type Haunts } from "./haunt";
import { controllerOf } from "./questions";
import { randomFor, SETUP_KEY, type Random } from "./random";
import { liveSources, type Behaviours } from "./sources";

/** What a step or a decision's resolution can do while the engine works. */
export interface StepContext {
  engine: Engine;
  catalog: Catalog;
  random: Random;
  emit: (type: string, rule: RuleRef, data?: Json) => void;
  /** Queue work. The steps run in the order given, before anything already queued. */
  push: (...steps: Step[]) => void;
  /** Pause on a decision put to seats. The engine stops running steps
   *  until it is answered. `about` names the figure it is about, where it
   *  is about one. */
  decide: (
    seats: number[],
    kind: string,
    params: Json,
    rule: RuleRef,
    about?: FigureId | null,
  ) => void;
  /** Pause on a decision about a figure, put to the seat controlling it. */
  decideFor: (figure: FigureId, kind: string, params: Json, rule: RuleRef) => void;
  /** Pause until these seats have read something and confirmed. */
  waitForReady: (seats: number[], rule: RuleRef) => void;
}

/** Runs one step against the working copy of the state. */
export type StepHandler = (
  state: GameState,
  params: Json,
  ctx: StepContext,
) => void;

export interface DecisionKind {
  /** Every answer worth offering a seat. The legal ones are those that apply. */
  candidates: (
    state: GameState,
    decision: Decision,
    seat: number,
    engine: Engine,
  ) => Json[];
  label: (
    state: GameState,
    decision: Decision,
    choice: Json,
    engine: Engine,
  ) => string;
  /** Whether the decision is the player's to take even when it leaves one
   *  legal choice: a player's act, which they must see happen, not a step
   *  of bookkeeping. Without it, a single legal choice is a forced step. */
  alwaysAsks?: (state: GameState, decision: Decision, engine: Engine) => boolean;
  /** Applies the answers once every addressee has given one. Returns why, when an answer can't apply. */
  resolve: (
    state: GameState,
    decision: Decision,
    ctx: StepContext,
  ) => string | null;
}

/** Every step and decision kind, registered by name so unfinished work can be stored as data. */
export interface Rules {
  steps: Partial<Record<string, StepHandler>>;
  decisions: Partial<Record<string, DecisionKind>>;
}

export interface Engine {
  catalog: Catalog;
  rules: Rules;
  behaviours: Behaviours;
  /** Every haunt that has been built, compiled from its kit definition. */
  haunts: Haunts;
}

export type ApplyResult =
  { ok: true; state: GameState } | { ok: false; reason: string };

export interface Choice {
  choice: Json;
  label: string;
}

/** A game that loops this long without pausing has a bug: it must fail loudly, not be cut short. */
export const STEP_LIMIT = 10_000;

/** Answers kept for idempotent retries. */
export const ANSWERS_KEPT = 32;

/** Runs the initial work (setup) through to the first pause. */
export function start(
  engine: Engine,
  state: GameState,
  work: Step[],
): GameState {
  const draft = copyState(state);
  const write = beginWrite(engine, draft, SETUP_KEY, SETUP_KEY);
  write.ctx.push(...work);
  run(engine, draft, write);
  return draft;
}

export function apply(
  engine: Engine,
  state: GameState,
  action: Action,
): ApplyResult {
  const pending = state.pending;
  if (action.kind === "ready") {
    if (pending?.type !== "ready" || pending.id !== action.wait)
      return reject("That wait is no longer pending");
    if (!pending.seats.includes(action.seat))
      return reject("That seat isn't being waited on");
    const draft = copyState(state);
    const write = beginWrite(
      engine,
      draft,
      action.wait,
      writeKey(action.wait, action.seat),
    );
    const wait = draft.pending as typeof pending;
    wait.seats = wait.seats.filter((seat) => seat !== action.seat);
    write.ctx.emit("ready", wait.rule, { seat: action.seat });
    if (wait.seats.length === 0) draft.pending = null;
    run(engine, draft, write);
    return { ok: true, state: draft };
  }

  if (pending?.type !== "decision" || pending.id !== action.decision)
    return reject("That decision is no longer pending");
  if (!pending.seats.includes(action.seat))
    return reject("That decision isn't addressed to this seat");
  if (action.seat in pending.answers)
    return reject("This seat has already answered");
  const kind = decisionKind(engine, pending.kind);
  const offered = kind
    .candidates(state, pending, action.seat, engine)
    .map((c) => JSON.stringify(c));
  if (!offered.includes(JSON.stringify(action.choice)))
    return reject("That choice isn't offered");

  const draft = copyState(state);
  const write = beginWrite(
    engine,
    draft,
    action.decision,
    writeKey(action.decision, action.seat),
  );
  const reason = answer(engine, draft, write, action.seat, action.choice);
  if (reason !== null) return reject(reason);
  run(engine, draft, write);
  return { ok: true, state: draft };
}

/** The legal choices of the pending decision for a seat that has yet to
 *  answer it; with `among`, only the candidates it keeps are tried, for a
 *  caller that wants some kinds of answer and not others. */
export function choices(
  engine: Engine,
  state: GameState,
  seat: number,
  among: (candidate: Json) => boolean = () => true,
): Choice[] {
  const pending = state.pending;
  if (
    pending?.type !== "decision" ||
    !pending.seats.includes(seat) ||
    seat in pending.answers
  )
    return [];
  const kind = decisionKind(engine, pending.kind);
  return legalChoices(engine, state, pending, seat, among).map((choice) => ({
    choice,
    label: kind.label(state, pending, choice, engine),
  }));
}

/** Each legal choice the pending decision offers a seat, with the state
 *  applying it leads to: what `choices`, then `apply` on each, would give,
 *  with the candidates listed once and each tried on one copy, for a caller
 *  that looks ahead. `among` keeps the candidates worth trying. */
export function outcomes(
  engine: Engine,
  state: GameState,
  seat: number,
  among: (candidate: Json) => boolean = () => true,
): (Choice & { state: GameState })[] {
  const pending = state.pending;
  if (
    pending?.type !== "decision" ||
    !pending.seats.includes(seat) ||
    seat in pending.answers
  )
    return [];
  const kind = decisionKind(engine, pending.kind);
  const found: (Choice & { state: GameState })[] = [];
  for (const choice of kind.candidates(state, pending, seat, engine)) {
    if (!among(choice)) continue;
    const draft = copyState(state);
    const write = beginWrite(
      engine,
      draft,
      pending.id,
      writeKey(pending.id, seat),
    );
    if (answer(engine, draft, write, seat, choice) !== null) continue;
    run(engine, draft, write);
    found.push({
      choice,
      label: kind.label(state, pending, choice, engine),
      state: draft,
    });
  }
  return found;
}

/** The legal answers to a decision, stopping once `enough` are found: each
 *  is tried on a copy of the whole state, so a caller that only needs to
 *  tell none, one and more apart shouldn't try every one. */
function legalChoices(
  engine: Engine,
  state: GameState,
  decision: Decision,
  seat: number,
  among: (candidate: Json) => boolean,
  enough = Infinity,
): Json[] {
  const legal: Json[] = [];
  for (const choice of decisionKind(engine, decision.kind).candidates(
    state,
    decision,
    seat,
    engine,
  )) {
    if (legal.length >= enough) break;
    if (among(choice) && tryAnswer(engine, state, seat, choice) === null) legal.push(choice);
  }
  return legal;
}

// A choice is legal exactly when answering with it succeeds. Answering only
// resolves the decision; the work that follows can't make an answer illegal.
function tryAnswer(
  engine: Engine,
  state: GameState,
  seat: number,
  choice: Json,
): string | null {
  const draft = copyState(state);
  const decision = draft.pending as Decision;
  return answer(
    engine,
    draft,
    beginWrite(engine, draft, decision.id, writeKey(decision.id, seat)),
    seat,
    choice,
  );
}

interface Write {
  ctx: StepContext;
  /** Events emitted so far that live sources have had the chance to react to. */
  reacted: number;
}

/** Names one write. Each seat answers a shared decision or a ready wait in a
 *  write of its own, so the seat is part of the name. */
function writeKey(pause: string, seat: number): string {
  return `${pause}.${seat}`;
}

/** Starts a write. Its randomness comes from the pause it answers, so every
 *  addressee of a shared decision draws from the same stream; its event ids
 *  come from the write's own key, so they are unique across writes. */
function beginWrite(
  engine: Engine,
  draft: GameState,
  randomKey: string,
  eventKey: string,
): Write {
  draft.lastEvents = [];
  const events: GameEvent[] = draft.lastEvents;
  const nextId = () => `${draft.nextId++}`;
  const decide: StepContext["decide"] = (
    seats,
    kind,
    params,
    rule,
    about = null,
  ) => {
    assertNothingPending(draft);
    draft.pending = {
      type: "decision",
      id: `d${nextId()}`,
      seats,
      kind,
      params,
      rule,
      about,
      answers: {},
    };
  };
  const ctx: StepContext = {
    engine,
    catalog: engine.catalog,
    random: randomFor(draft.seed, randomKey),
    emit: (type, rule, data = null) => {
      events.push({ id: `${eventKey}:${events.length}`, type, rule, data });
    },
    push: (...steps) => {
      draft.work.push(...[...steps].reverse());
    },
    decide,
    decideFor: (figure, kind, params, rule) => {
      decide([controllerOf(engine, draft, figure)], kind, params, rule, figure);
    },
    waitForReady: (seats, rule) => {
      assertNothingPending(draft);
      draft.pending = { type: "ready", id: `w${nextId()}`, seats, rule };
    },
  };
  return { ctx, reacted: 0 };
}

function assertNothingPending(draft: GameState): void {
  if (draft.pending)
    throw new Error(
      `Raised a second pause while ${draft.pending.id} is pending`,
    );
}

/** Records one seat's answer, and resolves the decision once every addressee has answered. */
function answer(
  engine: Engine,
  draft: GameState,
  write: Write,
  seat: number,
  choice: Json,
): string | null {
  const decision = draft.pending as Decision;
  decision.answers[seat] = choice;
  draft.answered = [
    ...draft.answered,
    { decision: decision.id, seat, choice },
  ].slice(-ANSWERS_KEPT);
  if (Object.keys(decision.answers).length < decision.seats.length) return null;
  draft.pending = null;
  return decisionKind(engine, decision.kind).resolve(
    draft,
    decision,
    write.ctx,
  );
}

/** Runs queued work until the game pauses or the work runs out. A decision
 *  with exactly one legal choice is a forced step, which the engine takes,
 *  unless its kind always asks.
 *  Conditions are checked after every step, so a goal met partway through
 *  a move ends the game there. */
function run(engine: Engine, draft: GameState, write: Write): void {
  for (let count = 0; ; count++) {
    if (count > STEP_LIMIT)
      throw new Error(`Step loop exceeded ${STEP_LIMIT} steps without pausing`);
    checkConditions(engine, draft, write.ctx);
    if (draft.status === "finished") return;
    react(engine, draft, write);
    const pending = draft.pending;
    if (pending?.type === "decision" && pending.seats.length === 1) {
      const kind = decisionKind(engine, pending.kind);
      const seat = pending.seats[0];
      // Telling one legal choice from several needs only the first two.
      const legal = legalChoices(engine, draft, pending, seat, () => true, 2);
      if (legal.length === 0)
        throw new Error(`Decision ${pending.kind} has no legal choice`);
      if (
        legal.length === 1 &&
        !kind.alwaysAsks?.(draft, pending, engine)
      ) {
        const [choice] = legal;
        write.ctx.emit("forced", pending.rule, {
          seat,
          kind: pending.kind,
          about: pending.about,
          choice,
          label: kind.label(draft, pending, choice, engine),
        });
        const reason = answer(engine, draft, write, seat, choice);
        if (reason !== null)
          throw new Error(`Forced choice was rejected: ${reason}`);
        continue;
      }
    }
    if (pending) return;
    const step = draft.work.pop();
    if (!step) return;
    const handler = engine.rules.steps[step.kind];
    if (!handler) throw new Error(`No step kind named ${step.kind}`);
    handler(draft, step.params, write.ctx);
  }
}

/** Queues the reactions of live sources to the events emitted since the last
 *  check, in event order, ahead of the work already queued. */
function react(engine: Engine, draft: GameState, write: Write): void {
  const events = draft.lastEvents.slice(write.reacted);
  write.reacted = draft.lastEvents.length;
  if (events.length === 0) return;
  const sources = liveSources(engine, draft, "reactions");
  const steps = events.flatMap((event) =>
    sources.flatMap(({ source, behaviour }) =>
      (behaviour.reactions ?? [])
        .filter(
          (r) =>
            r.event === event.type &&
            (!r.when || r.when(draft, event, source, engine)),
        )
        .flatMap((r) => r.steps(draft, event, source, engine)),
    ),
  );
  write.ctx.push(...steps);
}

/** A deep copy of the state, which is plain JSON throughout (the saved
 *  format holds it as such). The engine copies it for every choice it
 *  tries, and copying plain data by hand is many times faster than
 *  structuredClone, which has to handle every kind of object. */
function copyState(state: GameState): GameState {
  return copyData(state) as GameState;
}

function copyData(value: unknown): unknown {
  if (typeof value !== "object" || value === null) return value;
  if (Array.isArray(value)) return value.map(copyData);
  const object = value as Record<string, unknown>;
  const copy: Record<string, unknown> = {};
  for (const key of Object.keys(object)) copy[key] = copyData(object[key]);
  return copy;
}

function decisionKind(engine: Engine, kind: string): DecisionKind {
  const found = engine.rules.decisions[kind];
  if (!found) throw new Error(`No decision kind named ${kind}`);
  return found;
}

function reject(reason: string): ApplyResult {
  return { ok: false, reason };
}
