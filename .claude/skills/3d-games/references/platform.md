# Platform facts

How the browser, the GPU and three.js behave. Each says how it is known. Facts marked **version-dependent** come from how a particular renderer or library version works: check them again after an upgrade, and check whether a fact learnt on WebGL still holds on WebGPU (see `open.md`).

## Shaders and pipelines

- **A shader compiles the first time it is drawn, and that frame stalls.** Compile everything before play: the whole scene with every kind of object present, including stand-ins for kinds that only arrive later. Anything created mid-game must reuse a pipeline that already exists. *Measured.*
- **Whatever is baked into a shader recompiles every material that has it when it changes.** The number of lights, defines and the tone-mapping operator are compile-time. So keep their count and kind fixed for the life of a scene, and drive everything that changes at runtime (time of day, a colour grade, a light's position and colour) through uniforms. To have many emitters, keep a fixed pool of slots and re-aim them each frame; an unused slot costs almost nothing. *Measured; hit as frame freezes.*
- **A pipeline is specific to the target it draws into.** An offscreen target that differs from the screen's in format, colour space, depth or sample count compiles every material again. *Measured.*
- **A WebGPU pipeline reads only a small fixed number of vertex buffers by default.** Many per-instance attributes must share interleaved buffers. *Hit.*
- **WebGPU's shading language leaves some operations undefined**, and one backend may draw them black: a smoothstep whose edges are reversed is one. Write the falling edge as one minus the rising one. *Hit.*
- **Node-shader compilers can mis-scope values built inside a branch**, leaving them unset elsewhere, and can duplicate shared work across branches or inline a function body at every use. Blend cases by weights of zero and one rather than branching over large expressions, build shared values before any branch, and check the generated shader with a tool rather than by eye. *Hit; version-dependent.*
- **Screen-space derivatives, and the mip level that depends on them, are undefined where neighbouring pixels take different branches.** Compute them before branching. Where texture coordinates jump (atlas or tile seams), take the sampling rate from a continuous quantity such as world position, or the seam draws as a blurred line. *Hit.*
- **A mesh's pipeline is built from the attributes present when it is first drawn**, and isn't rebuilt when more arrive. Add an instanced mesh to the scene only once its per-instance data exists. *Hit; version-dependent.*
- **Code that patches the renderer's internals fails silently when the renderer changes**: text substituted into built-in shader chunks, or a reliance on an internal uniform's name, stops matching and produces plausible wrong output. Keep such patches in one place and check them after every upgrade. *Hit.*
- **The renderer silently ignores or overrides some settings in ways the call site doesn't show**: per-material settings overridden by scene-wide ones, lights filtered by layer, uniforms uploaded only if a material lists them, statistics reset per render call. When output is plausible but wrong, suspect the setting never reached the GPU. *Hit; version-dependent.*

## The renderer and the device

- **Check that the backend asked for is the one obtained.** A WebGPU renderer can fall back to WebGL without saying so. Losing the GPU device must stop the game loudly, not leave it running against a dead device. *Reasoned.*
- **Headless test browsers often lack the real GPU path**: a default headless build may have no WebGPU and fall back silently, and without a GPU rendering is in software. Run tools on a full browser build told which GPU to use, and never judge performance from software rendering. *Hit.*
- **A zero-sized canvas (a hidden tab or pane) is not a valid surface.** Don't draw into it. *Hit.*
- **The browser caps live graphics contexts** and silently drops the oldest past the cap. A page that shows many 3D views draws them all through one context. *Reasoned.*

## Cost

- **Hidden or switched-off things still cost.** The renderer walks hidden objects every frame, and a light at zero strength still runs its loop on every lit pixel. Remove what isn't needed; don't just hide it. *Measured.*
- **Per-object preparation dominates CPU cost per frame.** Share frame-wide uniforms once per frame rather than per object, stop updating matrices of objects that never move, and give large shared geometry its bounds rather than letting the renderer compute them on first draw. *Measured; version-dependent.*
- **Draw calls, not triangles, bound most scenes on phones and integrated GPUs.** Merge static things that share a material, and draw repeated shapes as instances where their draw order doesn't matter. *Measured.*
- **An instanced mesh is sorted as one object standing at its own origin**: the renderer orders opaque draws by each mesh's bounding-sphere centre through its own matrix, never by where its instances stand. Static scenery drawn as instances spread over a world therefore draws in no useful depth order, and on a fill-bound GPU hidden buildings are shaded in full. Merge such scenery by material into spatial chunks, each culled and sorted by its own place. *Measured; version-dependent.*
- **An equirectangular image set as the scene's background is converted to a cubemap and drawn first, with no depth test, across every pixel of every frame.** A sky drawn as a dome after the solids, pushed to the far plane with the depth test on, shades only the pixels nothing covers. *Measured; version-dependent.*
- **Find which limit a mesh hits before optimising it.** An expensive vertex shader is vertex-bound, and fewer vertices help. A cheap surface covering much of the screen is fill-bound, and the material is the lever. Vertex savings are a fixed cost at any resolution; fill scales with pixels. *Measured.*
- **Geometry that hides more expensive pixels can be nearly free**, since covering a pixel saves shading whatever was behind it. A claim that something is expensive must say what its pixels would otherwise cost. *Measured.*
- **Draw order decides wasted shading, not correctness.** Cheap occluders and what is nearest go first, the sky last at the far plane, transparents after. A depth-only pass first pays off for the most expensive shader with heavy overdraw. *Measured.*
- **A shader that might discard loses the GPU's early depth test**: overlapping cut-outs are all shaded, so cut-out foliage is a pixel cost, not a triangle cost. *Reasoned.*
- **A post-processing chain costs by pixel count, even on an empty frame**: it renders offscreen into a high-precision target and resolves and copies it every frame. Fold simple effects (a grade, saturation, contrast) into the tone-mapping step every material already runs, so no chain exists. *Measured.*
- **Multisampling belongs to the buffer the scene is drawn into.** On a screen buffer that only receives a final full-screen quad, it smooths nothing and still costs a resolve. *Measured.*
- **A full-screen pass that writes depth from its fragment shader disables early depth rejection.** Check what a pass writes, not only what it reads. *Measured.*
- **An instance collapsed to nothing in the vertex shader still pays its vertex work.** Keep instance lists to what is in range, refilled as the camera moves. *Measured.*

## Precision

- **Depth precision is spent from the near plane outwards.** Push the near plane as far out as the camera allows; a reversed depth buffer makes a very near plane cheap. Under reversed depth, the renderer's own sorting and depth comparisons may invert: set the draw order explicitly and check equal-depth tests. *Hit; version-dependent.*
- **Two surfaces at the same depth flicker**, and only while the camera moves, so screenshots miss it: coplanar faces, and different-coloured surfaces meeting at a shallow angle. The cure is geometry (an inset, an offset larger than the depth buffer resolves at the farthest view, a steep intersection), checked automatically over every model. *Hit.*
- **Parts that only touch leave hairline cracks.** Neighbouring parts overlap slightly. *Hit.*
- **Single-precision floats lose fine detail far from the origin.** Shader patterns built from absolute world coordinates turn to noise kilometres out: lay fine patterns on objects in their own local units, anchor ground patterns near the camera, and wrap noise domains before hashing. A physics engine storing positions in single precision needs a floating origin, moved in whole steps so the simulation stays deterministic. *Hit.*
- **A value constant across a triangle can reach the pixels slightly off on some GPU vendors.** Pass identities and seeds as flat integers, hash with integer hashes, round before using a float as an index or count, pass a shared measure that a count is rounded from through a flat varying, and cut digits for display in integer arithmetic, since a float's division lands a hair under a whole number. Anything that magnifies the last bits otherwise sparkles on some hardware only, and often only in motion. *Hit.*- **Image decoding through a canvas premultiplies alpha**, destroying the colour of fully transparent pixels. Send data channels as raw bytes. *Hit.*

## Frames and time

- **The browser is locked to the display's refresh**, so even frame pacing matters more than average rate. Just over budget, the game drops abruptly into judder. A frame cap that isn't the refresh rate divided by a whole number paces unevenly. No web API reveals variable refresh, so budget for the sustained frame time. Mouse look shows latency most. *Hit; judged.*
- **A fixed-step simulation spirals under load**: a slow frame triggers more steps, which slow the next frame. Cap the steps per frame. The animation frame stops in background tabs, so a returning tab's first frame spans seconds: clamp the catch-up, unless the game must catch up (online play). *Measured.*

## Input

- **Pointer lock belongs to the browser.** The user can always release it, and the browser can refuse a request. A lost lock is a pause, never an error, and the next click locks again. Request raw mouse input where offered, and fall back to a plain lock where refused: otherwise some platforms read locked movement through the cursor and now and then report a huge jump. *Hit.*

## Models and animation

- **A mirrored instance draws inside out.** The renderer reverses face winding for a mesh whose own matrix mirrors, but never for one instance's matrix in an instanced mesh, so a mirrored instance shows its back faces, often black. Mirror in the geometry (reverse the triangles' winding when baking it), or keep mirrored copies as meshes of their own. *Hit; version-dependent.*
- **Copying a rigged model without its skeleton shares one skeleton** between copies, which then animate as one. Use the skeleton-aware clone. *Hit.*
- **Third-party models disagree about units, origin, up, forward and resting pose**, and some packs include whole scenes posing as single props. Bounding boxes and titles mislead, especially for flat objects. *Hit.*
- **A rigged model's bounding box at rest is not its size in play**: the bind pose often holds the arms out. Size and frame a character from a clip it plays, or from a fixed frame shared by every character. *Measured.*

## Shading

- **Lit colour is light times albedo.** A dark surface stays dark under any light, and coloured light shifts the hue of what it lights. Get brightness from albedo before light strength. *Judged.*
- **Detail finer than a pixel shimmers as the camera moves**, and procedural detail has no mip chain to save it. Fade each layer out by its size on screen, or draw thin repeating marks as their coverage of the pixel, so far off they converge to their average. Dither smooth gradients, which band in eight bits. *Hit.*
