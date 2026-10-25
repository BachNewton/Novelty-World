# Hearthwood: open bugs

The bugs known in Hearthwood and not yet fixed, each with how to see it, what is ruled out and the leads still open. A bug leaves this list in the commit that fixes it; git keeps what it said.

## Far shadows draw things black past the first slice

**What shows:** with the far shadows on (`shadowCascades`), every tree, log and stone further from the camera than the first shadow slice (about 8 m) draws pure black, so the world looks as if a sphere of light surrounds the camera with darkness outside it. The land itself looks right. Inside the first slice everything is lit as it should be.

**Seeing it:** open the world and lift the camera through the probe, for example `window.__hearthwoodWorld.setFreeCamera({ x: 58.8, y: 71, z: 4.7, lookX: 258.8, lookY: 11, lookZ: 204.7 })`, 40 m above camp looking out over the woods. Features switch live with `__hearthwoodWorld.setFeature(id, on)`.

**Getting round it:** switch the far shadows off in the ~ panel's Features section, or open the world with `?features=all,-shadowCascades`. The near map then shades the ground round Elliott and everything further is lit.

**Ruled out:**

- It is the far shadows: with `sunShadows` or `shadowCascades` off, nothing is black.
- Not the other light stages: with `cloudShadows` and `leafLight` off, it is still black.
- Not the fade between slices: with the cascade node's fade off, it is still black.
- Not `SteadyCascades` reusing one build of the node in every material: with three's own `CSMShadowNode` in its place, it is still black.

**Leads:**

- Black rather than shadowed: a shadow takes away only the key light's share, so the sky's and the ground's light should still colour a shadowed tree. Losing all of it points to a NaN in the shader, like the underwater fog's, where a `select` whose unchosen side held infinities drew solids and plants black on dry land.
- The slices past the first: their lights' shadow cameras and matrices (the reversed depth buffer, `lightMargin`, the custom splits, the frustums cut only when the lens changes) in `art/shadows/key-shadows.ts`.
- How the storybook light (`art/materials.ts`) takes the shadowed direct light from three, against how the land's material does, since the land is unaffected.
