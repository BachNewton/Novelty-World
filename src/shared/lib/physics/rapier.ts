import type RAPIER from "@dimforge/rapier3d-compat";

/** Rapier's module, once its WebAssembly is running. */
export type Rapier = typeof RAPIER;

let loading: Promise<Rapier> | null = null;

/**
 * Rapier, loaded and initialised once for the page however many ask. It is
 * imported only here, on first ask, so a page that never asks never downloads
 * it, and one that does can draw while it loads: the compat build carries its
 * WebAssembly inline, a couple of megabytes of script to fetch and compile.
 */
export function loadRapier(): Promise<Rapier> {
  loading ??= import("@dimforge/rapier3d-compat").then(async ({ default: rapier }) => {
    await rapier.init();
    return rapier;
  });
  return loading;
}
