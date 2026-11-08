import { renderGroup, uniform } from "three/tsl";

/*
 * A uniform the whole frame shares: the sun, the clocks, the haze, the camera's spot. three puts every uniform in its
 * per-object group unless told otherwise, so it compared each one against its buffer for every object drawn, every frame,
 * and with a few hundred render objects and a dozen uniforms a material that was the single biggest thing the main thread
 * did (`tools/frame-cpu.mjs`). A uniform in the render group is checked once a frame for each material that reads it.
 * Only a uniform whose value is the object's own (`onObjectUpdate`) stays in the object group, and is made with `uniform`.
 */
type AnyUniform = ReturnType<typeof uniform>;
const shared = (value: unknown, type?: string): AnyUniform => (uniform as (value: unknown, type?: string) => AnyUniform)(value, type).setGroup(renderGroup);
// `uniform` is typed as overloads by value, which one signature can't be asserted to directly.
export const sharedUniform = shared as unknown as typeof uniform;
