/** The shape version of `GameState`. Bump it whenever the shape changes: rows
 *  stamped with an older version (or none, from before versioning) are
 *  outdated, listed in the lobby browser but never loaded into the engine. */
export const STATE_VERSION = 4;

/** Whether a stored game predates the current `GameState` shape. Takes the
 *  stamp as unknown because a stored row only claims to be a `GameState`: rows
 *  from before versioning have no `stateVersion` at all, which reads as
 *  outdated too. */
export function isOutdated(state: { readonly stateVersion?: unknown }): boolean {
  return state.stateVersion !== STATE_VERSION;
}
