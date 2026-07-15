/**
 * The project's render-layer assignments, in one place because they are a cross-module contract:
 * a pass renders exactly the layers its camera mask enables, so which module puts what where IS the
 * frame's architecture (see scene.ts `routeMainPass` + docs/PERFORMANCE.md "merge the duplicate
 * scene pass").
 *
 * Layer 0 (three's default) is the WORLD: everything the water should see — terrain, buoys, bodies,
 * the sky dome. The scene-capture pass renders layer 0 alone, and that capture is what the water
 * refracts, absorbs against, and SSR-marches.
 */

/**
 * The ocean surface, alone — the dedicated low-res SSR pass points the camera at this layer to render
 * the water by itself into the reflection target (see ocean.ts `renderSsr`).
 */
export const SSR_LAYER = 1;

/**
 * The lighting rig's irradiance probe (card + ortho camera), so a probe shot renders ONE quad instead
 * of the whole scene (see lighting-rig.ts).
 */
export const PROBE_LAYER = 2;

/**
 * Drawn ONLY in the on-screen main pass — never into the scene capture, never into the SSR pass.
 *
 * Two kinds of thing live here, and the merged main pass is why (docs/PERFORMANCE.md):
 *  - the water + the present quad. With the merged pass the opaque scene is rasterised once, into the
 *    capture; the main render then sets the camera to THIS layer alone, so it draws just the quad
 *    (which puts the capture on screen) and the water on top — not the whole scene a second time.
 *  - screen-space overlays (the builder's aim dot, the trapped-air x-ray): "always on top" markers
 *    that must draw OVER the water, and must never leak into the capture where the water would
 *    refract them or SSR would reflect them — they are HUD, not world.
 *
 * NB three layer-filters LIGHTS too (a light the camera's mask can't see is skipped), so every light
 * that should light the water must ALSO enable this layer — see sky.ts (the sun) and buoys.ts (the
 * pooled lantern). A light left on layer 0 alone silently stops lighting the merged main pass.
 */
export const MAIN_PASS_LAYER = 3;
