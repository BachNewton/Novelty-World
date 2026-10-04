import type {
  Action,
  Catalog,
  Decision,
  GameEvent,
  GameState,
  Json,
  RuleRef,
  Step,
} from "../types";
import { randomFor, SETUP_KEY, type Random } from "./random";

/** What a step or a decision's resolution can do while the engine works. */
export interface StepContext {
  catalog: Catalog;
  random: Random;
  emit: (type: string, rule: RuleRef, data?: Json) => void;
  /** Queue work. The steps run in the order given, before anything already queued. */
  push: (...steps: Step[]) => void;
  /** Pause on a decision. The engine stops running steps until it is answered. */
  decide: (seats: number[], kind: string, params: Json, rule: RuleRef) => void;
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
    catalog: Catalog,
  ) => Json[];
  label: (
    state: GameState,
    decision: Decision,
    choice: Json,
    catalog: Catalog,
  ) => string;
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
  const draft = structuredClone(state);
  const write = beginWrite(engine, draft, SETUP_KEY);
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
    const draft = structuredClone(state);
    const write = beginWrite(engine, draft, action.wait);
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
    .candidates(state, pending, action.seat, engine.catalog)
    .map((c) => JSON.stringify(c));
  if (!offered.includes(JSON.stringify(action.choice)))
    return reject("That choice isn't offered");

  const draft = structuredClone(state);
  const write = beginWrite(engine, draft, action.decision);
  const reason = answer(engine, draft, write, action.seat, action.choice);
  if (reason !== null) return reject(reason);
  run(engine, draft, write);
  return { ok: true, state: draft };
}

/** The legal choices of the pending decision for a seat that has yet to answer it. */
export function choices(
  engine: Engine,
  state: GameState,
  seat: number,
): Choice[] {
  const pending = state.pending;
  if (
    pending?.type !== "decision" ||
    !pending.seats.includes(seat) ||
    seat in pending.answers
  )
    return [];
  const kind = decisionKind(engine, pending.kind);
  return kind
    .candidates(state, pending, seat, engine.catalog)
    .filter((choice) => tryAnswer(engine, state, seat, choice) === null)
    .map((choice) => ({
      choice,
      label: kind.label(state, pending, choice, engine.catalog),
    }));
}

// A choice is legal exactly when answering with it succeeds. Answering only
// resolves the decision; the work that follows can't make an answer illegal.
function tryAnswer(
  engine: Engine,
  state: GameState,
  seat: number,
  choice: Json,
): string | null {
  const draft = structuredClone(state);
  const decision = draft.pending as Decision;
  return answer(
    engine,
    draft,
    beginWrite(engine, draft, decision.id),
    seat,
    choice,
  );
}

interface Write {
  ctx: StepContext;
}

function beginWrite(engine: Engine, draft: GameState, key: string): Write {
  draft.lastEvents = [];
  const events: GameEvent[] = draft.lastEvents;
  const nextId = () => `${draft.nextId++}`;
  const ctx: StepContext = {
    catalog: engine.catalog,
    random: randomFor(draft.seed, key),
    emit: (type, rule, data = null) => {
      events.push({ id: `${key}:${events.length}`, type, rule, data });
    },
    push: (...steps) => {
      draft.work.push(...[...steps].reverse());
    },
    decide: (seats, kind, params, rule) => {
      assertNothingPending(draft);
      draft.pending = {
        type: "decision",
        id: `d${nextId()}`,
        seats,
        kind,
        params,
        rule,
        answers: {},
      };
    },
    waitForReady: (seats, rule) => {
      assertNothingPending(draft);
      draft.pending = { type: "ready", id: `w${nextId()}`, seats, rule };
    },
  };
  return { ctx };
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
 *  with exactly one legal choice is a forced step: the engine takes it. */
function run(engine: Engine, draft: GameState, write: Write): void {
  for (let count = 0; ; count++) {
    if (count > STEP_LIMIT)
      throw new Error(`Step loop exceeded ${STEP_LIMIT} steps without pausing`);
    const pending = draft.pending;
    if (pending?.type === "decision" && pending.seats.length === 1) {
      const legal = choices(engine, draft, pending.seats[0]);
      if (legal.length === 0)
        throw new Error(`Decision ${pending.kind} has no legal choice`);
      if (legal.length === 1) {
        write.ctx.emit("forced", pending.rule, {
          kind: pending.kind,
          choice: legal[0].choice,
        });
        const reason = answer(
          engine,
          draft,
          write,
          pending.seats[0],
          legal[0].choice,
        );
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

function decisionKind(engine: Engine, kind: string): DecisionKind {
  const found = engine.rules.decisions[kind];
  if (!found) throw new Error(`No decision kind named ${kind}`);
  return found;
}

function reject(reason: string): ApplyResult {
  return { ok: false, reason };
}
