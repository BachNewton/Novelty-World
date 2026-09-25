import { useSyncExternalStore } from "react";

const subscribeNoop = () => () => {};

/**
 * False during SSR and hydration, true afterwards. Gate browser-only UI on
 * it so the client's first render matches the server HTML.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribeNoop, () => true, () => false);
}
