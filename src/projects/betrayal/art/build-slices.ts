/*
 * Work on the page's own thread cut into slices, so building the house never
 * holds a frame for long: each frame runs slices, the most urgent first, until
 * its budget is spent. A slice is a function, which runs whole, or steps (a
 * generator), which pause at each `yield`: one step at a time, the budget is
 * checked between steps, and a slice started is finished before another
 * starts. A frame always runs at least one step, and one longer than the
 * budget runs alone. Inline, every slice runs whole as it is added, for tests
 * and tools that build the house with no frames.
 */

/** A slice: work that runs whole, or steps that pause at each `yield`. */
export type SliceWork = () => Generator<unknown, void> | void;

export interface Slicer {
  /** Queues a slice under a key; `priority` is asked when choosing the next
   *  slice, the highest first, and the first added among equals. */
  add: (key: string, run: SliceWork, priority?: () => number) => void;
  /** Drops a slice, queued or part way through; nothing if it has finished. */
  cancel: (key: string) => void;
  /** Runs steps until the frame's budget is spent. */
  frame: () => void;
  /** Slices waiting or part way through. */
  pending: () => number;
}

/** Runs steps through to the end, at once: what they return. */
export function runSteps<T>(steps: Generator<unknown, T>): T {
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
  }
}

/** Runs every slice whole, as it is added. */
export function inlineSlicer(): Slicer {
  return {
    add: (_key, run) => {
      const steps = run();
      if (steps) runSteps(steps);
    },
    cancel: () => undefined,
    frame: () => undefined,
    pending: () => 0,
  };
}

/** Steps run each `frame()` until `budgetMs` of `now()` is spent: at least one, and none started past the budget. */
export function frameSlicer(budgetMs: number, now: () => number = () => performance.now()): Slicer {
  const queue: { key: string; run: SliceWork; priority: () => number }[] = [];
  /** The slice part way through, which runs on before any other starts. */
  let started: { key: string; steps: Generator<unknown, void> } | null = null;
  const next = () => {
    let best = 0;
    let bestPriority = -Infinity;
    queue.forEach((slice, i) => {
      const priority = slice.priority();
      if (priority > bestPriority) [best, bestPriority] = [i, priority];
    });
    return queue.splice(best, 1)[0];
  };
  /** One step: of the slice started, or the next slice's first. */
  const step = () => {
    if (!started) {
      const { key, run } = next();
      const steps = run();
      if (!steps) return;
      started = { key, steps };
    }
    const current = started;
    if (current.steps.next().done && started === current) started = null;
  };
  return {
    add: (key, run, priority = () => 0) => {
      if (queue.some((slice) => slice.key === key) || started?.key === key) throw new Error(`A slice "${key}" is already queued`);
      queue.push({ key, run, priority });
    },
    cancel: (key) => {
      if (started?.key === key) {
        started.steps.return();
        started = null;
      }
      const at = queue.findIndex((slice) => slice.key === key);
      if (at >= 0) queue.splice(at, 1);
    },
    frame: () => {
      if (queue.length === 0 && !started) return;
      const start = now();
      do step();
      while ((queue.length > 0 || started) && now() - start < budgetMs);
    },
    pending: () => queue.length + (started ? 1 : 0),
  };
}
