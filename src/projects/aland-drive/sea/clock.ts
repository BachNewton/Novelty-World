/*
 * The sea's one clock: real time, UTC, the same on every player's machine, so anything on the water moved by it
 * (the ferries, the small boats, the regatta) is where every player sees it with nothing sent over the network.
 * A float64 of seconds; a shader takes it modulo a period of its own first, since a float32 can't hold it.
 */

/** Seconds since the Unix epoch, UTC. */
export const seaSeconds = (nowMs = Date.now()) => nowMs / 1000;
