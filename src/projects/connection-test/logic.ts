/** A ping goes out with the sender's clock; its pong carries that time back. */
export type PingMessage = { kind: "ping"; sentAt: number } | { kind: "pong"; sentAt: number };

export function parsePingMessage(value: unknown): PingMessage | null {
  if (typeof value !== "object" || value === null) return null;
  const { kind, sentAt } = value as Record<string, unknown>;
  if ((kind !== "ping" && kind !== "pong") || typeof sentAt !== "number") return null;
  return { kind, sentAt };
}

/** How many recent round trips a player's figures are drawn from. */
export const SAMPLE_WINDOW = 30;

export interface RoundTrips {
  last: number;
  best: number;
  median: number;
  samples: number;
}

/** The window of round trips after one more sample. */
export function addSample(window: readonly number[], ms: number): number[] {
  return [...window, ms].slice(-SAMPLE_WINDOW);
}

export function summarise(window: readonly number[]): RoundTrips | null {
  const last = window.at(-1);
  if (last === undefined) return null;
  const sorted = [...window].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  return { last, best: sorted[0], median, samples: window.length };
}
